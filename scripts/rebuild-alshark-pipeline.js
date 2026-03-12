const { spawnSync } = require('child_process');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { repoRoot, paths } = getAlsharkPc98Roots();

const steps = [
  path.join(paths.scripts, 'extract-alshark-rev-eng.js'),
  path.join(repoRoot, 'scripts', 'flag-garbled-entries.js'),
  path.join(repoRoot, 'scripts', 'build-full-export.js'),
  path.join(repoRoot, 'scripts', 'split-batches-fixed.js'),
  path.join(repoRoot, 'scripts', 'map-ids-and-rewrite-batches.js'),
  path.join(repoRoot, 'scripts', 'add-batch-headers.js'),
  path.join(repoRoot, 'scripts', 'verify-mapped-counts.js'),
  path.join(repoRoot, 'scripts', 'generate-clean-batches.js'),
  path.join(repoRoot, 'scripts', 'apply-translations-to-clean.js'),
  path.join(repoRoot, 'scripts', 'export-canonical-clean-csv.js'),
  path.join(repoRoot, 'scripts', 'generate-applied-diff-csv.js'),
  path.join(repoRoot, 'scripts', 'audit-alshark-translation-coverage.js'),
  path.join(repoRoot, 'scripts', 'build-alshark-translation-worklists.js')
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
