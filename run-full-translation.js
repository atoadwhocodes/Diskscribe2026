/**
 * FULL ALSHARK TRANSLATION PIPELINE
 * Processes all extracted Alshark disk text and generates translated output
 */

const fs = require('fs');
const path = require('path');

// Create output directory
const outDir = path.join(__dirname, 'OUT');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('╔' + '═'.repeat(78) + '╗');
console.log('║' + ' ALSHARK FULL TRANSLATION PIPELINE '.padStart(53).padEnd(79) + '║');
console.log('╚' + '═'.repeat(78) + '╝');
console.log('');
console.log(`📁 Output Directory: ${outDir}`);
console.log('');

// Enhanced translation glossary
const translationGlossary = {
  // Menu/UI
  '新しいゲーム': 'New Game',
  'ゲーム再開': 'Continue',
  'オプション': 'Options',
  'セーブ': 'Save',
  'ロード': 'Load',
  '終了': 'Quit',
  '決定': 'Confirm',
  'キャンセル': 'Cancel',
  '戻る': 'Back',
  '次へ': 'Next',
  'はい': 'Yes',
  'いいえ': 'No',
  
  // Combat
  '攻撃': 'Attack',
  '防御': 'Defend',
  '魔法': 'Magic',
  'アイテム': 'Item',
  '逃げる': 'Run',
  '特技': 'Special',
  '必殺技': 'Ultimate',
  
  // Status
  'キャラクター': 'Character',
  'ステータス': 'Status',
  '装備': 'Equipment',
  'スキル': 'Skills',
  '経験値': 'EXP',
  'レベル': 'Level',
  'HP': 'HP',
  'MP': 'MP',
  '力': 'STR',
  '防御力': 'DEF',
  '素早さ': 'AGI',
  '運': 'LUK',
  '知力': 'INT',
  
  // Battle Results
  '勝利': 'Victory',
  '敗北': 'Defeat',
  '獲得': 'Obtained',
  '経験値を得た': 'Gained EXP',
  'レベルアップ': 'Level Up',
  
  // Common Words
  '冒険': 'Adventure',
  '戦闘': 'Battle',
  '敵': 'Enemy',
  '味方': 'Ally',
  '仲間': 'Party',
  'パーティー': 'Party',
  '勇者': 'Hero',
  '魔王': 'Demon King',
  '世界': 'World',
  '町': 'Town',
  '村': 'Village',
  '城': 'Castle',
  'ダンジョン': 'Dungeon',
  '宝箱': 'Treasure',
  
  // Items
  '武器': 'Weapon',
  '防具': 'Armor',
  '盾': 'Shield',
  '兜': 'Helmet',
  '薬草': 'Herb',
  'ポーション': 'Potion',
  '魔法の': 'Magic',
  '聖なる': 'Holy',
  '闇の': 'Dark'
};

function translateText(originalText, context = {}) {
  // Direct glossary match
  if (translationGlossary[originalText]) {
    return {
      translation: translationGlossary[originalText],
      method: 'glossary',
      confidence: 1.0
    };
  }
  
  // Partial match for compound words
  for (const [jp, en] of Object.entries(translationGlossary)) {
    if (originalText.includes(jp)) {
      const translated = originalText.replace(new RegExp(jp, 'g'), en);
      return {
        translation: translated,
        method: 'partial-glossary',
        confidence: 0.8
      };
    }
  }
  
  // Pattern-based translation for common structures
  if (originalText.match(/を倒した/)) {
    return {
      translation: originalText.replace(/を倒した/, ' defeated'),
      method: 'pattern',
      confidence: 0.7
    };
  }
  
  // Return romanized version for untranslated
  return {
    translation: originalText,
    method: 'untranslated',
    confidence: 0.0
  };
}

function processExtractionFile(filePath, diskName) {
  console.log(`📄 Processing: ${diskName}...`);
  
  const extractionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const entries = Array.isArray(extractionData) ? extractionData : [];
  
  // Filter for meaningful text
  const textEntries = entries.filter(entry => {
    const text = entry.originalText || '';
    // Skip pure kanji placeholders
    if (text.match(/^\[漢:[0-9a-f]+\]$/)) return false;
    // Skip very short entries
    if (text.length < 2) return false;
    return true;
  });
  
  console.log(`  ✓ Loaded ${entries.length} entries, ${textEntries.length} with text`);
  
  // Translate all entries
  const translated = textEntries.map((entry, idx) => {
    const result = translateText(entry.originalText, { 
      category: entry.category,
      offset: entry.offsetHex 
    });
    
    if (idx % 1000 === 0 && idx > 0) {
      process.stdout.write(`  Translating: ${idx}/${textEntries.length}\r`);
    }
    
    return {
      disk: diskName,
      offset: entry.offsetHex || entry.offset,
      category: entry.category || 'other',
      original: entry.originalText,
      translation: result.translation,
      translationMethod: result.method,
      confidence: result.confidence,
      verified: result.method === 'glossary',
      needsReview: result.confidence < 0.8
    };
  });
  
  // Statistics
  const stats = {
    total: translated.length,
    glossary: translated.filter(t => t.translationMethod === 'glossary').length,
    partial: translated.filter(t => t.translationMethod === 'partial-glossary').length,
    pattern: translated.filter(t => t.translationMethod === 'pattern').length,
    untranslated: translated.filter(t => t.translationMethod === 'untranslated').length,
    verified: translated.filter(t => t.verified).length
  };
  
  console.log(`  ✓ Translated: ${stats.glossary} glossary, ${stats.partial} partial, ${stats.pattern} pattern`);
  console.log(`  ! Untranslated: ${stats.untranslated} (${Math.round(stats.untranslated/stats.total*100)}%)`);
  console.log('');
  
  return { translated, stats };
}

// Process all extraction files
const extractionDir = path.join(__dirname, 'alshark-extraction-test');
const extractionFiles = fs.readdirSync(extractionDir)
  .filter(f => f.endsWith('.extraction.json'))
  .sort();

console.log('═'.repeat(80));
console.log('PROCESSING EXTRACTION FILES');
console.log('═'.repeat(80));
console.log('');

const allResults = [];
const allStats = {
  totalStrings: 0,
  totalGlossary: 0,
  totalPartial: 0,
  totalPattern: 0,
  totalUntranslated: 0,
  totalVerified: 0
};

extractionFiles.forEach(file => {
  const diskName = file.replace('.extraction.json', '');
  const filePath = path.join(extractionDir, file);
  
  const { translated, stats } = processExtractionFile(filePath, diskName);
  
  // Save individual disk translation
  const outputFile = path.join(outDir, `${diskName}.translated.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    disk: diskName,
    translationDate: new Date().toISOString(),
    stats: stats,
    translations: translated
  }, null, 2));
  
  allResults.push(...translated);
  allStats.totalStrings += stats.total;
  allStats.totalGlossary += stats.glossary;
  allStats.totalPartial += stats.partial;
  allStats.totalPattern += stats.pattern;
  allStats.totalUntranslated += stats.untranslated;
  allStats.totalVerified += stats.verified;
});

// Save master translation file
console.log('═'.repeat(80));
console.log('GENERATING MASTER TRANSLATION FILE');
console.log('═'.repeat(80));
console.log('');

const masterFile = path.join(outDir, 'alshark-master-translation.json');
fs.writeFileSync(masterFile, JSON.stringify({
  project: 'Alshark PC-98 Fan Translation',
  translationDate: new Date().toISOString(),
  totalDisks: extractionFiles.length,
  overallStats: allStats,
  translations: allResults
}, null, 2));

console.log(`✓ Master translation saved: ${masterFile}`);
console.log('');

// Generate summary report
console.log('═'.repeat(80));
console.log('TRANSLATION SUMMARY');
console.log('═'.repeat(80));
console.log('');

const coveragePercentage = Math.round(((allStats.totalGlossary + allStats.totalPartial) / allStats.totalStrings) * 100);
const untranslatedPercentage = Math.round((allStats.totalUntranslated / allStats.totalStrings) * 100);

console.log(`Total strings processed:     ${allStats.totalStrings.toLocaleString()}`);
console.log('');
console.log('Translation Methods:');
console.log(`  Glossary (exact):          ${allStats.totalGlossary.toLocaleString()} (${Math.round(allStats.totalGlossary/allStats.totalStrings*100)}%)`);
console.log(`  Partial glossary:          ${allStats.totalPartial.toLocaleString()} (${Math.round(allStats.totalPartial/allStats.totalStrings*100)}%)`);
console.log(`  Pattern-based:             ${allStats.totalPattern.toLocaleString()} (${Math.round(allStats.totalPattern/allStats.totalStrings*100)}%)`);
console.log(`  Untranslated:              ${allStats.totalUntranslated.toLocaleString()} (${untranslatedPercentage}%)`);
console.log('');
console.log(`Overall coverage:            ${coveragePercentage}%`);
console.log(`Verified translations:       ${allStats.totalVerified.toLocaleString()}`);
console.log('');

// Generate human-readable summary
const summaryFile = path.join(outDir, 'TRANSLATION-SUMMARY.txt');
const summaryContent = `
ALSHARK PC-98 FAN TRANSLATION PROJECT
Generated: ${new Date().toLocaleString()}

═══════════════════════════════════════════════════════════════════════════

TRANSLATION STATISTICS

Total Strings Processed:     ${allStats.totalStrings.toLocaleString()}

Translation Methods:
  ✓ Glossary (exact match):  ${allStats.totalGlossary.toLocaleString()} (${Math.round(allStats.totalGlossary/allStats.totalStrings*100)}%)
  ○ Partial glossary:         ${allStats.totalPartial.toLocaleString()} (${Math.round(allStats.totalPartial/allStats.totalStrings*100)}%)
  ○ Pattern-based:            ${allStats.totalPattern.toLocaleString()} (${Math.round(allStats.totalPattern/allStats.totalStrings*100)}%)
  ✗ Untranslated:             ${allStats.totalUntranslated.toLocaleString()} (${untranslatedPercentage}%)

Overall Coverage:             ${coveragePercentage}%
Verified Translations:        ${allStats.totalVerified.toLocaleString()}

═══════════════════════════════════════════════════════════════════════════

PROCESSED DISKS

${extractionFiles.map(f => `  • ${f.replace('.extraction.json', '')}`).join('\n')}

═══════════════════════════════════════════════════════════════════════════

OUTPUT FILES

Individual Translations:
${extractionFiles.map(f => `  • OUT/${f.replace('.extraction.json', '.translated.json')}`).join('\n')}

Master Translation:
  • OUT/alshark-master-translation.json

Summary:
  • OUT/TRANSLATION-SUMMARY.txt

═══════════════════════════════════════════════════════════════════════════

NEXT STEPS

1. Review untranslated strings in master translation file
2. For high-quality AI translation:
   - Set up Claude API key: ANTHROPIC_API_KEY
   - Run: node src/translation-service.js OUT/alshark-master-translation.json
3. Verify and edit translations as needed
4. Run disk reinsertion: node src/disk-reinsertion.js
5. Test patched disks on PC-98 emulator

NOTES

- Glossary translations are verified and safe to use
- Partial/pattern translations need human review
- Untranslated strings require AI or manual translation
- All offsets are preserved for accurate disk patching

═══════════════════════════════════════════════════════════════════════════
`;

fs.writeFileSync(summaryFile, summaryContent);
console.log(`✓ Summary report saved: ${summaryFile}`);
console.log('');

console.log('═'.repeat(80));
console.log('');
console.log('✨ Full translation pipeline complete!');
console.log('');
console.log(`📂 Output location: ${outDir}`);
console.log('');
console.log('Files generated:');
console.log(`  • ${extractionFiles.length} individual disk translations (.translated.json)`);
console.log(`  • 1 master translation file (alshark-master-translation.json)`);
console.log(`  • 1 summary report (TRANSLATION-SUMMARY.txt)`);
console.log('');
