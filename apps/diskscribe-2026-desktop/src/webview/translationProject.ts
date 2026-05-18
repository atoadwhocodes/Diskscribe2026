export type TranslationEntryStatus = 'raw' | 'draft' | 'reviewed' | 'final' | 'patched' | 'verified';
export type TranslationSourceQuality = 'source-good' | 'source-suspect' | 'source-garbage';
export type TranslationConfidence = 'high' | 'medium' | 'low';
export type TranslationPlaytestStatus = 'untested' | 'seen' | 'passed' | 'failed';

export interface TranslationProjectDisk {
  path: string;
  name: string;
  sizeBytes: number;
  format?: string;
  sectorSize?: number;
  geometry?: {
    cylinders: number;
    heads: number;
    sectorsPerTrack: number;
  };
  rawAnalysis?: {
    analyzedBytes: number;
    totalSectors: number;
    asciiRunCount: number;
    shiftJisRunCount: number;
    textLikeSectorCount: number;
    densestTextSectors: Array<{
      sector: number;
      offsetBytes: number;
      asciiRunCount: number;
      shiftJisRunCount: number;
      printableBytes: number;
      cylinder?: number;
      head?: number;
      sectorNumber?: number;
    }>;
  };
}

export interface TranslationProjectManifest {
  sourceFolder: string;
  disks: TranslationProjectDisk[];
  discoveredAt: string;
  discovery: {
    minLength: number;
    candidateCount: number;
    duplicateCount: number;
  };
}

export interface TranslationEntry {
  id: string;
  sourcePath: string;
  mode: 'disk' | 'raw';
  start: number;
  end: number;
  encoding: string;
  sourceText: string;
  translatedText: string;
  status: TranslationEntryStatus;
  notes: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
  score?: number;
  batch?: string;
  translator?: string;
  reviewer?: string;
  sourceQuality?: TranslationSourceQuality;
  confidence?: TranslationConfidence;
  machineDraft?: string;
  backTranslation?: string;
  reviewerNotes?: string;
  glossaryKey?: string;
  needsHumanReview?: boolean;
  playtestStatus?: TranslationPlaytestStatus;
  playtestNotes?: string;
  sourceBytesBase64?: string;
  sourceFilePath?: string;
  bankId?: string;
  reviewSample?: boolean;
  updatedAt: string;
}

export interface TranslationProject {
  appName: string;
  projectVersion: number;
  sourcePath: string;
  sourceName: string;
  manifest?: TranslationProjectManifest;
  exportedAt?: string;
  entries: TranslationEntry[];
}

export interface TranslationPatchEntry {
  id: string;
  sourcePath: string;
  mode: 'disk' | 'raw';
  start: number;
  end: number;
  encoding: string;
  translatedText: string;
  replacementBytes: number[] | undefined;
  byteLength: number;
  sourceVerification?: TranslationSourceVerification;
  fitsOriginalRange: boolean;
  patchable: boolean;
  reason?: string;
}

export interface TranslationSourceVerification {
  algorithm: 'fnv1a32';
  byteLength: number;
  hash: string;
}

export interface TranslationPatchScript {
  appName: string;
  patchVersion: number;
  sourcePath: string;
  sourceName: string;
  exportedAt: string;
  publicSafe: true;
  contents: {
    includesOriginalSourceText: false;
    includesOriginalSourceBytes: false;
    includesReplacementBytes: true;
  };
  entries: TranslationPatchEntry[];
}

export interface TranslationPatchReportEntry {
  id: string;
  sourcePath: string;
  outputPath?: string;
  start: number;
  end: number;
  status: 'applied' | 'skipped';
  verified?: boolean;
  reason?: string;
}

export interface TranslationPatchReport {
  appName: string;
  patchVersion: number;
  sourceName: string;
  patchSourcePath?: string;
  sourceFileCount?: number;
  patchableEntryCount?: number;
  outputFolder: string;
  createdAt: string;
  appliedCount: number;
  skippedCount: number;
  verifiedCount: number;
  entries: TranslationPatchReportEntry[];
}

export const TRANSLATION_PROJECT_VERSION = 1;
export const TRANSLATION_PATCH_VERSION = 1;

export function makeTranslationEntryId(
  mode: 'disk' | 'raw',
  start: number,
  end: number,
  sourcePath = ''
): string {
  const range = `${mode}:${Math.max(0, start).toString(16)}-${Math.max(0, end).toString(16)}`;
  return sourcePath ? `${sourcePath}::${range}` : range;
}

export function normalizeTranslationEntries(value: unknown): TranslationEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries = new Map<string, TranslationEntry>();
  for (const raw of value) {
    if (!isRecord(raw)) {
      continue;
    }

    const mode = raw.mode === 'raw' ? 'raw' : 'disk';
    const start = normalizeOffset(raw.start);
    const end = normalizeOffset(raw.end);
    if (end < start) {
      continue;
    }

    const id =
      typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : makeTranslationEntryId(mode, start, end);
    const entry: TranslationEntry = {
      id,
      sourcePath: typeof raw.sourcePath === 'string' ? raw.sourcePath : '',
      mode,
      start,
      end,
      encoding: typeof raw.encoding === 'string' ? raw.encoding : 'pc98-cp932',
      sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : '',
      translatedText: typeof raw.translatedText === 'string' ? raw.translatedText : '',
      status: normalizeStatus(raw.status),
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      category: typeof raw.category === 'string' ? raw.category : undefined,
      priority: normalizePriority(raw.priority),
      score: normalizeOptionalNumber(raw.score),
      batch: typeof raw.batch === 'string' ? raw.batch : undefined,
      translator: typeof raw.translator === 'string' ? raw.translator : undefined,
      reviewer: typeof raw.reviewer === 'string' ? raw.reviewer : undefined,
      sourceQuality: normalizeSourceQuality(raw.sourceQuality),
      confidence: normalizeConfidence(raw.confidence),
      machineDraft: typeof raw.machineDraft === 'string' ? raw.machineDraft : undefined,
      backTranslation: typeof raw.backTranslation === 'string' ? raw.backTranslation : undefined,
      reviewerNotes: typeof raw.reviewerNotes === 'string' ? raw.reviewerNotes : undefined,
      glossaryKey: typeof raw.glossaryKey === 'string' ? raw.glossaryKey : undefined,
      needsHumanReview: raw.needsHumanReview === true ? true : undefined,
      playtestStatus: normalizePlaytestStatus(raw.playtestStatus),
      playtestNotes: typeof raw.playtestNotes === 'string' ? raw.playtestNotes : undefined,
      sourceBytesBase64: typeof raw.sourceBytesBase64 === 'string' ? raw.sourceBytesBase64 : undefined,
      sourceFilePath: typeof raw.sourceFilePath === 'string' ? raw.sourceFilePath : undefined,
      bankId: typeof raw.bankId === 'string' ? raw.bankId : undefined,
      reviewSample: raw.reviewSample === true ? true : undefined,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    };
    entries.set(entry.id, entry);
  }

  return [...entries.values()].sort(compareTranslationEntries);
}

export function buildTranslationProject(
  appName: string,
  sourcePath: string,
  sourceName: string,
  entries: TranslationEntry[],
  exportedAt = new Date().toISOString(),
  manifest?: TranslationProjectManifest
): TranslationProject {
  return {
    appName,
    projectVersion: TRANSLATION_PROJECT_VERSION,
    sourcePath,
    sourceName,
    manifest,
    exportedAt,
    entries: normalizeTranslationEntries(entries)
  };
}

export function mergeTranslationEntries(
  currentEntries: TranslationEntry[],
  importedEntries: TranslationEntry[]
): TranslationEntry[] {
  const byId = new Map<string, TranslationEntry>();
  for (const entry of normalizeTranslationEntries(currentEntries)) {
    byId.set(entry.id, entry);
  }
  for (const entry of normalizeTranslationEntries(importedEntries)) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(compareTranslationEntries);
}

export function buildPatchScript(
  appName: string,
  sourcePath: string,
  sourceName: string,
  entries: TranslationEntry[],
  exportedAt = new Date().toISOString()
): TranslationPatchScript {
  return {
    appName,
    patchVersion: TRANSLATION_PATCH_VERSION,
    sourcePath: toPublicSourceId(sourcePath || sourceName),
    sourceName,
    exportedAt,
    publicSafe: true,
    contents: {
      includesOriginalSourceText: false,
      includesOriginalSourceBytes: false,
      includesReplacementBytes: true
    },
    entries: normalizeTranslationEntries(entries).map(toPatchEntry)
  };
}

function toPatchEntry(entry: TranslationEntry): TranslationPatchEntry {
  const byteLength = entry.end - entry.start + 1;
  const encoded = encodePatchText(entry.translatedText, entry.encoding);
  const fitsOriginalRange = encoded.bytes !== undefined && encoded.bytes.length <= byteLength;
  const sourceVerification = buildSourceVerification(entry.sourceBytesBase64);
  return {
    id: entry.id,
    sourcePath: toPublicSourceId(entry.sourcePath),
    mode: entry.mode,
    start: entry.start,
    end: entry.end,
    encoding: entry.encoding,
    translatedText: entry.translatedText,
    replacementBytes: encoded.bytes,
    byteLength,
    sourceVerification,
    fitsOriginalRange,
    patchable: encoded.bytes !== undefined && fitsOriginalRange,
    reason: encoded.reason || (fitsOriginalRange ? undefined : 'Translation does not fit in the original byte range.')
  };
}

function buildSourceVerification(sourceBytesBase64: string | undefined): TranslationSourceVerification | undefined {
  if (!sourceBytesBase64) {
    return undefined;
  }
  const bytes = decodeBase64Bytes(sourceBytesBase64);
  if (!bytes) {
    return undefined;
  }
  return {
    algorithm: 'fnv1a32',
    byteLength: bytes.length,
    hash: hashFnv1a32(bytes)
  };
}

function decodeBase64Bytes(base64: string): Uint8Array | undefined {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

function hashFnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function toPublicSourceId(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const parts = normalized.split('/').filter(Boolean);
  const lastPart = parts.length > 0 ? parts[parts.length - 1] : normalized;
  try {
    return decodeURIComponent(lastPart || value);
  } catch {
    return lastPart || value;
  }
}

export function encodePatchText(text: string, encoding: string): { bytes?: number[]; reason?: string } {
  const normalized = encoding.toLowerCase();
  if (normalized === 'ascii') {
    const bytes: number[] = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code > 0x7f) {
        return { reason: 'ASCII patch text contains non-ASCII characters.' };
      }
      bytes.push(code);
    }
    return { bytes };
  }

  if (normalized === 'latin1') {
    const bytes: number[] = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code > 0xff) {
        return { reason: 'Latin-1 patch text contains characters outside byte range.' };
      }
      bytes.push(code);
    }
    return { bytes };
  }

  if (normalized === 'utf-8') {
    return { bytes: Array.from(new TextEncoder().encode(text)) };
  }

  return { reason: `Encoding ${encoding} is export-only until byte encoding support is added.` };
}

function compareTranslationEntries(left: TranslationEntry, right: TranslationEntry): number {
  if (left.sourcePath !== right.sourcePath) {
    return left.sourcePath.localeCompare(right.sourcePath);
  }
  if (left.mode !== right.mode) {
    return left.mode.localeCompare(right.mode);
  }
  if (left.start !== right.start) {
    return left.start - right.start;
  }
  return left.end - right.end;
}

function normalizeOffset(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function normalizeStatus(value: unknown): TranslationEntryStatus {
  if (
    value === 'raw' ||
    value === 'reviewed' ||
    value === 'final' ||
    value === 'patched' ||
    value === 'verified'
  ) {
    return value;
  }
  return 'draft';
}

function normalizePriority(value: unknown): 'high' | 'medium' | 'low' | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return undefined;
}

function normalizeSourceQuality(value: unknown): TranslationSourceQuality | undefined {
  if (value === 'source-good' || value === 'source-suspect' || value === 'source-garbage') {
    return value;
  }
  return undefined;
}

function normalizeConfidence(value: unknown): TranslationConfidence | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return undefined;
}

function normalizePlaytestStatus(value: unknown): TranslationPlaytestStatus | undefined {
  if (value === 'untested' || value === 'seen' || value === 'passed' || value === 'failed') {
    return value;
  }
  return undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
