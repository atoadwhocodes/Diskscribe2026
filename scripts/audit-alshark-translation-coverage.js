const fs = require('fs');
const path = require('path');

const {
  canonicalIdFromMasterString,
  loadMergedTranslationMaps
} = require('./alshark-translation-source');

const repoRoot = path.resolve(__dirname, '..');
const extractedDir = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV');
const translatedDir = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-TRANSLATED-REV');

const masterPath = path.join(extractedDir, 'alshark-master.json');
const flagsPath = path.join(extractedDir, 'flagged-garbled-entries.json');
const translationsPath = path.join(translatedDir, 'translations.json');
const csvPath = path.join(repoRoot, 'ALSHARK-ALL-LINES.csv');
const cleanMappedPath = path.join(repoRoot, 'ALSHARK-ALL-LINES-REGEN-CLEAN-MAPPED.txt');
const reportPath = path.join(extractedDir, 'translation-coverage-report.json');

function parseMappedEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(s_\d{6}) \| (.+) @ 0x([0-9A-Fa-f]+)$/);
    if (!match) {
      continue;
    }

    let mode = 'idle';
    const enParts = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^s_\d{6} \| /.test(lines[j])) {
        break;
      }

      if (/^JP:/.test(lines[j])) {
        mode = 'jp';
        continue;
      }

      if (/^EN:/.test(lines[j])) {
        mode = 'en';
        enParts.push(lines[j].slice(3).trim());
        continue;
      }

      if (mode === 'en') {
        enParts.push(lines[j]);
      }
    }

    entries.push({
      id: match[1],
      translated: enParts.join('\n').trim()
    });
  }

  return entries;
}

if (!fs.existsSync(masterPath) || !fs.existsSync(flagsPath) || !fs.existsSync(translationsPath)) {
  console.error('Required Alshark data files are missing.');
  process.exit(2);
}

const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));
const translationsData = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
const translations = Array.isArray(translationsData.translations) ? translationsData.translations : [];
const flaggedEntries = Array.isArray(flags.flags) ? flags.flags : [];

const flaggedByIndex = new Map(flaggedEntries.map((entry) => [Number(entry.index), entry]));
const cleanIdSet = new Set();
const flaggedIdMap = new Map();

for (let i = 0; i < (master.strings || []).length; i++) {
  const canonicalId = canonicalIdFromMasterString(master.strings[i]);
  const flag = flaggedByIndex.get(i + 1);
  if (flag) {
    flaggedIdMap.set(canonicalId, flag);
  } else {
    cleanIdSet.add(canonicalId);
  }
}

const translatedRows = translations.filter((entry) => typeof entry.translation === 'string' && entry.translation.trim()).length;
const exactCleanMatches = translations.filter((entry) => cleanIdSet.has(String(entry.id || '').toLowerCase())).length;
const excludedFromClean = translations
  .filter((entry) => !cleanIdSet.has(String(entry.id || '').toLowerCase()))
  .map((entry) => {
    const id = String(entry.id || '').toLowerCase();
    const flag = flaggedIdMap.get(id);
    return {
      id,
      disk: entry.disk,
      offset: entry.offset,
      reason: flag ? flag.reason : 'not in clean corpus',
      sample: typeof entry.source === 'string' ? entry.source.slice(0, 160) : ''
    };
  });

const { stats } = loadMergedTranslationMaps({ csvPath, translationsPath });

let cleanMappedTranslated = 0;
if (fs.existsSync(cleanMappedPath)) {
  cleanMappedTranslated = parseMappedEntries(fs.readFileSync(cleanMappedPath, 'utf8')).filter(
    (entry) => entry.translated && !/^\[UNTRANSLATED\]/i.test(entry.translated)
  ).length;
}

const report = {
  generatedAt: new Date().toISOString(),
  masterStrings: (master.strings || []).length,
  cleanStrings: cleanIdSet.size,
  flaggedStrings: flaggedEntries.length,
  translatedRows,
  exactCleanMatches,
  excludedFromCleanCount: excludedFromClean.length,
  cleanMappedTranslated,
  fullCsvRows: stats.csvRows,
  fullCsvTranslatedRows: stats.csvTranslatedRows,
  translationsJsonRows: stats.jsonTranslatedRows,
  excludedFromClean
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log('Translation coverage audit written to', reportPath);
console.log(
  'master=',
  report.masterStrings,
  'clean=',
  report.cleanStrings,
  'flagged=',
  report.flaggedStrings,
  'translated=',
  report.translatedRows,
  'exactCleanMatches=',
  report.exactCleanMatches,
  'excludedFromClean=',
  report.excludedFromCleanCount,
  'cleanMappedTranslated=',
  report.cleanMappedTranslated
);
