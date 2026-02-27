/**
 * FREE TRANSLATION BACKENDS
 * No-cost alternatives to Claude API for translating PC-98 games
 */

const { TranslationBackend } = require('./translation-service.js');

/**
 * OLLAMA LOCAL LLM BACKEND - 100% FREE, UNLIMITED
 * Runs open-source models locally on your machine
 * 
 * Setup:
 * 1. Install Ollama: https://ollama.ai/download
 * 2. Pull a model: ollama pull gemma2:9b
 * 3. Start Ollama (runs on localhost:11434)
 * 4. Use this backend with TranslationManager
 * 
 * Pros: Completely free, unlimited, private, customizable
 * Cons: Requires ~10GB disk space, slower without GPU
 */
class OllamaTranslationBackend extends TranslationBackend {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || 'http://localhost:11434/api/generate';
    // Recommended models (in order of quality):
    // - gemma2:9b (best balance of quality/speed)
    // - mistral:7b (fast, good for simple text)
    // - llama3.1:8b (excellent quality, slower)
    this.model = options.model || 'gemma2:9b';
  }

  async translate(japaneseText, context = {}) {
    const prompt = `You are a professional Japanese-to-English game translator for retro PC-98 games.

Translate the following Japanese text to natural English:
"${japaneseText}"

Rules:
- Keep translations under 60 characters when possible
- Preserve character names and proper nouns
- Use common game terminology
- Match the original tone
- Output ONLY the English translation, nothing else

Translation:`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3, // Low temp for consistent translations
            num_predict: 100
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      let translated = data.response.trim();
      
      // Clean up common issues
      translated = translated.replace(/^["']|["']$/g, '');
      translated = translated.split('\n')[0]; // Take first line only
      
      return translated || japaneseText;
    } catch (error) {
      console.error(`Ollama translation error: ${error.message}`);
      return japaneseText;
    }
  }
}

/**
 * GOOGLE TRANSLATE FREE TIER
 * Free tier: 500,000 characters/month
 * 
 * Setup:
 * 1. Get API key from Google Cloud Console
 * 2. Enable Cloud Translation API
 * 3. Stay under 500k chars/month (your project = ~130k chars = 26% of free tier)
 * 
 * Pros: Free tier sufficient for small projects, fast, reliable
 * Cons: Limited free tier, requires API key
 */
class GoogleTranslateFreeBackend extends TranslationBackend {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = 'https://translation.googleapis.com/language/translate/v2';
  }

  async translate(japaneseText, context = {}) {
    if (!this.apiKey) {
      throw new Error('Google API key required');
    }

    try {
      const url = `${this.baseUrl}?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: japaneseText,
          source: 'ja',
          target: 'en',
          format: 'text'
        })
      });

      if (!response.ok) {
        throw new Error(`Google Translate error: ${response.status}`);
      }

      const data = await response.json();
      return data.data.translations[0].translatedText;
    } catch (error) {
      console.error(`Google Translate error: ${error.message}`);
      return japaneseText;
    }
  }
}

/**
 * DEEPL FREE TIER
 * Free tier: 500,000 characters/month
 * 
 * Setup:
 * 1. Sign up at https://www.deepl.com/pro-api
 * 2. Get free API key
 * 3. Use free API endpoint (different from paid)
 * 
 * Pros: Excellent quality, free tier, fast
 * Cons: Limited to 500k chars/month
 */
class DeepLFreeBackend extends TranslationBackend {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    // Free tier uses different endpoint
    this.baseUrl = 'https://api-free.deepl.com/v2/translate';
  }

  async translate(japaneseText, context = {}) {
    if (!this.apiKey) {
      throw new Error('DeepL API key required');
    }

    try {
      const params = new URLSearchParams({
        auth_key: this.apiKey,
        text: japaneseText,
        source_lang: 'JA',
        target_lang: 'EN-US',
        formality: 'default'
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (!response.ok) {
        throw new Error(`DeepL error: ${response.status}`);
      }

      const data = await response.json();
      return data.translations[0].text;
    } catch (error) {
      console.error(`DeepL translation error: ${error.message}`);
      return japaneseText;
    }
  }
}

/**
 * LIBRETRANSLATE - SELF-HOSTED FREE
 * Fully open-source, can run locally or use public instance
 * 
 * Setup Option 1 (Public - Free but rate limited):
 * - Use: https://libretranslate.com
 * - No API key needed for basic usage
 * 
 * Setup Option 2 (Self-hosted - Unlimited):
 * - Install: pip install libretranslate
 * - Run: libretranslate --host 0.0.0.0
 * - Access: http://localhost:5000
 * 
 * Pros: Completely free, open-source, self-hostable
 * Cons: Lower quality than commercial APIs
 */
class LibreTranslateBackend extends TranslationBackend {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || 'https://libretranslate.com/translate';
    this.apiKey = options.apiKey; // Optional for public instance
  }

  async translate(japaneseText, context = {}) {
    try {
      const body = {
        q: japaneseText,
        source: 'ja',
        target: 'en',
        format: 'text'
      };

      if (this.apiKey) {
        body.api_key = this.apiKey;
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate error: ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText;
    } catch (error) {
      console.error(`LibreTranslate error: ${error.message}`);
      return japaneseText;
    }
  }
}

/**
 * ENHANCED GLOSSARY BACKEND (FREE, INSTANT)
 * Extended glossary with pattern matching and common phrases
 * Good for UI elements, menus, and common game terms
 * 
 * Pros: Instant, perfect for repetitive UI text, 0 cost
 * Cons: Can't handle unique dialog or complex sentences
 */
class EnhancedGlossaryBackend extends TranslationBackend {
  constructor() {
    super();
    this.glossary = this.buildGlossary();
  }

  buildGlossary() {
    return {
      // UI Elements
      '新しいゲーム': 'New Game',
      'ゲーム再開': 'Continue',
      'はじめから': 'Start New Game',
      'つづきから': 'Continue',
      'オプション': 'Options',
      '設定': 'Settings',
      'セーブ': 'Save',
      'ロード': 'Load',
      '終了': 'Quit',
      'タイトルに戻る': 'Return to Title',
      'メニュー': 'Menu',
      'キャンセル': 'Cancel',
      '決定': 'OK',
      '確認': 'Confirm',
      'はい': 'Yes',
      'いいえ': 'No',
      
      // Combat
      '攻撃': 'Attack',
      '防御': 'Defend',
      '魔法': 'Magic',
      'アイテム': 'Item',
      '逃げる': 'Flee',
      '技': 'Skill',
      '必殺技': 'Special',
      '戦う': 'Fight',
      '勝利': 'Victory',
      '敗北': 'Defeat',
      '経験値': 'EXP',
      'レベルアップ': 'Level Up',
      
      // Stats
      'HP': 'HP',
      'MP': 'MP',
      '攻撃力': 'ATK',
      '防御力': 'DEF',
      '素早さ': 'SPD',
      '体力': 'HP',
      '魔力': 'MAG',
      'ステータス': 'Status',
      'レベル': 'Level',
      
      // Character
      'キャラクター': 'Character',
      '装備': 'Equipment',
      'スキル': 'Skills',
      '能力': 'Abilities',
      '所持金': 'Gold',
      '所持品': 'Inventory',
      
      // Common
      '敵': 'Enemy',
      '味方': 'Ally',
      'モンスター': 'Monster',
      'ダンジョン': 'Dungeon',
      '街': 'Town',
      '店': 'Shop',
      '宿屋': 'Inn',
      '武器屋': 'Weapon Shop',
      '防具屋': 'Armor Shop',
      '道具屋': 'Item Shop'
    };
  }

  async translate(japaneseText, context = {}) {
    // Exact match
    if (this.glossary[japaneseText]) {
      return this.glossary[japaneseText];
    }

    // Partial match (compound words)
    for (const [jp, en] of Object.entries(this.glossary)) {
      if (japaneseText.includes(jp)) {
        return japaneseText.replace(jp, en);
      }
    }

    // No match - return original
    return japaneseText;
  }
}

module.exports = {
  OllamaTranslationBackend,
  GoogleTranslateFreeBackend,
  DeepLFreeBackend,
  LibreTranslateBackend,
  EnhancedGlossaryBackend
};
