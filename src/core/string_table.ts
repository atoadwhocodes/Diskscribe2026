/**
 * StringTable: In-memory storage of extracted strings with full metadata
 *
 * TICKET 1.1.2: Core data model for extracted text
 * Spec: https://github.com/yourrepo/diskscribe2026/blob/main/ROADMAP-DETAILED.md#ticket-112-string-table
 *
 * Purpose:
 * - Store individual text units extracted from game files
 * - Preserve offsets, control codes, and constraints
 * - Enable CRUD operations and filtering
 * - Serialize to JSON for project artifacts
 *
 * Status: ✅ COMPLETE (300 LOC base + 150 LOC operations)
 */

/**
 * Control code embedded in original text (color, newline, variable, etc.)
 */
export interface ControlCode {
  /** Type of control code: "newline", "color", "variable", "icon", "wait", etc. */
  type: 'newline' | 'color' | 'variable' | 'icon' | 'wait' | 'other';

  /** Position in original text where this control code appears */
  offset: number;

  /** Raw bytes of the control code */
  value: Uint8Array;

  /** Human-readable description of what this code does */
  description?: string;
}

/**
 * A single string unit extracted from a game file
 */
export interface IStringUnit {
  /** Unique ID for this string, e.g., "alshark_001_0x1234" */
  id: string;

  /** Which file this string came from, e.g., "ALSHARK.EXE" */
  source_file: string;

  /** Byte offset of this string within the source file */
  offset: number;

  /** Original text as a string (bytes interpreted with specified encoding) */
  text_raw: string;

  /** Text with control codes removed, for translation */
  text_clean: string;

  /** Control codes embedded in the original text */
  control_codes: ControlCode[];

  /** Category for context: "dialog", "menu", "battle", "description", "unknown" */
  category: 'dialog' | 'menu' | 'battle' | 'description' | 'unknown';

  /** Optional game-specific context (e.g., "battle_intro_enemy_name") */
  context?: string;

  /** Maximum bytes available in display textbox (2 bytes per Shift-JIS char) */
  max_bytes?: number;

  /** Maximum number of lines in textbox */
  line_limit?: number;

  /** Characters that must be preserved in translation */
  special_chars?: string[];

  /** English translation (filled during translate stage) */
  translated?: string;

  /** Result after text wrapping (filled during layout stage) */
  layout_result?: string;

  /** Whether successfully patched into disk image */
  patched?: boolean;

  /** Container for arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * In-memory collection of extracted strings
 */
export class StringTable {
  private strings: Map<string, IStringUnit> = new Map();

  /**
   * Add a string unit to the table
   *
   * @param unit String unit to add
   * @throws Error if ID already exists
   */
  add(unit: IStringUnit): void {
    if (this.strings.has(unit.id)) {
      throw new Error(`String with id "${unit.id}" already exists`);
    }
    this.strings.set(unit.id, { ...unit });
  }

  /**
   * Retrieve a string by ID
   *
   * @param id String ID
   * @returns String unit or null if not found
   */
  get(id: string): IStringUnit | null {
    const unit = this.strings.get(id);
    return unit ? { ...unit } : null;
  }

  /**
   * Update a string (merge partial data)
   *
   * @param id String ID
   * @param partial Partial update
   * @throws Error if not found
   */
  update(id: string, partial: Partial<IStringUnit>): void {
    const existing = this.strings.get(id);
    if (!existing) {
      throw new Error(`String with id "${id}" not found`);
    }
    this.strings.set(id, { ...existing, ...partial });
  }

  /**
   * Delete a string
   *
   * @param id String ID
   * @returns True if deleted, false if not found
   */
  remove(id: string): boolean {
    return this.strings.delete(id);
  }

  /**
   * Get all strings
   *
   * @returns Array of all string units (copy)
   */
  all(): IStringUnit[] {
    return Array.from(this.strings.values()).map((u) => ({ ...u }));
  }

  /**
   * Get strings from a specific file
   *
   * @param file File name to filter
   * @returns Matching string units
   */
  by_file(file: string): IStringUnit[] {
    return this.all().filter((u) => u.source_file === file);
  }

  /**
   * Get strings by category
   *
   * @param category Category to filter
   * @returns Matching string units
   */
  by_category(
    category: 'dialog' | 'menu' | 'battle' | 'description' | 'unknown'
  ): IStringUnit[] {
    return this.all().filter((u) => u.category === category);
  }

  /**
   * Get strings that have been translated
   *
   * @returns String units with translated field set
   */
  translated(): IStringUnit[] {
    return this.all().filter((u) => u.translated !== undefined && u.translated !== null);
  }

  /**
   * Get strings that have NOT been translated
   *
   * @returns String units without translated field
   */
  untranslated(): IStringUnit[] {
    return this.all().filter((u) => !u.translated);
  }

  /**
   * Get count of total strings
   *
   * @returns Number of strings
   */
  count(): number {
    return this.strings.size;
  }

  /**
   * Get total character count across all strings
   *
   * @returns Sum of text_clean length for all strings
   */
  size_chars(): number {
    return this.all().reduce((sum, u) => sum + u.text_clean.length, 0);
  }

  /**
   * Get total byte count (for sizing buffers)
   *
   * @param encoding Character encoding (default "shift_jis")
   * @returns Approximate total bytes
   */
  size_bytes(encoding: string = 'shift_jis'): number {
    return this.all().reduce((sum, u) => {
      // Shift-JIS: 1-2 bytes per character (rough estimate: 1.5x)
      if (encoding === 'shift_jis') {
        return sum + Math.ceil(u.text_clean.length * 1.5);
      }
      // UTF-8: 1-3 bytes per character (rough estimate: 2x)
      return sum + u.text_clean.length * 2;
    }, 0);
  }

  /**
   * Get progress statistics
   *
   * @returns Summary of extraction progress
   */
  progress(): {
    total: number;
    translated: number;
    percent: number;
  } {
    const total = this.count();
    const translated = this.translated().length;
    return {
      total,
      translated,
      percent: total > 0 ? Math.round((translated / total) * 100) : 0
    };
  }

  /**
   * Get statistics by category
   *
   * @returns Count per category
   */
  stats_by_category(): Record<string, number> {
    const stats: Record<string, number> = {
      dialog: 0,
      menu: 0,
      battle: 0,
      description: 0,
      unknown: 0
    };
    for (const unit of this.all()) {
      stats[unit.category]++;
    }
    return stats;
  }

  /**
   * Save to JSON file
   *
   * @param path File path to write
   */
  async save_json(path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const data = {
      project_id: 'extracted',
      timestamp: new Date().toISOString(),
      stats: {
        total: this.count(),
        translated: this.translated().length,
        chars: this.size_chars(),
        by_category: this.stats_by_category()
      },
      strings: this.all()
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
      strings: IStringUnit[];
    };
    this.strings.clear();
    for (const unit of data.strings) {
      this.add(unit);
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
      // Header
      'ID\tSource File\tOffset\tCategory\tOriginal\tTranslation\tStatus'
    ];

    for (const unit of this.all()) {
      const status = unit.patched ? 'PATCHED' : unit.translated ? 'TRANSLATED' : 'PENDING';
      lines.push(
        [
          unit.id,
          unit.source_file,
          '0x' + unit.offset.toString(16),
          unit.category,
          unit.text_clean.replace(/\t/g, '\\t').replace(/\n/g, '\\n'),
          (unit.translated || '').replace(/\t/g, '\\t').replace(/\n/g, '\\n'),
          status
        ].join('\t')
      );
    }

    await fs.writeFile(path, lines.join('\n'), 'utf-8');
  }

  /**
   * Import from CSV file
   *
   * @param path File path to read
   */
  async import_csv(path: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises);
    const content = await fs.readFile(path, 'utf-8');
    const lines = content.split('\n');

    this.strings.clear();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split('\t');
      if (parts.length < 5) continue;

      const unit: IStringUnit = {
        id: parts[0],
        source_file: parts[1],
        offset: parseInt(parts[2], 16),
        text_raw: parts[4].replace(/\\t/g, '\t').replace(/\\n/g, '\n'),
        text_clean: parts[4].replace(/\\t/g, '\t').replace(/\\n/g, '\n'),
        control_codes: [],
        category: (parts[3] as any) || 'unknown',
        translated: parts[5] ? parts[5].replace(/\\t/g, '\t').replace(/\\n/g, '\n') : undefined
      };

      this.add(unit);
    }
  }

  /**
   * Clear all strings
   */
  clear(): void {
    this.strings.clear();
  }

  /**
   * Get strings as plain object for serialization
   *
   * @returns Plain object representation
   */
  to_object(): {
    strings: IStringUnit[];
    stats: {
      total: number;
      translated: number;
      by_category: Record<string, number>;
    };
  } {
    return {
      strings: this.all(),
      stats: {
        total: this.count(),
        translated: this.translated().length,
        by_category: this.stats_by_category()
      }
    };
  }
}
