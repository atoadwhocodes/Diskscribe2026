const { spawnSync } = require('child_process');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const scenario = String(process.argv[2] || '').trim().toLowerCase();
const extraArgs = process.argv.slice(3);

if (!scenario) {
  console.error('Usage: node scripts/run-managed-alshark-worklist.js <remaining|flagged-review|polish-fit> [extra args]');
  process.exit(2);
}

const { repoRoot, paths } = getAlsharkPc98Roots();
const runnerPath = path.join(repoRoot, 'scripts', 'run-alshark-ollama-worklist.js');

const scenarios = {
  remaining: [
    '--provider', 'google',
    '--mode', 'translate',
    '--input', path.join(paths.extracted, 'alshark-clean-translation-backlog.json'),
    '--checkpoint', path.join(paths.translated, 'google-remaining-checkpoint.json'),
    '--output', path.join(paths.translated, 'google-remaining-results.json'),
    '--merge-target', path.join(paths.translated, 'translations.json'),
    '--apply'
  ],
  'flagged-review': [
    '--provider', 'google',
    '--mode', 'translate',
    '--input', path.join(paths.extracted, 'alshark-flagged-translation-backlog.json'),
    '--checkpoint', path.join(paths.translated, 'google-flagged-review-checkpoint.json'),
    '--output', path.join(paths.translated, 'google-flagged-review-results.json')
  ],
  'polish-fit': [
    '--mode', 'polish-fit',
    '--input', path.join(paths.extracted, 'alshark-polish-fit-queue.json'),
    '--checkpoint', path.join(paths.translated, 'gemma3-polish-fit-checkpoint.json'),
    '--output', path.join(paths.translated, 'gemma3-polish-fit-results.json')
  ]
};

const baseArgs = scenarios[scenario];
if (!baseArgs) {
  console.error(`Unknown scenario: ${scenario}`);
  process.exit(2);
}

const result = spawnSync(process.execPath, [runnerPath, ...baseArgs, ...extraArgs], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
