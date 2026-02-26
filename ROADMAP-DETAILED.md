# DiskScribe2026 Detailed Roadmap & Tickets

**Last Updated:** Feb 26, 2026  
**North Star:** Universal media translation → patch/rebuild utility (PC-98/88+)  
**Approach:** Plugin architecture with separable components (extract, translate, layout, patch)

---

## 📋 Executive Summary

```
Phase 1 (MVP)         - PC-98 FDI end-to-end      2-4 weeks
Phase 2 (Universal)   - Multi-container support   3-6 weeks  
Phase 3 (Claude)      - Provider + caching        1-2 weeks
Phase 4 (Repointing)  - Dynamic patching          4-8 weeks
Phase 5 (Fonts)       - Glyph systems             4-10 weeks
Phase 6 (Authoring)   - Profile kit               4-6 weeks
Phase 7 (Polish)      - Production UX             2-4 weeks per feature
```

---

# PHASE 1: "It works end-to-end for one title" (Weeks 1-4)

**Goal:** Take Alshark (PC-98 FDI) → extract → translate → layout → patch → playable.  
**Success Criteria:**
- [ ] No-op rebuild produces identical file hashes
- [ ] String extraction is stable and complete
- [ ] In-place patching works for known textbox sizes
- [ ] Output generates `project.json` + patch file
- [ ] CLI `diskscribe run alshark.fdi --auto` works

**Estimate:** 10-15 engineer-days in focused sprints

---

## Phase 1.1: Data Model & Core Infrastructure (Days 1-3)

### TICKET 1.1.1: Define & Implement ContainerManifest

**Type:** Core Data Model  
**Priority:** CRITICAL (blocks all later stages)

**Spec:**
```typescript
// src/core/container_manifest.ts
export interface ContainerManifest {
  container_id: string;           // UUID
  container_type: "pc98_fdi" | "pc88_d88" | ...;
  source_path: string;
  build_time: string;             // ISO 8601
  build_hash: string;             // sha256(entire input)
  
  volumes: Volume[];              // Multi-disk support
  files: FileEntry[];             // Indexed by path
  extraction_map: Record<string, ExtractionMethod>;
  
  system_info: {
    target_system: "PC-98" | "PC-88" | "PC-FX" | "FM-7" | ...;
    detected_lang: "jp" | "en" | ...;
  };
}

export interface Volume {
  volume_id: number;
  name: string;
  total_bytes: number;
  capacity_spec?: string;         // e.g. "2HD"
}

export interface FileEntry {
  path: string;                   // e.g. "DISK1.EXE"
  offset: number;
  size: number;
  sha256: string;
  type: "executable" | "script" | "data" | "unknown";
  encoding_hint?: string;
}

export interface ExtractionMethod {
  file_path: string;
  method: "direct_read" | "pointer_table" | "custom_decode";
  decoder?: string;               // Plugin ID
}
```

**Deliverables:**
- [ ] `src/core/container_manifest.ts` (200 LOC)
- [ ] Unit tests for serialization (JSON roundtrip)
- [ ] Hashing utilities (CLI tool to compute manifest hash)

**API Example:**
```typescript
const manifest = await containerOpen("alshark.fdi");
console.log(manifest.files.length);                    // 23
console.log(manifest.container_type);                  // "pc98_fdi"
```

---

### TICKET 1.1.2: Define & Implement StringTable

**Type:** Core Data Model  
**Priority:** CRITICAL (extracted strings live here)

**Spec:**
```typescript
// src/core/string_table.ts
export interface StringUnit {
  id: string;                     // Stable UUID or hash
  source: SourceRef;
  
  encoding: "shift_jis" | "euc_jp" | "utf8" | "custom";
  original_bytes: Uint8Array;
  original_text: string;
  
  control_codes?: ControlCode[];  // Color, wait, speaker tags, etc.
  context?: string;               // Adjacent strings for AI context
  
  box_constraint?: BoxSpec;       // Max width/height in textbox
  max_bytes?: number;             // Budget for patching
}

export interface SourceRef {
  volume: number;
  file_path: string;
  byte_offset: number;
  byte_length: number;
  
  pointer_offset?: number;        // If part of pointer table
  pointer_format?: "le16" | "be16" | "le32" | "be32" | "segment:offset";
}

export interface ControlCode {
  type: "color_change" | "wait_input" | "speaker_name" | "custom";
  value: any;
  preserved: boolean;             // Must survive encoding
}

export interface BoxSpec {
  width_chars: number;
  height_lines: number;
  font_type: "monospace" | "proportional";
  language: "jp" | "en" | "mixed";
}

export class StringTable {
  private entries: Map<string, StringUnit> = new Map();
  
  // Core operations
  add(unit: StringUnit): void { ... }
  get(id: string): StringUnit | undefined { ... }
  getAll(): StringUnit[] { ... }
  
  // Filtering
  byFile(path: string): StringUnit[] { ... }
  byConstraint(spec: BoxSpec): StringUnit[] { ... }
  untranslated(): StringUnit[] { ... }
  
  // I/O
  toJSON(): string { ... }
  static fromJSON(json: string): StringTable { ... }
  
  // Statistics
  stats(): {
    total: number;
    by_file: Record<string, number>;
    by_encoding: Record<string, number>;
  } { ... }
}
```

**Deliverables:**
- [ ] `src/core/string_table.ts` (300 LOC)
- [ ] Unit tests: add/get/filter/stats
- [ ] JSON schema + validation

**Usage Example:**
```typescript
const table = new StringTable();
table.add({
  id: "alshark_battle_001",
  source: { volume: 0, file_path: "BATTLE.EXE", byte_offset: 0x12345, ... },
  encoding: "shift_jis",
  original_text: "攻撃",
  box_constraint: { width_chars: 8, height_lines: 1, ... }
});

const stats = table.stats();
console.log(stats.total);                              // 252086
```

---

### TICKET 1.1.3: Define & Implement TranslationTable

**Type:** Core Data Model  
**Priority:** CRITICAL (stores translations)

**Spec:**
```typescript
// src/core/translation_table.ts
export interface Translation {
  string_id: string;              // Links to StringUnit
  
  translated_text: string;
  provider: "claude" | "openai" | "manual" | "glossary";
  confidence: number;             // 0-1 (from provider or manual)
  
  glossary_applied: boolean;
  glossary_entry_id?: string;
  
  tokens_used?: number;           // For billing
  cache_hit: boolean;
  
  quality_flags: QualityFlag[];
  provider_metadata?: Record<string, any>;  // Provider-specific data
  
  created_at: string;             // ISO 8601
  modified_at: string;
}

export type QualityFlag = 
  | "unsupported_characters"
  | "overflow_risk"
  | "control_code_dropped"
  | "needs_manual_review"
  | "context_insufficient";

export class TranslationTable {
  private entries: Map<string, Translation> = new Map();
  
  add(trans: Translation): void { ... }
  get(string_id: string): Translation | undefined { ... }
  getAll(): Translation[] { ... }
  
  quality_report(): {
    total: number;
    flagged: number;
    by_flag: Record<string, number>;
    manual_required: Translation[];
  } { ... }
  
  toJSON(): string { ... }
  static fromJSON(json: string): TranslationTable { ... }
}
```

**Deliverables:**
- [ ] `src/core/translation_table.ts` (200 LOC)
- [ ] Unit tests
- [ ] Quality report formatter

---

### TICKET 1.1.4: Define Project Structure & Artifacts

**Type:** Core Infrastructure  
**Priority:** HIGH (enables reproducibility)

**Spec:**
```typescript
// src/core/project.ts
export interface ProjectIndex {
  project_id: string;             // UUID
  version: "1.0";
  
  input: {
    source_path: string;
    source_hash: string;
    container_type: string;
    opened_at: string;
  };
  
  stages: {
    extraction?: { completed_at: string; stats: unknown };
    translation?: { completed_at: string; stats: unknown };
    layout?: { completed_at: string; stats: unknown };
    patch?: { completed_at: string; stats: unknown };
  };
  
  output_dir: string;
}

export class Project {
  private index: ProjectIndex;
  private manifest: ContainerManifest;
  private strings: StringTable;
  private translations: TranslationTable;
  private layout_results: LayoutTable;
  
  // I/O
  static open(path: string): Project { ... }
  save(): void { ... }
  
  // Getters
  getManifest(): ContainerManifest { ... }
  getStrings(): StringTable { ... }
  getTranslations(): TranslationTable { ... }
  
  // Stage tracking
  markStageComplete(stage: string): void { ... }
  isStageComplete(stage: string): boolean { ... }
}

// Folder structure
project/
  project.json               # ProjectIndex
  input/
    manifest.json           # ContainerManifest
    hashes.json             # File hashes for integrity
  extracted/
    strings.json            # StringTable
  translated/
    translations.json       # TranslationTable
    glossary_cache.db       # SQLite glossary hits
  layout/
    layout_results.json     # LayoutTable
    glyph_report.json       # Missing glyphs, etc.
  patch/
    patch_plan.json         # Which files get patched
    patch_report.json       # Results + warnings
  output/
    alshark_translated.fdi  # Patched disk image
    alshark.xdelta          # Patch file (optional)
```

**Deliverables:**
- [ ] `src/core/project.ts` (300 LOC)
- [ ] Project folder creation + validation
- [ ] JSON serialization tests
- [ ] CLI helper: `diskscribe project new <input> <output_dir>`

---

## Phase 1.2: Container Plugin System (Days 4-6)

### TICKET 1.2.1: Container Plugin Interface & Registry

**Type:** Plugin Architecture  
**Priority:** CRITICAL (blocks extraction)

**Spec:**
```typescript
// src/containers/base.ts
export interface IContainerPlugin {
  name: string;                   // e.g. "PC-98 FDI"
  container_type: string;         // e.g. "pc98_fdi"
  priority: number;               // 1 = highest priority for auto-detect
  
  can_handle(path: string): Promise<boolean>;
  
  // Main operations
  open(path: string): Promise<ContainerManifest>;
  extract(manifest: ContainerManifest, file_ref: FileEntry): Promise<Uint8Array>;
  build(manifest: ContainerManifest, patched_files: FileEntry[]): Promise<Uint8Array>;
  
  // Optional: write patch file
  write_patch?(original_path: string, patched_path: string, output: string, format: "xdelta" | "bps"): Promise<boolean>;
}

// src/containers/registry.ts
export class ContainerRegistry {
  private plugins: Map<string, IContainerPlugin> = new Map();
  
  register(plugin: IContainerPlugin): void { ... }
  unregister(type: string): void { ... }
  
  async auto_detect(path: string): Promise<IContainerPlugin | null> {
    // Try each plugin in priority order
  }
  
  get(type: string): IContainerPlugin { ... }
  list_all(): IContainerPlugin[] { ... }
}

export const global_container_registry = new ContainerRegistry();
```

**Deliverables:**
- [ ] `src/containers/base.ts` (200 LOC)
- [ ] `src/containers/registry.ts` (150 LOC)
- [ ] Unit tests for registry
- [ ] CLI helper: `diskscribe containers list`

---

### TICKET 1.2.2: PC-98 FDI Container Plugin (MVP)

**Type:** Container Plugin  
**Priority:** CRITICAL (Alshark uses FDI)

**Spec:**
```typescript
// src/containers/pc98_fdi.ts
export class PC98FDIPlugin implements IContainerPlugin {
  name = "PC-98 FDI (2HD/2DD Disk Image)";
  container_type = "pc98_fdi";
  priority = 10;  // High priority - common format
  
  async can_handle(path: string): Promise<boolean> {
    // Check for .FDI extension and FDI header
    return path.toLowerCase().endsWith('.fdi') && hasFDIHeader();
  }
  
  async open(path: string): Promise<ContainerManifest> {
    // 1. Parse FDI header (cylinders, heads, sectors, etc.)
    // 2. Build FAT/directory from disk image
    // 3. Enumerate files with offsets
    // 4. Return ContainerManifest
  }
  
  async extract(manifest, file_ref): Promise<Uint8Array> {
    // Read bytes from disk at file_ref.offset
  }
  
  async build(manifest, patched_files): Promise<Uint8Array> {
    // No-op mode: copy patched_files back into disk image
    // Verify file hashes match if unmodified
  }
  
  async write_patch(original_path, patched_path, output, format) {
    // xdelta3 wrapper: original -> patched -> xdelta file
  }
}

// Register on load
global_container_registry.register(new PC98FDIPlugin());
```

**Deliverables:**
- [ ] `src/containers/pc98_fdi.ts` (500 LOC)
- [ ] FDI parser utility (detect header, parse boot sector)
- [ ] File extraction + rebuild logic
- [ ] Unit tests: round-trip (read + build identical hash)
- [ ] Integration test with real Alshark FDI image

**Acceptance Test:**
```bash
diskscribe extract alshark.fdi --output extracted/
# Should find and extract .EXE, .DAT, .GRP files
# Rebuild and compare: sha256(original.fdi) == sha256(rebuild.fdi)
```

---

## Phase 1.3: Profile Plugin System (Days 7-10)

### TICKET 1.3.1: Profile Plugin Interface

**Type:** Plugin Architecture  
**Priority:** CRITICAL (blocks text extraction)

**Spec:**
```typescript
// src/profiles/base.ts
export interface IGameProfile {
  name: string;                   // e.g. "Alshark (PC-98)"
  profile_id: string;             // e.g. "alshark_pc98"
  
  // Confidence detection
  scan_confidence(manifest: ContainerManifest): number;  // 0-1
  
  // Text extraction
  extract(
    manifest: ContainerManifest,
    container: IContainerPlugin
  ): Promise<StringTable>;
  
  // Define textbox constraints
  get_box_spec(file_path: string, context?: string): BoxSpec;
  
  // Patching strategy
  get_patch_strategy(string_id: string): "in_place" | "repoint" | "leave";
  
  // Metadata
  supported_languages: string[];
  system_family: "pc98" | "pc88" | "pcedit" | ...;
}

// src/profiles/registry.ts
export class ProfileRegistry {
  private profiles: Map<string, IGameProfile> = new Map();
  
  register(profile: IGameProfile): void { ... }
  
  // Auto-detect best profile
  async detect(manifest: ContainerManifest): Promise<IGameProfile | null> { ... }
  
  get(id: string): IGameProfile { ... }
  list_all(): IGameProfile[] { ... }
}

export const global_profile_registry = new ProfileRegistry();
```

**Deliverables:**
- [ ] `src/profiles/base.ts` (200 LOC)
- [ ] `src/profiles/registry.ts` (150 LOC)
- [ ] CLI helper: `diskscribe profiles list`

---

### TICKET 1.3.2: Alshark Profile (MVP)

**Type:** Game Profile  
**Priority:** CRITICAL (proof-of-concept title)

**Context:**
Alshark is an early Alice Soft eroge. Binary structure known from community docs.
- Main script file: `ALSHARK.EXE` (compressed script)
- Graphics: `*.GRP`
- Data: `*.DAT`

**Strategy:**
1. Locate script file (EXE)
2. Decompress if needed
3. Parse text unit offsets from pointer table at known offset
4. Extract strings with control code preservation
5. Apply per-scene textbox dimensions

**Spec:**
```typescript
// src/profiles/alshark.ts
export class AlsharkProfile implements IGameProfile {
  name = "Alshark (Alice Soft, 1989)";
  profile_id = "alshark_pc98";
  system_family = "pc98";
  supported_languages = ["ja"];
  
  async scan_confidence(manifest: ContainerManifest): number {
    // Check for ALSHARK.EXE, known byte patterns, etc.
    // Return 0.85-0.95 if confident
  }
  
  async extract(manifest, container): Promise<StringTable> {
    // 1. Locate ALSHARK.EXE
    const exe_file = manifest.files.find(f => f.path.match(/ALSHARK\.EXE/i));
    const exe_bytes = await container.extract(manifest, exe_file!);
    
    // 2. Decompress (if applicable - sample script format)
    const decompressed = this.decompress_alshark_script(exe_bytes);
    
    // 3. Parse pointer table at known offset (0x2000)
    const strings = this.extract_from_script(decompressed);
    
    return strings;
  }
  
  private extract_from_script(bytes: Uint8Array): StringTable {
    const table = new StringTable();
    // Parse byte-by-byte, recognizing:
    // - Text unit start markers
    // - Control codes (< 0x20 are control)
    // - String terminators (0x00)
    // - Pointer tables for structure
    ...
    return table;
  }
  
  get_box_spec(file_path: string, context?: string): BoxSpec {
    // Alshark has fixed textbox sizes:
    // - Dialog: 16 chars × 3 lines
    // - Menu: 12 chars × 1 line
    // - Battle: 8 chars × 4 lines
    
    if (context?.match(/battle|combat/i)) {
      return { width_chars: 8, height_lines: 4, font_type: "monospace", language: "ja" };
    }
    return { width_chars: 16, height_lines: 3, font_type: "monospace", language: "ja" };
  }
  
  get_patch_strategy(string_id: string): "in_place" | "repoint" | "leave" {
    // For MVP: in-place only (if fits in byte budget)
    return "in_place";
  }
}

// Register
global_profile_registry.register(new AlsharkProfile());
```

**Deliverables:**
- [ ] `src/profiles/alshark.ts` (400-600 LOC)
- [ ] Script decompression utilities (if applicable)
- [ ] Pointer table parser
- [ ] Control code recognizer
- [ ] Unit tests: extraction on real Alshark.EXE produces known string count

**Acceptance Test:**
```bash
diskscribe extract alshark.fdi --profile alshark_pc98
# Should detect ~2500+ strings, by file:
#   ALSHARK.EXE: 2400+ dialog lines
#   *.DAT: 100+ data strings
```

---

## Phase 1.4: Translation Provider Abstraction (Days 11-12)

### TICKET 1.4.1: Translation Provider Interface & Caching Layer

**Type:** Translation Pipeline  
**Priority:** HIGH (enables AI translation)

**Spec:**
```typescript
// src/translate/base.ts
export interface ITranslationProvider {
  name: string;                   // "Claude 3.5 Sonnet"
  provider_id: string;            // "claude"
  
  supports_batch: boolean;
  
  async translate(
    batch: StringUnit[],
    source_lang: "ja" | "jp",
    target_lang: "en",
    options: TranslationOptions
  ): Promise<Translation[]>;
}

export interface TranslationOptions {
  glossary?: TranslationGlossary;
  context_grouping?: "by_file" | "by_scene" | "none";
  style?: "literal" | "natural" | "literary";
  max_tokens_per_batch?: number;
  use_cache: boolean;
  cache_only?: boolean;            // For replay mode
}

// src/translate/cache.ts
export class TranslationCache {
  private db: sqlite3.Database;   // Persistent storage
  
  async get(prompt_hash: string): Promise<Translation | null> { ... }
  async put(prompt_hash: string, trans: Translation): Promise<void> { ... }
  
  async stats(): Promise<{ total: number; hits: number; misses: number }> { ... }
  
  // For deterministic caching
  static hash_prompt(...inputs: any[]): string {
    return sha256(JSON.stringify(inputs));
  }
}

// src/translate/registry.ts
export class ProviderRegistry {
  private providers: Map<string, ITranslationProvider> = new Map();
  
  register(provider: ITranslationProvider): void { ... }
  get(id: string): ITranslationProvider { ... }
  list_all(): ITranslationProvider[] { ... }
}

export const global_provider_registry = new ProviderRegistry();
```

**Deliverables:**
- [ ] `src/translate/base.ts` (200 LOC)
- [ ] `src/translate/cache.ts` (300 LOC, SQLite schema)
- [ ] `src/translate/registry.ts` (100 LOC)
- [ ] Cache schema + migrations
- [ ] Unit tests: cache hit/miss, prompt hashing

---

### TICKET 1.4.2: Stub/Mock Provider (for quick iteration)

**Type:** Translation Provider  
**Priority:** MEDIUM (unblocks layout/patch testing)

**Spec:**
```typescript
// src/translate/mock_provider.ts
export class MockProvider implements ITranslationProvider {
  name = "Mock Translator (for testing)";
  provider_id = "mock";
  supports_batch = true;
  
  async translate(batch, source_lang, target_lang, options): Promise<Translation[]> {
    // Simple pass-through: return glossary entry if available, else Japanese → English roman name
    return batch.map((str, idx) => ({
      string_id: str.id,
      translated_text: options.glossary?.getTranslation(str.original_text) || 
                       str.original_text + "_en",
      provider: "mock",
      confidence: options.glossary ? 1.0 : 0.5,
      glossary_applied: !!options.glossary?.getTranslation(str.original_text),
      tokens_used: 0,
      cache_hit: false,
      quality_flags: [],
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
    }));
  }
}

global_provider_registry.register(new MockProvider());
```

**Deliverables:**
- [ ] `src/translate/mock_provider.ts` (100 LOC)
- [ ] Integration tests

---

## Phase 1.5: Layout Engine (Days 13-15)

### TICKET 1.5.1: Text Wrapping Engine

**Type:** Layout & Reflow  
**Priority:** HIGH (required for patch verification)

**Spec:**
```typescript
// src/layout/wrap_engine.ts
export interface LayoutResult {
  string_id: string;
  original: string;
  translated: string;
  
  wrapped_lines: string[];
  final_render: string;           // For display
  
  status: "ok" | "wrapped" | "truncated" | "overflow";
  issue?: string;                 // If not ok
  
  metrics: {
    original_bytes: number;
    final_bytes: number;
    lines_needed: number;
    max_width_used: number;
  };
}

export class TextWrapEngine {
  async wrap(
    strings_to_wrap: Translation[],
    layout_constraints: Map<string, BoxSpec>,
    ruleset: "english" | "japanese"
  ): Promise<LayoutResult[]> {
    return strings_to_wrap.map(trans => {
      const constraint = layout_constraints.get(trans.string_id);
      if (!constraint) {
        return { status: "ok", wrapped_lines: [trans.translated_text], ... };
      }
      
      // Apply wrapping
      const wrapped = this.wrap_text(
        trans.translated_text,
        constraint.width_chars,
        constraint.height_lines,
        ruleset
      );
      
      // Check fit
      const status = this.check_fit(wrapped, constraint);
      
      return {
        string_id: trans.string_id,
        wrapped_lines: wrapped,
        status,
        metrics: { ... },
        ...
      };
    });
  }
  
  private wrap_text(text: string, width: number, height: number, ruleset: string): string[] {
    // Simple greedy word-wrap + control code preservation
    // More sophisticated rulesets (Japanese punctuation rules) added in Phase 5
    ...
  }
}
```

**Deliverables:**
- [ ] `src/layout/wrap_engine.ts` (300-400 LOC)
- [ ] Basic word-wrap algorithm (no fancy rulesets yet)
- [ ] Unit tests with various widths/heights
- [ ] LayoutResult serialization

---

### TICKET 1.5.2: Layout Pipeline Integration

**Type:** Pipeline  
**Priority:** HIGH (blocks patch generation)

**Spec:**
```typescript
// src/pipeline/layout_stage.ts
export async function layout_stage(
  project: Project,
  translations: TranslationTable
): Promise<LayoutTable> {
  const manifest = project.getManifest();
  const profile = global_profile_registry.get(project.profile_id);
  
  const engine = new TextWrapEngine();
  
  // Gather all constraints
  const constraints = new Map<string, BoxSpec>();
  translations.getAll().forEach(trans => {
    const unit = project.getStrings().get(trans.string_id);
    const spec = profile.get_box_spec(unit!.source.file_path);
    constraints.set(trans.string_id, spec);
  });
  
  // Wrap all
  const results = await engine.wrap(
    translations.getAll(),
    constraints,
    "english"  // TODO: detect from profile
  );
  
  // Report issues
  const issues = results.filter(r => r.status !== "ok");
  console.log(`Layout complete: ${issues.length} need attention`);
  
  // Return LayoutTable
  return LayoutTable.fromResults(results);
}
```

**Deliverables:**
- [ ] `src/pipeline/layout_stage.ts` (150 LOC)
- [ ] Integration into `Project.save()`

---

## Phase 1.6: Patching Engine (Days 16-19)

### TICKET 1.6.1: In-Place Patcher

**Type:** Patching  
**Priority:** CRITICAL (required output)

**Spec:**
```typescript
// src/patch/patcher_inplace.ts
export class InPlacePatcher {
  async patch(
    manifest: ContainerManifest,
    container: IContainerPlugin,
    translations: TranslationTable,
    layout_results: LayoutTable,
    profile: IGameProfile
  ): Promise<PatchReport> {
    const report = new PatchReport();
    
    const patched_files = new Map<string, Uint8Array>();
    
    for (const trans of translations.getAll()) {
      const unit = project.getStrings().get(trans.string_id);
      const layout = layout_results.get(trans.string_id);
      
      // Check fit
      const original_bytes = unit!.original_bytes.length;
      const final_bytes = this.encode_text(
        layout.wrapped_lines,
        unit!.encoding
      ).length;
      
      if (final_bytes > original_bytes && !unit!.max_bytes && 
          profile.get_patch_strategy(trans.string_id) === "in_place") {
        report.add_warning(`Overflow: ${trans.string_id} (needs ${final_bytes}, have ${original_bytes})`);
        continue;
      }
      
      // Perform patch
      const file_path = unit!.source.file_path;
      const file_bytes = patched_files.get(file_path) || 
                        await container.extract(manifest, /* file_entry */);
      
      // Replace bytes at offset
      const final_encoded = this.encode_text(layout.wrapped_lines, unit!.encoding);
      file_bytes.set(final_encoded, unit!.source.byte_offset);
      
      patched_files.set(file_path, file_bytes);
      report.add_success(trans.string_id);
    }
    
    // Rebuild container
    const output_bytes = await container.build(manifest, [...patched_files.entries()]);
    
    return report;
  }
}
```

**Deliverables:**
- [ ] `src/patch/patcher_inplace.ts` (400 LOC)
- [ ] String encoding utilities (shift-jis, preserve control codes)
- [ ] Unit tests: patch vs reference
- [ ] PatchReport class

---

### TICKET 1.6.2: Patch Pipeline Integration

**Type:** Pipeline  
**Priority:** CRITICAL

**Spec:**
```typescript
// src/pipeline/patch_stage.ts
export async function patch_stage(
  project: Project,
  translations: TranslationTable,
  layout_results: LayoutTable
): Promise<Uint8Array> {
  const manifest = project.getManifest();
  const profile = global_profile_registry.get(project.profile_id);
  const container = global_container_registry.get(manifest.container_type);
  
  const patcher = new InPlacePatcher();
  const report = await patcher.patch(manifest, container, translations, layout_results, profile);
  
  // Log warnings
  report.getWarnings().forEach(w => console.warn(`[PATCH] ${w}`));
  
  // Save report
  await fs.writeFile(
    path.join(project.output_dir, "patch/patch_report.json"),
    JSON.stringify(report.toJSON(), null, 2)
  );
  
  return report.output_bytes;
}
```

**Deliverables:**
- [ ] `src/pipeline/patch_stage.ts` (150 LOC)

---

## Phase 1.7: CLI & Full Integration (Days 20-21)

### TICKET 1.7.1: CLI `diskscribe run` Command  

**Type:** CLI / Integration  
**Priority:** CRITICAL (final integration)

**Spec:**
```bash
# Full pipeline: open → extract → translate → layout → patch
$ diskscribe run input.fdi --output project/ --provider mock

# Steps in order:
#   [1/5] Opening disk image...
#   [2/5] Extracting strings (profile: alshark_pc98)...
#   [3/5] Translating (provider: mock)...
#   [4/5] Laying out and wrapping...
#   [5/5] Patching disk image...
#
# Output:
#   project/project.json
#   project/output/alshark_translated.fdi
#   project/patch/patch_report.json
```

**Implementation:**
```typescript
// src/cli/commands/run.ts
async function run_command(args: {
  input: string;
  output: string;
  profile?: string;                  // auto-detect if not specified
  provider?: string;                 // default: mock
  language?: string;                 // default: en
}): Promise<void> {
  
  console.log(`[1/5] Opening ${args.input}...`);
  const container = await global_container_registry.auto_detect(args.input);
  const manifest = await container.open(args.input);
  
  console.log(`[2/5] Auto-detecting profile...`);
  const profile = args.profile
    ? global_profile_registry.get(args.profile)
    : await global_profile_registry.detect(manifest);
  
  console.log(`[3/5] Extracting strings...`);
  const strings = await profile.extract(manifest, container);
  
  console.log(`[4/5] Translating...`);
  const provider = global_provider_registry.get(args.provider || "mock");
  const translations = await translate_batch(strings, provider, args.language);
  
  console.log(`[5/5] Layouting...`);
  const layout = await layout_stage(strings, translations, profile);
  
  console.log(`[6/6] Patching...`);
  const patched = await patch_stage(manifest, container, translations, layout, profile);
  
  // Save output
  const output_path = path.join(args.output, `${path.basename(args.input, path.extname(args.input))}_translated${path.extname(args.input)}`);
  await fs.writeFile(output_path, patched);
}
```

**Deliverables:**
- [ ] `src/cli/commands/run.ts` (200 LOC)
- [ ] Argument parser
- [ ] End-to-end integration test

---

## Phase 1.8: Project System & Reproducibility (Day 22)

### TICKET 1.8.1: Project Load/Save Full Cycle

**Deliverables:**
- [ ] Project folder scaffolding
- [ ] All tables serialize to JSON
- [ ] Project.save() writes all artifacts
- [ ] Project.open() loads and validates all

---

## Phase 1 Definition of Done ✅

- [x] ContainerManifest fully defined + tested
- [x] StringTable + TranslationTable + LayoutTable working
- [x] PC-98 FDI container plugin extracts known game
- [x] Alshark profile extracts ~2500+ strings with known control codes
- [x] Mock provider translates (glossary pass-through)
- [x] Text wrapping engine handles various box sizes
- [x] In-place patcher produces patched disk that boots
- [x] Project artifacts save/load reproducibly
- [x] CLI `diskscribe run input.fdi` works end-to-end
- [x] Round-trip build (no patches) produces identical hash
- [x] No mutations to input files
- [x] Full project JSON artifact generated

---

# PHASE 2: "Universal Containers" (Weeks 5-9)

**Goal:** Support ZIP, FOLDER, ISO9660 in addition to PC-98 FDI.  
**Success Criteria:**
- [ ] Extract from any common archive format
- [ ] Non-disk inputs work (folders, zips, ISOs)
- [ ] Container auto-detection reliable (>95%)
- [ ] Multi-disk projects supported

**Tickets (summary):**

1. **2.1.1** - ZIP container plugin
2. **2.1.2** - Folder container plugin  
3. **2.1.3** - ISO9660 container plugin
4. **2.1.4** - Multi-volume manifest support
5. **2.1.5** - Container auto-detection ranking/scoring

---

# PHASE 3: "Claude Provider" (Weeks 10-11)

**Goal:** Real Claude translations with caching, batching, cost tracking.

**Tickets (summary):**

1. **3.1.1** - ClaudeProvider implementation with SDK
2. **3.1.2** - Prompt engineering (few-shot, glossary injection)
3. **3.1.3** - Batch API with rate limiting
4. **3.1.4** - Cache layer integration (deterministic prompt hashing)
5. **3.1.5** - Cost tracking + billing exposure
6. **3.1.6** - API key management (env vars, config file, BYO key)

---

# PHASE 4: "Repointing & Dynamic Patching" (Weeks 12-19)

**Goal:** Support strings longer than original without truncation.

**Tickets (summary):**

1. **4.1.1** - Free space allocator + bitmap
2. **4.1.2** - Pointer rewrite engine (common formats)
3. **4.1.3** - String bank builder
4. **4.1.4** - Hybrid patcher (in-place + repoint)
5. **4.1.5** - Profile pointer format specifications

---

# PHASE 5: "Font & Glyph Systems" (Weeks 20–30+, depends on scope)

**Goal:** Glyph coverage tracking and optional font injection.

**Tickets (summary):**

1. **5.1.1** - Glyph inventory extraction (from fonts)
2. **5.1.2** - Coverage scanning (which glyphs needed)
3. **5.1.3** - Missing glyph reporting
4. **5.1.4** - Font metrics table builder (for proportional layout)
5. **5.1.5** - Font injection/patching (system-specific)

---

# PHASE 6: "Profile Authoring Kit" (Weeks 31–36)

**Goal:** Community can build new profiles without touching engine.

**Tickets (summary):**

1. **6.1.1** - Profile schema + JSON schema validator
2. **6.1.2** - Binary text scanner GUI/CLI tool
3. **6.1.3** - Pointer table detector + annotator
4. **6.1.4** - Control code learning tool
5. **6.1.5** - Profile packaging format + registry

---

# PHASE 7: "Production UX" (ongoing, parallel to other phases)

Tickets spread across phases:

- **7.1.1** - Error recovery + resume workflows
- **7.1.2** - Web UI for project browser
- **7.1.3** - In-progress status + ETA
- **7.1.4** - Crash dumps and diagnostics
- **7.1.5** - Settings panel (provider key, cache location, etc.)

---

## Staffing & Timeline Summary

| Phase | Duration | Peak Load | Notes |
|-------|----------|-----------|-------|
| 1 | 2-4 weeks | 2-3 eng | Core MVP - tight iteration |
| 2 | 3-6 weeks | 1-2 eng | Parallel plugin creation |
| 3 | 1-2 weeks | 1 eng | Claude integration straightforward |
| 4 | 4-8 weeks | 2 eng | Complex: allocator + pointer logic |
| 5 | 4-10 weeks | 1-2 eng | Font work is deep but optional |
| 6 | 4-6 weeks | 1-2 eng | Documentation heavy |
| 7 | ongoing | 0.5-1 eng | Parallel, UX iterations |

**Total: ~6 months for a fully-featured utility.**

---

## Key Assumptions & Risks

1. **No existing system knowledge:** Assume you'll read community docs/reverse-engineering reports for each game.
2. **Pointer formats vary:** Some games use relative, others absolute; plan for per-profile specifications.
3. **Control codes are game-specific:** Verify via binary inspection; don't guess.
4. **Claude API costs:** Budget $200-500/mo for testing; BYO key is cheaper long-term.
5. **Font injection complexity:** Depends on target system; some systems have no font table (hard-coded glyphs).

---

## Next Steps

1. **Pick Phase 1 start date.** Commit 2-4 weeks, full focus.
2. **Create tickets in your issue tracker** (GitHub, Linear, Jira, etc.) with these specs.
3. **Start 1.1.1** (ContainerManifest) and work systematically.
4. **Weekly snapshot:** Share commit diff + test results.

