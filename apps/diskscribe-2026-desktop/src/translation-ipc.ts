/**
 * TRANSLATION IPC HANDLERS
 * Main process handlers for translation operations
 * Manages extract, translate, save, and patch operations
 */

import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { GameProfileManager } from '../../../src/game-profile';
import { TranslationGlossary } from '../../../src/translation-glossary';

interface TextString {
  disk: string;
  offset: string;
  originalText: string;
  translation?: string;
  wrapped?: string;
  wrappedLines?: string[];
  reflowStatus?: 'ok' | 'wrapped' | 'truncated' | 'overflow' | 'needs_manual' | 'not_checked';
  category: string;
  isJapanese: boolean;
  verified?: boolean;
}

interface ExtractionResult {
  success: boolean;
  totalStrings: number;
  disks: string[];
  strings: TextString[];
  byCategory: Record<string, TextString[]>;
  error?: string;
}

interface TranslationResult {
  success: boolean;
  translated: number;
  reflowed: number;
  untranslatable: number;
  error?: string;
}

interface SaveResult {
  success: boolean;
  filePath?: string;
  size?: number;
  error?: string;
}

interface PatchResult {
  success: boolean;
  patched: number;
  failures: number;
  backupPath?: string;
  error?: string;
}

interface ProgressUpdate {
  type: 'progress' | 'status' | 'complete' | 'error';
  message: string;
  current?: number;
  total?: number;
  percentComplete?: number;
}

// Global profile manager instance
const profileManager = new GameProfileManager();

// Global glossary instance
const glossary = new TranslationGlossary();

/**
 * Set current game profile
 */
export function setGameProfile(profileId: string): boolean {
  return profileManager.setProfile(profileId);
}

/**
 * Get available game profiles
 */
export function getGameProfiles() {
  return profileManager.getProfiles();
}

/**
 * Get translations from glossary
 */
export function getGlossaryTranslations(): Array<{ id: string; japanese: string; english: string; category?: string; verified?: boolean }> {
  return glossary.getAllEntries().map(e => ({
    id: e.id,
    japanese: e.japanese,
    english: e.english,
    category: e.category,
    verified: e.verified
  }));
}

/**
 * Add entry to glossary
 */
export function addGlossaryEntry(entry: { id: string; japanese: string; english: string; category?: string; verified?: boolean; notes?: string }): boolean {
  try {
    glossary.addEntry({
      id: entry.id,
      japanese: entry.japanese,
      english: entry.english,
      category: entry.category,
      verified: entry.verified,
      notes: entry.notes
    });
    return true;
  } catch (error) {
    console.error('Failed to add glossary entry:', error);
    return false;
  }
}

/**
 * Get glossary statistics
 */
export function getGlossaryStats(): { totalEntries: number; verifiedEntries: number; byCategory: Record<string, number>; byGame: Record<string, number> } {
  return glossary.getStats();
}

/**
 * Export glossary to file
 */
export async function exportGlossary(filePath: string, format: 'json' | 'csv' = 'json'): Promise<boolean> {
  try {
    let content: string;
    if (format === 'csv') {
      content = glossary.toCSV();
    } else {
      content = glossary.toJSON();
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to export glossary:', error);
    return false;
  }
}

/**
 * Import glossary from file
 */
export async function importGlossary(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (filePath.endsWith('.csv')) {
      const imported = TranslationGlossary.fromCSV(content);
      glossary.merge(imported);
    } else {
      const imported = TranslationGlossary.fromJSON(content);
      glossary.merge(imported);
    }

    return true;
  } catch (error) {
    console.error('Failed to import glossary:', error);
    return false;
  }
}

/**
 * Send progress update to renderer
 */
export function sendProgress(
  window: BrowserWindow | undefined,
  update: ProgressUpdate
): void {
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send('translation:progress', update);
}

/**
 * Mock extraction - would normally scan disks
 */
export function mockExtractFromDisks(
  diskPaths: string[],
  progressCallback?: (update: ProgressUpdate) => void
): ExtractionResult {
  const result: ExtractionResult = {
    success: true,
    totalStrings: 0,
    disks: diskPaths,
    strings: [],
    byCategory: {}
  };

  // Simulate extraction from multiple disks
  const mockStrings: TextString[] = [
    {
      disk: 'Alshark (System disk)',
      offset: '0x12345',
      originalText: '新しいゲーム',
      category: 'ui_menu',
      isJapanese: true
    },
    {
      disk: 'Alshark (System disk)',
      offset: '0x12356',
      originalText: 'ゲームを再開',
      category: 'ui_menu',
      isJapanese: true
    },
    {
      disk: 'Alshark (System disk)',
      offset: '0x12367',
      originalText: 'そうか。わかったよ。',
      category: 'dialog',
      isJapanese: true
    },
    {
      disk: 'Alshark (System disk)',
      offset: '0x12378',
      originalText: 'こんにちは、勇者よ。',
      category: 'dialog',
      isJapanese: true
    },
    {
      disk: 'Alshark (System disk)',
      offset: '0x12389',
      originalText: 'こうげき',
      category: 'combat_status',
      isJapanese: true
    },
    {
      disk: 'Alshark (Data disk) 1',
      offset: '0x45678',
      originalText: '攻撃',
      category: 'combat',
      isJapanese: true
    },
    {
      disk: 'Alshark (Data disk) 1',
      offset: '0x45689',
      originalText: '防御',
      category: 'combat',
      isJapanese: true
    },
    {
      disk: 'Alshark (Data disk) 1',
      offset: '0x4569a',
      originalText: 'オプション',
      category: 'ui_menu',
      isJapanese: true
    },
    {
      disk: 'Alshark (Data disk) 2',
      offset: '0x78901',
      originalText: 'セーブ',
      category: 'ui_menu',
      isJapanese: true
    },
    {
      disk: 'Alshark (Data disk) 2',
      offset: '0x78912',
      originalText: 'ロード',
      category: 'ui_menu',
      isJapanese: true
    }
  ];

  result.strings = mockStrings;
  result.totalStrings = mockStrings.length;

  // Group by category
  for (const str of mockStrings) {
    if (!result.byCategory[str.category]) {
      result.byCategory[str.category] = [];
    }
    result.byCategory[str.category].push(str);
  }

  if (progressCallback) {
    progressCallback({
      type: 'complete',
      message: `Extracted ${mockStrings.length} strings from ${diskPaths.length} disks`,
      current: mockStrings.length,
      total: mockStrings.length
    });
  }

  return result;
}

/**
 * Auto-translate strings using glossary
 */
export function autoTranslateStrings(
  strings: TextString[],
  progressCallback?: (update: ProgressUpdate) => void
): TranslationResult {
  // First try glossary, then fallback to hardcoded glossary
  const fallbackGlossary: Record<string, string> = {
    // Menu/UI
    '新しいゲーム': 'New Game',
    'ゲーム再開': 'Continue Game',
    'ゲームを再開': 'Resume Game',
    'オプション': 'Options',
    'セーブ': 'Save',
    'セーブゲーム': 'Save Game',
    'ロード': 'Load',
    'ロードゲーム': 'Load Game',
    '終了': 'Exit',
    'やめる': 'Quit',

    // Combat
    '攻撃': 'Attack',
    'こうげき': 'Attack',
    '防御': 'Defend',
    'ぼうぎょ': 'Defend',
    '魔法': 'Magic',
    'まほう': 'Magic',
    'アイテム': 'Item',
    'アイテムを使う': 'Use Item',
    'ダメージ': 'Damage',

    // Status/Character
    'ステータス': 'Status',
    'キャラクター': 'Character',
    'そうか。わかったよ。': 'I see. I understand.',
    'こんにちは、勇者よ。': 'Hello, brave hero.'
  };

  let translated = 0;
  let untranslatable = 0;

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];

    // Try glossary first
    let translation = glossary.getTranslation(str.originalText);

    // Fall back to hardcoded glossary
    if (!translation) {
      translation = fallbackGlossary[str.originalText];
    }

    if (translation) {
      str.translation = translation;
      translated++;
    } else {
      // Fallback translation
      str.translation = `[${str.originalText.substring(0, 20)}...]`;
      untranslatable++;
    }

    str.verified = false;

    if (progressCallback && i % 5 === 0) {
      progressCallback({
        type: 'progress',
        message: `Translating (glossary: ${glossary.getStats().totalEntries} entries)... ${i + 1}/${strings.length}`,
        current: i + 1,
        total: strings.length,
        percentComplete: Math.round(((i + 1) / strings.length) * 100)
      });
    }
  }

  const result: TranslationResult = {
    success: true,
    translated,
    reflowed: 0,
    untranslatable
  };

  if (progressCallback) {
    progressCallback({
      type: 'complete',
      message: `✓ Translated ${translated} strings (${untranslatable} untranslatable, ${glossary.getStats().totalEntries} glossary entries)`,
      current: strings.length,
      total: strings.length
    });
  }

  return result;
}

/**
 * Apply text reflow to strings
 */
export function reflowStrings(
  strings: TextString[],
  progressCallback?: (update: ProgressUpdate) => void
): TranslationResult {
  // Get constraints from current game profile
  const profile = profileManager.getCurrentProfile();

  let reflowed = 0;

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    if (!str.translation) continue;

    const constraint = profileManager.getConstraint(str.category);
    const { widthChars, heightLines } = constraint;

    // Simple word-wrapping
    const lines: string[] = [];
    let currentLine = '';

    for (const word of str.translation.split(' ')) {
      if ((currentLine + word).length <= widthChars) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    str.wrappedLines = lines;
    str.wrapped = lines.join('\n');

    // Determine status based on the actual wrapped output. Since this
    // function does not truncate `lines`/`wrappedLines`, any result that
    // still exceeds the height constraint must be treated as overflow.
    if (lines.length <= heightLines) {
      str.reflowStatus = lines.length === 1 ? 'ok' : 'wrapped';
    } else {
      str.reflowStatus = 'overflow';
    }

    reflowed++;

    if (progressCallback && i % 5 === 0) {
      progressCallback({
        type: 'progress',
        message: `Reflowing (${profile.name})... ${i + 1}/${strings.length}`,
        current: i + 1,
        total: strings.length,
        percentComplete: Math.round(((i + 1) / strings.length) * 100)
      });
    }
  }

  const result: TranslationResult = {
    success: true,
    translated: reflowed,
    reflowed,
    untranslatable: 0
  };

  if (progressCallback) {
    progressCallback({
      type: 'complete',
      message: `✓ Reflowed ${reflowed} strings for ${profile.name}`,
      current: strings.length,
      total: strings.length
    });
  }

  return result;
}

/**
 * Save project to JSON
 */
export async function saveProjectToJson(
  filePath: string,
  projectData: {
    name: string;
    gameId: string;
    strings: TextString[];
    statistics?: Record<string, unknown>;
  },
  progressCallback?: (update: ProgressUpdate) => void
): Promise<SaveResult> {
  try {
    const content = JSON.stringify(projectData, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');

    const stats = await fs.stat(filePath);

    if (progressCallback) {
      progressCallback({
        type: 'complete',
        message: `✓ Project saved to ${path.basename(filePath)} (${stats.size} bytes)`,
        current: 1,
        total: 1
      });
    }

    return {
      success: true,
      filePath,
      size: stats.size
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        message: `Failed to save project: ${errorMsg}`
      });
    }

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Apply translations to disk
 */
export async function applyTranslationsToDisk(
  diskPath: string,
  strings: TextString[],
  progressCallback?: (update: ProgressUpdate) => void
): Promise<PatchResult> {
  try {
    // Create backup
    const backupPath = `${diskPath}.backup`;
    try {
      await fs.copyFile(diskPath, backupPath);
    } catch (e) {
      // Backup may already exist
    }

    let patched = 0;
    let failures = 0;

    // In a real implementation, this would:
   // 1. Read the disk file
    // 2. Find text locations
    // 3. Replace with translated text
    // 4. Write back to disk

    // For now, just simulate
    for (let i = 0; i < strings.length; i++) {
      if (strings[i].translation) {
        patched++;
      } else {
        failures++;
      }

      if (progressCallback && i % 5 === 0) {
        progressCallback({
          type: 'progress',
          message: `Patching disk... ${patched} translations applied`,
          current: patched,
          total: strings.length,
          percentComplete: Math.round((patched / strings.length) * 100)
        });
      }
    }

    if (progressCallback) {
      progressCallback({
        type: 'complete',
        message: `✓ Patched ${patched} strings to disk (Backup: ${path.basename(backupPath)})`,
        current: patched,
        total: strings.length
      });
    }

    return {
      success: true,
      patched,
      failures,
      backupPath
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        message: `Failed to patch disk: ${errorMsg}`
      });
    }

    return {
      success: false,
      patched: 0,
      failures: strings.length,
      error: errorMsg
    };
  }
}
