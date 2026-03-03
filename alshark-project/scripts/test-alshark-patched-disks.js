/**
 * ALSHARK Patched Disk Validation Test
 * Validates System and Data disk compatibility for PC-98 emulator
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const PATCHED_DIR = 'ALSHARK-PATCHED-FIXED';
const ORIGINAL_DIR = 'alshark';

// All disks needed for gameplay
const REQUIRED_DISKS = [
  'Alshark (System disk).hdm',   // Boot disk + main code
  'Alshark (Data disk).hdm',     // Graphics, maps, sound
  'Alshark (User disk).hdm',     // Save data
  'Alshark (Opening disk).hdm',  // Opening sequence
  'Alshark (Ending disk).hdm',   // Ending sequence
  'Alshark (Visual disk).hdm'    // Visual scenes
];

console.log('=== ALSHARK Patched Disk Validation ===\n');

// Check all disks exist
console.log('1. Checking required disks...');
let allPresent = true;
for (const disk of REQUIRED_DISKS) {
  const patchedPath = path.join(PATCHED_DIR, disk);
  const exists = fs.existsSync(patchedPath);
  console.log('   ' + (exists ? '✓' : '✗') + ' ' + disk);
  if (!exists) allPresent = false;
}
console.log();

if (!allPresent) {
  console.log('ERROR: Missing disks! Cannot continue.\n');
  process.exit(1);
}

// Validate each disk's boot sector integrity
console.log('2. Validating boot sectors...');
for (const disk of REQUIRED_DISKS) {
  const origPath = path.join(ORIGINAL_DIR, disk);
  const patchedPath = path.join(PATCHED_DIR, disk);
  
  const orig = fs.readFileSync(origPath);
  const patched = fs.readFileSync(patchedPath);
  
  // Check first 512 bytes (boot sector)
  const bootOK = orig.slice(0, 512).equals(patched.slice(0, 512));
  // Check MBR signature
  const mbrSig = patched.readUInt16LE(510) === 0xAA55;
  
  const status = bootOK ? '✓' : '✗';
  const sigStatus = mbrSig ? 'MBR OK' : 'NO MBR';
  console.log('   ' + status + ' ' + disk + ' (' + sigStatus + ')');
}
console.log();

// Validate FAT integrity (critical for disk access)
console.log('3. Validating FAT integrity...');
for (const disk of REQUIRED_DISKS) {
  const origPath = path.join(ORIGINAL_DIR, disk);
  const patchedPath = path.join(PATCHED_DIR, disk);
  
  const orig = fs.readFileSync(origPath);
  const patched = fs.readFileSync(patchedPath);
  
  // FAT12 typically at 0x200-0x2400 for 1.2MB PC-98 disks
  const fatOK = orig.slice(0x200, 0x2400).equals(patched.slice(0x200, 0x2400));
  console.log('   ' + (fatOK ? '✓' : '✗') + ' ' + disk);
}
console.log();

// Check file sizes match
console.log('4. Checking file sizes...');
for (const disk of REQUIRED_DISKS) {
  const origPath = path.join(ORIGINAL_DIR, disk);
  const patchedPath = path.join(PATCHED_DIR, disk);
  
  const origSize = fs.statSync(origPath).size;
  const patchedSize = fs.statSync(patchedPath).size;
  const match = origSize === patchedSize;
  
  console.log('   ' + (match ? '✓' : '✗') + ' ' + disk + ' (' + patchedSize + ' bytes)');
}
console.log();

// Test System+Data disk cross-reference
console.log('5. Testing System/Data disk pair...');
const systemBuf = fs.readFileSync(path.join(PATCHED_DIR, 'Alshark (System disk).hdm'));
const dataBuf = fs.readFileSync(path.join(PATCHED_DIR, 'Alshark (Data disk).hdm'));

// Check both have valid MBR
const sysMbr = systemBuf.readUInt16LE(510) === 0xAA55;
const dataMbr = dataBuf.readUInt16LE(510) === 0xAA55;
console.log('   System disk MBR: ' + (sysMbr ? 'VALID' : 'INVALID'));
console.log('   Data disk MBR: ' + (dataMbr ? 'VALID' : 'INVALID'));

// Check Data disk is identical to original (no patches should be there)
const origData = fs.readFileSync(path.join(ORIGINAL_DIR, 'Alshark (Data disk).hdm'));
const dataIdentical = origData.equals(dataBuf);
console.log('   Data disk unmodified: ' + (dataIdentical ? 'YES' : 'NO (patches applied!)'));
console.log();

// Sample translation verification
console.log('6. Verifying sample translations in System disk...');
const translations = JSON.parse(fs.readFileSync('ALSHARK-TRANSLATED-REV/translations.json'));
const systemTrans = translations.translations.filter(t => t.disk === 'System').slice(0, 3);

for (const t of systemTrans) {
  let end = t.offset;
  while (end < systemBuf.length && systemBuf[end] !== 0) end++;
  const text = systemBuf.slice(t.offset, end).toString('ascii').trim();
  const isEnglish = /^[A-Za-z0-9\s.,!?'"():\-]+$/.test(text.slice(0, 30));
  console.log('   0x' + t.offset.toString(16) + ': ' + (isEnglish ? '✓' : '✗') + ' "' + text.slice(0, 40) + '..."');
}
console.log();

// Summary
console.log('=== VALIDATION COMPLETE ===\n');
console.log('Patched disks ready for emulator testing:');
console.log('  ' + PATCHED_DIR + '/\n');
console.log('Recommended emulators:');
console.log('  - Neko Project II (np2)');
console.log('  - Anex86');
console.log('  - DOSBox-X (with PC-98 mode)\n');
console.log('Boot sequence:');
console.log('  1. Insert System disk in FDD1');
console.log('  2. Insert Data disk in FDD2');
console.log('  3. Boot from FDD1');
console.log('  4. Swap disks as prompted by game\n');
