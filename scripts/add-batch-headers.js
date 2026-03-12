const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const dir = paths.batch500;
if (!fs.existsSync(dir)) {
  console.error('Batch dir not found:', dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
const now = new Date().toISOString();

for (const f of files) {
  const p = path.join(dir, f);
  const content = fs.readFileSync(p, 'utf8');
  // Skip if header already present
  if (content.startsWith('ALSHARK Translation Lines')) continue;

  // derive range from filename
  const m = f.match(/alshark-lines-(\d{4})-(\d{4})\.txt/);
  let rangeText = f;
  if (m) rangeText = `${parseInt(m[1],10)}-${parseInt(m[2],10)}`;

  const entryCount = content
    .split(/\r?\n/)
    .filter((line) => /^extracted_\d+$/.test(line) || /^s_\d{6} \| /.test(line))
    .length;

  const header = [];
  header.push('ALSHARK Translation Lines (ID, JP, EN)');
  header.push(`File: ${f}`);
  header.push(`Range: ${rangeText}`);
  header.push(`Entries: ${entryCount}`);
  header.push('Encoding: shift_jis');
  header.push(`Generated: ${now}`);
  header.push('');

  const newContent = header.join('\n') + content;
  fs.writeFileSync(p, newContent, 'utf8');
  console.log('Updated header for', f);
}

console.log('Headers added to batch files');
