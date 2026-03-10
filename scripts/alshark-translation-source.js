const fs = require('fs');

function normalizeJP(text) {
  if (!text) {
    return '';
  }

  let normalized = String(text).replace(/[\d_#]/g, '');
  normalized = normalized.replace(/@/g, ' ');
  normalized = normalized.replace(/(.)\1{6,}/g, '$1');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function diskShortFromFull(fullName) {
  const value = String(fullName || '').toLowerCase();
  if (value.includes('system')) return 'system';
  if (value.includes('opening')) return 'opening';
  if (value.includes('ending')) return 'ending';
  if (value.includes('data')) return 'data';
  if (value.includes('visual')) return 'visual';
  if (value.includes('user')) return 'user';
  return '';
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((part) => part.trim());
}

function decodeCsvText(value) {
  return String(value || '').replace(/\\n/g, '\n');
}

function loadCsvTranslationMaps(csvPath) {
  const idMap = Object.create(null);
  const jpMap = Object.create(null);
  let rows = 0;
  let translatedRows = 0;

  if (!fs.existsSync(csvPath)) {
    return { idMap, jpMap, rows, translatedRows };
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let headerIdx = lines.findIndex((line) => /^ID,/.test(line));
  if (headerIdx < 0) {
    headerIdx = -1;
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const parts = parseCsvLine(line);
    if (parts.length < 3) {
      continue;
    }

    const id = parts[0].trim().toLowerCase();
    const jp = decodeCsvText(parts[1].trim());
    const en = decodeCsvText(parts.slice(2).join(',').trim());
    rows++;

    if (!en) {
      continue;
    }

    if (id) {
      idMap[id] = en;
    }
    if (jp) {
      jpMap[normalizeJP(jp)] = en;
    }
    translatedRows++;
  }

  return { idMap, jpMap, rows, translatedRows };
}

function loadJsonTranslationMaps(translationsPath) {
  const idMap = Object.create(null);
  const jpMap = Object.create(null);
  let translatedRows = 0;

  if (!fs.existsSync(translationsPath)) {
    return { idMap, jpMap, translatedRows };
  }

  const data = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
  const translations = Array.isArray(data.translations) ? data.translations : [];

  for (const entry of translations) {
    const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
    const jp = typeof entry.source === 'string' ? entry.source.trim() : '';
    const en = typeof entry.translation === 'string' ? entry.translation.trim() : '';

    if (!en) {
      continue;
    }

    if (id) {
      idMap[id] = en;
    }
    if (jp) {
      jpMap[normalizeJP(jp)] = en;
    }
    translatedRows++;
  }

  return { idMap, jpMap, translatedRows };
}

function mergeTranslationMaps(...sources) {
  const idMap = Object.create(null);
  const jpMap = Object.create(null);

  for (const source of sources) {
    for (const [id, translation] of Object.entries(source.idMap || {})) {
      if (translation) {
        idMap[id] = translation;
      }
    }

    for (const [jp, translation] of Object.entries(source.jpMap || {})) {
      if (translation) {
        jpMap[jp] = translation;
      }
    }
  }

  return { idMap, jpMap };
}

function loadMergedTranslationMaps(options) {
  const csvMaps = loadCsvTranslationMaps(options.csvPath);
  const jsonMaps = loadJsonTranslationMaps(options.translationsPath);
  const merged = mergeTranslationMaps(jsonMaps, csvMaps);

  return {
    ...merged,
    stats: {
      csvRows: csvMaps.rows,
      csvTranslatedRows: csvMaps.translatedRows,
      jsonTranslatedRows: jsonMaps.translatedRows
    }
  };
}

function canonicalIdFromMasterString(entry) {
  const disk = String(entry && entry.disk ? entry.disk : '').trim().toLowerCase();
  const offset = Number(entry && entry.offset);
  if (!disk || !Number.isFinite(offset)) {
    return '';
  }

  return `${disk}_${offset.toString(16).toLowerCase()}`;
}

function escapeCsvCell(value) {
  const normalized = String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

module.exports = {
  canonicalIdFromMasterString,
  diskShortFromFull,
  escapeCsvCell,
  loadMergedTranslationMaps,
  normalizeJP,
  parseCsvLine
};
