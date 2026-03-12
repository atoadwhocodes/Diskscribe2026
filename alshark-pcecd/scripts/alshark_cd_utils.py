import json
from dataclasses import dataclass
from pathlib import Path


TRACK_POINT_MIN = 1
TRACK_POINT_MAX = 99
RAW_SECTOR_SIZE = 2352
MODE1_USER_OFFSET = 16
MODE1_USER_SIZE = 2048


@dataclass
class TrackInfo:
    number: int
    control: int
    start_lba: int
    end_lba: int

    @property
    def is_data(self) -> bool:
        return bool(self.control & 0x04)

    @property
    def sector_count(self) -> int:
        return self.end_lba - self.start_lba

    @property
    def raw_size(self) -> int:
        return self.sector_count * RAW_SECTOR_SIZE

    @property
    def user_size(self) -> int:
        return self.sector_count * MODE1_USER_SIZE


def parse_ccd(ccd_path):
    sections = {}
    current = None

    for raw_line in Path(ccd_path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith(";"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1]
            sections[current] = {}
            continue
        if "=" in line and current is not None:
            key, value = line.split("=", 1)
            sections[current][key.strip()] = value.strip()

    return sections


def parse_int(value):
    value = str(value).strip()
    if value.lower().startswith("0x"):
        return int(value, 16)
    return int(value, 10)


def collect_tracks(ccd_sections):
    entries = []
    lead_out_lba = None

    for section_name, values in ccd_sections.items():
        if not section_name.startswith("Entry "):
            continue
        point = parse_int(values.get("Point", "0"))
        plba = parse_int(values.get("PLBA", "0"))
        control = parse_int(values.get("Control", "0"))

        if point == 0xA2:
            lead_out_lba = plba
            continue

        if TRACK_POINT_MIN <= point <= TRACK_POINT_MAX:
            entries.append(
                {
                    "number": point,
                    "control": control,
                    "plba": plba,
                }
            )

    entries.sort(key=lambda item: item["number"])
    if lead_out_lba is None:
        raise ValueError("Lead-out entry (Point=0xA2) not found in CCD")

    tracks = []
    for index, entry in enumerate(entries):
        end_lba = entries[index + 1]["plba"] if index + 1 < len(entries) else lead_out_lba
        tracks.append(
            TrackInfo(
                number=entry["number"],
                control=entry["control"],
                start_lba=entry["plba"],
                end_lba=end_lba,
            )
        )

    return tracks


def find_track(tracks, number):
    for track in tracks:
        if track.number == number:
            return track
    raise ValueError(f"Track {number:02d} not found in CCD")


def extract_track_user_data(img_path, track):
    if not track.is_data:
        raise ValueError(f"Track {track.number:02d} is not marked as a data track")

    img_path = Path(img_path)
    output = bytearray(track.user_size)
    write_offset = 0
    raw_start = track.start_lba * RAW_SECTOR_SIZE

    with img_path.open("rb") as handle:
        handle.seek(raw_start)
        for _ in range(track.sector_count):
            sector = handle.read(RAW_SECTOR_SIZE)
            if len(sector) != RAW_SECTOR_SIZE:
                raise ValueError("Unexpected EOF while reading raw sectors")
            output[write_offset:write_offset + MODE1_USER_SIZE] = sector[
                MODE1_USER_OFFSET:MODE1_USER_OFFSET + MODE1_USER_SIZE
            ]
            write_offset += MODE1_USER_SIZE

    return bytes(output)


def dump_json(path, payload):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def shift_jis_char(data, index):
    byte = data[index]

    if 0x81 <= byte <= 0x9F or 0xE0 <= byte <= 0xFC:
        if index + 1 < len(data):
            pair = data[index:index + 2]
            second = pair[1]
            if 0x40 <= second <= 0xFC and second != 0x7F:
                try:
                    return pair.decode("cp932"), 2
                except UnicodeDecodeError:
                    pass

    if 0xA1 <= byte <= 0xDF:
        try:
            return bytes([byte]).decode("cp932"), 1
        except UnicodeDecodeError:
            return None

    if 0x20 <= byte <= 0x7E:
        return chr(byte), 1

    return None


def tokenize_bytes(data):
    labels = {
        0x23: "CMD",
        0x24: "ARG",
        0x25: "EVT",
        0x26: "SUB",
    }
    out = []
    index = 0

    while index < len(data):
        byte = data[index]

        if byte == 0x00:
            out.append("[END]")
            index += 1
            continue
        if byte == 0x01:
            out.append("[BR]")
            index += 1
            continue
        if byte == 0x0D:
            out.append("[LF]")
            index += 1
            continue
        if byte in labels and index + 1 < len(data):
            out.append(f"[{labels[byte]}:{data[index + 1]:02X}]")
            index += 2
            continue

        decoded = shift_jis_char(data, index)
        if decoded is not None:
            text, width = decoded
            out.append(text)
            index += width
            continue

        out.append(f"<{byte:02X}>")
        index += 1

    return "".join(out)


def detect_pointer_table(window, bank_size, segment_base=None, max_entries=256):
    if len(window) < 4:
        return {"segmentBase": segment_base, "pointers": []}

    first_value = int.from_bytes(window[0:2], "little")
    if segment_base is None:
        segment_base = first_value & 0xFF00

    pointers = []
    previous = None
    cursor = 0
    limit = min(bank_size, len(window), max_entries * 2)

    while cursor + 1 < limit:
        value = int.from_bytes(window[cursor:cursor + 2], "little")
        rel = value - segment_base
        if rel < 0 or rel >= bank_size:
            break
        if previous is not None and value <= previous:
            break
        pointers.append(
            {
                "tableOffset": cursor,
                "absPtr": value,
                "relOffset": rel,
            }
        )
        previous = value
        cursor += 2

    return {
        "segmentBase": segment_base,
        "pointers": pointers,
    }
