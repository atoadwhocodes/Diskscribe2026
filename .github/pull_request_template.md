## Summary

Describe what changed and why.

## What Changed

- [ ] UI/UX changes
- [ ] Renderer logic
- [ ] Main process / IPC
- [ ] Build / packaging / installer
- [ ] Docs / metadata

## Validation

- [ ] `npm run lint`
- [ ] `npm --prefix apps/diskscribe-2026-desktop run package`
- [ ] Manual desktop check (`npm run desktop:start`)

## Manual QA Checklist

- [ ] Open Disk button opens native picker
- [ ] Queue buttons (add/remove/clear/move/save/load/run/stop) behave as expected
- [ ] Jump/Copy/Extract actions show clear status feedback on success/failure
- [ ] Keyboard shortcuts still work (`Ctrl/Cmd+O`, `Ctrl/Cmd+Shift+O`, `Ctrl/Cmd+Enter`, `Esc`)
- [ ] Installer/package still launches and opens files correctly

## Risk Assessment

- Risk level: `low` / `medium` / `high`
- Primary risk area(s):
- Why this is safe:

## Rollback Plan

- Revert commit(s):
- Feature flag/guard (if applicable):
- User-visible fallback behavior:

## Follow-ups

- [ ] None
- [ ] Tracked in issue(s):
