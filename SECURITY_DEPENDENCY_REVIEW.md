# Alpha 2 dependency security and PR consolidation

## Audit evidence

The November 18â€“19, 2026 review used the npm advisory service against the desktop
lockfile, including development and packaging dependencies:

| Tree | Critical | High | Moderate | Affected packages |
| --- | ---: | ---: | ---: | ---: |
| main, 52b8eb0 | 4 | 40 | 9 | 53 |
| Original PR #47, a9463b1 | 4 | 40 | 7 | 51 |
| Compatible updates only | 0 | 23 | 2 | 25 |
| Consolidated security update | 0 | 0 | 0 | 0 |

These counts are affected packages, not the repository's GitHub alert count.
The baseline includes 107 distinct advisory URLs on main and 105 on original
PR #47. The reported 90 GitHub alerts could not be independently reconciled:
the connected tools do not expose Dependabot alerts, and local GitHub CLI
authentication is expired. Do not dismiss alerts based solely on this npm audit.
GitHub must rescan the default branch after an approved merge.

## Changes

- Upgrade Electron to 45.4.1, Forge packages to 8.0.1 and Fuses to 2.1.3,
  with the coordinated lockfile refresh that removes the remaining affected
  download, extraction and packaging dependencies.
- Refresh Express to 4.22.3, also covering the Express patch proposed by #46;
  qs and the other affected transitive dependencies resolve to patched versions.
- Require Node 22.13 or later within Node 22, matching Forge 8's minimum.
- Point the application entry at `.webpack/main/index.cjs`, as required by
  Forge 8's webpack output.
- Add a compatible TypeScript import resolver for package exports. Resolve
  runtime exports and remove the redundant `node_modules/*` TypeScript mapping
  that bypassed package exports. Import lint rules remain enabled.
- Consolidate the exact action pins proposed by PRs #36, #37, #39, #48 and #49.
- Audit the entire desktop dependency tree in CI and Windows release builds,
  with failures for low or higher advisories. The previous production-only
  audit excluded Electron and the packaging toolchain.
- Explicitly group security updates as well as version updates. Limit ordinary
  npm update PRs to three and Actions update PRs to one. These limits do not
  suppress security alerts or impose the same limits on security update PRs.
- Correct the existing version-group update types to `minor` and `patch`;
  the previous `version-update:semver-*` values are invalid inside a group.

Grouping semantics follow the
[GitHub Dependabot reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Validation

- Node 22.23.5; npm 11.6.0 on Windows x64.
- npm dependency installation: passed.
- Complete desktop npm audit: zero vulnerabilities.
- Core tests: 48 passed, zero failures or skipped tests.
- ESLint: passed with import checks enabled.
- Windows application package: passed. The packaged main entry exists and
  packaged LICENSE and LEGAL.md exactly match source.
- Windows Squirrel installer and full update package creation: passed.

The local build uses an isolated cache because this machine's ordinary Electron
cache path is not a directory. No repair or modification of that existing cache
was performed. Interactive packaged UI, PC-98, Sega CD and clean-patch smoke
checks remain unverified. Major runtime/toolchain upgrades require those checks
before a release tag; successful compilation does not replace them.

## Existing PR cleanup, after merge approval

1. Keep this work in the existing Alpha 2 PR #47. Do not create another update
   PR solely to duplicate these changes.
2. After #47 is approved, merged and the default branch has been rechecked,
   verify and close any still-open superseded update PRs:
   **#36, #37, #39, #46, #48, #49, #51, #55, #57, #58, #59, #60, #61, #62, #63**.
   The five Actions proposals are included exactly; the ten individual npm
   proposals are covered by the updated lockfile at their fixed or later
   versions.
3. Keep #45 for a separate decision. Its Forge, Fuses and Electron changes are
   superseded here, but it also proposes ESLint 10, TypeScript 6, CSS/style-loader
   and other tooling migrations. Do not merge its stale lockfile over this one.
4. Keep parked #64 unchanged. It is outside this work.

No PR closure, merge, tag, alert dismissal or change to #64 is authorized by
this document. Those actions require the user's decision.
