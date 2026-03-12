const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const masterPath = path.join(paths.extracted, 'alshark-master.json');
const outPath = path.join(paths.extracted, 'flagged-garbled-entries.json');

if (!fs.existsSync(masterPath)) {
  console.error('Master JSON missing', masterPath);
  process.exit(2);
}

const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const strings = master.strings || [];

const flags = [];

for (let i = 0; i < strings.length; i++) {
  const s = strings[i];
  const text = s.text || '';
  const idx = i + 1;
  const key = 'extracted_' + String(idx).padStart(5, '0');
  // Heuristics
  const repeatedRun = /(.)\1{19,}/.test(text);
  const hasReplacement = text.indexOf('\uFFFD') !== -1;
  const controlChars = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  const longLength = text.length > 1500;
  if (repeatedRun || hasReplacement || controlChars > 0 || longLength) {
    const reason = [];
    if (repeatedRun) reason.push('long repeated run');
    if (hasReplacement) reason.push('replacement-char');
    if (controlChars > 0) reason.push('control-chars');
    if (longLength) reason.push('very-long');
    flags.push({ index: idx, key, disk: s.disk, offset: s.offset, offsetHex: '0x'+s.offset.toString(16).toUpperCase().padStart(6,'0'), reason: reason.join(', '), sample: text.slice(0,300) });
  }
}

fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), flags }, null, 2), 'utf8');
console.log('Flagged entries written to', outPath, 'count=', flags.length);
