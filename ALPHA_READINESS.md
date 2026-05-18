# DiskScribe2026 Alpha Readiness Checklist

Use this checklist to decide whether a build is ready to tag as an alpha.

## Current Target

- Target version: `1.1.0-alpha.1`
- Current release posture: standalone desktop alpha
- Public distribution format: installer plus checksums
- Public translation distribution format: clean patch JSON only

## Required Before Tagging

- [x] `npm test` passes. Verified May 18, 2026: 41 tests passing.
- [x] `npm run lint` passes. Verified May 18, 2026.
- [x] `npm audit --omit=optional` reports zero vulnerabilities. Verified May 18, 2026.
- [x] `npm run package` produces Windows artifacts. Verified May 18, 2026.
- [ ] `ALPHA_SMOKE_TEST.md` has been run against the packaged app.
- [ ] `CHANGELOG.md` includes the current alpha changes.
- [ ] `LEGAL.md` has been reviewed for any new patch/export behavior.
- [ ] Branch protection for `main` is restored unless direct-push development is still intentionally open.
- [ ] Installer checksums are generated and attached to the release.
- [ ] Release notes clearly state alpha limitations.

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
npm --prefix apps/diskscribe-2026-desktop audit --omit=optional
npm run package
npm run apply-clean-patch -- --help
```

## Expected Alpha Artifacts

- `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/DiskScribe2026DesktopSetup.exe`
- `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/RELEASES`
- SHA256 checksums for release artifacts
- Git tag such as `v1.1.0-alpha.1` or later

## Latest Local Verification

Verified on May 18, 2026:

- `npm test`: 41 passing.
- `npm run lint`: passed.
- `npm --prefix apps/diskscribe-2026-desktop audit --omit=optional`: zero vulnerabilities.
- `npm run apply-clean-patch -- --help`: passed.
- `npm run package`: produced fresh Windows artifacts.

Generated artifact sizes:

- `DiskScribe2026DesktopSetup.exe`: 134,164,480 bytes.
- `diskscribe2026-1.1.0-alpha1-full.nupkg`: 133,331,835 bytes.
- Unpacked `DiskScribe2026Desktop.exe`: 213,942,272 bytes.

Note: Electron Forge completed successfully but emitted a Node deprecation warning from dependency code: `DEP0187 Passing invalid argument types to fs.existsSync is deprecated`.
