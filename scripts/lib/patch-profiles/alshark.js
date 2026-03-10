const fs = require('fs');
const path = require('path');
const { readNullTerminatedAscii, validatePatchSet } = require('../patch-validation');

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

function isSjisLead(byteValue) {
  return (byteValue >= 0x81 && byteValue <= 0x9F) || (byteValue >= 0xE0 && byteValue <= 0xFC);
}

function isSjisTrail(byteValue) {
  return ((byteValue >= 0x40 && byteValue <= 0x7E) || (byteValue >= 0x80 && byteValue <= 0xFC)) && byteValue !== 0x7F;
}

function cleanTranslation(text) {
  return String(text || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[@#$%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findStringLength(buffer, offset, maxBytes) {
  const limit = maxBytes ? Math.min(buffer.length, offset + maxBytes) : buffer.length;
  let end = offset;

  while (end < limit && buffer[end] !== 0x00) {
    end++;
  }

  return end - offset;
}

function buildControlSafePatch(originalBuffer, offset, maxBytes, translation) {
  const length = findStringLength(originalBuffer, offset, maxBytes);
  if (length < 4) {
    return null;
  }

  const region = Buffer.from(originalBuffer.slice(offset, offset + length));
  const textSlots = [];
  let index = 0;

  while (index < length) {
    const byteValue = region[index];

    if (isSjisLead(byteValue) && index + 1 < length && isSjisTrail(region[index + 1])) {
      textSlots.push(index, index + 1);
      index += 2;
      continue;
    }

    if (byteValue >= 0xA1 && byteValue <= 0xDF) {
      textSlots.push(index);
      index++;
      continue;
    }

    if (byteValue === 0x23 && index + 1 < length) {
      const letter = region[index + 1];
      if (letter >= 0x41 && letter <= 0x5A) {
        let codeLength = 2;
        if (index + 2 < length) {
          const paramCount = region[index + 2];
          if (paramCount >= 0x01 && paramCount <= 0x0F && index + 3 + paramCount <= length) {
            codeLength = 3 + paramCount;
          }
        }
        index += codeLength;
        continue;
      }
    }

    if (byteValue === 0x21 && index + 1 < length) {
      const next = region[index + 1];
      if (next === 0x30 || next === 0x40 || next === 0x5F || next === 0x23) {
        index += 2;
        continue;
      }
    }

    if (byteValue === 0x30 && index + 1 < length && (region[index + 1] === 0x5F || region[index + 1] === 0x23)) {
      const second = region[index + 1];
      index += 2;
      if (second === 0x5F && index < length && region[index] >= 0x30 && region[index] <= 0x39) {
        index++;
      }
      continue;
    }

    if ((byteValue === 0x24 || byteValue === 0x25) && index + 1 < length) {
      index += 2;
      continue;
    }

    if (byteValue === 0x40 || byteValue < 0x20) {
      index++;
      continue;
    }

    if (byteValue >= 0x20 && byteValue <= 0x7E) {
      textSlots.push(index);
      index++;
      continue;
    }

    index++;
  }

  if (textSlots.length === 0) {
    return null;
  }

  const clean = cleanTranslation(translation);
  if (!clean) {
    return null;
  }

  const bytes = Buffer.from(clean, 'ascii');
  if (bytes.length === 0) {
    return null;
  }

  let written = 0;
  for (const slot of textSlots) {
    region[slot] = written < bytes.length ? bytes[written++] : 0x20;
  }

  return {
    region,
    length,
    capacity: textSlots.length,
    used: Math.min(bytes.length, textSlots.length),
    truncated: bytes.length > textSlots.length
  };
}

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
  const errors = [];
  const skippedEntries = [];
  const truncatedEntries = [];

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
      const patch = buildControlSafePatch(originalBuffer, entry.offset, entry.maxBytes, entry.translation);
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

      if (patch.truncated) {
        truncated++;
        truncatedEntries.push({
          id: entry.id,
          offset: entry.offset,
          offsetHex: `0x${entry.offset.toString(16)}`,
          capacity: patch.capacity,
          maxBytes: entry.maxBytes,
          sourcePreview: String(entry.source || '').slice(0, 80),
          translationPreview: String(entry.translation || '').slice(0, 80)
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
    errors,
    skippedEntries,
    truncatedEntries
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
