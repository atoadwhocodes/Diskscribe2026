# DiskScribe2026: API Reference

**Purpose:** Complete API documentation for programmers building with or extending DiskScribe2026  
**Version:** 1.0 (Feb 26, 2026)  
**Audience:** Plugin developers, library users, integrators

---

## Table of Contents

1. [Core Services](#core-services)
2. [Container System](#container-system)
3. [Profile System](#profile-system)
4. [Translation API](#translation-api)
5. [Layout Engine](#layout-engine)
6. [Patcher API](#patcher-api)
7. [CLI Interface](#cli-interface)
8. [Examples](#examples)

---

## Core Services

### `ContainerManifest`

**Purpose:** Describes the structure of a file container (FDI, ZIP, ISO, etc.)

```typescript
interface IContainerManifest {
  // Metadata
  container_id: string;           // e.g., "alshark.fdi"
  container_type: string;          // "pc98_fdi" | "zip" | "iso9660" | "folder"
  size_bytes: number;
  created_at: string;              // ISO 8601 timestamp

  // File entries
  files: IFileEntry[];
}

interface IFileEntry {
  path: string;                    // e.g., "ALSHARK.EXE"
  offset: number;                  // Byte offset in container
  size: number;                    // File size in bytes
  encoding?: string;               // "shift_jis" | "ascii"
  compression?: string;            // "none" | "stored" | "deflate"
  metadata?: Record<string, any>;
}
```

**Factory:**
```typescript
class ContainerFactory {
  static async create(
    input_path: string
  ): Promise<ContainerManifest>;
  
  static from_json(json: string): ContainerManifest;
  to_json(): string;
}
```

---

### `StringTable`

**Purpose:** In-memory storage of extracted strings with full metadata

```typescript
interface IStringUnit {
  id: string;                      // e.g., "alshark_001_0x1234"
  source_file: string;             // Which file this came from
  offset: number;                  // Byte offset in file
  
  // Text content
  text_raw: string;                // Original bytes as string
  text_clean: string;              // Without control codes
  control_codes: ControlCode[];    // {type, offset, value}
  
  // Classification
  category: "dialog" | "menu" | "battle" | "description" | "unknown";
  context?: string;                // Game-specific context
  
  // Constraints
  max_bytes?: number;              // For display textbox
  line_limit?: number;             // Max lines in textbox
  special_chars?: string[];        // Must preserve (e.g., "©", "★")
  
  // Status
  translated?: string;             // English translation
  layout_result?: string;          // After text wrapping
  patched?: boolean;              // Successfully patched?
  
  metadata?: Record<string, any>;
}

interface ControlCode {
  type: "newline" | "color" | "variable" | "icon" | "wait" | "other";
  offset: number;                  // Position in original text
  value: Uint8Array;              // Raw bytes
  description?: string;
}

class StringTable {
  // CRUD
  add(unit: IStringUnit): void;
  get(id: string): IStringUnit | null;
  remove(id: string): void;
  update(id: string, partial: Partial<IStringUnit>): void;
  
  // Query
  all(): IStringUnit[];
  by_file(file: string): IStringUnit[];
  by_category(category: string): IStringUnit[];
  translated(): IStringUnit[];      // Where text_translated is set
  untranslated(): IStringUnit[];    // Where text_translated is null
  
  // Stats
  count(): number;
  size_bytes(): number;             // Total character count
  progress(): {total, translated, percent};
  
  // I/O
  save_json(path: string): Promise<void>;
  load_json(path: string): Promise<void>;
  export_csv(path: string): Promise<void>;
  import_csv(path: string): Promise<void>;
}
```

---

### `TranslationTable`

**Purpose:** Maps original text to translations

```typescript
interface ITranslation {
  id: string;                       // Links to StringUnit.id
  source_lang: string;              // "ja" | "zh-hans" | etc.
  target_lang: string;              // "en" | "fr" | etc.
  
  original: string;                 // Original text
  translated: string;               // Translation
  
  provider: string;                 // "mock" | "claude" | "openai"
  provider_config?: Record<string, any>;
  
  cost?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  
  quality_score?: number;           // 0-100, from Human review
  notes?: string;                   // Translator notes ("needs review")
  
  created_at: string;               // ISO timestamp
  updated_at: string;
}

class TranslationTable {
  // CRUD
  add(translation: ITranslation): void;
  get(id: string): ITranslation | null;
  update(id: string, partial: Partial<ITranslation>): void;
  
  // Query
  all(): ITranslation[];
  by_provider(provider: string): ITranslation[];
  needs_review(): ITranslation[];   // quality_score < threshold
  
  // Stats
  cost_total_usd(): number;
  tokens_used(): {input: number, output: number};
  quality_avg(): number;
  
  // I/O
  save_json(path: string): Promise<void>;
  load_json(path: string): Promise<void>;
}
```

---

### `Project`

**Purpose:** Manages all artifacts and state for a translation localization in progress

```typescript
interface IProject {
  // Identity
  project_id: string;               // e.g., "alshark_en_v1"
  name: string;
  description?: string;
  
  // Configuration
  config: {
    input_path: string;             // e.g., "/games/alshark.fdi"
    container_type: string;         // "pc98_fdi"
    profile_id: string;             // "alshark_pc98"
    
    source_lang: string;            // "ja" (detected from profile)
    target_lang: string;            // "en"
    
    provider: string;               // "mock" | "claude"
    provider_config?: Record<string, any>;
  };
  
  // State
  stages: {
    extraction: {status: "pending" | "in_progress" | "done", timestamp?: string};
    translation: {status: ..., timestamp?: string};
    layout: {status: ..., timestamp?: string};
    patching: {status: ..., timestamp?: string};
  };
  
  // Artifacts
  manifest?: ContainerManifest;
  strings?: StringTable;
  translations?: TranslationTable;
  layout_result?: LayoutResult;
  patch_report?: PatchReport;
}

class Project {
  constructor(project_id: string);
  
  // Lifecycle
  init(config: Partial<IProject['config']>): Promise<void>;
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
  
  // Stage progression
  mark_stage_done(stage: "extraction" | "translation" | "layout" | "patching"): void;
  stage_progress(): {done: string[], pending: string[]};
  is_complete(): boolean;
  
  // Artifact management
  set_strings(table: StringTable): void;
  get_strings(): StringTable;
  
  set_translations(table: TranslationTable): void;
  get_translations(): TranslationTable;
  
  // Artifact export
  export_project(output_dir: string): Promise<void>;
  // Writes: project.json, strings.json, translations.json, patch.report
}
```

---

## Container System

### Base Interface

```typescript
interface IContainerPlugin {
  // Metadata
  container_type: string;           // Unique identifier: "pc98_fdi"
  description: string;
  version: string;
  
  // Detection
  can_handle(input: string | Buffer): Promise<boolean>;
  
  // Core operations
  open(input_path: string): Promise<ContainerManifest>;
  extract(
    manifest: ContainerManifest,
    file_path: string,
    output_path: string
  ): Promise<Buffer>;
  
  list_files(manifest: ContainerManifest): string[];
}
```

### Registry

```typescript
class ContainerRegistry {
  static register(plugin: IContainerPlugin): void;
  static get(type: string): IContainerPlugin | null;
  static detect(input_path: string): Promise<string | null>;
  static unregister(type: string): void;
  static list_all(): string[];                 // All registered types
}
```

### Built-in Plugins

#### PC-98 FDI (Floppy Disk Image)

```typescript
class PC98FDIPlugin implements IContainerPlugin {
  container_type = "pc98_fdi";
  
  // Overrides can_handle()
  // Looks for FDI magic bytes: 0x46 0x44 0x49
  
  // Overrides open()
  // Returns manifest with all files from FAT
  
  // Overrides extract()
  // Reads from disk image at file offset
}

// Registration
ContainerRegistry.register(new PC98FDIPlugin());
```

**Data Structure (FDI):**
```
Header (4096 bytes):
  0x00-0x02: Magic "FDI"
  0x03: Version
  0x04-0x107: Metadata (disk name, etc.)
  0x108+: FAT entries

File Data:
  At offsets specified by FAT
```

---

## Profile System

### Base Interface

```typescript
interface IGameProfile {
  // Identity
  profile_id: string;               // "alshark_pc98"
  name: string;
  system_family: string;            // "pc98" | "pc88" | "x68k"
  
  // Compatibility
  container_types: string[];        // ["pc98_fdi"] can handle
  
  // Detection (which games use this profile?)
  detection: {
    file_patterns?: string[];       // ["ALSHARK.EXE"]
    byte_signatures?: {
      offset: number;
      bytes: Uint8Array;
    }[];
  };
  
  // Encoding
  encoding: {
    character_set: string;          // "shift_jis"
    newline_byte?: number;          // 0x0A
  };
  
  // Text extraction
  text_extraction: {
    method: "pointer_table" | "heuristic" | "manual";
    pointer_tables?: {
      file: string;
      offset: number;
      count: number;
      pointer_format: "uint16_le" | "uint24_le" | "uint32_le";
    }[];
    heuristic_rules?: string[];     // e.g., "jp_chars_in_seq"
  };
  
  // Display constraints
  textbox_constraints: ITextboxConstraint[];
  
  // Patching strategy
  patching: {
    method: "inplace" | "repoint" | "string_bank";
    free_space_regions?: {
      offset: number;
      size: number;
    }[];
    max_string_size?: number;
    overwrite_limit?: number;      // % of file to overwrite
  };
}

interface ITextboxConstraint {
  id: string;                       // e.g., "dialog_box_1"
  file: string;
  max_bytes: number;               // Pixel width / char width
  line_limit?: number;             // Max lines
  char_width?: number;             // Pixels per character (for proportional)
}
```

### Registry

```typescript
class ProfileRegistry {
  static register(profile: IGameProfile): void;
  static get(id: string): IGameProfile | null;
  static detect(manifest: ContainerManifest): string | null;
  static list_all(): string[];
}
```

### Built-in Profiles

#### Alshark (PC-98)

```typescript
class AlsharkProfile implements IGameProfile {
  profile_id = "alshark_pc98";
  name = "Alshark";
  system_family = "pc98";
  container_types = ["pc98_fdi"];
  
  detection = {
    file_patterns: ["ALSHARK.EXE"],
    byte_signatures: [{
      offset: 0x0E,
      bytes: Buffer.from([0x41, 0x4C, 0x53, 0x48])  // "ALSH"
    }]
  };
  
  encoding = { character_set: "shift_jis", newline_byte: 0x0A };
  
  text_extraction = {
    method: "pointer_table",
    pointer_tables: [{
      file: "ALSHARK.EXE",
      offset: 0x2A400,    // Pointer table offset
      count: 2547,        // 2547 pointers
      pointer_format: "uint16_le"
    }]
  };
  
  textbox_constraints = [
    {
      id: "dialog_box",
      file: "ALSHARK.EXE",
      max_bytes: 32,     // 16 chars × 2 bytes per Shift-JIS char
      line_limit: 3,
      char_width: 8
    },
    // More constraints...
  ];
  
  patching = {
    method: "inplace",
    overwrite_limit: 15   // Can expand strings up to 15% over original
  };
}
```

---

## Translation API

### Provider Interface

```typescript
interface ITranslationProvider {
  name: string;                     // "claude" | "mock"
  version: string;
  
  // Check if available
  is_available(): Promise<boolean>;
  
  // Main method
  translate(
    batch: IStringUnit[],
    options: {
      source_lang: string;         // "ja"
      target_lang: string;         // "en"
      glossary?: TranslationGlossary;
      context?: string;            // Game-specific context
      style?: "natural" | "literal" | "literary";
    }
  ): Promise<ITranslation[]>;
}
```

### Registry

```typescript
class ProviderRegistry {
  static register(provider: ITranslationProvider): void;
  static get(name: string): ITranslationProvider | null;
  static list_all(): string[];
}
```

### ClaudeProvider (Phase 3)

**See CLAUDE-PROVIDER-SPEC.md for complete implementation**

```typescript
class ClaudeProvider implements ITranslationProvider {
  name = "claude";
  
  constructor(api_key: string) { ... }
  
  async translate(
    batch: IStringUnit[],
    options: {...}
  ): Promise<ITranslation[]> {
    // 1. Check cache (SQLite)
    // 2. Build prompt with glossary + few-shot examples
    // 3. Call Claude API (with batching & rate limiting)
    // 4. Parse response JSON
    // 5. Store in cache
    // 6. Return translations
  }
}
```

### MockProvider (Phase 1)

```typescript
class MockProvider implements ITranslationProvider {
  name = "mock";
  
  async translate(
    batch: IStringUnit[],
    options: {...}
  ): Promise<ITranslation[]> {
    // Pass-through: returns strings with [TRANSLATED] prefix
    // Useful for testing without API costs
  }
}
```

---

## Layout Engine

### Text Wrapping

```typescript
interface ILayoutResult {
  id: string;                       // Matches StringUnit.id
  original: string;
  translated: string;
  
  wrapped_lines: string[];          // Split by textbox width
  byte_fits?: boolean;             // Does it fit original byte limit?
  quality_issues?: string[];       // ["too_long", "cannot_wrap"]
}

class TextWrapEngine {
  constructor(lang: "ja" | "en") { }
  
  wrap(
    text: string,
    constraints: ITextboxConstraint
  ): ILayoutResult;
  
  // Helpers
  word_wrap(text: string, width: number): string[];
  preserve_control_codes(original: string, wrapped: string): string;
  estimate_byte_size(text: string, encoding: string): number;
}
```

### Usage

```typescript
const engine = new TextWrapEngine("en");

const result = engine.wrap(
  "This is a very long translated string that needs wrapping...",
  {
    id: "dialog_1",
    file: "ALSHARK.EXE",
    max_bytes: 32,
    line_limit: 3
  }
);

console.log(result.wrapped_lines);
// ["This is a very", "long translated", "string that..."]
```

---

## Patcher API

### In-Place Patcher (Phase 1)

```typescript
interface IPatchResult {
  id: string;                       // StringUnit.id
  success: boolean;
  offset: number;                  // Where patched in file
  
  original_size: number;           // Original string bytes
  patched_size: number;            // New string bytes
  overwrite_size?: number;         // Bytes written (may include padding)
  
  error?: string;                  // If !success
}

class InPlacePatcher {
  async patch(
    input_file: string,
    output_file: string,
    patches: {
      string_id: string;
      offset: number;
      original_bytes: Uint8Array;
      new_bytes: Uint8Array;
    }[]
  ): Promise<IPatchResult[]>;
}
```

### Usage

```typescript
const patcher = new InPlacePatcher();

const results = await patcher.patch(
  "alshark.exe",
  "alshark_patched.exe",
  [
    {
      string_id: "alshark_001_0x1000",
      offset: 0x1000,
      original_bytes: Buffer.from([...]),
      new_bytes: Buffer.from([...])
    }
  ]
);

for (const result of results) {
  if (result.success) {
    console.log(`Patched at 0x${result.offset.toString(16)}`);
  }
}
```

---

## CLI Interface

### Main Command

```bash
diskscribe [command] [options]
```

### Commands

#### `diskscribe run`

**Phase 1: Full end-to-end pipeline**

```bash
diskscribe run <input_path> [options]

Options:
  --output, -o <dir>        Output directory (default: ./project/)
  --profile <id>            Game profile (auto-detect if omitted)
  --provider <name>         Translation provider (default: mock)
  --style <style>           Translation style: natural|literal|literary
  --verbose                 Debug output
  --dry-run                 Don't write files

Example:
  diskscribe run alshark.fdi --output ./alshark_en/ --provider mock
```

#### `diskscribe extract` (Phase 2)

```bash
diskscribe extract <input_path> [options]

Options:
  --output, -o <file>       Output JSON (default: strings.json)
  --profile <id>            Game profile

Example:
  diskscribe extract alshark.fdi --output strings.json
```

#### `diskscribe translate` (Phase 3)

```bash
diskscribe translate <input_json> [options]

Options:
  --output, -o <file>       Output translations
  --provider <name>         Claude API provider
  --glossary <file>         Glossary JSON
  --style <style>           natural|literal|literary

Example:
  diskscribe translate strings.json --provider claude --glossary custom.json
```

#### `diskscribe config` (Phase 3)

```bash
diskscribe config <subcommand> [options]

Subcommands:
  set-key <api_key>         Store Claude API key
  show                      Display current config
  reset                     Clear all settings

Example:
  diskscribe config set-key sk-ant-v1-xxxxx...
  diskscribe config show
```

---

## Examples

### Example 1: Full Extraction + Translation Flow

```typescript
import {
  ContainerRegistry,
  ProfileRegistry,
  ProjectFactory,
  ProviderRegistry
} from 'diskscribe';

async function translate_alshark() {
  // 1. Detect and open container
  const container_type = await ContainerRegistry.detect('./alshark.fdi');
  const container = new ContainerFactory();
  const manifest = await container.open('./alshark.fdi');
  
  // 2. Detect and load profile
  const profile_id = ProfileRegistry.detect(manifest);
  const profile = ProfileRegistry.get(profile_id);
  
  // 3. Create project
  const project = new Project(`alshark_en_v1`);
  await project.init({
    input_path: './alshark.fdi',
    container_type,
    profile_id,
    target_lang: 'en',
    provider: 'mock'  // Use mock first for testing
  });
  
  // 4. Extract strings
  const extractor = new PC98Extractor(profile);
  const strings = await extractor.extract(manifest);
  project.set_strings(strings);
  project.mark_stage_done('extraction');
  
  // 5. Translate
  const provider = ProviderRegistry.get('mock');
  const translations = await provider.translate(
    strings.untranslated(),
    {
      source_lang: 'ja',
      target_lang: 'en',
      glossary: TranslationGlossary.load_default()
    }
  );
  project.set_translations(new TranslationTable(translations));
  project.mark_stage_done('translation');
  
  // 6. Layout + wrap text
  const layout_engine = new TextWrapEngine('en');
  const layout_results = [];
  for (const string_unit of strings.all()) {
    const translation = project.get_translations().get(string_unit.id);
    if (translation) {
      const result = layout_engine.wrap(
        translation.translated,
        profile.textbox_constraints[0]
      );
      layout_results.push(result);
    }
  }
  project.mark_stage_done('layout');
  
  // 7. Patch
  const patcher = new InPlacePatcher();
  const patch_results = await patcher.patch(
    './alshark.fdi',
    './alshark_en.fdi',
    layout_results.map(r => ({
      string_id: r.id,
      offset: strings.get(r.id).offset,
      original_bytes: Buffer.from(strings.get(r.id).text_raw, 'binary'),
      new_bytes: Buffer.from(r.final_bytes, 'binary')
    }))
  );
  project.mark_stage_done('patching');
  
  // 8. Save project
  await project.export_project('./alshark_en_project/');
  
  console.log('✅ Translation complete!');
  console.log('Output: ./alshark_en_project/');
}
```

### Example 2: Using CLI for Same Task

```bash
# Extract strings
diskscribe extract alshark.fdi --output strings.json --profile alshark_pc98

# Translate with mock provider (free)
diskscribe translate strings.json \
  --output translations.json \
  --provider mock \
  --glossary ~/.diskscribe/glossary.json

# Full pipeline (if run command available)
diskscribe run alshark.fdi \
  --output ./alshark_en_project/ \
  --profile alshark_pc98 \
  --provider mock
```

### Example 3: Custom Plugin

```typescript
// Create new container plugin
class CustomZipPlugin implements IContainerPlugin {
  container_type = "custom_zip";
  description = "Custom ZIP with metadata";
  version = "1.0";
  
  async can_handle(input: string | Buffer): Promise<boolean> {
    if (typeof input === 'string') {
      return input.endsWith('.custom.zip');
    }
    // Check magic bytes
    return input.readUInt32BE(0) === 0x504B0304;
  }
  
  async open(input_path: string): Promise<ContainerManifest> {
    // Implementation...
  }
  
  async extract(
    manifest: ContainerManifest,
    file_path: string,
    output_path: string
  ): Promise<Buffer> {
    // Implementation...
  }
  
  list_files(manifest: ContainerManifest): string[] {
    // Implementation...
  }
}

// Register
ContainerRegistry.register(new CustomZipPlugin());

// Now diskscribe can handle .custom.zip files
```

---

## Error Handling

All APIs use standard error patterns:

```typescript
try {
  const project = new Project('id');
  await project.init(config);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid config:', error.message);
  } else if (error instanceof NotFoundError) {
    console.error('File not found:', error.path);
  } else if (error instanceof APIError) {
    console.error('Claude API failed:', error.status, error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

**Error Types:**
- `ValidationError`: Invalid input parameters
- `NotFoundError`: File/resource not found
- `APIError`: External API (Claude, etc.) failed
- `IOError`: File system operation failed
- `ParseError`: Failed to parse data (JSON, FDI, etc.)

---

**See [ROADMAP-DETAILED.md](ROADMAP-DETAILED.md) for implementation timeline and [CLAUDE-PROVIDER-SPEC.md](CLAUDE-PROVIDER-SPEC.md) for Phase 3 details.**

