const fs = require('fs');
const path = require('path');
const { readNullTerminatedAscii, validatePatchSet } = require('../patch-validation');
const {
  buildControlSafePatch,
  replaceAndWithAmpersandTransform,
  sequentialReplacementTransform,
  stripOuterQuotesTransform,
  tightenAllPunctuationSpacingTransform,
  tightenCommaSpacingTransform,
  tightenEllipsisTransform,
  tightenSentenceSpacingTransform,
  tightenSlashSpacingTransform,
  trimLeadingPhrasesTransform,
  trimWordsTransform
} = require('../text-slot-patcher');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT_ROOT = path.join(REPO_ROOT, 'alshark-project');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'disks');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'ALSHARK-PATCHED-HW');
const ARTIFACT_ROOT = path.join(PROJECT_ROOT, 'output', 'ALSHARK-PATCHED-HW-ARTIFACTS');
const TRANSLATED_DIR = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV');
const EXTRACTED_DIR = path.join(PROJECT_ROOT, 'data', 'ALSHARK-EXTRACTED-REV');
const TRANSLATIONS_FILE = path.join(TRANSLATED_DIR, 'translations.json');

const PATCH_TARGETS = [
  {
    key: 'System',
    filename: 'Alshark (System disk).hdm',
    minOffset: 0x50000
  },
  {
    key: 'Opening',
    filename: 'Alshark (Opening disk).hdm',
    minOffset: 0x2400
  },
  {
    key: 'Ending',
    filename: 'Alshark (Ending disk).hdm',
    minOffset: 0x2400
  },
  {
    key: 'Visual',
    filename: 'Alshark (Visual disk).hdm',
    minOffset: 0x2400
  }
];

const PASSTHROUGH_FILES = [
  'Alshark (Data disk).hdm',
  'Alshark (User disk).hdm'
];

const REQUIRED_FILES = [
  ...PATCH_TARGETS.map((target) => target.filename),
  ...PASSTHROUGH_FILES
];

const PROTECTED_RANGES = Object.fromEntries(
  REQUIRED_FILES.map((fileName) => [
    fileName,
    [
      { label: 'boot-sector', start: 0x0000, end: 0x0200 },
      { label: 'fat-area', start: 0x0200, end: 0x2400 }
    ]
  ])
);

function caseAware(lower, capitalized) {
  return (match) => (/^[A-Z]/.test(match) ? capitalized : lower);
}

const ALSHARK_FIT_OPTIONS = {
  reservedCharactersPattern: /[@#$%\\]/g,
  transforms: [
    tightenSlashSpacingTransform(),
    stripOuterQuotesTransform(),
    tightenEllipsisTransform(),
    tightenSentenceSpacingTransform({
      abbreviations: ['Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Capt', 'Cmdr', 'Lt', 'Sgt', 'Sr', 'Jr', 'St']
    }),
    tightenCommaSpacingTransform(),
    tightenAllPunctuationSpacingTransform({
      abbreviations: ['Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Capt', 'Cmdr', 'Lt', 'Sgt', 'Sr', 'Jr', 'St']
    }),
    sequentialReplacementTransform('contractions-and-short-forms', [
      { pattern: /\byou are\b/gi, replace: caseAware('you\'re', 'You\'re') },
      { pattern: /\bwe are\b/gi, replace: caseAware('we\'re', 'We\'re') },
      { pattern: /\bthey are\b/gi, replace: caseAware('they\'re', 'They\'re') },
      { pattern: /\bI am\b/g, replace: 'I\'m' },
      { pattern: /\bI will\b/g, replace: 'I\'ll' },
      { pattern: /\bwe will\b/gi, replace: caseAware('we\'ll', 'We\'ll') },
      { pattern: /\bthey will\b/gi, replace: caseAware('they\'ll', 'They\'ll') },
      { pattern: /\bit is\b/gi, replace: caseAware('it\'s', 'It\'s') },
      { pattern: /\bthat is\b/gi, replace: caseAware('that\'s', 'That\'s') },
      { pattern: /\bthere is\b/gi, replace: caseAware('there\'s', 'There\'s') },
      { pattern: /\bdo not\b/gi, replace: caseAware('don\'t', 'Don\'t') },
      { pattern: /\bdoes not\b/gi, replace: caseAware('doesn\'t', 'Doesn\'t') },
      { pattern: /\bdid not\b/gi, replace: caseAware('didn\'t', 'Didn\'t') },
      { pattern: /\bcannot\b/gi, replace: caseAware('can\'t', 'Can\'t') },
      { pattern: /\bwill not\b/gi, replace: caseAware('won\'t', 'Won\'t') },
      { pattern: /\bwould not\b/gi, replace: caseAware('wouldn\'t', 'Wouldn\'t') },
      { pattern: /\bcould not\b/gi, replace: caseAware('couldn\'t', 'Couldn\'t') },
      { pattern: /\bshould not\b/gi, replace: caseAware('shouldn\'t', 'Shouldn\'t') },
      { pattern: /\bI have to\b/gi, replace: caseAware('I must', 'I must') },
      { pattern: /\byou have to\b/gi, replace: caseAware('you must', 'You must') },
      { pattern: /\bwe have to\b/gi, replace: caseAware('we must', 'We must') },
      { pattern: /\bthey have to\b/gi, replace: caseAware('they must', 'They must') },
      { pattern: /\bcredits?\b/gi, replace: caseAware('cr', 'CR') }
    ]),
    trimLeadingPhrasesTransform(['Well now, ', 'Well, ', 'Now, ', 'Hey, ', 'Look, ', 'Listen, ', 'Please, ']),
    trimWordsTransform(['really', 'very', 'quite', 'actually', 'basically', 'just']),
    replaceAndWithAmpersandTransform()
  ]
};

function loadTranslations() {
  if (!fs.existsSync(TRANSLATIONS_FILE)) {
    throw new Error(`Translations file not found: ${TRANSLATIONS_FILE}`);
  }

  const data = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8'));
  const translations = Array.isArray(data.translations) ? data.translations : [];
  const byDisk = {};

  for (const entry of translations) {
    const disk = entry.disk || 'UNKNOWN';
    byDisk[disk] = (byDisk[disk] || 0) + 1;
  }

  return {
    translations,
    summary: {
      sourcePath: TRANSLATIONS_FILE,
      translatedAt: data.translated || null,
      totalTranslations: translations.length,
      byDisk
    }
  };
}

function patchDisk(context) {
  const originalBuffer = fs.readFileSync(context.sourcePath);
  const outputBuffer = Buffer.from(originalBuffer);
  let patched = 0;
  let skipped = 0;
  let truncated = 0;
  let fitAdjusted = 0;
  const errors = [];
  const skippedEntries = [];
  const truncatedEntries = [];
  const fitAdjustedEntries = [];

  for (const entry of context.translations) {
    if (entry.offset < context.target.minOffset) {
      skipped++;
      skippedEntries.push({
        id: entry.id,
        offset: entry.offset,
        offsetHex: `0x${entry.offset.toString(16)}`,
        reason: 'below-min-offset'
      });
      continue;
    }
    if (entry.translation === '[ERROR]' || entry.translation === '[EMPTY]') {
      skipped++;
      skippedEntries.push({
        id: entry.id,
        offset: entry.offset,
        offsetHex: `0x${entry.offset.toString(16)}`,
        reason: entry.translation === '[ERROR]' ? 'translation-error' : 'translation-empty'
      });
      continue;
    }
    if (!entry.maxBytes || entry.maxBytes < 6) {
      skipped++;
      skippedEntries.push({
        id: entry.id,
        offset: entry.offset,
        offsetHex: `0x${entry.offset.toString(16)}`,
        reason: 'insufficient-max-bytes',
        maxBytes: entry.maxBytes || 0
      });
      continue;
    }

    try {
      const patch = buildControlSafePatch({
        originalBuffer,
        offset: entry.offset,
        maxBytes: entry.maxBytes,
        translation: entry.translation,
        fitOptions: ALSHARK_FIT_OPTIONS
      });
      if (!patch) {
        skipped++;
        skippedEntries.push({
          id: entry.id,
          offset: entry.offset,
          offsetHex: `0x${entry.offset.toString(16)}`,
          reason: 'no-replaceable-text-slots'
        });
        continue;
      }

      patch.region.copy(outputBuffer, entry.offset, 0, patch.region.length);
      if (entry.offset + patch.length < outputBuffer.length) {
        outputBuffer[entry.offset + patch.length] = 0x00;
      }

      if (patch.fit && patch.fit.adjusted) {
        fitAdjusted++;
        fitAdjustedEntries.push({
          id: entry.id,
          offset: entry.offset,
          offsetHex: `0x${entry.offset.toString(16)}`,
          capacity: patch.capacity,
          originalLength: patch.fit.originalLength,
          finalLength: patch.fit.finalLength,
          savedBytes: patch.fit.savedBytes,
          strategies: patch.fit.appliedStrategies,
          translationPreview: String(entry.translation || '').slice(0, 80),
          fittedPreview: String(patch.fit.text || '').slice(0, 80)
        });
      }

      if (patch.truncated) {
        truncated++;
        truncatedEntries.push({
          id: entry.id,
          offset: entry.offset,
          offsetHex: `0x${entry.offset.toString(16)}`,
          capacity: patch.capacity,
          maxBytes: entry.maxBytes,
          originalLength: patch.fit ? patch.fit.originalLength : null,
          preTruncateLength: patch.fit ? patch.fit.preTruncateLength : null,
          finalLength: patch.fit ? patch.fit.finalLength : null,
          overflowBytes: patch.fit ? patch.fit.overflowBytes : null,
          savedBytes: patch.fit ? patch.fit.savedBytes : null,
          strategies: patch.fit ? patch.fit.appliedStrategies : [],
          sourcePreview: String(entry.source || '').slice(0, 80),
          translationPreview: String(entry.translation || '').slice(0, 80),
          fittedPreview: patch.fit ? String(patch.fit.text || '').slice(0, 80) : ''
        });
      }
      patched++;
    } catch (error) {
      errors.push(`${context.target.key}@0x${entry.offset.toString(16)}: ${error.message}`);
      skipped++;
      skippedEntries.push({
        id: entry.id,
        offset: entry.offset,
        offsetHex: `0x${entry.offset.toString(16)}`,
        reason: 'patch-error',
        error: error.message
      });
    }
  }

  fs.writeFileSync(context.outputPath, outputBuffer);

  return {
    patched,
    skipped,
    truncated,
    fitAdjusted,
    errors,
    skippedEntries,
    truncatedEntries,
    fitAdjustedEntries
  };
}

function normalizeEnglishSample(text) {
  return text
    .replace(/#[A-Z][0-9A-Z]*/g, ' ')
    .replace(/![0-9A-Z@_#]/g, ' ')
    .replace(/0_/g, ' ')
    .replace(/@/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateRun(context) {
  const report = validatePatchSet({
    sourceDir: SOURCE_DIR,
    outputDir: OUTPUT_DIR,
    requiredFiles: REQUIRED_FILES,
    identicalFiles: PASSTHROUGH_FILES,
    protectedRangesByFile: PROTECTED_RANGES
  });

  const translationState = context.translationState || loadTranslations();
  const systemDiskPath = path.join(OUTPUT_DIR, 'Alshark (System disk).hdm');
  const samples = [];

  if (fs.existsSync(systemDiskPath)) {
    const systemBuffer = fs.readFileSync(systemDiskPath);
    const sampleTranslations = translationState.translations
      .filter((entry) => entry.disk === 'System' && entry.translation && entry.translation !== '[ERROR]' && entry.translation !== '[EMPTY]')
      .slice(0, 3);

    for (const entry of sampleTranslations) {
      const rawText = readNullTerminatedAscii(systemBuffer, entry.offset, entry.maxBytes);
      const normalized = normalizeEnglishSample(rawText);
      const preview = normalized.slice(0, 30);
      const passed = preview.length > 0 && /^[A-Za-z0-9\s.,!?'"():\-]+$/.test(preview);
      samples.push({
        offset: entry.offset,
        offsetHex: `0x${entry.offset.toString(16)}`,
        passed,
        preview
      });
      if (!passed) {
        report.valid = false;
      }
    }
  } else {
    report.valid = false;
  }

  report.summary.sampleChecks = samples.length;
  report.summary.sampleFailures = samples.filter((sample) => !sample.passed).length;
  report.samples = samples;

  return report;
}

module.exports = {
  id: 'alshark',
  displayName: 'ALSHARK PC-98',
  sourceDir: SOURCE_DIR,
  outputDir: OUTPUT_DIR,
  artifactRoot: ARTIFACT_ROOT,
  translationArtifacts: [
    TRANSLATIONS_FILE,
    path.join(TRANSLATED_DIR, 'checkpoint.json'),
    path.join(TRANSLATED_DIR, 'gemini-pro-checkpoint.json'),
    path.join(TRANSLATED_DIR, 'gemma3-checkpoint.json'),
    path.join(TRANSLATED_DIR, 'google-checkpoint.json'),
    path.join(TRANSLATED_DIR, 'woolsey-checkpoint.json'),
    path.join(REPO_ROOT, 'ALSHARK-ALL-LINES.csv'),
    path.join(EXTRACTED_DIR, 'alshark-canonical-clean.csv'),
    path.join(EXTRACTED_DIR, 'applied-translations.csv'),
    path.join(EXTRACTED_DIR, 'translation-coverage-report.json')
  ],
  patchTargets: PATCH_TARGETS,
  passthroughFiles: PASSTHROUGH_FILES,
  loadTranslations,
  patchDisk,
  validateRun,
  buildControlSafePatch
};
