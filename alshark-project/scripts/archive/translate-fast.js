/**
 * ALSHARK Fast Translator - Uses gemma2:2b with robust error handling
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

function translate(text, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const clean = text.replace(/#[A-Z][0-9]*/g, '').replace(/![A-Z@_#]/g, '').replace(/@/g, ' ').slice(0, 120).trim();
    
    let names = [];
    for (const [jp, en] of Object.entries(GLOSSARY)) {
      if (text.includes(jp)) names.push(`${jp}=${en}`);
    }
    
    // Simple, direct prompt
    const prompt = `[Game Translation] Japanese to English:
${names.length ? names.join(', ') + '\n' : ''}${clean}
=`;

    const body = JSON.stringify({
      model: 'gemma2:2b',
      prompt: prompt,
      stream: false,
      options: { num_predict: 80, temperature: 0.2 }
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let result = (json.response || '').split('\n')[0].replace(/^[=\s]+/, '').trim();
          // Clean up common issues
          result = result.replace(/^\[.*?\]\s*/, '').replace(/^(Translation|English):\s*/i, '');
          resolve(result || '[NO OUTPUT]');
        } catch (e) {
          reject(new Error('parse: ' + e.message));
        }
      });
    });

    req.on('error', e => reject(new Error('net: ' + e.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== ALSHARK Fast Translation ===');
  console.log('Model: gemma2:2b');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  
  const data = JSON.parse(fs.readFileSync(INPUT));
  console.log(`Total: ${data.strings.length} strings`);
  
  let results = [];
  let startIdx = 0;
  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT));
      results = cp.translations || [];
      startIdx = cp.index || 0;
    } catch(e) {
      console.log('Checkpoint corrupt, starting fresh');
    }
  }
  console.log(`Start: ${startIdx}`);
  
  const start = Date.now();
  let errors = 0;
  
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
      
      // Progress
      const done = results.length;
      if (done % 10 === 0 || i === data.strings.length - 1) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done > startIdx ? (done - startIdx) / elapsed : 0;
        const eta = rate > 0 ? (data.strings.length - done) / rate / 60 : 0;
        process.stdout.write(`\r[${done}/${data.strings.length}] ${rate.toFixed(1)}/s ETA:${eta.toFixed(0)}m err:${errors}  `);
      }
      
      // Checkpoint
      if (done % 25 === 0) {
        fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: i + 1, translations: results }));
      }
      
    } catch (err) {
      errors++;
      // On error, save a placeholder and continue
      results.push({
        id: s.id, disk: s.disk, offset: s.offset, maxBytes: s.maxBytes,
        source: s.sourceText, translation: '[ERROR]', error: err.message
      });
      
      if (errors > 20) {
        console.log('\nToo many errors, saving and stopping');
        break;
      }
    }
  }
  
  // Final save
  console.log('\nSaving...');
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index: data.strings.length, translations: results }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'translations.json'), JSON.stringify({
    game: 'Alshark',
    count: results.length,
    errors: errors,
    translations: results
  }, null, 2));
  
  console.log(`Done! ${results.length} translations (${errors} errors)`);
}

main().catch(e => console.error('Fatal:', e.message));
