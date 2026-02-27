/**
 * TEST TRANSLATION CAPABILITIES ON ALSHARK DISKS
 * Demonstrates the full translation workflow:
 * 1. Load extracted Japanese text from disk images
 * 2. Use translation service (mock or Claude API)
 * 3. Display original vs translated text
 * 4. Calculate coverage statistics
 */

const fs = require('fs');
const path = require('path');

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' ALSHARK TRANSLATION CAPABILITY TEST '.padStart(50).padEnd(69) + '║');
console.log('╚' + '═'.repeat(68) + '╝');
console.log('');

// Load a sample extraction file
const extractionPath = path.join(__dirname, 'alshark-extraction-test', 'Alshark (System disk).hdm.extraction.json');

if (!fs.existsSync(extractionPath)) {
  console.error('❌ Extraction file not found:', extractionPath);
  console.log('');
  console.log('Run this first:');
  console.log('  node extract-alshark-v2.js');
  process.exit(1);
}

console.log('📂 Loading extraction data...');
const extractionData = JSON.parse(fs.readFileSync(extractionPath, 'utf8'));

// Extraction data is an array
const allStrings = Array.isArray(extractionData) ? extractionData : [];

// Filter for strings with actual Japanese text (not just kanji placeholders)
const japaneseStrings = allStrings.filter(entry => {
  const text = entry.originalText || '';
  // Include entries with actual characters, not just [漢:xxxx] placeholders
  return text && text.length > 2 && !text.match(/^\[漢:[0-9a-f]+\]$/);
});

// Get sample strings (first 20 meaningful ones)
const sampleSize = 20;
const sampleStrings = japaneseStrings.slice(0, sampleSize);

console.log(`✓ Loaded ${allStrings.length} total extracted entries`);
console.log(`  Filtered to ${japaneseStrings.length} entries with text content`);
console.log(`  Testing with ${sampleStrings.length} sample strings`);
console.log('');

// Simple mock translation service
const mockGlossary = {
  // UI/Menu
  '新しいゲーム': 'New Game',
  'ゲーム再開': 'Resume Game',
  'オプション': 'Options',
  'セーブ': 'Save',
  'ロード': 'Load',
  '終了': 'Exit',
  
  // Combat
  '攻撃': 'Attack',
  '防御': 'Defend',
  '魔法': 'Magic',
  'アイテム': 'Item',
  '逃げる': 'Run',
  
  // Status
  'キャラクター': 'Character',
  'ステータス': 'Status',
  '装備': 'Equipment',
  'スキル': 'Skills',
  '経験値': 'EXP',
  'レベル': 'Level',
  'HP': 'HP',
  'MP': 'MP',
  
  // Results
  '勝利': 'Victory',
  '敗北': 'Defeat',
  '獲得': 'Obtained',
  
  // Common
  'はい': 'Yes',
  'いいえ': 'No',
  '決定': 'Confirm',
  'キャンセル': 'Cancel'
};

function mockTranslate(japaneseText) {
  // Check glossary
  if (mockGlossary[japaneseText]) {
    return mockGlossary[japaneseText];
  }
  
  // Return romanized placeholder
  return `[JP: ${japaneseText.substring(0, 20)}...]`;
}

// Translation test
console.log('═'.repeat(70));
console.log('TRANSLATION TEST RESULTS');
console.log('═'.repeat(70));
console.log('');

let matched = 0;
let unmatched = 0;

sampleStrings.forEach((entry, idx) => {
  const original = entry.originalText || '';
  const offset = entry.offsetHex || entry.offset || '0x000000';
  const category = entry.category || 'other';
  
  if (!original || original.length < 2) return;
  
  const translated = mockTranslate(original);
  const isGlossaryMatch = mockGlossary[original] !== undefined;
  
  if (isGlossaryMatch) {
    matched++;
    console.log(`✓ ${(idx + 1).toString().padStart(2)}. [${offset}] (${category})`);
  } else {
    unmatched++;
    console.log(`○ ${(idx + 1).toString().padStart(2)}. [${offset}] (${category})`);
  }
  
  console.log(`    Original:    ${original}`);
  console.log(`    Translation: ${translated}`);
  console.log('');
});

console.log('═'.repeat(70));
console.log('STATISTICS');
console.log('═'.repeat(70));
console.log('');
console.log(`Total entries in disk:     ${allStrings.length.toLocaleString()}`);
console.log(`Text entries found:        ${japaneseStrings.length.toLocaleString()}`);
console.log(`Sample tested:             ${sampleStrings.length}`);
console.log(`Glossary matches:          ${matched} (${sampleStrings.length > 0 ? Math.round(matched/sampleStrings.length*100) : 0}%)`);
console.log(`Unmatched (need AI):       ${unmatched} (${sampleStrings.length > 0 ? Math.round(unmatched/sampleStrings.length*100) : 0}%)`);
console.log('');

// Calculate estimated coverage
const estimatedMatches = sampleStrings.length > 0 ? Math.round(japaneseStrings.length * (matched / sampleStrings.length)) : 0;
const estimatedUnmatched = japaneseStrings.length - estimatedMatches;

console.log('FULL TRANSLATION ESTIMATES:');
console.log('');
console.log(`Estimated glossary matches:  ${estimatedMatches.toLocaleString()} strings`);
console.log(`Estimated AI needed:         ${estimatedUnmatched.toLocaleString()} strings`);
console.log('');

// Time estimates
const avgTranslationTime = 2; // seconds per string with API
const totalTimeHours = (estimatedUnmatched * avgTranslationTime) / 3600;

console.log('TIME ESTIMATES (using Claude API):');
console.log('');
console.log(`At ~${avgTranslationTime}s per string:       ${Math.round(totalTimeHours)} hours`);
console.log(`With parallel processing:  ${Math.round(totalTimeHours / 5)} hours (5 concurrent requests)`);
console.log('');

console.log('═'.repeat(70));
console.log('TRANSLATION BACKEND OPTIONS');
console.log('═'.repeat(70));
console.log('');
console.log('1. MOCK BACKEND (Current)');
console.log('   ✓ No API key required');
console.log('   ✓ Instant results');
console.log('   ✗ Limited glossary coverage (~30-40% of strings)');
console.log('   ✗ No context-aware translation');
console.log('');
console.log('2. CLAUDE API BACKEND');
console.log('   ✓ High-quality context-aware translation');
console.log('   ✓ Handles game-specific terminology');
console.log('   ✓ Maintains tone and style');
console.log('   ✗ Requires Anthropic API key');
console.log('   ✗ API costs (~$0.003 per string estimate)');
console.log('   ✗ Rate limits apply');
console.log('');
console.log('To use Claude API:');
console.log('  1. Get API key from: https://console.anthropic.com/');
console.log('  2. Set environment variable: ANTHROPIC_API_KEY=your_key');
console.log('  3. Modify src/translation-service.js to use ClaudeTranslationBackend');
console.log('');

console.log('═'.repeat(70));
console.log('NEXT STEPS');
console.log('═'.repeat(70));
console.log('');
console.log('1. Review extracted strings in alshark-extraction-test/');
console.log('2. Expand mock glossary for common game terms');
console.log('3. Set up Claude API for remaining strings');
console.log('4. Run batch translation: node src/translation-service.js');
console.log('5. Review translations and adjust');
console.log('6. Reinsert translations: node src/disk-reinsertion.js');
console.log('');
console.log('✨ Translation capability test complete!');
console.log('');
