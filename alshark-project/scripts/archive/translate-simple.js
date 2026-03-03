/**
 * Simple ALSHARK Translator - Direct approach
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const iconv = require('iconv-lite');

const INPUT = 'ALSHARK-EXTRACTED-REV/alshark-translation-ready.json';
const OUTPUT_DIR = 'ALSHARK-TRANSLATED-REV';
const CHECKPOINT = 'ALSHARK-TRANSLATED-REV/checkpoint.json';

const GLOSSARY = {
  'ジョー': 'Joe', 'シオン': 'Shion', 'ルシア': 'Lucia',
  'マモン': 'Mammon', 'ショーコ': 'Shoko', 'アルシャーク': 'Alshark',
  'カーマ': 'Karma', 'ジャグマ': 'Jagma', 'ゼフィア': 'Zephia'
};

function translate(text) {
  return new Promise((resolve, reject) => {
    const clean = text.replace(/#[A-Z][0-9]*/g, '').replace(/![A-Z@_#]/g, '').replace(/@/g, ' ').trim();
    
    let names = [];
    for (const [jp, en] of Object.entries(GLOSSARY)) {
      if (text.includes(jp)) names.push(`${jp}=${en}`);
    }
    
    const prompt = `Translate this Japanese game text to English. Output only the translation.
${names.length ? 'Names: ' + names.join(', ') + '\n' : ''}Japanese: ${clean.slice(0, 150)}
English:`;

    const body = JSON.stringify({
      model: 'gemma2:9b',
      prompt: prompt,
      stream: false,
      options: { num_predict: 120, temperature: 0.1 }
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = (json.response || '').split('\n')[0].trim();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== ALSHARK Translation ===\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  
  const data = JSON.parse(fs.readFileSync(INPUT));
  console.log(`Strings: ${data.strings.length}`);
  
  // Load checkpoint
  let results = [];
  let startIdx = 0;
  if (fs.existsSync(CHECKPOINT)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT));
    results = cp.translations || [];
    startIdx = cp.index || 0;
    console.log(`Resuming from ${startIdx}`);
  }
  
  const start = Date.now();
  
  for (let i = startIdx; i < data.strings.length; i++) {
    const s = data.strings[i];
    
    try {
      const translation = await translate(s.sourceText);
      
      results.push({
        id: s.id,
        disk: s.disk,
        offset: s.offset,
        maxBytes: s.maxBytes,
        source: s.sourceText,
        translation: translation
      });
      
      // Progress every 10
      if ((results.length) % 10 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = (results.length - startIdx) / elapsed;
        const eta = (data.strings.length - results.length) / rate / 60;
        console.log(`[${results.length}/${data.strings.length}] ${rate.toFixed(2)}/s ETA: ${eta.toFixed(0)}min`);
      }
      
      // Save checkpoint every 25
      if (results.length % 25 === 0) {
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i + 1, translations: results }));
      }
      
    } catch (err) {
      console.error(`[${i}] Error: ${err.message}`);
      // Skip problematic strings after 2 retries
      if (!s.retries) s.retries = 0;
      s.retries++;
      if (s.retries >= 2) {
        console.log(`[${i}] Skipping after 2 retries`);
        results.push({
          id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
          source: s.sourceText, translation: '[SKIP]', error: err.message
        });
      } else {
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i, translations: results }));
        await new Promise(r => setTimeout(r, 3000));
        i--; // retry
      }
    }
  }
  
  // Final save
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: data.strings.length, translations: results }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'translations.json'), JSON.stringify({
    game: 'Alshark',
    count: results.length,
    translations: results
  }, null, 2));
  
  console.log(`\nDone! ${results.length} translations saved.`);
}

main().catch(e => console.error('Fatal:', e));
