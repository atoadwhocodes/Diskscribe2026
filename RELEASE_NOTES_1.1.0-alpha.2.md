# DiskScribe2026 Desktop v1.1.0-alpha.2

DiskScribe2026 Desktop is a standalone alpha utility for inspecting user-supplied legacy disk images and supporting translation workflows. This alpha does not include commercial disk images, proprietary game data, extracted source text databases, or patched game images.

## Highlights

- Clean translation patch export for public-safe distribution.
- Local clean patch validation and application against user-owned source images.
- CLI clean patch validation/application for repeatable local testing.
- Patch report panel in the desktop UI with warnings, skipped reasons, verified counts, and output paths.
- Sega CD / Mega-CD `.cue` plus standalone `.iso` ISO9660 file listing and extraction.
- Conservative Sega CD text patch guardrails for byte fit, control prefixes, inline control tokens, and known no-go files such as `MESS.DAT`.
- Improved Translator Workspace readability and button hit areas.

## Alpha Limitations

- Public sharing should use clean patch JSON, not modified images.
- Private translation projects may contain original source context and should remain private.
- Sega CD reinsertion is conservative and currently limited to in-place-safe entries.
- Packed or unconfirmed files remain blocked until their format is proven.
- The CLI patch command is source-tree tooling for local validation and patching.

## Verification

Verified locally on May 18, 2026:

- `npm test`: 41 passing.
- `npm run lint`: passed.
- `npm --prefix apps/diskscribe-2026-desktop audit --omit=optional`: zero vulnerabilities.
- `npm run apply-clean-patch -- --help`: passed.
- `npm run package`: produced Windows artifacts.

## Windows Artifacts

- `DiskScribe2026DesktopSetup.exe`
- `diskscribe2026-1.1.0-alpha2-full.nupkg`
- `RELEASES`
- `SHA256SUMS.txt`

## SHA256

```text
57ae508dd2c840c400af95240746aed28ed67f10a5312423c83314fe3a7f7f3d *diskscribe2026-1.1.0-alpha2-full.nupkg
9620b96c6ed7f6b8bf89846802bee7536ccdb9adbac402a2f6c96305ae88084f *DiskScribe2026DesktopSetup.exe
f3718582ecc6d051410bc2842c90b1065017dafae1dfe0c213fcf3631bc268c7 *RELEASES
```

## Before Tagging

Run `ALPHA_SMOKE_TEST.md` against the packaged app and confirm the Translator Workspace controls are readable and clickable.
