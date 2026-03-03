/**
 * ALSHARK Reverse-Engineered Translation Script
 * Translates the 982 clean strings using Ollama
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const iconv = require('iconv-lite');

const INPUT_FILE = 'ALSHARK-EXTRACTED-REV/alshark-translation-ready.json';
const OUTPUT_DIR = 'ALSHARK-TRANSLATED-REV';
const CHECKPOINT_FILE = 'ALSHARK-TRANSLATED-REV/checkpoint.json';

const MODEL = 'gemma2:9b';  // Better accuracy
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;

// Character name glossary
const GLOSSARY = {
  'ジョー': 'Joe',
  'シオン': 'Shion',
  'レディア': 'Radia',
  'アーファ': 'Arfa',
  'ラン': 'Ran',
  'カサ': 'Kasa',
  'ジャグマ': 'Jagma',
  'ハドソン': 'Hudson',
  'エルザ': 'Elsa',
  'ペック': 'Peck',
  'ルシア': 'Lucia',
  'マモン': 'Mammon',
  'ショーコ': 'Shoko',
  'ウェルダ': 'Welda',
  'カル': 'Cal',
  'アルシャーク': 'Alshark',
  'カーマ': 'Karma',
  'ラルア': 'Lalua',
  'ゼフィア': 'Zephia',
  'マーズ': 'Mars',
  'クレジット': 'credits',
};

/**
 * Call Ollama API
 */
function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 300,
      }
    });

    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.response || '');
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Clean source text for translation
 */
function cleanSourceText(text) {
  return text
    .replace(/#[A-Z][0-9A-Z]*/g, '')  // Remove #O, #X2, #L, etc.
    .replace(/![A-Z@_#]/g, '')         // Remove !@, !_, !#
    .replace(/@/g, '\n')               // @ is line break
    .replace(/\\/g, '\n')              // \ is line break
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build translation prompt
 */
function buildPrompt(sourceText, context) {
  const cleaned = cleanSourceText(sourceText);
  
  // Apply glossary hints
  let glossaryHints = '';
  for (const [jp, en] of Object.entries(GLOSSARY)) {
    if (sourceText.includes(jp)) {
      glossaryHints += `${jp} = ${en}\n`;
    }
  }

  return `Translate this 1991 PC-98 RPG game text. Output ONLY the English translation, nothing else.
${glossaryHints ? 'Names: ' + glossaryHints.replace(/\n/g, ', ').slice(0,-2) + '\n' : ''}
Japanese: ${cleaned}
English:`;
}

/**
 * Validate translation fits in byte limit
 */
function validateTranslation(translation, maxBytes) {
  // Strip any prompt leakage and commentary
  let clean = translation
    .split('\n')[0]  // Take first line only
    .replace(/^(English|Translation|Output):\s*/i, '')
    .replace(/\*\*.*?\*\*/g, '')
    .replace(/Let me know.*$/i, '')
    .replace(/\s+$/, '')
    .trim();
  
  // Check byte size
  const encoded = iconv.encode(clean, 'shiftjis');
  if (encoded.length > maxBytes) {
    // Truncate to fit
    while (encoded.length > maxBytes - 1 && clean.length > 10) {
      clean = clean.slice(0, -5) + '...';
    }
  }
  
  return clean;
}

/**
 * Load checkpoint
 */
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE));
  }
  return { index: 0, translations: [] };
}

/**
 * Save checkpoint
 */
function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

/**
 * Main translation loop
 */
async function main() {
  console.log('=== ALSHARK Reverse-Engineered Translation ===\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load source strings
  const data = JSON.parse(fs.readFileSync(INPUT_FILE));
  const strings = data.strings;
  console.log(`Loaded ${strings.length} strings to translate`);

  // Load checkpoint
  let checkpoint = loadCheckpoint();
  console.log(`Resuming from index ${checkpoint.index}`);

  const startTime = Date.now();
  let translated = checkpoint.translations.length;

  for (let i = checkpoint.index; i < strings.length; i++) {
    const s = strings[i];
    const prompt = buildPrompt(s.sourceText, s);

    try {
      const response = await callOllama(prompt);
      const translation = validateTranslation(response, s.maxBytes);

      checkpoint.translations.push({
        id: s.id,
        disk: s.disk,
        offset: s.offset,
        maxBytes: s.maxBytes,
        sourceText: s.sourceText,
        translation: translation
      });

      translated++;

      // Progress
      if (translated % 10 === 0 || translated === strings.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = translated / elapsed;
        const eta = (strings.length - translated) / rate;
        console.log(`[${translated}/${strings.length}] ${(translated/strings.length*100).toFixed(1)}% - ${rate.toFixed(2)} str/s - ETA: ${Math.ceil(eta/60)} min`);
      }

      // Checkpoint every 50
      if (translated % 50 === 0) {
        checkpoint.index = i + 1;
        saveCheckpoint(checkpoint);
      }

    } catch (err) {
      console.error(`[${i}] Error: ${err.message}`);
      console.error(`[${i}] Stack: ${err.stack}`);
      // Save and retry later
      checkpoint.index = i;
      saveCheckpoint(checkpoint);
      await new Promise(r => setTimeout(r, 5000));
      i--; // Retry this string
    }
  }

  // Final save
  checkpoint.index = strings.length;
  saveCheckpoint(checkpoint);

  // Write output file
  const output = {
    game: 'Alshark',
    platform: 'PC-98',
    translated: new Date().toISOString(),
    model: MODEL,
    stringCount: checkpoint.translations.length,
    translations: checkpoint.translations
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'alshark-translations.json'),
    JSON.stringify(output, null, 2)
  );

  const totalTime = (Date.now() - startTime) / 1000 / 60;
  console.log(`\n=== Complete ===`);
  console.log(`Translated: ${checkpoint.translations.length} strings`);
  console.log(`Time: ${totalTime.toFixed(1)} minutes`);
  console.log(`Output: ${OUTPUT_DIR}/alshark-translations.json`);
}

main().catch(console.error);
