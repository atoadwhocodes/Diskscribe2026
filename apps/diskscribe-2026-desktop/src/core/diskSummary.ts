import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as iconv from 'iconv-lite';
import { parseGenericByExtension, type FileSystemInfo, type PartitionEntry } from './diskParsers';
import { parseFatDirectoryTree, type FatDirectoryEntry } from './fat';
import { parseSegaCdCue, parseStandaloneIso, type IsoImageSummary, type SegaCdImageSummary } from './segaCd';

const MAX_PREVIEW_BYTES = 262144;
const MAX_RAW_ANALYSIS_BYTES = 16 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.hdi', '.nhd', '.d88', '.hdm', '.hdd', '.fdi', '.fdd', '.cue', '.iso']);

const COMMON_GEOMETRIES: Array<{ heads: number; sectorsPerTrack: number }> = [
  { heads: 2, sectorsPerTrack: 8 },
  { heads: 2, sectorsPerTrack: 9 },
  { heads: 2, sectorsPerTrack: 15 },
  { heads: 2, sectorsPerTrack: 18 },
  { heads: 8, sectorsPerTrack: 17 },
  { heads: 8, sectorsPerTrack: 26 },
  { heads: 8, sectorsPerTrack: 33 },
  { heads: 15, sectorsPerTrack: 17 },
  { heads: 16, sectorsPerTrack: 63 }
];

export type DiskFormat = 'HDI' | 'NHD' | 'D88' | 'HDM' | 'HDD' | 'FDI' | 'FDD' | 'Sega CD' | 'ISO9660' | 'Unknown';

export interface GeometryGuess {
  cylinders: number;
  heads: number;
  sectorsPerTrack: number;
}

export interface DiskSummary {
  uri: string;
  readPath?: string;
  fileName: string;
  extension: string;
  format: DiskFormat;
  parserId: string;
  dataOffsetBytes: number;
  headerSummary: string[];
  sizeBytes: number;
  sectorSize: number;
  totalSectors: number;
  geometry?: GeometryGuess;
  partitions: PartitionEntry[];
  filesystems: FileSystemInfo[];
  rootDirectoryEntries: RootDirectoryEntry[];
  rawAnalysis?: RawDiskAnalysis;
  segaCd?: SegaCdSummary;
  hexPreview: string;
  shiftJisPreview: string;
  notes: string[];
}

export interface SegaCdSummary {
  cuePath: string;
  dataTrackPath: string;
  dataTrackFileName: string;
  trackCount: number;
  audioTrackCount: number;
  rawSectorSize: number;
  userDataSize: number;
  systemId: string;
  volumeId: string;
  volumeSpaceSize: number;
  isoFileCount: number;
}

export interface RawDiskAnalysis {
  analyzedBytes: number;
  sectorSize: number;
  totalSectors: number;
  asciiRunCount: number;
  shiftJisRunCount: number;
  textLikeSectorCount: number;
  densestTextSectors: RawTextSector[];
}

export interface RawTextSector {
  sector: number;
  offsetBytes: number;
  asciiRunCount: number;
  shiftJisRunCount: number;
  printableBytes: number;
  cylinder?: number;
  head?: number;
  sectorNumber?: number;
}

export interface RootDirectoryEntry {
  filesystemOffsetBytes: number;
  offsetBytes: number;
  parentPath: string;
  path: string;
  name: string;
  shortName: string;
  longName?: string;
  attributes: string[];
  isDirectory: boolean;
  isDeleted: boolean;
  startCluster: number;
  sizeBytes: number;
  source?: 'FAT' | 'ISO9660';
  extentLba?: number;
  trackRawOffsetBytes?: number;
  trackFileName?: string;
}

export function isSupportedDiskPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function buildDiskSummaryFromPath(filePath: string): Promise<DiskSummary> {
  const extension = path.extname(filePath).toLowerCase();
  const format = detectFormat(extension);

  if (extension === '.cue') {
    return buildSegaCdDiskSummary(filePath);
  }
  if (extension === '.iso') {
    return buildStandaloneIsoDiskSummary(filePath);
  }

  const stat = await fs.stat(filePath);
  const previewBytes = await readPrefix(filePath, Math.min(MAX_PREVIEW_BYTES, stat.size));
  const parsedImage = parseGenericByExtension(extension, previewBytes, stat.size);
  const sectorSize = parsedImage.sectorSize;
  const dataSizeBytes = Math.max(0, stat.size - parsedImage.dataOffsetBytes);
  const totalSectors = Math.floor(dataSizeBytes / sectorSize);
  const geometry = guessGeometry(totalSectors);
  const notes: string[] = [...parsedImage.parserNotes];
  const rootDirectoryEntries = parseFatDirectoryTree(previewBytes, parsedImage.filesystems, notes, {
    includeDeleted: true
  }).map(toRootDirectoryEntry);
  const rawAnalysis = await buildRawDiskAnalysis(
    filePath,
    stat.size,
    sectorSize,
    format,
    parsedImage.filesystems.length,
    geometry
  );
  if (stat.size === 0) {
    notes.push('Disk image is empty.');
  }
  if (stat.size % sectorSize !== 0) {
    notes.push(`Image size is not aligned to ${sectorSize.toLocaleString()}-byte sectors.`);
  }
  if (format === 'D88' && parsedImage.sectorSize === 512) {
    notes.push('D88 can contain variable sector sizes; this parser currently assumes 512-byte sectors.');
  }
  if (!geometry) {
    notes.push('No exact CHS geometry guess from common PC-98 presets.');
  }
  if (parsedImage.partitions.length === 0) {
    notes.push('No partitions detected.');
  }
  if (parsedImage.filesystems.length === 0) {
    notes.push('No FAT boot sector metadata detected in the preview window.');
  }
  if (rawAnalysis) {
    notes.push(
      `Raw HDM text map: ${rawAnalysis.shiftJisRunCount.toLocaleString()} Shift-JIS-like runs and ` +
        `${rawAnalysis.asciiRunCount.toLocaleString()} ASCII-like runs across ` +
        `${rawAnalysis.textLikeSectorCount.toLocaleString()} text-like sectors.`
    );
  }
  return {
    uri: pathToFileURL(filePath).toString(),
    fileName: path.basename(filePath),
    extension: extension || '(none)',
    format,
    parserId: parsedImage.parserId,
    dataOffsetBytes: parsedImage.dataOffsetBytes,
    headerSummary: parsedImage.headerSummary,
    sizeBytes: stat.size,
    sectorSize,
    totalSectors,
    geometry,
    partitions: parsedImage.partitions,
    filesystems: parsedImage.filesystems,
    rootDirectoryEntries,
    rawAnalysis,
    hexPreview: toHexPreview(previewBytes, 16, 16),
    shiftJisPreview: decodeShiftJisPreview(previewBytes.subarray(0, 1024)),
    notes
  };
}

async function buildStandaloneIsoDiskSummary(filePath: string): Promise<DiskSummary> {
  const image = await parseStandaloneIso(filePath);
  const previewBytes = await readPrefix(image.isoPath, Math.min(MAX_PREVIEW_BYTES, image.sizeBytes));
  const rootDirectoryEntries = image.iso.files.map((entry) => toIsoRootDirectoryEntry(entry, image.isoFileName));
  const notes = [...image.notes];
  if (rootDirectoryEntries.length === 0) {
    notes.push('No ISO9660 files detected.');
  }

  return {
    uri: pathToFileURL(filePath).toString(),
    readPath: image.isoPath,
    fileName: path.basename(filePath),
    extension: '.iso',
    format: 'ISO9660',
    parserId: 'parseStandaloneIso',
    dataOffsetBytes: 0,
    headerSummary: image.headerSummary,
    sizeBytes: image.sizeBytes,
    sectorSize: 2048,
    totalSectors: Math.floor(image.sizeBytes / 2048),
    partitions: [],
    filesystems: [],
    rootDirectoryEntries,
    segaCd: {
      cuePath: image.isoPath,
      dataTrackPath: image.isoPath,
      dataTrackFileName: image.isoFileName,
      trackCount: 1,
      audioTrackCount: 0,
      rawSectorSize: 2048,
      userDataSize: 2048,
      systemId: image.iso.systemId,
      volumeId: image.iso.volumeId,
      volumeSpaceSize: image.iso.volumeSpaceSize,
      isoFileCount: image.iso.files.filter((entry) => !entry.isDirectory).length
    },
    hexPreview: toHexPreview(previewBytes, 16, 16),
    shiftJisPreview: decodeShiftJisPreview(previewBytes.subarray(0, 1024)),
    notes
  };
}

async function buildSegaCdDiskSummary(filePath: string): Promise<DiskSummary> {
  const image = await parseSegaCdCue(filePath);
  const dataStat = await fs.stat(image.dataTrack.filePath);
  const previewBytes = await readPrefix(image.dataTrack.filePath, Math.min(MAX_PREVIEW_BYTES, dataStat.size));
  const totalSectors = Math.floor(dataStat.size / 2352);
  const rootDirectoryEntries = image.iso.files.map((entry) => toSegaCdRootDirectoryEntry(image, entry));
  const notes = [...image.notes];
  if (rootDirectoryEntries.length === 0) {
    notes.push('No ISO9660 files detected.');
  }

  return {
    uri: pathToFileURL(filePath).toString(),
    readPath: image.dataTrack.filePath,
    fileName: path.basename(filePath),
    extension: '.cue',
    format: 'Sega CD',
    parserId: 'parseSegaCdCue',
    dataOffsetBytes: 0,
    headerSummary: image.headerSummary,
    sizeBytes: dataStat.size,
    sectorSize: 2352,
    totalSectors,
    partitions: [],
    filesystems: [],
    rootDirectoryEntries,
    segaCd: {
      cuePath: image.cuePath,
      dataTrackPath: image.dataTrack.filePath,
      dataTrackFileName: image.dataTrack.fileName,
      trackCount: image.tracks.length,
      audioTrackCount: image.tracks.filter((track) => /^AUDIO$/i.test(track.mode)).length,
      rawSectorSize: 2352,
      userDataSize: 2048,
      systemId: image.iso.systemId,
      volumeId: image.iso.volumeId,
      volumeSpaceSize: image.iso.volumeSpaceSize,
      isoFileCount: image.iso.files.filter((entry) => !entry.isDirectory).length
    },
    hexPreview: toHexPreview(previewBytes, 16, 16),
    shiftJisPreview: decodeShiftJisPreview(previewBytes.subarray(0, 1024)),
    notes
  };
}

export function formatSummaryAsText(summary: DiskSummary): string {
  const lines: string[] = [
    `${summary.format === 'Sega CD' || summary.format === 'ISO9660' ? `${summary.format} Image Report` : 'PC-98 Virtual Disk Report'}`,
    `Source URI: ${summary.uri}`,
    `File: ${summary.fileName}`,
    `Extension: ${summary.extension}`,
    `Format: ${summary.format}`,
    `Parser: ${summary.parserId}`,
    `Data Offset: ${summary.dataOffsetBytes.toLocaleString()} bytes`,
    `Size: ${summary.sizeBytes.toLocaleString()} bytes`,
    `Sector Size: ${summary.sectorSize.toLocaleString()} bytes`,
    `Total Sectors: ${summary.totalSectors.toLocaleString()}`
  ];

  if (summary.geometry) {
    lines.push(
      `Geometry Guess: ${summary.geometry.cylinders.toLocaleString()} cylinders, ` +
        `${summary.geometry.heads} heads, ${summary.geometry.sectorsPerTrack} sectors/track`
    );
  } else {
    lines.push('Geometry Guess: Unknown');
  }

  lines.push('');
  lines.push('Header Summary:');
  if (summary.headerSummary.length === 0) {
    lines.push('- none');
  } else {
    for (const line of summary.headerSummary) {
      lines.push(`- ${line}`);
    }
  }

  lines.push('');
  lines.push('Partitions:');
  if (summary.partitions.length === 0) {
    lines.push('- none');
  } else {
    for (const partition of summary.partitions) {
      lines.push(
        `- #${partition.index} ${partition.typeName} (0x${partition.typeCode
          .toString(16)
          .padStart(2, '0')}), ` +
          `start LBA ${partition.startLba.toLocaleString()}, sectors ${partition.totalSectors.toLocaleString()}, ` +
          `offset ${partition.startOffsetBytes.toLocaleString()} bytes`
      );
    }
  }

  lines.push('');
  lines.push('Filesystems:');
  if (summary.filesystems.length === 0) {
    lines.push('- none');
  } else {
    for (const filesystem of summary.filesystems) {
      lines.push(
        `- ${filesystem.source} ${filesystem.type} at offset ${filesystem.offsetBytes.toLocaleString()} bytes: ` +
          `${filesystem.bytesPerSector} bytes/sector, ${filesystem.sectorsPerCluster} sectors/cluster, ` +
          `${filesystem.clusterCount.toLocaleString()} clusters, first data LBA ${filesystem.firstDataLba.toLocaleString()}`
      );
    }
  }

  if (summary.segaCd) {
    lines.push('');
    lines.push(summary.format === 'ISO9660' ? 'ISO9660:' : 'Sega CD:');
    if (summary.format === 'ISO9660') {
      lines.push(`- image: ${summary.segaCd.dataTrackFileName}`);
    } else {
      lines.push(`- cue: ${summary.segaCd.cuePath}`);
      lines.push(`- data track: ${summary.segaCd.dataTrackFileName}`);
      lines.push(
        `- tracks: ${summary.segaCd.trackCount.toLocaleString()} total, ${summary.segaCd.audioTrackCount.toLocaleString()} audio`
      );
    }
    lines.push(`- volume: ${summary.segaCd.volumeId || '(unnamed)'}`);
    lines.push(`- ISO files: ${summary.segaCd.isoFileCount.toLocaleString()}`);
  }

  lines.push('');
  lines.push('Root Directory:');
  if (summary.rootDirectoryEntries.length === 0) {
    lines.push('- none');
  } else {
    for (const entry of summary.rootDirectoryEntries) {
      const deletedPrefix = entry.isDeleted ? '[deleted] ' : '';
      lines.push(
        `- ${deletedPrefix}${entry.path} ${entry.attributes.join(',') || 'FILE'} cluster ${entry.startCluster.toLocaleString()}, ` +
          `${entry.sizeBytes.toLocaleString()} bytes, offset ${entry.offsetBytes.toLocaleString()}`
      );
    }
  }

  lines.push('');
  lines.push('Raw Text Map:');
  if (!summary.rawAnalysis) {
    lines.push('- not generated');
  } else {
    lines.push(
      `- analyzed ${summary.rawAnalysis.analyzedBytes.toLocaleString()} bytes as ` +
        `${summary.rawAnalysis.totalSectors.toLocaleString()} raw sectors`
    );
    lines.push(`- ASCII-like runs: ${summary.rawAnalysis.asciiRunCount.toLocaleString()}`);
    lines.push(`- Shift-JIS-like runs: ${summary.rawAnalysis.shiftJisRunCount.toLocaleString()}`);
    lines.push(`- Text-like sectors: ${summary.rawAnalysis.textLikeSectorCount.toLocaleString()}`);
    if (summary.rawAnalysis.densestTextSectors.length > 0) {
      lines.push(
        `- Densest sectors: ${summary.rawAnalysis.densestTextSectors
          .map((sector) => `#${sector.sector}${formatChsSuffix(sector)}@${sector.offsetBytes.toLocaleString()}b`)
          .join(', ')}`
      );
    }
  }

  lines.push('');
  lines.push('Notes:');
  if (summary.notes.length === 0) {
    lines.push('- none');
  } else {
    for (const note of summary.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push('');
  lines.push('Hex Preview (first bytes):');
  lines.push(summary.hexPreview);

  lines.push('');
  lines.push('Shift-JIS Preview (first bytes):');
  lines.push(summary.shiftJisPreview);

  return lines.join('\n');
}

async function buildRawDiskAnalysis(
  filePath: string,
  sizeBytes: number,
  sectorSize: number,
  format: DiskFormat,
  filesystemCount: number,
  geometry?: GeometryGuess
): Promise<RawDiskAnalysis | undefined> {
  if (format !== 'HDM' || filesystemCount > 0 || sizeBytes <= 0 || sizeBytes > MAX_RAW_ANALYSIS_BYTES) {
    return undefined;
  }

  const bytes = await readPrefix(filePath, sizeBytes);
  return analyzeRawDiskBytes(bytes, sectorSize, geometry);
}

export function analyzeRawDiskBytes(bytes: Uint8Array, sectorSize: number, geometry?: GeometryGuess): RawDiskAnalysis {
  const totalSectors = sectorSize > 0 ? Math.ceil(bytes.length / sectorSize) : 0;
  const sectorStats: RawTextSector[] = [];
  let asciiRunCount = 0;
  let shiftJisRunCount = 0;

  for (let sector = 0; sector < totalSectors; sector += 1) {
    const offsetBytes = sector * sectorSize;
    const slice = bytes.subarray(offsetBytes, Math.min(bytes.length, offsetBytes + sectorSize));
    const asciiRuns = countAsciiRuns(slice);
    const shiftJisRuns = countShiftJisRuns(slice);
    const printableBytes = countPrintableBytes(slice);
    asciiRunCount += asciiRuns;
    shiftJisRunCount += shiftJisRuns;
    if (asciiRuns > 0 || shiftJisRuns > 0) {
      const chs = sectorToChs(sector, geometry);
      sectorStats.push({
        sector,
        offsetBytes,
        asciiRunCount: asciiRuns,
        shiftJisRunCount: shiftJisRuns,
        printableBytes,
        ...chs
      });
    }
  }

  sectorStats.sort((left, right) => {
    const leftScore = left.shiftJisRunCount * 3 + left.asciiRunCount + left.printableBytes / 32;
    const rightScore = right.shiftJisRunCount * 3 + right.asciiRunCount + right.printableBytes / 32;
    return rightScore - leftScore || left.offsetBytes - right.offsetBytes;
  });

  return {
    analyzedBytes: bytes.length,
    sectorSize,
    totalSectors,
    asciiRunCount,
    shiftJisRunCount,
    textLikeSectorCount: sectorStats.length,
    densestTextSectors: sectorStats.slice(0, 12)
  };
}

export function sectorToChs(
  sector: number,
  geometry?: GeometryGuess
): { cylinder?: number; head?: number; sectorNumber?: number } {
  if (!geometry || geometry.heads <= 0 || geometry.sectorsPerTrack <= 0 || sector < 0) {
    return {};
  }
  const sectorsPerCylinder = geometry.heads * geometry.sectorsPerTrack;
  const cylinder = Math.floor(sector / sectorsPerCylinder);
  const withinCylinder = sector % sectorsPerCylinder;
  const head = Math.floor(withinCylinder / geometry.sectorsPerTrack);
  const sectorNumber = (withinCylinder % geometry.sectorsPerTrack) + 1;
  return { cylinder, head, sectorNumber };
}

function formatChsSuffix(sector: RawTextSector): string {
  if (sector.cylinder === undefined || sector.head === undefined || sector.sectorNumber === undefined) {
    return '';
  }
  return ` C/H/S ${sector.cylinder}/${sector.head}/${sector.sectorNumber}`;
}

function toRootDirectoryEntry(entry: FatDirectoryEntry): RootDirectoryEntry {
  return {
    filesystemOffsetBytes: entry.filesystemOffsetBytes,
    offsetBytes: entry.offsetBytes,
    parentPath: entry.parentPath,
    path: entry.path,
    name: entry.name,
    shortName: entry.shortName,
    longName: entry.longName,
    attributes: entry.attributes,
    isDirectory: entry.isDirectory,
    isDeleted: entry.isDeleted,
    startCluster: entry.startCluster,
    sizeBytes: entry.sizeBytes,
    source: 'FAT'
  };
}

function toSegaCdRootDirectoryEntry(image: SegaCdImageSummary, entry: SegaCdImageSummary['iso']['files'][number]): RootDirectoryEntry {
  return toIsoRootDirectoryEntry(entry, image.dataTrack.fileName);
}

function toIsoRootDirectoryEntry(entry: IsoImageSummary['iso']['files'][number], trackFileName: string): RootDirectoryEntry {
  return {
    filesystemOffsetBytes: -1,
    offsetBytes: entry.trackRawOffsetBytes,
    parentPath: entry.parentPath,
    path: entry.path,
    name: entry.name,
    shortName: entry.name,
    attributes: entry.isDirectory ? ['ISO', 'DIR'] : ['ISO'],
    isDirectory: entry.isDirectory,
    isDeleted: false,
    startCluster: entry.extentLba,
    sizeBytes: entry.sizeBytes,
    source: 'ISO9660',
    extentLba: entry.extentLba,
    trackRawOffsetBytes: entry.trackRawOffsetBytes,
    trackFileName
  };
}

function detectFormat(extension: string): DiskFormat {
  if (extension === '.hdi') {
    return 'HDI';
  }
  if (extension === '.nhd') {
    return 'NHD';
  }
  if (extension === '.d88') {
    return 'D88';
  }
  if (extension === '.hdm') {
    return 'HDM';
  }
  if (extension === '.hdd') {
    return 'HDD';
  }
  if (extension === '.fdi') {
    return 'FDI';
  }
  if (extension === '.fdd') {
    return 'FDD';
  }
  if (extension === '.cue') {
    return 'Sega CD';
  }
  if (extension === '.iso') {
    return 'ISO9660';
  }
  return 'Unknown';
}

function guessGeometry(totalSectors: number): GeometryGuess | undefined {
  if (totalSectors <= 0) {
    return undefined;
  }

  for (const candidate of COMMON_GEOMETRIES) {
    const perCylinder = candidate.heads * candidate.sectorsPerTrack;
    if (totalSectors % perCylinder !== 0) {
      continue;
    }

    const cylinders = totalSectors / perCylinder;
    if (Number.isInteger(cylinders) && cylinders > 0) {
      return {
        cylinders,
        heads: candidate.heads,
        sectorsPerTrack: candidate.sectorsPerTrack
      };
    }
  }

  return undefined;
}

function countAsciiRuns(bytes: Uint8Array): number {
  let count = 0;
  let start = -1;

  for (let index = 0; index <= bytes.length; index += 1) {
    const value = index < bytes.length ? bytes[index] : 0;
    const printable = isAsciiPrintable(value) || isHalfWidthKana(value);
    if (printable && start < 0) {
      start = index;
    }
    if ((!printable || index === bytes.length) && start >= 0) {
      if (index - start >= 4) {
        count += 1;
      }
      start = -1;
    }
  }

  return count;
}

function countShiftJisRuns(bytes: Uint8Array): number {
  let count = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    let cursor = index;
    let units = 0;
    let rawLength = 0;
    let hasWideCharacter = false;

    while (cursor < bytes.length) {
      const value = bytes[cursor];
      if (isAsciiPrintable(value) || isHalfWidthKana(value)) {
        units += 1;
        rawLength += 1;
        cursor += 1;
        continue;
      }
      if (isShiftJisLead(value) && cursor + 1 < bytes.length && isShiftJisTrail(bytes[cursor + 1])) {
        units += 1;
        rawLength += 2;
        cursor += 2;
        hasWideCharacter = true;
        continue;
      }
      break;
    }

    if (rawLength >= 6 && units >= 3 && hasWideCharacter) {
      count += 1;
    }
    if (cursor > index) {
      index = cursor;
    }
  }

  return count;
}

function countPrintableBytes(bytes: Uint8Array): number {
  let count = 0;
  for (const value of bytes) {
    if (isAsciiPrintable(value) || isHalfWidthKana(value) || isShiftJisLead(value) || isShiftJisTrail(value)) {
      count += 1;
    }
  }
  return count;
}

function isAsciiPrintable(value: number): boolean {
  return value >= 0x20 && value <= 0x7e;
}

function isHalfWidthKana(value: number): boolean {
  return value >= 0xa1 && value <= 0xdf;
}

function isShiftJisLead(value: number): boolean {
  return (value >= 0x81 && value <= 0x9f) || (value >= 0xe0 && value <= 0xfc);
}

function isShiftJisTrail(value: number): boolean {
  return (value >= 0x40 && value <= 0x7e) || (value >= 0x80 && value <= 0xfc);
}

async function readPrefix(filePath: string, maxBytes: number): Promise<Uint8Array> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function toHexPreview(bytes: Uint8Array, rowWidth: number, maxRows: number): string {
  if (bytes.length === 0) {
    return '(no data)';
  }

  const lines: string[] = [];
  const rowCount = Math.min(maxRows, Math.ceil(bytes.length / rowWidth));

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const offset = rowIndex * rowWidth;
    const slice = bytes.subarray(offset, offset + rowWidth);

    const hexBytes = Array.from(slice, (value) => value.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice, (value) =>
      value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : '.'
    ).join('');

    lines.push(
      `${offset.toString(16).padStart(8, '0')}  ${hexBytes.padEnd(rowWidth * 3 - 1, ' ')}  ${ascii}`
    );
  }

  return lines.join('\n');
}

function decodeShiftJisPreview(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '(no data)';
  }

  const decoded = iconv.decode(Buffer.from(bytes), 'shift_jis');
  const printable = Array.from(decoded, (char) => {
    const code = char.charCodeAt(0);
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      return char;
    }
    if (code >= 0x20 && code !== 0x7f) {
      return char;
    }
    return '';
  })
    .join('')
    .trim();
  if (printable.length === 0) {
    return '(no printable Shift-JIS text in preview window)';
  }
  return printable.slice(0, 2000);
}
