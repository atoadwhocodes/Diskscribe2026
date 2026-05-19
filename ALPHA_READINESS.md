# DiskScribe2026 Alpha Readiness Checklist

Use this checklist to decide whether a build is ready to tag as an alpha.

## Current Target

- Target version: `1.1.0-alpha.2`
- Current release posture: standalone desktop alpha
- Public distribution format: installer plus checksums
- Public translation distribution format: clean patch JSON only

## Required Before Tagging

- [x] `npm test` passes. Verified May 18, 2026 for `1.1.0-alpha.2`: 41 tests passing.
- [x] `npm run lint` passes. Verified May 18, 2026 for `1.1.0-alpha.2`.
- [x] `npm audit --omit=optional` reports zero vulnerabilities. Verified May 18, 2026 for `1.1.0-alpha.2`.
- [x] `npm run package` produces Windows artifacts. Verified May 18, 2026 for `1.1.0-alpha.2`.
- [ ] `ALPHA_SMOKE_TEST.md` has been run against the packaged app.
- [x] `CHANGELOG.md` includes the current alpha changes. Updated for `1.1.0-alpha.2`.
- [ ] `LEGAL.md` has been reviewed for any new patch/export behavior.
- [ ] Branch protection for `main` is restored unless direct-push development is still intentionally open.
- [x] Installer checksums are generated locally. Attach `SHA256SUMS.txt` to the release.
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

Verified on May 18, 2026 for `1.1.0-alpha.2`:

- `npm test`: 41 passing.
- `npm run lint`: passed.
- `npm --prefix apps/diskscribe-2026-desktop audit --omit=optional`: zero vulnerabilities.
- `npm run apply-clean-patch -- --help`: passed.
- `npm run package`: produced fresh Windows artifacts.
- Local `SHA256SUMS.txt`: generated.

Generated artifact sizes:

- `DiskScribe2026DesktopSetup.exe`: 134,165,504 bytes.
- `diskscribe2026-1.1.0-alpha2-full.nupkg`: 133,332,545 bytes.
- Unpacked `DiskScribe2026Desktop.exe`: 213,942,272 bytes.

Local SHA256:

- `diskscribe2026-1.1.0-alpha2-full.nupkg`: `57ae508dd2c840c400af95240746aed28ed67f10a5312423c83314fe3a7f7f3d`
- `DiskScribe2026DesktopSetup.exe`: `9620b96c6ed7f6b8bf89846802bee7536ccdb9adbac402a2f6c96305ae88084f`
- `RELEASES`: `f3718582ecc6d051410bc2842c90b1065017dafae1dfe0c213fcf3631bc268c7`

Note: Electron Forge completed successfully but emitted a Node deprecation warning from dependency code: `DEP0187 Passing invalid argument types to fs.existsSync is deprecated`.
