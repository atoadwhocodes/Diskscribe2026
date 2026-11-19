# DiskScribe Format and Architecture Roadmap

Status: planning and staged read-only implementation. This is not a list of fully supported systems.

## Governing design

Separate a **container** from a **machine**. A D88 container may hold PC-88 or PC-98 media, while a raw disk may use proprietary filesystems. Cartridge ROM, hard disk, floppy, CD track and executable formats also require different address mappings.

Implement independently testable layers:

1. Media sniffing and container validation, with strict size and offset bounds.
2. Logical sector / track readers (D88, raw DSK, PC-98 containers, ISO9660 / CUE).
3. Filesystem and OS adapters (FAT, N88-BASIC disk files, other proprietary formats).
4. CPU address maps and read-only code inspection (Z80-family, Motorola 68000, 65xx-family, 8086/286, 6809, 68000, SH-family, etc.).
5. Character decoding, font/tile inspection, and translation project management.
6. Verified patching through immutable input media, versioned byte checks and separate output; no copyrighted source images in public releases.

## Stages

### Stage A — harden current inspection (active)
- PC-98 FAT disk workflows, Sega CD ISO9660 extraction, clean patch dry run and copy-on-write application.
- D88 record-table introspection without treating variable-size sector records as a flat MBR/FAT image.
- Raw DSK geometry clues, without mistaking file size for definitive machine identification.
- Linear Mega Drive/Genesis cartridge header and 68000 reset-vector inspection, read-only.
- Synthetic fixtures, corrupted-media tests, CLI tests, packaged desktop smoke testing.

### Stage B — PC-88 and Mega Drive/Mega-CD code paths
- NEC PC-8801: Z80-compatible CPU and model-specific bank mapping, N88-BASIC variants, PC-88 floppy sector mapping and directory structures, ANK/JIS/Shift-JIS text handling.
- D88 indexed sector reader: C/H/R/N fields, track offsets, variable sector sizes, repeated or missing IDs, data payload bounds, and write-protection metadata.
- Mega Drive: Motorola 68000 ROM vectors, big-endian structures, optional Z80 sound-program discovery, read-only disassembler, isolated opcode library.
- Mega-CD: reuse 68000 instruction decoder for main/sub CPUs but retain *separate* address maps and the disc/BIOS/word-RAM infrastructure. Never treat a raw CD BIN as a linear Genesis ROM.
- Safe recovery of named file entries, pointer tables and game-specific scripts only after format evidence is established.

### Stage C — Japanese computers and optical media
- NEC PC-8001 and PC-6001/PC-6601 families; confirm whether 'PC-6800' means another machine before labeling support.
- Sharp X1, MZ and X68000; Fujitsu FM-7/FM-77AV and FM TOWNS; MSX/MSX2; NEC PC Engine, Super CD-ROM2 and Duo.
- Sega Master System / Game Gear, Saturn, other regional variants where test fixtures and expertise allow.
- Prioritize read-only identification and extraction before patch authoring. Each supported format needs a lawful specimen or synthetic fixture and a documented test.

### Stage D — European computers and PS1-era formats
- Commodore Amiga, Atari ST, Sinclair ZX Spectrum/QL, Amstrad CPC, BBC Micro/Acorn, and other requested systems.
- ISO9660 extensions, multi-track cue sheets, sector EDC/ECC, mixed-mode audio, larger optical images, and eventually PlayStation-era disc containers, conditioned on independent documentation and legal review.
- Avoid broad '.bin' guessing; require a user-supplied descriptor, validated signature or dedicated parser.

## Platform exclusion

Do not add Nintendo-targeted image loading, game extraction, firmware packaging or release workflows in DiskScribe. The separate ATWC-1 NES mapper and original-game development projects remain separate. Do not merge those repos or assets into DiskScribe.

## Legal and test boundaries

- No bundled game ROMs, CD images, copyrighted firmware/BIOS files, game fonts, extracted commercial source databases, security keys or vendor confidential manuals.
- Use homebrew, synthetic test images, and appropriately licensed technical documentation. A technical document may be publicly accessible without being redistributable.
- Independent parsers, format specifications, user-supplied media, clean patches and general-purpose hex inspection can be designed without distributing third-party game content; they still require review before public release.
- Keep raw source bytes local and private; prefer reproducible transformations and SHA-256 provenance for new patch versions.
- Progress from read-only browsing -> extraction -> validated dry-run -> controlled output copy, with regression coverage at every transition.

## Definition of supported

A platform is 'supported' only when it has a content-sniffed normal-open path, repeatable synthetic/test fixtures, defensible error messages on malformed images and clear documented limitations. Listing a platform in a roadmap never implies that its filesystems, executables, text encodings or writable patch formats are fully implemented.
