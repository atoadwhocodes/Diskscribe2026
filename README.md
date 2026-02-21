# DiskScribe2026

Status: alpha / work in progress.

DiskScribe2026 is a desktop-only Electron application for inspecting and translating legacy PC-98 disk images.

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
- Recursive folder queue import with scan safety limits
- Save/load batch plans as JSON
- Diagnostics bundle export for support/debug (`Ctrl+Shift+D`)

## Supported Formats

- Disk images: `.hdi`, `.nhd`, `.d88`, `.hdm`, `.hdd`, `.fdi`, `.fdd`
- Extract output: `.bin`
- Batch plans: `.json`

## Install (Windows)

- Download the latest installer from GitHub Releases:
  `https://github.com/atoadwhocodes/Diskscribe2026/releases`
- Run the generated `DiskScribe2026 Desktop Setup.exe`.

## Quick Start

1. Launch DiskScribe2026 Desktop.
2. Press `Ctrl+O` to open a disk image.
3. Use `Ctrl+G` to jump to byte offset or `Ctrl+L` to jump to LBA.
4. Use `Ctrl+Shift+O` to queue multiple files, then `Ctrl+Enter` to run batch queue (`Esc` stops).
5. Use `Ctrl+Shift+D` to export diagnostics when testing/reporting issues.
6. Review partition and translation panels.
7. Export selected bytes when needed.

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

## Roadmap

- Improve parser reliability on edge-case and partially corrupted images
- Expand filesystem and partition introspection depth
- Add first-class diagnostics bundle export from the app
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
