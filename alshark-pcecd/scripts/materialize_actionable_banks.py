import argparse
import json
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Materialize actionable discovery families into structured bank dumps")
    parser.add_argument("--candidates", required=True, help="Path to candidate-strings.high-confidence.json")
    parser.add_argument("--families", required=True, help="Path to actionable-families.json")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--cluster-gap", type=lambda x: int(x, 0), default=0x80, help="Max gap between candidates in a cluster")
    return parser.parse_args()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


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


def family_slug(kind, offset):
    return f"{kind}_0x{offset:06X}".lower()


def make_string_id(bank_slug, candidate):
    return f"{bank_slug}_{candidate['offset']:06x}"


def write_bank_files(out_dir, family, cluster):
    bank_slug = family_slug(family["kind"], family["representativeOffset"])
    bank_dir = out_dir / "banks" / bank_slug
    bank_dir.mkdir(parents=True, exist_ok=True)

    strings = []
    text_lines = [
        f"# Bank {bank_slug}",
        f"- kind: {family['kind']}",
        f"- representative_offset: 0x{family['representativeOffset']:06X}",
        f"- representative_end: 0x{family['representativeEnd']:06X}",
        f"- representative_size: 0x{family['representativeSize']:X}",
        f"- occurrence_count: {family['occurrenceCount']}",
        "",
    ]

    for index, candidate in enumerate(cluster["candidates"]):
        string_id = make_string_id(bank_slug, candidate)
        entry = {
            "id": string_id,
            "index": index,
            "offset": candidate["offset"],
            "end": candidate["end"],
            "length": candidate["byteLength"],
            "textChars": candidate["textChars"],
            "score": candidate["score"],
            "highConfidence": candidate.get("highConfidence", False),
            "tokenized": candidate["tokenized"],
        }
        strings.append(entry)

        text_lines.extend(
            [
                f"## {string_id}",
                f"- offset: 0x{candidate['offset']:06X}",
                f"- end: 0x{candidate['end']:06X}",
                f"- length: 0x{candidate['byteLength']:X}",
                candidate["tokenized"],
                "",
            ]
        )

    bank_payload = {
        "slug": bank_slug,
        "kind": family["kind"],
        "signature": family["signature"],
        "occurrenceCount": family["occurrenceCount"],
        "occurrenceOffsets": family["occurrenceOffsets"],
        "representativeOffset": family["representativeOffset"],
        "representativeEnd": family["representativeEnd"],
        "representativeSize": family["representativeSize"],
        "representativeCandidateCount": family["representativeCandidateCount"],
        "representativeTotalScore": family["representativeTotalScore"],
        "strings": strings,
    }

    json_path = bank_dir / "bank.json"
    txt_path = bank_dir / "strings.txt"
    json_path.write_text(json.dumps(bank_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    txt_path.write_text("\n".join(text_lines), encoding="utf-8")

    return {
        "slug": bank_slug,
        "kind": family["kind"],
        "signature": family["signature"],
        "occurrenceCount": family["occurrenceCount"],
        "representativeOffset": family["representativeOffset"],
        "representativeEnd": family["representativeEnd"],
        "representativeSize": family["representativeSize"],
        "representativeCandidateCount": family["representativeCandidateCount"],
        "representativeTotalScore": family["representativeTotalScore"],
        "json": str(json_path.relative_to(out_dir)).replace("\\", "/"),
        "text": str(txt_path.relative_to(out_dir)).replace("\\", "/"),
    }


def main():
    args = parse_args()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    candidates_doc = load_json(args.candidates)
    families_doc = load_json(args.families)
    candidates = candidates_doc.get("candidates", [])
    families = families_doc.get("families", [])

    clusters = cluster_candidates(candidates, args.cluster_gap)
    cluster_map = {cluster["start"]: cluster for cluster in clusters}

    manifest_banks = []
    missing = []

    for family in families:
        cluster = cluster_map.get(family["representativeOffset"])
        if cluster is None:
            missing.append(family["representativeOffset"])
            continue
        manifest_banks.append(write_bank_files(out_dir, family, cluster))

    manifest = {
        "track": candidates_doc.get("track"),
        "trackSha256": candidates_doc.get("trackSha256"),
        "clusterGap": args.cluster_gap,
        "bankCount": len(manifest_banks),
        "missingRepresentativeOffsets": missing,
        "banks": manifest_banks,
    }

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    readme_lines = [
        "# Alshark Actionable Bank Materialization",
        "",
        f"- bank_count: {len(manifest_banks)}",
        f"- missing_representatives: {len(missing)}",
        "",
        "## Top Banks",
        "",
    ]

    for bank in manifest_banks[:25]:
        readme_lines.append(
            f"- 0x{bank['representativeOffset']:06X} kind={bank['kind']} candidates={bank['representativeCandidateCount']} occurrences={bank['occurrenceCount']} -> `{bank['json']}`"
        )

    readme_lines.append("")
    (out_dir / "README.md").write_text("\n".join(readme_lines), encoding="utf-8")

    print(f"Materialized {len(manifest_banks)} banks.")
    print(f"Missing representative clusters: {len(missing)}")
    print(f"Output: {out_dir}")


if __name__ == "__main__":
    main()
