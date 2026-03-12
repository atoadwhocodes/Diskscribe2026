import argparse
import hashlib
from pathlib import Path

from alshark_cd_utils import (
    collect_tracks,
    dump_json,
    extract_track_user_data,
    find_track,
    parse_ccd,
    tokenize_bytes,
)


DEFAULT_BANKS = [
    {"slug": "location_names", "offset": 0x04802100, "size": 0x0200, "description": "Location names"},
    {"slug": "event_prompts", "offset": 0x06A1000, "size": 0x0800, "description": "Event prompts"},
    {"slug": "battle_system", "offset": 0x07B0000, "size": 0x0800, "description": "Battle/system"},
    {"slug": "story_dialogue", "offset": 0x07D1000, "size": 0x1000, "description": "Story dialogue"},
    {"slug": "early_dialogue_status", "offset": 0x0000B143, "size": 0x0200, "description": "Early dialogue/status foothold"},
]


def parse_args():
    parser = argparse.ArgumentParser(description="Extract Track 02 user data and known Alshark banks")
    parser.add_argument("--ccd", required=True, help="Path to CloneCD .ccd")
    parser.add_argument("--img", required=True, help="Path to CloneCD .img")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument("--track", type=int, default=2, help="Data track number to extract (default: 2)")
    return parser.parse_args()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def main():
    args = parse_args()
    out_dir = Path(args.out).resolve()
    bank_dir = out_dir / "banks"
    out_dir.mkdir(parents=True, exist_ok=True)
    bank_dir.mkdir(parents=True, exist_ok=True)

    ccd = parse_ccd(args.ccd)
    tracks = collect_tracks(ccd)
    track = find_track(tracks, args.track)
    user_data = extract_track_user_data(args.img, track)

    track_path = out_dir / f"track{track.number:02d}_user.bin"
    track_path.write_bytes(user_data)

    track_summary = {
        "ccd": str(Path(args.ccd).resolve()),
        "img": str(Path(args.img).resolve()),
        "track": {
            "number": track.number,
            "control": track.control,
            "isData": track.is_data,
            "startLba": track.start_lba,
            "endLba": track.end_lba,
            "sectorCount": track.sector_count,
            "rawSectorSize": 2352,
            "userDataOffset": 16,
            "userDataSizePerSector": 2048,
            "userBytes": len(user_data),
            "sha256": sha256_bytes(user_data),
            "output": track_path.name,
        },
        "tracks": [
            {
                "number": item.number,
                "control": item.control,
                "isData": item.is_data,
                "startLba": item.start_lba,
                "endLba": item.end_lba,
                "sectorCount": item.sector_count,
            }
            for item in tracks
        ],
    }
    dump_json(out_dir / "track-layout.json", track_summary)

    bank_payload = {
        "trackOutput": track_path.name,
        "banks": [],
    }

    for bank in DEFAULT_BANKS:
        offset = bank["offset"]
        size = bank["size"]
        window = user_data[offset:offset + size]
        bin_path = bank_dir / f"{bank['slug']}.bin"
        txt_path = bank_dir / f"{bank['slug']}.txt"

        bin_path.write_bytes(window)
        txt_path.write_text(tokenize_bytes(window), encoding="utf-8")

        bank_payload["banks"].append(
            {
                **bank,
                "availableBytes": len(window),
                "sha256": sha256_bytes(window),
                "bin": str(bin_path.relative_to(out_dir)).replace("\\", "/"),
                "textPreview": str(txt_path.relative_to(out_dir)).replace("\\", "/"),
            }
        )

    dump_json(out_dir / "bank-targets.json", bank_payload)

    print(f"Extracted Track {track.number:02d} user data to {track_path}")
    print(f"Wrote {len(bank_payload['banks'])} bank target dumps to {bank_dir}")


if __name__ == "__main__":
    main()
