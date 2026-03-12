const fs = require('fs');
const path = require('path');

const {
  diskShortFromFull,
  loadMergedTranslationMaps,
  normalizeJP
} = require('./alshark-translation-source');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { repoRoot, paths } = getAlsharkPc98Roots();
const csvPath = paths.allLinesCsv;
const translationsPath = path.join(paths.translated, 'translations.json');
const cleanBatchesDir = paths.batch500Clean;
const regenClean = paths.regenClean;
const regenOut = paths.regenCleanMapped;

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let k = 0; k <= b.length; k++) v0[k] = v1[k];
  }

  return v1[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  const length = Math.max(a.length, b.length);
  return 1 - (distance / length);
}

function readEntry(lines, startIndex) {
  let jpLineIdx = -1;
  let enLineIdx = -1;
  const jpParts = [];

  for (let i = startIndex + 1; i < lines.length; i++) {
    if (/^s_\d{6} \| /.test(lines[i])) {
      break;
    }

    if (jpLineIdx === -1 && /^JP:/.test(lines[i])) {
      jpLineIdx = i;
      jpParts.push(lines[i].slice(3).trim());
      continue;
    }

    if (/^EN:/.test(lines[i])) {
      enLineIdx = i;
      break;
    }

    if (jpLineIdx !== -1) {
      jpParts.push(lines[i]);
    }
  }

  return {
    enLineIdx,
    jpText: jpParts.join('\n').trim()
  };
}

const { idMap, jpMap, stats } = loadMergedTranslationMaps({
  csvPath,
  translationsPath
});
console.log(
  'Loaded translations from sources:',
  'json=',
  stats.jsonTranslatedRows,
  'csv=',
  stats.csvTranslatedRows,
  'id entries=',
  Object.keys(idMap).length,
  'jp entries=',
  Object.keys(jpMap).length
);

function applyToText(text) {
  const lines = text.split(/\r?\n/);
  let appliedById = 0;
  let appliedByJP = 0;
  let appliedByFuzzy = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^s_\d{6} \| (.+) @ 0x([0-9A-Fa-f]+)$/);
    if (!match) {
      continue;
    }

    const diskFull = match[1];
    const hex = match[2];
    const num = parseInt(hex, 16);
    const diskShort = diskShortFromFull(diskFull);
    const idKey = `${diskShort}_${num.toString(16).toLowerCase()}`;

    const { enLineIdx, jpText } = readEntry(lines, i);

    if (idMap[idKey]) {
      if (enLineIdx >= 0) {
        lines[enLineIdx] = 'EN: ' + idMap[idKey];
        appliedById++;
      }
      continue;
    }

    const norm = normalizeJP(jpText);
    if (norm && jpMap[norm]) {
      if (enLineIdx >= 0) {
        lines[enLineIdx] = 'EN: ' + jpMap[norm];
        appliedByJP++;
      }
      continue;
    }

    if (norm && norm.length >= 8) {
      let best = null;
      let bestScore = 0;
      for (const key in jpMap) {
        const score = similarity(norm, key);
        if (score > bestScore) {
          bestScore = score;
          best = key;
        }
      }

      if (best && bestScore >= 0.86 && enLineIdx >= 0) {
        lines[enLineIdx] = 'EN: ' + jpMap[best];
        appliedByFuzzy++;
      }
    }
  }

  console.log('Applied: byId=', appliedById, 'byJP=', appliedByJP, 'byFuzzy=', appliedByFuzzy);
  return lines.join('\n');
}

if (fs.existsSync(regenClean)) {
  console.log('Applying translations to', regenClean);
  const text = fs.readFileSync(regenClean, 'utf8');
  const out = applyToText(text);
  fs.writeFileSync(regenOut, out, 'utf8');
  console.log('Wrote', regenOut);
}

if (fs.existsSync(cleanBatchesDir)) {
  const files = fs.readdirSync(cleanBatchesDir).filter((file) => file.endsWith('.txt'));
  let applied = 0;

  for (const file of files) {
    const filePath = path.join(cleanBatchesDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const out = applyToText(text);
    fs.writeFileSync(filePath, out, 'utf8');
    applied++;
  }

  console.log('Applied translations to', applied, 'batch files');
}

function countTranslatedInFile(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const matches = data.match(/^EN: (?!\[UNTRANSLATED\]).+/gmi);
  return matches ? matches.length : 0;
}

let totalTranslated = 0;
if (fs.existsSync(regenOut)) totalTranslated = countTranslatedInFile(regenOut);
else if (fs.existsSync(regenClean)) totalTranslated = countTranslatedInFile(regenClean);

console.log('Estimated translated lines after apply:', totalTranslated);
