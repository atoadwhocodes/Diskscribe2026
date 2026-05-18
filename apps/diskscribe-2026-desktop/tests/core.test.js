const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  parseD88,
  parseHDI,
  parseHDM,
  parseNHD
} = require('../src/core/diskParsers');
const {
  extractSegaCdIsoFileBytes,
  extractStandaloneIsoFileBytes,
  parseSegaCdCue,
  parseStandaloneIso
} = require('../src/core/segaCd');
const {
  analyzeRawDiskBytes,
  buildDiskSummaryFromPath,
  formatSummaryAsText,
  isSupportedDiskPath,
  sectorToChs
} = require('../src/core/diskSummary');
const { buildFatClusterChain } = require('../src/core/fat');
const { extractFatFileBytes } = require('../src/core/fatExtract');
const { PagedFileByteReader } = require('../src/core/hex/pagedFileByteReader');

const SECTOR_SIZE = 512;

test('supported disk path detection is extension based and case insensitive', () => {
  assert.equal(isSupportedDiskPath('game.HDM'), true);
  assert.equal(isSupportedDiskPath('archive.nhd'), true);
  assert.equal(isSupportedDiskPath('alshark.CUE'), true);
  assert.equal(isSupportedDiskPath('data.ISO'), true);
  assert.equal(isSupportedDiskPath('notes.txt'), false);
  assert.equal(isSupportedDiskPath('disk.hdm.bak'), false);
});

test('HDI parser detects an MBR at a common data offset', () => {
  const bytes = new Uint8Array(0x2000 + SECTOR_SIZE);
  writeMbr(bytes, 0x1000, [{ typeCode: 0x06, startLba: 2, totalSectors: 32 }]);

  const parsed = parseHDI(bytes, bytes.length);

  assert.equal(parsed.parserKind, 'HDI');
  assert.equal(parsed.dataOffsetBytes, 0x1000);
  assert.equal(parsed.partitions.length, 1);
  assert.equal(parsed.partitions[0].typeName, 'FAT16');
  assert.equal(parsed.partitions[0].startOffsetBytes, 0x1000 + 2 * SECTOR_SIZE);
});

test('NHD parser honors a valid header size field when signature is present', () => {
  const bytes = new Uint8Array(0x1000 + SECTOR_SIZE);
  writeAscii(bytes, 0, 'T98HDDIMAGE.R0');
  writeUint32LE(bytes, 0x10, 0x1000);
  writeMbr(bytes, 0x1000, [{ typeCode: 0x0e, startLba: 1, totalSectors: 64 }]);

  const parsed = parseNHD(bytes, bytes.length);

  assert.equal(parsed.parserKind, 'NHD');
  assert.equal(parsed.dataOffsetBytes, 0x1000);
  assert.equal(parsed.partitions.length, 1);
  assert.equal(parsed.partitions[0].typeName, 'FAT16 (LBA)');
});

test('HDM parser reads a FAT boot sector BPB from raw floppy-style images', () => {
  const bytes = new Uint8Array(1261568);
  writeFatBpb(bytes, { bytesPerSector: 1024, sectorsPerCluster: 1, totalSectors: 1232 });

  const parsed = parseHDM(bytes, bytes.length);

  assert.equal(parsed.parserKind, 'HDM');
  assert.equal(parsed.dataOffsetBytes, 0);
  assert.equal(parsed.sectorSize, 1024);
  assert.equal(parsed.filesystems.length, 1);
  assert.equal(parsed.filesystems[0].type, 'FAT12');
  assert.equal(parsed.filesystems[0].firstDataLba, 14);
  assert.match(parsed.headerSummary.join('\n'), /1024 bytes\/sector/);
});

test('HDM parser infers PC-98 1.2MB geometry when no BPB is present', () => {
  const bytes = new Uint8Array(1261568);

  const parsed = parseHDM(bytes, bytes.length);

  assert.equal(parsed.parserKind, 'HDM');
  assert.equal(parsed.sectorSize, 1024);
  assert.equal(parsed.filesystems.length, 0);
  assert.match(parsed.headerSummary.join('\n'), /PC-98 1\.2MB HDM/);
  assert.match(parsed.headerSummary.join('\n'), /77 cylinders, 2 heads, 8 sectors\/track/);
  assert.match(parsed.parserNotes.join('\n'), /raw sector mapping/);
});

test('raw HDM analysis maps text-like sectors without FAT metadata', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-raw-hdm-'));
  const diskPath = path.join(dir, 'raw.hdm');
  try {
    const bytes = new Uint8Array(1261568);
    Buffer.from('MAIN MENU START', 'ascii').copy(Buffer.from(bytes.buffer), 1024 * 10);
    Buffer.from([0x83, 0x41, 0x83, 0x8b, 0x83, 0x56, 0x83, 0x83]).copy(Buffer.from(bytes.buffer), 1024 * 20);
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);
    const reportText = formatSummaryAsText(summary);

    assert.ok(summary.rawAnalysis);
    assert.equal(summary.rawAnalysis.sectorSize, 1024);
    assert.equal(summary.rawAnalysis.totalSectors, 1232);
    assert.equal(summary.rawAnalysis.asciiRunCount >= 1, true);
    assert.equal(summary.rawAnalysis.shiftJisRunCount >= 1, true);
    assert.equal(summary.rawAnalysis.densestTextSectors.some((sector) => sector.sector === 10), true);
    assert.equal(summary.rawAnalysis.densestTextSectors.some((sector) => sector.cylinder !== undefined), true);
    assert.match(reportText, /Raw Text Map:/);
    assert.match(reportText, /Shift-JIS-like runs:/);
    assert.match(reportText, /C\/H\/S/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('raw byte analysis counts sector-local text runs', () => {
  const bytes = new Uint8Array(2048);
  Buffer.from('SYSTEM', 'ascii').copy(Buffer.from(bytes.buffer), 4);
  Buffer.from([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4]).copy(Buffer.from(bytes.buffer), 1024);

  const analysis = analyzeRawDiskBytes(bytes, 1024);

  assert.equal(analysis.totalSectors, 2);
  assert.equal(analysis.asciiRunCount, 1);
  assert.equal(analysis.shiftJisRunCount, 1);
  assert.equal(analysis.textLikeSectorCount, 2);
});

test('raw sector mapping reports PC-98 CHS coordinates', () => {
  assert.deepEqual(sectorToChs(0, { cylinders: 77, heads: 2, sectorsPerTrack: 8 }), {
    cylinder: 0,
    head: 0,
    sectorNumber: 1
  });
  assert.deepEqual(sectorToChs(15, { cylinders: 77, heads: 2, sectorsPerTrack: 8 }), {
    cylinder: 0,
    head: 1,
    sectorNumber: 8
  });
  assert.deepEqual(sectorToChs(16, { cylinders: 77, heads: 2, sectorsPerTrack: 8 }), {
    cylinder: 1,
    head: 0,
    sectorNumber: 1
  });
});

test('HDI parser reports FAT metadata from a partition boot sector in the preview window', () => {
  const bytes = new Uint8Array(0x1000 + 128 * SECTOR_SIZE);
  writeMbr(bytes, 0x1000, [{ typeCode: 0x06, startLba: 1, totalSectors: 96 }]);
  writeFatBpb(bytes, {
    offset: 0x1000 + SECTOR_SIZE,
    bytesPerSector: SECTOR_SIZE,
    sectorsPerCluster: 2,
    totalSectors: 96
  });

  const parsed = parseHDI(bytes, bytes.length);

  assert.equal(parsed.filesystems.length, 1);
  assert.equal(parsed.filesystems[0].source, 'Partition Boot Sector');
  assert.equal(parsed.filesystems[0].offsetBytes, 0x1000 + SECTOR_SIZE);
  assert.equal(parsed.filesystems[0].sectorsPerCluster, 2);
});

test('parsers tolerate short and malformed images without throwing', () => {
  const tiny = new Uint8Array(32);
  const hdi = parseHDI(tiny, tiny.length);
  const nhd = parseNHD(tiny, tiny.length);
  const d88 = parseD88(tiny, tiny.length);
  const hdm = parseHDM(tiny, tiny.length);

  assert.equal(hdi.partitions.length, 0);
  assert.equal(nhd.partitions.length, 0);
  assert.equal(d88.partitions.length, 0);
  assert.equal(hdm.sectorSize, SECTOR_SIZE);
  assert.equal(hdm.filesystems.length, 0);
});

test('NHD parser rejects unusable signature header sizes and falls back safely', () => {
  const bytes = new Uint8Array(0x1000 + SECTOR_SIZE);
  writeAscii(bytes, 0, 'T98HDDIMAGE.R0');
  writeUint32LE(bytes, 0x10, 123);

  const parsed = parseNHD(bytes, bytes.length);

  assert.equal(parsed.dataOffsetBytes, 0x1000);
  assert.match(parsed.parserNotes.join('\n'), /Header size field not usable/);
  assert.equal(parsed.partitions.length, 0);
});

test('D88 parser defaults safely when the track table is empty', () => {
  const bytes = new Uint8Array(0x2b0);

  const parsed = parseD88(bytes, bytes.length);

  assert.equal(parsed.dataOffsetBytes, 0x2b0);
  assert.match(parsed.parserNotes.join('\n'), /Track table offset is empty/);
});

test('Sega CD cue parser reads MODE1 ISO9660 file table and extracts files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-segacd-'));
  const cuePath = path.join(dir, 'sample.cue');
  const trackPath = path.join(dir, 'sample-track01.bin');
  try {
    await writeFile(trackPath, createSegaCdMode1Track());
    await writeFile(
      cuePath,
      [
        'FILE "sample-track01.bin" BINARY',
        '  TRACK 01 MODE1/2352',
        '    INDEX 01 00:00:00',
        'FILE "sample-track02.bin" BINARY',
        '  TRACK 02 AUDIO',
        '    INDEX 01 00:00:00'
      ].join('\n')
    );
    await writeFile(path.join(dir, 'sample-track02.bin'), Buffer.alloc(2352));

    const image = await parseSegaCdCue(cuePath);
    const summary = await buildDiskSummaryFromPath(cuePath);
    const reportText = formatSummaryAsText(summary);
    const file = summary.rootDirectoryEntries.find((entry) => entry.path === 'HELLO.TXT');
    assert.ok(file);

    assert.equal(image.iso.volumeId, 'TESTDISC');
    assert.equal(image.tracks.length, 2);
    assert.equal(image.iso.files.some((entry) => entry.path === 'HELLO.TXT'), true);
    assert.equal(summary.format, 'Sega CD');
    assert.equal(summary.readPath, trackPath);
    assert.equal(summary.segaCd.volumeId, 'TESTDISC');
    assert.equal(file.source, 'ISO9660');
    assert.equal(file.extentLba, 21);
    assert.match(reportText, /Sega CD Image Report/);
    assert.match(reportText, /ISO files: 1/);

    const extracted = await extractSegaCdIsoFileBytes(cuePath, file);
    assert.deepEqual(Buffer.from(extracted), Buffer.from('HELLO SEGA CD', 'ascii'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('standalone ISO parser reads ISO9660 file table and extracts files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-iso-'));
  const isoPath = path.join(dir, 'sample.iso');
  try {
    await writeFile(isoPath, createPlainIsoImage());

    const image = await parseStandaloneIso(isoPath);
    const summary = await buildDiskSummaryFromPath(isoPath);
    const reportText = formatSummaryAsText(summary);
    const file = summary.rootDirectoryEntries.find((entry) => entry.path === 'HELLO.TXT');
    assert.ok(file);

    assert.equal(image.iso.volumeId, 'TESTDISC');
    assert.equal(image.iso.files.some((entry) => entry.path === 'HELLO.TXT'), true);
    assert.equal(summary.format, 'ISO9660');
    assert.equal(summary.readPath, isoPath);
    assert.equal(summary.segaCd.volumeId, 'TESTDISC');
    assert.equal(summary.sectorSize, 2048);
    assert.equal(file.source, 'ISO9660');
    assert.equal(file.offsetBytes, 21 * 2048);
    assert.match(reportText, /ISO9660 Image Report/);
    assert.match(reportText, /ISO files: 1/);

    const extracted = await extractStandaloneIsoFileBytes(isoPath, file);
    assert.deepEqual(Buffer.from(extracted), Buffer.from('HELLO SEGA CD', 'ascii'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('disk summary builds geometry and notes for a temporary HDM image', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-test-'));
  const diskPath = path.join(dir, 'sample.hdm');
  try {
    const bytes = new Uint8Array(80 * 2 * 8 * SECTOR_SIZE);
    writeFatBpb(bytes, { bytesPerSector: SECTOR_SIZE, sectorsPerCluster: 1, totalSectors: 1280 });
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);

    assert.equal(summary.format, 'HDM');
    assert.equal(summary.totalSectors, 1280);
    assert.deepEqual(summary.geometry, { cylinders: 80, heads: 2, sectorsPerTrack: 8 });
    assert.equal(summary.notes.includes('No partitions detected.'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('disk summary extracts FAT12/FAT16 root directory short entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-rootdir-'));
  const diskPath = path.join(dir, 'rootdir.hdm');
  try {
    const bytes = new Uint8Array(80 * 2 * 8 * SECTOR_SIZE);
    writeFatBpb(bytes, {
      bytesPerSector: SECTOR_SIZE,
      sectorsPerCluster: 1,
      totalSectors: 1280,
      rootEntries: 32,
      sectorsPerFat: 1
    });
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE, {
      name: 'README',
      extension: 'TXT',
      attribute: 0x20,
      startCluster: 2,
      sizeBytes: 1234
    });
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE + 32, {
      name: 'GAMES',
      extension: '',
      attribute: 0x10,
      startCluster: 4,
      sizeBytes: 0
    });
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);

    assert.deepEqual(
      summary.rootDirectoryEntries.map((entry) => ({
        name: entry.name,
        attributes: entry.attributes,
        startCluster: entry.startCluster,
        sizeBytes: entry.sizeBytes
      })),
      [
        { name: 'README.TXT', attributes: ['ARCH'], startCluster: 2, sizeBytes: 1234 },
        { name: 'GAMES', attributes: ['DIR'], startCluster: 4, sizeBytes: 0 }
      ]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('disk summary extracts subdirectories, long names, and deleted FAT entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-tree-'));
  const diskPath = path.join(dir, 'tree.hdm');
  try {
    const bytes = new Uint8Array(80 * 2 * 8 * SECTOR_SIZE);
    writeFatBpb(bytes, {
      bytesPerSector: SECTOR_SIZE,
      sectorsPerCluster: 1,
      totalSectors: 1280,
      rootEntries: 32,
      sectorsPerFat: 1
    });
    writeFat12Entry(bytes, SECTOR_SIZE, 4, 0xfff);
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE, {
      name: 'GAMES',
      extension: '',
      attribute: 0x10,
      startCluster: 4,
      sizeBytes: 0
    });
    writeFatLongNameEntry(bytes, 3 * SECTOR_SIZE + 32, 'Scenario.txt');
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE + 64, {
      name: 'SCENAR~1',
      extension: 'TXT',
      attribute: 0x20,
      startCluster: 2,
      sizeBytes: 42
    });
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE + 96, {
      name: 'OLD',
      extension: 'BIN',
      attribute: 0x20,
      startCluster: 5,
      sizeBytes: 12,
      deleted: true
    });
    writeFatDirectoryEntry(bytes, 7 * SECTOR_SIZE, {
      name: 'MAP',
      extension: 'DAT',
      attribute: 0x20,
      startCluster: 6,
      sizeBytes: 9
    });
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);

    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.path === 'GAMES/MAP.DAT'), true);
    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.name === 'Scenario.txt'), true);
    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.isDeleted), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('FAT chain parsing and extraction follow fragmented files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-extract-'));
  const diskPath = path.join(dir, 'extract.hdm');
  try {
    const bytes = new Uint8Array(80 * 2 * 8 * SECTOR_SIZE);
    writeFatBpb(bytes, {
      bytesPerSector: SECTOR_SIZE,
      sectorsPerCluster: 1,
      totalSectors: 1280,
      rootEntries: 32,
      sectorsPerFat: 1
    });
    writeFat12Entry(bytes, SECTOR_SIZE, 2, 5);
    writeFat12Entry(bytes, SECTOR_SIZE, 5, 0xfff);
    bytes.fill(0x41, 5 * SECTOR_SIZE, 6 * SECTOR_SIZE);
    bytes.fill(0x42, 8 * SECTOR_SIZE, 9 * SECTOR_SIZE);
    writeFatDirectoryEntry(bytes, 3 * SECTOR_SIZE, {
      name: 'FRAG',
      extension: 'BIN',
      attribute: 0x20,
      startCluster: 2,
      sizeBytes: 700
    });
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);
    const entry = summary.rootDirectoryEntries.find((candidate) => candidate.name === 'FRAG.BIN');
    assert.ok(entry);

    const fat = bytes.subarray(SECTOR_SIZE, 2 * SECTOR_SIZE);
    assert.deepEqual(buildFatClusterChain(fat, summary.filesystems[0], 2, 4), [2, 5]);

    const extracted = await extractFatFileBytes(diskPath, summary.filesystems[0], entry);
    assert.equal(extracted.length, 700);
    assert.equal(extracted[0], 0x41);
    assert.equal(extracted[511], 0x41);
    assert.equal(extracted[512], 0x42);
    assert.equal(extracted[699], 0x42);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('alpha smoke fixture loads, reports, and extracts FAT entries', async () => {
  const fixture = await readAlphaSmokeFixture();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-alpha-smoke-'));
  const diskPath = path.join(dir, `${fixture.name.toLowerCase()}.hdm`);
  try {
    const bytes = materializeFat12Fixture(fixture);
    await writeFile(diskPath, bytes);

    const summary = await buildDiskSummaryFromPath(diskPath);
    const reportText = formatSummaryAsText(summary);

    assert.equal(summary.format, fixture.format);
    assert.equal(summary.filesystems[0].type, 'FAT12');
    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.path === 'ALPHA.TXT'), true);
    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.path === 'TOOLS/RUN.COM'), true);
    assert.equal(summary.rootDirectoryEntries.some((entry) => entry.name === 'Smoke.txt'), true);
    assert.match(reportText, /Filesystems:/);
    assert.match(reportText, /Root Directory:/);
    assert.match(reportText, /TOOLS\/RUN\.COM/);

    const alphaEntry = summary.rootDirectoryEntries.find((entry) => entry.path === 'ALPHA.TXT');
    const runEntry = summary.rootDirectoryEntries.find((entry) => entry.path === 'TOOLS/RUN.COM');
    assert.ok(alphaEntry);
    assert.ok(runEntry);

    const alphaBytes = await extractFatFileBytes(diskPath, summary.filesystems[0], alphaEntry);
    const runBytes = await extractFatFileBytes(diskPath, summary.filesystems[0], runEntry);
    assert.deepEqual(Buffer.from(alphaBytes), Buffer.from(fixture.rootDirectory[0].dataText, 'utf8'));
    assert.deepEqual(Buffer.from(runBytes), Buffer.from(fixture.directories.TOOLS[0].dataHex, 'hex'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('paged byte reader clamps ranges and reads across page boundaries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diskscribe-reader-'));
  const filePath = path.join(dir, 'bytes.bin');
  try {
    const bytes = Buffer.alloc(10000);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251;
    }
    await writeFile(filePath, bytes);

    const reader = new PagedFileByteReader(filePath, bytes.length, {
      pageBytes: 4096,
      maxCachedPages: 2
    });
    try {
      assert.deepEqual(
        Array.from(await reader.readFileBytes(4090, 20)),
        Array.from(bytes.subarray(4090, 4110))
      );
      assert.deepEqual(
        Array.from(await reader.readFileBytes(9990, 30)),
        Array.from(bytes.subarray(9990))
      );
      assert.equal((await reader.readFileBytes(10000, 10)).length, 0);
    } finally {
      reader.dispose();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function readAlphaSmokeFixture() {
  const fixturePath = path.resolve(__dirname, '../../tests/fixtures/alpha-fat12-smoke.json');
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

function materializeFat12Fixture(fixture) {
  const disk = fixture.disk;
  const bytes = new Uint8Array(disk.totalSectors * disk.bytesPerSector);
  writeFatBpb(bytes, {
    bytesPerSector: disk.bytesPerSector,
    sectorsPerCluster: disk.sectorsPerCluster,
    totalSectors: disk.totalSectors,
    rootEntries: disk.rootEntries,
    sectorsPerFat: disk.sectorsPerFat
  });

  const rootDirectoryOffset = getFixtureRootDirectoryOffset(disk);
  writeFixtureDirectoryEntries(bytes, rootDirectoryOffset, fixture.rootDirectory);

  const allEntries = [
    ...fixture.rootDirectory,
    ...Object.values(fixture.directories).flat()
  ];
  for (const entry of allEntries) {
    if (entry.cluster >= 2) {
      for (let fatIndex = 0; fatIndex < 2; fatIndex += 1) {
        const fatOffset = disk.bytesPerSector + fatIndex * disk.sectorsPerFat * disk.bytesPerSector;
        writeFat12Entry(bytes, fatOffset, entry.cluster, 0xfff);
      }
    }
    if (entry.kind === 'file') {
      const data = fixtureEntryData(entry);
      bytes.set(data, getFixtureClusterOffset(disk, entry.cluster));
    }
  }

  for (const [directoryPath, entries] of Object.entries(fixture.directories)) {
    const directory = fixture.rootDirectory.find((entry) => entry.path === directoryPath);
    assert.ok(directory, `Missing directory fixture entry for ${directoryPath}`);
    writeFixtureDirectoryEntries(bytes, getFixtureClusterOffset(disk, directory.cluster), entries);
  }

  return bytes;
}

function writeFixtureDirectoryEntries(bytes, offset, entries) {
  let cursor = offset;
  for (const entry of entries) {
    if (entry.longName) {
      writeFatLongNameEntry(bytes, cursor, entry.longName);
      cursor += 32;
    }

    writeFatDirectoryEntry(bytes, cursor, {
      name: entry.shortName,
      extension: entry.extension,
      attribute: entry.kind === 'directory' ? 0x10 : 0x20,
      startCluster: entry.cluster,
      sizeBytes: entry.kind === 'file' ? fixtureEntryData(entry).length : 0
    });
    cursor += 32;
  }
}

function fixtureEntryData(entry) {
  if (typeof entry.dataHex === 'string') {
    return Buffer.from(entry.dataHex, 'hex');
  }
  return Buffer.from(entry.dataText || '', 'utf8');
}

function getFixtureRootDirectoryOffset(disk) {
  return (1 + 2 * disk.sectorsPerFat) * disk.bytesPerSector;
}

function getFixtureFirstDataLba(disk) {
  const rootDirectorySectors = Math.ceil((disk.rootEntries * 32) / disk.bytesPerSector);
  return 1 + 2 * disk.sectorsPerFat + rootDirectorySectors;
}

function getFixtureClusterOffset(disk, cluster) {
  return (getFixtureFirstDataLba(disk) + cluster - 2) * disk.bytesPerSector;
}

function writeMbr(bytes, offset, entries) {
  bytes[offset + 510] = 0x55;
  bytes[offset + 511] = 0xaa;

  entries.forEach((entry, index) => {
    const base = offset + 446 + index * 16;
    bytes[base] = entry.bootable ? 0x80 : 0x00;
    bytes[base + 4] = entry.typeCode;
    writeUint32LE(bytes, base + 8, entry.startLba);
    writeUint32LE(bytes, base + 12, entry.totalSectors);
  });
}

function writeFatBpb(bytes, options) {
  const offset = options.offset || 0;
  bytes[offset] = 0xeb;
  bytes[offset + 1] = 0x3c;
  bytes[offset + 2] = 0x90;
  writeAscii(bytes, offset + 3, 'DISKSCRB');
  writeUint16LE(bytes, offset + 11, options.bytesPerSector);
  bytes[offset + 13] = options.sectorsPerCluster;
  writeUint16LE(bytes, offset + 14, 1);
  bytes[offset + 16] = 2;
  writeUint16LE(bytes, offset + 17, options.rootEntries || 224);
  writeUint16LE(bytes, offset + 19, options.totalSectors);
  writeUint16LE(bytes, offset + 22, options.sectorsPerFat || 3);
  bytes[offset + 510] = 0x55;
  bytes[offset + 511] = 0xaa;
}

function writeFatDirectoryEntry(bytes, offset, entry) {
  const name = entry.name.padEnd(8, ' ').slice(0, 8);
  const extension = entry.extension.padEnd(3, ' ').slice(0, 3);
  writeAscii(bytes, offset, name + extension);
  if (entry.deleted) {
    bytes[offset] = 0xe5;
  }
  bytes[offset + 11] = entry.attribute;
  writeUint16LE(bytes, offset + 26, entry.startCluster);
  writeUint32LE(bytes, offset + 28, entry.sizeBytes);
}

function writeFat12Entry(bytes, fatOffset, cluster, value) {
  const offset = fatOffset + Math.floor(cluster + cluster / 2);
  const current = bytes[offset] | (bytes[offset + 1] << 8);
  const next = cluster % 2 === 0 ? (current & 0xf000) | (value & 0x0fff) : (current & 0x000f) | ((value & 0x0fff) << 4);
  bytes[offset] = next & 0xff;
  bytes[offset + 1] = (next >>> 8) & 0xff;
}

function writeFatLongNameEntry(bytes, offset, text) {
  bytes[offset] = 0x41;
  bytes[offset + 11] = 0x0f;
  const codes = Array.from(text, (char) => char.charCodeAt(0));
  const positions = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
  positions.forEach((position, index) => {
    const value = index < codes.length ? codes[index] : index === codes.length ? 0x0000 : 0xffff;
    writeUint16LE(bytes, offset + position, value);
  });
}

function createSegaCdMode1Track() {
  const rawSectorSize = 2352;
  const userOffset = 16;
  const userSize = 2048;
  const track = Buffer.alloc(24 * rawSectorSize);
  const fileBytes = Buffer.from('HELLO SEGA CD', 'ascii');

  const pvd = Buffer.alloc(userSize);
  pvd[0] = 1;
  writeAscii(pvd, 1, 'CD001');
  pvd[6] = 1;
  writeAscii(pvd, 8, 'MEGA_CD'.padEnd(32, ' '));
  writeAscii(pvd, 40, 'TESTDISC'.padEnd(32, ' '));
  writeUint32LE(pvd, 80, 24);
  writeIsoDirectoryRecord(pvd, 156, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([0])
  });
  pvd.copy(track, 16 * rawSectorSize + userOffset);

  const root = Buffer.alloc(userSize);
  let cursor = 0;
  cursor += writeIsoDirectoryRecord(root, cursor, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([0])
  });
  cursor += writeIsoDirectoryRecord(root, cursor, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([1])
  });
  writeIsoDirectoryRecord(root, cursor, {
    extentLba: 21,
    sizeBytes: fileBytes.length,
    flags: 0x00,
    rawName: Buffer.from('HELLO.TXT;1', 'ascii')
  });
  root.copy(track, 20 * rawSectorSize + userOffset);
  fileBytes.copy(track, 21 * rawSectorSize + userOffset);
  return track;
}

function createPlainIsoImage() {
  const userSize = 2048;
  const iso = Buffer.alloc(24 * userSize);
  const fileBytes = Buffer.from('HELLO SEGA CD', 'ascii');

  const pvd = Buffer.alloc(userSize);
  pvd[0] = 1;
  writeAscii(pvd, 1, 'CD001');
  pvd[6] = 1;
  writeAscii(pvd, 8, 'MEGA_CD'.padEnd(32, ' '));
  writeAscii(pvd, 40, 'TESTDISC'.padEnd(32, ' '));
  writeUint32LE(pvd, 80, 24);
  writeIsoDirectoryRecord(pvd, 156, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([0])
  });
  pvd.copy(iso, 16 * userSize);

  const root = Buffer.alloc(userSize);
  let cursor = 0;
  cursor += writeIsoDirectoryRecord(root, cursor, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([0])
  });
  cursor += writeIsoDirectoryRecord(root, cursor, {
    extentLba: 20,
    sizeBytes: userSize,
    flags: 0x02,
    rawName: Buffer.from([1])
  });
  writeIsoDirectoryRecord(root, cursor, {
    extentLba: 21,
    sizeBytes: fileBytes.length,
    flags: 0x00,
    rawName: Buffer.from('HELLO.TXT;1', 'ascii')
  });
  root.copy(iso, 20 * userSize);
  fileBytes.copy(iso, 21 * userSize);
  return iso;
}

function writeIsoDirectoryRecord(bytes, offset, record) {
  const nameLength = record.rawName.length;
  const length = 33 + nameLength + (nameLength % 2 === 0 ? 1 : 0);
  bytes[offset] = length;
  bytes[offset + 1] = 0;
  writeUint32LE(bytes, offset + 2, record.extentLba);
  writeUint32BE(bytes, offset + 6, record.extentLba);
  writeUint32LE(bytes, offset + 10, record.sizeBytes);
  writeUint32BE(bytes, offset + 14, record.sizeBytes);
  bytes[offset + 25] = record.flags;
  bytes[offset + 26] = 0;
  bytes[offset + 27] = 0;
  writeUint16LE(bytes, offset + 28, 1);
  writeUint16BE(bytes, offset + 30, 1);
  bytes[offset + 32] = nameLength;
  record.rawName.copy(Buffer.from(bytes.buffer), offset + 33);
  return length;
}

function writeAscii(bytes, offset, text) {
  Buffer.from(text, 'ascii').copy(Buffer.from(bytes.buffer), offset);
}

function writeUint16LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint16BE(bytes, offset, value) {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
