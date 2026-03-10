const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const masterPath = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV', 'alshark-master.json');
const batchesDir = path.join(repoRoot, 'all-alshark-lines-batch500');
const regenPath = path.join(repoRoot, 'ALSHARK-ALL-LINES-REGEN.txt');
const regenOut = path.join(repoRoot, 'ALSHARK-ALL-LINES-REGEN-MAPPED.txt');

function diskFullName(short) {
  const map = {
    'System': 'Alshark (System disk).hdm',
    'Opening': 'Alshark (Opening disk).hdm',
    'Ending': 'Alshark (Ending disk).hdm',
    'Data': 'Alshark (Data disk).hdm',
    'Visual': 'Alshark (Visual disk).hdm',
    'User': 'Alshark (User disk).hdm'
  };
  return map[short] || short;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

if (!fs.existsSync(masterPath)) {
  console.error('Master JSON not found at', masterPath);
  process.exit(2);
}

const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const strings = master.strings || [];

// Build mapping from extracted_xxxxx -> canonical id + source info
const mapping = Object.create(null);
for (let i = 0; i < strings.length; i++) {
  const idx = i + 1;
  const key = 'extracted_' + pad(idx, 5);
  const id = 's_' + pad(i, 6);
  const s = strings[i];
  const fullDisk = diskFullName(s.disk);
  const offsetHex = '0x' + s.offset.toString(16).toUpperCase().padStart(6, '0');
  mapping[key] = { id, disk: fullDisk, offset: s.offset, offsetHex };
}

function rewriteFile(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^extracted_(\d{5})$/);
    if (m) {
      const key = 'extracted_' + m[1];
      const info = mapping[key];
      if (info) {
        // Replace with canonical id and source info
        lines[i] = `${info.id} | ${info.disk} @ ${info.offsetHex}`;
      }
    }
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

// Process batch files
if (!fs.existsSync(batchesDir)) {
  console.error('Batches directory not found at', batchesDir);
  process.exit(3);
}

const files = fs.readdirSync(batchesDir).filter(f => f.endsWith('.txt')).sort();
for (const f of files) {
  const fp = path.join(batchesDir, f);
  console.log('Rewriting', fp);
  rewriteFile(fp);
}

// Rewrite regen file to mapped regen
if (fs.existsSync(regenPath)) {
  console.log('Rewriting regen file to', regenOut);
  const data = fs.readFileSync(regenPath, 'utf8');
  const lines = data.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^extracted_(\d{5})$/);
    if (m) {
      const key = 'extracted_' + m[1];
      const info = mapping[key];
      if (info) lines[i] = `${info.id} | ${info.disk} @ ${info.offsetHex}`;
    }
  }
  fs.writeFileSync(regenOut, lines.join('\n'), 'utf8');
}

console.log('Done. Processed', files.length, 'batch files. Total strings mapped:', Object.keys(mapping).length);
