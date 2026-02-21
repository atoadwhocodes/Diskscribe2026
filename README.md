# DiskScribe2026

DiskScribe2026 now ships with two shells over shared disk logic:

- VS Code extension (`pc98.dskedit`) for in-editor workflows
- Electron desktop app (`apps/diskscribe-2026-desktop`) for standalone use

Project policies:

- Security reporting: `SECURITY.md`
- Contributing guide: `CONTRIBUTING.md`
- Community expectations: `CODE_OF_CONDUCT.md`

## Included Features

- File association for `.hdi`, `.nhd`, `.d88`, `.hdm`, `.hdd`, `.fdi`, `.fdd` with a custom editor
- `PC-98: Jump to Partition` command (`pc98.jumpToPartition`)
- `PC-98: Jump to LBA` command (`pc98.jumpToLba`)
- `PC-98: Jump to Offset (Hex/Dec)` command (`pc98.jumpToOffset`)
- `PC-98: Copy Offset` command (`pc98.copyOffset`)
- `PC-98: Copy LBA` command (`pc98.copyLba`)
- `PC-98: Extract Selected Bytes` command (`pc98.extractSelection`)
- `PC-98: Open Disk via Virtual Document` command (`pc98.openVirtualDisk`)
- Shift-JIS preview support via `iconv-lite`
- Parser entry points: `parseHDI`, `parseNHD`, `parseD88`, `parseHDM`, `parseHDD`, `parseFDI`, `parseFDD`
- Partition table inspection (MBR-style entries where present)
- Virtualized hex view with disk/raw mode toggle and persistent selection highlight
- Extension-host paged byte reads (64 KiB default pages) with per-session LRU cache
- Status bar sync for Offset, LBA, and CHS (when geometry is available)
- Translator workspace with character-set decoding, draft notes, and copy helpers
- Character-set framing panel for Shift-JIS byte role inspection
- Standalone desktop shell with:
  - Open Disk dialog
  - Jump to Offset / Jump to LBA
  - Copy Offset / Copy LBA
  - Extract selected byte range to `.bin`
  - Shared `hex.read`, `hex.jump`, `hex.select` message protocol

## Development (Extension)

```bash
npm install
npm run compile
```

During development, you can run:

```bash
npm run watch
```

Build scripts:

- `npm run compile:ext` compiles extension host TypeScript
- `npm run compile:webview` bundles webview script with webpack
- `npm run compile` runs both steps
- `npm run package` creates a `.vsix`

## CodeQL Upload Toggle

- CodeQL analysis runs in CI for public repos.
- By default, upload to GitHub code scanning is disabled to avoid failing runs before the repository has code scanning enabled.
- Enable upload by setting repository variable `CODEQL_UPLOAD=true`.
- When upload is disabled, SARIF output is published as a workflow artifact.
- Secret scanning runs on push/PR via Gitleaks (`.github/workflows/secret-scan.yml`).

Run with VS Code extension host:

1. Open this folder in VS Code
2. Press `F5` (uses `.vscode/launch.json`)

## Development (Desktop)

```bash
cd apps/diskscribe-2026-desktop
npm install
npm run make
```

## Project Layout

- `src/extension.ts`: activation, command wiring, custom editor registration
- `src/core/diskParsers.ts`: shared format parsers and partition extraction
- `src/core/diskSummary.ts`: shared disk metadata + preview helpers
- `src/core/hex/pagedFileByteReader.ts`: shared paged/LRU byte reader
- `src/diskParsers.ts`: extension compatibility re-export
- `src/diskSummary.ts`: VS Code URI wrapper over shared summary builder
- `media-src/editor.ts`: webview source entrypoint
- `media/editor.js`: generated webview bundle output
- `media/editor.css`: webview styles
- `webpack.webview.config.js`: webview bundling config
- `tsconfig.webview.json`: webview TypeScript config
- `apps/diskscribe-2026-desktop/src/index.ts`: Electron main process host and byte service
- `apps/diskscribe-2026-desktop/src/preload.ts`: IPC bridge for renderer
- `apps/diskscribe-2026-desktop/src/renderer.ts`: desktop controls + webview protocol shim
