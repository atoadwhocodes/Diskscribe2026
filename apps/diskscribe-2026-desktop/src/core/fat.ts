import * as iconv from 'iconv-lite';
import type { FileSystemInfo } from './diskParsers';

export const MAX_FAT_DIRECTORY_ENTRIES = 512;

export interface FatDirectoryEntry {
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
}

interface DirectoryScanOptions {
  includeDeleted: boolean;
  maxEntries: number;
  parentPath: string;
}

export function parseFatDirectoryTree(
  bytes: Uint8Array,
  filesystems: FileSystemInfo[],
  notes: string[],
  options: { includeDeleted?: boolean; maxEntries?: number } = {}
): FatDirectoryEntry[] {
  const entries: FatDirectoryEntry[] = [];
  const includeDeleted = options.includeDeleted === true;
  const maxEntries = options.maxEntries ?? MAX_FAT_DIRECTORY_ENTRIES;

  for (const filesystem of filesystems) {
    if (!canParseDirectoryTree(filesystem)) {
      continue;
    }

    const rootOffset = filesystem.offsetBytes + filesystem.firstRootDirectoryLba * filesystem.bytesPerSector;
    const rootLength = filesystem.rootDirectorySectors * filesystem.bytesPerSector;
    if (rootOffset < 0 || rootOffset >= bytes.length) {
      notes.push(
        `Root directory for ${filesystem.source} starts beyond the preview window at ${rootOffset.toLocaleString()} bytes.`
      );
      continue;
    }

    const rootEntries = parseFatDirectoryEntries(bytes, filesystem, rootOffset, rootLength, {
      includeDeleted,
      maxEntries: maxEntries - entries.length,
      parentPath: ''
    });
    entries.push(...rootEntries);

    const queue = rootEntries.filter((entry) => entry.isDirectory && !entry.isDeleted && entry.startCluster >= 2);
    const seenDirectories = new Set<string>();
    while (queue.length > 0 && entries.length < maxEntries) {
      const directory = queue.shift();
      if (!directory) {
        continue;
      }
      if (seenDirectories.has(directory.path)) {
        continue;
      }
      seenDirectories.add(directory.path);

      const clusterOffsets = getClusterChainOffsets(bytes, filesystem, directory.startCluster, directory.sizeBytes);
      for (const clusterOffset of clusterOffsets) {
        if (entries.length >= maxEntries) {
          break;
        }
        const childEntries = parseFatDirectoryEntries(bytes, filesystem, clusterOffset, getClusterSizeBytes(filesystem), {
          includeDeleted,
          maxEntries: maxEntries - entries.length,
          parentPath: directory.path
        });
        entries.push(...childEntries);
        queue.push(...childEntries.filter((entry) => entry.isDirectory && !entry.isDeleted && entry.startCluster >= 2));
      }
    }
  }

  if (entries.length >= maxEntries) {
    notes.push(`Directory listing capped at ${maxEntries.toLocaleString()} entries.`);
  }

  return entries;
}

export function parseFatDirectoryEntries(
  bytes: Uint8Array,
  filesystem: FileSystemInfo,
  directoryOffsetBytes: number,
  directoryLengthBytes: number,
  options: DirectoryScanOptions
): FatDirectoryEntry[] {
  const entries: FatDirectoryEntry[] = [];
  const readableLength = Math.min(directoryLengthBytes, Math.max(0, bytes.length - directoryOffsetBytes));
  const entryCount = Math.floor(readableLength / 32);
  let pendingLongNameParts: string[] = [];

  for (let index = 0; index < entryCount && entries.length < options.maxEntries; index += 1) {
    const offset = directoryOffsetBytes + index * 32;
    const firstByte = bytes[offset];
    if (firstByte === 0x00) {
      break;
    }

    const attribute = bytes[offset + 11] ?? 0;
    if ((attribute & 0x0f) === 0x0f) {
      const longNamePart = parseLongNamePart(bytes, offset);
      pendingLongNameParts.unshift(longNamePart);
      continue;
    }

    const isDeleted = firstByte === 0xe5;
    if (isDeleted && !options.includeDeleted) {
      pendingLongNameParts = [];
      continue;
    }
    if ((attribute & 0x08) !== 0) {
      pendingLongNameParts = [];
      continue;
    }

    const shortName = parseFatShortName(bytes.subarray(offset, offset + 11), firstByte);
    const longName = pendingLongNameParts.join('').trim();
    pendingLongNameParts = [];
    const name = longName || shortName;
    if (!name || name === '.' || name === '..') {
      continue;
    }

    const parentPath = options.parentPath;
    const path = parentPath ? `${parentPath}/${name}` : name;
    const startClusterHigh = readUint16LE(bytes, offset + 20);
    const startClusterLow = readUint16LE(bytes, offset + 26);
    const startCluster = (startClusterHigh << 16) | startClusterLow;
    const isDirectory = (attribute & 0x10) !== 0;

    entries.push({
      filesystemOffsetBytes: filesystem.offsetBytes,
      offsetBytes: offset,
      parentPath,
      path,
      name,
      shortName,
      longName: longName || undefined,
      attributes: describeFatAttributes(attribute),
      isDirectory,
      isDeleted,
      startCluster,
      sizeBytes: readUint32LE(bytes, offset + 28)
    });
  }

  return entries;
}

export function buildFatClusterChain(
  fatBytes: Uint8Array,
  filesystem: FileSystemInfo,
  startCluster: number,
  maxClusters: number
): number[] {
  if (startCluster < 2 || maxClusters <= 0) {
    return [];
  }

  const chain: number[] = [];
  const seen = new Set<number>();
  let cluster = startCluster;

  while (cluster >= 2 && chain.length < maxClusters && !seen.has(cluster)) {
    chain.push(cluster);
    seen.add(cluster);

    const next = readFatEntry(fatBytes, filesystem, cluster);
    if (next === undefined || isFatEndOfChain(filesystem, next) || next === 0) {
      break;
    }
    if (next === 0xfff7 || next === 0xfff7fff7) {
      break;
    }
    cluster = next;
  }

  return chain;
}

export function readFatEntry(fatBytes: Uint8Array, filesystem: FileSystemInfo, cluster: number): number | undefined {
  if (filesystem.type === 'FAT12') {
    const offset = Math.floor(cluster + cluster / 2);
    if (offset + 1 >= fatBytes.length) {
      return undefined;
    }

    const value = fatBytes[offset] | (fatBytes[offset + 1] << 8);
    return cluster % 2 === 0 ? value & 0x0fff : value >>> 4;
  }

  if (filesystem.type === 'FAT16' || filesystem.type === 'FAT') {
    const offset = cluster * 2;
    if (offset + 1 >= fatBytes.length) {
      return undefined;
    }
    return readUint16LE(fatBytes, offset);
  }

  const offset = cluster * 4;
  if (offset + 3 >= fatBytes.length) {
    return undefined;
  }
  return readUint32LE(fatBytes, offset) & 0x0fffffff;
}

export function getClusterSizeBytes(filesystem: FileSystemInfo): number {
  return filesystem.bytesPerSector * filesystem.sectorsPerCluster;
}

export function getClusterOffsetBytes(filesystem: FileSystemInfo, cluster: number): number {
  const dataLba = filesystem.firstDataLba + Math.max(0, cluster - 2) * filesystem.sectorsPerCluster;
  return filesystem.offsetBytes + dataLba * filesystem.bytesPerSector;
}

function getClusterChainOffsets(
  bytes: Uint8Array,
  filesystem: FileSystemInfo,
  startCluster: number,
  declaredSizeBytes: number
): number[] {
  const fatOffset = filesystem.offsetBytes + filesystem.firstFatLba * filesystem.bytesPerSector;
  const fatLength = filesystem.sectorsPerFat * filesystem.bytesPerSector;
  if (fatOffset < 0 || fatOffset + fatLength > bytes.length) {
    return [];
  }

  const clusterSize = getClusterSizeBytes(filesystem);
  const maxClusters =
    declaredSizeBytes > 0 ? Math.ceil(declaredSizeBytes / clusterSize) : Math.max(1, filesystem.clusterCount);
  return buildFatClusterChain(bytes.subarray(fatOffset, fatOffset + fatLength), filesystem, startCluster, maxClusters)
    .map((cluster) => getClusterOffsetBytes(filesystem, cluster))
    .filter((offset) => offset >= 0 && offset < bytes.length);
}

function canParseDirectoryTree(filesystem: FileSystemInfo): boolean {
  return filesystem.type !== 'FAT32' && filesystem.rootDirectorySectors > 0 && filesystem.rootEntries > 0;
}

function isFatEndOfChain(filesystem: FileSystemInfo, value: number): boolean {
  if (filesystem.type === 'FAT12') {
    return value >= 0x0ff8;
  }
  if (filesystem.type === 'FAT16' || filesystem.type === 'FAT') {
    return value >= 0xfff8;
  }
  return value >= 0x0ffffff8;
}

function parseFatShortName(rawName: Uint8Array, firstByte: number): string {
  if (rawName.length < 11) {
    return '';
  }

  const normalized = new Uint8Array(rawName);
  if (firstByte === 0x05 || firstByte === 0xe5) {
    normalized[0] = 0xe5;
  }

  const name = decodeFatNamePart(normalized.subarray(0, 8));
  const extension = decodeFatNamePart(normalized.subarray(8, 11));
  if (!name) {
    return '';
  }
  return extension ? `${name}.${extension}` : name;
}

function parseLongNamePart(bytes: Uint8Array, offset: number): string {
  const codeUnits: number[] = [];
  for (const position of [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30]) {
    const codeUnit = readUint16LE(bytes, offset + position);
    if (codeUnit === 0x0000 || codeUnit === 0xffff) {
      continue;
    }
    codeUnits.push(codeUnit);
  }
  return String.fromCharCode(...codeUnits);
}

function decodeFatNamePart(bytes: Uint8Array): string {
  return iconv.decode(Buffer.from(bytes), 'shift_jis').replace(/\0/g, '').trimEnd();
}

function describeFatAttributes(attribute: number): string[] {
  const attributes: string[] = [];
  if ((attribute & 0x10) !== 0) {
    attributes.push('DIR');
  }
  if ((attribute & 0x01) !== 0) {
    attributes.push('RO');
  }
  if ((attribute & 0x02) !== 0) {
    attributes.push('HID');
  }
  if ((attribute & 0x04) !== 0) {
    attributes.push('SYS');
  }
  if ((attribute & 0x20) !== 0) {
    attributes.push('ARCH');
  }
  return attributes;
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

function readUint16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) {
    return 0;
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}
