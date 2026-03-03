const fs = require('fs');
const data = JSON.parse(fs.readFileSync('ALSHARK-EXTRACTED-REV/translation-targets.json'));

// Filter out Data disk garbage
const clean = data.strings.filter(s => {
  if (s.disk === 'Data') return false;
  const text = s.sourceText;
  const realJp = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  return realJp >= 3;
});

console.log('=== Final Clean Extraction ===');
console.log('Before filter:', data.strings.length);
console.log('After filter:', clean.length);

// Save final file
const output = {
  game: 'Alshark',
  platform: 'PC-98',
  generated: new Date().toISOString(),
  generator: 'DiskScribe Reverse-Engineered Extractor',
  stringCount: clean.length,
  strings: clean
};

fs.writeFileSync('ALSHARK-EXTRACTED-REV/alshark-translation-ready.json', JSON.stringify(output, null, 2));

// Summary by disk
const byDisk = {};
for (const s of clean) {
  byDisk[s.disk] = (byDisk[s.disk] || 0) + 1;
}
console.log('\nBy disk:');
for (const [d, c] of Object.entries(byDisk)) {
  console.log('  ' + d + ': ' + c);
}

console.log('\nOutput: ALSHARK-EXTRACTED-REV/alshark-translation-ready.json');
