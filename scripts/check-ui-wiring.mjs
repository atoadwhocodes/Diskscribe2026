import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const htmlPath = path.join(workspaceRoot, 'apps', 'diskscribe-2026-desktop', 'src', 'index.html');
const handlerFiles = [
  path.join(workspaceRoot, 'apps', 'diskscribe-2026-desktop', 'src', 'renderer.ts'),
  path.join(workspaceRoot, 'apps', 'diskscribe-2026-desktop', 'src', 'webview', 'editor.ts')
];

if (!fs.existsSync(htmlPath)) {
  console.error(`UI wiring check failed: expected HTML file not found: ${htmlPath}`);
  process.exit(1);
}

for (const filePath of handlerFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`UI wiring check failed: expected handler file not found: ${filePath}`);
    process.exit(1);
  }
}
if (!fs.existsSync(htmlPath)) {
  console.error(`UI wiring check failed: expected HTML file not found: ${htmlPath}`);
  process.exit(1);
}

for (const filePath of handlerFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`UI wiring check failed: expected handler file not found: ${filePath}`);
    process.exit(1);
  }
}

const html = fs.readFileSync(htmlPath, 'utf8');
const buttonIds = Array.from(
  new Set(Array.from(html.matchAll(/<button[^>]*\sid="([^"]+)"/g), (match) => match[1]))
);

if (buttonIds.length === 0) {
  console.error(`No button IDs found in ${htmlPath}.`);
  process.exit(1);
}

const fileContents = new Map(
  handlerFiles.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')])
);

const missing = buttonIds.filter((buttonId) => {
  const idPattern = new RegExp(`\\b${escapeRegExp(buttonId)}\\b`);
  for (const content of fileContents.values()) {
    if (idPattern.test(content)) {
      return false;
    }
  }
  return true;
});

if (missing.length > 0) {
  console.error('Missing UI handler references for button IDs:');
  for (const buttonId of missing) {
    console.error(`- ${buttonId}`);
  }
  process.exit(1);
}

console.log(`UI wiring check passed: ${buttonIds.length} button IDs mapped.`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
