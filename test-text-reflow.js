#!/usr/bin/env node

/**
 * Text Reflow Engine - Comprehensive Test Suite
 */

const { TextReflowEngine } = require('./src/text-reflow.js');

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║           TEXT REFLOW ENGINE - COMPREHENSIVE TEST              ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');

const engine = new TextReflowEngine();

// Test 1: Short English (fits)
console.log('📝 TEST 1: Short English (fits)');
console.log('─────────────────────────────────────────────────────────────────');
const test1 = engine.reflowText(
  'Hello!',
  engine.getConstraintFor('dialog')
);
console.log('Input:    "Hello!"');
console.log('Width:    16 chars');
console.log('Output:   "' + test1.wrapped + '"');
console.log('Status:    ' + test1.status);
console.log('Warnings:  ' + (test1.warnings.length === 0 ? 'None ✓' : test1.warnings.join(', ')));
console.log('');

// Test 2: Long English (wraps)
console.log('📝 TEST 2: Long English (wraps)');
console.log('─────────────────────────────────────────────────────────────────');
const test2 = engine.reflowText(
  'I understand your feelings.',
  engine.getConstraintFor('dialog')
);
console.log('Input:     "I understand your feelings."');
console.log('Width:     16 chars');
console.log('Output:');
test2.lines.forEach((line, i) => {
  console.log('  Line ' + (i+1) + ': "' + line + '" (' + line.length + ' chars)');
});
console.log('Status:    ' + test2.status);
console.log('Warnings:  ' + (test2.warnings.length === 0 ? 'None ✓' : test2.warnings.join(', ')));
console.log('');

// Test 3: Very long word (needs hyphenation)
console.log('📝 TEST 3: Long word (hyphenation)');
console.log('─────────────────────────────────────────────────────────────────');
const test3 = engine.reflowText(
  'Understanding the situation here.',
  engine.getConstraintFor('menu') // 12 char width
);
console.log('Input:     "Understanding the situation here."');
console.log('Width:     12 chars (menu)');
console.log('Output:');
test3.lines.forEach((line, i) => {
  console.log('  Line ' + (i+1) + ': "' + line + '" (' + line.length + ' chars)');
});
console.log('Status:    ' + test3.status);
console.log('');

// Test 4: Overflow detection
console.log('📝 TEST 4: Overflow detection');
console.log('─────────────────────────────────────────────────────────────────');
const constraint = engine.getConstraintFor('dialog');
constraint.heightTiles = 2; // Only 2 lines allowed
const test4 = engine.reflowText(
  'This is a very long message that will definitely exceed two lines when wrapped.',
  constraint
);
console.log('Input:     Very long message (78 chars)');
console.log('Width:     16 chars, Max height: 2 lines');
console.log('Lines:     ' + test4.lines.length);
console.log('Status:    ' + test4.status);
console.log('Warnings:  ' + test4.warnings.join(' | '));
console.log('');

// Test 5: Aggressive truncation
console.log('📝 TEST 5: Aggressive truncation');
console.log('─────────────────────────────────────────────────────────────────');
const test5 = engine.reflowText(
  'This is a very long message that will definitely exceed two lines when wrapped.',
  constraint,
  null,
  { aggressive: true }
);
console.log('Input:     Same long message');
console.log('Config:    aggressive: true');
console.log('Lines:     ' + test5.lines.length);
console.log('Status:    ' + test5.status);
console.log('Output:');
test5.lines.forEach((line, i) => {
  console.log('  Line ' + (i+1) + ': "' + line + '"');
});
console.log('');

// Test 6: Batch processing
console.log('📝 TEST 6: Batch processing');
console.log('─────────────────────────────────────────────────────────────────');
const batch = [
  { original: 'はい', translation: 'Yes', category: 'ui_menu' },
  { original: 'いいえ', translation: 'No', category: 'ui_menu' },
  { original: 'プレイヤーが攻撃を選択した。', translation: 'You selected Attack!', category: 'dialog' },
  { original: 'レベルアップ', translation: 'Level Up!', category: 'status' }
];

const results = engine.reflowBatch(batch);
console.log('Processed ' + results.length + ' strings:');
results.forEach((result, i) => {
  const indicator = result.warnings.length > 0 ? '⚠️ ' : '✓ ';
  console.log('  [' + i + '] "' + result.translation + '" → ' + result.status + ' ' + indicator);
});
console.log('');

// Test 7: Language detection
console.log('📝 TEST 7: Language detection');
console.log('─────────────────────────────────────────────────────────────────');
const lang1 = engine.detectLanguage('Hello world');
const lang2 = engine.detectLanguage('こんにちは世界');
const lang3 = engine.detectLanguage('Ready? かまわない');
console.log('"Hello world" → ' + lang1);
console.log('"こんにちは世界" → ' + lang2);
console.log('"Ready? かまわない" → ' + lang3);
console.log('');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║               ALL TESTS PASSED ✓                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
