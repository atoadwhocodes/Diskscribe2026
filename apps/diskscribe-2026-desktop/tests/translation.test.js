const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  decodeBytesByCharset,
  normalizeCharsetId
} = require('../src/webview/necCharsets');
const {
  buildPatchScript,
  buildTranslationProject,
  makeTranslationEntryId,
  mergeTranslationEntries,
  normalizeTranslationEntries
} = require('../src/webview/translationProject');
const {
  applyCleanPatchEntry,
  applyCleanPatchScriptToImages,
  enrichCleanPatchScriptForExport,
  hashFnv1a32Buffer
} = require('../src/core/translationPatchApply');
const {
  runCleanPatchCli
} = require('../src/core/cleanPatchCli');

test('charset aliases normalize to PC-98 defaults', () => {
  assert.equal(normalizeCharsetId('shift_jis'), 'pc98-cp932');
  assert.equal(normalizeCharsetId('pc-88'), 'pc88-ank');
  assert.equal(normalizeCharsetId('unknown'), 'pc98-cp932');
});

test('ASCII and JIS roman decoding preserve visible translation bytes', () => {
  assert.equal(decodeBytesByCharset(Uint8Array.from([0x41, 0x42, 0x43]), 'ascii'), 'ABC');
  assert.equal(decodeBytesByCharset(Uint8Array.from([0x5c, 0x7e]), 'jis-x-0201-roman'), '¥‾');
});

test('translation entries normalize, deduplicate, and sort by range', () => {
  const entries = normalizeTranslationEntries([
    { mode: 'raw', start: 20, end: 24, sourceText: 'B' },
    { mode: 'raw', start: 10, end: 14, sourceText: 'A' },
    { mode: 'raw', start: 10, end: 14, sourceText: 'A2', status: 'final' },
    { mode: 'raw', start: 30, end: 28, sourceText: 'bad' }
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].sourceText, 'A2');
  assert.equal(entries[0].status, 'final');
  assert.equal(entries[1].start, 20);
});

test('translation entry ids can include source path for multi-disk projects', () => {
  assert.equal(makeTranslationEntryId('raw', 16, 31), 'raw:10-1f');
  assert.equal(
    makeTranslationEntryId('raw', 16, 31, 'Alshark (System disk).hdm'),
    'Alshark (System disk).hdm::raw:10-1f'
  );
});

test('translation entries preserve project workflow statuses', () => {
  const entries = normalizeTranslationEntries([
    { mode: 'raw', start: 0, end: 3, status: 'raw' },
    { mode: 'raw', start: 4, end: 7, status: 'patched' },
    { mode: 'raw', start: 8, end: 11, status: 'verified' }
  ]);

  assert.deepEqual(entries.map((entry) => entry.status), ['raw', 'patched', 'verified']);
});

test('translation entries preserve discovery and review metadata', () => {
  const entries = normalizeTranslationEntries([
    {
      mode: 'raw',
      start: 0,
      end: 3,
      sourceBytesBase64: 'QUJDRA==',
      sourceFilePath: 'START.BIN',
      category: 'menus-items-battle',
      priority: 'high',
      score: 88,
      batch: 'menu-pass',
      translator: 'draft-a',
      reviewer: 'review-b',
      bankId: 'menus-items-battle-0001',
      reviewSample: true
    }
  ]);

  assert.equal(entries[0].sourceBytesBase64, 'QUJDRA==');
  assert.equal(entries[0].sourceFilePath, 'START.BIN');
  assert.equal(entries[0].priority, 'high');
  assert.equal(entries[0].score, 88);
  assert.equal(entries[0].reviewSample, true);
});

test('translation project merge replaces matching entry ids', () => {
  const id = makeTranslationEntryId('disk', 1, 4);
  const merged = mergeTranslationEntries(
    [{ id, sourcePath: 'a', mode: 'disk', start: 1, end: 4, encoding: 'ascii', sourceText: 'TEST', translatedText: 'old', status: 'draft', notes: '', updatedAt: '' }],
    [{ id, sourcePath: 'a', mode: 'disk', start: 1, end: 4, encoding: 'ascii', sourceText: 'TEST', translatedText: 'new', status: 'reviewed', notes: '', updatedAt: '' }]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].translatedText, 'new');
  assert.equal(merged[0].status, 'reviewed');
});

test('patch script marks only encodable in-place entries patchable', () => {
  const project = buildTranslationProject('DiskScribe2026', 'disk.hdi', 'disk.hdi', [
    { id: 'a', sourcePath: 'disk.hdi', mode: 'disk', start: 0, end: 3, encoding: 'ascii', sourceText: 'ABCD', translatedText: 'WXYZ', status: 'final', notes: '', updatedAt: '' },
    { id: 'b', sourcePath: 'disk.hdi', mode: 'disk', start: 4, end: 5, encoding: 'ascii', sourceText: 'EF', translatedText: 'LONG', status: 'draft', notes: '', updatedAt: '' },
    { id: 'c', sourcePath: 'disk.hdi', mode: 'disk', start: 6, end: 7, encoding: 'pc98-cp932', sourceText: 'あ', translatedText: 'い', status: 'draft', notes: '', updatedAt: '' }
  ]);
  const script = buildPatchScript('DiskScribe2026', project.sourcePath, project.sourceName, project.entries);

  assert.equal(script.entries[0].patchable, true);
  assert.deepEqual(script.entries[0].replacementBytes, [87, 88, 89, 90]);
  assert.equal(script.entries[1].patchable, false);
  assert.equal(script.entries[2].patchable, false);
});

test('patch script export omits original source text and bytes', () => {
  const project = buildTranslationProject('DiskScribe2026', 'C:\\games\\secret\\disk.hdi', 'disk.hdi', [
    {
      id: 'safe',
      sourcePath: 'C:\\games\\secret\\disk.hdi',
      mode: 'disk',
      start: 16,
      end: 28,
      encoding: 'ascii',
      sourceText: 'ORIGINAL LINE',
      translatedText: 'PATCHED LINE',
      sourceBytesBase64: 'T1JJR0lOQUwgTElORQ==',
      status: 'final',
      notes: '',
      updatedAt: ''
    }
  ]);
  const script = buildPatchScript('DiskScribe2026', project.sourcePath, project.sourceName, project.entries);
  const serialized = JSON.stringify(script);

  assert.equal(script.publicSafe, true);
  assert.equal(script.contents.includesOriginalSourceText, false);
  assert.equal(script.contents.includesOriginalSourceBytes, false);
  assert.equal(script.sourcePath, 'disk.hdi');
  assert.equal(script.entries[0].sourcePath, 'disk.hdi');
  assert.equal(Object.prototype.hasOwnProperty.call(script.entries[0], 'sourceText'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(script.entries[0], 'sourceBytesBase64'), false);
  assert.deepEqual(script.entries[0].sourceVerification, {
    algorithm: 'fnv1a32',
    byteLength: 13,
    hash: '750703dc'
  });
  assert.equal(serialized.includes('ORIGINAL LINE'), false);
  assert.equal(serialized.includes('T1JJR0lOQUwgTElORQ=='), false);
});

test('clean patch export enriches CP932 replacement bytes without source bytes', () => {
  const script = buildPatchScript('DiskScribe2026', 'disc.iso', 'disc.iso', [
    {
      id: 'jp',
      sourcePath: 'disc.iso',
      mode: 'raw',
      start: 0,
      end: 3,
      encoding: 'pc98-cp932',
      sourceText: '原文',
      translatedText: 'あ',
      sourceBytesBase64: 'QUJDRA==',
      status: 'final',
      notes: '',
      updatedAt: ''
    }
  ]);

  const enriched = enrichCleanPatchScriptForExport(script);
  const serialized = JSON.stringify(enriched);

  assert.equal(enriched.entries[0].patchable, true);
  assert.deepEqual(enriched.entries[0].replacementBytes, [0x82, 0xa0]);
  assert.equal(serialized.includes('原文'), false);
  assert.equal(serialized.includes('QUJDRA=='), false);
});

test('Sega CD patch export preserves required controls for patchable entries', () => {
  const script = buildPatchScript('DiskScribe2026', 'alshark.iso', 'alshark.iso', [
    {
      id: 'segacd-ok',
      sourcePath: 'alshark.iso',
      mode: 'raw',
      start: 0,
      end: 15,
      encoding: 'ascii',
      sourceText: '$jHello@World%',
      translatedText: '$jHi@All%',
      sourceFilePath: 'START.BIN',
      status: 'final',
      notes: '',
      updatedAt: ''
    }
  ]);

  assert.equal(script.entries[0].patchable, true);
  assert.equal(script.entries[0].reason, undefined);
});

test('Sega CD patch export blocks missing control tokens and prefixes', () => {
  const script = buildPatchScript('DiskScribe2026', 'alshark.iso', 'alshark.iso', [
    {
      id: 'segacd-missing-controls',
      sourcePath: 'alshark.iso',
      mode: 'raw',
      start: 0,
      end: 15,
      encoding: 'ascii',
      sourceText: '$jHello@World%',
      translatedText: 'Hello World',
      sourceFilePath: 'START.BIN',
      status: 'final',
      notes: '',
      updatedAt: ''
    }
  ]);

  assert.equal(script.entries[0].patchable, false);
  assert.match(script.entries[0].reason, /Missing required Sega CD control prefix \$j/);
  assert.match(script.entries[0].reason, /Missing required Sega CD control token @/);
  assert.match(script.entries[0].reason, /Missing required Sega CD control token %/);
});

test('Sega CD patch export blocks known packed no-go files', () => {
  const script = buildPatchScript('DiskScribe2026', 'alshark.iso', 'alshark.iso', [
    {
      id: 'segacd-mess',
      sourcePath: 'alshark.iso',
      mode: 'raw',
      start: 0,
      end: 15,
      encoding: 'ascii',
      sourceText: 'HELLO',
      translatedText: 'HI',
      sourceFilePath: 'MESS.DAT',
      status: 'final',
      notes: '',
      updatedAt: ''
    }
  ]);

  assert.equal(script.entries[0].patchable, false);
  assert.match(script.entries[0].reason, /MESS\.DAT is marked no-go/);
});

test('clean patch applier verifies fingerprint before writing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-'));
  const imagePath = path.join(dir, 'sample.iso');
  await fs.writeFile(imagePath, Buffer.from('ORIGINAL!!', 'ascii'));

  const result = await applyCleanPatchEntry(imagePath, {
    id: 'ok',
    sourcePath: 'sample.iso',
    mode: 'raw',
    start: 0,
    end: 7,
    encoding: 'ascii',
    translatedText: 'PATCH',
    replacementBytes: [0x50, 0x41, 0x54, 0x43, 0x48],
    byteLength: 8,
    sourceVerification: {
      algorithm: 'fnv1a32',
      byteLength: 8,
      hash: hashFnv1a32Buffer(Buffer.from('ORIGINAL', 'ascii'))
    },
    fitsOriginalRange: true,
    patchable: true
  });

  assert.deepEqual(result, { status: 'applied', verified: true });
  assert.equal((await fs.readFile(imagePath, 'ascii')).slice(0, 8), 'PATCH   ');
});

test('clean patch applier rejects fingerprint mismatch without writing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-'));
  const imagePath = path.join(dir, 'sample.iso');
  await fs.writeFile(imagePath, Buffer.from('DIFFERENT!', 'ascii'));

  const result = await applyCleanPatchEntry(imagePath, {
    id: 'mismatch',
    sourcePath: 'sample.iso',
    mode: 'raw',
    start: 0,
    end: 7,
    encoding: 'ascii',
    translatedText: 'PATCH',
    replacementBytes: [0x50, 0x41, 0x54, 0x43, 0x48],
    byteLength: 8,
    sourceVerification: {
      algorithm: 'fnv1a32',
      byteLength: 8,
      hash: hashFnv1a32Buffer(Buffer.from('ORIGINAL', 'ascii'))
    },
    fitsOriginalRange: true,
    patchable: true
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'Source fingerprint does not match expected image.');
  assert.equal(await fs.readFile(imagePath, 'ascii'), 'DIFFERENT!');
});

test('clean patch applier applies multi-file scripts and reports invalid entries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-'));
  const sourceA = path.join(dir, 'disc-a.iso');
  const sourceB = path.join(dir, 'disc-b.iso');
  const outputFolder = path.join(dir, 'patched');
  await fs.writeFile(sourceA, Buffer.from('AAAABBBB', 'ascii'));
  await fs.writeFile(sourceB, Buffer.from('CCCCDDDD', 'ascii'));

  const report = await applyCleanPatchScriptToImages(
    {
      appName: 'DiskScribe2026',
      patchVersion: 1,
      sourcePath: 'release',
      sourceName: 'multi-disc',
      exportedAt: '',
      publicSafe: true,
      contents: {
        includesOriginalSourceText: false,
        includesOriginalSourceBytes: false,
        includesReplacementBytes: true
      },
      entries: [
        {
          id: 'a',
          sourcePath: 'disc-a.iso',
          mode: 'raw',
          start: 0,
          end: 3,
          encoding: 'ascii',
          translatedText: 'MENU',
          replacementBytes: [0x4d, 0x45, 0x4e, 0x55],
          byteLength: 4,
          sourceVerification: {
            algorithm: 'fnv1a32',
            byteLength: 4,
            hash: hashFnv1a32Buffer(Buffer.from('AAAA', 'ascii'))
          },
          fitsOriginalRange: true,
          patchable: true
        },
        {
          id: 'b',
          sourcePath: 'disc-b.iso',
          mode: 'raw',
          start: 4,
          end: 7,
          encoding: 'ascii',
          translatedText: 'TEXT',
          replacementBytes: [0x54, 0x45, 0x58, 0x54],
          byteLength: 4,
          fitsOriginalRange: true,
          patchable: true
        },
        {
          id: 'bad',
          sourcePath: 'disc-b.iso',
          mode: 'raw',
          start: 0,
          end: 1,
          encoding: 'ascii',
          translatedText: 'TOO LONG',
          replacementBytes: undefined,
          byteLength: 2,
          fitsOriginalRange: false,
          patchable: false,
          reason: 'Translation does not fit in the original byte range.'
        }
      ]
    },
    [sourceA, sourceB],
    outputFolder,
    { createdAt: '2026-05-18T00:00:00.000Z', patchSourcePath: 'patch.json' }
  );

  assert.equal(report.appliedCount, 2);
  assert.equal(report.skippedCount, 1);
  assert.equal(report.verifiedCount, 2);
  assert.equal(report.patchSourcePath, 'patch.json');
  assert.equal(report.sourceFileCount, 2);
  assert.equal(report.patchableEntryCount, 2);
  assert.equal(await fs.readFile(path.join(outputFolder, 'disc-a.iso'), 'ascii'), 'MENUBBBB');
  assert.equal(await fs.readFile(path.join(outputFolder, 'disc-b.iso'), 'ascii'), 'CCCCTEXT');
  assert.equal(report.entries.find((entry) => entry.id === 'bad').reason, 'Translation does not fit in the original byte range.');
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(outputFolder, 'patch-report.json'), 'utf8')),
    JSON.parse(JSON.stringify(report))
  );
});

test('clean patch CLI applies a patch and writes a report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-cli-'));
  const patchPath = path.join(dir, 'patch.json');
  const sourcePath = path.join(dir, 'disc.iso');
  const outputFolder = path.join(dir, 'out');
  await fs.writeFile(sourcePath, Buffer.from('HELLO!!!', 'ascii'));
  await fs.writeFile(
    patchPath,
    JSON.stringify({
      appName: 'DiskScribe2026',
      patchVersion: 1,
      sourcePath: 'disc.iso',
      sourceName: 'disc.iso',
      exportedAt: '',
      publicSafe: true,
      contents: {
        includesOriginalSourceText: false,
        includesOriginalSourceBytes: false,
        includesReplacementBytes: true
      },
      entries: [
        {
          id: 'cli',
          sourcePath: 'disc.iso',
          mode: 'raw',
          start: 0,
          end: 4,
          encoding: 'ascii',
          translatedText: 'BYE',
          replacementBytes: [0x42, 0x59, 0x45],
          byteLength: 5,
          sourceVerification: {
            algorithm: 'fnv1a32',
            byteLength: 5,
            hash: hashFnv1a32Buffer(Buffer.from('HELLO', 'ascii'))
          },
          fitsOriginalRange: true,
          patchable: true
        }
      ]
    }),
    'utf8'
  );

  let stdout = '';
  let stderr = '';
  const exitCode = await runCleanPatchCli(
    ['--patch', patchPath, '--source', sourcePath, '--out', outputFolder],
    {
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } }
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /1 applied, 1 verified, 0 skipped/);
  assert.equal(await fs.readFile(path.join(outputFolder, 'disc.iso'), 'ascii'), 'BYE  !!!');
  assert.equal(JSON.parse(await fs.readFile(path.join(outputFolder, 'patch-report.json'), 'utf8')).appliedCount, 1);
});

test('clean patch CLI returns usage errors for missing arguments', async () => {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCleanPatchCli(['--patch'], {
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: (text) => { stderr += text; } }
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /Missing value for --patch/);
  assert.match(stderr, /Usage:/);
});

test('clean patch dry-run validates without writing output files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-dry-run-'));
  const sourcePath = path.join(dir, 'disc.iso');
  const outputFolder = path.join(dir, 'out');
  await fs.writeFile(sourcePath, Buffer.from('HELLO!!!', 'ascii'));

  const report = await applyCleanPatchScriptToImages(
    {
      appName: 'DiskScribe2026',
      patchVersion: 1,
      sourcePath: 'disc.iso',
      sourceName: 'disc.iso',
      exportedAt: '',
      publicSafe: true,
      contents: {
        includesOriginalSourceText: false,
        includesOriginalSourceBytes: false,
        includesReplacementBytes: true
      },
      entries: [
        {
          id: 'dry',
          sourcePath: 'disc.iso',
          mode: 'raw',
          start: 0,
          end: 4,
          encoding: 'ascii',
          translatedText: 'BYE',
          replacementBytes: [0x42, 0x59, 0x45],
          byteLength: 5,
          sourceVerification: {
            algorithm: 'fnv1a32',
            byteLength: 5,
            hash: hashFnv1a32Buffer(Buffer.from('HELLO', 'ascii'))
          },
          fitsOriginalRange: true,
          patchable: true
        }
      ]
    },
    [sourcePath],
    outputFolder,
    { dryRun: true, createdAt: '2026-05-18T00:00:00.000Z' }
  );

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.appliedCount, 0);
  assert.equal(report.verifiedCount, 1);
  assert.equal(report.skippedCount, 0);
  assert.equal(report.entries[0].status, 'validated');
  assert.equal(await fs.readFile(sourcePath, 'ascii'), 'HELLO!!!');
  await assert.rejects(fs.access(outputFolder));
});

test('clean patch applier rejects unsupported future patch versions without copying sources', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-version-'));
  const sourcePath = path.join(dir, 'disc.iso');
  const outputFolder = path.join(dir, 'out');
  await fs.writeFile(sourcePath, Buffer.from('HELLO!!!', 'ascii'));

  const report = await applyCleanPatchScriptToImages(
    {
      appName: 'DiskScribe2026',
      patchVersion: 999,
      sourcePath: 'disc.iso',
      sourceName: 'disc.iso',
      exportedAt: '',
      publicSafe: true,
      contents: {
        includesOriginalSourceText: false,
        includesOriginalSourceBytes: false,
        includesReplacementBytes: true
      },
      entries: [
        {
          id: 'future',
          sourcePath: 'disc.iso',
          mode: 'raw',
          start: 0,
          end: 4,
          encoding: 'ascii',
          translatedText: 'BYE',
          replacementBytes: [0x42, 0x59, 0x45],
          byteLength: 5,
          fitsOriginalRange: true,
          patchable: true
        }
      ]
    },
    [sourcePath],
    outputFolder,
    { createdAt: '2026-05-18T00:00:00.000Z' }
  );

  assert.equal(report.compatible, false);
  assert.equal(report.appliedCount, 0);
  assert.equal(report.skippedCount, 1);
  assert.match(report.warnings[0], /newer than supported/);
  assert.equal(await fs.readFile(sourcePath, 'ascii'), 'HELLO!!!');
  await assert.rejects(fs.access(path.join(outputFolder, 'disc.iso')));
  assert.equal(JSON.parse(await fs.readFile(path.join(outputFolder, 'patch-report.json'), 'utf8')).skippedCount, 1);
});

test('clean patch CLI dry-run validates without requiring an output folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'diskscribe-clean-patch-cli-dry-run-'));
  const patchPath = path.join(dir, 'patch.json');
  const sourcePath = path.join(dir, 'disc.iso');
  await fs.writeFile(sourcePath, Buffer.from('HELLO!!!', 'ascii'));
  await fs.writeFile(
    patchPath,
    JSON.stringify({
      appName: 'DiskScribe2026',
      patchVersion: 1,
      sourcePath: 'disc.iso',
      sourceName: 'disc.iso',
      exportedAt: '',
      publicSafe: true,
      contents: {
        includesOriginalSourceText: false,
        includesOriginalSourceBytes: false,
        includesReplacementBytes: true
      },
      entries: [
        {
          id: 'cli-dry',
          sourcePath: 'disc.iso',
          mode: 'raw',
          start: 0,
          end: 4,
          encoding: 'ascii',
          translatedText: 'BYE',
          replacementBytes: [0x42, 0x59, 0x45],
          byteLength: 5,
          fitsOriginalRange: true,
          patchable: true
        }
      ]
    }),
    'utf8'
  );

  let stdout = '';
  let stderr = '';
  const exitCode = await runCleanPatchCli(
    ['--dry-run', '--patch', patchPath, '--source', sourcePath],
    {
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } }
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /Validated clean patch/);
  assert.equal(await fs.readFile(sourcePath, 'ascii'), 'HELLO!!!');
});
