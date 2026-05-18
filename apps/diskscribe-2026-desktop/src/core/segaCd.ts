import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const SEGA_CD_RAW_SECTOR_SIZE = 2352;
export const SEGA_CD_MODE1_USER_DATA_OFFSET = 16;
export const SEGA_CD_MODE1_USER_DATA_SIZE = 2048;

export interface SegaCdCueTrack {
  trackNumber: number;
  mode: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  index00?: string;
  index01?: string;
}

export interface SegaCdIsoFileEntry {
  path: string;
  name: string;
  parentPath: string;
  extentLba: number;
  sizeBytes: number;
  flags: number;
  isDirectory: boolean;
  trackRawOffsetBytes: number;
}

export interface SegaCdIsoVolume {
  systemId: string;
  volumeId: string;
  volumeSpaceSize: number;
  rootExtentLba: number;
  rootSizeBytes: number;
  files: SegaCdIsoFileEntry[];
}

export interface IsoImageSummary {
  isoPath: string;
  isoFileName: string;
  sizeBytes: number;
  iso: SegaCdIsoVolume;
  headerSummary: string[];
  notes: string[];
}

export interface SegaCdImageSummary {
  cuePath: string;
  cueFileName: string;
  tracks: SegaCdCueTrack[];
  dataTrack: SegaCdCueTrack;
  iso: SegaCdIsoVolume;
  headerSummary: string[];
  notes: string[];
}

interface IsoDirectoryRecord {
  length: number;
  extentLba: number;
  sizeBytes: number;
  flags: number;
  name: string;
  isDirectory: boolean;
}

interface IsoSectorReader {
  sectorSize: number;
  userDataOffset: number;
  userDataSize: number;
  readFileBytes(startLba: number, sizeBytes: number): Promise<Uint8Array>;
  readUserSector(lba: number): Promise<Buffer>;
}

export async function parseSegaCdCue(cuePath: string): Promise<SegaCdImageSummary> {
  const normalizedCuePath = path.resolve(cuePath);
  const cueText = await fs.readFile(normalizedCuePath, 'utf8');
  const tracks = await parseCueTracks(normalizedCuePath, cueText);
  const dataTrack = tracks.find((track) => /^MODE1\/2352$/i.test(track.mode));
  if (!dataTrack) {
    throw new Error('No Sega CD MODE1/2352 data track found in cue sheet.');
  }

  const iso = await parseIso9660FromMode1Track(dataTrack.filePath);
  const audioTracks = tracks.filter((track) => /^AUDIO$/i.test(track.mode)).length;
  const headerSummary = [
    `Cue sheet: ${path.basename(normalizedCuePath)}`,
    `Tracks: ${tracks.length.toLocaleString()} total, ${audioTracks.toLocaleString()} audio`,
    `Data track: #${dataTrack.trackNumber.toString().padStart(2, '0')} ${dataTrack.mode} ${dataTrack.fileName}`,
    `Data track size: ${dataTrack.sizeBytes.toLocaleString()} bytes`,
    `ISO9660 volume: ${iso.volumeId || '(unnamed)'}`,
    `ISO9660 system: ${iso.systemId || '(unknown)'}`,
    `ISO9660 files: ${iso.files.filter((entry) => !entry.isDirectory).length.toLocaleString()}`
  ];
  const notes = [
    'Sega CD cue sheet parsed; Track 01 MODE1/2352 is used as the data source.',
    'Audio tracks are identified but not extracted or modified by this parser.',
    'ISO9660 file offsets are reported as raw track offsets including MODE1 sector headers.'
  ];

  return {
    cuePath: normalizedCuePath,
    cueFileName: path.basename(normalizedCuePath),
    tracks,
    dataTrack,
    iso,
    headerSummary,
    notes
  };
}

export async function parseStandaloneIso(isoPath: string): Promise<IsoImageSummary> {
  const normalizedIsoPath = path.resolve(isoPath);
  const stat = await fs.stat(normalizedIsoPath);
  const reader = createPlainIsoReader(normalizedIsoPath);
  const iso = await parseIso9660(reader);
  return {
    isoPath: normalizedIsoPath,
    isoFileName: path.basename(normalizedIsoPath),
    sizeBytes: stat.size,
    iso,
    headerSummary: [
      `ISO image: ${path.basename(normalizedIsoPath)}`,
      `ISO size: ${stat.size.toLocaleString()} bytes`,
      `ISO9660 volume: ${iso.volumeId || '(unnamed)'}`,
      `ISO9660 system: ${iso.systemId || '(unknown)'}`,
      `ISO9660 files: ${iso.files.filter((entry) => !entry.isDirectory).length.toLocaleString()}`
    ],
    notes: [
      'Standalone 2048-byte sector ISO9660 image parsed.',
      'ISO9660 file offsets are reported as byte offsets in the ISO image.'
    ]
  };
}

export async function extractSegaCdIsoFileBytes(
  cuePath: string,
  entry: { extentLba?: number; sizeBytes: number }
): Promise<Uint8Array> {
  const image = await parseSegaCdCue(cuePath);
  if (!Number.isInteger(entry.extentLba) || entry.extentLba === undefined || entry.extentLba < 0) {
    throw new Error('Selected ISO9660 file has no usable extent.');
  }
  return readMode1FileBytes(image.dataTrack.filePath, entry.extentLba, entry.sizeBytes);
}

export async function extractStandaloneIsoFileBytes(
  isoPath: string,
  entry: { extentLba?: number; sizeBytes: number }
): Promise<Uint8Array> {
  if (!Number.isInteger(entry.extentLba) || entry.extentLba === undefined || entry.extentLba < 0) {
    throw new Error('Selected ISO9660 file has no usable extent.');
  }
  return readPlainIsoFileBytes(path.resolve(isoPath), entry.extentLba, entry.sizeBytes);
}

async function parseCueTracks(cuePath: string, cueText: string): Promise<SegaCdCueTrack[]> {
  const cueDirectory = path.dirname(cuePath);
  const tracks: SegaCdCueTrack[] = [];
  let currentFileName = '';
  let currentTrack: SegaCdCueTrack | undefined;

  for (const rawLine of cueText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const fileMatch = /^FILE\s+"(.+)"\s+BINARY$/i.exec(line);
    if (fileMatch) {
      currentFileName = fileMatch[1];
      currentTrack = undefined;
      continue;
    }

    const trackMatch = /^TRACK\s+(\d+)\s+(.+)$/i.exec(line);
    if (trackMatch) {
      if (!currentFileName) {
        throw new Error('Cue sheet TRACK appeared before FILE.');
      }
      const filePath = path.resolve(cueDirectory, currentFileName);
      const stat = await fs.stat(filePath);
      currentTrack = {
        trackNumber: Number(trackMatch[1]),
        mode: trackMatch[2],
        fileName: currentFileName,
        filePath,
        sizeBytes: stat.size
      };
      tracks.push(currentTrack);
      continue;
    }

    const indexMatch = /^INDEX\s+(00|01)\s+(\d{2}:\d{2}:\d{2})$/i.exec(line);
    if (indexMatch && currentTrack) {
      if (indexMatch[1] === '00') {
        currentTrack.index00 = indexMatch[2];
      } else {
        currentTrack.index01 = indexMatch[2];
      }
    }
  }

  return tracks;
}

async function parseIso9660FromMode1Track(trackPath: string): Promise<SegaCdIsoVolume> {
  return parseIso9660(createMode1Reader(trackPath));
}

async function parseIso9660(reader: IsoSectorReader): Promise<SegaCdIsoVolume> {
  const primaryVolumeDescriptor = await reader.readUserSector(16);
  if (
    primaryVolumeDescriptor[0] !== 1 ||
    readAscii(primaryVolumeDescriptor, 1, 5) !== 'CD001' ||
    primaryVolumeDescriptor[6] !== 1
  ) {
    throw new Error('Source does not contain a supported ISO9660 primary volume descriptor.');
  }

  const rootRecord = parseDirectoryRecord(primaryVolumeDescriptor, 156);
  if (!rootRecord) {
    throw new Error('ISO9660 primary volume descriptor has no root directory record.');
  }

  const rootEntry: SegaCdIsoFileEntry = {
    path: '',
    name: '',
    parentPath: '',
    extentLba: rootRecord.extentLba,
    sizeBytes: rootRecord.sizeBytes,
    flags: rootRecord.flags,
    isDirectory: true,
    trackRawOffsetBytes: rootRecord.extentLba * reader.sectorSize + reader.userDataOffset
  };

  return {
    systemId: readAscii(primaryVolumeDescriptor, 8, 32),
    volumeId: readAscii(primaryVolumeDescriptor, 40, 32),
    volumeSpaceSize: readUint32LE(primaryVolumeDescriptor, 80),
    rootExtentLba: rootRecord.extentLba,
    rootSizeBytes: rootRecord.sizeBytes,
    files: await listIsoDirectory(reader, rootEntry)
  };
}

async function listIsoDirectory(reader: IsoSectorReader, directory: SegaCdIsoFileEntry): Promise<SegaCdIsoFileEntry[]> {
  const bytes = Buffer.from(await reader.readFileBytes(directory.extentLba, directory.sizeBytes));
  const entries: SegaCdIsoFileEntry[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    if (bytes[offset] === 0) {
      offset = Math.ceil((offset + 1) / SEGA_CD_MODE1_USER_DATA_SIZE) * SEGA_CD_MODE1_USER_DATA_SIZE;
      continue;
    }

    const record = parseDirectoryRecord(bytes, offset);
    if (!record) {
      break;
    }
    offset += record.length;

    if (record.name === '.' || record.name === '..') {
      continue;
    }

    const entryPath = directory.path ? `${directory.path}/${record.name}` : record.name;
    const entry: SegaCdIsoFileEntry = {
      path: entryPath,
      name: record.name,
      parentPath: directory.path,
      extentLba: record.extentLba,
      sizeBytes: record.sizeBytes,
      flags: record.flags,
      isDirectory: record.isDirectory,
      trackRawOffsetBytes: record.extentLba * reader.sectorSize + reader.userDataOffset
    };
    entries.push(entry);

    if (entry.isDirectory) {
      entries.push(...(await listIsoDirectory(reader, entry)));
    }
  }

  return entries;
}

function createMode1Reader(trackPath: string): IsoSectorReader {
  return {
    sectorSize: SEGA_CD_RAW_SECTOR_SIZE,
    userDataOffset: SEGA_CD_MODE1_USER_DATA_OFFSET,
    userDataSize: SEGA_CD_MODE1_USER_DATA_SIZE,
    readFileBytes(startLba, sizeBytes) {
      return readMode1FileBytes(trackPath, startLba, sizeBytes);
    },
    readUserSector(lba) {
      return readMode1UserSector(trackPath, lba);
    }
  };
}

function createPlainIsoReader(isoPath: string): IsoSectorReader {
  return {
    sectorSize: SEGA_CD_MODE1_USER_DATA_SIZE,
    userDataOffset: 0,
    userDataSize: SEGA_CD_MODE1_USER_DATA_SIZE,
    readFileBytes(startLba, sizeBytes) {
      return readPlainIsoFileBytes(isoPath, startLba, sizeBytes);
    },
    readUserSector(lba) {
      return readPlainIsoUserSector(isoPath, lba);
    }
  };
}

async function readMode1FileBytes(trackPath: string, startLba: number, sizeBytes: number): Promise<Uint8Array> {
  if (sizeBytes <= 0) {
    return new Uint8Array();
  }

  const output = Buffer.alloc(sizeBytes);
  const handle = await fs.open(trackPath, 'r');
  try {
    let written = 0;
    let lba = startLba;
    while (written < sizeBytes) {
      const sector = Buffer.alloc(SEGA_CD_MODE1_USER_DATA_SIZE);
      const sectorOffset = lba * SEGA_CD_RAW_SECTOR_SIZE + SEGA_CD_MODE1_USER_DATA_OFFSET;
      const { bytesRead } = await handle.read(sector, 0, sector.length, sectorOffset);
      if (bytesRead <= 0) {
        break;
      }
      const take = Math.min(bytesRead, sizeBytes - written);
      sector.copy(output, written, 0, take);
      written += take;
      lba += 1;
    }
    return new Uint8Array(output.subarray(0, written));
  } finally {
    await handle.close();
  }
}

async function readMode1UserSector(trackPath: string, lba: number): Promise<Buffer> {
  const handle = await fs.open(trackPath, 'r');
  try {
    const buffer = Buffer.alloc(SEGA_CD_MODE1_USER_DATA_SIZE);
    const offset = lba * SEGA_CD_RAW_SECTOR_SIZE + SEGA_CD_MODE1_USER_DATA_OFFSET;
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    if (bytesRead < buffer.length) {
      throw new Error(`Unable to read complete MODE1 sector at LBA ${lba}.`);
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

async function readPlainIsoFileBytes(isoPath: string, startLba: number, sizeBytes: number): Promise<Uint8Array> {
  if (sizeBytes <= 0) {
    return new Uint8Array();
  }
  const handle = await fs.open(isoPath, 'r');
  try {
    const buffer = Buffer.alloc(sizeBytes);
    const offset = startLba * SEGA_CD_MODE1_USER_DATA_SIZE;
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

async function readPlainIsoUserSector(isoPath: string, lba: number): Promise<Buffer> {
  const handle = await fs.open(isoPath, 'r');
  try {
    const buffer = Buffer.alloc(SEGA_CD_MODE1_USER_DATA_SIZE);
    const offset = lba * SEGA_CD_MODE1_USER_DATA_SIZE;
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    if (bytesRead < buffer.length) {
      throw new Error(`Unable to read complete ISO sector at LBA ${lba}.`);
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

function parseDirectoryRecord(bytes: Uint8Array, offset: number): IsoDirectoryRecord | undefined {
  if (offset < 0 || offset >= bytes.length) {
    return undefined;
  }

  const length = bytes[offset] ?? 0;
  if (length <= 0 || offset + length > bytes.length || length < 34) {
    return undefined;
  }

  const nameLength = bytes[offset + 32] ?? 0;
  if (offset + 33 + nameLength > bytes.length) {
    return undefined;
  }

  const rawName = bytes.subarray(offset + 33, offset + 33 + nameLength);
  let name: string;
  if (nameLength === 1 && rawName[0] === 0) {
    name = '.';
  } else if (nameLength === 1 && rawName[0] === 1) {
    name = '..';
  } else {
    name = readAscii(rawName, 0, rawName.length).replace(/;[0-9]+$/, '');
  }

  const flags = bytes[offset + 25] ?? 0;
  return {
    length,
    extentLba: readUint32LE(bytes, offset + 2),
    sizeBytes: readUint32LE(bytes, offset + 10),
    flags,
    name,
    isDirectory: (flags & 0x02) !== 0
  };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, offset + length))
    .toString('ascii')
    .replace(/\0+$/g, '')
    .trim();
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
