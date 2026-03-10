const fs = require('fs');
const path = require('path');

function countByteDifferences(originalBuffer, patchedBuffer) {
  if (originalBuffer.length !== patchedBuffer.length) {
    return null;
  }

  let changedBytes = 0;
  for (let i = 0; i < originalBuffer.length; i++) {
    if (originalBuffer[i] !== patchedBuffer[i]) {
      changedBytes++;
    }
  }

  return changedBytes;
}

function validatePatchSet(options) {
  const requiredFiles = Array.from(new Set(options.requiredFiles || []));
  const identicalFiles = new Set(options.identicalFiles || []);
  const protectedRangesByFile = options.protectedRangesByFile || {};

  const report = {
    valid: true,
    checkedAt: new Date().toISOString(),
    sourceDir: options.sourceDir,
    outputDir: options.outputDir,
    summary: {
      filesChecked: requiredFiles.length,
      missingFiles: 0,
      sizeMismatches: 0,
      protectedRangeFailures: 0,
      identicalFailures: 0
    },
    files: []
  };

  for (const fileName of requiredFiles) {
    const originalPath = path.join(options.sourceDir, fileName);
    const patchedPath = path.join(options.outputDir, fileName);
    const originalExists = fs.existsSync(originalPath);
    const patchedExists = fs.existsSync(patchedPath);
    const fileReport = {
      fileName,
      originalPath,
      patchedPath,
      originalExists,
      patchedExists,
      sizeMatch: false,
      originalSize: null,
      patchedSize: null,
      changedBytes: null,
      identical: identicalFiles.has(fileName) ? { required: true, passed: false } : null,
      protectedRanges: []
    };

    if (!originalExists || !patchedExists) {
      report.valid = false;
      report.summary.missingFiles++;
      report.files.push(fileReport);
      continue;
    }

    const originalBuffer = fs.readFileSync(originalPath);
    const patchedBuffer = fs.readFileSync(patchedPath);

    fileReport.originalSize = originalBuffer.length;
    fileReport.patchedSize = patchedBuffer.length;
    fileReport.sizeMatch = originalBuffer.length === patchedBuffer.length;

    if (!fileReport.sizeMatch) {
      report.valid = false;
      report.summary.sizeMismatches++;
      report.files.push(fileReport);
      continue;
    }

    fileReport.changedBytes = countByteDifferences(originalBuffer, patchedBuffer);

    if (fileReport.identical) {
      fileReport.identical.passed = originalBuffer.equals(patchedBuffer);
      if (!fileReport.identical.passed) {
        report.valid = false;
        report.summary.identicalFailures++;
      }
    }

    const protectedRanges = protectedRangesByFile[fileName] || [];
    for (const range of protectedRanges) {
      const passed = originalBuffer
        .slice(range.start, range.end)
        .equals(patchedBuffer.slice(range.start, range.end));

      fileReport.protectedRanges.push({
        label: range.label,
        start: range.start,
        end: range.end,
        passed
      });

      if (!passed) {
        report.valid = false;
        report.summary.protectedRangeFailures++;
      }
    }

    report.files.push(fileReport);
  }

  return report;
}

function readNullTerminatedAscii(buffer, offset, maxBytes) {
  const start = Math.max(0, offset);
  const limit = maxBytes
    ? Math.min(buffer.length, start + maxBytes)
    : buffer.length;
  let end = start;

  while (end < limit && buffer[end] !== 0x00) {
    end++;
  }

  return buffer.slice(start, end).toString('ascii').trim();
}

module.exports = {
  readNullTerminatedAscii,
  validatePatchSet
};
