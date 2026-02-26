# DiskScribe2026: Examples & Workflows

**Purpose:** Real-world examples showing how to use DiskScribe2026  
**Audience:** Users, integrators, game translators  
**Version:** 1.0 (Feb 26, 2026)

---

## Table of Contents

1. [Command-Line Examples](#command-line-examples)
2. [Programmatic API Examples](#programmatic-api-examples)
3. [Workflow Scenarios](#workflow-scenarios)
4. [Advanced Customization](#advanced-customization)

---

## Command-Line Examples

### Example 1: Extract Strings from Alshark (FDI Image)

**Goal:** Extract all Japanese text from Alshark.EXE in an FDI disk image

```bash
# Basic extraction (auto-detects profile)
diskscribe extract alshark.fdi \
  --output ./alshark_strings.json

# With explicit profile
diskscribe extract alshark.fdi \
  --profile alshark_pc98 \
  --output ./alshark_strings.json

# Verbose output for debugging
diskscribe extract alshark.fdi \
  --profile alshark_pc98 \
  --output ./alshark_strings.json \
  --verbose

# Result: JSON file with 2500+ strings
cat alshark_strings.json | jq '.strings | length'
# Output: 2547
```

**Output format** (`alshark_strings.json`):

```json
{
  "project_id": "alshark_extraction",
  "strings": [
    {
      "id": "alshark_001_0x1000",
      "source_file": "ALSHARK.EXE",
      "offset": 4096,
      "text_raw": "こんにちは\x00",
      "text_clean": "こんにちは",
      "control_codes": [],
      "category": "dialog",
      "max_bytes": 32,
      "line_limit": 3
    },
    {
      "id": "alshark_002_0x1020",
      "source_file": "ALSHARK.EXE",
      "offset": 4128,
      "text_raw": "敵を倒せ！\x00",
      "text_clean": "敵を倒せ！",
      "control_codes": [
        {"type": "color", "offset": 5, "value": [0xFF, 0x00]}
      ],
      "category": "battle",
      "max_bytes": 24,
      "line_limit": 2
    }
  ],
  "stats": {
    "total": 2547,
    "by_category": {
      "dialog": 1200,
      "menu": 800,
      "battle": 400,
      "description": 147
    }
  }
}
```

---

### Example 2: Translate with Mock Provider (Free Testing)

**Goal:** Test the full pipeline without API costs

```bash
# 1. Extract
diskscribe extract alshark.fdi \
  --profile alshark_pc98 \
  --output ./alshark_strings.json

# 2. Translate (mock: passes through with [TRANSLATED] prefix)
diskscribe translate ./alshark_strings.json \
  --provider mock \
  --style natural \
  --output ./alshark_translations.json

# 3. Verify translations
cat alshark_translations.json | jq '.translations | length'
# Output: 2547

# 4. Layout (wrap text to fit textboxes)
diskscribe layout ./alshark_translations.json \
  --profile alshark_pc98 \
  --output ./alshark_layout.json

# 5. Patch (create patched disk image)
diskscribe patch alshark.fdi \
  --layout ./alshark_layout.json \
  --output ./alshark_en.fdi

# Result: alshark_en.fdi (English version)
ls -lh alshark*.fdi
# -rw-r--r-- 1 user  1.44M  alshark.fdi
# -rw-r--r-- 1 user  1.44M  alshark_en.fdi
```

---

### Example 3: Translate with Claude API (Phase 3)

**Goal:** Use Claude Sonnet for high-quality translations

```bash
# Set API key
diskscribe config set-key sk-ant-v1-YOUR-KEY-HERE

# Or verify config
diskscribe config show
# Output:
#   claude_api_key: sk-ant-v1-***
#   default_provider: claude
#   cache_dir: ~/.diskscribe_cache

# Translate with Claude (first run: 2-3 min)
diskscribe translate ./alshark_strings.json \
  --provider claude \
  --style natural \
  --glossary ~/.diskscribe/alshark_glossary.json \
  --output ./alshark_translations.json \
  --verbose

# Cost estimation
# Input: 25000 tokens (~$0.075)
# Output: 15000 tokens (~$0.225)
# Total: ~$0.30
# Cache created for future runs

# Rerun (cached): < 30 seconds
diskscribe translate ./alshark_strings.json \
  --provider claude \
  --style natural \
  --glossary ~/.diskscribe/alshark_glossary.json \
  --output ./alshark_translations_v2.json

# Cost: ~$0.05 (cache hit)
```

---

### Example 4: Full Pipeline in One Command

**Goal:** Extract → Translate → Layout → Patch in one go

```bash
# Phase 1 MVP: simple end-to-end
diskscribe run alshark.fdi \
  --output ./alshark_en_project/ \
  --profile alshark_pc98 \
  --provider mock \
  --dry-run  # Don't write, just show what would happen

# Once verified, actually run it
diskscribe run alshark.fdi \
  --output ./alshark_en_project/ \
  --profile alshark_pc98 \
  --provider mock \
  --verbose

# Result directory structure:
# alshark_en_project/
# ├── project.json              # Metadata
# ├── extracted/
# │   └── strings.json          # All 2547 strings
# ├── translated/
# │   └── translations.json     # Translations + costs
# ├── layout/
# │   └── layout.json           # Wrapped text per textbox
# ├── patched/
# │   └── alshark_en.fdi        # Final patched image
# └── patch.report              # Summary of changes
```

---

### Example 5: Extract Specific Category Only

**Goal:** Extract only dialog strings (for quick translation test)

```bash
# Extract all
diskscribe extract alshark.fdi --output all_strings.json

# Filter to dialog only (using jq)
cat all_strings.json | jq '.strings[] | select(.category == "dialog")' \
  > dialog_only.json

# Translate just dialog
diskscribe translate dialog_only.json \
  --provider mock \
  --output dialog_translated.json

# Much faster (only 1200 strings instead of 2547)
```

---

### Example 6: Apply Custom Glossary

**Goal:** Ensure consistent terminology using a glossary

Create `glossary.json`:

```json
{
  "敵": "Enemy",
  "倒す": "Defeat",
  "魔法": "Magic",
  "HP": "HP",
  "MP": "MP",
  "勇者": "Hero"
}
```

Use it:

```bash
diskscribe translate ./alshark_strings.json \
  --provider claude \
  --glossary ./glossary.json \
  --output ./alshark_translations.json

# Claude will respect these mappings in translations
```

---

## Programmatic API Examples

### Example 1: Extract and Inspect in Code

```typescript
import { 
  ContainerFactory, 
  ProfileRegistry, 
  GameExtractor,
  StringTable 
} from 'diskscribe';

async function extract_and_inspect() {
  // Open container
  const container_factory = new ContainerFactory();
  const manifest = await container_factory.open('./alshark.fdi');
  
  console.log(`Container: ${manifest.container_id}`);
  console.log(`Files: ${manifest.files.length}`);
  
  // Detect profile
  const profile_id = ProfileRegistry.detect(manifest);
  const profile = ProfileRegistry.get(profile_id);
  
  console.log(`Profile: ${profile.name}`);
  
  // Extract strings
  const extractor = new GameExtractor(profile);
  const strings = await extractor.extract(manifest);
  
  // Inspect
  console.log(`Total strings: ${strings.count()}`);
  console.log(`Dialog: ${strings.by_category('dialog').length}`);
  console.log(`Menu: ${strings.by_category('menu').length}`);
  console.log(`Battle: ${strings.by_category('battle').length}`);
  
  // Show first 10 strings
  for (const unit of strings.all().slice(0, 10)) {
    console.log(`[${unit.id}] ${unit.text_clean}`);
  }
  
  // Save to JSON
  await strings.save_json('./extracted_strings.json');
}

extract_and_inspect().catch(console.error);
```

---

### Example 2: Translate Programmatically with Caching

```typescript
import {
  ProviderRegistry,
  TranslationTable,
  TranslationCache,
  CostTracker
} from 'diskscribe';
import fs from 'fs';

async function translate_with_caching() {
  // Load strings
  const strings_json = fs.readFileSync('./extracted_strings.json', 'utf-8');
  const strings_data = JSON.parse(strings_json);
  
  // Get provider
  const provider = ProviderRegistry.get('claude');
  if (!provider) throw new Error('Claude provider not registered');
  
  // Check cache before API calls
  const cache = new TranslationCache();
  const cached_count = 0;
  const uncached = [];
  
  for (const string_unit of strings_data.strings) {
    const cached = await cache.get(string_unit.id);
    if (cached) {
      cached_count++;
    } else {
      uncached.push(string_unit);
    }
  }
  
  console.log(`Cache hit: ${cached_count}/${strings_data.strings.length}`);
  console.log(`Need translation: ${uncached.length}`);
  
  // Translate uncached
  const cost_tracker = new CostTracker();
  const translations = [];
  
  if (uncached.length > 0) {
    const translation_results = await provider.translate(
      uncached,
      {
        source_lang: 'ja',
        target_lang: 'en',
        style: 'natural'
      }
    );
    
    translations.push(...translation_results);
    
    // Track cost
    for (const t of translation_results) {
      cost_tracker.add_translation(t.cost);
    }
  }
  
  // Save all (cached + new)
  const translation_table = new TranslationTable(translations);
  await translation_table.save_json('./translations.json');
  
  // Report
  console.log(`\n--- Cost Report ---`);
  console.log(`Total cost: $${cost_tracker.total_usd().toFixed(4)}`);
  console.log(`Input tokens: ${cost_tracker.input_tokens()}`);
  console.log(`Output tokens: ${cost_tracker.output_tokens()}`);
}

translate_with_caching().catch(console.error);
```

---

### Example 3: Custom Extraction Heuristic

```typescript
import { StringTable, IStringUnit } from 'diskscribe';

// Custom heuristic for finding strings
function find_strings_heuristic(buffer: Buffer): string[] {
  const strings: string[] = [];
  let current = '';
  
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    
    // Shift-JIS: high bytes (0x81-0x9F, 0xE0-0xEF)
    const is_high_byte = (byte >= 0x81 && byte <= 0x9F) || 
                         (byte >= 0xE0 && byte <= 0xEF);
    
    if (is_high_byte) {
      // Multi-byte character, consume both bytes
      current += String.fromCharCode(byte);
      i++;
      if (i < buffer.length) {
        current += String.fromCharCode(buffer[i]);
      }
    } else if (byte >= 0x20 && byte <= 0x7E) {
      // ASCII printable
      current += String.fromCharCode(byte);
    } else if (byte === 0x00 && current.length > 4) {
      // Null terminator and string is long enough
      strings.push(current);
      current = '';
    } else {
      current = '';
    }
  }
  
  return strings;
}

// Use in extraction
async function extract_with_heuristic() {
  const fs = require('fs');
  const buffer = fs.readFileSync('./GAME.EXE');
  const found_strings = find_strings_heuristic(buffer);
  
  console.log(`Found ${found_strings.length} strings using heuristic`);
  
  // Create string units
  const table = new StringTable();
  for (let i = 0; i < found_strings.length; i++) {
    table.add({
      id: `extracted_${i}`,
      source_file: 'GAME.EXE',
      offset: 0,  // Would need to track actual offset
      text_raw: found_strings[i],
      text_clean: found_strings[i],
      control_codes: [],
      category: 'unknown'
    } as IStringUnit);
  }
  
  return table;
}
```

---

### Example 4: Build Patch Report

```typescript
import { Project } from 'diskscribe';

async function generate_patch_report() {
  // Load completed project
  const project = new Project('alshark_en');
  await project.load('./alshark_en_project/project.json');
  
  // Get report
  const translations = project.get_translations();
  const layout = project.get_layout_result();
  
  const report = {
    project_id: project.project_id,
    timestamp: new Date().toISOString(),
    input_file: project.config.input_path,
    output_file: 'alshark_en.fdi',
    
    statistics: {
      total_strings: translations.all().length,
      translated: translations.translated().length,
      quality_avg: translations.quality_avg(),
      cost_total_usd: translations.cost_total_usd()
    },
    
    stage_status: {
      extraction: project.stages.extraction.status,
      translation: project.stages.translation.status,
      layout: project.stages.layout.status,
      patching: project.stages.patching.status
    },
    
    string_categories: {
      dialog: translations.by_category('dialog').length,
      menu: translations.by_category('menu').length,
      battle: translations.by_category('battle').length,
      description: translations.by_category('description').length
    },
    
    tokens_used: {
      input: translations.tokens_used().input,
      output: translations.tokens_used().output
    }
  };
  
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}
```

---

## Workflow Scenarios

### Scenario 1: Solo Developer (Game Hobbyist)

**Goal:** Translate Alshark to English, solo, minimized costs

```bash
# Week 1: Setup & Test
diskscribe extract alshark.fdi --output strings.json
diskscribe translate strings.json --provider mock --output mock_translations.json
diskscribe run alshark.fdi --provider mock --output test_project/

# Test game in emulator
# If good, proceed to real translation

# Week 2: Translate with Claude
diskscribe config set-key sk-ant-v1-YOUR-KEY
diskscribe translate strings.json --provider claude --output translations.json

# Cost: $0.27 (first run)

# Week 3: Layout & Patch
diskscribe layout translations.json --output layout.json
diskscribe patch alshark.fdi --layout layout.json --output alshark_en.fdi

# Final test in emulator
# Game boots, menus work, text visible ✓

# Cost for project: $0.27 + labor
# Time: ~20 hours (mostly manual review & iteration)
```

---

### Scenario 2: Translation Team (Studio)

**Goal:** Translate 5 games simultaneously with glossary consistency

```bash
# Setup shared glossary
cat > studio_glossary.json << EOF
{
  "敵": "Enemy",
  "勇者": "Hero",
  "魔法": "Magic",
  "呪文": "Spell",
  "HP": "HP",
  "MP": "MP",
  "経験値": "Experience",
  "レベル": "Level"
}
EOF

# Extract all 5 games
for game in alshark.fdi fantasy_ogre.fdi rance.fdi; do
  diskscribe extract $game --output ${game%.fdi}_strings.json
done

# Translate with shared glossary
for game in alshark fantasy_ogre rance; do
  diskscribe translate ${game}_strings.json \
    --provider claude \
    --glossary studio_glossary.json \
    --output ${game}_translations.json &
done
wait

# Cost for 5 games: $1.35 (first run)
# Cache hits on reruns: 80% reduction

# Quality review
# Assign 2-3 translators per game
# Edit translations.json files manually
# Iterate with Claude if needed

# Final patch for all games
for game in alshark fantasy_ogre rance; do
  diskscribe run ${game}.fdi \
    --output ./${game}_en_project/ \
    --glossary studio_glossary.json \
    --provider claude &
done
wait

# Cost per game: $0.27 base + $0.10 glossary cache
# Total: $1.85
# ROI: Professional translation would cost $500+ per game
```

---

### Scenario 3: Content Preservation Archive

**Goal:** Extract all text from games for archival/research

```bash
# Create archive project structure
mkdir game_archive
cd game_archive

# Extract 20 games at once
for game in *.fdi; do
  echo "Extracting $game..."
  diskscribe extract "$game" --output "${game%.fdi}_strings.json" &
done
wait

# Aggregate all strings
diskscribe merge *.json --output all_games_archive.json

# Generate statistics
# Most common words, character counts, etc.
jq '.strings | length' all_games_archive.json

# Export to CSV for research
diskscribe export all_games_archive.json --format csv --output all_games.csv

# Result: All text from 20 games in searchable, reproducible format
```

---

### Scenario 4: Continuous Translation (Mod Community)

**Goal:** Keep English translation synced with game updates

```bash
# Initial state
diskscribe run game_v1.0.fdi \
  --output ./translation_project/ \
  --provider claude \
  --save-cache

# 6 months later: game_v1.1 released

# Check what changed
diskscribe extract game_v1.1.fdi --output strings_v1.1.json

# Re-translate (cache helps!)
# Only new/modified strings hit API
diskscribe translate strings_v1.1.json \
  --provider claude \
  --glossary studio_glossary.json \
  --output translations_v1.1.json

# Cost of update: $0.05 (only 200 new strings)
# Saved: $0.25 (cache hit on 2300 unchanged)

# Patch and ship
diskscribe patch game_v1.1.fdi \
  --layout translations_v1.1.json \
  --output game_v1.1_en.fdi
```

---

## Advanced Customization

### Create Custom Profile Template

```bash
# Start from generic PC-98
diskscribe profile new my_game.ts --template generic_pc98

# Edit src/profiles/my_game.ts with:
# - Real file offsets from hex dump
# - Pointer table address
# - Textbox constraints
# - Free space regions

# Register and test
npm test -- src/profiles/__tests__/my_game.test.ts

# Use in extraction
diskscribe extract game.fdi --profile my_game
```

---

### Hook into Julia for Audio Processing

```bash
# Phase 6: Multi-media support

diskscribe run game.fdi \
  --extract-audio \
  --audio-processor julia_audio.jl \
  --output ./translated_project/

# julia_audio.jl:
# - Extract game BGM
# - Adjust for translated dialog duration
# - Re-encode
```

---

**See [API.md](API.md) for complete API reference and [PLUGIN-DEVELOPMENT.md](PLUGIN-DEVELOPMENT.md) for extending DiskScribe2026.**

