import fs from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const signJsPath = path.join(appRoot, 'node_modules', 'electron-winstaller', 'lib', 'sign.js');

const targetNeedle = '!fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)';
const patchedNeedle = '!BACKUP_SIGN_TOOL_PATH || !fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)';

if (!fs.existsSync(signJsPath)) {
  console.log('[patch-electron-winstaller] Skipped: sign.js not found.');
  process.exit(0);
}

const source = fs.readFileSync(signJsPath, 'utf8');
if (source.includes(patchedNeedle)) {
  console.log('[patch-electron-winstaller] Already patched.');
  process.exit(0);
}

if (!source.includes(targetNeedle)) {
  console.log('[patch-electron-winstaller] Skipped: target pattern not found.');
  process.exit(0);
}

const patched = source.replace(targetNeedle, patchedNeedle);
fs.writeFileSync(signJsPath, patched, 'utf8');
console.log('[patch-electron-winstaller] Patch applied.');
