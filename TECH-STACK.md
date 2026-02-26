# DiskScribe2026: Tech Stack & Dependencies

**Purpose:** Crystal-clear list of libraries, runtime versions, and deployment targets  
**Updated:** Feb 26, 2026

---

## 🏗️ Architecture Stack

```
┌─────────────────────────────────────────────────────────────┐
│                         USER (CLI/UI)                       │
├─────────────────────────────────────────────────────────────┤
│  diskscribe CLI (src/cli/)                                  │
│  ├─ commands: run, extract, translate, layout, patch       │
│  ├─ config management (API keys, cache)                    │
│  └─ progress + error reporting                             │
├─────────────────────────────────────────────────────────────┤
│                     PIPELINE (multiworker)                  │
│  ├─ extraction stage (containers → strings)                │
│  ├─ translation stage (strings → translations)             │
│  ├─ layout stage (reflowing + wrapping)                    │
│  └─ patch stage (building + file I/O)                      │
├─────────────────────────────────────────────────────────────┤
│                    PLUGIN SYSTEM (registry)                 │
│  ├─ Container plugins (FDI, ZIP, ISO, Folder)             │
│  ├─ Profile plugins (Alshark, Fantasy Ogre, etc.)         │
│  └─ Provider plugins (Claude, OpenAI, Local)              │
├─────────────────────────────────────────────────────────────┤
│                      CORE SERVICES                          │
│  ├─ String table (in-memory + JSON)                        │
│  ├─ Translation cache (SQLite)                             │
│  ├─ Project management (artifacts + state)                 │
│  ├─ Text wrapping engine (layout algorithm)                │
│  └─ Patcher (in-place, repoint, string bank)              │
├─────────────────────────────────────────────────────────────┤
│                    EXTERNAL INTEGRATIONS                    │
│  ├─ Claude API (Anthropic) [Phase 3]                      │
│  ├─ OpenAI API [Phase 3, optional]                        │
│  └─ xdelta3 / BPS (patch file generation)                 │
├─────────────────────────────────────────────────────────────┤
│                      DATA PERSISTENCE                       │
│  ├─ FileSystem: src/, src/containers/, src/profiles/      │
│  ├─ SQLite: ~/.diskscribe_cache/translations.db            │
│  ├─ JSON: project/input/, project/extracted/, etc.        │
│  └─ Config: ~/.diskscribe.json                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Dependencies by Phase

### **Phase 1 (MVP) - Core Dependencies**

```json
{
  "dependencies": {
    "Node.js": "20.x or 22.x [LTS]",
    "TypeScript": "5.x",
    "better-sqlite3": "^11.x",
    "shift_jis": "^1.2.x"
  },
  "devDependencies": {
    "jest": "^29.x",
    "ts-jest": "^29.x",
    "@types/node": "^20.x",
    "eslint": "^8.x"
  }
}
```

**Size impact:** ~50MB node_modules (after npm ci)

### **Phase 2 (Universal Containers) - New Dependencies**

```json
{
  "dependencies": {
    "jszip": "^3.x",        // ZIP container
    "isojs": "^2.x",        // ISO9660 parser
    "": ""
  }
}
```

**Why not use 7z/RAR?** Avoid system binaries; pure JS libraries preferred for portability.

### **Phase 3 (Claude Provider) - New Dependencies**

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^1.x",
    "md5": "^2.x"           // For prompt hashing (or use crypto module)
  }
}
```

**API pricing model:** Stored in code (version-checked)

### **Phase 4-6 (Advanced) - Conditional Dependencies**

```json
{
  "optionalDependencies": {
    "xdelta3": "^3.1.x",    // Patch generation [Phase 4]
    "fontkit": "^2.x",      // Font metrics [Phase 5]
    "bps-node": "^1.x"      // BPS patch format [Phase 4]
  }
}
```

---

## 🔗 Runtime Requirements

### **Node.js**

**Minimum:** Node 14.x  
**Recommended:** Node 20.x LTS  
**Why:** Better ES2020+ support, native crypto module, faster SQLite bindings

**Install:**
```bash
# macOS
brew install node@20

# Windows
choco install nodejs --version=20.x  # or download from nodejs.org

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```

### **System Libraries**

| Library | Used for | Status | Fallback |
|---------|----------|--------|----------|
| **sqlite3** | Database backend | Required (via better-sqlite3) | Bundled by npm |
| **xdelta3** | Patch generation | Optional (Phase 4) | Generate raw diff |
| **iconv** | Charset conversion | Optional | Use native UTF-8 |

**Platform-specific notes:**
- **macOS:** Works out of the box
- **Windows:** Requires build tools (npm install --build-from-source). Use pre-built binaries if available.
- **Linux:** Install build-essential: `sudo apt install build-essential python3`

---

## 🔐 Configuration & Environment

### **Environment Variables**

```bash
# API Keys
export ANTHROPIC_API_KEY="sk-ant-v1-xxxxx..."
export OPENAI_API_KEY="sk-..."  # Optional, Phase 3

# Optional: override cache location
export DISKSCRIBE_CACHE_DIR="/path/to/cache"

# Optional: offline mode (no API calls)
export DISKSCRIBE_MODE="offline"
```

**Security:** Never commit keys to git. Use:
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="..." 
```

Or use config file:
```bash
# ~/.diskscribe.json (chmod 600, .gitignore'd)
{
  "claude_api_key": "sk-ant-v1-xxxxx...",
  "cache_dir": "~/.diskscribe_cache",
  "default_provider": "mock"  // or "claude"
}
```

### **.diskscribe.json Schema**

```json
{
  "claude_api_key": "sk-ant-v1-xxxxx...",
  "openai_api_key": "sk-...",
  "cache_dir": "~/.diskscribe_cache",
  "max_tokens_per_month": 1000000,
  "default_provider": "mock",
  "default_style": "natural",
  "log_level": "info"
}
```

---

## 📁 Project Structure (Post-Phase-1)

```
diskscribe/
├── src/
│   ├── core/                          # Core data models
│   │   ├── container_manifest.ts
│   │   ├── string_table.ts
│   │   ├── translation_table.ts
│   │   ├── layout_table.ts
│   │   ├── project.ts
│   │   └── __tests__/
│   │
│   ├── containers/                    # Container plugins
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   ├── pc98_fdi.ts                # Phase 1
│   │   ├── pc88_d88.ts                # Phase 2
│   │   ├── zip.ts                     # Phase 2
│   │   ├── iso9660.ts                 # Phase 2
│   │   ├── folder.ts                  # Phase 2
│   │   └── __tests__/
│   │
│   ├── profiles/                      # Game profiles
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   ├── alshark.ts                 # Phase 1
│   │   ├── fantasy_ogre.ts            # Phase 2
│   │   ├── rance.ts                   # Phase 2
│   │   ├── generic_pc98.ts            # Phase 1
│   │   └── __tests__/
│   │
│   ├── translate/                     # Translation providers
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   ├── mock_provider.ts           # Phase 1
│   │   ├── claude_provider.ts         # Phase 3
│   │   ├── openai_provider.ts         # Phase 3 (optional)
│   │   ├── cache.ts                   # Phase 3
│   │   ├── costs.ts                   # Phase 3
│   │   ├── prompts.ts                 # Phase 3
│   │   └── __tests__/
│   │
│   ├── layout/                        # Text wrapping
│   │   ├── wrap_engine.ts             # Phase 1
│   │   ├── font_metrics.ts            # Phase 5
│   │   ├── rulesets/
│   │   │   ├── english.ts
│   │   │   └── japanese.ts
│   │   └── __tests__/
│   │
│   ├── patch/                         # Patching engine
│   │   ├── patcher_base.ts
│   │   ├── patcher_inplace.ts         # Phase 1
│   │   ├── patcher_repoint.ts         # Phase 4
│   │   ├── allocator.ts               # Phase 4
│   │   ├── pointer.ts                 # Phase 4
│   │   └── __tests__/
│   │
│   ├── pipeline/                      # Main pipeline stages
│   │   ├── extract_stage.ts           # Phase 1
│   │   ├── translate_stage.ts         # Phase 1
│   │   ├── layout_stage.ts            # Phase 1
│   │   ├── patch_stage.ts             # Phase 1
│   │   └── __tests__/
│   │
│   ├── cli/                          # CLI interface
│   │   ├── main.ts
│   │   ├── config.ts                 # Phase 3
│   │   ├── commands/
│   │   │   ├── run.ts                # Phase 1
│   │   │   ├── extract.ts            # Phase 2
│   │   │   ├── translate.ts          # Phase 3
│   │   │   ├── layout.ts             # Phase 2
│   │   │   ├── patch.ts              # Phase 2
│   │   │   ├── config.ts             # Phase 3
│   │   │   ├── profile.ts            # Phase 6
│   │   │   └── scan.ts               # Phase 6
│   │   └── __tests__/
│   │
│   └── index.ts                      # Main entry point

├── schemas/                             # JSON schemas
│   ├── profile.schema.json
│   ├── project.schema.json
│   ├── strings.schema.json
│   └── patch_report.schema.json

├── tests/
│   ├── integration/
│   │   ├── alshark_end_to_end.test.ts
│   │   ├── claude_provider.test.ts
│   │   └── multi_container.test.ts
│   └── fixtures/                       # Test data
│       └── alshark_sample.fdi

├── docs/
│   ├── ROADMAP-DETAILED.md
│   ├── SCHEMAS.md
│   ├── CLAUDE-PROVIDER-SPEC.md
│   ├── IMPLEMENTATION-BLUEPRINT.md
│   ├── TECH-STACK.md                  # This file
│   └── API.md

├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.json
├── .gitignore
└── README.md
```

---

## 🧪 Testing Strategy

### **Unit Tests** (each module)
```bash
npm test -- src/core/__tests__/
npm test -- src/translate/__tests__/
```

**Coverage targets:** 80%+ per module

### **Integration Tests** (pipeline)
```bash
npm test -- tests/integration/
```

**Key scenarios:**
- Extract Alshark.FDI → get 2500+ strings ✓
- Mock-translate → wrap → patch → rebuild ✓
- Rerun with cache → 50%+ faster ✓
- Claude API call → cache + reuse ✓

### **Acceptance Tests** (end-to-end)
```bash
diskscribe run tests/fixtures/alshark_sample.fdi --output test_project/
# Verify: project.json exists, strings > 0, output disk valid
```

---

## 📊 Build Pipeline

### **Development**
```bash
npm install                  # Install deps
npm run dev                  # Watch mode (tsc -w)
npm test                     # Run jest
npm run build               # tsc --outDir dist/
```

### **CI/CD** (GitHub Actions example)

```yaml
name: Test & Build

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - run: npm run build
      
      - name: Upload coverage
        if: matrix.node-version == '20.x'
        uses: codecov/codecov-action@v3
```

---

## 🚀 Deployment / Distribution

### **As CLI Tool (npm registry)**
```bash
npm publish                       # Publish to npm
# Then users: npm install -g diskscribe2026
# Run: diskscribe run input.fdi
```

### **As Electron App** (current setup)
```bash
cd apps/diskscribe-2026-desktop
npm run make                      # Build installers
# Output: out/make/
#   ├── diskscribe-2026-setup.exe
#   ├── diskscribe-2026.app
#   └── diskscribe-2026.deb
```

### **As Docker Image**
```dockerfile
FROM node:20-alpine

RUN npm install -g diskscribe2026

ENTRYPOINT ["diskscribe"]
CMD ["run"]
```

**Run:**
```bash
docker run -v /games:/games diskscribe2026 run /games/alshark.fdi
```

---

## 📈 Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Extract (2500 strings) | < 10s | File I/O primarily |
| Mock translate (2500) | < 5s | Local glossary lookup |
| Claude translate (2500) | 2-3 min | API + batching, first run |
| Claude rerun (cached) | < 30s | 80%+ cache hits |
| Text wrapping | < 5s | Linear time, one-pass |
| In-place patching | < 5s | Byte replacement |
| Full pipeline (no cache) | < 6 min | Sum of above |
| Full pipeline (cached) | < 1 min | Mostly cache lookups |

---

## 🔄 Dependency Updates

**Cadence:** Monthly  
**Policy:**
- Patch version (1.2.3 → 1.2.4): auto-update
- Minor version (1.2.3 → 1.3.0): review, test
- Major version (1.2.3 → 2.0.0): deliberate decision
- Security patches: immediate

**Tools:**
```bash
npm outdated                  # Check updates
npm update                    # Patch + minor
npm audit                     # Security check
npm audit fix                 # Auto-fix vulns
```

---

## 🎓 Development Environment Setup

### **First-time Setup** (macOS/Linux)

```bash
# Prerequisites
brew install node@20
brew install sqlite3

# Clone and install
git clone https://github.com/yourusername/diskscribe2026.git
cd diskscribe2026

npm install
npm run build
npm test

# Create ~/.diskscribe.json with your API key
cat > ~/.diskscribe.json << EOF
{
  "claude_api_key": "sk-ant-v1-YOUR-KEY",
  "default_provider": "mock"
}
EOF

# Try it
npm run cli -- run --help
```

### **Windows Setup**

Same, but:
1. Install Node from nodejs.org (includes npm)
2. Install sqlite3 via `choco install sqlite`
3. Run from PowerShell (or use WSL2)

### **Docker Dev Environment**

```dockerfile
FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y \
    sqlite3 \
    build-essential \
    python3

COPY package*.json ./
RUN npm ci

CMD ["bash"]
```

**Usage:**
```bash
docker build -t diskscribe-dev .
docker run -it -v $(pwd):/app diskscribe-dev
npm test
```

---

## 📚 Documentation References

- **Node.js:** https://nodejs.org/docs/
- **TypeScript:** https://www.typescriptlang.org/docs/
- **SQLite:** https://www.sqlite.org/
- **Claude API:** https://docs.anthropic.com/
- **Electron:** https://www.electronjs.org/docs (for desktop app)

---

## ⚠️ Known Issues & Workarounds

### **Issue: `npm install` fails on Windows**
**Cause:** Missing build tools  
**Fix:** Install Visual Studio Build Tools or use:
```bash
npm install --build-from-source windows-build-tools
```

### **Issue: SQLite can't find library**
**Cause:** better-sqlite3 native binding not compiled  
**Fix:**
```bash
npm rebuild better-sqlite3
# or
rm -rf node_modules package-lock.json
npm ci
```

### **Issue: Tests timeout when calling Claude API**
**Cause:** Real API calls are slow  
**Fix:** Use mock provider for tests, or set timeout:
```bash
npm test -- --testTimeout=30000
```

---

## 🔐 Security Checklist

Before phase 1 release:

- [ ] Never log API keys
- [ ] Config file permissions: `chmod 600 ~/.diskscribe.json`
- [ ] No secrets in git (add to .gitignore)
- [ ] Validate all user inputs (prevent prompt injection)
- [ ] SQLite parameterized queries (prevent SQL injection)
- [ ] HTTPS only for external APIs
- [ ] Rate limiting + backoff implemented
- [ ] Error messages don't expose system paths
- [ ] Dependency audit: `npm audit`

---

**This document is version 1.0 and will be updated as dependencies evolve.**

