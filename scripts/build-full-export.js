const fs = require('fs');
const path = require('path');

const {
  canonicalIdFromMasterString,
  escapeCsvCell,
  loadMergedTranslationMaps,
  normalizeJP
} = require('./alshark-translation-source');

const projectRoot = path.join(__dirname, '..');
const extractedDir = path.join(projectRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV');
const translatedDir = path.join(projectRoot, 'alshark-project', 'data', 'ALSHARK-TRANSLATED-REV');
const masterJson = path.join(extractedDir, 'alshark-master.json');
const translationsJson = path.join(translatedDir, 'translations.json');
const csvFile = path.join(projectRoot, 'ALSHARK-ALL-LINES.csv');
const outTxt = path.join(projectRoot, 'ALSHARK-ALL-LINES-REGEN.txt');

if (!fs.existsSync(masterJson)) {
  console.error('Master JSON not found:', masterJson);
  process.exit(1);
}

const master = JSON.parse(fs.readFileSync(masterJson, 'utf8'));
const strings = Array.isArray(master.strings) ? master.strings : [];
const { idMap, jpMap, stats } = loadMergedTranslationMaps({
  csvPath: csvFile,
  translationsPath: translationsJson
});

const txtOut = [];
const csvOut = [
  'Alshark Full Translation Lines',
  '',
  'ID,Japanese (JP),English (EN)'
];

let translatedCount = 0;
for (let i = 0; i < strings.length; i++) {
  const entry = strings[i];
  const extractedId = `extracted_${String(i + 1).padStart(5, '0')}`;
  const canonicalId = canonicalIdFromMasterString(entry);
  const jp = String(entry.text || '').replace(/\r\n/g, '\n');
  const en = (canonicalId && idMap[canonicalId]) || jpMap[normalizeJP(jp)] || '';

  if (en) {
    translatedCount++;
  }

  txtOut.push(`${extractedId}\nJP: ${jp}\nEN: ${en || '[UNTRANSLATED]'}\n`);
  csvOut.push([canonicalId, escapeCsvCell(jp), escapeCsvCell(en)].join(','));
}

fs.writeFileSync(outTxt, txtOut.join('\n'), 'utf8');
fs.writeFileSync(csvFile, csvOut.join('\n'), 'utf8');

console.log(
  'Loaded translations from sources:',
  'json=',
  stats.jsonTranslatedRows,
  'csv=',
  stats.csvTranslatedRows
);
console.log('Wrote', txtOut.length, 'entries to', outTxt);
console.log('Wrote', strings.length, 'rows to', csvFile, 'translated=', translatedCount);
