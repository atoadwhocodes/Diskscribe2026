# Contributing

## Prerequisites

- Node.js 22+
- npm 11+

## Local Development

```bash
npm run doctor
npm run desktop:install
npm run desktop:start
```

Build distributables with:

```bash
npm run desktop:make
```

## Pull Requests

- Keep changes focused and scoped.
- Update docs/changelog for behavior changes.
- Ensure CI passes (`check:versions`, `desktop lint`, `check:ui-wiring`, `desktop package`).
- Follow the standards in `CODE_OF_CONDUCT.md`.
