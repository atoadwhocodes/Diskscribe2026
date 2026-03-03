/**
 * ALSHARK Translator - Fixed Version
 * Uses synchronous-style async/await with proper error handling
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const iconv = require('iconv-lite');

const INPUT = 'ALSHARK-EXTRACTED-REV/alshark-translation-ready.json';
const OUTPUT_DIR = 'ALSHARK-TRANSLATED-REV';
const CHECKPOINT = path.join(OUTPUT_DIR, 'checkpoint.json');
const OUTPUT = path.join(OUTPUT_DIR, 'translations.json');

const GLOSSARY = {
  'ジョー': 'Joe', 'シオン': 'Shion', 'ルシア': 'Lucia',
  'マモン': 'Mammon', 'ショーコ': 'Shoko', 'アルシャーク': 'Alshark',
  'カーマ': 'Karma', 'ジャグマ': 'Jagma', 'ゼフィア': 'Zephia',
  'ウェルダ': 'Welda', 'カル': 'Cal', 'ラルア': 'Lalua'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function translateOne(text) {
  return new Promise((resolve, reject) => {
    // Clean the text
    const clean = text
      .replace(/#[A-Z][0-9]*/g, '')
      .replace(/![A-Z@_#]/g, '')
      .replace(/@/g, ' ')
      .replace(/\\/g, ' ')
      .slice(0, 120)
      .trim();
    
    // Get glossary names
    const names = Object.entries(GLOSSARY)
      .filter(([jp]) => text.includes(jp))
      .map(([jp, en]) => `${jp}=${en}`)
      .join(', ');
    
    const prompt = `Translate this Japanese game dialog to English. Output ONLY the translation.
${names ? 'Names: ' + names + '\n' : ''}Text: ${clean}
English:`;

    const postData = JSON.stringify({
      model: 'gemma2:2b',
      prompt: prompt,
      stream: false,
      options: { num_predict: 100, temperature: 0.2 }
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          let result = (json.response || '').split('\n')[0].trim();
          // Clean common issues
          result = result.replace(/^(English|Translation):\s*/i, '');
          resolve(result || '[EMPTY]');
        } catch (e) {
          reject(new Error('JSON parse error'));
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('=== ALSHARK Translation ===\n');
  
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
      console.log('Resuming from:', startIdx);
    } catch (e) {
      console.log('Checkpoint invalid, starting fresh');
    }
  }
  
  const startTime = Date.now();
  let errors = 0;
  let consecutive_errors = 0;
  
  // Process strings one by one
  for (let i = startIdx; i < strings.length; i++) {
    const s = strings[i];
    
    try {
      const translation = await translateOne(s.sourceText);
      
      results.push({
        id: s.id,
        disk: s.disk,
        offset: s.offset,
        maxBytes: s.maxBytes,
        source: s.sourceText,
        translation: translation
      });
      
      consecutive_errors = 0;  // Reset on success
      
      // Progress display
      const done = results.length;
      if (done % 5 === 0 || i === strings.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (done - startIdx) / elapsed;
        const remaining = strings.length - done;
        const eta = rate > 0 ? remaining / rate / 60 : 0;
        
        process.stdout.write(`\r[${done}/${strings.length}] ${rate.toFixed(2)}/s ETA: ${eta.toFixed(1)}m errors: ${errors}    `);
      }
      
      // Checkpoint every 25 strings
      if (done % 25 === 0) {
        fs.writeFileSync(CHECKPOINT, JSON.stringify({
          index: i + 1,
          translations: results
        }));
      }
      
    } catch (err) {
      errors++;
      consecutive_errors++;
      
      console.log(`\n[${i}] Error: ${err.message}`);
      
      // Save placeholder on error
      results.push({
        id: s.id,
        disk: s.disk,
        offset: s.offset,
        maxBytes: s.maxBytes,
        source: s.sourceText,
        translation: '[ERROR]',
        error: err.message
      });
      
      // If too many consecutive errors, something is wrong
      if (consecutive_errors >= 5) {
        console.log('\n\nToo many consecutive errors. Stopping.');
        fs.writeFileSync(CHECKPOINT, JSON.stringify({
          index: i + 1,
          translations: results
        }));
        break;
      }
      
      // Wait before retrying
      await sleep(2000);
    }
  }
  
  // Final save
  console.log('\n\nSaving results...');
  
  fs.writeFileSync(CHECKPOINT, JSON.stringify({
    index: strings.length,
    translations: results
  }));
  
  fs.writeFileSync(OUTPUT, JSON.stringify({
    game: 'Alshark',
    platform: 'PC-98',
    model: 'gemma2:2b',
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

// Run with unhandled rejection handler
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
