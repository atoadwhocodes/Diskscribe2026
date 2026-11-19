# DiskScribe2026 Alpha Readiness Checklist

Use this checklist to decide whether a build is ready to tag as an alpha.

## Current Target

- Target version: `1.1.0-alpha.2`
- Current release posture: standalone desktop alpha
- Public distribution format: installer plus checksums
- Public translation distribution format: clean patch JSON only

## Required Before Tagging

- [x] `npm test` passes. Verified May 25, 2026 for `1.1.0-alpha.2`: 48 tests passing.
- [x] `npm run lint` passes. Verified May 25, 2026 for `1.1.0-alpha.2`.
- [x] `npm --prefix apps/diskscribe-2026-desktop audit --omit=dev --audit-level=high` reports zero production vulnerabilities. Verified May 25, 2026 for `1.1.0-alpha.2`.
- [x] `npm --prefix apps/diskscribe-2026-desktop audit --omit=optional` reports zero vulnerabilities. Verified May 25, 2026 after patched transitive tooling overrides.
- [x] `npm run package` produces Windows artifacts. Verified May 25, 2026 for `1.1.0-alpha.2` under Node `22.22.3`.
- [ ] `ALPHA_SMOKE_TEST.md` has been run against the packaged app.
- [x] `CHANGELOG.md` includes the current alpha changes. Updated for `1.1.0-alpha.2`.
- [x] `LEGAL.md` has been reviewed for new patch/export behavior. Engineering policy review recorded May 25, 2026.
- [x] Branch protection for `main` is restored. Verified May 25, 2026: active `Protect main` ruleset requires pull requests and `CI`, `Gitleaks`, `Dependency Review`, and `CodeQL` checks.
- [x] Installer checksums are generated locally. Verified May 25, 2026; attach `SHA256SUMS.txt` to the release.
- [x] Release notes clearly state alpha limitations. See `RELEASE_NOTES_1.1.0-alpha.2.md`.

## Alpha Limitations To Publish

- DiskScribe2026 does not include commercial game images, proprietary game data, or patched game images.
- Public sharing should use clean patch JSON, not modified images.
- Private translation projects may contain original source context and should remain private.
- Sega CD reinsertion is conservative and currently limited to in-place-safe entries.
- Known packed/no-go files such as `MESS.DAT` are blocked until their format is proven.
- The CLI patch command is source-tree tooling for repeatable local validation and patching.

## Verification Commands

```bash
npm test
npm run lint
npm --prefix apps/diskscribe-2026-desktop audit --omit=dev --audit-level=high
npm --prefix apps/diskscribe-2026-desktop audit --omit=optional
npm run package
npm run apply-clean-patch -- --help
```

## Expected Alpha Artifacts

- `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/DiskScribe2026DesktopSetup.exe`
- `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/RELEASES`
- SHA256 checksums for release artifacts
- Git tag such as `v1.1.0-alpha.2` or later

## Latest Local Verification

Verified on May 25, 2026 for `1.1.0-alpha.2`:

- `npm test`: 48 passing.
- `npm run lint`: passed.
- `npm --prefix apps/diskscribe-2026-desktop audit --omit=dev --audit-level=high`: zero production vulnerabilities.
- `npm --prefix apps/diskscribe-2026-desktop audit --omit=optional`: zero vulnerabilities after patched transitive tooling overrides.
- `npm run apply-clean-patch -- --help`: passed.
- `npm run package`: produced fresh Windows artifacts.
- Local `SHA256SUMS.txt`: generated.

Generated artifact sizes on May 25, 2026:

- `DiskScribe2026DesktopSetup.exe`: 134,169,600 bytes.
- `diskscribe2026-1.1.0-alpha2-full.nupkg`: 133,337,203 bytes.

Local SHA256 generated on May 25, 2026:

- `diskscribe2026-1.1.0-alpha2-full.nupkg`: `46dc82be1fa75a365e63d623739f555d309cc26343b11a3bcc799e7d7fe41cb0`
- `DiskScribe2026DesktopSetup.exe`: `423078f665957bc616adcbdd7b7a110a392138a9b4a922af3a11dc072924f31b`
- `RELEASES`: `705cd5a0a7eee202e6e666a05a3ed8eadd7fd946c0b991aed271f87031314139`

Non-interactive packaged-app checks performed May 25, 2026:

- The packaged executable remained running for an 8-second launch probe without an immediate crash.
- Packaged `resources/LICENSE` and `resources/LEGAL.md` exist and match the source documents.
- Interactive UI/media paths in `ALPHA_SMOKE_TEST.md` remain pending manual execution with lawful test media.
