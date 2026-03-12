const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const regenMapped = paths.regenCleanMapped;
const outCsv = path.join(paths.extracted, 'alshark-canonical-clean.csv');

function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(s_\d{6}) \| (.+) @ 0x([0-9A-Fa-f]+)$/);
    if (m) {
      const id = m[1];
      const disk = m[2];
      const offsetHex = '0x' + m[3].toUpperCase();
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
  }
  return entries;
}

if (!fs.existsSync(regenMapped)) {
  console.error('Mapped clean regen file missing');
  process.exit(2);
}

const mappedText = fs.readFileSync(regenMapped, 'utf8');
const entries = parseEntries(mappedText);

const rows = [];
rows.push(['id','disk','offset','jp','en'].join(','));
for (const e of entries) {
  function esc(s){ if(s==null) return '""'; return '"' + String(s).replace(/"/g,'""') + '"'; }
  rows.push([e.id, e.disk, e.offsetHex, esc(e.jp), esc(e.en)].join(','));
}

fs.writeFileSync(outCsv, rows.join('\n'), 'utf8');
console.log('Wrote canonical clean CSV to', outCsv, 'rows=', entries.length);
