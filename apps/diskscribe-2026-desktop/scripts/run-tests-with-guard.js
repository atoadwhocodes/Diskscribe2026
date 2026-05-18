const { spawnSync } = require('node:child_process');

const minimumTests = Number(process.env.TEST_MIN_COUNT || 29);

function run(command) {
  const result = spawnSync(command, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(result.error.message);
  }

  return result;
}

const compile = run('npx tsc --project tsconfig.test.json');
if (compile.status !== 0) {
  process.exit(compile.status || 1);
}

const testCommand = 'node --test dist-tests/tests/*.test.js';
const tests = run(testCommand);
const output = `${tests.stdout || ''}\n${tests.stderr || ''}`;
const matches = [...output.matchAll(/(?:^|\n).*?\btests\s+(\d+)\b/g)];
const observedTests = matches.length > 0 ? Number(matches[matches.length - 1][1]) : 0;

if (tests.status !== 0) {
  process.exit(tests.status || 1);
}

if (!Number.isInteger(observedTests) || observedTests < minimumTests) {
  console.error(
    `Test guard failed: expected at least ${minimumTests} tests, but node:test reported ${observedTests || 'no count'}.`
  );
  process.exit(1);
}
