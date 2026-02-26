# Minimum Viable Claude Provider Implementation Spec

**Phase:** 3 (Weeks 10-11)  
**Priority:** HIGH - unblocks real translation workflows  
**Owner:** 1 engineer (2 weeks focused)

---

## 0. Executive Summary

ClaudeProvider bridges DiskScribe to Anthropic's Claude API for real translations. This spec covers:

1. **Provider Implementation** - SDK integration, batching, error recovery
2. **Prompt Engineering** - Few-shot examples, glossary injection, context grouping
3. **Caching Strategy** - Deterministic hashing, SQLite store, cache-first reads
4. **Cost Tracking** - Token counting, billing exposure, quota management
5. **Integration Points** - Registry hookup, Config file, BYO API key support

**Target Output:** A ~1000-line TypeScript module that translates 2500+ strings in ~2-3 minutes (batched), caching 80%+ of reruns.

---

## 1. Architecture Overview

```
User Input (Bulk)
      ↓
  [Batch Segmentation]
      ↓
  [Cache Check] → Hit? → Return cached
      ↓ Miss
  [Glossary Injection]
      ↓
  [Prompt Building] → Claude API
      ↓ Response
  [Response Parsing]
      ↓
  [SQLite Store] → Cache
      ↓
  [Return Translations]
```

---

## 2. Provider Interface Implementation

### 2.1 ClaudeProvider Class

**File:** `src/translate/claude_provider.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { ITranslationProvider, TranslationOptions } from "./base";
import { TranslationCache } from "./cache";
import { StringUnit, Translation, TranslationGlossary } from "../core";

export class ClaudeProvider implements ITranslationProvider {
  name = "Claude 3.5 Sonnet (Anthropic)";
  provider_id = "claude";
  supports_batch = true;

  private client: Anthropic;
  private cache: TranslationCache;
  private api_key: string;
  private model = "claude-3-5-sonnet-20241022";
  private max_tokens = 2000;
  private rate_limiter: RateLimiter;

  // Cost tracking
  private session_tokens = {
    input: 0,
    output: 0,
    cache_creation: 0,
    cache_read: 0,
  };

  constructor(api_key?: string) {
    // API key priority:
    // 1. Parameter
    // 2. Environment variable ANTHROPIC_API_KEY
    // 3. Config file ~/.diskscribe.json
    this.api_key = api_key || this.load_api_key();

    if (!this.api_key) {
      throw new Error(
        "No Claude API key found. Set ANTHROPIC_API_KEY or run: diskscribe config set-key <key>"
      );
    }

    this.client = new Anthropic({ apiKey: this.api_key });
    this.cache = new TranslationCache("./cache/translations.db");
    this.rate_limiter = new RateLimiter({
      max_requests_per_minute: 420, // Tier 1: 420 RPM
      max_tokens_per_minute: 40000, // ~ 100k tokens/day
    });
  }

  async translate(
    batch: StringUnit[],
    source_lang: string,
    target_lang: string,
    options: TranslationOptions
  ): Promise<Translation[]> {
    const results: Translation[] = [];
    const cache_misses: StringUnit[] = [];

    // Step 1: Check cache first
    console.log(`[Claude] Checking cache for ${batch.length} strings...`);
    for (const str of batch) {
      const cached = await this.cache.get(
        TranslationCache.hash_prompt(str.id, str.original_text)
      );

      if (cached && options.use_cache) {
        results.push(cached);
      } else {
        cache_misses.push(str);
      }
    }

    console.log(
      `[Claude] Cache hit: ${batch.length - cache_misses.length}/${batch.length}`
    );

    if (cache_misses.length === 0) {
      return results;
    }

    // Step 2: Batch cache misses
    if (options.cache_only) {
      console.warn(
        `[Claude] Cache-only mode: skipping ${cache_misses.length} uncached strings`
      );
      return results;
    }

    console.log(`[Claude] Translating ${cache_misses.length} uncached strings...`);

    const batches = this.segment_for_api(cache_misses, options);

    for (const batch_group of batches) {
      // Rate limit
      await this.rate_limiter.wait_if_needed();

      // Call API
      const translations = await this.call_claude(
        batch_group,
        source_lang,
        target_lang,
        options
      );

      results.push(...translations);

      // Cache results
      for (const trans of translations) {
        await this.cache.put(
          TranslationCache.hash_prompt(trans.string_id, batch_group.find(s => s.id === trans.string_id)?.original_text || ""),
          trans
        );
      }
    }

    // Return in original order
    return results;
  }

  /**
   * Segment strings for API batching
   * - Max 100 strings per request (stays well under token limits)
   * - Group by file for context
   */
  private segment_for_api(
    strings: StringUnit[],
    options: TranslationOptions
  ): StringUnit[][] {
    const batches: StringUnit[][] = [];
    const batch_size = 100;

    if (options.context_grouping === "by_file") {
      // Group by source file first
      const by_file = new Map<string, StringUnit[]>();
      for (const str of strings) {
        const key = str.source.file_path;
        if (!by_file.has(key)) {
          by_file.set(key, []);
        }
        by_file.get(key)!.push(str);
      }

      // Create batches respecting file boundaries
      let current_batch: StringUnit[] = [];
      for (const [file, file_strings] of by_file.entries()) {
        for (const str of file_strings) {
          current_batch.push(str);
          if (current_batch.length >= batch_size) {
            batches.push([...current_batch]);
            current_batch = [];
          }
        }
      }
      if (current_batch.length > 0) {
        batches.push(current_batch);
      }
    } else {
      // Simple sequential batching
      for (let i = 0; i < strings.length; i += batch_size) {
        batches.push(strings.slice(i, i + batch_size));
      }
    }

    return batches;
  }

  /**
   * Call Claude API with prompt engineering
   */
  private async call_claude(
    batch: StringUnit[],
    source_lang: string,
    target_lang: string,
    options: TranslationOptions
  ): Promise<Translation[]> {
    const prompt = this.build_prompt(batch, source_lang, target_lang, options);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.max_tokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Track tokens
    if (response.usage) {
      this.session_tokens.input += response.usage.input_tokens;
      this.session_tokens.output += response.usage.output_tokens;

      // Cache tokens (if used)
      if ("cache_creation_input_tokens" in response.usage) {
        this.session_tokens.cache_creation += 
          (response.usage as any).cache_creation_input_tokens;
      }
      if ("cache_read_input_tokens" in response.usage) {
        this.session_tokens.cache_read += 
          (response.usage as any).cache_read_input_tokens;
      }
    }

    // Parse response
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return this.parse_response(text, batch);
  }

  /**
   * Build prompt with few-shot examples and glossary
   */
  private build_prompt(
    batch: StringUnit[],
    source_lang: string,
    target_lang: string,
    options: TranslationOptions
  ): string {
    const glossary_context = options.glossary
      ? this.build_glossary_context(options.glossary)
      : "";

    const examples = FEW_SHOT_EXAMPLES[options.style || "natural"] || 
                     FEW_SHOT_EXAMPLES.natural;

    const strings_json = batch
      .map((str, idx) => ({
        id: str.id,
        original: str.original_text,
        context: str.context || "(no context)",
        textbox: str.box_constraint
          ? `${str.box_constraint.width_chars}×${str.box_constraint.height_lines}`
          : "flexible",
      }))
      .map((s, idx) => `${idx + 1}. ID: ${s.id}
   Original: "${s.original}"
   Context: ${s.context}
   Textbox: ${s.textbox}`)
      .join("\n\n");

    return `
You are a translator specializing in retro PC games (PC-98, PC-88 systems from the 1980s-90s).

## Style Guide
${examples}

## Glossary Reference (if any match, use these translations)
${glossary_context || "(No glossary entries)"}

## Strings to Translate
${strings_json}

**Format your response as JSON array:**
[
  { "id": "<string.id>", "translation": "<translated text>", "confidence": 0.9 },
  { "id": "...", "translation": "...", "confidence": ... }
]

Constraints:
- Keep translations fitting within textbox width if specified
- Preserve the tone: respectful for dialog, concise for UI/menus
- If you can't fit a translation, shorten it intelligently
- Only return the JSON array, no other text
`;
  }

  /**
   * Build glossary context for prompt
   */
  private build_glossary_context(glossary: TranslationGlossary): string {
    const entries = glossary.getAllEntries().slice(0, 30); // Limit to 30 examples
    return entries
      .map(
        (e) =>
          `- "${e.japanese}" → "${e.english}" (confidence: ${e.confidence || 0.9})`
      )
      .join("\n");
  }

  /**
   * Parse Claude's JSON response
   */
  private parse_response(
    response_text: string,
    source_batch: StringUnit[]
  ): Translation[] {
    try {
      // Extract JSON array from response
      const json_match = response_text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!json_match) {
        throw new Error("No JSON array found in response");
      }

      const parsed = JSON.parse(json_match[0]) as Array<{
        id: string;
        translation: string;
        confidence: number;
      }>;

      return parsed.map((item) => ({
        string_id: item.id,
        translated_text: item.translation,
        provider: "claude" as const,
        confidence: item.confidence || 0.85,
        glossary_applied: false, // Set by caller if applicable
        tokens_used: this.estimate_tokens(`"${item.translation}"`),
        cache_hit: false,
        quality_flags: [],
        provider_metadata: { model: this.model },
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`[Claude] Parse error: ${error}`);
      throw error;
    }
  }

  /**
   * Estimate tokens in a string (rough approximation)
   * Claude: ~1 token per 4 characters for English, ~2 per character for Japanese
   */
  private estimate_tokens(text: string): number {
    const japanese_chars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
    const other_chars = text.length - japanese_chars;
    return Math.ceil(japanese_chars * 1 + other_chars / 4);
  }

  /**
   * Get session stats
   */
  stats(): {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: string;
    cache_efficiency: string;
  } {
    const input = this.session_tokens.input;
    const output = this.session_tokens.output;
    const total = input + output;

    // Pricing for Claude 3.5 Sonnet (as of Feb 2026)
    const input_cost = input * 0.003 / 1000;  // $3 per 1M tokens
    const output_cost = output * 0.015 / 1000; // $15 per 1M tokens
    const cache_read_cost = this.session_tokens.cache_read * 0.0003 / 1000; // $0.30 per 1M (90% discount)
    const cache_creation_cost = this.session_tokens.cache_creation * 0.00375 / 1000; // $3.75 per 1M (25% upcharge)

    const total_cost = input_cost + output_cost + cache_read_cost + cache_creation_cost;

    return {
      total_tokens: total,
      input_tokens: input,
      output_tokens: output,
      estimated_cost: `$${total_cost.toFixed(4)}`,
      cache_efficiency:
        this.session_tokens.cache_read > 0
          ? `${((this.session_tokens.cache_read / input) * 100).toFixed(1)}% from cache`
          : "no cache hits",
    };
  }

  /**
   * Load API key from config or environment
   */
  private load_api_key(): string {
    // Priority 1: Environment
    if (process.env.ANTHROPIC_API_KEY) {
      return process.env.ANTHROPIC_API_KEY;
    }

    // Priority 2: Config file
    try {
      const config_path = path.join(process.env.HOME || "", ".diskscribe.json");
      if (fs.existsSync(config_path)) {
        const config = JSON.parse(fs.readFileSync(config_path, "utf-8"));
        if (config.claude_api_key) {
          return config.claude_api_key;
        }
      }
    } catch (e) {
      // Silent fail
    }

    return "";
  }
}

// Rate limiter helper
class RateLimiter {
  private last_request = 0;
  private max_requests_per_minute: number;
  private max_tokens_per_minute: number;
  private tokens_used_this_minute = 0;

  constructor(config: { max_requests_per_minute: number; max_tokens_per_minute: number }) {
    this.max_requests_per_minute = config.max_requests_per_minute;
    this.max_tokens_per_minute = config.max_tokens_per_minute;
  }

  async wait_if_needed(): Promise<void> {
    const now = Date.now();
    const time_since_last = now - this.last_request;
    const min_interval = (60 * 1000) / this.max_requests_per_minute; // ms between requests

    if (time_since_last < min_interval) {
      await new Promise((resolve) =>
        setTimeout(resolve, min_interval - time_since_last)
      );
    }

    this.last_request = Date.now();
  }
}

// Register provider
global_provider_registry.register(new ClaudeProvider());
```

---

## 3. Prompt Engineering: Few-Shot Examples

### 3.1 Task Definition

**File:** `src/translate/prompts.ts`

```typescript
export const SYSTEM_PROMPT = `You are a translator specializing in retro Japanese PC games (PC-98, PC-88).

Your task: Translate Japanese game text to English for gameplay localization.

Quality standards:
1. **Accuracy**: Preserve original meaning; don't add or remove subtext.
2. **Brevity**: Game text is space-constrained. Use short, natural English.
3. **Tone**: Match the original — respectful, humorous, urgent, etc.
4. **Names/Proper nouns**: Keep as-is unless culturally strange.
5. **Gameplay terms**: Translate consistently (e.g., "攻撃" always → "Attack").
6. **Uncertainty**: If unsure, provide your best guess with lower confidence (0.5-0.7).

Return **only** a JSON array with id, translation, and confidence.`;

export const FEW_SHOT_EXAMPLES = {
  natural: `
**Style: Natural English**
- Adapt phrasing to sound natural in English
- Menu items: clear, concise, action-oriented
- Dialog: conversational, respect character voice
- Error messages: clear problem statement + action

Examples:
- JP: "新しいゲーム" → EN: "New Game"
- JP: "ゲームを再開しますか？" → EN: "Resume Game?"
- JP: "ダメージを与えた" → EN: "Dealt damage"
- JP: "もう一度？" → EN: "Try again?"
`,

  literal: `
**Style: Literal/Exact**
- Translate word-for-word
- Preserve Japanese structure where possible
- Useful for understanding original intent

Examples:
- JP: "新しいゲーム" → EN: "New Game"
- JP: "ゲームを再開しますか？" → EN: "Will you resume the game?"
- JP: "ダメージを与えた" → EN: "Gave damage"
- JP: "もう一度？" → EN: "Once more?"
`,

  literary: `
**Style: Literary/Formal**
- Elevate to formal register
- Fantasy/adventure tone
- Suitable for narrative-heavy games

Examples:
- JP: "新しいゲーム" → EN: "Embark on a New Adventure"
- JP: "ゲームを再開しますか？" → EN: "Dost thou wish to continue thy journey?"
- JP: "ダメージを与えた" → EN: "Dealt a heavy blow"
- JP: "魔法" → EN: "Arcane Arts"
`,
};

export const GAME_CONTEXT_TEMPLATES = {
  dialog: `
This is **character dialog** in a visual novel / adventure game.
- Can span 2-3 lines in a textbox (16 chars × 3 lines typical)
- Natural, slightly informal tone acceptable
- Match character personality if known
`,

  menu: `
This is a **menu item** or UI label.
- Should be 1-2 words if possible
- Concise, clear action words
- Respect keyboard binding patterns if obvious
`,

  battle: `
This is **battle system text**.
- Short, action-oriented
- Combat terminology (Attack, Defend, Magic, Item, Run)
- Scores/damage numbers & status effects
`,

  description: `
This is an **item/character description**.
- 1-2 sentences
- Informative but concise
- Can be slightly poetic
`,
};
```

---

## 4. Caching Strategy

### 4.1 TranslationCache Class

**File:** `src/translate/cache.ts`

```typescript
import Database from "better-sqlite3";
import { createHash } from "crypto";

export interface CachedTranslation {
  string_id: string;
  original_text: string;
  translated_text: string;
  provider: string;
  confidence: number;
  created_at: string;
  cost_estimate_usd: number;
}

export class TranslationCache {
  private db: Database.Database;
  private table_name = "translations";

  constructor(db_path: string) {
    this.db = new Database(db_path);
    this.init_schema();
  }

  /**
   * Generate deterministic hash of prompt + inputs
   * This ensures same input → same cache entry, regardless of order
   */
  static hash_prompt(...inputs: any[]): string {
    const key = JSON.stringify(inputs);
    return createHash("sha256").update(key).digest("hex");
  }

  /**
   * Lookup translation in cache
   */
  async get(prompt_hash: string): Promise<CachedTranslation | null> {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.table_name} WHERE prompt_hash = ? LIMIT 1`
    );
    const row = stmt.get(prompt_hash) as any;
    return row ? this.row_to_translation(row) : null;
  }

  /**
   * Store translation in cache
   */
  async put(prompt_hash: string, trans: CachedTranslation): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.table_name} 
       (prompt_hash, string_id, original_text, translated_text, provider, confidence, created_at, cost_estimate_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      prompt_hash,
      trans.string_id,
      trans.original_text,
      trans.translated_text,
      trans.provider,
      trans.confidence,
      trans.created_at,
      trans.cost_estimate_usd
    );
  }

  /**
   * Clear old cached entries (garbage collection)
   */
  cleanup_old_entries(older_than_days: number = 90): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - older_than_days);

    const stmt = this.db.prepare(
      `DELETE FROM ${this.table_name} WHERE datetime(created_at) < datetime(?)`
    );
    const result = stmt.run(cutoff.toISOString());
    return result.changes;
  }

  /**
   * Get cache statistics
   */
  stats(): {
    total_cached: number;
    total_providers: string[];
    avg_confidence: number;
    total_cost_saved: number;
  } {
    const stats = this.db
      .prepare(
        `SELECT 
          COUNT(*) as total,
          GROUP_CONCAT(DISTINCT provider) as providers,
          AVG(confidence) as avg_conf,
          SUM(cost_estimate_usd) as total_cost
        FROM ${this.table_name}`
      )
      .get() as any;

    return {
      total_cached: stats.total || 0,
      total_providers: (stats.providers || "").split(",").filter(String),
      avg_confidence: stats.avg_conf || 0,
      total_cost_saved: stats.total_cost || 0,
    };
  }

  private init_schema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table_name} (
        prompt_hash TEXT PRIMARY KEY,
        string_id TEXT NOT NULL,
        original_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        provider TEXT NOT NULL,
        confidence REAL DEFAULT 0.85,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        cost_estimate_usd REAL DEFAULT 0,
        
        UNIQUE(string_id, provider)
      );
      
      CREATE INDEX IF NOT EXISTS idx_string_id ON ${this.table_name}(string_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON ${this.table_name}(created_at);
    `);
  }

  private row_to_translation(row: any): CachedTranslation {
    return {
      string_id: row.string_id,
      original_text: row.original_text,
      translated_text: row.translated_text,
      provider: row.provider,
      confidence: row.confidence,
      created_at: row.created_at,
      cost_estimate_usd: row.cost_estimate_usd,
    };
  }

  close() {
    this.db.close();
  }
}
```

---

## 5. Cost Tracking & Billing

### 5.1 Cost Model (as of Feb 2026)

**File:** `src/translate/costs.ts`

```typescript
export const CLAUDE_PRICING = {
  "claude-3-5-sonnet": {
    input: 0.003, // $3 per 1M tokens
    output: 0.015, // $15 per 1M tokens
    cache_read: 0.0003, // $0.30 per 1M (90% discount)
    cache_creation: 0.00375, // $3.75 per 1M (25% upcharge)
  },
  "claude-3-opus": {
    input: 0.015,
    output: 0.075,
    cache_read: 0.0015,
    cache_creation: 0.01875,
  },
};

export class CostTracker {
  private session_costs = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };

  add_api_response(usage: any): void {
    this.session_costs.input_tokens += usage.input_tokens || 0;
    this.session_costs.output_tokens += usage.output_tokens || 0;
    this.session_costs.cache_read_tokens += usage.cache_read_input_tokens || 0;
    this.session_costs.cache_creation_tokens += usage.cache_creation_input_tokens || 0;
  }

  estimate_usd(model: "claude-3-5-sonnet" | "claude-3-opus" = "claude-3-5-sonnet"): number {
    const pricing = CLAUDE_PRICING[model];

    return (
      (this.session_costs.input_tokens * pricing.input) / 1_000_000 +
      (this.session_costs.output_tokens * pricing.output) / 1_000_000 +
      (this.session_costs.cache_read_tokens * pricing.cache_read) / 1_000_000 +
      (this.session_costs.cache_creation_tokens * pricing.cache_creation) / 1_000_000
    );
  }

  report(): {
    tokens: { input: number; output: number; cached: number; total: number };
    estimated_cost_usd: number;
    breakdown: string;
  } {
    const total_tokens =
      this.session_costs.input_tokens +
      this.session_costs.output_tokens +
      this.session_costs.cache_read_tokens +
      this.session_costs.cache_creation_tokens;

    return {
      tokens: {
        input: this.session_costs.input_tokens,
        output: this.session_costs.output_tokens,
        cached: this.session_costs.cache_read_tokens,
        total: total_tokens,
      },
      estimated_cost_usd: this.estimate_usd(),
      breakdown: `
        Input:         ${this.session_costs.input_tokens.toLocaleString()} tokens
        Output:        ${this.session_costs.output_tokens.toLocaleString()} tokens
        Cache read:    ${this.session_costs.cache_read_tokens.toLocaleString()} tokens (90% cheaper)
        Cache create:  ${this.session_costs.cache_creation_tokens.toLocaleString()} tokens (25% premium)
        ─────────────────────────────────────
        Total:         ${total_tokens.toLocaleString()} tokens
        Estimated:     $${this.estimate_usd().toFixed(2)}
      `,
    };
  }
}
```

### 5.2 Budget Projections

For a typical game (2500 strings):

| Scenario | Input Tokens | Output Tokens | Cache Hit | Cost | Time |
|----------|--------------|---------------|-----------|------|------|
| **First run, no cache** | 80K | 15K | 0% | $0.27 | 2-3 min |
| **Rerun with 80% cache** | 16K | 3K | 80% | $0.15 | 10 sec |
| **Multiple games (5×)** | 400K | 75K | varies | $1.35-2.00 | 10-15 min |

**Monthly budget guidance:**
- Solo translator: $50-100/mo (5-10 games, with caching)
- Studio (5 projects): $300-500/mo
- Power mode (daily iteration): $1000+/mo

**Cost optimization tips:**
1. **Cache everything** - Reruns cost 40-50% less
2. **Use glossary** - Pre-translate knows terms → fewer uncertain queries
3. **Batch aggressively** - 100+ strings per request is optimal
4. **Monitor API usage** - Check stats after each run

---

## 6. Integration Points

### 6.1 Config File Management

**File:** `src/cli/config.ts`

```typescript
export interface DiskScribeConfig {
  claude_api_key?: string;
  cache_dir?: string;
  max_tokens_per_month?: number;
  default_provider?: string;
  default_style?: "natural" | "literal" | "literary";
}

export class ConfigManager {
  private config_path: string;

  constructor() {
    this.config_path = path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".diskscribe.json"
    );
  }

  load(): DiskScribeConfig {
    if (fs.existsSync(this.config_path)) {
      return JSON.parse(fs.readFileSync(this.config_path, "utf-8"));
    }
    return {};
  }

  save(config: DiskScribeConfig): void {
    fs.writeFileSync(this.config_path, JSON.stringify(config, null, 2));
    console.log(`Config saved to ${this.config_path}`);
  }

  set_api_key(key: string): void {
    const config = this.load();
    config.claude_api_key = key;
    this.save(config);
    console.log("Claude API key configured.");
  }

  get_api_key(): string | null {
    const config = this.load();
    return config.claude_api_key || process.env.ANTHROPIC_API_KEY || null;
  }
}
```

### 6.2 CLI Commands for Configuration

**File:** `src/cli/commands/config.ts`

```typescript
export async function config_command(args: {
  action: "show" | "set-key" | "set-cache" | "reset";
  key?: string;
  value?: string;
}): Promise<void> {
  const manager = new ConfigManager();

  switch (args.action) {
    case "show":
      const config = manager.load();
      console.log("Current configuration:");
      console.log(JSON.stringify(config, null, 2));
      break;

    case "set-key":
      if (!args.value) throw new Error("Usage: diskscribe config set-key <your-api-key>");
      manager.set_api_key(args.value);
      break;

    case "set-cache":
      if (!args.value) throw new Error("Usage: diskscribe config set-cache <path>");
      const cfg = manager.load();
      cfg.cache_dir = args.value;
      manager.save(cfg);
      break;

    case "reset":
      if (fs.existsSync(manager["config_path"])) {
        fs.unlinkSync(manager["config_path"]);
        console.log("Configuration reset.");
      }
      break;
  }
}
```

**CLI Usage:**
```bash
# Set up API key
$ diskscribe config set-key sk-ant-v1-xxxxx...

# Show current settings
$ diskscribe config show

# Reset to defaults
$ diskscribe config reset
```

---

## 7. Integration Test & Acceptance Criteria

### 7.1 Unit Tests

**File:** `src/translate/__tests__/claude_provider.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ClaudeProvider } from "../claude_provider";
import { StringUnit } from "../../core";
import { TranslationGlossary } from "../../core/translation_glossary";

describe("ClaudeProvider", () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY_TEST);
  });

  afterEach(() => {
    provider.cache.close();
  });

  it("should cache translations deterministically", async () => {
    const str: StringUnit = {
      id: "test_001",
      source: { volume: 0, file_path: "TEST.EXE", byte_offset: 0x1000 },
      encoding: "shift_jis",
      original_bytes: new Uint8Array(),
      original_text: "新しいゲーム",
    };

    // First call → API
    const result1 = await provider.translate(
      [str],
      "ja",
      "en",
      { use_cache: true }
    );
    expect(result1).toHaveLength(1);
    expect(result1[0].translated_text).toBeTruthy();

    // Second call → Cache
    const result2 = await provider.translate(
      [str],
      "ja",
      "en",
      { use_cache: true }
    );
    expect(result2[0].translated_text).toBe(result1[0].translated_text);
  });

  it("should respect cache_only mode", async () => {
    const str: StringUnit = {
      id: "uncached_001",
      original_text: "Never seen before",
      // ... other fields
    };

    const result = await provider.translate(
      [str],
      "ja",
      "en",
      { cache_only: true }
    );
    expect(result).toHaveLength(0);
  });

  it("should segment batches correctly", async () => {
    const batch = Array.from({ length: 250 }, (_, i) => ({
      id: `test_${i}`,
      original_text: `String ${i}`,
      source: { volume: 0, file_path: "TEST.EXE", byte_offset: i * 100 },
      encoding: "shift_jis",
      original_bytes: new Uint8Array(),
    }));

    const segments = (provider as any).segment_for_api(batch, {});
    expect(segments.length).toBe(3); // 100 + 100 + 50
  });

  it("should inject glossary entries into prompt", async () => {
    const glossary = new TranslationGlossary();
    glossary.addEntry({
      id: "gloss_001",
      japanese: "新しいゲーム",
      english: "New Game",
      verified: true,
    });

    const str: StringUnit = {
      id: "test_001",
      original_text: "新しいゲーム",
      // ... other fields
    };

    const ctx = (provider as any).build_glossary_context(glossary);
    expect(ctx).toContain("New Game");
  });

  it("should track costs accurately", async () => {
    provider["session_tokens"].input = 1000;
    provider["session_tokens"].output = 200;

    const stats = provider.stats();
    expect(stats.total_tokens).toBe(1200);
    expect(stats.estimated_cost).toMatch(/\$[\d.]+/);
  });
});
```

### 7.2 Integration Test

**File:** `tests/integration/claude_end_to_end.test.ts`

```bash
Feature: Claude Translation Pipeline
scenario: "Translate a batch with caching"
  given: "Alshark project with 100 strings extracted"
  when: "User runs 'diskscribe translate --provider claude'"
  then: "All strings translated, cached, and report shows cost"

scenario: "Cache hit on rerun"
  given: "Previous translation with cache populated"
  when: "User re-translates same project"
  then: "API not called, cache used, < 2 seconds elapsed"

scenario: "Glossary injection"
  given: "30-entry glossary for PC-98 games"
  when: "Provider translates with glossary option"
  then: "Glossary matches appear in prompt, used in translation"

scenario: "Cost tracking"
  given: "Provider translates 2500 strings"
  when: "stats() called"
  then: "estimated_cost_usd shown, with breakdown by token type"
```

---

## 8. Deliverables Checklist

### Phase 3.1: Provider Implementation

- [ ] `src/translate/claude_provider.ts` (1000 LOC)
  - `ClaudeProvider` class with `translate()` method
  - Batching logic (100 strings per request)
  - Response parsing + error handling
  - Rate limiter with backoff
  - Token counting + cost estimation

- [ ] `src/translate/cache.ts` (300 LOC)
  - SQLite schema + migrations
  - `get()` / `put()` / `cleanup_old_entries()`
  - Deterministic prompt hashing
  - Cache statistics

- [ ] `src/translate/prompts.ts` (200 LOC)
  - System prompt
  - Few-shot examples (natural/literal/literary)
  - Game context templates

- [ ] `src/translate/costs.ts` (150 LOC)
  - Claude pricing model (snapshot as of Feb 2026)
  - Cost tracker + reporting
  - Budget projection utilities

- [ ] `src/cli/config.ts` (100 LOC)
  - ConfigManager for API key management
  - Support for env vars + config file + BYO key

- [ ] `src/cli/commands/config.ts` (50 LOC)
  - CLI: `diskscribe config set-key`, `show`, `reset`

- [ ] `src/cli/commands/translate.ts` (150 LOC)
  - CLI: `diskscribe translate <project> --provider claude`
  - Options: `--style`, `--glossary`, `--cache-only`

- [ ] Tests (200 LOC)
  - Unit: cache, batching, prompt building, costs
  - Integration: end-to-end translation with mock

### Phase 3.2: Integration & Validation

- [ ] `npm test` passes all provider tests
- [ ] `diskscribe translate alshark_project --provider claude` works end-to-end
- [ ] Cache hits on rerun (verify in stats)
- [ ] Cost estimation matches actual (within 5%)
- [ ] Glossary entries reflected in prompt
- [ ] Rate limiter respected (no 429 errors)

### Phase 3.3: Documentation

- [ ] API key setup guide + security best practices
- [ ] Cost guide + monthly budget projections
- [ ] Prompt engineering reference (how to tune style/context)
- [ ] Troubleshooting: API key errors, rate limits, cache misses
- [ ] Examples: `diskscribe translate` with different options

---

## 9. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **API key exposure** | CRITICAL | Never log keys, store only in ~/.diskscribe.json (chmod 600), support env vars exclusively in CI/CD |
| **Token count overages** | HIGH | Implement hard quota + warning threshold, track session tokens, abort if approaching limit |
| **Rate limiting (429s)** | MEDIUM | Backoff + retry with exponential delay, batch smartly to spread load |
| **Cache poisoning** | MEDIUM | Validate JSON response structure, reject malformed translations, use low confidence on parse errors |
| **Prompt injection** | LOW | Sanitize user inputs; don't interpolate user strings directly into system prompt |

---

## 10. Success Metrics

By end of Phase 3:

- ✅ **Latency:** 2500 strings translated in < 3 minutes (first run), < 30 sec (cached)
- ✅ **Cache hit rate:** 80%+ on reruns (via deterministic hashing)
- ✅ **Cost accuracy:** Estimated cost within 5% of actual Claude invoice
- ✅ **Quality:** 90%+ of translations require no manual post-edit (domain-specific)
- ✅ **Reliability:** 0 unrecovered crashes; all errors logged + reported to user

---

## Next: Phase 4 Roadmap

Once Phase 3 is complete:

1. Real-world testing with Alshark + another game
2. Gather user feedback on translation quality
3. Iterate on few-shot examples based on failure cases
4. Plan Phase 4 (Repointing/dynamic patching)

