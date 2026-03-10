const fs = require('fs');
const path = require('path');
const { getPatchProfile } = require('./lib/patch-profiles');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveReportPath(profileOrPath) {
  const value = String(profileOrPath || 'alshark').trim();
  const explicitPath = path.resolve(value);
  if (fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
    return {
      reportPath: explicitPath,
      profile: null
    };
  }

  const profile = getPatchProfile(value);
  const artifactRoot = profile.artifactRoot;
  const candidates = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${profile.id}-`))
    .map((entry) => path.join(artifactRoot, entry.name, 'patch-report.json'))
    .filter((reportPath) => fs.existsSync(reportPath))
    .sort();

  if (!candidates.length) {
    throw new Error(`No patch reports found under ${artifactRoot}`);
  }

  return {
    reportPath: candidates[candidates.length - 1],
    profile
  };
}

function comparePriority(left, right) {
  return (right.priority.score || 0) - (left.priority.score || 0) ||
    (left.priority.tier || 99) - (right.priority.tier || 99) ||
    (right.overflowBytes || 0) - (left.overflowBytes || 0) ||
    String(left.id || '').localeCompare(String(right.id || ''));
}

function buildPrioritizedEntries(report, profile) {
  const rankEntry = profile && typeof profile.rankPatchFitEntry === 'function'
    ? profile.rankPatchFitEntry.bind(profile)
    : ((entry, context) => {
        const overflowBytes = Number(entry.overflowBytes || 0);
        return {
          tier: 4,
          tierLabel: 'Tier 4 - Unclassified',
          score: 100 + overflowBytes,
          severity: overflowBytes > 10 ? 'large' : 'small',
          rationale: `Default ranking; overflow ${overflowBytes} bytes`,
          rules: []
        };
      });

  return (report.diskResults || []).flatMap((disk) => (
    (disk.truncatedEntries || []).map((entry) => ({
      ...entry,
      disk: disk.disk,
      patched: disk.patched || 0,
      fitAdjusted: disk.fitAdjusted || 0,
      priority: rankEntry(entry, { disk: disk.disk, diskResult: disk, profile, report })
    }))
  )).sort(comparePriority);
}

function groupByTier(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = entry.priority.tier || 99;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(entry);
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
}

function summarizeTier(entries) {
  const disks = [...new Set(entries.map((entry) => entry.disk))].join(', ');
  const maxOverflow = Math.max(...entries.map((entry) => Number(entry.overflowBytes || 0)), 0);
  return { count: entries.length, disks, maxOverflow };
}

function toMarkdown(report, entries) {
  const lines = [];
  lines.push('# Patch Fit Priority List');
  lines.push('');
  lines.push(`Report: \`${report.artifactDir}\\patch-report.json\``);
  lines.push(`Generated: \`${new Date().toISOString()}\``);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Patched: ${report.totals?.patched || 0}`);
  lines.push(`- Fit-adjusted: ${report.totals?.fitAdjusted || 0}`);
  lines.push(`- Truncated: ${report.totals?.truncated || 0}`);
  lines.push(`- Skipped: ${report.totals?.skipped || 0}`);
  lines.push('');
  lines.push('## Ordered Rewrite Queue');
  lines.push('');

  let globalRank = 1;
  for (const [tier, tierEntries] of groupByTier(entries)) {
    const label = tierEntries[0].priority.tierLabel || `Tier ${tier}`;
    const summary = summarizeTier(tierEntries);
    lines.push(`### ${label}`);
    lines.push('');
    lines.push(`- Count: ${summary.count}`);
    lines.push(`- Disks: ${summary.disks}`);
    lines.push(`- Worst overflow: ${summary.maxOverflow} bytes`);
    lines.push('');

    for (const entry of tierEntries) {
      lines.push(`${globalRank}. \`${entry.id}\` [${entry.disk}] overflow ${entry.overflowBytes || 0} bytes, capacity ${entry.capacity}`);
      lines.push(`   Priority: ${entry.priority.rationale}`);
      lines.push(`   Translation: ${String(entry.translationPreview || '').trim()}`);
      lines.push(`   Fitted now: ${String(entry.fittedPreview || '').trim()}`);
      lines.push(`   Source: ${String(entry.sourcePreview || '').trim()}`);
      lines.push('');
      globalRank++;
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function main() {
  const resolved = resolveReportPath(process.argv[2] || 'alshark');
  const report = readJson(resolved.reportPath);
  const profile = resolved.profile || getPatchProfile(report.profileId || 'alshark');
  const entries = buildPrioritizedEntries(report, profile);
  const artifactDir = path.dirname(resolved.reportPath);
  const jsonPath = path.join(artifactDir, 'patch-fit-priority-list.json');
  const markdownPath = path.join(artifactDir, 'patch-fit-priority-list.md');
  const payload = {
    createdAt: new Date().toISOString(),
    reportPath: resolved.reportPath,
    profileId: report.profileId,
    totals: report.totals || {},
    entries
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(markdownPath, toMarkdown(report, entries));

  console.log(`Patch fit priority list: ${markdownPath}`);
  console.log(`Priority data: ${jsonPath}`);
  for (const [tier, tierEntries] of groupByTier(entries)) {
    const label = tierEntries[0].priority.tierLabel || `Tier ${tier}`;
    console.log(`${label}: ${tierEntries.length}`);
  }
}

main();
