#!/usr/bin/env node
/**
 * ALSHARK TEXT EXTRACTION & REINSERTION TOOL
 * Automatically extracts all detectable text from Alshark disk images
 * by category/context, and allows reinsertion of translated text
 */

const fs = require('fs');
const path = require('path');

// Simple Shift-JIS to string conversion (just enough for text detection)
function decodeShiftJis(bytes) {
  try {
    // Use Buffer's built-in latin1 and manually map Shift-JIS
    // For now, just return hex string or count as valid
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 0x20 && b <= 0x7e) {
        result += String.fromCharCode(b);
      } else if (b === 0x00) {
        break;
      } else {
        // Shift-JIS character - just mark as detected
        result += `[SJ:${b.toString(16).padStart(2, '0')}]`;
      }
    }
    return result;
  } catch (e) {
    return '';
  }
}

// PC-98 Shift-JIS character detection
function isShiftJisLead(byte) {
  return (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xef);
}

function isShiftJisTrail(byte) {
  return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc);
}

function isAsciiPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

/**
 * Extract all text strings from a buffer
 * Returns array of {offset, original, category, length}
 */
function extractTextStrings(buffer, diskName) {
  const strings = [];
  let i = 0;

  while (i < buffer.length) {
    // Check for Shift-JIS string
    if (isShiftJisLead(buffer[i]) && i + 1 < buffer.length && isShiftJisTrail(buffer[i + 1])) {
      const start = i;
      const bytes = [];

      while (i < buffer.length) {
        if (isShiftJisLead(buffer[i]) && i + 1 < buffer.length && isShiftJisTrail(buffer[i + 1])) {
          bytes.push(buffer[i]);
          bytes.push(buffer[i + 1]);
          i += 2;
        } else if (isAsciiPrintable(buffer[i])) {
          bytes.push(buffer[i]);
          i++;
        } else if (buffer[i] === 0x00) {
          // String terminator
          break;
        } else {
          break;
        }
      }

      if (bytes.length >= 2) {
        try {
          const decoded = decodeShiftJis(Buffer.from(bytes));
          if (decoded.length > 0) {
            strings.push({
              disk: diskName,
              offset: `0x${start.toString(16).padStart(6, '0')}`,
              offsetDec: start,
              original: decoded,
              category: categorizeString(decoded),
              length: bytes.length,
              rawBytes: Buffer.from(bytes)
            });
          }
        } catch (e) {
          // Skip decode errors
        }
      }

      // Skip null terminators
      while (i < buffer.length && buffer[i] === 0x00) {
        i++;
      }
    } else if (isAsciiPrintable(buffer[i])) {
      // ASCII string
      const start = i;
      const bytes = [];

      while (i < buffer.length && isAsciiPrintable(buffer[i])) {
        bytes.push(buffer[i]);
        i++;
      }

      if (bytes.length >= 3) {
        const decoded = Buffer.from(bytes).toString('ascii');
        strings.push({
          disk: diskName,
          offset: `0x${start.toString(16).padStart(6, '0')}`,
          offsetDec: start,
          original: decoded,
          category: 'ascii',
          length: bytes.length,
          rawBytes: Buffer.from(bytes)
        });
      }

      while (i < buffer.length && buffer[i] === 0x00) {
        i++;
      }
    } else {
      i++;
    }
  }

  return strings;
}

/**
 * Categorize text by likely meaning
 */
function categorizeString(text) {
  const lower = text.toLowerCase();

  // Dialog/narrative
  if (text.length > 20) return 'dialog';
  if (/[、。？！]/.test(text)) return 'dialog_punctuated';

  // UI/Menu
  if (/選択|決定|キャンセル|はい|いいえ|OK/.test(text)) return 'ui_menu';
  if (/装備|道具|魔法|ステータス|セーブ|ロード|終了/.test(text)) return 'ui_menu';
  if (/^[A-Za-z0-9]{2,6}$/.test(text)) return 'ui_code';

  // Combat/Status
  if (/攻撃|防御|回避|ダメージ|HP|MP|EXP/.test(text)) return 'combat_status';
  if (/敵|味方|死亡|勝利|敗北|逃走/.test(text)) return 'combat_action';

  // Names/Items
  if (text.length <= 8 && /[ァ-ヴー]|[漢]|[A-Z]/.test(text)) return 'name_item';

  // Location/Area
  if (text.length <= 12 && /村|町|城|塔|森|洞/.test(text)) return 'location';

  // Unknown/Other
  return 'other';
}

/**
 * Save extracted strings as JSON with structure for translation
 */
function saveExtractionResult(strings, outputPath) {
  const byCategory = {};
  strings.forEach((str) => {
    if (!byCategory[str.category]) {
      byCategory[str.category] = [];
    }
    byCategory[str.category].push({
      disk: str.disk,
      offset: str.offset,
      original: str.original,
      translation: '', // Empty - ready for translation
      notes: '',
      verified: false
    });
  });

  const result = {
    exportDate: new Date().toISOString(),
    totalStrings: strings.length,
    byCategory,
    stats: {
      dialog: (byCategory.dialog || []).length,
      ui_menu: (byCategory.ui_menu || []).length,
      combat: ((byCategory.combat_status || []).length + (byCategory.combat_action || []).length),
      names: (byCategory.name_item || []).length,
      other: (byCategory.other || []).length
    }
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`✓ Extracted ${strings.length} text strings`);
  console.log(`✓ Saved to: ${outputPath}`);
  return result;
}

/**
 * Process extracted strings and prepare for reinsertion
 */
function prepareForReinsertion(extractionJson, translationJson) {
  const extracted = JSON.parse(fs.readFileSync(extractionJson, 'utf8'));
  const translations = JSON.parse(fs.readFileSync(translationJson, 'utf8'));

  const reinsertion = {
    timestamp: new Date().toISOString(),
    plan: []
  };

  Object.entries(extracted.byCategory).forEach(([category, strings]) => {
    const translatedStrings = translations.byCategory[category] || [];

    strings.forEach((str, idx) => {
      const translated = translatedStrings[idx];
      if (translated && translated.translation && translated.verified) {
        reinsertion.plan.push({
          disk: str.disk,
          offset: str.offset,
          category,
          original: str.original,
          translation: translated.translation,
          action: 'replace',
          status: 'pending'
        });
      }
    });
  });

  fs.writeFileSync(
    path.join(path.dirname(translationJson), 'reinsertion-plan.json'),
    JSON.stringify(reinsertion, null, 2)
  );

  console.log(`✓ Created reinsertion plan with ${reinsertion.plan.length} translations`);
  return reinsertion;
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0] || 'extract';

if (command === 'extract') {
  console.log('ALSHARK TEXT EXTRACTION TOOL');
  console.log('═'.repeat(70));
  console.log('');

  const diskFolder = args[1] || 'E:\\Alshark-Translation\\disk-images';
  const outputFolder = args[2] || 'E:\\Alshark-Translation\\extracted-text';

  if (!fs.existsSync(diskFolder)) {
    console.error(`Error: Disk folder not found: ${diskFolder}`);
    console.error('Usage: node extract-alshark-text.js extract <disk-folder> <output-folder>');
    process.exit(1);
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const diskFiles = fs.readdirSync(diskFolder).filter((f) => /\.(hdm|hdi|d88)$/i.test(f));

  console.log(`Found ${diskFiles.length} disk images in ${diskFolder}`);
  console.log('');

  let allStrings = [];

  diskFiles.forEach((file) => {
    const filePath = path.join(diskFolder, file);
    const stats = fs.statSync(filePath);
    console.log(`Processing: ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    const buffer = fs.readFileSync(filePath);
    const strings = extractTextStrings(buffer, file);
    console.log(`  Found ${strings.length} text strings`);

    allStrings = allStrings.concat(strings);
  });

  console.log('');
  console.log('EXTRACTION SUMMARY');
  console.log('═'.repeat(70));

  const byCategory = {};
  allStrings.forEach((str) => {
    byCategory[str.category] = (byCategory[str.category] || 0) + 1;
  });

  Object.entries(byCategory).forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(20)}: ${count} strings`);
  });

  console.log('');

  const extractionPath = path.join(outputFolder, 'extraction.json');
  saveExtractionResult(allStrings, extractionPath);

  console.log('');
  console.log('NEXT STEPS:');
  console.log('1. Open extraction.json');
  console.log('2. Fill in "translation" fields for each string');
  console.log('3. Mark "verified: true" when translation is confirmed');
  console.log('4. Run: node extract-alshark-text.js reinsertion <extraction.json> <translation.json>');
} else if (command === 'reinsertion') {
  console.log('ALSHARK REINSERTION PLAN BUILDER');
  console.log('═'.repeat(70));
  console.log('');

  const extractionJson = args[1];
  const translationJson = args[2];

  if (!extractionJson || !translationJson) {
    console.error('Usage: node extract-alshark-text.js reinsertion <extraction.json> <translation.json>');
    process.exit(1);
  }

  if (!fs.existsSync(extractionJson) || !fs.existsSync(translationJson)) {
    console.error('Error: One or both JSON files not found');
    process.exit(1);
  }

  prepareForReinsertion(extractionJson, translationJson);

  console.log('');
  console.log('Reinsertion plan created: reinsertion-plan.json');
  console.log('');
  console.log('NEXT STEPS:');
  console.log('1. Review reinsertion-plan.json');
  console.log('2. For each translation, verify offset and format match');
  console.log('3. In DiskScribe: Open disk → Jump to offset → Patch bytes with translated text');
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage:');
  console.error('  node extract-alshark-text.js extract [disk-folder] [output-folder]');
  console.error('  node extract-alshark-text.js reinsertion <extraction.json> <translation.json>');
  process.exit(1);
}
