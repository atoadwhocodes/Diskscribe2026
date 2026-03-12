const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const cleanDir = paths.batch500Clean;
const activeDir = path.join(cleanDir, 'active');
const latestSummaryPath = path.join(activeDir, 'latest-session.json');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function listBatchFiles() {
  if (!fs.existsSync(cleanDir)) {
    throw new Error(`Clean batch directory not found: ${cleanDir}`);
  }

  return fs.readdirSync(cleanDir)
    .filter((file) => file.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right));
}

function splitHeaderAndBody(text) {
  const lines = text.split(/\r?\n/);
  const firstEntryIndex = lines.findIndex((line) => /^s_\d{6} \| /.test(line));
  if (firstEntryIndex === -1) {
    return { headerLines: lines, bodyLines: [] };
  }

  return {
    headerLines: lines.slice(0, firstEntryIndex),
    bodyLines: lines.slice(firstEntryIndex)
  };
}

function parseEntries(bodyLines) {
  const entries = [];
  let current = null;

  for (const line of bodyLines) {
    if (/^s_\d{6} \| /.test(line)) {
      if (current) {
        entries.push(current);
      }
      current = { lines: [line] };
      continue;
    }

    if (!current) {
      continue;
    }

    current.lines.push(line);
  }

  if (current) {
    entries.push(current);
  }

  return entries.map((entry) => {
    const enLine = entry.lines.find((line) => /^EN: /.test(line)) || 'EN: [UNTRANSLATED]';
    const idLine = entry.lines[0] || '';

    return {
      id: idLine.split(' | ')[0] || '',
      lines: trimTrailingBlankLines(entry.lines),
      translated: !/^EN: \[UNTRANSLATED\]\s*$/i.test(enLine)
    };
  });
}

function trimTrailingBlankLines(lines) {
  const copy = [...lines];
  while (copy.length && copy[copy.length - 1] === '') {
    copy.pop();
  }
  return copy;
}

function headerValue(headerLines, key) {
  const prefix = `${key}:`;
  const line = headerLines.find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function buildActiveHeader(sourceFile, sourceRange, totalEntries, remainingEntries) {
  return [
    'ALSHARK Translation Lines (ID, JP, EN) - ACTIVE CLEAN REMAINING',
    `Source File: ${sourceFile}`,
    `Source Range: ${sourceRange || 'unknown'}`,
    `Source Entries: ${totalEntries}`,
    `Remaining Entries: ${remainingEntries}`,
    'Status: Continue filling only the remaining EN lines in this file.',
    `Generated: ${new Date().toISOString()}`,
    ''
  ];
}

function writeActiveBatch(sourceFile, sourceRange, entries, totalEntries) {
  ensureDir(activeDir);

  const baseName = path.basename(sourceFile, '.txt');
  const outputName = `${baseName}.remaining.txt`;
  const outputPath = path.join(activeDir, outputName);
  const body = [];

  for (const entry of entries) {
    body.push(...entry.lines);
    body.push('');
  }

  const outputLines = buildActiveHeader(sourceFile, sourceRange, totalEntries, entries.length)
    .concat(body);
  fs.writeFileSync(outputPath, outputLines.join('\n').trimEnd() + '\n', 'utf8');

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceFile,
    sourceRange,
    totalEntries,
    remainingEntries: entries.length,
    outputFile: outputPath
  };
  fs.writeFileSync(latestSummaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  return { outputPath, summary };
}

function main() {
  const files = listBatchFiles();

  for (const file of files) {
    const filePath = path.join(cleanDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const { headerLines, bodyLines } = splitHeaderAndBody(text);
    const entries = parseEntries(bodyLines);
    const remainingEntries = entries.filter((entry) => !entry.translated);

    if (!remainingEntries.length) {
      continue;
    }

    const result = writeActiveBatch(
      file,
      headerValue(headerLines, 'Range'),
      remainingEntries,
      entries.length
    );

    console.log('Prepared next translation batch.');
    console.log(`  source=${file}`);
    console.log(`  total=${entries.length}`);
    console.log(`  remaining=${remainingEntries.length}`);
    console.log(`  output=${result.outputPath}`);
    console.log(`  summary=${latestSummaryPath}`);
    return;
  }

  console.log('No remaining untranslated clean batch entries found.');
}

main();
