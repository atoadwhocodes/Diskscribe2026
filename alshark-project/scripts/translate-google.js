/**
 * ALSHARK Translator - Google Translate Version
 * Uses free Google Translate API for high-quality Japanese→English
 * With checkpointing and rate limiting
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const INPUT = path.join(PROJECT_ROOT, 'data', 'ALSHARK-EXTRACTED-REV', 'alshark-translation-ready.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV');
const CHECKPOINT = path.join(OUTPUT_DIR, 'google-checkpoint.json');
const OUTPUT = path.join(OUTPUT_DIR, 'translations.json');

// Delay between requests to avoid rate limiting (ms)
const DELAY_MS = 350;
// Batch size for checkpointing
const CHECKPOINT_EVERY = 20;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert half-width katakana (U+FF61-FF9F) to HIRAGANA equivalents.
 * PC-98 games use half-width katakana as a hiragana substitute (space saving).
 * Full-width katakana (シオン, マーズ etc) are actual katakana for names/loanwords
 * and should be left alone.
 */
function halfKatakanaToHiragana(str) {
  // Half-width katakana → hiragana mapping
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
 * Clean source text for translation - remove game script control codes,
 * normalize half-width katakana to hiragana, preserve actual Japanese dialog text
 */
function cleanForTranslation(text) {
  let cleaned = text
    // Remove control codes: #S, #C0, #B2, etc.
    .replace(/#[A-Z][0-9A-Z]*/g, '')
    // Remove single-char controls: !0, !@, !_, !#
    .replace(/![0-9A-Z@_#]/g, '')
    // Block separators _「 → just keep 「
    .replace(/_「/g, '「')
    .replace(/_([0-9])/g, ' ')
    // @ is line break in the script engine
    .replace(/@/g, ' ')
    // Backslash
    .replace(/\\/g, ' ')
    // Remove $ control bytes
    .replace(/\$./g, '')
    // Remove % control bytes
    .replace(/%./g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Normalize half-width katakana to hiragana for better translation
  cleaned = halfKatakanaToHiragana(cleaned);
  
  return cleaned;
}

async function main() {
  // Dynamic import for ESM package
  const { default: translate } = await import('google-translate-api-x');
  
  console.log('=== ALSHARK Google Translate ===\n');

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
      console.log('Resuming from string', startIdx, `(${results.length} already done)`);
    } catch (e) {
      console.log('Checkpoint invalid, starting fresh');
    }
  }

  const startTime = Date.now();
  let errors = 0;
  let consecutiveErrors = 0;

  for (let i = startIdx; i < strings.length; i++) {
    const s = strings[i];
    const cleaned = cleanForTranslation(s.sourceText);

    if (!cleaned || cleaned.length < 2) {
      // Skip empty/tiny strings
      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: cleaned || ' '
      });
      continue;
    }

    try {
      const res = await translate(cleaned, { from: 'ja', to: 'en' });
      let translation = res.text || '';
      
      // Clean up
      translation = translation.replace(/\n/g, ' ').trim();
      if (!translation) translation = '[EMPTY]';

      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: translation
      });

      consecutiveErrors = 0;

      // Progress
      const done = results.length;
      if (done % 5 === 0 || i === strings.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (done - startIdx) / elapsed;
        const remaining = strings.length - done;
        const eta = rate > 0 ? remaining / rate / 60 : 0;
        process.stdout.write(
          `\r[${done}/${strings.length}] ${rate.toFixed(2)}/s ETA: ${eta.toFixed(1)}m errors: ${errors}    `
        );
      }

      // Checkpoint
      if (done % CHECKPOINT_EVERY === 0) {
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i + 1, translations: results }));
      }

      // Rate limit
      await sleep(DELAY_MS);

    } catch (err) {
      errors++;
      consecutiveErrors++;
      console.log(`\n[${i}] Error: ${err.message}`);

      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: '[ERROR]', error: err.message
      });

      if (consecutiveErrors >= 10) {
        console.log('\n\nToo many consecutive errors. Saving and stopping.');
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i + 1, translations: results }));
        break;
      }

      // Back off on error - wait longer
      if (err.message.includes('429') || err.message.includes('Too Many')) {
        console.log('Rate limited, waiting 30s...');
        await sleep(30000);
      } else {
        await sleep(2000);
      }
    }
  }

  // Final save
  console.log('\n\nSaving results...');

  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: strings.length, translations: results }));

  fs.writeFileSync(OUTPUT, JSON.stringify({
    game: 'Alshark',
    platform: 'PC-98',
    model: 'google-translate',
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
