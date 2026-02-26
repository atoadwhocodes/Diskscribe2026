# DiskScribe2026: Plugin Development Guide

**Purpose:** Step-by-step guide for creating and integrating custom plugins  
**Audience:** Plugin developers extending DiskScribe2026  
**Version:** 1.0 (Feb 26, 2026)

---

## Table of Contents

1. [Plugin Architecture Overview](#plugin-architecture-overview)
2. [Container Plugins](#container-plugins)
3. [Game Profiles](#game-profiles)
4. [Translation Providers](#translation-providers)
5. [Testing Plugins](#testing-plugins)
6. [Publishing & Distribution](#publishing--distribution)

---

## Plugin Architecture Overview

DiskScribe2026 uses a **registry-based plugin system** where each plugin type (containers, profiles, providers) is registered at runtime.

### Plugin Types

```
┌──────────────────────────┐
│   DiskScribe Registry    │
├──────────────────────────┤
│ ContainerRegistry        │  ← Manage container formats
│ ProfileRegistry          │  ← Manage game profiles
│ ProviderRegistry         │  ← Manage translation sources
└──────────────────────────┘
```

### Plugin Lifecycle

```
1. Define (implement interface)
    ↓
2. Register (plugin_id → instance)
    ↓
3. Detect (auto-detect input matches plugin?)
    ↓
4. Initialize (load config, connect to API)
    ↓
5. Use (process data through plugin)
    ↓
6. Cleanup (close connections, save state)
```

---

## Container Plugins

### What is a Container Plugin?

A **container** is a file format that holds game files:
- **FDI:** PC-98 floppy disk image
- **ZIP:** Standard ZIP archive
- **ISO9660:** CD-ROM standard
- **Folder:** Loose files on disk

Plugins extract files from these containers.

### Creating a Container Plugin

#### Step 1: Implement the Interface

Create `src/containers/my_format.ts`:

```typescript
import { IContainerPlugin } from './base';
import { ContainerManifest, IFileEntry } from '../core';

export class MyFormatPlugin implements IContainerPlugin {
  container_type = "my_format";
  description = "Support for .myf files";
  version = "1.0.0";
  
  // Required: Detect if input is your format
  async can_handle(input: string | Buffer): Promise<boolean> {
    if (typeof input === 'string') {
      // Check file extension
      return input.toLowerCase().endsWith('.myf');
    }
    
    // Check magic bytes
    const magic = input.readUInt32BE(0);
    return magic === 0x4D594600;  // "MYF\0"
  }
  
  // Required: Parse container and return file listing
  async open(input_path: string): Promise<ContainerManifest> {
    const fs = require('fs');
    const buffer = fs.readFileSync(input_path);
    
    // Parse your format
    const files: IFileEntry[] = this.parse_files(buffer);
    
    return {
      container_id: input_path,
      container_type: this.container_type,
      size_bytes: buffer.length,
      created_at: new Date().toISOString(),
      files
    };
  }
  
  // Required: Extract a single file
  async extract(
    manifest: ContainerManifest,
    file_path: string,
    output_path: string
  ): Promise<Buffer> {
    const fs = require('fs');
    const path = require('path');
    
    const entry = manifest.files.find(f => f.path === file_path);
    if (!entry) throw new Error(`File not found: ${file_path}`);
    
    // Read from disk
    const container_buffer = fs.readFileSync(manifest.container_id);
    const file_data = container_buffer.slice(
      entry.offset,
      entry.offset + entry.size
    );
    
    // Write to output
    fs.mkdirSync(path.dirname(output_path), { recursive: true });
    fs.writeFileSync(output_path, file_data);
    
    return file_data;
  }
  
  // Required: List all files in container
  list_files(manifest: ContainerManifest): string[] {
    return manifest.files.map(f => f.path);
  }
  
  // Helper: Parse your format
  private parse_files(buffer: Buffer): IFileEntry[] {
    const files: IFileEntry[] = [];
    
    // Read header (example: 8 bytes = version + file count)
    const version = buffer.readUInt32BE(0);
    const file_count = buffer.readUInt32BE(4);
    
    // Read file entries (example: 32 bytes each)
    let offset = 8;
    for (let i = 0; i < file_count; i++) {
      const entry_offset = offset;
      offset += 32;
      
      // Parse entry
      const name_bytes = buffer.slice(entry_offset, entry_offset + 16);
      const path = name_bytes.toString('utf8').split('\0')[0];
      
      const file_offset = buffer.readUInt32BE(entry_offset + 16);
      const file_size = buffer.readUInt32BE(entry_offset + 20);
      
      files.push({
        path,
        offset: file_offset,
        size: file_size,
        encoding: 'shift_jis'
      });
    }
    
    return files;
  }
}
```

#### Step 2: Register the Plugin

In `src/containers/index.ts` or main initialization:

```typescript
import { ContainerRegistry } from './registry';
import { MyFormatPlugin } from './my_format';

// Register
ContainerRegistry.register(new MyFormatPlugin());

// Now diskscribe can auto-detect .myf files!
```

#### Step 3: Test

```bash
npm test -- src/containers/__tests__/my_format.test.ts
```

Example test:

```typescript
import { MyFormatPlugin } from '../my_format';

describe('MyFormatPlugin', () => {
  let plugin: MyFormatPlugin;
  
  beforeEach(() => {
    plugin = new MyFormatPlugin();
  });
  
  test('can_handle detects .myf files', async () => {
    const result = await plugin.can_handle('game.myf');
    expect(result).toBe(true);
  });
  
  test('can_handle rejects other formats', async () => {
    const result = await plugin.can_handle('game.zip');
    expect(result).toBe(false);
  });
  
  test('open parses manifest', async () => {
    // Create test file
    const manifest = await plugin.open('test_fixtures/sample.myf');
    expect(manifest.files.length).toBeGreaterThan(0);
  });
  
  test('extract returns file data', async () => {
    const manifest = await plugin.open('test_fixtures/sample.myf');
    const data = await plugin.extract(
      manifest,
      manifest.files[0].path,
      '/tmp/extracted'
    );
    expect(data.length).toBeGreaterThan(0);
  });
});
```

---

## Game Profiles

### What is a Game Profile?

A **profile** describes how to extract strings from a specific game:
- **Detection:** Which files belong to this game?
- **Extraction:** Where are the strings stored? (pointer table, heuristic)
- **Constraints:** How big are textboxes?
- **Patching:** How to put translations back?

### Creating a Game Profile

#### Step 1: Implement the Interface

Create `src/profiles/my_game.ts`:

```typescript
import { IGameProfile, ITextboxConstraint } from './base';

export class MyGameProfile implements IGameProfile {
  profile_id = "my_game_pc98";
  name = "My Game";
  system_family = "pc98";
  container_types = ["pc98_fdi"];
  
  // How to detect this game?
  detection = {
    file_patterns: ["GAME.EXE"],
    byte_signatures: [{
      offset: 0x10,
      bytes: Buffer.from([0x4D, 0x59, 0x47, 0x41])  // "MYGA"
    }]
  };
  
  // Encoding
  encoding = {
    character_set: "shift_jis",
    newline_byte: 0x0A
  };
  
  // How to find strings?
  text_extraction = {
    method: "pointer_table" as const,
    pointer_tables: [{
      file: "GAME.EXE",
      offset: 0x5000,      // Where pointer table starts
      count: 1500,         // How many pointers
      pointer_format: "uint32_le"
    }]
  };
  
  // Display constraints (for wrapping)
  textbox_constraints: ITextboxConstraint[] = [
    {
      id: "dialog_main",
      file: "GAME.EXE",
      max_bytes: 32,       // Max characters to fit
      line_limit: 4,       // Max lines
      char_width: 8        // Pixels per character
    },
    {
      id: "menu_item",
      file: "GAME.EXE",
      max_bytes: 20,
      line_limit: 1
    }
  ];
  
  // How to patch?
  patching = {
    method: "inplace" as const,
    free_space_regions: [
      {offset: 0x10000, size: 0x2000},
      {offset: 0x20000, size: 0x5000}
    ],
    max_string_size: 64,
    overwrite_limit: 20   // Can expand strings 20% over original
  };
}
```

#### Step 2: Generate from Template

If you don't want to write from scratch, use a template:

```typescript
// Generic PC-98 profile (use as base)
export class GenericPC98Profile implements IGameProfile {
  profile_id = "generic_pc98";
  name = "Generic PC-98 Game";
  system_family = "pc98";
  container_types = ["pc98_fdi"];
  
  detection = {
    file_patterns: ["*.EXE"],  // Matches any .EXE
    byte_signatures: []
  };
  
  encoding = {
    character_set: "shift_jis",
    newline_byte: 0x0A
  };
  
  text_extraction = {
    method: "heuristic" as const,
    heuristic_rules: [
      "jp_chars_in_sequence",
      "printable_len_gt_4"
    ]
  };
  
  textbox_constraints = [
    {
      id: "default",
      file: "*",
      max_bytes: 32,
      line_limit: 4
    }
  ];
  
  patching = {
    method: "inplace" as const,
    max_string_size: 64,
    overwrite_limit: 15
  };
}
```

#### Step 3: Register

In `src/profiles/index.ts`:

```typescript
import { ProfileRegistry } from './registry';
import { MyGameProfile } from './my_game';

ProfileRegistry.register(new MyGameProfile());
```

#### Step 4: Test with Real Game

```bash
# Extract strings using your profile
diskscribe extract test_fixtures/my_game.fdi \
  --profile my_game_pc98 \
  --output extracted_strings.json

# Inspect results
cat extracted_strings.json | jq '.strings | length'
# Should show number of extracted strings
```

---

## Translation Providers

### What is a Translation Provider?

A **provider** translates strings using an external API or local model:
- **Claude API** (Phase 3)
- **OpenAI API** (Phase 3)
- **Local Model** (Phase 5)
- **Mock** (for testing)

### Creating a Translation Provider

#### Step 1: Implement the Interface

Create `src/translate/my_provider.ts`:

```typescript
import { ITranslationProvider } from './base';
import { IStringUnit } from '../core/string_table';
import { ITranslation } from '../core/translation_table';

export class MyProviderPlugin implements ITranslationProvider {
  name = "my_provider";
  version = "1.0.0";
  
  private api_key: string;
  private base_url: string;
  
  constructor(api_key: string, base_url: string = "https://api.example.com") {
    this.api_key = api_key;
    this.base_url = base_url;
  }
  
  // Check if provider is accessible
  async is_available(): Promise<boolean> {
    try {
      const response = await fetch(`${this.base_url}/health`, {
        headers: { 'Authorization': `Bearer ${this.api_key}` }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  // Main translation method
  async translate(
    batch: IStringUnit[],
    options: {
      source_lang: string;
      target_lang: string;
      glossary?: any;
      context?: string;
      style?: "natural" | "literal" | "literary";
    }
  ): Promise<ITranslation[]> {
    const results: ITranslation[] = [];
    
    // Build request
    const prompt = this.build_prompt(batch, options);
    
    const request = {
      prompt,
      source_lang: options.source_lang,
      target_lang: options.target_lang,
      style: options.style || "natural",
      batch_size: batch.length
    };
    
    // Call API
    const response = await fetch(`${this.base_url}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const translations = await response.json();
    
    // Map API response to ITranslation format
    for (let i = 0; i < batch.length; i++) {
      const string_unit = batch[i];
      const translated = translations[i];
      
      results.push({
        id: string_unit.id,
        source_lang: options.source_lang,
        target_lang: options.target_lang,
        original: string_unit.text_clean,
        translated: translated.text,
        provider: this.name,
        cost: {
          input_tokens: translated.input_tokens,
          output_tokens: translated.output_tokens,
          cost_usd: translated.cost
        },
        quality_score: translated.quality || 75,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    return results;
  }
  
  // Helper: Build prompt for API
  private build_prompt(
    batch: IStringUnit[],
    options: any
  ): string {
    let prompt = `Translate the following ${options.source_lang} text to ${options.target_lang}.\n`;
    prompt += `Style: ${options.style || 'natural'}\n`;
    prompt += `Context: ${options.context || 'game dialogue'}\n\n`;
    
    if (options.glossary) {
      prompt += "Glossary:\n";
      for (const [key, value] of Object.entries(options.glossary)) {
        prompt += `\n${key} → ${value}`;
      }
      prompt += "\n\n";
    }
    
    prompt += "Strings to translate:\n";
    for (const unit of batch) {
      prompt += `\n[${unit.id}] ${unit.text_clean}`;
    }
    
    return prompt;
  }
}
```

#### Step 2: Configuration

Create `~/.diskscribe.json`:

```json
{
  "providers": {
    "my_provider": {
      "api_key": "sk-xxxxx...",
      "base_url": "https://api.example.com",
      "default_style": "natural"
    }
  }
}
```

#### Step 3: Register

In `src/translate/index.ts`:

```typescript
import { ProviderRegistry } from './registry';
import { MyProviderPlugin } from './my_provider';

const api_key = process.env.MY_PROVIDER_KEY || config.providers.my_provider?.api_key;
ProviderRegistry.register(new MyProviderPlugin(api_key));
```

#### Step 4: Test

```typescript
import { MyProviderPlugin } from '../my_provider';
import { StringTable } from '../../core/string_table';

describe('MyProviderPlugin', () => {
  let provider: MyProviderPlugin;
  
  beforeEach(() => {
    provider = new MyProviderPlugin('test-key', 'http://localhost:3000');
  });
  
  test('translates batch of strings', async () => {
    const batch = [
      {
        id: 'test_001',
        text_clean: 'Hello',
        category: 'dialog'
      } as any
    ];
    
    const results = await provider.translate(batch, {
      source_lang: 'ja',
      target_lang: 'en'
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].translated).toBeTruthy();
  });
});
```

---

## Testing Plugins

### Unit Tests

Each plugin should have unit tests:

```bash
npm test -- src/containers/__tests__/my_format.test.ts
npm test -- src/profiles/__tests__/my_game.test.ts
npm test -- src/translate/__tests__/my_provider.test.ts
```

### Integration Tests

Test plugins working together:

```typescript
// tests/integration/custom_plugin_workflow.test.ts

import { ContainerRegistry } from '../../src/containers/registry';
import { ProfileRegistry } from '../../src/profiles/registry';
import { Project } from '../../src/core/project';

describe('Custom Plugin Workflow', () => {
  test('extract with custom container + profile', async () => {
    // Setup custom plugins
    register_custom_plugins();
    
    // Create project
    const project = new Project('custom_game_en');
    await project.init({
      input_path: 'test_fixtures/custom_game.myf',
      container_type: 'my_format',
      profile_id: 'my_game_pc98',
      target_lang: 'en'
    });
    
    // Extract
    const extractor = new GameExtractor(project.config.profile_id);
    const strings = await extractor.extract(project);
    
    expect(strings.count()).toBeGreaterThan(0);
    expect(project.strings).toBeDefined();
  });
});
```

### Acceptance Tests

Test end-to-end pipeline:

```bash
# Full pipeline with custom plugin
diskscribe run test_fixtures/my_game.myf \
  --output ./test_output/ \
  --profile my_game_pc98 \
  --provider mock \
  --verbose

# Verify output
ls -la test_output/
# Should contain: project.json, strings.json, translations.json, patch.report
```

---

## Publishing & Distribution

### Option 1: Share as NPM Package

```bash
# Create scope
npm init --scope=@diskscribe-plugins

# Add your plugins to package.json
cat > package.json << EOF
{
  "name": "@diskscribe-plugins/my-game",
  "version": "1.0.0",
  "description": "DiskScribe plugin for My Game",
  "main": "dist/index.js",
  "peerDependencies": {
    "diskscribe2026": "^1.0.0"
  },
  "files": ["dist/", "README.md"]
}
EOF

# Build and publish
npm run build
npm publish
```

Then users can install:

```bash
npm install @diskscribe-plugins/my-game
```

### Option 2: Share as GitHub Repo

```bash
git init diskscribe-plugin-my-game
git add src/ tests/ package.json tsconfig.json
git push origin main
```

Users clone and use locally:

```bash
git clone https://github.com/yourname/diskscribe-plugin-my-game.git
cd diskscribe-plugin-my-game
npm install
npm run build
# Then import in your diskscribe project
```

### Option 3: Contribute to Official repo

1. Fork [diskscribe2026](https://github.com/)
2. Create feature branch: `git checkout -b plugin/my-game`
3. Add plugin to appropriate directory
4. Add tests and documentation
5. Create pull request

Example PR template:

```markdown
# Add My Game Profile

- Plugin type: Game Profile
- Game: My Game (PC-98)
- Container: PC98 FDI
- Strings: ~1500
- Author: @yourname

## Changes
- Added `src/profiles/my_game.ts` with full extraction logic
- Added `src/profiles/__tests__/my_game.test.ts` with 100% coverage
- Added documentation to README

## Tested with
- Fixture: `test_fixtures/my_game_sample.fdi`
- Extracted: 1547 strings
- Coverage: 95%

## Checklist
- [x] Tests pass: `npm test`
- [x] No TypeScript errors: `npm run typecheck`
- [x] Documented: README + inline comments
- [x] Example: `npm run example -- --profile my_game_pc98`
```

---

## Plugin Checklist

Before publishing your plugin, ensure:

### Code Quality
- [ ] Implements interface properly (no syntax errors)
- [ ] TypeScript compiles without errors
- [ ] Follows ESLint rules (run `npm run lint`)
- [ ] No console.log or debug() calls
- [ ] Error handling for all external I/O

### Testing
- [ ] Unit tests: `npm test`
- [ ] Coverage > 80%: `npm run coverage`
- [ ] Integration test with real game
- [ ] Edge cases tested (missing files, corrupted data)

### Documentation
- [ ] README with example usage
- [ ] Inline code comments for complex logic
- [ ] API.md updated with plugin info
- [ ] Example configuration in comment

### Performance
- [ ] Extracts game in < 30 seconds
- [ ] Memory usage < 500MB for large games
- [ ] No memory leaks (run under --inspect)

### Security
- [ ] No hardcoded credentials
- [ ] No debug output logs sensitive data
- [ ] Input validation on all user-provided data
- [ ] No unsafe eval() or require()

---

## Troubleshooting

### Plugin not detected

```bash
# Check if registered
diskscribe config list-plugins

# If missing, ensure plugin is registered in src/index.ts or config
```

### Extraction produces wrong results

```bash
# Test container plugin separately
npm test -- src/containers/__tests__/my_format.test.ts

# Verify offsets with hex dump
hexdump -C test_fixtures/my_game.myf | head -20

# Check profile detection rules
diskscribe scan test_fixtures/my_game.fdi --verbose
```

### Memory issues on large games

```bash
# Check memory usage
node --inspect-brk node_modules/.bin/diskscribe run large_game.fdi

# Use streaming if available (Phase 5+)
diskscribe run large_game.fdi --stream --output ./project/
```

---

**See [API.md](API.md) for detailed interface documentation and [examples](EXAMPLES.md) for working code.**

