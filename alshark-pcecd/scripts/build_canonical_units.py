import argparse
import json
from pathlib import Path


BANKS = {
    "story_dialogue": {
        "name": "Story_Dialogue",
        "bankOffset": 0x007D1000,
        "track": 2,
    },
    "location_names": {
        "name": "Location_Names",
        "bankOffset": 0x04802100,
        "track": 2,
    },
    "event_prompts": {
        "name": "Event_Prompts",
        "bankOffset": 0x006A1000,
        "track": 2,
    },
    "battle_system": {
        "name": "Battle_System",
        "bankOffset": 0x007B0000,
        "track": 2,
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description="Build canonical IDs for workbook-aligned translation units")
    parser.add_argument("--input", required=True, help="Path to translation_units.json")
    parser.add_argument("--out", required=True, help="Output JSON path")
    return parser.parse_args()


def parse_hex(value):
    text = str(value or "").strip()
    if not text:
        return None
    return int(text, 16) if text.lower().startswith("0x") else int(text, 10)


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    output_path = Path(args.out).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    units = payload.get("units", [])

    canonical = []
    by_category = {}

    for unit in units:
        category = unit.get("category", "")
        bank = BANKS.get(category, {})
        file_offset = parse_hex(unit.get("file_offset"))
        rel_offset = parse_hex(unit.get("rel_offset"))
        ptr = parse_hex(unit.get("ptr"))
        abs_ptr = parse_hex(unit.get("abs_ptr"))

        if file_offset is not None:
            canonical_id = f"{category}_{file_offset:08x}"
        else:
            canonical_id = f"{category}_{int(unit.get('index', '0') or 0):04d}"

        entry = {
            "id": canonical_id,
            "sheet": unit.get("sheet", ""),
            "category": category,
            "index": int(unit.get("index", "0") or 0),
            "track": bank.get("track"),
            "bankOffset": bank.get("bankOffset"),
            "fileOffset": file_offset,
            "relOffset": rel_offset,
            "ptr": ptr,
            "absPtr": abs_ptr,
            "oldLength": int(unit.get("old_length", "0") or 0),
            "source": {
                "tokenized": unit.get("tokenized_original", ""),
                "plainJapanese": unit.get("plain_japanese", ""),
            },
            "translation": {
                "englishText": unit.get("english_text", ""),
                "englishMarkup": unit.get("english_markup", ""),
                "status": unit.get("status", ""),
                "notes": unit.get("notes", ""),
            },
        }

        if file_offset is not None and bank.get("bankOffset") is not None and rel_offset is None:
            entry["relOffset"] = file_offset - bank["bankOffset"]

        canonical.append(entry)
        by_category[category] = by_category.get(category, 0) + 1

    output = {
        "generatedAt": payload.get("generatedAt"),
        "sourceInput": str(input_path),
        "count": len(canonical),
        "byCategory": by_category,
        "units": canonical,
    }
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
