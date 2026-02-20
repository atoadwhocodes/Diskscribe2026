import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import { parseGenericByExtension, type PartitionEntry } from './diskParsers';

const MAX_PREVIEW_BYTES = 262144;
const SUPPORTED_EXTENSIONS = new Set(['.hdi', '.nhd', '.d88']);

const COMMON_GEOMETRIES: Array<{ heads: number; sectorsPerTrack: number }> = [
  { heads: 8, sectorsPerTrack: 17 },
  { heads: 8, sectorsPerTrack: 26 },
  { heads: 8, sectorsPerTrack: 33 },
  { heads: 15, sectorsPerTrack: 17 },
  { heads: 16, sectorsPerTrack: 63 }
];

export type DiskFormat = 'HDI' | 'NHD' | 'D88' | 'Unknown';

export interface GeometryGuess {
  cylinders: number;
  heads: number;
  sectorsPerTrack: number;
}

export interface DiskSummary {
  uri: string;
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
  hexPreview: string;
  shiftJisPreview: string;
  notes: string[];
}

export function isSupportedDiskFile(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.path).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function buildDiskSummary(uri: vscode.Uri): Promise<DiskSummary> {
  const extension = path.extname(uri.path).toLowerCase();
  const format = detectFormat(extension);

  const stat = await vscode.workspace.fs.stat(uri);
  const previewBytes = await readPrefix(uri, MAX_PREVIEW_BYTES);
  const parsedImage = parseGenericByExtension(extension, previewBytes, stat.size);

  const sectorSize = parsedImage.sectorSize;
  const dataSizeBytes = Math.max(0, stat.size - parsedImage.dataOffsetBytes);
  const totalSectors = Math.floor(dataSizeBytes / sectorSize);
  const geometry = guessGeometry(totalSectors);

  const notes: string[] = [...parsedImage.parserNotes];
  if (stat.size === 0) {
    notes.push('Disk image is empty.');
  }
  if (stat.size % sectorSize !== 0) {
    notes.push('Image size is not aligned to 512-byte sectors.');
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

  return {
    uri: uri.toString(),
    fileName: path.basename(uri.path),
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
    hexPreview: toHexPreview(previewBytes, 16, 16),
    shiftJisPreview: decodeShiftJisPreview(previewBytes.subarray(0, 1024)),
    notes
  };
}

export function formatSummaryAsText(summary: DiskSummary): string {
  const lines: string[] = [
    'PC-98 Virtual Disk Report',
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

async function readPrefix(uri: vscode.Uri, maxBytes: number): Promise<Uint8Array> {
  if (uri.scheme === 'file') {
    const handle = await fs.open(uri.fsPath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  const fullContents = await vscode.workspace.fs.readFile(uri);
  return fullContents.subarray(0, Math.min(fullContents.length, maxBytes));
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
  const printable = decoded.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
  if (printable.length === 0) {
    return '(no printable Shift-JIS text in preview window)';
  }
  return printable.slice(0, 2000);
}
