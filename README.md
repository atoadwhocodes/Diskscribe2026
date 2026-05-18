# DiskScribe2026

Status: alpha / work in progress.

DiskScribe2026 is a desktop-only Electron application for inspecting and translating legacy disk images, with current support focused on PC-98 and Sega CD workflows.

## Included Features

- Open disk image dialog and file-path launch support
- Virtualized hex view with disk/raw mode toggle
- Jump to offset and jump to LBA
- Copy offset and copy LBA
- Extract selected byte range to `.bin`
- FAT12/FAT16 boot sector metadata inspection
- FAT root/subdirectory listing with Shift-JIS short name decoding and long-name support
- Extract files from supported FAT directory entries
- Partition table inspection (MBR-style entries where present)
- Diagnostics bundle export as JSON
- Shift-JIS and legacy charset translation workspace
- Clean translation patch export and local patch application
- Character-frame byte role inspector
- Batch queue runner for parsing multiple disk images
- Save/load batch plans as JSON
- Sega CD `.cue` support with MODE1/2352 Track 01 ISO9660 file listing
- Standalone `.iso` ISO9660 file listing
- Extract files from Sega CD and standalone ISO9660 data tracks

## Supported Formats

- Disk images: `.hdi`, `.nhd`, `.d88`, `.hdm`, `.hdd`, `.fdi`, `.fdd`
- Sega CD images: `.cue` with MODE1/2352 data track and companion `.bin` files
- ISO9660 images: `.iso`
- Extract output: `.bin` and original FAT filenames where available
- Batch plans: `.json`
- Diagnostics bundles: `.json`
- Clean translation patches: `.json`

## Supported Systems List

Current parsing and extraction support:

- NEC PC-98 (FAT-oriented disk workflows via `.hdi`, `.nhd`, `.d88`, `.hdm`, `.hdd`, `.fdi`, `.fdd`)
- Sega CD / Mega-CD (ISO9660 data track workflows via `.cue` + `.bin`, and standalone `.iso`)

Roadmap systems (planned support list):

- [JP] NEC PC-88
- [JP] Sharp X68000
- [JP] Fujitsu FM TOWNS
- [JP] Fujitsu FM-7 / FM-77AV
- [JP] MSX / MSX2 / MSX2+
- [JP] Sharp MZ series
- [JP] Sharp X1
- [JP] PC Engine CD / TurboGrafx-CD
- [JP] Sega Saturn CD images
- [JP] PC-6001 / PC-6601 disk ecosystem
- [EU/UK] Commodore Amiga
- [EU/UK] Atari ST
- [EU/UK] ZX Spectrum (+3 disk ecosystem)
- [EU/UK] Amstrad CPC
- [EU/UK] BBC Micro
- [EU/UK] Acorn Electron
- [EU/UK] Acorn Archimedes
- [EU/UK] Commodore 64/128 disk ecosystem
- [EU/UK] Sinclair QL
- [EU/UK] SAM Coupe
- [EU/UK] Oric Atmos disk ecosystem
- [EU/UK] Dragon 32/64 disk ecosystem
- [EU/UK] MS-DOS PC compatibles (European archival disk images)

Note: roadmap systems are listed as targeted platforms and are not yet guaranteed as fully supported parsers in the current release.

## Install (Windows)

- Download the latest installer from GitHub Releases:
  `https://github.com/atoadwhocodes/Diskscribe2026/releases`
- Run the generated `DiskScribe2026 Desktop Setup.exe`.

## Quick Start

1. Launch DiskScribe2026 Desktop.
2. Press `Ctrl+O` to open a disk image.
3. Use `Ctrl+Enter` to jump to a byte offset or LBA.
4. Review partition, filesystem, directory, and translation panels.
5. Export selected bytes, extracted FAT files, or a diagnostics bundle when needed.
6. Use `Clean Patch` for public-safe translation patch export, then `Apply Patch` to patch a user's own matching source image into a separate output folder.

## Translation Patch Workflow

1. Keep private translation projects local to the working team. These project files may contain source context needed for review.
2. Mark finished entries as `reviewed` or `final`.
3. Use `Clean Patch` to export a public-safe patch JSON. The clean patch omits original source text and original source byte blobs.
4. Distribute the clean patch JSON, not a patched game image.
5. Users may choose `Validate Patch` first to check the clean patch against their own source image or images without writing output.
6. Users choose `Apply Patch`, select the clean patch JSON, select their own matching source image or images, and choose an output folder.
7. DiskScribe2026 writes patched copies plus `patch-report.json`. Entries with mismatched fingerprints, missing source images, invalid bytes, overlong replacements, or unsupported future patch versions are skipped and reported.

Command-line apply is also available for repeatable local testing:

```bash
npm run apply-clean-patch -- --patch patch.json --source disc.iso --out patched-output
```

Repeat `--source` for multi-disc patches.

Validate without writing patched copies:

```bash
npm run apply-clean-patch -- --dry-run --patch patch.json --source disc.iso
```

## Development

```bash
npm run desktop:install
npm run desktop:start
npm test
```

## Build

```bash
npm run desktop:make
```

Build output:

- `apps/diskscribe-2026-desktop/out/make/**`

## Roadmap

- Improve parser reliability on edge-case and partially corrupted images
- Expand filesystem and partition introspection depth beyond FAT12/FAT16 root/subdirectory browsing
- Harden installer upgrade/uninstall flow coverage in CI

## Release Flow

- Pushes to `main` build and upload Windows installer artifacts in GitHub Actions.
- Tags matching `v*` trigger the same Windows build and publish a GitHub Release automatically.
- Tag versions are validated against `apps/diskscribe-2026-desktop/package.json`.
- Release assets include SHA256 checksums.

Example release:

1. Update `apps/diskscribe-2026-desktop/package.json` version (for example `1.1.0`).
2. Commit and push to `main`.
3. Create and push tag `v1.1.0`.

## Security and Community

- Security reporting: `SECURITY.md`
- Contributing guide: `CONTRIBUTING.md`
- Community expectations: `CODE_OF_CONDUCT.md`
- Legal and distribution policy: `LEGAL.md`
- Development rules for contributors and coding tools: `DEVELOPMENT_RULES.md`

## Project Layout

- `apps/diskscribe-2026-desktop/src/index.ts`: Electron main process host and byte service
- `apps/diskscribe-2026-desktop/src/preload.ts`: IPC bridge for renderer
- `apps/diskscribe-2026-desktop/src/renderer.ts`: desktop controls and webview protocol shim
- `apps/diskscribe-2026-desktop/src/core/diskParsers.ts`: disk format parser logic
- `apps/diskscribe-2026-desktop/src/core/diskSummary.ts`: summary builder and metadata helpers
- `apps/diskscribe-2026-desktop/src/core/fat.ts`: FAT directory and cluster chain helpers
- `apps/diskscribe-2026-desktop/src/core/fatExtract.ts`: FAT file extraction helpers
- `apps/diskscribe-2026-desktop/src/core/hex/pagedFileByteReader.ts`: paged/LRU file byte reader
- `apps/diskscribe-2026-desktop/src/webview/editor.ts`: hex/translation UI logic
- `apps/diskscribe-2026-desktop/src/webview/necCharsets.ts`: charset decode and classification utilities
- `apps/diskscribe-2026-desktop/src/webview/editor.css`: renderer UI styles

## CodeQL Upload Toggle

- CodeQL analysis runs in CI for public repos.
- Upload to GitHub code scanning is disabled by default.
- Enable upload by setting repository variable `CODEQL_UPLOAD=true`.
- When upload is disabled, SARIF output is published as a workflow artifact.
- Secret scanning runs on push/PR via Gitleaks (`.github/workflows/secret-scan.yml`).
