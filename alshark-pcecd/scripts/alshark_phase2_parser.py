import argparse
from pathlib import Path

from alshark_cd_utils import (
    collect_tracks,
    detect_pointer_table,
    extract_track_user_data,
    find_track,
    parse_ccd,
    tokenize_bytes,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Tokenize a control-heavy Alshark bank")
    parser.add_argument("--ccd", required=True, help="Path to CloneCD .ccd")
    parser.add_argument("--img", required=True, help="Path to CloneCD .img")
    parser.add_argument("--offset", required=True, type=lambda x: int(x, 0), help="Track user-data offset")
    parser.add_argument("--size", required=True, type=lambda x: int(x, 0), help="Window size")
    parser.add_argument("--out", required=True, help="Output text file")
    parser.add_argument("--track", type=int, default=2, help="Data track number to extract from")
    parser.add_argument(
        "--segment-base",
        type=lambda x: int(x, 0),
        default=None,
        help="Optional 16-bit segment base for pointer-table decoding",
    )
    return parser.parse_args()


def render_message_block(index, start, end, data):
    message = data[start:end]
    tokenized = tokenize_bytes(message)
    lines = [
        f"## Message {index}",
        f"- rel_offset: 0x{start:04X}",
        f"- span: 0x{start:04X}..0x{end:04X}",
        f"- length: {len(message)}",
        tokenized,
        "",
    ]
    return "\n".join(lines)


def message_end(data, start, fallback_end):
    terminator = data.find(b"\x00", start, fallback_end)
    if terminator >= 0:
        return terminator + 1
    return fallback_end


def main():
    args = parse_args()
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    tracks = collect_tracks(parse_ccd(args.ccd))
    track = find_track(tracks, args.track)
    user_data = extract_track_user_data(args.img, track)
    window = user_data[args.offset:args.offset + args.size]

    pointer_info = detect_pointer_table(window, args.size, args.segment_base)
    pointers = pointer_info["pointers"]
    segment_base = pointer_info["segmentBase"]

    lines = []
    lines.append("# Alshark Phase 2 Parser Output")
    lines.append("")
    lines.append(f"- track: {track.number:02d}")
    lines.append(f"- offset: 0x{args.offset:06X}")
    lines.append(f"- size: 0x{args.size:X}")
    lines.append(f"- segment_base: 0x{segment_base:04X}" if segment_base is not None else "- segment_base: <none>")
    lines.append(f"- pointer_count: {len(pointers)}")
    lines.append("")
    lines.append("## Pointer Table")
    lines.append("")

    if not pointers:
        lines.append("No plausible pointer table detected.")
        lines.append("")
    else:
        for index, pointer in enumerate(pointers):
            lines.append(
                f"- {index}: abs=0x{pointer['absPtr']:04X} rel=0x{pointer['relOffset']:04X} table=0x{pointer['tableOffset']:04X}"
            )
        lines.append("")

        lines.append("## Messages")
        lines.append("")
        for index, pointer in enumerate(pointers):
            start = pointer["relOffset"]
            if index + 1 < len(pointers):
                end = pointers[index + 1]["relOffset"]
            else:
                end = args.size
            end = message_end(window, start, end)
            lines.append(render_message_block(index, start, end, window))

    if not pointers:
        lines.append("## Raw Tokenized Window")
        lines.append("")
        lines.append(tokenize_bytes(window))
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote phase-2 parse output to {out_path}")


if __name__ == "__main__":
    main()
