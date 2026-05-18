# DiskScribe2026 Development Rules

These rules apply to human contributors and coding assistants.

## Test Integrity

1. Do not remove, skip, or weaken tests to make a build pass.
2. `npm test` must run the guarded desktop test suite and must report at least 29 tests.
3. If the expected test count legitimately changes, update `apps/diskscribe-2026-desktop/scripts/run-tests-with-guard.js` usage or `TEST_MIN_COUNT` with a matching explanation in the change.
4. Placeholder tests that do not assert behavior are not acceptable.

## Supported Formats

1. Do not advertise a file format in the UI, README, or release notes unless the app can open it through the normal workflow.
2. Direct raw `.bin` opening is not currently supported. Sega CD `.bin` files are supported only as companion tracks referenced by a `.cue` sheet.
3. Standalone `.iso` support means standard 2048-byte sector ISO9660 images.
4. Raw 2352-byte data-track `.bin` support must be implemented as a separate feature with content sniffing, tests, and clear user-facing warnings.

## Legal Boundaries

1. Do not commit proprietary disk images, patched game images, extracted proprietary assets, original game text databases, or source byte dumps.
2. The app must process user-supplied media locally.
3. Public release workflows should produce clean patches, not complete game images.
4. Clean patch exports must not include original source text or original source byte blobs.
5. Private translation project files may contain source context and must be treated as internal work files.

## Extraction and Patching

1. Inspection and extraction features should be read-only unless the user explicitly invokes a patch/export workflow.
2. Patch generation must preserve source verification through hashes, byte lengths, offsets, or equivalent non-reversible checks.
3. Patched output is for local user-owned media workflows and should not be described as a public distribution artifact.

## Tooling Discipline

1. Keep automated edits scoped to the requested files or feature.
2. Do not introduce unused plugin/registry architecture unless it is wired into the app and covered by tests.
3. Do not leave placeholder comments such as "for now", "dummy", or "Copilot fix" in production code.
4. Before handoff, run `npm test` from the repository root or `apps/diskscribe-2026-desktop`.

