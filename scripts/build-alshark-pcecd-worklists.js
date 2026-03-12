const { spawnSync } = require('child_process');
const path = require('path');
const { getAlsharkPcecdRoots } = require('./lib/alshark-roots');

const { repoRoot, paths } = getAlsharkPcecdRoots();
const python = process.env.PYTHON || 'python';
const scriptPath = path.join(paths.scripts, 'build_translation_worklists.py');
const args = [
  scriptPath,
  '--input',
  path.join(paths.extracted, 'canonical-units.json'),
  '--out-dir',
  path.join(paths.extracted, 'worklists'),
  ...process.argv.slice(2)
];

const result = spawnSync(python, args, {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
