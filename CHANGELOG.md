# Change Log

## 0.0.1

- Initial scaffold for PC-98 Disk Editor extension
- Custom editor registration for `.hdi`, `.nhd`, `.d88`
- Command wiring for partition jump and virtual document open
- Virtual document content provider and Shift-JIS preview baseline
- Added parser module with `parseHDI`, `parseNHD`, `parseD88`
- Added partition extraction and partition table rendering in webview/virtual document
- Added virtualized hex view with disk/raw mode toggle
- Added extension-host byte server protocol (`hex.read`, `hex.jump`, `hex.select`)
- Added paged reader cache (64 KiB pages, configurable max cached pages)
- Added jump/copy commands for offset and LBA with status bar synchronization
- Renamed package display identity to `DiskScribe2026`
