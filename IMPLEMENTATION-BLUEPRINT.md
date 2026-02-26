# DiskScribe2026: Implementation Blueprint Summary

**Generated:** Feb 26, 2026  
**Scope:** Complete specification from Phase 1 MVP through Phase 3 Claude Integration

---

## 📚 Documents Created

### 1. **ROADMAP-DETAILED.md** (22+ Tickets, 2-4 weeks MVP)
Comprehensive Phase 1-7 roadmap with **individual ticket specs**:
- **Phase 1.1-1.8:** Core data model (ContainerManifest, StringTable, TranslationTable) + MVP plugins
- **Phase 2-7:** Universal containers, Claude, repointing, fonts, profile kit, polish

✅ **What's in there:**
- TICKET 1.1.1: ContainerManifest (200 LOC spec + API example)
- TICKET 1.1.2: StringTable (300 LOC + filtering/stats)
- TICKET 1.1.3: TranslationTable (200 LOC + quality reporting)
- TICKET 1.1.4: Project Structure (300 LOC + folder layout)
- TICKET 1.2.1: Container Plugin Interface (200 LOC base)
- TICKET 1.2.2: PC-98 FDI Plugin (500 LOC spec + FDI parser)
- TICKET 1.3.1: Game Profile Interface (200 LOC base)
- TICKET 1.3.2: Alshark Profile (400-600 LOC + control code handling)
- TICKET 1.4.1: Provider Interface & Cache (200 + 300 LOC)
- TICKET 1.4.2: Mock Provider (100 LOC for testing)
- TICKET 1.5.1: Text Reflow Engine (300-400 LOC wrap algorithm)
- TICKET 1.5.2: Layout Pipeline (150 LOC integration)
- TICKET 1.6.1: In-Place Patcher (400 LOC + encoding logic)
- TICKET 1.6.2: Patch Pipeline (150 LOC integration)
- TICKET 1.7.1: CLI `diskscribe run` command (200 LOC)
- TICKET 1.8.1: Project Load/Save (full cycle)
- Plus Phases 2-7 summaries (all with acceptance criteria)

### 2. **SCHEMAS.md** (5 JSON Schemas)
Production-ready JSON schemas for all data artifacts:
- **GameProfile Schema** (profile.schema.json) - how plugins describe games
- **ProjectIndex Schema** (project.schema.json) - project metadata
- **StringTable Schema** (strings.schema.json) - extracted text + translations
- **LayoutResult Schema** (layout.schema.json) - wrapping results
- **PatchReport Schema** (patch_report.schema.json) - patching results

✅ **What's included:**
- Full JSON Schema Draft 7 specs with descriptions
- Example: Alshark profile with all config sections
- Example: Complete project.json artifact
- Validation guidance + CLI tools

### 3. **CLAUDE-PROVIDER-SPEC.md** (Phase 3 Implementation)
Complete Claude integration spec with production-ready code:

✅ **Provider Class (1000 LOC spec):**
- `ClaudeProvider` with `translate()` batching
- Prompt engineering (system prompt + few-shot)
- Caching layer (SQLite, deterministic hashing)
- Cost tracking (token counting + USD estimates)
- Rate limiting (420 RPM, 40K tokens/min)
- Error recovery + retry logic

✅ **Prompt Engineering:**
- System prompt for game-specific translation
- 3 style templates: natural, literal, literary
- Game context injectors: dialog, menu, battle, description
- Few-shot examples for each style

✅ **Caching Strategy:**
- SQLite cache with `get()`, `put()`, `cleanup_old_entries()`
- Deterministic prompt hashing (SHA256)
- Cache statistics + efficiency tracking
- Automatic garbage collection (90+ days)

✅ **Cost Tracking:**
- Claude 3.5 Sonnet pricing (Feb 2026):
  - Input: $3/1M tokens
  - Output: $15/1M tokens
  - Cache read: $0.30/1M (90% off!)
  - Cache creation: $3.75/1M (25% premium)
- Cost projections: $0.27 first run, $0.15 cached, $1.35-2.00 for 5 games
- Monthly budgets: $50-100 (solo), $300-500 (studio)

✅ **Config Management:**
- API key from env vars, config file, or parameter
- `diskscribe config set-key <key>`
- `diskscribe config show`
- `diskscribe config reset`

✅ **Tests & Acceptance:**
- Unit test specs (caching, batching, costs)
- Integration test scenarios
- Deliverables checklist
- Success metrics (2500 strings in < 3min, 80% cache hits)

---

## 🎯 How to Use These Documents

### **Starting Phase 1 (This Week)**

1. **Read ROADMAP-DETAILED.md Section "Phase 1"** (15 min)
   - Understand the 8 sub-phases
   - Review TICKET 1.1.1 (ContainerManifest)

2. **Create GitHub Issues** from tickets:
   ```bash
   # Example:
   - [PHASE 1.1.1] Define ContainerManifest · 3 days · High
   - [PHASE 1.1.2] Define StringTable · 3 days · High
   - [PHASE 1.1.3] Define TranslationTable · 2 days · High
   - ...
   ```

3. **Start with TICKET 1.1.1:**
   - Copy spec from ROADMAP-DETAILED.md
   - Implement 200 LOC ContainerManifest
   - Write unit tests (JSON roundtrip)
   - Commit: ✅ 1.1.1 complete

4. **Week 1 Cadence:**
   - Mon-Wed: 1.1.1, 1.1.2, 1.1.3, 1.1.4
   - Wed-Fri: 1.2.1, 1.2.2 (PC-98 FDI plugin)
   - Report: "Core data model + container plugin working, can extract from FDI"

### **Designing Profiles (Week 2-3)**

1. **Reference SCHEMAS.md → GameProfile Schema**
   - Understand field layout
   - See Alshark example

2. **Implement TICKET 1.3.2 (Alshark Profile)**
   - Copy spec from ROADMAP-DETAILED.md (400-600 LOC)
   - Use SCHEMAS.md example as config template
   - Implement extraction logic (pointer table parsing)

3. **Test against real Alshark.EXE**
   - Extract 2500+ strings
   - Verify counts match known data

### **Phase 3 (Weeks 10-11: Claude)**

1. **Read CLAUDE-PROVIDER-SPEC.md** (30 min)
   - Review ClaudeProvider class structure
   - Understand caching strategy
   - Check cost projections

2. **Implement Phase 3.1 tickets:**
   ```
   - 3.1.1: ClaudeProvider class (1000 LOC from spec)
   - 3.1.2: Prompt engineering (few-shot templates)
   - 3.1.3: Batch API + rate limiting
   - 3.1.4: Cache layer (SQLite)
   - 3.1.5: Cost tracking + reporting
   - 3.1.6: Config + API key management
   ```

3. **Test end-to-end:**
   ```bash
   diskscribe config set-key sk-ant-v1-xxxxx
   diskscribe translate alshark_project --provider claude
   # Should show: "Translating 2547 strings... 1247 from cache (49%), 1300 from API"
   # Cost: $0.27
   ```

---

## 📊 Effort Breakdown

| Phase | Duration | Effort | Status |
|-------|----------|--------|--------|
| Phase 1 MVP | 2-4 weeks | 10-15 eng-days | **Ready to start** |
| Phase 2 Containers | 3-6 weeks | 8-12 eng-days | Specs in ROADMAP |
| Phase 3 Claude | 1-2 weeks | 5-8 eng-days | **Full spec in CLAUDE-PROVIDER-SPEC.md** |
| Phase 4 Repointing | 4-8 weeks | 16-24 eng-days | Outlined in ROADMAP |
| Phase 5 Fonts | 4-10 weeks | 12-20 eng-days | Outlined in ROADMAP |
| Phase 6 Profile Kit | 4-6 weeks | 10-15 eng-days | Outlined in ROADMAP |
| Phase 7 UX Polish | ongoing | 6-10 eng-days/phase | Outlined in ROADMAP |

**Total: ~6 months for full system (1 full-time engineer)**

---

## 🔑 Key Design Decisions Baked In

### 1. **Plugin Architecture**
- Containers (FDI, ZIP, ISO, Folder) are plugins → any format supported
- Profiles (games) are plugins → community can add without touching engine
- Providers (Claude, OpenAI, local) are plugins → provider-agnostic

### 2. **Immutable Originals**
- Input files **never mutated**
- Always copy to workdir
- Output is patch file + optional rebuilt image

### 3. **Reproducible Runs**
- Every run produces `project.json` with full state
- Cache + hashing ensures reruns are identical
- No side effects or randomness

### 4. **Cost Transparency**
- All costs estimated + reported to user
- BYO API key supported (no vendor lock-in)
- Optional caching reduces costs 40-50% on reruns

### 5. **Separation of Concerns**
- Extraction ≠ Translation ≠ Layout ≠ Patching
- Each stage is independent, composable
- Can run partial pipelines (extract-only, layout-only, etc.)

---

## 🚀 Quick Start: Phase 1 First Ticket

### TICKET 1.1.1: ContainerManifest Implementation

**Duration:** 3 days  
**Files to create:** `src/core/container_manifest.ts`  
**Tests:** `src/core/__tests__/container_manifest.test.ts`

**Step-by-step:**

```bash
# 1. Create file with full spec from ROADMAP-DETAILED.md section 1.1.1
touch src/core/container_manifest.ts

# 2. Implement interfaces + class:
cat > src/core/container_manifest.ts << 'EOF'
// Copy full spec from ROADMAP-DETAILED.md lines ~200-350
// Include:
// - ContainerManifest interface
// - Volume interface
// - FileEntry interface
// - ExtractionMethod interface
EOF

# 3. Add to registry/exports
echo "export { ContainerManifest, ... } from './container_manifest';" >> src/core/index.ts

# 4. Write tests
cat > src/core/__tests__/container_manifest.test.ts << 'EOF'
import { ContainerManifest } from "../container_manifest";

describe("ContainerManifest", () => {
  it("should serialize/deserialize JSON", () => {
    const manifest: ContainerManifest = {
      container_id: "test-123",
      container_type: "pc98_fdi",
      source_path: "/path/to/game.fdi",
      // ... other required fields
    };
    
    const json = JSON.stringify(manifest);
    const restored = JSON.parse(json);
    
    expect(restored.container_id).toBe("test-123");
  });
});
EOF

# 5. Run tests
npm test -- container_manifest.test.ts

# 6. Commit
git add src/core/container_manifest.ts src/core/__tests__/container_manifest.test.ts
git commit -m "✅ [PHASE 1.1.1] Implement ContainerManifest interface

- ContainerManifest: represents input media package
- Volume, FileEntry, ExtractionMethod structures
- JSON serialization tested"
```

**Definition of Done for 1.1.1:**
- [ ] ContainerManifest interface defined with all fields
- [ ] TypeScript compiles without errors
- [ ] JSON roundtrip test passes
- [ ] Exported from `src/core/index.ts`
- [ ] Commit message references ticket

---

## 📞 Reference Quick Links

Within these documents:

- **DID NOT START YET?** → Read ROADMAP-DETAILED.md "Phase 1 Definition of Done" (bottom)
- **Building profiles?** → See SCHEMAS.md "GameProfile Schema" + Alshark example
- **Integrating Claude?** → Start with CLAUDE-PROVIDER-SPEC.md section 2
- **Stuck on patching?** → ROADMAP-DETAILED.md section 1.6 (In-Place Patcher)
- **Cost concerns?** → CLAUDE-PROVIDER-SPEC.md section 5 (Budget Projections)

---

## ✅ Acceptance Criteria: "Ready for Phase 1"

By end of Phase 1 (4 weeks), these statements are **all true:**

- [x] "I can extract text from Alshark.EXE and get ~2500 strings"
- [x] "I can mock-translate those strings and see them in a preview"
- [x] "I can reflow text to fit 16×3 textboxes"
- [x] "I can patch the disk in-place and the disk still boots"
- [x] "Running the process twice gives identical output (deterministic)"
- [x] "All artifacts are in `project/` folder with project.json"
- [x] "No input files were modified"
- [x] "CLI `diskscribe run alshark.fdi --output project/` works end-to-end"

---

## 🎓 Learning Path

If this is your first time reading:

1. **10 min:** Read this file (you are here)
2. **15 min:** Skim ROADMAP-DETAILED.md → "Phase 1 Overview"
3. **20 min:** Read SCHEMAS.md → "GameProfile Schema" + Alshark example
4. **30 min:** Read CLAUDE-PROVIDER-SPEC.md → Sections 0-1, 2.1, 5
5. **5 min:** Decide: Start Phase 1 today or plan for later?

If starting today:
6. **Create GitHub issues** from ROADMAP-DETAILED.md Phase 1
7. **Start TICKET 1.1.1** (copy spec, implement 200 LOC)
8. **Report back in 3 days:** "ContainerManifest working, ready for 1.1.2"

---

## 🔧 Customization Points

These specs assume:
- **Language:** TypeScript (Node.js runtime)
- **DB:** SQLite (SQLite 3 with better-sqlite3)
- **API:** Claude 3.5 Sonnet (Anthropic)
- **Target:** PC-98/88 primarily, extensible to others

If you need:
- **Python instead of TS:** Port specs, logic is identical
- **PostgreSQL instead of SQLite:** Change cache.ts DB layer (interface stays same)
- **OpenAI instead of Claude:** Implement OpenAIProvider matching ITranslationProvider
- **Unity/Unreal games:** Add plugin for binary extraction, reuses rest of pipeline

---

## 📝 Notes for Your Team

If distributing these specs:

1. **Share the 3 documents**, not this summary
2. **ROADMAP-DETAILED.md** → Developers implementing Phase 1-2
3. **SCHEMAS.md** → Data modelers, database designers
4. **CLAUDE-PROVIDER-SPEC.md** → Whoever builds Phase 3

For **metrics/roadmap meetings**, reference:
- Phase breakdown (6 months total)
- Effort table (10-15 eng-days per phase)
- Timeline (start date → Phase 1 done in 4 weeks)

---

**Next:** Pick a start date, create GitHub issues, and report back after TICKET 1.1.1. 🚀

