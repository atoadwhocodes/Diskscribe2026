/**
 * ALSHARK Disk Patcher - FIXED version
 * Properly pads translations to match original byte length
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const TRANSLATIONS_FILE = 'ALSHARK-TRANSLATED-REV/translations.json';
const SOURCE_DIR = 'alshark';
const OUTPUT_DIR = 'ALSHARK-PATCHED-FIXED';

const DISK_FILES = {
  'System': 'Alshark (System disk).hdm',
  'Opening': 'Alshark (Opening disk).hdm',
  'Ending': 'Alshark (Ending disk).hdm',
  'Visual': 'Alshark (Visual disk).hdm'
};

function main() {
  console.log('=== ALSHARK Disk Patcher (FIXED) ===\n');

  if (!fs.existsSync(TRANSLATIONS_FILE)) {
    console.error('Translations file not found:', TRANSLATIONS_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8'));
  console.log(`Loaded ${data.translations.length} translations`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Group by disk
  const byDisk = {};
  for (const t of data.translations) {
    if (!byDisk[t.disk]) byDisk[t.disk] = [];
    byDisk[t.disk].push(t);
  }

  const stats = { patched: 0, skipped: 0 };

  for (const [diskName, filename] of Object.entries(DISK_FILES)) {
    const sourcePath = path.join(SOURCE_DIR, filename);
    const outputPath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(sourcePath)) {
      console.log(`\n[${diskName}] Source not found, skipping`);
      continue;
    }

    // Read original disk
    const origBuf = fs.readFileSync(sourcePath);
    const buf = Buffer.from(origBuf); // Copy for modification

    console.log(`\n[${diskName}] Processing ${filename}...`);

    const diskTranslations = byDisk[diskName] || [];
    let diskPatched = 0, diskSkipped = 0;

    for (const t of diskTranslations) {
      if (t.translation === '[ERROR]' || t.translation === '[EMPTY]') {
        diskSkipped++;
        continue;
      }

      // Calculate ACTUAL original string length by finding null terminator in original
      let origEnd = t.offset;
      while (origEnd < origBuf.length && origBuf[origEnd] !== 0) {
        origEnd++;
      }
      const origLength = origEnd - t.offset;

      // Skip if too short or in code area
      // System disk: Real dialogue starts at ~0x50000, lower areas are code/data
      // Other disks: FAT ends at 0x2400
      const minOffset = t.disk === 'System' ? 0x50000 : 0x2400;
      if (origLength < 4 || t.offset < minOffset) {
        diskSkipped++;
        continue;
      }

      // Prepare translation text - keep @ for line breaks as is
      let text = t.translation.replace(/\s+/g, ' ').trim();
      
      if (!text || text.length < 2) {
        diskSkipped++;
        continue;
      }

      // Encode to ASCII (safe for PC-98 display)
      let encoded = Buffer.from(text.replace(/[^\x20-\x7E@#!]/g, ''), 'ascii');

      // If translation is longer than original space, truncate
      if (encoded.length >= origLength) {
        text = text.slice(0, origLength - 4) + '...';
        encoded = Buffer.from(text.replace(/[^\x20-\x7E@#!]/g, ''), 'ascii');
      }

      // CRITICAL: Clear the ENTIRE original string area first
      // Fill with spaces (0x20) up to original length
      for (let i = 0; i < origLength; i++) {
        buf[t.offset + i] = 0x20; // Space
      }

      // Write the translation
      encoded.copy(buf, t.offset);

      // Null terminate at end of original space (not after translation)
      buf[t.offset + origLength] = 0x00;

      diskPatched++;
    }

    fs.writeFileSync(outputPath, buf);
    console.log(`  Patched: ${diskPatched}, Skipped: ${diskSkipped}`);
    stats.patched += diskPatched;
    stats.skipped += diskSkipped;
  }

  // Copy non-patched disks as-is
  console.log('\nCopying unmodified disks...');
  for (const disk of ['Data', 'User']) {
    const filename = `Alshark (${disk} disk).hdm`;
    const src = path.join(SOURCE_DIR, filename);
    const dst = path.join(OUTPUT_DIR, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`  Copied: ${filename}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total patched: ${stats.patched}`);
  console.log(`Total skipped: ${stats.skipped}`);
  console.log(`Output: ${OUTPUT_DIR}/`);
}

main();
