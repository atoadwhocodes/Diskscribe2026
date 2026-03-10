const fs = require('fs');
const path = require('path');

const {
  canonicalIdFromMasterString,
  getEffectiveTranslation
} = require('./alshark-translation-source');

const repoRoot = path.resolve(__dirname, '..');
const extractedDir = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-EXTRACTED-REV');
const translatedDir = path.join(repoRoot, 'alshark-project', 'data', 'ALSHARK-TRANSLATED-REV');
const artifactRoot = path.join(repoRoot, 'alshark-project', 'output', 'ALSHARK-PATCHED-HW-ARTIFACTS');

const masterPath = path.join(extractedDir, 'alshark-master.json');
const flagsPath = path.join(extractedDir, 'flagged-garbled-entries.json');
const translationsPath = path.join(translatedDir, 'translations.json');

const cleanBacklogPath = path.join(extractedDir, 'alshark-clean-translation-backlog.json');
const flaggedBacklogPath = path.join(extractedDir, 'alshark-flagged-translation-backlog.json');
const polishQueuePath = path.join(extractedDir, 'alshark-polish-fit-queue.json');
const summaryPath = path.join(extractedDir, 'alshark-translation-worklists-summary.json');
const summaryMarkdownPath = path.join(extractedDir, 'alshark-translation-worklists.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

function loadLatestFitPriorityList() {
  if (!fs.existsSync(artifactRoot)) {
    return null;
  }

  const candidates = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('alshark-'))
    .map((entry) => path.join(artifactRoot, entry.name, 'patch-fit-priority-list.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();

  if (!candidates.length) {
    return null;
  }

  return {
    path: candidates[candidates.length - 1],
    data: readJson(candidates[candidates.length - 1])
  };
}

function buildTranslationMap(translationsData) {
  const byId = new Map();
  const translations = Array.isArray(translationsData.translations) ? translationsData.translations : [];

  for (const entry of translations) {
    const id = String(entry.id || '').trim().toLowerCase();
    if (!id) {
      continue;
    }
    byId.set(id, entry);
  }

  return byId;
}

function makeWorkItem(masterEntry, id, extra = {}) {
  return {
    id,
    disk: masterEntry.disk,
    offset: masterEntry.offset,
    offsetHex: `0x${Number(masterEntry.offset).toString(16)}`,
    maxBytes: masterEntry.maxBytes,
    sourceText: masterEntry.text,
    ...extra
  };
}

function toMarkdown(summary) {
  const lines = [];
  lines.push('# Alshark Translation Worklists');
  lines.push('');
  lines.push(`Generated: \`${summary.generatedAt}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Master strings: ${summary.masterStrings}`);
  lines.push(`- Translated now: ${summary.translatedStrings}`);
  lines.push(`- Remaining clean untranslated: ${summary.cleanBacklogCount}`);
  lines.push(`- Remaining flagged review: ${summary.flaggedBacklogCount}`);
  lines.push(`- Fit-polish queue: ${summary.polishQueueCount}`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push(`- Clean backlog: \`${cleanBacklogPath}\``);
  lines.push(`- Flagged backlog: \`${flaggedBacklogPath}\``);
  lines.push(`- Polish queue: \`${polishQueuePath}\``);
  lines.push('');
  lines.push('## Counts By Disk');
  lines.push('');

  for (const [disk, counts] of Object.entries(summary.byDisk)) {
    lines.push(`### ${disk}`);
    lines.push('');
    lines.push(`- Translated: ${counts.translated}`);
    lines.push(`- Clean backlog: ${counts.cleanBacklog}`);
    lines.push(`- Flagged backlog: ${counts.flaggedBacklog}`);
    lines.push(`- Polish queue: ${counts.polishQueue}`);
    lines.push('');
  }

  if (summary.topPolish.length) {
    lines.push('## Top Polish Items');
    lines.push('');
    summary.topPolish.forEach((entry, index) => {
      lines.push(`${index + 1}. \`${entry.id}\` [${entry.disk}] overflow ${entry.overflowBytes} bytes`);
      lines.push(`   Tier: ${entry.priorityTier}`);
      lines.push(`   Translation: ${entry.translation}`);
      lines.push('');
    });
  }

  return `${lines.join('\n').trim()}\n`;
}

function main() {
  [masterPath, flagsPath, translationsPath].forEach(ensureRequired);

  const master = readJson(masterPath);
  const flags = readJson(flagsPath);
  const translationsData = readJson(translationsPath);
  const fitPriority = loadLatestFitPriorityList();

  const strings = Array.isArray(master.strings) ? master.strings : [];
  const flagEntries = Array.isArray(flags.flags) ? flags.flags : [];
  const translationsById = buildTranslationMap(translationsData);
  const flaggedByIndex = new Map(flagEntries.map((entry) => [Number(entry.index), entry]));
  const byDisk = {};

  const cleanBacklog = [];
  const flaggedBacklog = [];
  const polishQueue = [];
  let translatedStrings = 0;

  for (let index = 0; index < strings.length; index++) {
    const masterEntry = strings[index];
    const id = canonicalIdFromMasterString(masterEntry);
    const disk = masterEntry.disk || 'UNKNOWN';
    const flag = flaggedByIndex.get(index + 1) || null;
    const translationEntry = translationsById.get(id);
    const effectiveTranslation = getEffectiveTranslation(translationEntry);

    if (!byDisk[disk]) {
      byDisk[disk] = {
        translated: 0,
        cleanBacklog: 0,
        flaggedBacklog: 0,
        polishQueue: 0
      };
    }

    if (effectiveTranslation) {
      translatedStrings++;
      byDisk[disk].translated++;
      continue;
    }

    if (flag) {
      const item = makeWorkItem(masterEntry, id, {
        category: 'flagged-review',
        flagReason: flag.reason,
        flagSample: flag.sample || ''
      });
      flaggedBacklog.push(item);
      byDisk[disk].flaggedBacklog++;
    } else {
      const item = makeWorkItem(masterEntry, id, {
        category: 'clean-untranslated'
      });
      cleanBacklog.push(item);
      byDisk[disk].cleanBacklog++;
    }
  }

  if (fitPriority && fitPriority.data && Array.isArray(fitPriority.data.entries)) {
    for (const entry of fitPriority.data.entries) {
      const translationEntry = translationsById.get(String(entry.id || '').toLowerCase());
      if (!translationEntry) {
        continue;
      }

      const effectiveTranslation = getEffectiveTranslation(translationEntry);
      if (!effectiveTranslation) {
        continue;
      }

      const polishItem = {
        id: entry.id,
        disk: entry.disk,
        offset: entry.offset,
        offsetHex: entry.offsetHex,
        maxBytes: entry.maxBytes,
        capacity: entry.capacity,
        overflowBytes: entry.overflowBytes || 0,
        originalLength: entry.originalLength || 0,
        preTruncateLength: entry.preTruncateLength || 0,
        finalLength: entry.finalLength || 0,
        currentTranslation: typeof translationEntry.translation === 'string' ? translationEntry.translation : '',
        currentPatchText: typeof translationEntry.patchText === 'string' ? translationEntry.patchText : '',
        effectiveText: effectiveTranslation,
        sourceText: entry.sourcePreview || translationEntry.source || '',
        currentFittedPreview: entry.fittedPreview || '',
        priorityTier: entry.priority && entry.priority.tier ? entry.priority.tier : null,
        priorityLabel: entry.priority && entry.priority.tierLabel ? entry.priority.tierLabel : '',
        priorityRationale: entry.priority && entry.priority.rationale ? entry.priority.rationale : '',
        priorityScore: entry.priority && entry.priority.score ? entry.priority.score : 0,
        strategies: Array.isArray(entry.strategies) ? entry.strategies : []
      };

      polishQueue.push(polishItem);
      if (!byDisk[polishItem.disk]) {
        byDisk[polishItem.disk] = {
          translated: 0,
          cleanBacklog: 0,
          flaggedBacklog: 0,
          polishQueue: 0
        };
      }
      byDisk[polishItem.disk].polishQueue++;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    masterStrings: strings.length,
    translatedStrings,
    cleanBacklogCount: cleanBacklog.length,
    flaggedBacklogCount: flaggedBacklog.length,
    polishQueueCount: polishQueue.length,
    fitPriorityPath: fitPriority ? fitPriority.path : null,
    byDisk,
    topPolish: polishQueue.slice(0, 25).map((entry) => ({
      id: entry.id,
      disk: entry.disk,
      overflowBytes: entry.overflowBytes,
      priorityTier: entry.priorityLabel,
      translation: entry.effectiveText
    }))
  };

  fs.writeFileSync(cleanBacklogPath, JSON.stringify({
    generatedAt: summary.generatedAt,
    game: 'Alshark',
    category: 'clean-untranslated',
    count: cleanBacklog.length,
    strings: cleanBacklog
  }, null, 2));

  fs.writeFileSync(flaggedBacklogPath, JSON.stringify({
    generatedAt: summary.generatedAt,
    game: 'Alshark',
    category: 'flagged-review',
    count: flaggedBacklog.length,
    strings: flaggedBacklog
  }, null, 2));

  fs.writeFileSync(polishQueuePath, JSON.stringify({
    generatedAt: summary.generatedAt,
    game: 'Alshark',
    category: 'fit-polish',
    count: polishQueue.length,
    strings: polishQueue
  }, null, 2));

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(summaryMarkdownPath, toMarkdown(summary));

  console.log('Alshark translation worklists rebuilt.');
  console.log(`  translated=${translatedStrings}`);
  console.log(`  clean backlog=${cleanBacklog.length}`);
  console.log(`  flagged backlog=${flaggedBacklog.length}`);
  console.log(`  polish queue=${polishQueue.length}`);
  console.log(`  clean backlog: ${cleanBacklogPath}`);
  console.log(`  flagged backlog: ${flaggedBacklogPath}`);
  console.log(`  polish queue: ${polishQueuePath}`);
}

main();
