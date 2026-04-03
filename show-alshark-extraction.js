#!/usr/bin/env node
/**
 * Sample dialog extraction from Alshark
 * Shows the dialog strings that were found and demonstrates translation
 */

const fs = require('fs');
const path = require('path');

const extractionPathArg = process.argv[2];
const extractionPathEnv = process.env.ALSHARK_EXTRACTION_PATH;
const extractionPath = path.resolve(
  extractionPathArg || extractionPathEnv || path.join(__dirname, 'alshark-system-extraction', 'extraction.json')
);

console.log('Loading extraction data...\n');
const rawData = fs.readFileSync(extractionPath, 'utf8');
const extraction = JSON.parse(rawData);

console.log('ALSHARK TEXT EXTRACTION RESULTS');
console.log('═'.repeat(70));
console.log('');
console.log(`Total strings extracted: ${extraction.totalStrings}`);
console.log(`Export date: ${extraction.exportDate}`);
console.log('');

console.log('BREAKDOWN BY CATEGORY');
console.log('─'.repeat(70));
Object.entries(extraction.byCategory).forEach(([category, strings]) => {
  console.log(`${category.padEnd(20)}: ${strings.length.toLocaleString()}`);
});
console.log('');

// Show first 10 dialog strings
console.log('SAMPLE DIALOG STRINGS (First 10)');
console.log('═'.repeat(70));
console.log('');

const dialogStrings = extraction.byCategory.dialog || [];
dialogStrings.slice(0, 10).forEach((dialog, idx) => {
  console.log(`${(idx + 1).toString().padEnd(3)}. [${dialog.disk}]`);
  console.log(`     Offset: ${dialog.offset}`);
  console.log(`     Original: "${dialog.original}"`);
  console.log(`     Status: ${dialog.verified ? 'VERIFIED' : 'NEEDS TRANSLATION'}`);
  console.log('');
});

// Show stats
console.log('STATISTICS');
console.log('═'.repeat(70));
const totalDialogs = dialogStrings.length;
const totalNames = (extraction.byCategory.name_item || []).length;
const totalUI = (extraction.byCategory.ui_menu || []).length;
const totalCombat = (extraction.byCategory.combat_status || []).length;

console.log(`Dialogs to translate: ${totalDialogs}`);
console.log(`Names/Items to translate: ${totalNames}`);
console.log(`UI buttons/menus: ${totalUI}`);
console.log(`Combat text: ${totalCombat}`);
console.log('');

// Create a sample translation structure
const sampleTranslation = {
  exportDate: new Date().toISOString(),
  totalStrings: extraction.totalStrings,
  byCategory: {}
};

Object.entries(extraction.byCategory).forEach(([category, strings]) => {
  sampleTranslation.byCategory[category] = strings.map((str) => ({
    disk: str.disk,
    offset: str.offset,
    original: str.original,
    translation: '',
    verified: false
  }));
});

const translationPath = path.join(
  path.dirname(extractionPath),
  'alshark-translations-template.json'
);

fs.writeFileSync(translationPath, JSON.stringify(sampleTranslation, null, 2));

console.log('✓ Translation template created: alshark-translations-template.json');
console.log('');
console.log('NEXT STEPS:');
console.log('1. Edit the template JSON file');
console.log('2. Add English translations for each "original" text');
console.log('3. Mark "verified": true when translation is confirmed');
console.log('4. Save the file');
console.log('5. Run: node extract-alshark-text.js reinsertion extraction.json alshark-translations-template.json');
console.log('');
