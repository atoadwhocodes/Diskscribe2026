#!/usr/bin/env node
/**
 * Create sample translation for demonstration
 * Shows how to fill in the translation template
 */

const fs = require('fs');

const templatePath = 'e:\\diskscribe2026\\alshark-system-extraction\\alshark-translations-template.json';
const data = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

// Add some sample translations to show the workflow
const sampleTranslations = {
  'Character Intro': 'Hero Introduction',
  'Start Game': 'New Game',
  'Continue': 'Resume Game',
  'Settings': 'Options',
  'Save': 'Save Game',
  'Load': 'Load Game',
  'Exit': 'Quit Game',
  'Attack': 'Attack',
  'Defend': 'Guard',
  'Magic': 'Spells',
  'Item': 'Items',
  'Status': 'Character Status',
  'Equipment': 'Gear',
  'Victory': 'Battle Won!',
  'Defeat': 'Battle Lost',
  'Experience': 'EXP Gained'
};

// Mark first 20 strings as translated examples
let translatedCount = 0;
Object.entries(data.byCategory).forEach(([category, strings]) => {
  strings.forEach((entry, idx) => {
    if (translatedCount < 20) {
      const sampleKey = Object.keys(sampleTranslations)[idx % Object.keys(sampleTranslations).length];
      entry.translation = sampleTranslations[sampleKey] || `Translation ${translatedCount}`;
      entry.verified = true;
      translatedCount++;
    }
  });
});

const outputPath = 'e:\\diskscribe2026\\alshark-system-extraction\\alshark-translations-sample.json';
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

console.log('✓ Sample translation file created: alshark-translations-sample.json');
console.log(`✓ Added ${translatedCount} sample translations (marked as verified)`);
console.log('');
console.log('Now creating reinsertion plan...');
console.log('');

// Now run the reinsertion workflow
const { exec } = require('child_process');
const path = require('path');

const extractionPath = 'e:\\diskscribe2026\\alshark-system-extraction\\extraction.json';
const translationPath = outputPath;

exec(
  `node extract-alshark-text.js reinsertion "${extractionPath}" "${translationPath}"`,
  { cwd: 'E:\\diskscribe2026' },
  (error, stdout, stderr) => {
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    if (stderr) {
      console.error('stderr:', stderr);
    }
    console.log(stdout);
  }
);
