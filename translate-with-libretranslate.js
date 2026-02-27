#!/usr/bin/env node
/**
 * FREE TRANSLATION using LibreTranslate Public API
 * No setup required - uses public instance at libretranslate.com
 * Rate limited but completely free
 */

const fs = require('fs');
const path = require('path');

// Use public LibreTranslate instance
const API_URL = 'https://libretranslate.com/translate';

let requestCount = 0;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function translateText(text) {
  if (!text || text.length < 1) return '';
  if (text.startsWith('[漢:')) return '';
  
  // Check if already English
  if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return '';
  }
  
  try {
    requestCount++;
    
    // Rate limiting - be nice to public API
    if (requestCount % 10 === 0) {
      console.log(`    [Translated ${requestCount} strings, pausing...]`);
      await delay(2000); // 2 second pause every 10 requests
    }
    
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        source: 'ja',
        target: 'en',
        format: 'text'
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('    ⏰ Rate limited, waiting 10 seconds...');
        await delay(10000);
        return await translateText(text); // Retry
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.translatedText || text;
  } catch (error) {
    console.error(`    ❌ Translation error: ${error.message}`);
    return text;
  }
}

async function translateSampleFile() {
  const samplePath = path.join(__dirname, 'alshark-system-extraction', 'alshark-translations-sample.json');
  
  if (!fs.existsSync(samplePath)) {
    console.error('❌ Sample file not found!');
    process.exit(1);
  }
  
  console.log('📂 Loading sample file...');
  const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  
  const OUTPUT_DIR = path.join(__dirname, 'OUT-LIBRETRANSLATE');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  console.log(`\n🌐 Using LibreTranslate Public API (Free)`);
  console.log('⚠️  Rate limited - this will take a while...\n');
  
  const results = {};
  let totalProcessed = 0;
  let totalTranslated = 0;
  
  for (const [category, strings] of Object.entries(data.byCategory)) {
    console.log(`📂 Processing category: ${category} (${strings.length} strings)`);
    results[category] = [];
    
    let categoryTranslated = 0;
    
    // Limit to first 100 per category for demo (or public API will rate limit hard)
    const limit = Math.min(strings.length, 100);
    
    for (let i = 0; i < limit; i++) {
      const str = strings[i];
      totalProcessed++;
      
      const translation = await translateText(str.original);
      
      if (translation && translation !== str.original) {
        categoryTranslated++;
        totalTranslated++;
      }
      
      results[category].push({
        ...str,
        translation: translation || str.original,
        translatedWith: 'LibreTranslate Free',
        verified: false
      });
      
      if ((i + 1) % 20 === 0) {
        console.log(`  Progress: ${i + 1}/${limit} (${categoryTranslated} translated)`);
      }
    }
    
    console.log(`  ✅ ${categoryTranslated}/${limit} translated\n`);
  }
  
  const output = {
    exportDate: new Date().toISOString(),
    backend: 'LibreTranslate (Free Public API)',
    totalProcessed,
    totalTranslated,
    note: 'Limited to 100 strings per category due to public API rate limits',
    byCategory: results
  };
  
  const outputPath = path.join(OUTPUT_DIR, 'alshark-partial-translation.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  const summary = `
🎊 PARTIAL TRANSLATION COMPLETE
================================

Backend: LibreTranslate Public API (Free)
Processed: ${totalProcessed} strings
Translated: ${totalTranslated} strings
Coverage: ${((totalTranslated/totalProcessed)*100).toFixed(1)}%
Cost: $0.00

📁 Output: ${outputPath}

⚠️  Note: Public API is rate-limited to prevent abuse.
For unlimited free translation, install Ollama:

1. Download: https://ollama.ai/download
2. Install: gemma2:9b model
3. Run: node translate-free-ollama.js

This will translate ALL ${data.totalStrings} strings for free!
`;
  
  console.log(summary);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'README.txt'), summary);
  
  console.log(`\n💡 Next steps:`);
  console.log(`1. Install Ollama for full translation (takes 10 min)`);
  console.log(`2. Or use Google/DeepL free tier (requires API key)`);
  console.log(`3. Check FREE-TRANSLATION-OPTIONS.md for details`);
}

console.log('🎮 FREE TRANSLATION - LibreTranslate');
console.log('====================================\n');

translateSampleFile().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
