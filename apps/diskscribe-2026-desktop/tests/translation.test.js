const assert = require('node:assert/strict');
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
