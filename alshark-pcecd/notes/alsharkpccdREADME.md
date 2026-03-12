# Alshark PC Engine CD starter kit

This folder contains a first practical extraction setup for the uploaded CloneCD dump.

## Files

- `alshark_extract.py`
  - Parses the `.ccd`
  - Extracts Track 02 user data from the raw CloneCD `.img`
  - Dumps the current best bank targets
- `alshark_phase2_parser.py`
  - Focuses on control-heavy banks
  - Tokenizes likely script/event bytes into readable markers

## Current bank targets

- `0x04802100` location names
- `0x06A1000` event prompts
- `0x07B0000` battle/system
- `0x07D1000` story dialogue
- `0x0000B143` early dialogue/status foothold

## Token hints

Current phase-2 token labels are intentionally conservative:

- `[BR]` = byte `01`, likely an in-message break / line split
- `[LF]` = byte `0D`
- `[CMD:xx]` = byte pair beginning with `23`
- `[ARG:xx]` = byte pair beginning with `24`
- `[EVT:xx]` = byte pair beginning with `25`
- `[SUB:xx]` = byte pair beginning with `26`

These are labels, not final proven semantics yet.

## Run

```bash
python alshark_extract.py \
  --ccd "/mnt/data/Alshark (Japan).ccd" \
  --img "/mnt/data/Alshark (Japan).img" \
  --out "/mnt/data/alshark_tools/extract_out"
```

Story bank control dump:

```bash
python alshark_phase2_parser.py \
  --ccd "/mnt/data/Alshark (Japan).ccd" \
  --img "/mnt/data/Alshark (Japan).img" \
  --offset 0x7D1000 \
  --size 0x800 \
  --out "/mnt/data/alshark_tools/extract_out/story_dialogue_phase2.txt"
```

## What to do next

Best order:

1. prove reinsertion on `location_names`
2. prove reinsertion on `event_prompts`
3. map script control bytes in `story_dialogue`
4. locate font / text box width limits
5. package changes as a patch workflow


## Phase 6.5: Story bank repack + repoint

`alshark_phase6_5_story_repoint.py` upgrades the earlier same-slot story reinserter.

What it does:
- parses the leading 16-bit pointer table in the `story_dialogue` bank
- repacks the message payload contiguously
- rewrites the story-bank pointers
- allows longer replacements as long as the rebuilt bank still fits inside the original `0x1000`-byte bank

Example:

```bash
python alshark_phase6_5_story_repoint.py   --ccd "Alshark (Japan).ccd"   --img "Alshark (Japan).img"   --translations sample_story_translations.json   --out-img Alshark_story_repoint_test.img   --report extract_out/phase6_5_story_repoint_report.json
```

Current assumptions:
- the story bank uses a single `0xC000` segment base
- pointers are the only in-bank references that need rewriting
- control bytes remain embedded inside each encoded message payload
