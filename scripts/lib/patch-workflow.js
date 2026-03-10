const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function createRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function describeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    size: stat.size,
    sha256: sha256File(filePath)
  };
}

function relativeSnapshotPath(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative;
  }

  return path.basename(filePath);
}

function copySnapshotFiles(options) {
  const entries = [];
  const repoRoot = options.repoRoot;
  const filePaths = Array.from(
    new Set((options.filePaths || []).map((filePath) => path.resolve(filePath)))
  );

  ensureDirectory(options.destinationRoot);

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      entries.push({
        sourcePath: filePath,
        status: 'missing'
      });
      continue;
    }

    const relativePath = relativeSnapshotPath(repoRoot, filePath);
    const backupPath = path.join(options.destinationRoot, relativePath);

    ensureDirectory(path.dirname(backupPath));
    fs.copyFileSync(filePath, backupPath);

    const sourceInfo = describeFile(filePath);
    const backupInfo = describeFile(backupPath);
    entries.push({
      sourcePath: filePath,
      backupPath,
      relativePath,
      status: 'copied',
      size: sourceInfo ? sourceInfo.size : null,
      sha256: backupInfo ? backupInfo.sha256 : null
    });
  }

  return entries;
}

function assertPatchProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Patch profile is required');
  }

  const required = ['id', 'displayName', 'sourceDir', 'outputDir', 'artifactRoot', 'patchTargets', 'loadTranslations', 'patchDisk'];
  for (const key of required) {
    if (!profile[key]) {
      throw new Error(`Patch profile missing required field: ${key}`);
    }
  }
}

function groupTranslationsByDisk(profile, translations) {
  const getTranslationDiskKey = profile.getTranslationDiskKey || ((entry) => entry.disk);
  const byDisk = new Map();

  for (const entry of translations) {
    const diskKey = getTranslationDiskKey(entry);
    if (!diskKey) {
      continue;
    }

    if (!byDisk.has(diskKey)) {
      byDisk.set(diskKey, []);
    }

    byDisk.get(diskKey).push(entry);
  }

  return byDisk;
}

function calculateTotals(diskResults, passthroughResults) {
  return diskResults.reduce(
    (totals, result) => {
      totals.patched += result.patched || 0;
      totals.skipped += result.skipped || 0;
      totals.truncated += result.truncated || 0;
      totals.fitAdjusted += result.fitAdjusted || 0;
      totals.errors += Array.isArray(result.errors) ? result.errors.length : 0;
      return totals;
    },
    {
      patched: 0,
      skipped: 0,
      truncated: 0,
      fitAdjusted: 0,
      errors: 0,
      passthroughCopied: passthroughResults.length
    }
  );
}

function runProjectValidation(profile, options = {}) {
  assertPatchProfile(profile);

  if (typeof profile.validateRun !== 'function') {
    throw new Error(`Patch profile ${profile.id} does not provide validateRun()`);
  }

  const runRoot = options.artifactDir ||
    ensureDirectory(path.join(profile.artifactRoot, `${profile.id}-validation-${createRunId()}`));
  const report = profile.validateRun({
    artifactDir: runRoot,
    profile,
    translationState: options.translationState || null
  });
  const reportPath = path.join(runRoot, 'validation-report.json');

  writeJson(reportPath, report);

  if (!options.quiet) {
    console.log(`Validation: ${report.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Validation report: ${reportPath}`);
  }

  return {
    artifactDir: runRoot,
    report,
    reportPath
  };
}

function runProjectPatch(profile, options = {}) {
  assertPatchProfile(profile);

  const repoRoot = path.resolve(__dirname, '..', '..');
  const runId = createRunId();
  const runRoot = ensureDirectory(path.join(profile.artifactRoot, `${profile.id}-${runId}`));
  const translationBackupDir = ensureDirectory(path.join(runRoot, 'translation-backup'));
  const sourceBackupDir = ensureDirectory(path.join(runRoot, 'source-disks'));
  const translationArtifacts = profile.translationArtifacts || [];
  const passthroughFiles = profile.passthroughFiles || [];
  const sourceFiles = [
    ...profile.patchTargets.map((target) => path.join(profile.sourceDir, target.filename)),
    ...passthroughFiles.map((fileName) => path.join(profile.sourceDir, fileName))
  ];

  console.log(`=== ${profile.displayName} Safe Patch Run ===`);
  console.log(`Artifacts: ${runRoot}`);

  const translationBackup = copySnapshotFiles({
    filePaths: translationArtifacts,
    destinationRoot: translationBackupDir,
    repoRoot
  });
  console.log(`Backed up ${translationBackup.filter((entry) => entry.status === 'copied').length} translation artifacts`);

  const sourceBackups = copySnapshotFiles({
    filePaths: sourceFiles,
    destinationRoot: sourceBackupDir,
    repoRoot
  });
  console.log(`Backed up ${sourceBackups.filter((entry) => entry.status === 'copied').length} source disks`);

  ensureDirectory(profile.outputDir);

  const translationState = profile.loadTranslations();
  if (!translationState || !Array.isArray(translationState.translations)) {
    throw new Error(`Patch profile ${profile.id} returned an invalid translation set`);
  }

  const byDisk = groupTranslationsByDisk(profile, translationState.translations);
  const diskResults = [];

  for (const target of profile.patchTargets) {
    const sourcePath = path.join(profile.sourceDir, target.filename);
    const outputPath = path.join(profile.outputDir, target.filename);
    const translations = byDisk.get(target.key) || [];

    console.log(`[${target.key}] ${translations.length} translation rows`);

    if (!fs.existsSync(sourcePath)) {
      diskResults.push({
        disk: target.key,
        fileName: target.filename,
        sourcePath,
        outputPath,
        patched: 0,
        skipped: translations.length,
        truncated: 0,
        errors: [`Source disk not found: ${sourcePath}`],
        sourceFile: null,
        outputFile: null
      });
      console.log(`  Missing source disk: ${sourcePath}`);
      continue;
    }

    const result = profile.patchDisk({
      artifactDir: runRoot,
      outputPath,
      profile,
      runId,
      sourcePath,
      target,
      translations,
      translationState
    });

    result.disk = target.key;
    result.fileName = target.filename;
    result.sourcePath = sourcePath;
    result.outputPath = outputPath;
    result.sourceFile = describeFile(sourcePath);
    result.outputFile = describeFile(outputPath);
    diskResults.push(result);

    console.log(
      `  Patched: ${result.patched || 0} | Fit-adjusted: ${result.fitAdjusted || 0} | Skipped: ${result.skipped || 0} | Truncated: ${result.truncated || 0}`
    );
    if (Array.isArray(result.errors) && result.errors.length) {
      console.log(`  Errors: ${result.errors.length}`);
    }
  }

  const passthroughResults = [];
  for (const fileName of passthroughFiles) {
    const sourcePath = path.join(profile.sourceDir, fileName);
    const outputPath = path.join(profile.outputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      passthroughResults.push({
        fileName,
        sourcePath,
        outputPath,
        copied: false,
        error: `Source disk not found: ${sourcePath}`,
        sourceFile: null,
        outputFile: null
      });
      continue;
    }

    fs.copyFileSync(sourcePath, outputPath);
    passthroughResults.push({
      fileName,
      sourcePath,
      outputPath,
      copied: true,
      sourceFile: describeFile(sourcePath),
      outputFile: describeFile(outputPath)
    });
  }

  if (passthroughResults.length) {
    console.log(`Copied ${passthroughResults.filter((entry) => entry.copied).length} passthrough disks`);
  }

  let validation = null;
  let validationReportPath = null;
  if (options.validate !== false && typeof profile.validateRun === 'function') {
    const validationResult = runProjectValidation(profile, {
      artifactDir: runRoot,
      quiet: true,
      translationState
    });
    validation = validationResult.report;
    validationReportPath = validationResult.reportPath;
    console.log(`Validation: ${validation.valid ? 'PASS' : 'FAIL'}`);
  }

  const report = {
    profileId: profile.id,
    displayName: profile.displayName,
    createdAt: new Date().toISOString(),
    runId,
    artifactDir: runRoot,
    outputDir: profile.outputDir,
    translationSummary: translationState.summary || {},
    translationBackup,
    sourceBackups,
    diskResults,
    passthroughResults,
    validationReportPath,
    validation,
    totals: calculateTotals(diskResults, passthroughResults)
  };
  const reportPath = path.join(runRoot, 'patch-report.json');

  writeJson(reportPath, report);
  console.log(`Patch report: ${reportPath}`);

  return report;
}

module.exports = {
  createRunId,
  runProjectPatch,
  runProjectValidation
};
