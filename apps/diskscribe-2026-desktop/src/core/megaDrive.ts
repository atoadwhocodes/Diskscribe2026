/**
 * Read-only Sega Mega Drive / Genesis ROM header inspector.
 * Plain linear ROM images only. SMD interleaving and Sega CD raw BIN tracks
 * require separate decoders and are not accepted by this parser.
 */
export interface MegaDriveRomHeader {
  hardware: string;
  domesticTitle: string;
  overseasTitle: string;
  serial: string;
  region: string;
  checksum: number;
  romStart: number;
  romEnd: number;
  initialStackPointer: number;
  resetVector: number;
  notes: string[];
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end))
    .toString('latin1')
    .replace(/[^ -~]/g, ' ')
    .trim();
}

function readBigEndian16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readBigEndian32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0);
}

export function inspectMegaDriveRom(prefix: Uint8Array, imageSizeBytes: number): MegaDriveRomHeader {
  if (!Number.isSafeInteger(imageSizeBytes) || imageSizeBytes < 0x200 || prefix.length < 0x200) {
    throw new Error('Mega Drive ROM is shorter than its 512-byte vector/header area.');
  }

  const hardware = readAscii(prefix, 0x100, 0x110);
  if (!/^SEGA(?:\s|$)/i.test(hardware)) {
    throw new Error('Not a recognized linear Mega Drive ROM: SEGA header missing at 0x100. '
      + 'SMD-interleaved files and Sega CD raw track BIN files are not supported as ROMs.');
  }

  const romStart = readBigEndian32(prefix, 0x1a0);
  const romEnd = readBigEndian32(prefix, 0x1a4);
  const resetVector = readBigEndian32(prefix, 4);
  const notes = [
    'Read-only linear 68000 ROM inspection; no disassembly, checksum correction, or ROM patching.',
    'Header checksum is displayed but has not been independently verified.',
    'The hex view uses raw file offsets. This ROM does not contain disk sectors or a filesystem.'
  ];
  if (romEnd < romStart) {
    notes.push('ROM header declares an invalid address range.');
  } else if (romStart === 0 && romEnd + 1 !== imageSizeBytes) {
    notes.push('ROM header address range does not match file length; padding or a malformed header is possible.');
  }
  if (resetVector >= imageSizeBytes) {
    notes.push('68000 reset vector points beyond the supplied ROM length.');
  }

  return {
    hardware,
    domesticTitle: readAscii(prefix, 0x120, 0x150),
    overseasTitle: readAscii(prefix, 0x150, 0x180),
    serial: readAscii(prefix, 0x180, 0x18e),
    region: readAscii(prefix, 0x1f0, 0x200),
    checksum: readBigEndian16(prefix, 0x18e),
    romStart,
    romEnd,
    initialStackPointer: readBigEndian32(prefix, 0),
    resetVector,
    notes
  };
}
