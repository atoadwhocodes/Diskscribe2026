/**
 * ALSHARK Translator - Google Gemini API
 * High-quality Japanese→English translation using Gemini 2.0 Flash
 * With checkpointing, half-width katakana normalization, and retry logic.
 * 
 * Free tier: 15 RPM, 1M tokens/min, 1500 req/day
 * Usage: set GEMINI_API_KEY env var or edit API_KEY below, then run:
 *   node translate-gemini.js
 */
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Configuration ──────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY || '***REMOVED***';
const MODEL_NAME = 'gemini-2.0-flash';

const INPUT = 'ALSHARK-EXTRACTED-REV/alshark-translation-ready.json';
const OUTPUT_DIR = 'ALSHARK-TRANSLATED-REV';
const CHECKPOINT = path.join(OUTPUT_DIR, 'gemini-checkpoint.json');
const OUTPUT = path.join(OUTPUT_DIR, 'translations.json');

// Free tier: 15 RPM → 1 request per 4 seconds to be safe
const DELAY_MS = 4200;
const CHECKPOINT_EVERY = 10;
const MAX_RETRIES = 3;

// ── Batch mode: send multiple strings per request for speed ──
// Each game string is short (~20-80 chars), so we can batch them
const BATCH_SIZE = 10;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert half-width katakana (U+FF61-FF9F) to hiragana equivalents.
 * PC-98 games use half-width katakana as a hiragana substitute (space saving).
 */
function halfKatakanaToHiragana(str) {
  const map = {
    'ｦ': 'を', 'ｧ': 'ぁ', 'ｨ': 'ぃ', 'ｩ': 'ぅ', 'ｪ': 'ぇ', 'ｫ': 'ぉ',
    'ｬ': 'ゃ', 'ｭ': 'ゅ', 'ｮ': 'ょ', 'ｯ': 'っ', 'ｰ': 'ー',
    'ｱ': 'あ', 'ｲ': 'い', 'ｳ': 'う', 'ｴ': 'え', 'ｵ': 'お',
    'ｶ': 'か', 'ｷ': 'き', 'ｸ': 'く', 'ｹ': 'け', 'ｺ': 'こ',
    'ｻ': 'さ', 'ｼ': 'し', 'ｽ': 'す', 'ｾ': 'せ', 'ｿ': 'そ',
    'ﾀ': 'た', 'ﾁ': 'ち', 'ﾂ': 'つ', 'ﾃ': 'て', 'ﾄ': 'と',
    'ﾅ': 'な', 'ﾆ': 'に', 'ﾇ': 'ぬ', 'ﾈ': 'ね', 'ﾉ': 'の',
    'ﾊ': 'は', 'ﾋ': 'ひ', 'ﾌ': 'ふ', 'ﾍ': 'へ', 'ﾎ': 'ほ',
    'ﾏ': 'ま', 'ﾐ': 'み', 'ﾑ': 'む', 'ﾒ': 'め', 'ﾓ': 'も',
    'ﾔ': 'や', 'ﾕ': 'ゆ', 'ﾖ': 'よ',
    'ﾗ': 'ら', 'ﾘ': 'り', 'ﾙ': 'る', 'ﾚ': 'れ', 'ﾛ': 'ろ',
    'ﾜ': 'わ', 'ﾝ': 'ん', 'ﾞ': '゛', 'ﾟ': '゜',
    '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・'
  };
  const dakuten = {
    'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
    'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど',
    'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    'う': 'ゔ'
  };
  const handakuten = {
    'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ'
  };

  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];
    if (map[ch]) {
      let fw = map[ch];
      if (next === 'ﾞ' && dakuten[fw]) { fw = dakuten[fw]; i++; }
      else if (next === 'ﾟ' && handakuten[fw]) { fw = handakuten[fw]; i++; }
      result += fw;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Clean source text for translation — remove game script control codes,
 * normalize half-width katakana to hiragana
 */
function cleanForTranslation(text) {
  let cleaned = text
    .replace(/#[A-Z][0-9A-Z]*/g, '')
    .replace(/![0-9A-Z@_#]/g, '')
    .replace(/_「/g, '「')
    .replace(/_([0-9])/g, ' ')
    .replace(/@/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\$./g, '')
    .replace(/%./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = halfKatakanaToHiragana(cleaned);
  return cleaned;
}

/**
 * Translate a batch of strings using Gemini in one request.
 * Returns an array of translated strings in the same order.
 */
async function translateBatch(model, items) {
  // Build numbered list for batch translation
  const numbered = items.map((text, i) => `[${i + 1}] ${text}`).join('\n');

  const prompt = `You are a professional Japanese-to-English translator specializing in 1990s Japanese RPG video games.

Translate each numbered line below from Japanese to English. This dialogue is from the 1991 PC-98 sci-fi RPG "Alshark" — a space opera with characters named Sion, Lucia, Joe, Shoko, Sullivan, etc.

Rules:
- Output ONLY the translations, one per line, keeping the [N] numbering
- Keep translations concise — they must fit in a small dialog box (~40 English characters wide)
- Preserve tone and personality (casual speech, formal speech, etc.)
- Keep proper nouns as-is (character names, place names)
- Do not add quotes, notes, or explanations

${numbered}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Parse numbered responses
  const translations = new Array(items.length).fill('');
  const lines = response.split('\n');

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.+)/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < items.length) {
        translations[idx] = match[2].trim();
      }
    }
  }

  return translations;
}

/**
 * Translate a single string (fallback for failed batch items)
 */
async function translateSingle(model, text) {
  const prompt = `Translate this Japanese RPG dialogue to concise English. Output ONLY the translation.
From the 1991 PC-98 RPG "Alshark" (sci-fi space opera).

Japanese: ${text}
English:`;

  const result = await model.generateContent(prompt);
  let translation = result.response.text().trim();
  // Clean up common LLM artifacts
  translation = translation
    .replace(/^English:\s*/i, '')
    .replace(/^["'](.*)["']$/s, '$1')
    .replace(/^Translation:\s*/i, '')
    .replace(/\s*\(Note:.*?\)\s*$/i, '')
    .replace(/^Here is the (?:English )?translation[:\s]*/i, '')
    .replace(/\n.*/s, '') // Take first line only
    .trim();
  return translation;
}

async function main() {
  console.log('=== ALSHARK Gemini Translator ===');
  console.log(`Model: ${MODEL_NAME} | Batch size: ${BATCH_SIZE}\n`);

  if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('ERROR: Set your Gemini API key!');
    console.error('  Option 1: set GEMINI_API_KEY=your_key_here');
    console.error('  Option 2: Edit API_KEY in this file');
    console.error('\nGet a free key at: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    }
  });

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load source data
  if (!fs.existsSync(INPUT)) {
    console.error('Input file not found:', INPUT);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const strings = data.strings;
  console.log('Total strings:', strings.length);

  // Load checkpoint if exists
  let results = [];
  let startIdx = 0;

  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      results = cp.translations || [];
      startIdx = cp.index || 0;
      console.log(`Resuming from string ${startIdx} (${results.length} already done)`);
    } catch (e) {
      console.log('Checkpoint invalid, starting fresh');
    }
  }

  // Quick connectivity test
  console.log('Testing Gemini API...');
  try {
    const test = await model.generateContent('Say "ready"');
    console.log('API connected:', test.response.text().trim().slice(0, 30));
  } catch (e) {
    console.error('Failed to connect to Gemini API:', e.message);
    if (e.message.includes('API_KEY')) {
      console.error('Check your API key at https://aistudio.google.com/apikey');
    }
    process.exit(1);
  }

  const startTime = Date.now();
  let errors = 0;

  // Process in batches
  for (let i = startIdx; i < strings.length; ) {
    // Build batch of cleaned strings
    const batchEnd = Math.min(i + BATCH_SIZE, strings.length);
    const batchStrings = [];
    const batchMeta = [];

    for (let j = i; j < batchEnd; j++) {
      const s = strings[j];
      const cleaned = cleanForTranslation(s.sourceText);
      batchStrings.push(cleaned);
      batchMeta.push(s);
    }

    // Check for empty/tiny strings that don't need translation
    const needsTranslation = batchStrings.map(s => s && s.length >= 2);
    const toTranslate = batchStrings.filter((_, idx) => needsTranslation[idx]);

    let translations = [];

    if (toTranslate.length > 0) {
      // Try batch translation
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          if (toTranslate.length === 1) {
            // Single string — use simpler prompt
            const t = await translateSingle(model, toTranslate[0]);
            translations = [t];
          } else {
            translations = await translateBatch(model, toTranslate);
          }
          break;
        } catch (err) {
          console.log(`\n  Batch [${i}-${batchEnd}] attempt ${attempt + 1} failed: ${err.message}`);

          if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RATE')) {
            console.log('  Rate limited — waiting 60s...');
            await sleep(60000);
          } else if (err.message.includes('API_KEY') || err.message.includes('permission')) {
            console.error('\n  FATAL: API key issue. Exiting.');
            process.exit(1);
          } else {
            await sleep(10000);
          }

          if (attempt === MAX_RETRIES - 1) {
            // Fall back to individual translation
            console.log('  Falling back to individual translation...');
            translations = [];
            for (const text of toTranslate) {
              try {
                const t = await translateSingle(model, text);
                translations.push(t);
                await sleep(DELAY_MS);
              } catch (e2) {
                translations.push('[ERROR]');
                errors++;
              }
            }
          }
        }
      }
    }

    // Map translations back to results
    let tIdx = 0;
    for (let j = 0; j < batchMeta.length; j++) {
      const s = batchMeta[j];
      let translation;

      if (!needsTranslation[j]) {
        translation = batchStrings[j] || ' ';
      } else {
        translation = (translations[tIdx] || '').trim();
        if (!translation || translation === '') {
          translation = '[EMPTY]';
          errors++;
        }
        tIdx++;
      }

      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: translation
      });
    }

    i = batchEnd;

    // Progress
    const done = results.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (done - startIdx) / elapsed;
    const remaining = strings.length - done;
    const eta = rate > 0 ? remaining / rate / 60 : 0;
    process.stdout.write(
      `\r[${done}/${strings.length}] ${rate.toFixed(2)}/s ETA: ${eta.toFixed(1)}m errs: ${errors}    `
    );

    // Checkpoint
    if (done % CHECKPOINT_EVERY === 0 || i >= strings.length) {
      fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i, translations: results }));
    }

    // Rate limit between batches
    if (i < strings.length) {
      await sleep(DELAY_MS);
    }
  }

  // Final save
  console.log('\n\nSaving results...');

  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: strings.length, translations: results }));

  fs.writeFileSync(OUTPUT, JSON.stringify({
    game: 'Alshark',
    platform: 'PC-98',
    model: `gemini-${MODEL_NAME}`,
    translated: new Date().toISOString(),
    count: results.length,
    errors: errors,
    translations: results
  }, null, 2));

  const totalTime = (Date.now() - startTime) / 1000 / 60;
  console.log(`\nComplete!`);
  console.log(`Translated: ${results.length} strings`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${totalTime.toFixed(1)} minutes`);
  console.log(`Output: ${OUTPUT}`);
}

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
