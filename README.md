# DiskScribe2026

Minimal VS Code extension scaffold for inspecting PC-98 disk images (`.hdi`, `.nhd`, `.d88`) using:

- A custom read-only editor (`pc98.dskedit`)
- Command entry points for jump/navigation and virtual document output
- A virtual text document (`pc98disk:`) for quick metadata inspection

## Included Features

- File association for `.hdi`, `.nhd`, `.d88` with a custom editor
- `PC-98: Jump to Partition` command (`pc98.jumpToPartition`)
- `PC-98: Jump to LBA` command (`pc98.jumpToLba`)
- `PC-98: Jump to Offset (Hex/Dec)` command (`pc98.jumpToOffset`)
- `PC-98: Copy Offset` command (`pc98.copyOffset`)
- `PC-98: Copy LBA` command (`pc98.copyLba`)
- `PC-98: Open Disk via Virtual Document` command (`pc98.openVirtualDisk`)
- Shift-JIS preview support via `iconv-lite`
- Parser entry points: `parseHDI`, `parseNHD`, `parseD88`
- Partition table inspection (MBR-style entries where present)
- Virtualized hex view with disk/raw mode toggle and persistent selection highlight
- Extension-host paged byte reads (64 KiB default pages) with per-session LRU cache
- Status bar sync for Offset, LBA, and CHS (when geometry is available)

## Development

```bash
npm install
npm run compile
```

Run with VS Code extension host:

1. Open this folder in VS Code
2. Press `F5` (uses `.vscode/launch.json`)

## Project Layout

- `src/extension.ts`: activation, command wiring, custom editor registration
- `src/diskParsers.ts`: format parsers and partition extraction
- `src/diskSummary.ts`: disk metadata + preview helpers
- `media/editor.js`: webview frontend logic
- `media/editor.css`: webview styles
