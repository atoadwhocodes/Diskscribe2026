import argparse
import json
import re
from pathlib import Path


TOKEN_PATTERN = re.compile(r"(?:\[(?:CMD|ARG|EVT|SUB):[0-9A-F]{2}\]|\[(?:BR|LF|END)\]|<[0-9A-F]{2}>|@)")
PLAIN_CATEGORIES = {"location_names", "event_prompts"}
STORY_CATEGORIES = {"story_dialogue"}


def parse_args():
    parser = argparse.ArgumentParser(description="Build Ollama worklists from canonical PCE-CD units")
    parser.add_argument("--input", required=True, help="Path to canonical-units.json")
    parser.add_argument("--out-dir", required=True, help="Directory for generated worklists")
    return parser.parse_args()


def extract_tokens(text):
    return TOKEN_PATTERN.findall(str(text or ""))


def make_plain_item(unit):
    return {
        "id": unit["id"],
        "category": unit["category"],
        "sheet": unit["sheet"],
        "promptMode": "plain",
        "index": unit["index"],
        "track": unit["track"],
        "fileOffset": unit["fileOffset"],
        "relOffset": unit["relOffset"],
        "oldLength": unit["oldLength"],
        "sourceText": unit["source"]["plainJapanese"],
        "sourceTokenized": unit["source"]["tokenized"],
        "currentTranslation": unit["translation"]["englishText"],
        "notes": unit["translation"]["notes"],
    }


def make_story_item(unit):
    tokenized = unit["source"]["tokenized"]
    return {
        "id": unit["id"],
        "category": unit["category"],
        "sheet": unit["sheet"],
        "promptMode": "story_markup",
        "index": unit["index"],
        "track": unit["track"],
        "fileOffset": unit["fileOffset"],
        "relOffset": unit["relOffset"],
        "absPtr": unit["absPtr"],
        "oldLength": unit["oldLength"],
        "sourceText": tokenized,
        "plainJapanese": unit["source"]["plainJapanese"],
        "requiredTokens": extract_tokens(tokenized),
        "currentTranslation": unit["translation"]["englishMarkup"] or unit["translation"]["englishText"],
        "notes": unit["translation"]["notes"],
    }


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    units = payload.get("units", [])

    plain_items = []
    story_items = []

    for unit in units:
        category = unit.get("category", "")
        if category in PLAIN_CATEGORIES:
            plain_items.append(make_plain_item(unit))
        elif category in STORY_CATEGORIES:
            story_items.append(make_story_item(unit))

    all_items = plain_items + story_items
    generated_at = payload.get("generatedAt")

    write_json(
        out_dir / "plain-translation-worklist.json",
        {
            "generatedAt": generated_at,
            "source": str(input_path),
            "count": len(plain_items),
            "strings": plain_items,
        },
    )
    write_json(
        out_dir / "story-translation-worklist.json",
        {
            "generatedAt": generated_at,
            "source": str(input_path),
            "count": len(story_items),
            "strings": story_items,
        },
    )
    write_json(
        out_dir / "all-translation-worklist.json",
        {
            "generatedAt": generated_at,
            "source": str(input_path),
            "count": len(all_items),
            "strings": all_items,
        },
    )
    write_json(
        out_dir / "worklist-summary.json",
        {
            "generatedAt": generated_at,
            "source": str(input_path),
            "counts": {
                "plain": len(plain_items),
                "story_markup": len(story_items),
                "all": len(all_items),
            },
        },
    )


if __name__ == "__main__":
    main()
