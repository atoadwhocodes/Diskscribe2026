# DiskScribe2026

DiskScribe2026 is now a desktop-only Electron app for inspecting and translating PC-98 disk images.

Supported disk extensions:

- `.hdi`
- `.nhd`
- `.d88`
- `.hdm`
- `.hdd`
- `.fdi`
- `.fdd`

Project policies:

- Security reporting: `SECURITY.md`
- Contributing guide: `CONTRIBUTING.md`
- Community expectations: `CODE_OF_CONDUCT.md`

## Included Features

- Open disk image dialog and file-path launch support
- Virtualized hex view with disk/raw mode toggle
- Jump to offset and jump to LBA
- Copy offset and copy LBA
- Extract selected byte range to `.bin`
- Partition table inspection (MBR-style entries where present)
- Shift-JIS and legacy charset translation workspace
- Character-frame byte role inspector
- Batch queue runner for parsing multiple disk images
- Save/load batch plans as JSON

## Development

```bash
npm run desktop:install
npm run desktop:start
```

## Build

```bash
npm run desktop:make
```

Build output:

- `apps/diskscribe-2026-desktop/out/make/**`

## Project Layout

- `apps/diskscribe-2026-desktop/src/index.ts`: Electron main process host and byte service
- `apps/diskscribe-2026-desktop/src/preload.ts`: IPC bridge for renderer
- `apps/diskscribe-2026-desktop/src/renderer.ts`: desktop controls and webview protocol shim
- `apps/diskscribe-2026-desktop/src/core/diskParsers.ts`: disk format parser logic
- `apps/diskscribe-2026-desktop/src/core/diskSummary.ts`: summary builder and metadata helpers
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
