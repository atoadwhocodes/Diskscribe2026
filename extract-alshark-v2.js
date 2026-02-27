#!/usr/bin/env node
/**
 * ALSHARK EXTRACTION ENGINE v2
 * Integrates with translation service and disk reinsertion system
 * Handles bilingual extraction with precise offset mapping
 */

const fs = require('fs');
const path = require('path');
const { decodeShiftJis } = require('./src/translation-service');

/**
 * Extract text with exact byte-level metadata
 */
class TextExtractor {
  constructor() {
    this.strings = [];
  }

  isShiftJisLead(byte) {
    return (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xef);
  }

  isShiftJisTrail(byte) {
    return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc);
  }

  isAsciiPrintable(byte) {
    return byte >= 0x20 && byte <= 0x7e;
  }

  /**
   * Extract all text regions from a disk buffer
   */
  extractFromBuffer(buffer, diskName) {
    const extracted = [];
    let i = 0;

    while (i < buffer.length) {
      // Try Shift-JIS strings
      if (this.isShiftJisLead(buffer[i]) && i + 1 < buffer.length && this.isShiftJisTrail(buffer[i + 1])) {
        const startOffset = i;
        const bytes = [];

        // Collect full Shift-JIS string
        while (i < buffer.length) {
          if (this.isShiftJisLead(buffer[i]) && i + 1 < buffer.length && this.isShiftJisTrail(buffer[i + 1])) {
            bytes.push(buffer[i]);
            bytes.push(buffer[i + 1]);
            i += 2;
          } else if (this.isAsciiPrintable(buffer[i])) {
            bytes.push(buffer[i]);
            i++;
          } else if (buffer[i] === 0x00) {
            break;
          } else {
            break;
          }
        }

        if (bytes.length >= 2) {
          try {
            const byteBuffer = Buffer.from(bytes);
            const decoded = decodeShiftJis(byteBuffer);

            if (decoded && decoded.length > 0) {
              extracted.push({
                diskName,
                offset: startOffset,
                offsetHex: `0x${startOffset.toString(16).padStart(6, '0')}`,
                originalBytes: byteBuffer,
                originalText: decoded,
                length: bytes.length,
                encoding: 'shift-jis',
                isJapanese: decoded.includes('あ') || decoded.includes('【'),
                category: this.categorizeString(decoded)
              });
            }
          } catch (e) {
            // Skip decode errors
          }
        }

        // Skip nulls
        while (i < buffer.length && buffer[i] === 0x00) {
          i++;
        }
      }
      // Try ASCII strings
      else if (this.isAsciiPrintable(buffer[i])) {
        const startOffset = i;
        const bytes = [];

        while (i < buffer.length && this.isAsciiPrintable(buffer[i])) {
          bytes.push(buffer[i]);
          i++;
        }

        if (bytes.length >= 3) {
          const byteBuffer = Buffer.from(bytes);
          const decoded = byteBuffer.toString('ascii');

          extracted.push({
            diskName,
            offset: startOffset,
            offsetHex: `0x${startOffset.toString(16).padStart(6, '0')}`,
            originalBytes: byteBuffer,
            originalText: decoded,
            length: bytes.length,
            encoding: 'ascii',
            isJapanese: false,
            category: this.categorizeString(decoded)
          });
        }

        while (i < buffer.length && buffer[i] === 0x00) {
          i++;
        }
      } else {
        i++;
      }
    }

    return extracted;
  }

  categorizeString(text) {
    const lower = text.toLowerCase();

    // UI/Menu strings
    if(/new game|continue|save|load|options|exit|resume|quit/i.test(text)) {
      return 'ui_menu';
    }

    // Combat/Status
    if(/attack|defend|magic|item|damage|hp|mp|exp|enemy|victory|defeat/i.test(text)) {
      return 'combat_status';
    }

    // Names/Items (short, usually 2-8 chars)
    if (text.length <= 12 && /^[A-Za-z0-9 ']+$/.test(text)) {
      return 'name_item';
    }

    // Dialog (longer, punctuation)
    if (text.length > 20) {
      return 'dialog';
    }

    return 'other';
  }
}

/**
 * Extract from all disks and create translation-ready JSON
 */
function extractAllDisks(diskFolder, outputFolder) {
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const diskFiles = fs.readdirSync(diskFolder).filter((f) => /\.(hdm|hdi|d88|fdi)$/i.test(f));

  console.log(`ALSHARK TEXT EXTRACTION ENGINE v2`);
  console.log('═'.repeat(80));
  console.log(`Found ${diskFiles.length} disk images\n`);

  const extractor = new TextExtractor();
  let totalExtracted = 0;
  const byCategoryTotal = {};

  diskFiles.forEach((file) => {
    const filePath = path.join(diskFolder, file);
    const stats = fs.statSync(filePath);

    console.log(`📀 ${file.padEnd(30)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    const buffer = fs.readFileSync(filePath);
    const diskExtracted = extractor.extractFromBuffer(buffer, file);

    console.log(`   └─ Found ${diskExtracted.length} text strings`);
    totalExtracted += diskExtracted.length;

    // Count by category
    diskExtracted.forEach((str) => {
      byCategoryTotal[str.category] = (byCategoryTotal[str.category] || 0) + 1;
    });

    // Save disk-specific extraction
    const diskExtractionPath = path.join(outputFolder, `${file}.extraction.json`);
    fs.writeFileSync(diskExtractionPath, JSON.stringify(diskExtracted, null, 2));
  });

  console.log('\n');
  console.log('EXTRACTION SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Total strings found: ${totalExtracted}`);
  console.log('');
  console.log('By Category:');
  Object.entries(byCategoryTotal)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  ${category.padEnd(20)}: ${count.toString().padStart(6)} strings`);
    });

  // Create master extraction file
  const masterExtractionPath = path.join(outputFolder, 'extraction-master.json');
  const masterExtraction = {
    exportDate: new Date().toISOString(),
    totalStrings: totalExtracted,
    byCategory: byCategoryTotal,
    disks: diskFiles,
    diskExtractionsPath: outputFolder
  };

  fs.writeFileSync(masterExtractionPath, JSON.stringify(masterExtraction, null, 2));

  console.log('\n');
  console.log('OUTPUT FILES CREATED');
  console.log('═'.repeat(80));
  console.log(`✓ extraction-master.json - Summary and disk list`);
  diskFiles.forEach((file) => {
    console.log(`✓ ${file}.extraction.json - Strings from "${file}"`);
  });

  console.log('\n');
  console.log('NEXT STEPS');
  console.log('═'.repeat(80));
  console.log('1. Load extraction in Translation Tools panel');
  console.log('2. Automatic translation will be applied');
  console.log('3. Review and edit translations as needed');
  console.log('4. Click "Apply Translations" to create patched disks');
  console.log('5. Test patched disks in emulator\n');

  return {
    totalExtracted,
    byCategory: byCategoryTotal,
    outputFolder,
    masterPath: masterExtractionPath
  };
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'help';

if (command === 'extract') {
  const diskFolder = args[1] || path.join(__dirname, '..', 'alshark');
  const outputFolder = args[2] || path.join(__dirname, '..', 'alshark-extracted');

  if (!fs.existsSync(diskFolder)) {
    console.error(`Error: Disk folder not found: ${diskFolder}`);
    process.exit(1);
  }

  extractAllDisks(diskFolder, outputFolder);
} else if (command === 'help' || command === '--help') {
  console.log(`
ALSHARK TEXT EXTRACTION ENGINE v2

Usage:
  node extract-alshark-v2.js extract [disk-folder] [output-folder]

Examples:
  node extract-alshark-v2.js extract
  node extract-alshark-v2.js extract "C:\\Alshark\\disks" "C:\\Alshark\\extracted"

The extraction process will:
  1. Scan all .hdm, .hdi, .d88, .fdi disk images
  2. Extract all detectable text strings
  3. Preserve exact offset and byte-length information
  4. Create JSON files with full metadata for reinsertion
  5. Prepare extraction for automatic translation

Output:
  - extraction-master.json (summary)
  - [diskname].extraction.json (per-disk extractions)

Translation:
  All extracted text is ready for automatic translation via:
  - Claude API (recommended for quality)
  - Mock backend (for testing)
  `);
} else {
  console.error(`Unknown command: ${command}`);
  console.error(`Use: node extract-alshark-v2.js help`);
  process.exit(1);
}

module.exports = { TextExtractor, extractAllDisks };
