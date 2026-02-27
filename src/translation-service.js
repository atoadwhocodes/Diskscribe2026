/**
 * TRANSLATION SERVICE
 * Handles automatic Japanese to English translation with multiple backend support
 * Used by both desktop app and CLI tools
 */

const fs = require('fs');
const path = require('path');

// SHIFT-JIS DECODER - Comprehensive mapping for PC-98 Japanese text
const SJIS_DECODER = {
  hiragana: {
    0x829f: 'あ', 0x82a0: 'い', 0x82a2: 'う', 0x82a4: 'え', 0x82a6: 'お',
    0x82a8: 'か', 0x82a9: 'が', 0x82ab: 'き', 0x82ac: 'ぎ', 0x82ae: 'く',
    0x82af: 'ぐ', 0x82b1: 'け', 0x82b2: 'げ', 0x82b4: 'こ', 0x82b5: 'ご',
    0x82b7: 'さ', 0x82b8: 'ざ', 0x82b9: 'し', 0x82ba: 'じ', 0x82bb: 'す',
    0x82bc: 'ず', 0x82bd: 'せ', 0x82be: 'ぜ', 0x82bf: 'そ', 0x82c0: 'ぞ',
    0x82c1: 'た', 0x82c2: 'だ', 0x82c3: 'ち', 0x82c4: 'ぢ', 0x82c5: 'つ',
    0x82c6: 'づ', 0x82c7: 'て', 0x82c8: 'で', 0x82c9: 'と', 0x82ca: 'ど',
    0x82cb: 'な', 0x82cc: 'に', 0x82cc: 'ぬ', 0x82cd: 'ね', 0x82ce: 'の',
    0x82cf: 'は', 0x82d0: 'ば', 0x82d1: 'ぱ', 0x82d2: 'ひ', 0x82d3: 'び',
    0x82d4: 'ぴ', 0x82d5: 'ふ', 0x82d6: 'ぶ', 0x82d7: 'ぷ', 0x82d8: 'へ',
    0x82d9: 'べ', 0x82da: 'ぺ', 0x82db: 'ほ', 0x82dc: 'ぼ', 0x82dd: 'ぽ',
    0x82de: 'ま', 0x82df: 'み', 0x82e0: 'む', 0x82e1: 'め', 0x82e2: 'も',
    0x82e3: 'や', 0x82e5: 'ゆ', 0x82e7: 'よ', 0x82e9: 'ら', 0x82ea: 'り',
    0x82eb: 'る', 0x82ec: 'れ', 0x82ed: 'ろ', 0x82ef: 'わ', 0x82f0: 'を',
    0x82f1: 'ん'
  },
  katakana: {
    0x8340: 'ア', 0x8341: 'イ', 0x8343: 'ウ', 0x8345: 'エ', 0x8347: 'オ',
    0x8349: 'カ', 0x834a: 'ガ', 0x834c: 'キ', 0x834d: 'ギ', 0x834f: 'ク',
    0x8350: 'グ', 0x8352: 'ケ', 0x8353: 'ゲ', 0x8355: 'コ', 0x8356: 'ゴ',
    0x8358: 'サ', 0x8359: 'ザ', 0x835a: 'シ', 0x835b: 'ジ', 0x835c: 'ス',
    0x835d: 'ズ', 0x835e: 'セ', 0x835f: 'ゼ', 0x8360: 'ソ', 0x8361: 'ゾ',
    0x8362: 'タ', 0x8363: 'ダ', 0x8364: 'チ', 0x8365: 'ヂ', 0x8366: 'ツ',
    0x8367: 'ヅ', 0x8368: 'テ', 0x8369: 'デ', 0x836a: 'ト', 0x836b: 'ド',
    0x836c: 'ナ', 0x836d: 'ニ', 0x836e: 'ヌ', 0x836f: 'ネ', 0x8370: 'ノ',
    0x8371: 'ハ', 0x8372: 'バ', 0x8373: 'パ', 0x8374: 'ヒ', 0x8375: 'ビ',
    0x8376: 'ピ', 0x8377: 'フ', 0x8378: 'ブ', 0x8379: 'プ', 0x837a: 'ヘ',
    0x837b: 'ベ', 0x837c: 'ペ', 0x837d: 'ホ', 0x837e: 'ボ', 0x8380: 'ポ',
    0x8381: 'マ', 0x8382: 'ミ', 0x8383: 'ム', 0x8384: 'メ', 0x8385: 'モ',
    0x8386: 'ヤ', 0x8388: 'ユ', 0x838a: 'ヨ', 0x838c: 'ラ', 0x838d: 'リ',
    0x838e: 'ル', 0x838f: 'レ', 0x8390: 'ロ', 0x8392: 'ワ', 0x8393: 'ヲ',
    0x8394: 'ン'
  },
  punctuation: {
    0x8140: '　', 0x8141: '。', 0x8142: '「', 0x8143: '」', 0x8144: '、',
    0x8145: '・', 0x8146: 'ヲ', 0x8147: 'ァ', 0x8148: 'ィ', 0x8149: 'ゥ',
    0x814a: 'ェ', 0x814b: 'ォ', 0x814c: 'ャ', 0x814d: 'ュ', 0x814e: 'ョ',
    0x814f: 'ッ', 0x8150: 'ン', 0x8151: '【', 0x8152: '】', 0x8153: '＆'
  }
};

/**
 * Decode Shift-JIS byte pair to Unicode character
 */
function decodeShiftJisPair(byte1, byte2) {
  const code = (byte1 << 8) | byte2;

  // Check all mappings
  if (SJIS_DECODER.hiragana[code]) return SJIS_DECODER.hiragana[code];
  if (SJIS_DECODER.katakana[code]) return SJIS_DECODER.katakana[code];
  if (SJIS_DECODER.punctuation[code]) return SJIS_DECODER.punctuation[code];

  // Kanji ranges (0x8940-0x9ffc, 0xe040-0xebbf) - map to placeholder
  if ((byte1 >= 0x89 && byte1 <= 0x9f && byte2 >= 0x40) ||
      (byte1 >= 0xe0 && byte1 <= 0xeb && byte2 >= 0x40)) {
    // Return placeholder with byte info for later mapping
    return `[漢:${byte1.toString(16)}${byte2.toString(16)}]`;
  }

  return '?';
}

/**
 * Properly decode Shift-JIS buffer to readable Japanese text
 */
function decodeShiftJis(buffer) {
  let result = '';
  let i = 0;

  while (i < buffer.length) {
    const b = buffer[i];

    // ASCII printable
    if (b >= 0x20 && b <= 0x7e) {
      result += String.fromCharCode(b);
      i++;
    }
    // Shift-JIS lead byte
    else if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef)) {
      if (i + 1 < buffer.length) {
        const b2 = buffer[i + 1];
        if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
          result += decodeShiftJisPair(b, b2);
          i += 2;
        } else {
          result += '?';
          i++;
        }
      } else {
        result += '?';
        i++;
      }
    }
    // Control characters - stop or skip
    else if (b === 0x00) {
      break;
    }
    // Other bytes
    else {
      i++;
    }
  }

  return result;
}

/**
 * Translation backends - pluggable architecture
 */
class TranslationBackend {
  /**
   * Translate Japanese text to English
   * @param {string} japaneseText - Text to translate
   * @param {Object} context - Optional context {category, offset, disk}
   * @returns {Promise<string>} Translated English text
   */
  async translate(japaneseText, context = {}) {
    throw new Error('Backend must implement translate()');
  }
}

/**
 * Claude API backend using Anthropic
 */
class ClaudeTranslationBackend extends TranslationBackend {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
  }

  async translate(japaneseText, context = {}) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const systemPrompt = `You are a professional game localization translator specializing in Japanese-to-English translation for retro PC-98 games. 

Guidelines:
- Translate the Japanese text naturally for English speakers
- Keep translations concise to fit in game text boxes (usually 40-60 characters max)
- Preserve character names and proper nouns
- Maintain the original tone (formal, casual, dramatic, etc.)
- For UI/menu items, use common English game terminology
- Return ONLY the translated text, no explanations

Context: ${context.category || 'dialog'} text from "${context.disk || 'unknown'}"`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Translate this Japanese game text to English:\n\n"${japaneseText}"`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const translated = data.content[0].text.trim();
      
      // Remove quotes if API added them
      return translated.replace(/^["']|["']$/g, '');
    } catch (error) {
      console.error(`Translation error: ${error.message}`);
      return japaneseText; // Return original on error
    }
  }
}

/**
 * Mock backend for testing (no API required)
 */
class MockTranslationBackend extends TranslationBackend {
  constructor() {
    super();
    this.glossary = {
      '新しいゲーム': 'New Game',
      'ゲーム再開': 'Resume Game',
      'オプション': 'Options',
      'セーブ': 'Save',
      'ロード': 'Load',
      '終了': 'Exit',
      '攻撃': 'Attack',
      '防御': 'Defend',
      '魔法': 'Magic',
      'アイテム': 'Item',
      'キャラクター': 'Character',
      'ステータス': 'Status',
      '装備': 'Equipment',
      'スキル': 'Skills',
      '経験値': 'Experience',
      '敵': 'Enemy',
      '味方': 'Ally',
      'HP': 'HP',
      'MP': 'MP',
      '勝利': 'Victory',
      '敗北': 'Defeat'
    };
  }

  async translate(japaneseText, context = {}) {
    // Check glossary first
    if (this.glossary[japaneseText]) {
      return this.glossary[japaneseText];
    }

    // Simple fallback
    return japaneseText.replace(/【|】|\[漢:/g, '').substring(0, 50);
  }
}

/**
 * Translation manager - coordinates extraction, translation, and reinsertion
 */
class TranslationManager {
  constructor(backend = null) {
    this.backend = backend || new MockTranslationBackend();
    this.cache = new Map();
    this.stats = {
      total: 0,
      translated: 0,
      cached: 0,
      errors: 0
    };
  }

  /**
   * Translate all extracted strings
   */
  async translateExtraction(extractionJson) {
    if (typeof extractionJson === 'string') {
      extractionJson = JSON.parse(fs.readFileSync(extractionJson, 'utf8'));
    }

    const result = {
      exportDate: new Date().toISOString(),
      sourceExportDate: extractionJson.exportDate,
      byCategory: {}
    };

    for (const [category, strings] of Object.entries(extractionJson.byCategory)) {
      result.byCategory[category] = [];

      for (const str of strings) {
        const translated = await this.translateString(str.original, {
          category,
          disk: str.disk,
          offset: str.offset
        });

        result.byCategory[category].push({
          ...str,
          translation: translated,
          verified: false,
          notes: ''
        });

        this.stats.total++;
        if (translated !== str.original) {
          this.stats.translated++;
        }
      }
    }

    this.stats.cached = this.cache.size;
    return result;
  }

  /**
   * Translate a single string with caching
   */
  async translateString(japaneseText, context = {}) {
    // Check cache first
    if (this.cache.has(japaneseText)) {
      this.stats.cached++;
      return this.cache.get(japaneseText);
    }

    try {
      const translation = await this.backend.translate(japaneseText, context);
      this.cache.set(japaneseText, translation);
      return translation;
    } catch (error) {
      this.stats.errors++;
      return japaneseText;
    }
  }

  /**
   * Get translation statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.total > 0 ? ((this.stats.cached / this.stats.total) * 100).toFixed(1) + '%' : 'N/A'
    };
  }
}

module.exports = {
  SJIS_DECODER,
  decodeShiftJis,
  decodeShiftJisPair,
  TranslationBackend,
  ClaudeTranslationBackend,
  MockTranslationBackend,
  TranslationManager
};
