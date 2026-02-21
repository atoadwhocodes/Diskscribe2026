import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  { label: 'Root package.json', path: 'package.json' },
  { label: 'Desktop package.json', path: 'apps/diskscribe-2026-desktop/package.json' },
  { label: 'CI workflow', path: '.github/workflows/ci.yml' },
  { label: 'Release workflow', path: '.github/workflows/build-win-artifact.yml' }
];

const rootPackage = readJson(path.join(workspaceRoot, 'package.json'));
const desktopPackage = readJson(path.join(workspaceRoot, 'apps', 'diskscribe-2026-desktop', 'package.json'));

console.log('DiskScribe2026 Doctor');
console.log('=====================');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`Node: ${process.version}`);
console.log(`Root version: ${rootPackage.version ?? 'unknown'}`);
console.log(`Desktop version: ${desktopPackage.version ?? 'unknown'}`);
console.log('');

let hasFailures = false;
for (const check of checks) {
  const targetPath = path.join(workspaceRoot, check.path);
  const exists = fs.existsSync(targetPath);
  console.log(`[${exists ? 'OK' : 'MISSING'}] ${check.label} -> ${check.path}`);
  if (!exists) {
    hasFailures = true;
  }
}

if (String(rootPackage.version ?? '') !== String(desktopPackage.version ?? '')) {
  console.log('[MISMATCH] Root and desktop versions differ.');
  hasFailures = true;
}

if (hasFailures) {
  process.exit(1);
}

console.log('');
console.log('Doctor checks passed.');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
