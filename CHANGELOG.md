# Changelog

All notable changes to this project are documented in this file.

## [1.1.0-alpha.1] - 2026-05-14

### Added

- FAT12/FAT16 filesystem metadata detection for supported disk image previews
- Root and subdirectory browsing for FAT directory entries, including deleted-entry visibility
- File extraction from FAT directory entries with fragmented cluster-chain support
- Sega CD `.cue` and standalone `.iso` parsing for ISO9660 file listing and file extraction
- Diagnostics bundle export with structured summary JSON and a text report
- Core test suite for parser safety, FAT directory parsing, file extraction, paged byte reads, and fixture-backed Alpha smoke coverage

### Changed

- Added root `npm test` and CI test execution for the desktop core suite
- Updated desktop packaging to run TypeScript checks through the test command

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
