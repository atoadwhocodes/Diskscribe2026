const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const steps = [
  'alshark-project/scripts/extract-alshark-rev-eng.js',
  'scripts/flag-garbled-entries.js',
  'scripts/build-full-export.js',
  'scripts/split-batches-fixed.js',
  'scripts/map-ids-and-rewrite-batches.js',
  'scripts/add-batch-headers.js',
  'scripts/verify-mapped-counts.js',
  'scripts/generate-clean-batches.js',
  'scripts/apply-translations-to-clean.js',
  'scripts/export-canonical-clean-csv.js',
  'scripts/generate-applied-diff-csv.js',
  'scripts/audit-alshark-translation-coverage.js'
];

for (const step of steps) {
  console.log(`\n=== Running ${step} ===\n`);
  const result = spawnSync(process.execPath, [step], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error(`\nPipeline failed at ${step} with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\nAlshark pipeline rebuild complete.');
