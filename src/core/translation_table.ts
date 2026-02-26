/**
 * TranslationTable: Maps original text to translations with metadata
 *
 * TICKET 1.1.3: Core data model for translations
 * Spec: https://github.com/yourrepo/diskscribe2026/blob/main/ROADMAP-DETAILED.md#ticket-113-translation-table
 *
 * Purpose:
 * - Store translations linked to string units
 * - Track provider, quality score, cost
 * - Enable filtering by quality, provider, status
 * - Serialize to JSON for project artifacts
 *
 * Status: ✅ COMPLETE (200 LOC base + 150 LOC operations)
 */

/**
 * A single translation record
 */
export interface ITranslation {
  /** ID linking to StringUnit.id */
  id: string;

  /** Source language code: "ja", "zh-hans", etc. */
  source_lang: string;

  /** Target language code: "en", "fr", etc. */
  target_lang: string;

  /** Original text being translated */
  original: string;

  /** Translation result */
  translated: string;

  /** Which provider produced this translation: "mock", "claude", "openai", etc. */
  provider: string;

  /** Provider-specific configuration used for this translation */
  provider_config?: Record<string, unknown>;

  /** Cost information (if tracked by provider) */
  cost?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };

  /** Quality score from 0-100 (optional, from human review) */
  quality_score?: number;

  /** Notes about translation (e.g., "needs review", "ambiguous term") */
  notes?: string;

  /** Timestamp when translation was created */
  created_at: string;

  /** Timestamp of last update */
  updated_at: string;
}

/**
 * Collection of translations indexed by string ID
 */
export class TranslationTable {
  private translations: Map<string, ITranslation> = new Map();

  /**
   * Initialize from array of translations
   *
   * @param data Array of translation records
   */
  constructor(data?: ITranslation[]) {
    if (data) {
      for (const translation of data) {
        this.add(translation);
      }
    }
  }

  /**
   * Add a translation record
   *
   * @param translation Translation to add
   * @throws Error if ID already exists
   */
  add(translation: ITranslation): void {
    if (this.translations.has(translation.id)) {
      throw new Error(`Translation for id "${translation.id}" already exists`);
    }
    this.translations.set(translation.id, { ...translation });
  }

  /**
   * Retrieve a translation by string ID
   *
   * @param id String ID
   * @returns Translation or null
   */
  get(id: string): ITranslation | null {
    const t = this.translations.get(id);
    return t ? { ...t } : null;
  }

  /**
   * Update a translation
   *
   * @param id String ID
   * @param partial Partial update
   * @throws Error if not found
   */
  update(id: string, partial: Partial<ITranslation>): void {
    const existing = this.translations.get(id);
    if (!existing) {
      throw new Error(`Translation for id "${id}" not found`);
    }
    this.translations.set(id, {
      ...existing,
      ...partial,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Remove a translation
   *
   * @param id String ID
   * @returns True if removed
   */
  remove(id: string): boolean {
    return this.translations.delete(id);
  }

  /**
   * Get all translations
   *
   * @returns Array of all translations (copy)
   */
  all(): ITranslation[] {
    return Array.from(this.translations.values()).map((t) => ({ ...t }));
  }

  /**
   * Get translations from a specific provider
   *
   * @param provider Provider name
   * @returns Matching translations
   */
  by_provider(provider: string): ITranslation[] {
    return this.all().filter((t) => t.provider === provider);
  }

  /**
   * Get translations that need review (low quality score)
   *
   * @param threshold Minimum quality score (default 70)
   * @returns Translations below threshold
   */
  needs_review(threshold: number = 70): ITranslation[] {
    return this.all().filter((t) => !t.quality_score || t.quality_score < threshold);
  }

  /**
   * Get translations with quality score above threshold
   *
   * @param threshold Minimum quality (default 70)
   * @returns Matching translations
   */
  by_quality(threshold: number = 70): ITranslation[] {
    return this.all().filter((t) => t.quality_score && t.quality_score >= threshold);
  }

  /**
   * Get total cost in USD (sum of all translation costs)
   *
   * @returns Total cost
   */
  cost_total_usd(): number {
    return this.all().reduce((sum, t) => sum + (t.cost?.cost_usd || 0), 0);
  }

  /**
   * Get total tokens used
   *
   * @returns { input: number, output: number }
   */
  tokens_used(): { input: number; output: number } {
    let input = 0;
    let output = 0;
    for (const t of this.all()) {
      if (t.cost) {
        input += t.cost.input_tokens;
        output += t.cost.output_tokens;
      }
    }
    return { input, output };
  }

  /**
   * Get average quality score
   *
   * @returns Average quality (0-100) or 0 if no scores
   */
  quality_avg(): number {
    const scored = this.all().filter((t) => t.quality_score !== undefined);
    if (scored.length === 0) return 0;
    const sum = scored.reduce((s, t) => s + (t.quality_score || 0), 0);
    return Math.round(sum / scored.length);
  }

  /**
   * Get count of translations
   *
   * @returns Number of translations
   */
  count(): number {
    return this.translations.size;
  }

  /**
   * Get translations in a language pair
   *
   * @param source_lang Source language
   * @param target_lang Target language
   * @returns Matching translations
   */
  by_language_pair(source_lang: string, target_lang: string): ITranslation[] {
    return this.all().filter((t) => t.source_lang === source_lang && t.target_lang === target_lang);
  }

  /**
   * Save to JSON file
   *
   * @param path File path to write
   */
  async save_json(path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const data = {
      project_id: 'translations',
      timestamp: new Date().toISOString(),
      stats: {
        total: this.count(),
        by_provider: this.get_stats_by_provider(),
        quality_avg: this.quality_avg(),
        cost_total_usd: this.cost_total_usd(),
        tokens: this.tokens_used()
      },
      translations: this.all()
    };
    await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load from JSON file
   *
   * @param path File path to read
   */
  async load_json(path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content) as {
      translations: ITranslation[];
    };
    this.translations.clear();
    for (const translation of data.translations) {
      this.add(translation);
    }
  }

  /**
   * Export to CSV format
   *
   * @param path File path to write
   */
  async export_csv(path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const lines: string[] = [
      'ID\tProvider\tOriginal\tTranslation\tQuality\tCost USD\tNotes'
    ];

    for (const t of this.all()) {
      lines.push(
        [
          t.id,
          t.provider,
          t.original.replace(/\t/g, '\\t').replace(/\n/g, '\\n'),
          t.translated.replace(/\t/g, '\\t').replace(/\n/g, '\\n'),
          t.quality_score || '',
          t.cost?.cost_usd.toFixed(4) || '',
          (t.notes || '').replace(/\t/g, '\\t')
        ].join('\t')
      );
    }

    await fs.writeFile(path, lines.join('\n'), 'utf-8');
  }

  /**
   * Get statistics grouped by provider
   *
   * @returns Count per provider
   */
  private get_stats_by_provider(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const t of this.all()) {
      stats[t.provider] = (stats[t.provider] || 0) + 1;
    }
    return stats;
  }

  /**
   * Clear all translations
   */
  clear(): void {
    this.translations.clear();
  }

  /**
   * Get translations as plain object
   *
   * @returns Plain object representation
   */
  to_object(): {
    translations: ITranslation[];
    stats: {
      total: number;
      by_provider: Record<string, number>;
      quality_avg: number;
      cost_total_usd: number;
    };
  } {
    return {
      translations: this.all(),
      stats: {
        total: this.count(),
        by_provider: this.get_stats_by_provider(),
        quality_avg: this.quality_avg(),
        cost_total_usd: this.cost_total_usd()
      }
    };
  }
}
