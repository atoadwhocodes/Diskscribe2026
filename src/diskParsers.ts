import * as iconv from 'iconv-lite';

const SECTOR_SIZE = 512;
const D88_HEADER_SIZE = 0x2b0;
const NHD_SIGNATURE = 'T98HDDIMAGE.R0';

const COMMON_DATA_OFFSETS = [0, 0x200, 0x1000, 0x2000, 0x4000];

const MBR_TYPE_LABELS = new Map<number, string>([
  [0x00, 'Unused'],
  [0x01, 'FAT12'],
  [0x04, 'FAT16 (<32MB)'],
  [0x05, 'Extended'],
  [0x06, 'FAT16'],
  [0x07, 'NTFS/HPFS'],
  [0x0b, 'FAT32'],
  [0x0c, 'FAT32 (LBA)'],
  [0x0e, 'FAT16 (LBA)'],
  [0x0f, 'Extended (LBA)'],
  [0x82, 'Linux swap'],
  [0x83, 'Linux'],
  [0xa5, 'BSD'],
  [0xee, 'GPT Protective'],
  [0xef, 'EFI System']
]);

export type ParserKind = 'HDI' | 'NHD' | 'D88' | 'Generic';

export interface PartitionEntry {
  index: number;
  source: 'MBR';
  bootable: boolean;
  typeCode: number;
  typeName: string;
  startLba: number;
  totalSectors: number;
  startOffsetBytes: number;
  sizeBytes: number;
}

export interface ParsedDiskImage {
  parserKind: ParserKind;
  parserId: string;
  sectorSize: number;
  dataOffsetBytes: number;
  headerSummary: string[];
  parserNotes: string[];
  partitions: PartitionEntry[];
}

export function parseHDI(imagePrefix: Uint8Array, imageSizeBytes: number): ParsedDiskImage {
  const detection = detectDataOffset(imagePrefix, imageSizeBytes, 'HDI');

  const headerSummary = [`File size: ${imageSizeBytes.toLocaleString()} bytes`];
  if (detection.dataOffsetBytes > 0) {
    headerSummary.push(`Detected header before data: ${detection.dataOffsetBytes.toLocaleString()} bytes`);
  } else {
    headerSummary.push('No explicit HDI header offset detected.');
  }

  return {
    parserKind: 'HDI',
    parserId: 'parseHDI',
    sectorSize: SECTOR_SIZE,
    dataOffsetBytes: detection.dataOffsetBytes,
    headerSummary,
    parserNotes: detection.notes,
    partitions: detection.partitions
  };
}

export function parseNHD(imagePrefix: Uint8Array, imageSizeBytes: number): ParsedDiskImage {
  const headerSummary = [`File size: ${imageSizeBytes.toLocaleString()} bytes`];
  const parserNotes: string[] = [];

  const signature = readAscii(imagePrefix.subarray(0, NHD_SIGNATURE.length));
  const hasSignature = signature === NHD_SIGNATURE;

  let dataOffsetBytes = 0x1000;
  if (hasSignature) {
    headerSummary.push(`NHD signature: ${signature}`);
    const headerSize = readUint32LE(imagePrefix, 0x10);
    if (isReasonableHeaderSize(headerSize, imageSizeBytes)) {
      dataOffsetBytes = headerSize;
      headerSummary.push(`Header size field: ${headerSize.toLocaleString()} bytes`);
    } else {
      parserNotes.push('Header size field not usable; defaulted data offset to 4096 bytes.');
    }
  } else {
    parserNotes.push('NHD signature not found at offset 0; attempting generic offset detection.');
    const fallback = detectDataOffset(imagePrefix, imageSizeBytes, 'NHD');
    dataOffsetBytes = fallback.dataOffsetBytes;
    parserNotes.push(...fallback.notes);
  }

  const partitions = parseMbrPartitions(imagePrefix, dataOffsetBytes, SECTOR_SIZE);
  if (partitions.length === 0) {
    parserNotes.push('No MBR partition entries detected at inferred NHD data offset.');
  }

  return {
    parserKind: 'NHD',
    parserId: 'parseNHD',
    sectorSize: SECTOR_SIZE,
    dataOffsetBytes,
    headerSummary,
    parserNotes,
    partitions
  };
}

export function parseD88(imagePrefix: Uint8Array, imageSizeBytes: number): ParsedDiskImage {
  const headerSummary: string[] = [];
  const parserNotes: string[] = [];

  const diskLabelBytes = imagePrefix.subarray(0, 17);
  const diskLabel = iconv.decode(Buffer.from(diskLabelBytes), 'shift_jis').replace(/\0/g, '').trim();
  if (diskLabel.length > 0) {
    headerSummary.push(`Disk label: ${diskLabel}`);
  }

  const writeProtected = imagePrefix.length > 0x1a ? imagePrefix[0x1a] !== 0 : false;
  const mediaType = imagePrefix.length > 0x1b ? imagePrefix[0x1b] : undefined;
  const diskSizeFromHeader = readUint32LE(imagePrefix, 0x1c);

  headerSummary.push(`Write protected: ${writeProtected ? 'yes' : 'no'}`);
  if (mediaType !== undefined) {
    headerSummary.push(`Media type byte: 0x${mediaType.toString(16).padStart(2, '0')}`);
  }
  if (diskSizeFromHeader > 0) {
    headerSummary.push(`Header disk size: ${diskSizeFromHeader.toLocaleString()} bytes`);
  }
  headerSummary.push(`File size: ${imageSizeBytes.toLocaleString()} bytes`);

  const firstTrackOffset = readUint32LE(imagePrefix, 0x20);
  let dataOffsetBytes = D88_HEADER_SIZE;
  if (firstTrackOffset > 0) {
    dataOffsetBytes = firstTrackOffset;
    headerSummary.push(`First track offset: ${firstTrackOffset.toLocaleString()} bytes`);
  } else {
    parserNotes.push('Track table offset is empty; defaulted to D88 header size.');
  }

  const partitions = parseMbrPartitions(imagePrefix, dataOffsetBytes, SECTOR_SIZE);
  if (partitions.length === 0) {
    parserNotes.push('No MBR partition table detected in first D88 track data.');
    parserNotes.push('Most floppy images use a filesystem boot sector directly without a partition table.');
  }

  return {
    parserKind: 'D88',
    parserId: 'parseD88',
    sectorSize: SECTOR_SIZE,
    dataOffsetBytes,
    headerSummary,
    parserNotes,
    partitions
  };
}

export function parseGenericByExtension(
  extension: string,
  imagePrefix: Uint8Array,
  imageSizeBytes: number
): ParsedDiskImage {
  if (extension === '.hdi') {
    return parseHDI(imagePrefix, imageSizeBytes);
  }
  if (extension === '.nhd') {
    return parseNHD(imagePrefix, imageSizeBytes);
  }
  if (extension === '.d88') {
    return parseD88(imagePrefix, imageSizeBytes);
  }

  const detection = detectDataOffset(imagePrefix, imageSizeBytes, 'Unknown');
  return {
    parserKind: 'Generic',
    parserId: 'parseGenericByExtension',
    sectorSize: SECTOR_SIZE,
    dataOffsetBytes: detection.dataOffsetBytes,
    headerSummary: [`File size: ${imageSizeBytes.toLocaleString()} bytes`],
    parserNotes: detection.notes,
    partitions: detection.partitions
  };
}

function detectDataOffset(
  imagePrefix: Uint8Array,
  imageSizeBytes: number,
  label: string
): { dataOffsetBytes: number; notes: string[]; partitions: PartitionEntry[] } {
  const notes: string[] = [];

  for (const offset of COMMON_DATA_OFFSETS) {
    if (offset + SECTOR_SIZE > imagePrefix.length) {
      continue;
    }

    const partitions = parseMbrPartitions(imagePrefix, offset, SECTOR_SIZE);
    if (partitions.length > 0) {
      if (offset > 0) {
        notes.push(`Detected ${label} data start at offset ${offset.toLocaleString()} bytes.`);
      } else {
        notes.push('Detected data start at offset 0 bytes.');
      }
      return { dataOffsetBytes: offset, notes, partitions };
    }
  }

  const fallbackOffset = COMMON_DATA_OFFSETS.find((offset) => {
    const remaining = imageSizeBytes - offset;
    return remaining > 0 && remaining % SECTOR_SIZE === 0;
  });

  if (fallbackOffset !== undefined) {
    notes.push(`No MBR found; using aligned fallback data offset ${fallbackOffset.toLocaleString()} bytes.`);
    return {
      dataOffsetBytes: fallbackOffset,
      notes,
      partitions: parseMbrPartitions(imagePrefix, fallbackOffset, SECTOR_SIZE)
    };
  }

  notes.push('Unable to infer data offset; defaulted to 0 bytes.');
  return { dataOffsetBytes: 0, notes, partitions: [] };
}

function parseMbrPartitions(
  imagePrefix: Uint8Array,
  mbrOffsetBytes: number,
  sectorSize: number
): PartitionEntry[] {
  if (mbrOffsetBytes < 0 || mbrOffsetBytes + sectorSize > imagePrefix.length) {
    return [];
  }

  const signatureOffset = mbrOffsetBytes + 510;
  const hasSignature =
    imagePrefix[signatureOffset] === 0x55 && imagePrefix[signatureOffset + 1] === 0xaa;
  if (!hasSignature) {
    return [];
  }

  const partitions: PartitionEntry[] = [];
  const base = mbrOffsetBytes + 446;

  for (let index = 0; index < 4; index += 1) {
    const offset = base + index * 16;
    const status = imagePrefix[offset];
    const typeCode = imagePrefix[offset + 4];
    const startLba = readUint32LE(imagePrefix, offset + 8);
    const totalSectors = readUint32LE(imagePrefix, offset + 12);

    if (typeCode === 0 && startLba === 0 && totalSectors === 0) {
      continue;
    }

    const typeName = MBR_TYPE_LABELS.get(typeCode) ?? 'Unknown';
    partitions.push({
      index: index + 1,
      source: 'MBR',
      bootable: status === 0x80,
      typeCode,
      typeName,
      startLba,
      totalSectors,
      startOffsetBytes: mbrOffsetBytes + startLba * sectorSize,
      sizeBytes: totalSectors * sectorSize
    });
  }

  return partitions;
}

function readAscii(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('ascii').replace(/\0/g, '');
}

function isReasonableHeaderSize(value: number, imageSizeBytes: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return false;
  }
  if (value % SECTOR_SIZE !== 0) {
    return false;
  }
  return value < imageSizeBytes;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) {
    return 0;
  }
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24 >>> 0)
  ) >>> 0;
}
