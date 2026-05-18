# DiskScribe2026 Alpha Smoke Test

Status: draft checklist for `1.1.0-alpha.1` and later alpha builds.

Run this checklist before tagging an alpha release. Do not use or publish proprietary disk images as test artifacts.

## 1. Build Artifacts

1. Run `npm test`.
2. Run `npm run lint`.
3. Run `npm audit --omit=optional` from `apps/diskscribe-2026-desktop`.
4. Run `npm run package`.
5. Confirm these files exist:
   - `apps/diskscribe-2026-desktop/out/DiskScribe2026 Desktop-win32-x64/DiskScribe2026Desktop.exe`
   - `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/DiskScribe2026DesktopSetup.exe`
   - `apps/diskscribe-2026-desktop/out/make/squirrel.windows/x64/RELEASES`

## 2. Packaged App Launch

1. Launch `apps/diskscribe-2026-desktop/out/DiskScribe2026 Desktop-win32-x64/DiskScribe2026Desktop.exe`.
2. Confirm the main window opens without a crash.
3. Confirm the status bar asks for a supported image.
4. Confirm the Translation panel shows `Clean Patch`, `Validate Patch`, and `Apply Patch`.

## 3. PC-98 Smoke Path

1. Open a small lawful PC-98 test image, preferably a disposable fixture or personal test disk.
2. Confirm format, size, sector size, and filesystem panels populate.
3. Toggle disk/raw view.
4. Select bytes in the hex view and confirm decoded text preview updates.
5. Save one translation entry as `reviewed`.
6. Export a private translation project.
7. Export a clean patch and confirm it contains no `sourceText` or `sourceBytesBase64`.

## 4. Sega CD / ISO Smoke Path

1. Open a lawful Sega CD `.cue` with companion `.bin`, or a standard `.iso`.
2. Confirm ISO9660 file listing appears.
3. Extract one small file to a temporary folder.
4. Run translation discovery on selected files or folder.
5. Confirm entries include source file context where available.
6. Confirm direct clean patch export blocks known no-go files such as `MESS.DAT`.
7. Confirm entries with Sega CD control prefixes/tokens are blocked if translation text omits those controls.

## 5. Clean Patch Validation

1. Use `Validate Patch`.
2. Select a clean patch JSON.
3. Select matching source image files.
4. Confirm no patched output folder is requested.
5. Confirm the patch report panel shows verified, skipped, and warning counts.
6. Repeat with a wrong source image and confirm fingerprint mismatch or skipped reasons appear.

## 6. Clean Patch Application

1. Use `Apply Patch`.
2. Select the same clean patch JSON.
3. Select matching source image files.
4. Select a temporary output folder.
5. Confirm patched copies are written to the output folder.
6. Confirm `patch-report.json` is written.
7. Confirm skipped entries are visible in the UI report panel.
8. Confirm original source images were not modified.

## 7. CLI Smoke Path

1. Run:

   ```bash
   npm run apply-clean-patch -- --help
   ```

2. Validate without writing:

   ```bash
   npm run apply-clean-patch -- --dry-run --patch patch.json --source source.iso
   ```

3. Apply to a temporary output folder:

   ```bash
   npm run apply-clean-patch -- --patch patch.json --source source.iso --out patched-output
   ```

4. Confirm `patch-report.json` is created only for the apply path.

## 8. Pass Criteria

- No application crashes.
- No proprietary images or extracted proprietary source databases are added to git.
- Clean patch exports omit original source text and original source byte blobs.
- Validation can fail safely without writing patched output.
- Apply writes only to the selected output folder.
- Reports explain skipped entries clearly.
- `npm audit --omit=optional` reports zero vulnerabilities.
