const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const flagsPath = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV', 'flagged-garbled-entries.json');
const outCsv = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV', 'flagged-garbled-entries.csv');

if (!fs.existsSync(flagsPath)) {
  console.error('Flags JSON not found at', flagsPath);
  process.exit(2);
}

const j = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));
const flags = j.flags || [];

function esc(s) {
  if (s == null) return '';
  return '"' + String(s).replace(/"/g, '""') + '"';
}

const rows = [];
rows.push(['index','key','disk','offsetHex','reason','sample'].join(','));
for (const f of flags) {
  const sample = (f.sample || '').replace(/\n/g, ' ').slice(0, 200);
  rows.push([f.index, f.key, f.disk, f.offsetHex, esc(f.reason), esc(sample)].join(','));
}

fs.writeFileSync(outCsv, rows.join('\n'), 'utf8');
console.log('Wrote CSV with', flags.length, 'rows to', outCsv);
