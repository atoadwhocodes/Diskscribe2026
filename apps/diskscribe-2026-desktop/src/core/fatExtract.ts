import { promises as fs } from 'node:fs';
import type { FileSystemInfo } from './diskParsers';
import { buildFatClusterChain, getClusterOffsetBytes, getClusterSizeBytes } from './fat';

export interface FatFileReference {
  startCluster: number;
  sizeBytes: number;
}

export async function extractFatFileBytes(
  filePath: string,
  filesystem: FileSystemInfo,
  file: FatFileReference
): Promise<Uint8Array> {
  if (file.sizeBytes <= 0) {
    return new Uint8Array();
  }
  if (file.startCluster < 2) {
    throw new Error('FAT file entry does not reference a data cluster.');
  }

  const fatOffset = filesystem.offsetBytes + filesystem.firstFatLba * filesystem.bytesPerSector;
  const fatLength = filesystem.sectorsPerFat * filesystem.bytesPerSector;
  const fatBytes = await readFileRange(filePath, fatOffset, fatLength);

  const clusterSize = getClusterSizeBytes(filesystem);
  const maxClusters = Math.ceil(file.sizeBytes / clusterSize);
  const chain = buildFatClusterChain(fatBytes, filesystem, file.startCluster, maxClusters);
  if (chain.length === 0) {
    throw new Error('Unable to follow FAT cluster chain for selected file.');
  }

  const output = Buffer.alloc(file.sizeBytes);
  let writeOffset = 0;
  for (const cluster of chain) {
    if (writeOffset >= output.length) {
      break;
    }

    const sourceOffset = getClusterOffsetBytes(filesystem, cluster);
    const readLength = Math.min(clusterSize, output.length - writeOffset);
    const bytes = await readFileRange(filePath, sourceOffset, readLength);
    Buffer.from(bytes).copy(output, writeOffset);
    writeOffset += bytes.length;
  }

  if (writeOffset < output.length) {
    throw new Error('FAT cluster chain ended before the selected file size was satisfied.');
  }

  return new Uint8Array(output);
}

async function readFileRange(filePath: string, offset: number, length: number): Promise<Uint8Array> {
  if (length <= 0) {
    return new Uint8Array();
  }

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
