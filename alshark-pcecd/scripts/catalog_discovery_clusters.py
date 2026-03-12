import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Catalog disc-wide discovery candidates into unique cluster families")
    parser.add_argument("--candidates", required=True, help="Path to candidate-strings.high-confidence.json")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--cluster-gap", type=lambda x: int(x, 0), default=0x80, help="Max gap between candidates in a cluster")
    parser.add_argument("--sample-limit", type=int, default=25, help="How many representative family files to write")
    return parser.parse_args()


def load_candidates(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return payload, payload.get("candidates", [])


def cluster_candidates(candidates, cluster_gap):
    if not candidates:
        return []

    ordered = sorted(candidates, key=lambda item: item["offset"])
    clusters = []
    current = {
        "start": ordered[0]["offset"],
        "end": ordered[0]["end"],
        "candidates": [ordered[0]],
    }

    for candidate in ordered[1:]:
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


def cluster_signature(cluster, sample_size=12):
    sample = [item["tokenized"] for item in cluster["candidates"][:sample_size]]
    joined = "\n".join(sample)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()
    return digest, sample


def classify_cluster(cluster):
    candidates = cluster["candidates"]
    tokenized = [item["tokenized"] for item in candidates]
    candidate_count = len(candidates)
    avg_length = sum(item["textChars"] for item in candidates) / max(candidate_count, 1)

    if any("[CMD:" in item or "[ARG:" in item or "[EVT:" in item for item in tokenized):
        return "script"
    if candidate_count >= 80 and avg_length <= 10:
        return "names_or_terms"
    if candidate_count >= 40 and avg_length <= 16:
        return "menu_or_battle_terms"
    if avg_length >= 18:
        return "prose_or_messages"
    return "mixed"


def summarize_family(signature, members):
    representative = members[0]
    cluster = representative["cluster"]
    candidates = cluster["candidates"]
    return {
        "signature": signature,
        "kind": classify_cluster(cluster),
        "occurrenceCount": len(members),
        "representativeOffset": cluster["start"],
        "representativeEnd": cluster["end"],
        "representativeSize": cluster["end"] - cluster["start"],
        "representativeCandidateCount": len(candidates),
        "representativeTotalScore": sum(item["score"] for item in candidates),
        "sampleStrings": [item["tokenized"] for item in candidates[:12]],
        "occurrenceOffsets": [member["cluster"]["start"] for member in members[:64]],
    }


def write_family_samples(out_dir, families, sample_limit):
    sample_dir = out_dir / "family-samples"
    sample_dir.mkdir(parents=True, exist_ok=True)
    paths = []

    for index, family in enumerate(families[:sample_limit]):
        sample_path = sample_dir / f"family_{index:03d}_{family['kind']}_0x{family['representativeOffset']:06X}.txt"
        lines = [
            f"# Family {index}",
            f"- kind: {family['kind']}",
            f"- signature: {family['signature']}",
            f"- occurrence_count: {family['occurrenceCount']}",
            f"- representative_offset: 0x{family['representativeOffset']:06X}",
            f"- representative_size: 0x{family['representativeSize']:X}",
            f"- representative_candidate_count: {family['representativeCandidateCount']}",
            "",
            "## Sample Strings",
            "",
        ]
        for item in family["sampleStrings"]:
            lines.append(item)
        lines.append("")
        sample_path.write_text("\n".join(lines), encoding="utf-8")
        paths.append(str(sample_path))

    return paths


def build_report(total_clusters, families, sample_paths):
    lines = [
        "# Alshark Discovery Catalog",
        "",
        f"- clustered_regions: {total_clusters}",
        f"- unique_families: {len(families)}",
        "",
        "## Top Families",
        "",
    ]

    for family in families[:25]:
        lines.append(
            f"- 0x{family['representativeOffset']:06X} kind={family['kind']} occurrences={family['occurrenceCount']} candidates={family['representativeCandidateCount']}"
        )

    lines.extend([
        "",
        "## Sample Files",
        "",
    ])

    for sample_path in sample_paths:
        lines.append(f"- `{sample_path}`")

    lines.append("")
    return "\n".join(lines)


def actionable_family(family):
    return family["representativeCandidateCount"] >= 10 or family["kind"] != "mixed"


def json_dumps(payload):
    return json.dumps(payload, ensure_ascii=False, indent=2)


def main():
    args = parse_args()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    source_payload, candidates = load_candidates(args.candidates)
    clusters = cluster_candidates(candidates, args.cluster_gap)

    families = defaultdict(list)
    for cluster in clusters:
        signature, sample = cluster_signature(cluster)
        families[signature].append(
            {
                "cluster": cluster,
                "sample": sample,
            }
        )

    family_summary = [
        summarize_family(signature, members)
        for signature, members in families.items()
    ]
    family_summary.sort(
        key=lambda item: (
            -item["representativeCandidateCount"],
            -item["occurrenceCount"],
            -item["representativeTotalScore"],
            item["representativeOffset"],
        )
    )
    actionable_summary = [item for item in family_summary if actionable_family(item)]

    sample_paths = write_family_samples(out_dir, family_summary, args.sample_limit)
    actionable_sample_paths = write_family_samples(out_dir / "actionable", actionable_summary, args.sample_limit)

    (out_dir / "unique-cluster-families.json").write_text(
        json_dumps(
            {
                "track": source_payload.get("track"),
                "trackSha256": source_payload.get("trackSha256"),
                "clusterGap": args.cluster_gap,
                "clusterCount": len(clusters),
                "familyCount": len(family_summary),
                "families": family_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "README.md").write_text(
        build_report(len(clusters), family_summary, sample_paths),
        encoding="utf-8",
    )
    (out_dir / "actionable-families.json").write_text(
        json_dumps(
            {
                "track": source_payload.get("track"),
                "trackSha256": source_payload.get("trackSha256"),
                "clusterGap": args.cluster_gap,
                "familyCount": len(actionable_summary),
                "families": actionable_summary,
            }
        ),
        encoding="utf-8",
    )
    (out_dir / "README.actionable.md").write_text(
        build_report(len(clusters), actionable_summary, actionable_sample_paths),
        encoding="utf-8",
    )

    print(f"Cataloged {len(clusters)} clusters into {len(family_summary)} unique families.")
    print(f"Actionable families: {len(actionable_summary)}")
    print(f"Output: {out_dir}")


if __name__ == "__main__":
    main()
