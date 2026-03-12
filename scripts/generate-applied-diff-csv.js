const fs = require('fs');
const path = require('path');

const {
  diskShortFromFull,
  loadMergedTranslationMaps,
  normalizeJP
} = require('./alshark-translation-source');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const regenClean = paths.regenClean;
const regenMapped = paths.regenCleanMapped;
const csvPath = paths.allLinesCsv;
const translationsPath = path.join(paths.translated, 'translations.json');
const outCsv = path.join(paths.extracted, 'applied-translations.csv');

function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(s_\d{6}) \| (.+) @ 0x([0-9A-Fa-f]+)$/);
    if (!match) {
      continue;
    }

    const id = match[1];
    const disk = match[2];
    const offsetHex = '0x' + match[3].toUpperCase();
    const jpParts = [];
    const enParts = [];
    let mode = 'idle';

    for (let j = i + 1; j < lines.length; j++) {
      if (/^s_\d{6} \| /.test(lines[j])) {
        break;
      }

      if (/^JP:/.test(lines[j])) {
        mode = 'jp';
        jpParts.push(lines[j].slice(3).trim());
        continue;
      }

      if (/^EN:/.test(lines[j])) {
        mode = 'en';
        enParts.push(lines[j].slice(3).trim());
        continue;
      }

      if (mode === 'jp') {
        jpParts.push(lines[j]);
      } else if (mode === 'en') {
        enParts.push(lines[j]);
      }
    }

    const jp = jpParts.join('\n').trim();
    const en = enParts.join('\n').trim();
    entries.push({ id, disk, offsetHex, jp, en });
  }

  return entries;
}

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

if (!fs.existsSync(regenClean) || !fs.existsSync(regenMapped)) {
  console.error('Required regen files missing');
  process.exit(2);
}

const cleanText = fs.readFileSync(regenClean, 'utf8');
const mappedText = fs.readFileSync(regenMapped, 'utf8');
const cleanEntries = parseEntries(cleanText);
const mappedEntries = parseEntries(mappedText);
const mappedById = Object.create(null);
for (const entry of mappedEntries) mappedById[entry.id] = entry;

const { idMap, jpMap } = loadMergedTranslationMaps({
  csvPath,
  translationsPath
});

const rows = [];
rows.push(['id', 'disk', 'offsetHex', 'jp', 'old_en', 'new_en', 'method', 'confidence'].join(','));

let appliedCount = 0;
for (const entry of cleanEntries) {
  const mapped = mappedById[entry.id];
  if (!mapped) continue;

  const oldEn = entry.en || '';
  const newEn = mapped.en || '';
  if (oldEn === newEn) continue;
  if (!newEn || /^\[UNTRANSLATED\]/i.test(newEn)) continue;

  appliedCount++;

  const hex = entry.offsetHex.replace(/^0x/i, '');
  const num = parseInt(hex, 16);
  const diskShort = diskShortFromFull(entry.disk);
  const idKey = `${diskShort}_${num.toString(16).toLowerCase()}`;

  let method = 'unknown';
  let confidence = '';
  if (idMap[idKey]) {
    method = 'byId';
    confidence = '1.00';
  } else {
    const norm = normalizeJP(entry.jp || '');
    if (norm && jpMap[norm]) {
      method = 'byJP';
      confidence = '1.00';
    } else if (norm) {
      let best = null;
      let bestScore = 0;
      for (const key in jpMap) {
        const score = similarity(norm, key);
        if (score > bestScore) {
          bestScore = score;
          best = key;
        }
      }
      if (bestScore >= 0.86) {
        method = 'byFuzzy';
        confidence = bestScore.toFixed(3);
      }
    }
  }

  function esc(value) {
    if (value == null) return '""';
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  rows.push([
    entry.id,
    entry.disk,
    entry.offsetHex,
    esc(entry.jp),
    esc(oldEn),
    esc(newEn),
    method,
    confidence
  ].join(','));
}

fs.writeFileSync(outCsv, rows.join('\n'), 'utf8');
console.log('Wrote applied translations CSV to', outCsv, 'rows=', appliedCount);
