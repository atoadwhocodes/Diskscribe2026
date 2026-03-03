/**
 * ALSHARK Disk Patcher V3 — Clean Overwrite Approach
 *
 * V2's classifyBytes approach preserved control codes at fixed byte positions,
 * which garbled text when English translations didn't align with the original
 * Japanese byte layout (e.g. "Sulliv@an" because @ was stuck at its old position).
 *
 * V3 approach:
 *   1. Parse the original string to extract structural control codes
 *      (page breaks, wait markers, suffix markers) IN ORDER.
 *   2. Overwrite the ENTIRE byte region with the English translation
 *      encoded in full-width SJIS.
 *   3. Add @ line breaks for proper word wrapping (~12 FW chars per line).
 *   4. Insert dialog pacing markers (!0 + 0_) between sentence groups,
 *      matching the number of page breaks in the original.
 *   5. Preserve terminal suffix codes (#S, 0#P, etc.) at the end.
 *   6. Pad remainder with null bytes.
 */

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT     = path.join(__dirname, '..');
const TRANSLATIONS_FILE = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV', 'translations.json');
const SOURCE_DIR        = path.join(PROJECT_ROOT, 'disks');
const OUTPUT_DIR        = path.join(PROJECT_ROOT, 'output', 'ALSHARK-PATCHED-FW');

// Dialog box width in full-width characters (1 FW char = 2 bytes)
const LINE_WIDTH = 12;

// Full-width SJIS lookup: ASCII char code → [lead, trail] byte pair
const FW_MAP = {};
for (let c = 0x41; c <= 0x5A; c++) FW_MAP[c] = [0x82, 0x60 + (c - 0x41)]; // A-Z
for (let c = 0x61; c <= 0x7A; c++) FW_MAP[c] = [0x82, 0x81 + (c - 0x61)]; // a-z
for (let c = 0x30; c <= 0x39; c++) FW_MAP[c] = [0x82, 0x4F + (c - 0x30)]; // 0-9
FW_MAP[0x20] = [0x81, 0x40]; // space
FW_MAP[0x21] = [0x81, 0x49]; // !
FW_MAP[0x2C] = [0x81, 0x43]; // ,
FW_MAP[0x2E] = [0x81, 0x44]; // .
FW_MAP[0x3F] = [0x81, 0x48]; // ?
FW_MAP[0x3A] = [0x81, 0x46]; // :
FW_MAP[0x3B] = [0x81, 0x47]; // ;
FW_MAP[0x27] = [0x81, 0x66]; // '
FW_MAP[0x22] = [0x81, 0x68]; // "
FW_MAP[0x28] = [0x81, 0x69]; // (
FW_MAP[0x29] = [0x81, 0x6A]; // )
FW_MAP[0x2D] = [0x81, 0x7C]; // -
FW_MAP[0x2F] = [0x81, 0x5E]; // /

const DISK_FILES = {
  System:  'Alshark (System disk).hdm',
  Opening: 'Alshark (Opening disk).hdm',
  Ending:  'Alshark (Ending disk).hdm',
  Visual:  'Alshark (Visual disk).hdm',
};

// ---------------------------------------------------------------------------
// Parse original string to extract structure:
//   - How many page breaks (!0 followed by 0_ or text)
//   - Terminal suffix (e.g. 0#P, #S, #X at the very end)
// ---------------------------------------------------------------------------
function parseOriginalStructure(buf, offset, maxBytes) {
  const limit = maxBytes ? Math.min(buf.length, offset + maxBytes) : buf.length;
  let end = offset;
  while (end < limit && buf[end] !== 0x00) end++;
  const len = end - offset;

  let pageBreaks = 0;  // count of !0 wait-for-input markers
  let i = 0;

  // Also track the suffix control codes at the very end
  let suffixStart = len; // position where suffix begins

  while (i < len) {
    const abs = offset + i;
    const b = buf[abs];

    // SJIS double-byte — skip it
    if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xEF)) {
      if (i + 1 < len) {
        const trail = buf[abs + 1];
        if ((trail >= 0x40 && trail <= 0x7E) || (trail >= 0x80 && trail <= 0xFC)) {
          i += 2; continue;
        }
      }
      i++; continue;
    }

    // !0 = wait for input
    if (b === 0x21 && i + 1 < len && buf[abs + 1] === 0x30) {
      pageBreaks++;
      i += 2; continue;
    }

    // #[A-Z] control code
    if (b === 0x23 && i + 1 < len) {
      const letter = buf[abs + 1];
      if (letter >= 0x41 && letter <= 0x5A) {
        let codeLen = 2;
        if (i + 2 < len) {
          const paramCount = buf[abs + 2];
          if (paramCount >= 0x01 && paramCount <= 0x0F) {
            codeLen = 3 + paramCount;
          }
        }
        if (i + codeLen > len) codeLen = len - i;
        i += codeLen; continue;
      }
    }

    // 0_ block separator
    if (b === 0x30 && i + 1 < len && buf[abs + 1] === 0x5F) {
      i += 2;
      if (i < len && buf[offset + i] >= 0x30 && buf[offset + i] <= 0x39) i++;
      continue;
    }

    // $ variable substitution
    if (b === 0x24) { i += (i + 1 < len) ? 2 : 1; continue; }

    // % formatting
    if (b === 0x25) { i += (i + 1 < len) ? 2 : 1; continue; }

    i++;
  }

  // Find suffix: scan backwards from end to find terminal control codes
  // Common endings: 0#P, 0#Y, 0#G, 0#V, 0#Z, 0#S, #S, #X, #V
  let suffix = Buffer.alloc(0);
  {
    let si = len;
    // Look for patterns at the very end
    // Pattern: 0#[A-Z] (3 bytes with optional param)
    if (si >= 3 && buf[offset + si - 3] === 0x30 && buf[offset + si - 2] === 0x23) {
      const letter = buf[offset + si - 1];
      if (letter >= 0x41 && letter <= 0x5A) {
        suffix = Buffer.from(buf.slice(offset + si - 3, offset + si));
        si -= 3;
      }
    }
    // Pattern: #[A-Z] (2 bytes, possibly with param count + params)
    else if (si >= 2 && buf[offset + si - 2] === 0x23) {
      const letter = buf[offset + si - 1];
      if (letter >= 0x41 && letter <= 0x5A) {
        suffix = Buffer.from(buf.slice(offset + si - 2, offset + si));
        si -= 2;
      }
    }
    // Pattern: #[A-Z] + param count + params (variable length)
    // Try to find # scanning backwards
    else {
      for (let back = 2; back <= Math.min(10, si); back++) {
        if (buf[offset + si - back] === 0x23) {
          const letter = buf[offset + si - back + 1];
          if (letter >= 0x41 && letter <= 0x5A) {
            suffix = Buffer.from(buf.slice(offset + si - back, offset + si));
            break;
          }
        }
      }
    }
  }

  return { len, pageBreaks, suffix };
}

// ---------------------------------------------------------------------------
// Encode English text as full-width SJIS bytes with word wrapping.
// Returns a Buffer.
// ---------------------------------------------------------------------------
function encodeFW(text, maxBytes, suffix, pageBreaks) {
  // Clean translation to safe ASCII
  const clean = text
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[#$%@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length < 2) return null;

  // Available bytes for text content (minus suffix)
  const available = maxBytes - suffix.length;
  if (available < 4) return null;

  // Split into sentences for page breaking
  const sentences = clean.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [clean];

  // Distribute sentences across pages
  let pages = [];
  if (pageBreaks > 0 && sentences.length > 1) {
    // Split sentences into (pageBreaks + 1) groups
    const numPages = Math.min(pageBreaks + 1, sentences.length);
    const perPage = Math.ceil(sentences.length / numPages);
    for (let p = 0; p < numPages; p++) {
      const start = p * perPage;
      const end = Math.min((p + 1) * perPage, sentences.length);
      pages.push(sentences.slice(start, end).join('').trim());
    }
  } else {
    pages = [clean];
  }

  // Build output bytes
  const bytes = [];
  let totalFWChars = 0; // track total for capacity check

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx];

    // Word-wrap this page's text
    const words = pageText.split(/\s+/);
    let lineChars = 0;

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];

      // Check if word fits on current line
      const wordLen = word.length;
      const needSpace = lineChars > 0 ? 1 : 0;

      if (lineChars > 0 && lineChars + needSpace + wordLen > LINE_WIDTH) {
        // Line break
        bytes.push(0x40); // @
        lineChars = 0;

        // Check capacity
        if (bytes.length + wordLen * 2 + suffix.length > available) break;
      } else if (needSpace) {
        // Add space between words
        const sp = FW_MAP[0x20];
        bytes.push(sp[0], sp[1]);
        lineChars++;
        totalFWChars++;
      }

      // Write word character by character
      for (const ch of word) {
        const cc = ch.charCodeAt(0);
        const fw = FW_MAP[cc] || FW_MAP[0x20];
        bytes.push(fw[0], fw[1]);
        lineChars++;
        totalFWChars++;

        // Capacity check
        if (bytes.length + suffix.length >= available) break;
      }

      if (bytes.length + suffix.length >= available) break;
    }

    // Add page break between pages (not after last page)
    if (pageIdx < pages.length - 1 && bytes.length + 3 + suffix.length < available) {
      bytes.push(0x21, 0x30);   // !0 (wait for input)
      bytes.push(0x40);          // @ (line break to start fresh)
      lineChars = 0;
    }
  }

  // Build final buffer: text + suffix + nulls to fill maxBytes
  const textBuf = Buffer.from(bytes);
  const result = Buffer.alloc(maxBytes, 0x00); // fill with nulls
  textBuf.copy(result, 0, 0, Math.min(textBuf.length, available));
  suffix.copy(result, Math.min(textBuf.length, available));

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=== ALSHARK PC-98 Patcher V3 [Full-Width Overwrite] ===\n');

  if (!fs.existsSync(TRANSLATIONS_FILE)) {
    console.error('Translations file not found:', TRANSLATIONS_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8'));
  console.log(`Loaded ${data.translations.length} translations`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Group by disk
  const byDisk = {};
  for (const t of data.translations) {
    (byDisk[t.disk] || (byDisk[t.disk] = [])).push(t);
  }

  const stats = { patched: 0, skipped: 0, errors: [] };

  for (const [diskName, filename] of Object.entries(DISK_FILES)) {
    const srcPath = path.join(SOURCE_DIR, filename);
    const outPath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(srcPath)) {
      console.log(`\n[${diskName}] Source not found — skipping`);
      continue;
    }

    const origBuf = fs.readFileSync(srcPath);
    const outBuf  = Buffer.from(origBuf);

    const diskTrans = byDisk[diskName] || [];
    let dPatched = 0, dSkipped = 0;

    console.log(`\n[${diskName}] ${filename}  (${diskTrans.length} translations)`);

    for (const t of diskTrans) {
      const minOffset = diskName === 'System' ? 0x50000 : 0x2400;
      if (t.offset < minOffset)          { dSkipped++; continue; }
      if (t.translation === '[ERROR]')   { dSkipped++; continue; }
      if (t.translation === '[EMPTY]')   { dSkipped++; continue; }
      if (!t.maxBytes || t.maxBytes < 6) { dSkipped++; continue; }

      try {
        const structure = parseOriginalStructure(origBuf, t.offset, t.maxBytes);
        if (structure.len < 4) { dSkipped++; continue; }

        const patched = encodeFW(t.translation, structure.len + 1, structure.suffix, structure.pageBreaks);
        if (!patched) { dSkipped++; continue; }

        // Write patched bytes. Never exceed maxBytes.
        const writeLen = Math.min(patched.length, t.maxBytes, structure.len + 1);
        patched.copy(outBuf, t.offset, 0, writeLen);
        dPatched++;
      } catch (e) {
        stats.errors.push(`${diskName}@0x${t.offset.toString(16)}: ${e.message}`);
        dSkipped++;
      }
    }

    if (outBuf.length !== origBuf.length) {
      console.error('  ERROR: output size mismatch!');
    }

    fs.writeFileSync(outPath, outBuf);
    console.log(`  Patched: ${dPatched}  |  Skipped: ${dSkipped}`);
    stats.patched += dPatched;
    stats.skipped += dSkipped;
  }

  // Copy unmodified disks
  console.log('\nCopying unmodified disks...');
  for (const name of ['Data', 'User']) {
    const fn  = `Alshark (${name} disk).hdm`;
    const src = path.join(SOURCE_DIR, fn);
    const dst = path.join(OUTPUT_DIR, fn);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`  ${fn}`);
    }
  }

  console.log('\n=== Results ===');
  console.log(`Total patched : ${stats.patched}`);
  console.log(`Total skipped : ${stats.skipped}`);
  if (stats.errors.length) {
    console.log(`Errors (${stats.errors.length}):`);
    for (const e of stats.errors) console.log(`  ${e}`);
  }
  console.log(`Output folder : ${OUTPUT_DIR}/`);
}

main();
