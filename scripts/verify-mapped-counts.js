const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const masterPath = path.join(paths.extracted, 'alshark-master.json');
const regenMapped = paths.regenMapped;
const batchesDir = paths.batch500;

function countIdsInFile(fp) {
  const data = fs.readFileSync(fp, 'utf8');
  const m = data.match(/^s_\d{6} \|/gm);
  return m ? m.length : 0;
}

if (!fs.existsSync(masterPath)) {
  console.error('Master JSON missing', masterPath);
  process.exit(2);
}
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const expected = master.uniqueStrings || (master.strings && master.strings.length) || 0;

let regenCount = 0;
if (fs.existsSync(regenMapped)) regenCount = countIdsInFile(regenMapped);

let batchCount = 0;
let files = [];
if (fs.existsSync(batchesDir)) {
  files = fs.readdirSync(batchesDir).filter(f => f.endsWith('.txt'));
  for (const f of files) batchCount += countIdsInFile(path.join(batchesDir, f));
}

console.log('Expected (master.uniqueStrings):', expected);
console.log('Mapped regen file IDs:', regenCount);
console.log('Sum of IDs across', files.length, 'batch files:', batchCount);

if (expected !== regenCount || expected !== batchCount) {
  console.warn('Mismatch detected. Further investigation recommended.');
  process.exit(1);
}

console.log('All counts match.');
