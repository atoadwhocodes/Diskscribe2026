/**
 * ALSHARK Disk Patcher V2 — PC-98 / Shift-JIS Aware
 *
 * Safe patching strategy:
 *   1. Parse each original string into a per-byte position map (TEXT / FIXED).
 *   2. TEXT positions = Shift-JIS double-byte chars + half-width katakana (A1-DF).
 *   3. FIXED positions = control codes with ALL binary params, ASCII markers,
 *      binary bytes, and everything else.
 *   4. English translation fills TEXT positions only; remainder padded with 0x20.
 *   5. FIXED bytes are copied verbatim from the original disk.
 *
 * Control codes preserved (PC-98 Alshark script engine):
 *   #[A-Z]  + param-count byte + N param bytes  (e.g. #P 02 0a 2f)
 *   $ (0x24) + 1 variable-ID byte               (character substitution)
 *   % (0x25) + 1 param byte                     (formatting / escape)
 *   @ (0x40)  standalone                         (line break)
 *   !0 (0x21 0x30)                               (wait for input)
 *   0_ (0x30 0x5F) + optional digit              (block separator)
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Mode: "ascii" = 1-byte ASCII (more text capacity, may not render)
//       "fullwidth" = 2-byte SJIS full-width romaji (guaranteed to render)
// Pass --fullwidth on the command line to use full-width mode.
// ---------------------------------------------------------------------------
const USE_FULLWIDTH = process.argv.includes('--fullwidth');

const TRANSLATIONS_FILE = 'ALSHARK-TRANSLATED-REV/translations.json';
const SOURCE_DIR        = 'alshark';
const OUTPUT_DIR        = USE_FULLWIDTH ? 'ALSHARK-PATCHED-FW' : 'ALSHARK-PATCHED-V2';

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

const DISK_FILES = {
  System:  'Alshark (System disk).hdm',
  Opening: 'Alshark (Opening disk).hdm',
  Ending:  'Alshark (Ending disk).hdm',
  Visual:  'Alshark (Visual disk).hdm',
};

// ---------------------------------------------------------------------------
// Byte classifier — returns an array of booleans (true = TEXT, false = FIXED)
// for every byte in the original string [offset .. null-terminator).
// maxBytes CLAMPS the scan length so we never overwrite past the boundary.
// ---------------------------------------------------------------------------
function classifyBytes(buf, offset, maxBytes) {
  // Find null terminator, but NEVER scan past maxBytes
  const limit = maxBytes ? Math.min(buf.length, offset + maxBytes) : buf.length;
  let end = offset;
  while (end < limit && buf[end] !== 0) end++;
  const len = end - offset;

  const isText = new Array(len).fill(false);
  let i = 0; // relative position within the string

  while (i < len) {
    const abs = offset + i;
    const b   = buf[abs];

    // ── 1. Shift-JIS double-byte character ──────────────────────────────
    //    Lead byte: 0x81-0x9F  or  0xE0-0xEF
    //    Trail byte: 0x40-0x7E or 0x80-0xFC
    if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xEF)) {
      if (i + 1 < len) {
        const trail = buf[abs + 1];
        if ((trail >= 0x40 && trail <= 0x7E) || (trail >= 0x80 && trail <= 0xFC)) {
          isText[i]     = true;
          isText[i + 1] = true;
          i += 2;
          continue;
        }
      }
      // Invalid/incomplete pair — keep as FIXED
      i++;
      continue;
    }

    // ── 2. #[A-Z] control code with counted binary params ──────────────
    if (b === 0x23 && i + 1 < len) {
      const letter = buf[abs + 1];
      if (letter >= 0x41 && letter <= 0x5A) {
        let codeLen = 2; // # + letter
        if (i + 2 < len) {
          const paramCount = buf[abs + 2];
          if (paramCount >= 0x01 && paramCount <= 0x0F) {
            codeLen = 3 + paramCount; // # + letter + count + N params
          }
        }
        // Clamp to string boundary
        if (i + codeLen > len) codeLen = len - i;
        // All bytes are FIXED (already false)
        i += codeLen;
        continue;
      }
    }

    // ── 3. $ variable substitution (0x24 + 1 param byte) ───────────────
    if (b === 0x24) {
      const skip = (i + 1 < len) ? 2 : 1;
      i += skip;
      continue;
    }

    // ── 4. % formatting code (0x25 + 1 param byte) ────────────────────
    if (b === 0x25) {
      const skip = (i + 1 < len) ? 2 : 1;
      i += skip;
      continue;
    }

    // ── 5. !0 wait-for-input (0x21 0x30) ──────────────────────────────
    if (b === 0x21 && i + 1 < len && buf[abs + 1] === 0x30) {
      i += 2;
      continue;
    }

    // ── 6. 0_ block separator (0x30 0x5F + optional digit) ────────────
    if (b === 0x30 && i + 1 < len && buf[abs + 1] === 0x5F) {
      i += 2;
      // Consume trailing digit if present
      if (i < len && buf[offset + i] >= 0x30 && buf[offset + i] <= 0x39) {
        i++;
      }
      continue;
    }

    // ── 7. Half-width katakana (single byte 0xA1-0xDF) ────────────────
    if (b >= 0xA1 && b <= 0xDF) {
      isText[i] = true;
      i++;
      continue;
    }

    // ── 8. Everything else — FIXED ────────────────────────────────────
    //    Binary (< 0x20), ASCII punctuation/digits/letters (0x20-0x7E),
    //    0x80, 0x7F, 0xA0, 0xF0-0xFF, etc.
    i++;
  }

  return { isText, len, offset };
}

// ---------------------------------------------------------------------------
// Patch one string: write English into TEXT positions, keep FIXED verbatim.
// ---------------------------------------------------------------------------
function patchString(origBuf, outBuf, classified, translation) {
  const { isText, len, offset } = classified;

  // Collect TEXT positions
  const textPositions = [];
  for (let i = 0; i < len; i++) {
    if (isText[i]) textPositions.push(i);
  }
  if (textPositions.length === 0) return false; // nothing to patch

  // Clean translation to safe ASCII (0x20-0x7E), strip chars that could
  // be misinterpreted as script control codes by the PC-98 game engine.
  const clean = translation
    .replace(/[^\x20-\x7E]/g, '')  // keep only printable ASCII
    .replace(/[#$%@]/g, ' ')       // strip control-code trigger chars
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
  if (clean.length < 2) return false;

  if (USE_FULLWIDTH) {
    // ── Full-width mode: pair TEXT positions, write 2-byte SJIS chars ──
    let charIdx = 0;
    let posIdx  = 0;
    while (posIdx + 1 < textPositions.length && charIdx < clean.length) {
      const p0 = textPositions[posIdx];
      const p1 = textPositions[posIdx + 1];
      if (p1 === p0 + 1) {
        // Adjacent pair — write one full-width character
        const cc = clean.charCodeAt(charIdx);
        const fw = FW_MAP[cc] || FW_MAP[0x20]; // fallback to FW space
        outBuf[offset + p0] = fw[0];
        outBuf[offset + p1] = fw[1];
        charIdx++;
        posIdx += 2;
      } else {
        // Non-adjacent single byte — pad with ASCII space
        outBuf[offset + p0] = 0x20;
        posIdx++;
      }
    }
    // Pad remaining TEXT positions with full-width spaces (pairs) or 0x20
    while (posIdx + 1 < textPositions.length) {
      const p0 = textPositions[posIdx];
      const p1 = textPositions[posIdx + 1];
      if (p1 === p0 + 1) {
        outBuf[offset + p0] = 0x81;
        outBuf[offset + p1] = 0x40; // full-width space
        posIdx += 2;
      } else {
        outBuf[offset + p0] = 0x20;
        posIdx++;
      }
    }
    if (posIdx < textPositions.length) {
      outBuf[offset + textPositions[posIdx]] = 0x20;
    }
  } else {
    // ── ASCII mode: 1 byte per TEXT position ──
    for (let j = 0; j < textPositions.length; j++) {
      const pos = offset + textPositions[j];
      if (j < clean.length) {
        outBuf[pos] = clean.charCodeAt(j);
      } else {
        outBuf[pos] = 0x20; // pad with space
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const mode = USE_FULLWIDTH ? 'FULL-WIDTH (2-byte SJIS)' : 'ASCII (1-byte)';
  console.log(`=== ALSHARK PC-98 Script-Aware Patcher V2 [${mode}] ===\n`);

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
    const outBuf  = Buffer.from(origBuf); // mutable copy

    const diskTrans = byDisk[diskName] || [];
    let dPatched = 0, dSkipped = 0;

    console.log(`\n[${diskName}] ${filename}  (${diskTrans.length} translations)`);

    for (const t of diskTrans) {
      // Safety: skip low offsets (code / FAT area)
      const minOffset = diskName === 'System' ? 0x50000 : 0x2400;
      if (t.offset < minOffset)          { dSkipped++; continue; }
      if (t.translation === '[ERROR]')   { dSkipped++; continue; }
      if (t.translation === '[EMPTY]')   { dSkipped++; continue; }

      try {
        const classified = classifyBytes(origBuf, t.offset, t.maxBytes);
        if (classified.len < 4)           { dSkipped++; continue; }

        const ok = patchString(origBuf, outBuf, classified, t.translation);
        if (ok) dPatched++; else dSkipped++;
      } catch (e) {
        stats.errors.push(`${diskName}@0x${t.offset.toString(16)}: ${e.message}`);
        dSkipped++;
      }
    }

    // Restoration pass: re-classify every string from the ORIGINAL disk and
    // force-restore all FIXED bytes.  This repairs any control-code bytes
    // that were accidentally overwritten by overlapping translation entries.
    let restored = 0;
    for (const t of diskTrans) {
      const minOffset = diskName === 'System' ? 0x50000 : 0x2400;
      if (t.offset < minOffset) continue;
      try {
        const c = classifyBytes(origBuf, t.offset, t.maxBytes);
        for (let j = 0; j < c.len; j++) {
          if (!c.isText[j]) {
            const abs = c.offset + j;
            if (outBuf[abs] !== origBuf[abs]) {
              outBuf[abs] = origBuf[abs];
              restored++;
            }
          }
        }
      } catch (_) { /* skip */ }
    }
    if (restored > 0) console.log(`  Restored ${restored} control-code bytes`);

    // Verify disk size unchanged
    if (outBuf.length !== origBuf.length) {
      console.error('  ERROR: output size mismatch!');
    }

    fs.writeFileSync(outPath, outBuf);
    console.log(`  Patched: ${dPatched}  |  Skipped: ${dSkipped}`);
    stats.patched += dPatched;
    stats.skipped += dSkipped;
  }

  // Copy unmodified disks (Data, User)
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
