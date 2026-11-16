const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseD88, parseDSK } = require('../src/core/diskParsers');
const { buildDiskSummaryFromPath, formatSummaryAsText, isSupportedDiskPath } = require('../src/core/diskSummary');
const { inspectMegaDriveRom } = require('../src/core/megaDrive');

function makeLinearGenesisFixture() {
  const bytes = Buffer.alloc(0x400);
  bytes.writeUInt32BE(0x00ff0000, 0);
  bytes.writeUInt32BE(0x00000200, 4);
  bytes.write('SEGA MEGA DRIVE', 0x100, 'ascii');
  bytes.write('TEST CARTRIDGE', 0x120, 'ascii');
  bytes.write('HOMEBREW FIXTURE', 0x150, 'ascii');
  bytes.write('GM 00000000-00', 0x180, 'ascii');
  bytes.writeUInt16BE(0x1234, 0x18e);
  bytes.writeUInt32BE(0, 0x1a0);
  bytes.writeUInt32BE(bytes.length - 1, 0x1a4);
  bytes.write('JUE', 0x1f0, 'ascii');
  return bytes;
}

test('Mega Drive ROM header inspector is big-endian, read-only and bounded', () => {
  const bytes = makeLinearGenesisFixture();
  const before = Buffer.from(bytes);
  const result = inspectMegaDriveRom(bytes, bytes.length);
  assert.equal(result.hardware, 'SEGA MEGA DRIVE');
  assert.equal(result.overseasTitle, 'HOMEBREW FIXTURE');
  assert.equal(result.initialStackPointer, 0x00ff0000);
  assert.equal(result.resetVector, 0x200);
  assert.equal(result.checksum, 0x1234);
  assert.equal(result.romEnd, 0x3ff);
  assert.equal(result.region, 'JUE');
  assert.deepEqual(bytes, before);
  assert.throws(() => inspectMegaDriveRom(Buffer.alloc(0x180), 0x180), /shorter/);
  const nonRom = Buffer.from(bytes);
  nonRom.fill(0, 0x100, 0x110);
  assert.throws(() => inspectMegaDriveRom(nonRom, nonRom.length), /SEGA header missing/);
});

test('D88 inspection reads track and sector metadata but never treats framed bytes as FAT', () => {
  const bytes = Buffer.alloc(0x2b0 + 16 + 256);
  bytes.writeUInt32LE(bytes.length, 0x1c);
  bytes.writeUInt32LE(0x2b0, 0x20);
  bytes[0x2b0] = 0;
  bytes[0x2b1] = 0;
  bytes[0x2b2] = 1;
  bytes[0x2b3] = 1;
  bytes.writeUInt16LE(1, 0x2b4);
  bytes.writeUInt16LE(256, 0x2b0 + 14);
  const result = parseD88(bytes, bytes.length);
  assert.equal(result.parserKind, 'D88');
  assert.equal(result.filesystems.length, 0);
  assert.equal(result.partitions.length, 0);
  assert.match(result.headerSummary.join(' '), /Declared tracks: 1/);
  assert.match(result.headerSummary.join(' '), /First sector C\/H\/R: 0\/0\/1; 256 data bytes/);
  assert.match(result.parserNotes.join(' '), /PC-88 and PC-98/);
  const malformed = Buffer.from(bytes);
  malformed.writeUInt32LE(bytes.length + 200, 0x20);
  const bad = parseD88(malformed, malformed.length);
  assert.match(bad.parserNotes.join(' '), /outside the image/);
  assert.equal(bad.filesystems.length, 0);
});

test('raw DSK inspection does not claim N88-BASIC directory or PC-88 machine verification', () => {
  const bytes = Buffer.alloc(327680);
  const result = parseDSK(bytes, bytes.length);
  assert.equal(result.parserKind, 'DSK');
  assert.equal(result.sectorSize, 256);
  assert.equal(result.filesystems.length, 0);
  assert.match(result.parserNotes.join(' '), /N88-BASIC/);
  assert.equal(isSupportedDiskPath('disk.DSK'), true);
  assert.equal(isSupportedDiskPath('homebrew.MD'), true);
  assert.equal(isSupportedDiskPath('homebrew.GEN'), true);
  assert.equal(isSupportedDiskPath('music.bin'), false);
  assert.equal(isSupportedDiskPath('interleaved.smd'), false);
});

test('public desktop summary opens linear Genesis ROM without pretending it has disk sectors', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-genesis-'));
  try {
    const romPath = path.join(dir, 'fixture.gen');
    await writeFile(romPath, makeLinearGenesisFixture());
    const summary = await buildDiskSummaryFromPath(romPath);
    assert.equal(summary.format, 'Mega Drive');
    assert.equal(summary.parserId, 'inspectMegaDriveRom');
    assert.equal(summary.sectorSize, 1);
    assert.equal(summary.rootDirectoryEntries.length, 0);
    assert.equal(summary.megaDrive.resetVector, 0x200);
    const text = formatSummaryAsText(summary);
    assert.match(text, /Mega Drive \/ Genesis ROM Inspection/);
    assert.match(text, /Addressing: raw bytes \(no physical disk sectors\)/);
    assert.doesNotMatch(text, /PC-98 Virtual Disk Report/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
