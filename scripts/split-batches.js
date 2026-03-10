const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const inFile = path.join(repoRoot, 'ALSHARK-ALL-LINES-REGEN.txt');
const outDir = path.join(repoRoot, 'all-alshark-lines-batch500');

if (!fs.existsSync(inFile)) {
  console.error('Input file missing:', inFile);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(inFile, 'utf8');

// Split entries: assume double-newline separates top-level entries
const entries = raw.split(/\n\n+/).map(e => e.trim()).filter(Boolean);
const total = entries.length;
const batchSize = 500;

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
