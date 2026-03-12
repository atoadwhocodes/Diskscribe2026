const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const inFile = paths.regenFull;
const outDir = paths.batch500;

if (!fs.existsSync(inFile)) {
  console.error('Input file missing:', inFile);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(inFile, 'utf8');
const lines = raw.split(/\r?\n/);

const entries = [];
let current = null;
for (const line of lines) {
  if (/^extracted_\d+/.test(line)) {
    if (current) entries.push(current.join('\n'));
    current = [line];
  } else {
    if (current) current.push(line);
    else if (line.trim()) {
      // stray lines before first header - attach to first entry
      current = [line];
    }
  }
}
if (current) entries.push(current.join('\n'));

const total = entries.length;
const batchSize = 500;

// Remove previously written batch files to avoid stale files beyond needed range
const existing = fs.readdirSync(outDir).filter(f=>f.endsWith('.txt'));
for (const f of existing) fs.unlinkSync(path.join(outDir,f));

for (let i = 0, batch = 0; i < total; i += batchSize, batch++) {
  const start = i + 1;
  const end = Math.min(i + batchSize, total);
  const fileName = `alshark-lines-${String(start).padStart(4,'0')}-${String(end).padStart(4,'0')}.txt`;
  const outPath = path.join(outDir, fileName);
  const content = entries.slice(i, end).join('\n\n') + '\n';
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('Wrote', outPath);
}

console.log(`Split ${total} entries into ${Math.ceil(total / batchSize)} files`);
