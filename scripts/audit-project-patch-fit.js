const fs = require('fs');
const path = require('path');
const { getPatchProfile } = require('./lib/patch-profiles');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveReportInput(argument) {
  const value = String(argument || '').trim();
  if (!value) {
    return null;
  }

  const asPath = path.resolve(value);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    return {
      reportPath: asPath,
      profile: null
    };
  }

  const profile = getPatchProfile(value);
  const reportPath = findLatestPatchReport(profile);
  return {
    reportPath,
    profile
  };
}

function findLatestPatchReport(profile) {
  const artifactRoot = profile.artifactRoot;
  if (!fs.existsSync(artifactRoot)) {
    throw new Error(`Artifact root not found: ${artifactRoot}`);
  }

  const reportCandidates = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${profile.id}-`))
    .map((entry) => path.join(artifactRoot, entry.name, 'patch-report.json'))
    .filter((reportPath) => fs.existsSync(reportPath))
    .sort();

  if (!reportCandidates.length) {
    throw new Error(`No patch reports found under ${artifactRoot}`);
  }

  return reportCandidates[reportCandidates.length - 1];
}

function compareTruncationPriority(left, right) {
  return (right.overflowBytes || 0) - (left.overflowBytes || 0) ||
    (right.originalLength || 0) - (left.originalLength || 0) ||
    String(left.id || '').localeCompare(String(right.id || ''));
}

function buildDiskSummary(disk) {
  const truncatedEntries = Array.isArray(disk.truncatedEntries) ? disk.truncatedEntries : [];
  const fitAdjustedEntries = Array.isArray(disk.fitAdjustedEntries) ? disk.fitAdjustedEntries : [];
  const topEntries = truncatedEntries
    .map((entry) => ({
      id: entry.id,
      offsetHex: entry.offsetHex,
      capacity: entry.capacity,
      originalLength: entry.originalLength,
      preTruncateLength: entry.preTruncateLength,
      finalLength: entry.finalLength,
      overflowBytes: entry.overflowBytes,
      savedBytes: entry.savedBytes,
      strategies: entry.strategies,
      sourcePreview: entry.sourcePreview,
      translationPreview: entry.translationPreview,
      fittedPreview: entry.fittedPreview
    }))
    .sort(compareTruncationPriority)
    .slice(0, 25);

  return {
    disk: disk.disk,
    patched: disk.patched || 0,
    skipped: disk.skipped || 0,
    truncated: disk.truncated || 0,
    fitAdjusted: disk.fitAdjusted || 0,
    topEntries,
    topAdjustedEntries: fitAdjustedEntries.slice(0, 10)
  };
}

function buildAudit(reportPath, report) {
  const diskSummaries = (report.diskResults || []).map(buildDiskSummary);
  const topTruncations = diskSummaries
    .flatMap((disk) => disk.topEntries.map((entry) => ({ ...entry, disk: disk.disk })))
    .sort(compareTruncationPriority)
    .slice(0, 50);

  return {
    createdAt: new Date().toISOString(),
    reportPath,
    artifactDir: report.artifactDir,
    profileId: report.profileId,
    displayName: report.displayName,
    totals: report.totals || {},
    byDisk: diskSummaries,
    topTruncations
  };
}

function main() {
  const input = resolveReportInput(process.argv[2] || 'alshark');
  const reportPath = input ? input.reportPath : findLatestPatchReport(getPatchProfile('alshark'));
  const report = readJson(reportPath);
  const audit = buildAudit(reportPath, report);
  const outputPath = path.join(path.dirname(reportPath), 'patch-fit-audit.json');

  fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));

  console.log(`Patch fit audit: ${outputPath}`);
  console.log(`Totals: patched ${audit.totals.patched || 0}, fit-adjusted ${audit.totals.fitAdjusted || 0}, truncated ${audit.totals.truncated || 0}, skipped ${audit.totals.skipped || 0}`);
  for (const disk of audit.byDisk) {
    console.log(`[${disk.disk}] truncated ${disk.truncated} | fit-adjusted ${disk.fitAdjusted} | skipped ${disk.skipped}`);
  }
}

main();
