/**
 * ALSHARK Disk Patcher - Apply translations to disk images
 * Based on reverse-engineered extraction with proper offset mapping
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const TRANSLATIONS_FILE = 'ALSHARK-TRANSLATED-REV/translations.json';
const SOURCE_DIR = 'alshark';
const OUTPUT_DIR = 'ALSHARK-PATCHED-FINAL';

const DISK_FILES = {
  'System': 'Alshark (System disk).hdm',
  'Opening': 'Alshark (Opening disk).hdm',
  'Ending': 'Alshark (Ending disk).hdm',
  'Visual': 'Alshark (Visual disk).hdm'
};

function main() {
  console.log('=== ALSHARK Disk Patcher ===\n');

  // Load translations
  if (!fs.existsSync(TRANSLATIONS_FILE)) {
    console.error('Translations file not found:', TRANSLATIONS_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8'));
  console.log(`Loaded ${data.translations.length} translations`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Group translations by disk
  const byDisk = {};
  for (const t of data.translations) {
    if (!byDisk[t.disk]) byDisk[t.disk] = [];
    byDisk[t.disk].push(t);
  }

  console.log('\nBy disk:');
  for (const [disk, items] of Object.entries(byDisk)) {
    console.log(`  ${disk}: ${items.length} strings`);
  }

  // Process each disk
  const stats = { patched: 0, skipped: 0, errors: 0 };

  for (const [diskName, filename] of Object.entries(DISK_FILES)) {
    const sourcePath = path.join(SOURCE_DIR, filename);
    const outputPath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(sourcePath)) {
      console.log(`\n[${diskName}] Source not found, skipping`);
      continue;
    }

    // Copy disk to output
    fs.copyFileSync(sourcePath, outputPath);
    const buf = fs.readFileSync(outputPath);

    console.log(`\n[${diskName}] Processing ${filename}...`);

    const diskTranslations = byDisk[diskName] || [];
    let diskPatched = 0;
    let diskSkipped = 0;

    for (const t of diskTranslations) {
      // Skip error translations
      if (t.translation === '[ERROR]' || t.translation === '[EMPTY]') {
        diskSkipped++;
        continue;
      }

      // Clean translation for game use
      let text = t.translation
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();

      // Skip if translation is too long or empty
      if (!text || text.length < 2) {
        diskSkipped++;
        continue;
      }

      // Encode to Shift-JIS
      let encoded;
      try {
        encoded = iconv.encode(text, 'shiftjis');
      } catch (e) {
        // Fall back to ASCII
        encoded = Buffer.from(text.replace(/[^\x20-\x7E]/g, '?'), 'ascii');
      }

      // Check if fits in slot
      if (encoded.length >= t.maxBytes) {
        // Try to truncate
        while (encoded.length >= t.maxBytes - 1 && text.length > 10) {
          text = text.slice(0, -5) + '...';
          encoded = iconv.encode(text, 'shiftjis');
        }
        
        if (encoded.length >= t.maxBytes) {
          diskSkipped++;
          continue;
        }
      }

      // Safety check: don't write to boot sector or beyond file
      if (t.offset < 0x1000 || t.offset + encoded.length >= buf.length) {
        diskSkipped++;
        continue;
      }

      // Write translation
      encoded.copy(buf, t.offset);
      // Null terminate
      buf[t.offset + encoded.length] = 0x00;
      
      diskPatched++;
    }

    // Save patched disk
    fs.writeFileSync(outputPath, buf);

    console.log(`  Patched: ${diskPatched}`);
    console.log(`  Skipped: ${diskSkipped}`);

    stats.patched += diskPatched;
    stats.skipped += diskSkipped;
  }

  console.log('\n=== Summary ===');
  console.log(`Total patched: ${stats.patched}`);
  console.log(`Total skipped: ${stats.skipped}`);
  console.log(`Output: ${OUTPUT_DIR}/`);
}

main();
