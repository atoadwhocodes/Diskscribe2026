import argparse
import hashlib
import math
import re
from collections import defaultdict
from pathlib import Path

from alshark_cd_utils import (
    collect_tracks,
    extract_track_user_data,
    find_track,
    parse_ccd,
    shift_jis_char,
    tokenize_bytes,
)


CONTROL_LABELS = {
    0x23: "CMD",
    0x24: "ARG",
    0x25: "EVT",
    0x26: "SUB",
}

ASCII_SYMBOL_RE = re.compile(r"^[A-Za-z0-9_.:+\-]+(?:\[[A-Z]+(?::[0-9A-F]{2})?\])*$")


def parse_args():
    parser = argparse.ArgumentParser(description="Disc-wide text discovery for Alshark PCE-CD Track 02 data")
    parser.add_argument("--ccd", required=True, help="Path to CloneCD .ccd")
    parser.add_argument("--img", required=True, help="Path to CloneCD .img")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--track", type=int, default=2, help="Data track number to scan")
    parser.add_argument("--window-size", type=lambda x: int(x, 0), default=0x800, help="Summary window size")
    parser.add_argument("--cluster-gap", type=lambda x: int(x, 0), default=0x80, help="Max gap between candidate strings in a cluster")
    parser.add_argument("--min-bytes", type=int, default=6, help="Minimum parsed bytes for a candidate")
    parser.add_argument("--min-text-chars", type=int, default=4, help="Minimum decoded text chars for a candidate")
    parser.add_argument("--min-score", type=int, default=12, help="Minimum heuristic score for a candidate")
    parser.add_argument("--max-length", type=lambda x: int(x, 0), default=0x200, help="Maximum bytes per candidate")
    return parser.parse_args()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def decode_unit(data, index):
    byte = data[index]

    if byte == 0x00:
        return {"kind": "terminator", "text": "[END]", "width": 1}
    if byte == 0x01:
        return {"kind": "control", "text": "[BR]", "width": 1}
    if byte == 0x0D:
        return {"kind": "control", "text": "[LF]", "width": 1}
    if byte in CONTROL_LABELS and index + 1 < len(data):
        return {
            "kind": "control",
            "text": f"[{CONTROL_LABELS[byte]}:{data[index + 1]:02X}]",
            "width": 2,
        }

    decoded = shift_jis_char(data, index)
    if decoded is None:
        return None

    text, width = decoded
    return {"kind": "text", "text": text, "width": width}


def is_startable(data, index):
    return decode_unit(data, index) is not None


def parse_candidate(data, start, max_length):
    index = start
    end_limit = min(len(data), start + max_length)
    units = []
    byte_length = 0
    text_chars = 0
    non_ascii_text_chars = 0
    controls = 0
    has_terminator = False

    while index < end_limit:
        unit = decode_unit(data, index)
        if unit is None:
            break

        units.append(unit)
        index += unit["width"]
        byte_length += unit["width"]

        if unit["kind"] == "text":
            text = unit["text"]
            text_chars += len(text)
            non_ascii_text_chars += sum(1 for char in text if ord(char) > 0x7F)
            continue

        if unit["kind"] == "control":
            controls += 1
            continue

        if unit["kind"] == "terminator":
            has_terminator = True
            break

    if not units:
        return None

    text = "".join(unit["text"] for unit in units)
    end = start + byte_length
    return {
        "offset": start,
        "end": end,
        "byteLength": byte_length,
        "textChars": text_chars,
        "nonAsciiTextChars": non_ascii_text_chars,
        "controlCount": controls,
        "hasTerminator": has_terminator,
        "tokenized": text,
    }


def candidate_score(candidate):
    score = 0
    score += min(candidate["textChars"], 24)
    score += min(candidate["nonAsciiTextChars"], 12)
    score += min(candidate["controlCount"] * 2, 10)
    if candidate["hasTerminator"]:
        score += 6

    tokenized = candidate["tokenized"]
    if "[" in tokenized or "@" in tokenized:
        score += 2
    if any(char in tokenized for char in ("。", "？", "！", "｢", "｣")):
        score += 3

    return score


def is_high_confidence(candidate):
    tokenized = candidate["tokenized"].replace("[END]", "").replace("[BR]", "").replace("[LF]", "")

    if candidate["nonAsciiTextChars"] >= 2:
        return True
    if any(char in candidate["tokenized"] for char in ("。", "？", "！", "｢", "｣", "・")):
        return True
    if candidate["controlCount"] >= 2 and candidate["textChars"] >= 6:
        return True
    if ASCII_SYMBOL_RE.fullmatch(tokenized):
        return False

    return False


def is_candidate_start(data, index):
    if not is_startable(data, index):
        return False

    if index == 0:
        return True

    previous = data[index - 1]
    if previous == 0x00:
        return True
    if previous in CONTROL_LABELS:
        return False
    if previous in (0x01, 0x0D):
        return False

    return not is_startable(data, index - 1)


def discover_candidates(data, min_bytes, min_text_chars, min_score, max_length):
    candidates = []
    index = 0

    while index < len(data):
        if not is_candidate_start(data, index):
            index += 1
            continue

        candidate = parse_candidate(data, index, max_length)
        if candidate is None:
            index += 1
            continue

        score = candidate_score(candidate)
        candidate["score"] = score
        candidate["window"] = candidate["offset"] // 0x800
        candidate["highConfidence"] = is_high_confidence(candidate)

        if (
            candidate["byteLength"] >= min_bytes
            and candidate["textChars"] >= min_text_chars
            and score >= min_score
            and candidate["hasTerminator"]
        ):
            candidates.append(candidate)
            index = candidate["end"]
            continue

        index += 1

    return candidates


def cluster_candidates(candidates, cluster_gap):
    if not candidates:
        return []

    clusters = []
    current = {
        "start": candidates[0]["offset"],
        "end": candidates[0]["end"],
        "candidates": [candidates[0]],
    }

    for candidate in candidates[1:]:
        if candidate["offset"] - current["end"] <= cluster_gap:
            current["candidates"].append(candidate)
            current["end"] = max(current["end"], candidate["end"])
            continue

        clusters.append(current)
        current = {
            "start": candidate["offset"],
            "end": candidate["end"],
            "candidates": [candidate],
        }

    clusters.append(current)
    return clusters


def summarize_window(window_candidates, window_start, window_size):
    total_score = sum(item["score"] for item in window_candidates)
    text_bytes = sum(item["byteLength"] for item in window_candidates)
    return {
        "windowIndex": window_start // window_size,
        "offset": window_start,
        "size": window_size,
        "candidateCount": len(window_candidates),
        "totalScore": total_score,
        "totalCandidateBytes": text_bytes,
        "density": round(text_bytes / window_size, 4),
        "sample": [item["tokenized"] for item in window_candidates[:3]],
    }


def build_window_summary(candidates, data_length, window_size):
    grouped = defaultdict(list)
    for candidate in candidates:
        window_start = (candidate["offset"] // window_size) * window_size
        grouped[window_start].append(candidate)

    windows = []
    max_window = int(math.ceil(data_length / window_size))
    for window_index in range(max_window):
        window_start = window_index * window_size
        window_candidates = grouped.get(window_start, [])
        if not window_candidates:
            continue
        windows.append(summarize_window(window_candidates, window_start, window_size))

    windows.sort(key=lambda item: (-item["candidateCount"], -item["totalScore"], item["offset"]))
    return windows


def build_cluster_summary(clusters):
    summary = []
    for cluster_index, cluster in enumerate(clusters):
        items = cluster["candidates"]
        summary.append(
            {
                "clusterIndex": cluster_index,
                "offset": cluster["start"],
                "end": cluster["end"],
                "size": cluster["end"] - cluster["start"],
                "candidateCount": len(items),
                "totalScore": sum(item["score"] for item in items),
                "sample": [item["tokenized"] for item in items[:5]],
            }
        )

    summary.sort(key=lambda item: (-item["candidateCount"], -item["totalScore"], item["offset"]))
    return summary


def write_cluster_samples(out_dir, data, clusters):
    samples_dir = out_dir / "cluster-samples"
    samples_dir.mkdir(parents=True, exist_ok=True)

    paths = []
    for cluster_index, cluster in enumerate(clusters[:25]):
        start = cluster["start"]
        end = min(cluster["end"], start + 0x2000)
        sample_path = samples_dir / f"cluster_{cluster_index:03d}_0x{start:06X}.txt"
        lines = [
            f"# Cluster {cluster_index}",
            f"- start: 0x{start:06X}",
            f"- end: 0x{end:06X}",
            f"- size: 0x{end - start:X}",
            f"- candidate_count: {len(cluster['candidates'])}",
            "",
            tokenize_bytes(data[start:end]),
            "",
        ]
        sample_path.write_text("\n".join(lines), encoding="utf-8")
        paths.append(str(sample_path))

    return paths


def build_report(track_number, track_sha256, candidates, windows, clusters, cluster_sample_paths):
    lines = [
        "# Alshark Disc-Wide Text Discovery",
        "",
        f"- track: {track_number:02d}",
        f"- track_sha256: `{track_sha256}`",
        f"- candidate_strings: {len(candidates)}",
        f"- high_confidence_candidates: {sum(1 for item in candidates if item['highConfidence'])}",
        f"- candidate_windows: {len(windows)}",
        f"- clusters: {len(clusters)}",
        "",
        "## Top Windows",
        "",
    ]

    for item in windows[:20]:
        lines.append(
            f"- 0x{item['offset']:06X} size=0x{item['size']:X} candidates={item['candidateCount']} density={item['density']} score={item['totalScore']}"
        )

    lines.extend([
        "",
        "## Top Clusters",
        "",
    ])

    for item in clusters[:20]:
        lines.append(
            f"- cluster {item['clusterIndex']:03d} at 0x{item['offset']:06X}-0x{item['end']:06X} candidates={item['candidateCount']} score={item['totalScore']}"
        )

    lines.extend([
        "",
        "## Cluster Sample Files",
        "",
    ])

    for sample_path in cluster_sample_paths:
        lines.append(f"- `{sample_path}`")

    lines.append("")
    return "\n".join(lines)


def main():
    args = parse_args()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    tracks = collect_tracks(parse_ccd(args.ccd))
    track = find_track(tracks, args.track)
    user_data = extract_track_user_data(args.img, track)
    track_sha256 = sha256_bytes(user_data)

    candidates = discover_candidates(
        user_data,
        min_bytes=args.min_bytes,
        min_text_chars=args.min_text_chars,
        min_score=args.min_score,
        max_length=args.max_length,
    )
    clusters = cluster_candidates(candidates, args.cluster_gap)
    window_summary = build_window_summary(candidates, len(user_data), args.window_size)
    cluster_summary = build_cluster_summary(clusters)
    cluster_sample_paths = write_cluster_samples(out_dir, user_data, clusters)
    high_confidence_candidates = [item for item in candidates if item["highConfidence"]]
    high_confidence_clusters = cluster_candidates(high_confidence_candidates, args.cluster_gap)
    high_confidence_window_summary = build_window_summary(high_confidence_candidates, len(user_data), args.window_size)
    high_confidence_cluster_summary = build_cluster_summary(high_confidence_clusters)

    (out_dir / "candidate-strings.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "count": len(candidates),
                "candidates": candidates,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "candidate-strings.high-confidence.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "count": len(high_confidence_candidates),
                "candidates": high_confidence_candidates,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "window-summary.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "windowSize": args.window_size,
                "count": len(window_summary),
                "windows": window_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "window-summary.high-confidence.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "windowSize": args.window_size,
                "count": len(high_confidence_window_summary),
                "windows": high_confidence_window_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "cluster-summary.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "clusterGap": args.cluster_gap,
                "count": len(cluster_summary),
                "clusters": cluster_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "cluster-summary.high-confidence.json").write_text(
        json_dumps(
            {
                "track": track.number,
                "trackSha256": track_sha256,
                "clusterGap": args.cluster_gap,
                "count": len(high_confidence_cluster_summary),
                "clusters": high_confidence_cluster_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "README.md").write_text(
        build_report(track.number, track_sha256, candidates, window_summary, cluster_summary, cluster_sample_paths),
        encoding="utf-8",
    )
    (out_dir / "README.high-confidence.md").write_text(
        build_report(
            track.number,
            track_sha256,
            high_confidence_candidates,
            high_confidence_window_summary,
            high_confidence_cluster_summary,
            cluster_sample_paths,
        ),
        encoding="utf-8",
    )

    print(f"Track {track.number:02d} discovery complete.")
    print(f"Candidates: {len(candidates)}")
    print(f"High-confidence candidates: {len(high_confidence_candidates)}")
    print(f"Windows: {len(window_summary)}")
    print(f"Clusters: {len(cluster_summary)}")
    print(f"Output: {out_dir}")


def json_dumps(payload):
    import json

    return json.dumps(payload, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
