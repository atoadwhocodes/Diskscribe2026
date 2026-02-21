import { spawn } from 'node:child_process';

const npmCommand = 'npm';
const watchScripts = ['watch:ext', 'watch:webview'];
const children = [];

let shuttingDown = false;

const stopChildren = () => {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
    }
  }
};

for (const script of watchScripts) {
  const child = spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const scriptLabel = `npm run ${script}`;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`${scriptLabel} exited with ${reason}.`);

    shuttingDown = true;
    stopChildren();
    process.exit(code ?? 1);
  });
}

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
