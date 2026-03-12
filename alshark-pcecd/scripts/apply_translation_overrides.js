const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index++;
  }

  return args;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(String(args.input || ''));
  const overridesPath = path.resolve(String(args.overrides || ''));
  const outputPath = path.resolve(String(args.output || ''));

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!overridesPath || !fs.existsSync(overridesPath)) {
    throw new Error(`Overrides file not found: ${overridesPath}`);
  }
  if (!outputPath) {
    throw new Error('Missing --output path');
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const overridesDoc = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
  const overrides = Array.isArray(overridesDoc.overrides) ? overridesDoc.overrides : [];
  const overrideMap = new Map(
    overrides.map((entry) => [String(entry.id || '').toLowerCase(), entry])
  );

  const translations = Array.isArray(input.translations) ? input.translations : [];
  let applied = 0;

  for (const translation of translations) {
    const key = String(translation.id || '').toLowerCase();
    if (!overrideMap.has(key)) {
      continue;
    }

    const override = overrideMap.get(key);
    Object.assign(translation, override, {
      updatedAt: new Date().toISOString(),
      reviewStatus: 'manual_review'
    });
    applied++;
  }

  input.updatedAt = new Date().toISOString();
  input.count = translations.length;
  input.reviewedOverrideCount = applied;

  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(input, null, 2));

  console.log(`Applied ${applied} overrides.`);
  console.log(`Output: ${outputPath}`);
}

main();
