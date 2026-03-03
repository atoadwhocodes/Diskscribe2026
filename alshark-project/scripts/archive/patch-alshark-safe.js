#!/usr/bin/env node
/**
 * Alshark Safe Patcher v2
 * 
 * Applies ONLY valid translations that fit within the original byte allocation.
 * 
 * Safety rules:
 *   1. Translation must be shorter than maxBytes (ASCII = 1 byte/char)
 *   2. Translation must not contain garbage (prompt blurbs, etc.)
 *   3. Only writes the translation bytes + null terminator
 *   4. Does NOT pad with spaces (preserves original trailing bytes)
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const TRANSLATIONS_DIR = path.join(__dirname, 'ALSHARK-SCRIPT-TRANSLATIONS');
const DISK_DIR = path.join(__dirname, 'alshark');
const OUTPUT_DIR = path.join(__dirname, 'ALSHARK-PATCHED-SAFE');

const DISK_MAP = {
  'data': 'Alshark (Data disk).hdm',
  'ending': 'Alshark (Ending disk).hdm',
  'opening': 'Alshark (Opening disk).hdm',
  'system': 'Alshark (System disk).hdm',
  'user': 'Alshark (User disk).hdm',
  'visual': 'Alshark (Visual disk).hdm',
};

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// ─── Validation ──────────────────────────────────────────────────────────────

function isGarbageTranslation(translation) {
  if (!translation) return true;
  
  const lower = translation.toLowerCase();
  
  // Reject prompt blurbs
  if (lower.includes('{player}, {nl}')) return true;
  if (lower.includes('please note')) return true;
  if (lower.includes('translate')) return true;
  if (lower.includes('japanese')) return true;
  if (lower.includes('half-width')) return true;
  if (lower.includes('katakana')) return true;
  if (lower.includes('output only')) return true;
  if (lower.includes('**')) return true;  // Markdown formatting
  
  // Reject if mostly non-printable
  const printable = translation.replace(/[^\x20-\x7E]/g, '');
  if (printable.length < translation.length * 0.7) return true;
  
  return false;
}

function encodeTranslation(translation) {
  // Replace placeholders with control bytes
  let text = translation
    .replace(/\{NL\}/g, '@')
    .replace(/\{END\}/g, '0')
    .replace(/\{PLAYER\}/g, '$')
    .replace(/\{PAUSE\}/g, '_')
    .replace(/\{KW:([^}]+)\}/g, '$1');
  
  // Encode to Shift-JIS (ASCII subset for English)
  return iconv.encode(text, 'shiftjis');
}

// ─── Patcher ─────────────────────────────────────────────────────────────────

function patchDisk(diskLabel, translations) {
  const diskFile = DISK_MAP[diskLabel];
  if (!diskFile) return { patched: 0, skipped: 0, garbage: 0, oversize: 0 };
  
  const diskPath = path.join(DISK_DIR, diskFile);
  if (!fs.existsSync(diskPath)) return { patched: 0, skipped: 0, garbage: 0, oversize: 0 };
  
  const buf = Buffer.from(fs.readFileSync(diskPath));
  
  let patched = 0, skipped = 0, garbage = 0, oversize = 0;
  
  for (const trans of translations) {
    if (!trans.translation) { skipped++; continue; }
    
    // Check for garbage
    if (isGarbageTranslation(trans.translation)) {
      garbage++;
      if (VERBOSE) console.log(`  ⚠ Garbage: ${trans.id}`);
      continue;
    }
    
    // Encode and check size
    const encoded = encodeTranslation(trans.translation);
    
    // Need room for content + null terminator
    if (encoded.length >= trans.maxBytes) {
      oversize++;
      if (VERBOSE) console.log(`  ⚠ Oversize: ${trans.id} (${encoded.length} >= ${trans.maxBytes})`);
      continue;
    }
    
    // Validate offset is within disk
    if (trans.offset < 0 || trans.offset + encoded.length >= buf.length) {
      skipped++;
      continue;
    }
    
    if (!DRY_RUN) {
      // Write ONLY the encoded bytes (no padding)
      encoded.copy(buf, trans.offset);
      // Write null terminator after the string
      buf[trans.offset + encoded.length] = 0x00;
      patched++;
    } else {
      patched++;
    }
  }
  
  if (!DRY_RUN && patched > 0) {
    const outputPath = path.join(OUTPUT_DIR, diskFile);
    fs.writeFileSync(outputPath, buf);
  }
  
  return { patched, skipped, garbage, oversize };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          Alshark Safe Patcher v2.0                           ║');
  console.log(`║          ${DRY_RUN ? 'DRY RUN MODE' : 'LIVE PATCH MODE'}                                  ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log();
  
  // Create output directory
  if (!DRY_RUN && !fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Load translations
  const translationsPath = path.join(TRANSLATIONS_DIR, 'script-ir-translations.json');
  if (!fs.existsSync(translationsPath)) {
    console.error('No translations found at:', translationsPath);
    process.exit(1);
  }
  
  const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
  const withTranslation = translations.filter(t => t.translation);
  console.log(`Loaded ${translations.length} entries, ${withTranslation.length} have translations`);
  
  // Pre-filter stats
  let totalGarbage = 0, totalOversize = 0;
  for (const t of withTranslation) {
    if (isGarbageTranslation(t.translation)) totalGarbage++;
    else {
      const enc = encodeTranslation(t.translation);
      if (enc.length >= t.maxBytes) totalOversize++;
    }
  }
  console.log(`Pre-filter: ${totalGarbage} garbage, ${totalOversize} oversize`);
  console.log();
  
  // Group by disk
  const byDisk = {};
  for (const t of translations) {
    if (!byDisk[t.disk]) byDisk[t.disk] = [];
    byDisk[t.disk].push(t);
  }
  
  // Copy original disks to output
  if (!DRY_RUN) {
    console.log('Copying original disks to output...');
    for (const diskLabel of Object.keys(byDisk)) {
      const diskFile = DISK_MAP[diskLabel];
      if (!diskFile) continue;
      const src = path.join(DISK_DIR, diskFile);
      const dst = path.join(OUTPUT_DIR, diskFile);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
    console.log();
  }
  
  // Patch each disk
  let totalPatched = 0, totalSkipped = 0, totalGarbageRej = 0, totalOversizeRej = 0;
  
  for (const [diskLabel, diskTranslations] of Object.entries(byDisk)) {
    const transCount = diskTranslations.filter(t => t.translation).length;
    console.log(`Patching ${diskLabel} disk (${transCount} translations)...`);
    
    const result = patchDisk(diskLabel, diskTranslations);
    totalPatched += result.patched;
    totalSkipped += result.skipped;
    totalGarbageRej += result.garbage;
    totalOversizeRej += result.oversize;
    
    console.log(`  → ${result.patched} patched, ${result.garbage} garbage, ${result.oversize} oversize, ${result.skipped} skipped`);
  }
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`${DRY_RUN ? '[DRY RUN] Would patch' : 'Patched'}: ${totalPatched} strings`);
  console.log(`Rejected garbage: ${totalGarbageRej}`);
  console.log(`Rejected oversize: ${totalOversizeRej}`);
  console.log(`Skipped (no translation): ${totalSkipped}`);
  if (!DRY_RUN) {
    console.log(`Output: ${OUTPUT_DIR}/`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
