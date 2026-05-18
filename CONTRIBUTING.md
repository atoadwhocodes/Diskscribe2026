# Contributing

## Prerequisites

- Node.js 22+
- npm 11+

## Local Development

```bash
npm run desktop:install
npm run desktop:start
```

Build distributables with:

```bash
npm run desktop:make
```

## Pull Requests

- Keep changes focused and scoped.
- Follow `DEVELOPMENT_RULES.md`.
- Update docs/changelog for behavior changes.
- Ensure CI passes (`npm test`, `desktop lint`, `desktop package`).
- Follow the standards in `CODE_OF_CONDUCT.md`.
