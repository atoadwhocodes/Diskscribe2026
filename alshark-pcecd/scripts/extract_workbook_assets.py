import argparse
import csv
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract workbook sheets into machine-readable assets."
    )
    parser.add_argument("--input", required=True, help="Path to workbook .xlsx")
    parser.add_argument("--out", required=True, help="Output directory")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_shared_strings(zf: zipfile.ZipFile):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("main:si", NS):
        values.append("".join((node.text or "") for node in item.iterfind(".//main:t", NS)))
    return values


def workbook_sheets(zf: zipfile.ZipFile):
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("{%s}Relationship" % NS["pkgrel"])
    }

    sheets = []
    for sheet in workbook.find("main:sheets", NS):
        rel_id = sheet.attrib["{%s}id" % NS["rel"]]
        target = rel_map[rel_id].lstrip("/")
        entry_name = target if target.startswith("xl/") else f"xl/{target}"
        sheets.append(
            {
                "name": sheet.attrib["name"],
                "entry_name": entry_name,
            }
        )

    return sheets


def cell_value(cell, shared_strings):
    cell_type = cell.attrib.get("t")
    value = cell.find("main:v", NS)
    inline = cell.find("main:is", NS)

    if cell_type == "s" and value is not None and value.text is not None:
        index = int(value.text)
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""

    if cell_type == "inlineStr" and inline is not None:
        return "".join((node.text or "") for node in inline.iterfind(".//main:t", NS))

    if value is not None and value.text is not None:
        return value.text

    return ""


def col_index(ref: str) -> int:
    match = re.match(r"([A-Z]+)", ref or "")
    if not match:
        return 0

    total = 0
    for char in match.group(1):
        total = total * 26 + ord(char) - 64
    return total - 1


def normalize_name(name: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return value or "sheet"


def header_key(value: str, fallback_index: int) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return cleaned or f"column_{fallback_index + 1}"


def extract_sheet_rows(zf: zipfile.ZipFile, entry_name: str, shared_strings):
    root = ET.fromstring(zf.read(entry_name))
    rows = []
    max_columns = 0

    for row in root.findall(".//main:sheetData/main:row", NS):
        cells = {}
        for cell in row.findall("main:c", NS):
            index = col_index(cell.attrib.get("r", ""))
            cells[index] = cell_value(cell, shared_strings)

        if not cells:
            rows.append([])
            continue

        row_values = []
        width = max(cells) + 1
        max_columns = max(max_columns, width)
        for index in range(width):
            row_values.append(cells.get(index, ""))
        rows.append(row_values)

    if max_columns == 0:
        max_columns = max((len(row) for row in rows), default=0)

    normalized_rows = []
    for row in rows:
        if len(row) < max_columns:
            normalized_rows.append(row + [""] * (max_columns - len(row)))
        else:
            normalized_rows.append(row[:max_columns])

    return normalized_rows


def write_csv(path: Path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def sheet_payload(sheet_name: str, rows):
    header = rows[0] if rows else []
    records = []
    has_header = any(cell.strip() for cell in header) if header else False

    if has_header and len(rows) > 1:
        keys = []
        seen = {}
        for index, cell in enumerate(header):
            key = header_key(cell, index)
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > 1:
                key = f"{key}_{seen[key]}"
            keys.append(key)

        for row in rows[1:]:
            if not any(cell.strip() for cell in row):
                continue
            records.append({keys[index]: row[index] for index in range(len(keys))})

    return {
        "sheetName": sheet_name,
        "rowCount": len(rows),
        "header": header,
        "records": records,
    }


def main():
    args = parse_args()
    input_path = Path(args.input).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "input": str(input_path),
        "sha256": sha256_file(input_path),
        "sheets": [],
    }
    translation_units = []

    with zipfile.ZipFile(input_path) as zf:
        shared_strings = load_shared_strings(zf)
        sheets = workbook_sheets(zf)

        for sheet in sheets:
            sheet_name = sheet["name"]
            slug = normalize_name(sheet_name)
            rows = extract_sheet_rows(zf, sheet["entry_name"], shared_strings)
            payload = sheet_payload(sheet_name, rows)

            csv_path = out_dir / f"{slug}.csv"
            json_path = out_dir / f"{slug}.json"

            write_csv(csv_path, rows)
            json_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            manifest["sheets"].append(
                {
                    "name": sheet_name,
                    "slug": slug,
                    "csv": csv_path.name,
                    "json": json_path.name,
                    "rowCount": payload["rowCount"],
                    "recordCount": len(payload["records"]),
                }
            )

            if sheet_name in {"Story_Dialogue", "Location_Names", "Event_Prompts", "Battle_System"}:
                for record in payload["records"]:
                    translation_units.append(
                        {
                            "sheet": sheet_name,
                            "category": slug,
                            "index": record.get("index", ""),
                            "file_offset": record.get("file_offset", ""),
                            "ptr": record.get("ptr", ""),
                            "abs_ptr": record.get("abs_ptr", ""),
                            "rel_offset": record.get("rel_offset", ""),
                            "old_length": record.get("old_length", ""),
                            "tokenized_original": record.get("tokenized_original", ""),
                            "plain_japanese": record.get("plain_japanese", ""),
                            "english_text": record.get("english_text", ""),
                            "english_markup": record.get("english_markup", ""),
                            "status": record.get("status", ""),
                            "notes": record.get("notes", ""),
                        }
                    )

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out_dir / "translation_units.json").write_text(
        json.dumps(
            {
                "generatedAt": manifest["generatedAt"],
                "input": manifest["input"],
                "sha256": manifest["sha256"],
                "count": len(translation_units),
                "units": translation_units,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
