#!/usr/bin/env node
/**
 * OFFLINE TRANSLATION SYSTEM with Ollama
 * Free, unlimited, works completely offline after initial setup
 * Can be packaged with the application for distribution
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CONFIG = {
  ollamaUrl: 'http://localhost:11434',
  model: 'gemma2:9b', // Best balance of quality/size
  batchSize: 10, // Process in batches
  saveInterval: 100, // Save progress every N strings
};

class OfflineTranslator {
  constructor() {
    this.translationCache = new Map();
    this.stats = {
      total: 0,
      translated: 0,
      cached: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  async checkOllamaRunning() {
    try {
      const response = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Not running');
      const data = await response.json();
      
      const hasModel = data.models.some(m => m.name === CONFIG.model);
      if (!hasModel) {
        throw new Error(`Model ${CONFIG.model} not found. Run: ollama pull ${CONFIG.model}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Ollama not running! Please start Ollama and ensure ${CONFIG.model} is installed.`);
    }
  }

  async translateText(text, context = {}) {
    if (!text || text.length < 1) return '';
    if (text.startsWith('[漢:')) return '';
    
    // Check if already English (no Japanese characters)
    if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
      return '';
    }

    // Check cache
    if (this.translationCache.has(text)) {
      this.stats.cached++;
      return this.translationCache.get(text);
    }

    const prompt = `Translate this Japanese game text to English. Output ONLY the English translation, nothing else.

Japanese: ${text}
English:`;

    try {
      const response = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CONFIG.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 100,
            stop: ['\n\n', 'Japanese:', 'English:']
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      let translation = data.response.trim();
      
      // Clean up output
      translation = translation.replace(/^["']|["']$/g, '');
      translation = translation.split('\n')[0];
      
      // Cache it
      this.translationCache.set(text, translation);
      this.stats.translated++;
      
      return translation;
    } catch (error) {
      this.stats.errors++;
      console.error(`Translation error: ${error.message}`);
      return '';
    }
  }

  async translateFile(filePath, outputPath) {
    console.log(`\n📂 Processing: ${path.basename(filePath)}`);
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const strings = Array.isArray(data) ? data : [];
    
    if (strings.length === 0) {
      console.log('  ⚠️  No strings found');
      return null;
    }

    console.log(`  Found ${strings.length} strings`);
    
    const results = [];
    let processed = 0;
    const startTime = Date.now();

    for (const str of strings) {
      this.stats.total++;
      processed++;

      const translation = await this.translateText(str.text || str.original, {
        category: str.category,
        disk: str.diskName || str.disk
      });

      results.push({
        ...str,
        translation: translation || (str.text || str.original),
        translatedOffline: !!translation,
        model: CONFIG.model
      });

      // Progress update
      if (processed % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
        const eta = ((strings.length - processed) / rate / 60).toFixed(0);
        
        process.stdout.write(
          `  Progress: ${processed}/${strings.length} (${((processed/strings.length)*100).toFixed(1)}%) | ` +
          `${rate}/s | ETA: ${eta}min\r`
        );
      }

      // Save checkpoint
      if (processed % CONFIG.saveInterval === 0) {
        fs.writeFileSync(
          outputPath + '.checkpoint',
          JSON.stringify(results, null, 2)
        );
      }
    }

    console.log(`\n  ✅ Complete: ${this.stats.translated} translated, ${this.stats.cached} cached`);
    
    return {
      disk: path.basename(filePath),
      exportDate: new Date().toISOString(),
      model: CONFIG.model,
      backend: 'Ollama (Offline)',
      strings: results,
      stats: {
        total: processed,
        translated: this.stats.translated,
        cached: this.stats.cached
      }
    };
  }

  getStats() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    return {
      ...this.stats,
      elapsedMinutes: elapsed.toFixed(1),
      rate: (this.stats.total / elapsed).toFixed(1) + ' strings/min'
    };
  }
}

async function main() {
  console.log('🎮 OFFLINE TRANSLATION SYSTEM (Ollama)');
  console.log('=====================================');
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Backend: Free, Offline, Unlimited\n`);

  const translator = new OfflineTranslator();

  // Check Ollama
  try {
    await translator.checkOllamaRunning();
    console.log('✅ Ollama is running and ready\n');
  } catch (error) {
    console.error(`❌ ${error.message}\n`);
    console.log('🔧 Setup instructions:');
    console.log('1. Download: https://ollama.ai/download');
    console.log('2. Install and start Ollama');
    console.log(`3. Run: ollama pull ${CONFIG.model}`);
    console.log('4. Try again!\n');
    process.exit(1);
  }

  // Setup directories
  const EXTRACTION_DIR = path.join(__dirname, 'alshark-extraction-test');
  const OUTPUT_DIR = path.join(__dirname, 'OUT-OFFLINE');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Find files
  const extractionFiles = fs.readdirSync(EXTRACTION_DIR)
    .filter(f => f.endsWith('.extraction.json'))
    .map(f => path.join(EXTRACTION_DIR, f));

  console.log(`📚 Found ${extractionFiles.length} disk files to translate\n`);

  const allResults = [];

  for (const file of extractionFiles) {
    const outputPath = path.join(OUTPUT_DIR, `${path.basename(file)}.translated.json`);
    
    const result = await translator.translateFile(file, outputPath);
    
    if (result) {
      allResults.push(result);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`  💾 Saved: ${path.basename(outputPath)}\n`);
    }
  }

  // Master file
  const masterOutput = {
    exportDate: new Date().toISOString(),
    model: CONFIG.model,
    backend: 'Ollama (Offline)',
    offline: true,
    canPackage: true,
    disks: allResults
  };

  const masterPath = path.join(OUTPUT_DIR, 'alshark-master-offline.json');
  fs.writeFileSync(masterPath, JSON.stringify(masterOutput, null, 2));

  // Final stats
  const stats = translator.getStats();
  const summary = `
🎊 OFFLINE TRANSLATION COMPLETE!
================================

Model: ${CONFIG.model}
Backend: Ollama (Offline)
Total Time: ${stats.elapsedMinutes} minutes
Average Rate: ${stats.rate}

📊 Statistics:
- Total processed: ${stats.total}
- Translated: ${stats.translated}
- From cache: ${stats.cached}
- Errors: ${stats.errors}
- Success rate: ${((stats.translated/(stats.translated+stats.errors))*100).toFixed(1)}%

💰 Cost: $0.00 (Free & Offline!)

📁 Output Files:
${allResults.map(r => `- ${r.disk}.translated.json`).join('\n')}
- alshark-master-offline.json (master file)

✨ Benefits:
✅ 100% Free - no API costs ever
✅ Completely Offline - works without internet
✅ Unlimited - translate as much as you want
✅ Private - all data stays local
✅ Packageable - can bundle with your app

🚀 Next Steps:
1. Review translations in OUT-OFFLINE/
2. Test patched games: node src/disk-reinsertion.js
3. Package Ollama with your app (see PACKAGING-GUIDE.md)
`;

  console.log(summary);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'TRANSLATION-SUMMARY.txt'), summary);
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Translation interrupted. Progress saved in checkpoint files.');
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
