# Alshark PC Engine CD

Project ID: `alshark_pcecd`

## Source Media

- `Alshark (Japan).ccd` (2980 bytes)
  Source: `d:\Users\Toadius\Downloads\Alshark_TurboGrafx-CD_JA\Alshark (Japan).ccd`
- `Alshark (Japan).img` (463939056 bytes)
  Source: `d:\Users\Toadius\Downloads\Alshark_TurboGrafx-CD_JA\Alshark (Japan).img`
- `Alshark (Japan).sub` (18936288 bytes)
  Source: `d:\Users\Toadius\Downloads\Alshark_TurboGrafx-CD_JA\Alshark (Japan).sub`

## Imported Partials

- `alsharkpccdREADME.md`
  Source: `d:\Users\Toadius\Downloads\alsharkpccdREADME.md`
- `README.txt`
  Source: `d:\Users\Toadius\Downloads\Alshark_TurboGrafx-CD_JA\README.txt`

## Translation Assets

- `Alshark_master_translation_workbook.xlsx`
  Source: `d:\Users\Toadius\Downloads\Alshark_TurboGrafx-CD_JA\Alshark_master_translation_workbook.xlsx`
  Imported to: `translated/Alshark_master_translation_workbook.xlsx`
  Sheets: `Overview`, `Instructions`, `Story_Dialogue`, `Location_Names`, `Event_Prompts`, `Battle_System`, `Build_Status`

## Current Extraction Targets

- `0x04802100` location names
- `0x06a1000` event prompts
- `0x07b0000` battle/system
- `0x07d1000` story dialogue
- `0x0000b143` early dialogue/status foothold

## Data Track Finding

- Track 15 is a byte-for-byte prefix of Track 02 for `75,806,720` bytes.
- All currently targeted banks match exactly across both data tracks.
- Treat Track 02 as canonical for extraction and reinsertion work.

## Next Step

- Build or import the CloneCD extraction scripts referenced by the partial notes.
- Extract a first machine-readable string table before starting translation merges.
- Locate the sample patch kit files referenced in `notes/README.txt` so they can be validated against the provided IMG hash.
- Use the workbook tabs as the canonical translation buckets when we build extraction and merge scripts.
- Align the disc-derived story/event/location banks with the workbook rows so translation and reinsertion can use stable IDs.
