#!/usr/bin/env node
/**
 * FREE TRANSLATION USING OLLAMA
 * Translate Alshark disk images using local LLMs - 100% FREE, NO API COSTS
 * 
 * SETUP INSTRUCTIONS:
 * 1. Install Ollama from https://ollama.ai/download
 * 2. Pull a model: ollama pull gemma2:9b
 * 3. Verify running: ollama list
 * 4. Run this script: node translate-free-ollama.js
 * 
 * RECOMMENDED MODELS:
 * - gemma2:9b (best balance - 9GB) - RECOMMENDED
 * - mistral:7b (faster - 7GB)
 * - llama3.1:8b (highest quality - 8GB)
 * - qwen2.5:7b (good for Japanese - 7GB)
 */

const fs = require('fs');
const path = require('path');
const { TranslationManager } = require('./src/translation-service.js');
const { OllamaTranslationBackend } = require('./src/translation-backends-free.js');

// Configuration
const EXTRACTION_DIR = path.join(__dirname, 'alshark-extraction-test');
const OUTPUT_DIR = path.join(__dirname, 'OUT-FREE');
const MODEL = process.argv[2] || 'gemma2:9b'; // Allow model override

// Check if Ollama is running
async function checkOllama() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) throw new Error('Ollama not responding');
    const data = await response.json();
    
    console.log('✅ Ollama is running!');
    console.log('📦 Available models:', data.models.map(m => m.name).join(', '));
    
    // Check if our model is available
    const hasModel = data.models.some(m => m.name === MODEL);
    if (!hasModel) {
      console.error(`❌ Model "${MODEL}" not found!`);
      console.log(`\n🔧 Install it with: ollama pull ${MODEL}`);
      process.exit(1);
    }
    
    console.log(`✅ Using model: ${MODEL}\n`);
    return true;
  } catch (error) {
    console.error('❌ Ollama is not running or not installed!');
    console.log('\n🔧 Setup instructions:');
    console.log('1. Download from https://ollama.ai/download');
    console.log('2. Install and start Ollama');
    console.log('3. Run: ollama pull gemma2:9b');
    console.log('4. Try again!\n');
    process.exit(1);
  }
}

async function translateFile(filePath, backend) {
  const fileName = path.basename(filePath);
  console.log(`\n📂 Processing: ${fileName}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const strings = Array.isArray(data) ? data : [];
  
  if (strings.length === 0) {
    console.log('  ⚠️  No strings found, skipping');
    return null;
  }
  
  console.log(`  Found ${strings.length} strings to translate`);
  
  const manager = new TranslationManager(backend);
  const translated = [];
  let processed = 0;
  
  for (const str of strings) {
    processed++;
    
    // Skip non-text entries
    if (!str.text || str.text.startsWith('[漢:') || str.text.length < 2) {
      translated.push({
        ...str,
        translation: '',
        status: 'skipped'
      });
      continue;
    }
    
    try {
      const translation = await manager.translateString(str.text, {
        category: str.category || 'unknown',
        disk: fileName
      });
      
      translated.push({
        ...str,
        translation,
        status: 'translated'
      });
      
      // Progress indicator
      if (processed % 50 === 0) {
        process.stdout.write(`  Progress: ${processed}/${strings.length} (${Math.round(processed/strings.length*100)}%)\r`);
      }
    } catch (error) {
      console.error(`  ❌ Error translating: ${error.message}`);
      translated.push({
        ...str,
        translation: '',
        status: 'error'
      });
    }
  }
  
  const stats = manager.getStats();
  console.log(`  ✅ Complete: ${stats.translated} translated, ${stats.cached} cached`);
  
  return {
    disk: fileName,
    exportDate: new Date().toISOString(),
    model: MODEL,
    backend: 'Ollama (Free)',
    strings: translated,
    stats
  };
}

async function main() {
  console.log('🎮 FREE ALSHARK TRANSLATION - OLLAMA BACKEND');
  console.log('============================================\n');
  
  // Check Ollama setup
  await checkOllama();
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Initialize backend
  const backend = new OllamaTranslationBackend({ model: MODEL });
  
  // Find all extraction files
  const extractionFiles = fs.readdirSync(EXTRACTION_DIR)
    .filter(f => f.endsWith('.extraction.json'))
    .map(f => path.join(EXTRACTION_DIR, f));
  
  console.log(`📚 Found ${extractionFiles.length} disk extraction files\n`);
  
  const startTime = Date.now();
  const results = [];
  
  for (const file of extractionFiles) {
    const result = await translateFile(file, backend);
    if (result) {
      results.push(result);
      
      // Save individual file
      const outputPath = path.join(OUTPUT_DIR, `${result.disk}.translated.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`  💾 Saved: ${path.basename(outputPath)}`);
    }
  }
  
  // Create master file
  const masterOutput = {
    exportDate: new Date().toISOString(),
    model: MODEL,
    backend: 'Ollama (Free)',
    diskCount: results.length,
    disks: results
  };
  
  const masterPath = path.join(OUTPUT_DIR, 'alshark-master-translation-FREE.json');
  fs.writeFileSync(masterPath, JSON.stringify(masterOutput, null, 2));
  
  // Generate summary
  const totalStrings = results.reduce((sum, r) => sum + r.strings.length, 0);
  const totalTranslated = results.reduce((sum, r) => sum + r.stats.translated, 0);
  const elapsedTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  const summary = `
🎊 TRANSLATION COMPLETE (FREE - NO COST!)
==========================================

Model Used: ${MODEL}
Backend: Ollama (Free, Local)
Total Time: ${elapsedTime} minutes

📊 Statistics:
- Disks processed: ${results.length}
- Total strings: ${totalStrings}
- Translated: ${totalTranslated}
- Success rate: ${((totalTranslated/totalStrings)*100).toFixed(1)}%
- Cost: $0.00 (FREE!)

📁 Output Files:
${results.map(r => `- ${r.disk}.translated.json (${r.strings.length} strings)`).join('\n')}
- alshark-master-translation-FREE.json (master file)

✨ Benefits of Ollama:
- 100% Free (no API costs)
- Unlimited translations
- Private (all local, no data sent online)
- Customizable (can fine-tune models)
- No rate limits

⚡ Performance Tips:
- Use GPU for 10x faster translation
- Try different models: ollama list
- Adjust temperature in translation-backends-free.js
- Use qwen2.5:7b or llama3.1:8b for better Japanese

🎯 Next Steps:
1. Review translations in OUT-FREE/ folder
2. Test patched games with: node src/disk-reinsertion.js
3. Compare quality vs Claude API translations
4. Fine-tune model if needed for better results
`;
  
  const summaryPath = path.join(OUTPUT_DIR, 'TRANSLATION-SUMMARY-FREE.txt');
  fs.writeFileSync(summaryPath, summary);
  
  console.log('\n' + summary);
  console.log(`\n💾 All output saved to: ${OUTPUT_DIR}`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
