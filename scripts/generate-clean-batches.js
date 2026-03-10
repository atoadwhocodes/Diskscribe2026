const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const masterPath = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV', 'alshark-master.json');
const flagsPath = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV', 'flagged-garbled-entries.json');
const outDir = path.join(repoRoot, 'all-alshark-lines-batch500-clean');
const regenOut = path.join(repoRoot, 'ALSHARK-ALL-LINES-REGEN-CLEAN.txt');

function pad(n, width) { return String(n).padStart(width, '0'); }
function diskFullName(short) {
  const map = { 'System': 'Alshark (System disk).hdm', 'Opening': 'Alshark (Opening disk).hdm', 'Ending': 'Alshark (Ending disk).hdm', 'Data': 'Alshark (Data disk).hdm', 'Visual': 'Alshark (Visual disk).hdm', 'User': 'Alshark (User disk).hdm' };
  return map[short] || short;
}

if (!fs.existsSync(masterPath)) { console.error('master JSON not found', masterPath); process.exit(2); }
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const total = master.uniqueStrings || (master.strings && master.strings.length) || 0;
const strings = master.strings || [];

let flagged = new Set();
if (fs.existsSync(flagsPath)) {
  const j = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));
  for (const f of (j.flags || [])) flagged.add(Number(f.index));
}

// Build clean entries
const clean = [];
for (let i = 0; i < strings.length; i++) {
  const idx = i + 1;
  if (flagged.has(idx)) continue;
  const s = strings[i];
  const id = 's_' + pad(i,6);
  const disk = diskFullName(s.disk);
  const offsetHex = '0x' + s.offset.toString(16).toUpperCase().padStart(6, '0');
  clean.push({ id, disk, offsetHex, text: s.text || '' });
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// write regen clean file
{
  const lines = [];
  for (const c of clean) {
    lines.push(`${c.id} | ${c.disk} @ ${c.offsetHex}`);
    lines.push('JP: ' + c.text);
    lines.push('EN: [UNTRANSLATED]');
    lines.push('');
  }
  fs.writeFileSync(regenOut, lines.join('\n'), 'utf8');
  console.log('Wrote clean regen file:', regenOut, 'entries=', clean.length);
}

// write batch files of 500 entries
const batchSize = 500;
let fileIndex = 0;
for (let i = 0; i < clean.length; i += batchSize) {
  fileIndex++;
  const start = i + 1;
  const end = Math.min(i + batchSize, clean.length);
  const fname = `alshark-lines-clean-${pad(start,4)}-${pad(end,4)}.txt`;
  const fp = path.join(outDir, fname);
  const header = [
    'ALSHARK Translation Lines (ID, JP, EN) - CLEAN',
    `File: ${fname}`,
    `Range: ${start}-${end}`,
    `Entries: ${end - start + 1}`,
    'Encoding: shift_jis',
    `Generated: ${new Date().toISOString()}`,
    ''
  ].join('\n');
  const chunk = clean.slice(i, i + batchSize);
  const body = [];
  for (const c of chunk) {
    body.push(`${c.id} | ${c.disk} @ ${c.offsetHex}`);
    body.push('JP: ' + c.text);
    body.push('EN: [UNTRANSLATED]');
    body.push('');
  }
  fs.writeFileSync(fp, header + '\n' + body.join('\n'), 'utf8');
  console.log('Wrote', fp);
}

console.log('Clean batches complete. Total clean entries:', clean.length, 'batches:', fileIndex);
