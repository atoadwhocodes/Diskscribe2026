import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  applyCleanPatchScriptToImages,
  normalizeCleanPatchScript
} from './translationPatchApply';

export interface CleanPatchCliStreams {
  stdout?: { write(text: string): void };
  stderr?: { write(text: string): void };
}

interface CleanPatchCliOptions {
  patchPath: string;
  sourcePaths: string[];
  outputFolder: string;
  dryRun: boolean;
}

export async function runCleanPatchCli(argv: string[], streams: CleanPatchCliStreams = {}): Promise<number> {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  const parsed = parseCleanPatchArgs(argv);
  if (parsed.help) {
    stdout.write(`${formatCleanPatchHelp()}\n`);
    return 0;
  }
  if (parsed.error || !parsed.options) {
    stderr.write(`${parsed.error || 'Missing required arguments.'}\n\n${formatCleanPatchHelp()}\n`);
    return 2;
  }

  try {
    const patchText = await fs.readFile(parsed.options.patchPath, 'utf8');
    const patchScript = normalizeCleanPatchScript(JSON.parse(patchText));
    if (!patchScript) {
      stderr.write('Selected JSON is not a DiskScribe2026 clean translation patch.\n');
      return 2;
    }

    const report = await applyCleanPatchScriptToImages(
      patchScript,
      parsed.options.sourcePaths,
      parsed.options.outputFolder,
      { patchSourcePath: parsed.options.patchPath, dryRun: parsed.options.dryRun }
    );
    const verb = parsed.options.dryRun ? 'Validated' : 'Applied';
    stdout.write(
      [
        `${verb} clean patch: ${report.appliedCount} applied, ${report.verifiedCount} verified, ${report.skippedCount} skipped.`,
        report.warnings && report.warnings.length > 0 ? `Warnings: ${report.warnings.join('; ')}` : '',
        `Output folder: ${report.outputFolder}`,
        parsed.options.dryRun ? '' : `Report: ${path.join(report.outputFolder, 'patch-report.json')}`
      ].filter(Boolean).join('\n') + '\n'
    );
    return report.skippedCount === 0 && (!report.warnings || report.warnings.length === 0) ? 0 : 1;
  } catch (error: unknown) {
    stderr.write(`${toErrorMessage(error)}\n`);
    return 1;
  }
}

export function formatCleanPatchHelp(): string {
  return [
    'Usage:',
    '  npm run apply-clean-patch -- --patch <patch.json> --source <image> [--source <image> ...] --out <folder>',
    '',
    'Options:',
    '  --patch, -p    Clean translation patch JSON exported by DiskScribe2026.',
    '  --source, -s   User-owned source image. Repeat for multi-disc patches.',
    '  --out, -o      Output folder for patched copies and patch-report.json.',
    '  --dry-run      Validate the patch against source images without writing output.',
    '  --help, -h     Show this help.'
  ].join('\n');
}

function parseCleanPatchArgs(argv: string[]): { help?: boolean; error?: string; options?: CleanPatchCliOptions } {
  const sourcePaths: string[] = [];
  let patchPath = '';
  let outputFolder = '';
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--patch' || arg === '-p') {
      const value = readNextValue(argv, index);
      if (!value) return { error: `Missing value for ${arg}.` };
      patchPath = value;
      index += 1;
      continue;
    }
    if (arg === '--source' || arg === '-s') {
      const value = readNextValue(argv, index);
      if (!value) return { error: `Missing value for ${arg}.` };
      sourcePaths.push(value);
      index += 1;
      continue;
    }
    if (arg === '--out' || arg === '-o') {
      const value = readNextValue(argv, index);
      if (!value) return { error: `Missing value for ${arg}.` };
      outputFolder = value;
      index += 1;
      continue;
    }
    return { error: `Unknown argument: ${arg}` };
  }

  if (!patchPath) {
    return { error: 'Missing --patch <patch.json>.' };
  }
  if (sourcePaths.length === 0) {
    return { error: 'Missing at least one --source <image>.' };
  }
  if (!outputFolder && !dryRun) {
    return { error: 'Missing --out <folder>.' };
  }

  return { options: { patchPath, sourcePaths, outputFolder, dryRun } };
}

function readNextValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    return '';
  }
  return value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (require.main === module) {
  void runCleanPatchCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
