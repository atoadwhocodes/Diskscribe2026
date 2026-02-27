/**
 * TRANSLATION GLOSSARY & MEMORY SYSTEM
 * Persistent storage of translations for reuse across projects
 * Speeds up translation of common terms and phrases
 */

export interface GlossaryEntry {
  id: string;
  japanese: string;
  english: string;
  // Metadata
  category?: string;
  context?: string;
  gameId?: string;
  frequency?: number;  // How many times this translation was used
  confidence?: number; // 0-1, how confident we are in this translation
  notes?: string;
  created?: string;
  updated?: string;
  verified?: boolean;
}

export interface GlossaryStats {
  totalEntries: number;
  verifiedEntries: number;
  byCategory: Record<string, number>;
  byGame: Record<string, number>;
}

/**
 * Translation glossary manager
 */
export class TranslationGlossary {
  private entries: Map<string, GlossaryEntry> = new Map();
  private japaneseIndex: Map<string, GlossaryEntry[]> = new Map();
  private isDirty = false;

  constructor() {
    this.initializeDefaultGlossary();
  }

  /**
   * Initialize with common PC-98 game translations
   */
  private initializeDefaultGlossary(): void {
    const defaultEntries: GlossaryEntry[] = [
      // Menu items
      { id: 'gls_001', japanese: '新しいゲーム', english: 'New Game', category: 'ui_menu', verified: true },
      { id: 'gls_002', japanese: 'ゲーム再開', english: 'Continue Game', category: 'ui_menu', verified: true },
      { id: 'gls_003', japanese: 'ゲームをさいかいする', english: 'Resume Game', category: 'ui_menu', verified: true },
      { id: 'gls_004', japanese: 'オプション', english: 'Options', category: 'ui_menu', verified: true },
      { id: 'gls_005', japanese: 'セーブ', english: 'Save', category: 'ui_menu', verified: true },
      { id: 'gls_006', japanese: 'セーブゲーム', english: 'Save Game', category: 'ui_menu', verified: true },
      { id: 'gls_007', japanese: 'ロード', english: 'Load', category: 'ui_menu', verified: true },
      { id: 'gls_008', japanese: 'ロードゲーム', english: 'Load Game', category: 'ui_menu', verified: true },
      { id: 'gls_009', japanese: '終了', english: 'Exit', category: 'ui_menu', verified: true },
      { id: 'gls_010', japanese: 'やめる', english: 'Quit', category: 'ui_menu', verified: true },

      // Combat
      { id: 'gls_011', japanese: '攻撃', english: 'Attack', category: 'combat', verified: true },
      { id: 'gls_012', japanese: 'こうげき', english: 'Attack', category: 'combat', verified: true },
      { id: 'gls_013', japanese: '防御', english: 'Defend', category: 'combat', verified: true },
      { id: 'gls_014', japanese: 'ぼうぎょ', english: 'Defend', category: 'combat', verified: true },
      { id: 'gls_015', japanese: '魔法', english: 'Magic', category: 'combat', verified: true },
      { id: 'gls_016', japanese: 'まほう', english: 'Magic', category: 'combat', verified: true },
      { id: 'gls_017', japanese: 'アイテム', english: 'Item', category: 'combat', verified: true },
      { id: 'gls_018', japanese: 'アイテムを使う', english: 'Use Item', category: 'combat', verified: true },
      { id: 'gls_019', japanese: 'ダメージ', english: 'Damage', category: 'combat', verified: true },

      // Status/Character
      { id: 'gls_020', japanese: 'ステータス', english: 'Status', category: 'status', verified: true },
      { id: 'gls_021', japanese: 'キャラクター', english: 'Character', category: 'status', verified: true },
      { id: 'gls_022', japanese: 'そうび', english: 'Equipment', category: 'status', verified: true },
      { id: 'gls_023', japanese: '装備', english: 'Equipment', category: 'status', verified: true },
      { id: 'gls_024', japanese: 'スキル', english: 'Skills', category: 'status', verified: true },
      { id: 'gls_025', japanese: 'けいけんち', english: 'Experience', category: 'status', verified: true },
      { id: 'gls_026', japanese: '経験値', english: 'Experience', category: 'status', verified: true },

      // Battle outcomes
      { id: 'gls_027', japanese: '勝利', english: 'Victory', category: 'combat', verified: true },
      { id: 'gls_028', japanese: '敗北', english: 'Defeat', category: 'combat', verified: true },
      { id: 'gls_029', japanese: '敵', english: 'Enemy', category: 'combat', verified: true },
      { id: 'gls_030', japanese: '味方', english: 'Ally', category: 'combat', verified: true },
      { id: 'gls_031', japanese: '逃走', english: 'Escape', category: 'combat', verified: true },

      // Common phrases
      { id: 'gls_032', japanese: 'そうか。わかったよ。', english: 'I see. I understand.', category: 'dialog', verified: true },
      { id: 'gls_033', japanese: 'こんにちは、勇者よ。', english: 'Hello, brave hero.', category: 'dialog', verified: true }
    ];

    for (const entry of defaultEntries) {
      this.addEntry(entry);
    }
  }

  /**
   * Add a glossary entry
   */
  addEntry(entry: GlossaryEntry): void {
    if (!entry.id) {
      entry.id = `gls_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!entry.created) {
      entry.created = new Date().toISOString();
    }

    entry.updated = new Date().toISOString();

    this.entries.set(entry.id, entry);

    // Index by Japanese text
    if (!this.japaneseIndex.has(entry.japanese)) {
      this.japaneseIndex.set(entry.japanese, []);
    }
    this.japaneseIndex.get(entry.japanese)!.push(entry);

    this.isDirty = true;
  }

  /**
   * Find translation suggestions for a Japanese word
   */
  findSuggestions(japanese: string, maxResults: number = 5): GlossaryEntry[] {
    const exact = this.japaneseIndex.get(japanese) || [];
    if (exact.length > 0) {
      return exact.slice(0, maxResults);
    }

    // Find partial matches
    const prefix = japanese.substring(0, 2);
    const results: GlossaryEntry[] = [];

    for (const [key, entries] of this.japaneseIndex.entries()) {
      if (key.startsWith(prefix) && results.length < maxResults) {
        results.push(...entries);
      }
    }

    return results.slice(0, maxResults);
  }

  /**
   * Get exact translation
   */
  getTranslation(japanese: string): string | undefined {
    const entries = this.japaneseIndex.get(japanese);
    if (entries && entries.length > 0) {
      // Prefer verified entries
      const verified = entries.find(e => e.verified);
      return (verified || entries[0]).english;
    }
    return undefined;
  }

  /**
   * Update an entry
   */
  updateEntry(id: string, updates: Partial<GlossaryEntry>): boolean {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    Object.assign(entry, updates);
    entry.updated = new Date().toISOString();
    this.isDirty = true;

    return true;
  }

  /**
   * Delete an entry
   */
  deleteEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    this.entries.delete(id);

    // Remove from index
    const japanese = entry.japanese;
    const indexed = this.japaneseIndex.get(japanese);
    if (indexed) {
      const idx = indexed.indexOf(entry);
      if (idx !== -1) {
        indexed.splice(idx, 1);
      }
    }

    this.isDirty = true;
    return true;
  }

  /**
   * Get all entries
   */
  getAllEntries(): GlossaryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get entries by category
   */
  getByCategory(category: string): GlossaryEntry[] {
    return Array.from(this.entries.values()).filter(e => e.category === category);
  }

  /**
   * Get entries by game
   */
  getByGame(gameId: string): GlossaryEntry[] {
    return Array.from(this.entries.values()).filter(e => e.gameId === gameId);
  }

  /**
   * Get statistics
   */
  getStats(): GlossaryStats {
    const entries = this.getAllEntries();
    const stats: GlossaryStats = {
      totalEntries: entries.length,
      verifiedEntries: entries.filter(e => e.verified).length,
      byCategory: {},
      byGame: {}
    };

    for (const entry of entries) {
      if (entry.category) {
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
      }
      if (entry.gameId) {
        stats.byGame[entry.gameId] = (stats.byGame[entry.gameId] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Export to JSON
   */
  toJSON(): string {
    return JSON.stringify(
      {
        version: '1.0',
        exported: new Date().toISOString(),
        stats: this.getStats(),
        entries: this.getAllEntries()
      },
      null,
      2
    );
  }

  /**
   * Import from JSON
   */
  static fromJSON(jsonStr: string): TranslationGlossary {
    try {
      const data = JSON.parse(jsonStr);
      const glossary = new TranslationGlossary();

      if (data.entries && Array.isArray(data.entries)) {
        glossary.entries.clear();
        glossary.japaneseIndex.clear();

        for (const entry of data.entries) {
          glossary.addEntry(entry);
        }
      }

      return glossary;
    } catch (error) {
      console.error('Failed to import glossary:', error);
      return new TranslationGlossary();
    }
  }

  /**
   * Export to CSV format
   */
  toCSV(): string {
    const entries = this.getAllEntries();
    const headers = ['Japanese', 'English', 'Category', 'Context', 'Game', 'Verified', 'Notes'];
    const rows = entries.map(e => [
      e.japanese,
      e.english,
      e.category || '',
      e.context || '',
      e.gameId || '',
      e.verified ? 'Yes' : 'No',
      e.notes || ''
    ]);

    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Import from CSV format
   */
  static fromCSV(csvStr: string): TranslationGlossary {
    const glossary = new TranslationGlossary();
    const lines = csvStr.trim().split('\n');

    if (lines.length <= 1) {
      return glossary;
    }

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      try {
        const [japanese, english, category, context, gameId, verified, notes] = this.parseCSVLine(lines[i]);

        if (japanese && english) {
          glossary.addEntry({
            id: `gls_${i}`,
            japanese,
            english,
            category,
            context,
            gameId,
            verified: verified === 'Yes',
            notes
          });
        }
      } catch (e) {
        console.error(`Failed to parse CSV line ${i}:`, e);
      }
    }

    return glossary;
  }

  /**
   * Parse a CSV line (handle quoted fields)
   */
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Check if glossary has been modified
   */
  isDirtyFlag(): boolean {
    return this.isDirty;
  }

  /**
   * Clear dirty flag
   */
  clearDirty(): void {
    this.isDirty = false;
  }

  /**
   * Merge another glossary
   */
  merge(other: TranslationGlossary): void {
    for (const entry of other.getAllEntries()) {
      // Only add if we don't have a verified translation
      const existing = this.getTranslation(entry.japanese);
      if (!existing) {
        this.addEntry({ ...entry });
      }
    }
  }
}

/**
 * Create a new glossary from existing translations
 */
export function createGlossaryFromTranslations(strings: Array<{
  originalText: string;
  translation?: string;
  category?: string;
  verified?: boolean;
}>, gameId?: string): TranslationGlossary {
  const glossary = new TranslationGlossary();

  for (const str of strings) {
    if (str.translation && str.originalText) {
      glossary.addEntry({
        id: '',
        japanese: str.originalText,
        english: str.translation,
        category: str.category,
        gameId,
        verified: str.verified
      });
    }
  }

  return glossary;
}
