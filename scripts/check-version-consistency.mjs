import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const rootPackagePath = path.join(workspaceRoot, 'package.json');
const desktopPackagePath = path.join(
  workspaceRoot,
  'apps',
  'diskscribe-2026-desktop',
  'package.json'
);

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));

const rootVersion = String(rootPackage.version ?? '').trim();
const desktopVersion = String(desktopPackage.version ?? '').trim();

if (!rootVersion || !desktopVersion) {
  console.error('Unable to resolve both package versions.');
  process.exit(1);
}

if (rootVersion !== desktopVersion) {
  console.error(
    `Version mismatch: root package.json is ${rootVersion} while desktop package.json is ${desktopVersion}.`
  );
  process.exit(1);
}

console.log(`Version consistency check passed: ${rootVersion}`);
