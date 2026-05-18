import * as iconv from 'iconv-lite';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  encodePatchText,
  type TranslationPatchEntry,
  type TranslationPatchReport,
  type TranslationPatchReportEntry,
  type TranslationPatchScript
} from '../webview/translationProject';

export interface CleanPatchEntryApplyResult {
  status: 'applied' | 'skipped';
  reason?: string;
  verified?: boolean;
}

export interface CleanPatchApplyOptions {
  createdAt?: string;
  patchSourcePath?: string;
}

export function normalizeCleanPatchScript(rawScript: unknown): TranslationPatchScript | undefined {
  if (!isRecord(rawScript) || rawScript.publicSafe !== true || !Array.isArray(rawScript.entries)) {
    return undefined;
  }
  if (!isRecord(rawScript.contents) || rawScript.contents.includesOriginalSourceText !== false) {
    return undefined;
  }
  if (rawScript.contents.includesOriginalSourceBytes !== false) {
    return undefined;
  }

  const entries: TranslationPatchEntry[] = [];
  for (const rawEntry of rawScript.entries) {
    const entry = normalizeCleanPatchEntry(rawEntry);
    if (entry) {
      entries.push(entry);
    }
  }

  const patchVersion = Number(rawScript.patchVersion);

  return {
    appName: typeof rawScript.appName === 'string' ? rawScript.appName : 'DiskScribe2026',
    patchVersion: Number.isInteger(patchVersion) ? patchVersion : 1,
    sourcePath: typeof rawScript.sourcePath === 'string' ? rawScript.sourcePath : '',
    sourceName: typeof rawScript.sourceName === 'string' ? rawScript.sourceName : 'clean-translation-patch',
    exportedAt: typeof rawScript.exportedAt === 'string' ? rawScript.exportedAt : '',
    publicSafe: true,
    contents: {
      includesOriginalSourceText: false,
      includesOriginalSourceBytes: false,
      includesReplacementBytes: true
    },
    entries
  };
}

export function enrichCleanPatchScriptForExport(rawScript: unknown): TranslationPatchScript | undefined {
  const patchScript = normalizeCleanPatchScript(rawScript);
  if (!patchScript) {
    return undefined;
  }

  return {
    ...patchScript,
    entries: patchScript.entries.map((entry) => {
      const byteLength = entry.end - entry.start + 1;
      const encoded = encodePatchTextForPatch(entry.translatedText, entry.encoding);
      const fitsOriginalRange = encoded.bytes !== undefined && encoded.bytes.length <= byteLength;
      return {
        ...entry,
        replacementBytes: encoded.bytes,
        byteLength,
        fitsOriginalRange,
        patchable: encoded.bytes !== undefined && fitsOriginalRange,
        reason: encoded.reason || (fitsOriginalRange ? undefined : 'Translation does not fit in the original byte range.')
      };
    })
  };
}

export async function applyCleanPatchEntry(
  outputPath: string,
  entry: TranslationPatchEntry
): Promise<CleanPatchEntryApplyResult> {
  const byteLength = entry.end - entry.start + 1;
  if (byteLength <= 0) {
    return { status: 'skipped', reason: 'Patch range is invalid.' };
  }
  if (!Array.isArray(entry.replacementBytes)) {
    return { status: 'skipped', reason: 'Patch entry does not include replacement bytes.' };
  }
  if (entry.replacementBytes.length > byteLength) {
    return { status: 'skipped', reason: 'Replacement bytes do not fit in original range.' };
  }
  if (entry.replacementBytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    return { status: 'skipped', reason: 'Replacement bytes contain invalid values.' };
  }

  const handle = await fs.open(outputPath, 'r+');
  try {
    const current = Buffer.alloc(byteLength);
    await handle.read(current, 0, byteLength, entry.start);
    if (entry.sourceVerification) {
      const verificationBytes = current.subarray(0, entry.sourceVerification.byteLength);
      const actualHash = hashFnv1a32Buffer(verificationBytes);
      if (
        entry.sourceVerification.algorithm !== 'fnv1a32' ||
        entry.sourceVerification.byteLength > byteLength ||
        actualHash !== entry.sourceVerification.hash
      ) {
        return { status: 'skipped', reason: 'Source fingerprint does not match expected image.' };
      }
    }

    const replacement = Buffer.alloc(byteLength, 0x20);
    Buffer.from(entry.replacementBytes).copy(replacement, 0, 0, entry.replacementBytes.length);
    await handle.write(replacement, 0, replacement.length, entry.start);
    const verifyBuffer = Buffer.alloc(byteLength);
    await handle.read(verifyBuffer, 0, byteLength, entry.start);
    return { status: 'applied', verified: verifyBuffer.equals(replacement) };
  } finally {
    await handle.close();
  }
}

export async function applyCleanPatchScriptToImages(
  patchScript: TranslationPatchScript,
  sourcePaths: string[],
  outputFolder: string,
  options: CleanPatchApplyOptions = {}
): Promise<TranslationPatchReport> {
  await fs.mkdir(outputFolder, { recursive: true });

  const sourceFilesByName = new Map<string, string>();
  for (const sourcePath of sourcePaths) {
    sourceFilesByName.set(path.basename(sourcePath).toLowerCase(), sourcePath);
  }

  const sourceToOutput = new Map<string, string>();
  const reportEntries: TranslationPatchReportEntry[] = [];
  for (const entry of patchScript.entries) {
    if (!entry.patchable) {
      reportEntries.push(
        toCleanPatchReportEntry(entry, 'skipped', undefined, entry.reason || 'Patch entry is not marked patchable.')
      );
      continue;
    }

    const sourcePath = sourceFilesByName.get(path.basename(entry.sourcePath).toLowerCase());
    if (!sourcePath) {
      reportEntries.push(toCleanPatchReportEntry(entry, 'skipped', undefined, 'Matching source image was not selected.'));
      continue;
    }

    let outputPath = sourceToOutput.get(sourcePath);
    if (!outputPath) {
      outputPath = await copySourceToUniqueOutput(sourcePath, outputFolder, sourceToOutput.size);
      sourceToOutput.set(sourcePath, outputPath);
    }

    const result = await applyCleanPatchEntry(outputPath, entry);
    reportEntries.push(toCleanPatchReportEntry(entry, result.status, outputPath, result.reason, result.verified));
  }

  const appliedCount = reportEntries.filter((entry) => entry.status === 'applied').length;
  const skippedCount = reportEntries.length - appliedCount;
  const verifiedCount = reportEntries.filter((entry) => entry.verified === true).length;
  const report: TranslationPatchReport = {
    appName: 'DiskScribe2026',
    patchVersion: patchScript.patchVersion,
    sourceName: patchScript.sourceName,
    patchSourcePath: options.patchSourcePath,
    sourceFileCount: sourcePaths.length,
    patchableEntryCount: patchScript.entries.filter((entry) => entry.patchable).length,
    outputFolder,
    createdAt: options.createdAt || new Date().toISOString(),
    appliedCount,
    skippedCount,
    verifiedCount,
    entries: reportEntries
  };
  await fs.writeFile(path.join(outputFolder, 'patch-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report;
}

export function encodePatchTextForPatch(text: string, encoding: string): { bytes?: number[]; reason?: string } {
  const normalized = encoding.toLowerCase();
  if (
    normalized === 'pc98-cp932' ||
    normalized === 'pc98-shift-jis' ||
    normalized === 'pc88-shift-jis' ||
    normalized === 'shift-jis' ||
    normalized === 'shift_jis' ||
    normalized === 'cp932' ||
    normalized === 'windows-31j'
  ) {
    return { bytes: Array.from(iconv.encode(text, 'shift_jis')) };
  }
  return encodePatchText(text, encoding);
}

export function hashFnv1a32Buffer(bytes: Buffer): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function toCleanPatchReportEntry(
  entry: TranslationPatchEntry,
  status: 'applied' | 'skipped',
  outputPath?: string,
  reason?: string,
  verified?: boolean
): TranslationPatchReportEntry {
  return {
    id: entry.id,
    sourcePath: entry.sourcePath,
    outputPath,
    start: entry.start,
    end: entry.end,
    status,
    verified,
    reason
  };
}

async function copySourceToUniqueOutput(sourcePath: string, outputFolder: string, index: number): Promise<string> {
  const outputPath = uniqueOutputPath(outputFolder, path.basename(sourcePath), index);
  await fs.copyFile(sourcePath, outputPath);
  return outputPath;
}

function uniqueOutputPath(outputFolder: string, fileName: string, index: number): string {
  const candidate = path.join(outputFolder, sanitizeFileName(fileName));
  if (!fileExists(candidate)) {
    return candidate;
  }
  const parsed = path.parse(fileName);
  return path.join(outputFolder, `${sanitizeFileName(parsed.name)}-${index + 1}${parsed.ext}`);
}

function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

function sanitizeFileName(fileName: string): string {
  return (
    Array.from(fileName)
      .map((char) => {
        const code = char.charCodeAt(0);
        return code < 0x20 || '<>:"/\\|?*'.includes(char) ? '_' : char;
      })
      .join('')
      .trim() || 'patched-image.bin'
  );
}

function normalizeCleanPatchEntry(rawEntry: unknown): TranslationPatchEntry | undefined {
  if (!isRecord(rawEntry)) {
    return undefined;
  }
  const start = Math.floor(Number(rawEntry.start));
  const end = Math.floor(Number(rawEntry.end));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return undefined;
  }
  const replacementBytes = Array.isArray(rawEntry.replacementBytes)
    ? rawEntry.replacementBytes.map((byte) => Number(byte))
    : undefined;
  const rawByteLength = Number(rawEntry.byteLength);
  return {
    id: typeof rawEntry.id === 'string' ? rawEntry.id : `patch:${start.toString(16)}-${end.toString(16)}`,
    sourcePath: typeof rawEntry.sourcePath === 'string' ? rawEntry.sourcePath : '',
    mode: rawEntry.mode === 'disk' ? 'disk' : 'raw',
    start,
    end,
    encoding: typeof rawEntry.encoding === 'string' ? rawEntry.encoding : 'ascii',
    translatedText: typeof rawEntry.translatedText === 'string' ? rawEntry.translatedText : '',
    replacementBytes,
    byteLength: Number.isInteger(rawByteLength) ? rawByteLength : end - start + 1,
    sourceVerification: normalizeSourceVerification(rawEntry.sourceVerification),
    fitsOriginalRange: rawEntry.fitsOriginalRange === true,
    patchable: rawEntry.patchable === true,
    reason: typeof rawEntry.reason === 'string' ? rawEntry.reason : undefined
  };
}

function normalizeSourceVerification(value: unknown): TranslationPatchEntry['sourceVerification'] {
  if (!isRecord(value)) {
    return undefined;
  }
  const byteLength = Math.floor(Number(value.byteLength));
  if (value.algorithm !== 'fnv1a32' || !Number.isFinite(byteLength) || byteLength < 0) {
    return undefined;
  }
  if (typeof value.hash !== 'string' || !/^[0-9a-f]{8}$/i.test(value.hash)) {
    return undefined;
  }
  return {
    algorithm: 'fnv1a32',
    byteLength,
    hash: value.hash.toLowerCase()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
