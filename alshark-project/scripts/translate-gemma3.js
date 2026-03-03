/**
 * ALSHARK Translator - Gemma 3 12B (Ollama, CPU)
 * High-quality Japanese→English translation using gemma3:12b running locally.
 * With checkpointing, half-width katakana normalization, and retry logic.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const INPUT = 'ALSHARK-EXTRACTED-REV/alshark-translation-ready.json';
const OUTPUT_DIR = 'ALSHARK-TRANSLATED-REV';
const CHECKPOINT = path.join(OUTPUT_DIR, 'gemma3-checkpoint.json');
const OUTPUT = path.join(OUTPUT_DIR, 'translations.json');

const MODEL = 'gemma3:12b';
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;

// Ollama generation options — use all 12 threads on the 6-core CPU
const GEN_OPTIONS = {
  temperature: 0.1,   // Low temp for deterministic translations
  num_predict: 120,    // Max tokens to generate
  top_p: 0.9,
  repeat_penalty: 1.1,
  num_thread: 12       // Use all 12 hardware threads (6 cores × 2)
};

// Checkpoint every N strings
const CHECKPOINT_EVERY = 10;
// Max retries per string
const MAX_RETRIES = 3;
// Timeout per request (ms) — CPU inference is slow, be generous
// First request loads the 8.3GB model into RAM which can take 5-10 min
const REQUEST_TIMEOUT = 600000; // 10 minutes

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert half-width katakana (U+FF61-FF9F) to HIRAGANA equivalents.
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
 * Send a single translation request to Ollama and return the response text.
 */
function ollamaGenerate(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: GEN_OPTIONS
    });

    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: REQUEST_TIMEOUT
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error));
          } else {
            resolve({
              text: (json.response || '').trim(),
              totalDuration: json.total_duration || 0,
              evalCount: json.eval_count || 0
            });
          }
        } catch (e) {
          reject(new Error('JSON parse error: ' + e.message + ' raw: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

    req.write(body);
    req.end();
  });
}

/**
 * Build a translation prompt for Gemma 3.
 */
function buildPrompt(japaneseText) {
  return `You are a professional Japanese to English translator specializing in 1990s Japanese RPG video games.

Translate the following Japanese game dialogue into natural, fluent English. This is from the 1991 PC-98 RPG "Alshark", a sci-fi space opera.

Rules:
- Output ONLY the English translation, nothing else
- Keep it concise — this text must fit in a small dialog box
- Preserve the tone and personality of the speaker
- Keep proper nouns in their original form (e.g. character names)
- Do not add quotes, explanations, or notes

Japanese: ${japaneseText}
English:`;
}

/**
 * Clean up LLM output — strip quotes, explanations, prefixes
 */
function cleanTranslation(text) {
  let t = text;
  // Remove "English:" prefix if echoed
  t = t.replace(/^English:\s*/i, '');
  // Remove surrounding quotes
  t = t.replace(/^["'](.*)["']$/s, '$1');
  // Remove "Translation:" prefix
  t = t.replace(/^Translation:\s*/i, '');
  // Remove "(Note:...)" at end
  t = t.replace(/\s*\(Note:.*?\)\s*$/i, '');
  // Remove "Here is..." prefix
  t = t.replace(/^Here is the (?:English )?translation[:\s]*/i, '');
  // Take only first paragraph if multiple
  const lines = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  t = lines[0] || t;
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

async function main() {
  console.log('=== ALSHARK Gemma 3 12B Translator ===');
  console.log(`Model: ${MODEL} (CPU inference)\n`);

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

  // Warm up — first request loads the model
  if (startIdx === 0) {
    console.log('Warming up model (first load takes ~30-60s)...');
    try {
      const warmup = await ollamaGenerate('Say "ready" in one word.');
      console.log('Model ready:', warmup.text.slice(0, 30));
    } catch (e) {
      console.error('Failed to reach Ollama:', e.message);
      console.error('Make sure Ollama is running: ollama serve');
      process.exit(1);
    }
  }

  const startTime = Date.now();
  let errors = 0;
  let totalTokens = 0;
  let totalInference = 0; // nanoseconds

  for (let i = startIdx; i < strings.length; i++) {
    const s = strings[i];
    const cleaned = cleanForTranslation(s.sourceText);

    if (!cleaned || cleaned.length < 2) {
      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: cleaned || ' '
      });
      continue;
    }

    let translation = null;
    let lastErr = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const prompt = buildPrompt(cleaned);
        const result = await ollamaGenerate(prompt);
        translation = cleanTranslation(result.text);
        totalTokens += result.evalCount;
        totalInference += result.totalDuration;

        if (!translation || translation.length < 1) {
          throw new Error('Empty response');
        }
        break;

      } catch (err) {
        lastErr = err;
        console.log(`\n  [${i}] Attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleep(5000);
        }
      }
    }

    if (translation) {
      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: translation
      });
    } else {
      errors++;
      console.log(`\n  [${i}] FAILED after ${MAX_RETRIES} retries: ${lastErr?.message}`);
      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: '[ERROR]', error: lastErr?.message
      });
    }

    // Progress
    const done = results.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (done - startIdx) / elapsed;
    const remaining = strings.length - done;
    const eta = rate > 0 ? remaining / rate / 60 : 0;
    const avgSec = elapsed / (done - startIdx || 1);
    process.stdout.write(
      `\r[${done}/${strings.length}] ${avgSec.toFixed(1)}s/str ETA: ${eta.toFixed(1)}m errs: ${errors}    `
    );

    // Checkpoint
    if (done % CHECKPOINT_EVERY === 0) {
      fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i + 1, translations: results }));
    }
  }

  // Final save
  console.log('\n\nSaving results...');

  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: strings.length, translations: results }));

  fs.writeFileSync(OUTPUT, JSON.stringify({
    game: 'Alshark',
    platform: 'PC-98',
    model: MODEL,
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
  console.log(`Avg: ${(totalTime * 60 / results.length).toFixed(1)}s per string`);
  console.log(`Output: ${OUTPUT}`);
}

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
