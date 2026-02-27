/**
 * Text Reflow Engine for PC-98 Games
 * 
 * Handles intelligent wrapping of translated text to fit original textbox dimensions.
 * Supports both English (space-based) and Japanese (character-based) wrapping.
 * 
 * @module text-reflow
 */

/**
 * Textbox constraint definition
 * @typedef {Object} TextboxConstraint
 * @property {number} widthTiles - Textbox width in tiles/characters
 * @property {number} [heightTiles] - Optional: number of lines available
 * @property {'ascii' | 'sjis' | 'mixed'} encoding - What text can appear
 * @property {boolean} [preserveNewlines] - Keep explicit \n characters
 * @property {string[]} [controlCodes] - Reserved bytes like [0xFF], [0xFE]
 */

/**
 * Wrapped text output with metadata
 * @typedef {Object} WrappedText
 * @property {string} original - Original Japanese text
 * @property {string} translation - English translation input
 * @property {string} wrapped - Final wrapped text (lines joined by \n)
 * @property {string[]} lines - Individual lines after wrapping
 * @property {number[]} byteLengths - Byte length per line (in ASCII)
 * @property {string[]} warnings - Issues found: "Line 2 exceeds by 5 chars", etc.
 * @property {'ok' | 'truncated' | 'wrapped' | 'overflow' | 'needs_manual'} status
 */

const ALSHARK_CONSTRAINTS = {
  dialog: {
    widthTiles: 16,
    heightTiles: 3,
    encoding: 'ascii',
    preserveNewlines: true,
    description: 'Dialog/narrative text'
  },
  menu: {
    widthTiles: 12,
    heightTiles: 1,
    encoding: 'ascii',
    description: 'Menu options'
  },
  status: {
    widthTiles: 8,
    heightTiles: 4,
    encoding: 'ascii',
    description: 'Combat/status display'
  },
  item_name: {
    widthTiles: 10,
    heightTiles: 1,
    encoding: 'ascii',
    description: 'Item/creature names'
  },
  default: {
    widthTiles: 16,
    heightTiles: 1,
    encoding: 'ascii'
  }
};

class TextReflowEngine {
  /**
   * Initialize the reflow engine with optional profile
   * @param {Object} [profile] - Game profile with constraint mappings
   */
  constructor(profile = {}) {
    this.profiles = {
      'alshark-pc98': ALSHARK_CONSTRAINTS,
      ...profile
    };
    this.activeProfile = 'alshark-pc98';
  }

  /**
   * Set active game profile
   * @param {string} profileName
   */
  setProfile(profileName) {
    if (!this.profiles[profileName]) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    this.activeProfile = profileName;
  }

  /**
   * Get constraint for a specific context
   * @param {string} category - Text category (dialog, menu, name_item, etc.)
   * @param {number} [offset] - Optional: byte offset in disk (for future mapping)
   * @returns {TextboxConstraint}
   */
  getConstraintFor(category, offset = null) {
    const profile = this.profiles[this.activeProfile];
    
    // Map extraction category to constraint
    const categoryMap = {
      'dialog': 'dialog',
      'ui_menu': 'menu',
      'combat_status': 'status',
      'name_item': 'item_name',
      'location': 'dialog',
      'other': 'default'
    };

    const constraintType = categoryMap[category] || 'default';
    return profile[constraintType] || profile.default;
  }

  /**
   * Detect language of text (simple heuristic)
   * @param {string} text
   * @returns {'english' | 'japanese' | 'mixed'}
   */
  detectLanguage(text) {
    // Check for Japanese character ranges in Unicode
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
    const matches = text.match(japanesePattern) || [];
    
    if (matches.length === 0) return 'english';
    if (matches.length / text.length > 0.7) return 'japanese';
    return 'mixed';
  }

  /**
   * Wrap English text with intelligent space-based breaking
   * @param {string} text - English text
   * @param {number} widthChars - Maximum characters per line  
   * @returns {string[]} - Array of lines
   */
  wrapEnglish(text, widthChars) {
    if (!text || text.length === 0) return [];
    if (text.length <= widthChars) return [text];

    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;

      if (testLine.length <= widthChars) {
        currentLine = testLine;
      } else {
        // Current line is full
        if (currentLine) {
          lines.push(currentLine);
        }
        // Word itself might be longer than width
        if (word.length > widthChars) {
          // Hyphenate long word
          lines.push(...this.hyphenateWord(word, widthChars));
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Hyphenate a word that exceeds line width
   * @param {string} word - Single word (no spaces)
   * @param {number} widthChars - Line width
   * @returns {string[]} - Hyphenated segments
   */
  hyphenateWord(word, widthChars) {
    if (word.length <= widthChars) return [word];

    const lines = [];
    // Leave room for hyphen on all but last line
    const segmentWidth = widthChars - 1;

    for (let i = 0; i < word.length; i += segmentWidth) {
      const segment = word.substring(i, i + segmentWidth);
      const isLast = (i + segmentWidth) >= word.length;
      
      if (!isLast && segment.length === segmentWidth) {
        lines.push(segment + '-');
      } else {
        lines.push(segment);
      }
    }

    return lines;
  }

  /**
   * Wrap Japanese text with character-based breaking
   * Avoids Hiragana punctuation at line start
   * @param {string} text - Japanese text
   * @param {number} widthChars - Characters per line
   * @returns {string[]} - Array of lines
   */
  wrapJapanese(text, widthChars) {
    if (!text || text.length === 0) return [];

    const lines = [];
    let currentLine = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = i + 1 < text.length ? text[i + 1] : null;

      // Check if adding this character exceeds width
      if ((currentLine + char).length > widthChars) {
        // Check if current line ends with "open" punctuation
        const endsWithOpen = /[「『『]/u.test(currentLine);
        
        if (currentLine && !endsWithOpen) {
          lines.push(currentLine);
          currentLine = char;
        } else if (currentLine) {
          // Even with open punct, must break eventually
          lines.push(currentLine);
          currentLine = char;
        }
      } else {
        currentLine += char;
      }

      // Also break on explicit newlines
      if (char === '\n') {
        lines.push(currentLine.slice(0, -1));
        currentLine = '';
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Main reflow function
   * @param {string} translation - Text to reflow
   * @param {TextboxConstraint} constraint - Box constraints
   * @param {string} [originalJapanese] - Original Japanese for reference
   * @param {Object} [config] - Optional: { hyphenate: bool, aggressive: bool }
   * @returns {WrappedText}
   */
  reflowText(translation, constraint, originalJapanese = null, config = {}) {
    const {
      hyphenate = true,
      aggressive = false
    } = config;

    // Detect language
    const language = this.detectLanguage(translation);

    // Choose wrapping strategy
    let lines = [];
    let strategy = 'none';

    if (language === 'english') {
      lines = this.wrapEnglish(translation, constraint.widthTiles);
      strategy = 'english-space-break';
    } else if (language === 'japanese') {
      lines = this.wrapJapanese(translation, constraint.widthTiles);
      strategy = 'japanese-char-break';
    } else {
      // Mixed: try English wrapping first
      lines = this.wrapEnglish(translation, constraint.widthTiles);
      strategy = 'mixed-english-first';
    }

    // Check constraints
    const warnings = [];
    let status = 'ok';

    // Check line count
    if (constraint.heightTiles && lines.length > constraint.heightTiles) {
      warnings.push(`Exceeds height: ${lines.length} lines > ${constraint.heightTiles} allowed`);
      status = 'overflow';
      
      if (aggressive) {
        // Truncate to fit
        lines = lines.slice(0, constraint.heightTiles);
        status = 'truncated';
        warnings.push(`Truncated to ${constraint.heightTiles} lines`);
      }
    }

    // Check line widths
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > constraint.widthTiles) {
        warnings.push(`Line ${i + 1} exceeds: "${line}" (${line.length} > ${constraint.widthTiles})`);
        
        if (status === 'ok') {
          status = 'overflow';
        }
        
        if (aggressive) {
          lines[i] = line.substring(0, constraint.widthTiles);
          status = 'truncated';
        }
      }
    }

    // Check punctuation at line start (Japanese style issues)
    for (let i = 1; i < lines.length; i++) {
      if (/^[。、，！？）」』】]/.test(lines[i])) {
        warnings.push(`Line ${i + 1} starts with closing punctuation: "${lines[i][0]}"`);
        if (status === 'ok') status = 'needs_manual';
      }
    }

    // Build wrapped text
    const wrapped = lines.join('\n');

    // Calculate byte lengths (ASCII = 1 byte per char for simplicity)
    const byteLengths = lines.map(line => {
      // Real implementation would count actual Shift-JIS bytes
      return line.length;
    });

    // Determine final status
    if (warnings.length === 0 && status === 'ok') {
      status = 'ok';
    } else if (warnings.length > 0 && status === 'ok') {
      status = 'needs_manual';
    }

    if (lines.length > 1 && status === 'ok') {
      status = 'wrapped';
    }

    return {
      original: originalJapanese || '[not provided]',
      translation,
      wrapped,
      lines,
      byteLengths,
      warnings,
      status,
      metadata: {
        language,
        strategy,
        lineCount: lines.length,
        maxLineWidth: constraint.widthTiles,
        maxLineHeight: constraint.heightTiles,
        constraint
      }
    };
  }

  /**
   * Batch reflow an array of translations
   * @param {Array} translations - Array of { original, translation, category }
   * @param {Object} [config] - Reflow config
   * @returns {Array} - Array of wrapped results
   */
  reflowBatch(translations, config = {}) {
    return translations.map(item => {
      const constraint = this.getConstraintFor(item.category || 'other');
      return this.reflowText(
        item.translation,
        constraint,
        item.original,
        config
      );
    });
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TextReflowEngine, ALSHARK_CONSTRAINTS };
}
