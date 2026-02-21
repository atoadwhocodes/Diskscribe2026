# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-02-21

### Added

- Desktop-only Electron app shell under `apps/diskscribe-2026-desktop`
- Windows installer branding assets and installer loading animation
- Public GitHub hygiene and governance files (`LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, issue templates)
- CI workflows for lint/package, dependency review, CodeQL, and secret scanning
- Tag-driven release automation for Windows artifacts

### Changed

- Migrated from extension-first structure to desktop-first packaging flow
- Unified root scripts around desktop app install, lint, package, and make commands

## [0.0.1]

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
