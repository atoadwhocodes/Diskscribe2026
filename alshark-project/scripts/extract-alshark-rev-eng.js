/**
 * ALSHARK Reverse-Engineered Script Extractor
 * 
 * Based on analysis of the actual disk format:
 * - Script blocks use control codes: #L, #O, #X, #P, !@, !_, etc.
 * - Dialog text uses full-width Japanese with @ for line breaks
 * - 「」 brackets denote spoken dialog
 * - Character names: ジョー, シオン, etc.
 * 
 * Script Format:
 *   #O/#X = Character portrait display (O=narrator?, X=character dialog?)
 *   #L = Line wait
 *   #P = Page clear
 *   !@ = Wait for input
 *   !_ = Scene end
 *   @ = Inline line break (within text)
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const ALSHARK_DIR = 'alshark';
const OUTPUT_DIR = 'ALSHARK-EXTRACTED-REV';

// Disk configurations based on analysis
const DISK_CONFIG = [
  { name: 'System', file: 'Alshark (System disk).hdm', type: 'menu' },
  { name: 'Opening', file: 'Alshark (Opening disk).hdm', type: 'mixed' },
  { name: 'Ending', file: 'Alshark (Ending disk).hdm', type: 'credits' },
  { name: 'Data', file: 'Alshark (Data disk).hdm', type: 'data' },
  { name: 'Visual', file: 'Alshark (Visual disk).hdm', type: 'script' },
];

// Known character names for validation
const KNOWN_NAMES = ['ジョー', 'シオン', 'レディア', 'アーファ', 'ラン', 'カサ', 
                     'ジャグマ', 'ハドソン', 'エルザ', 'ペック', 'ドクター'];

// Script control code patterns (as bytes)
const CONTROL_PATTERNS = [
  { pattern: '#L', meaning: 'line_wait' },
  { pattern: '#O', meaning: 'portrait_o' },
  { pattern: '#X', meaning: 'portrait_x' },
  { pattern: '#P', meaning: 'page_clear' },
  { pattern: '#G', meaning: 'graphics' },
  { pattern: '#F', meaning: 'fade' },
  { pattern: '#M', meaning: 'music' },
  { pattern: '#S', meaning: 'sound' },
  { pattern: '!@', meaning: 'wait_input' },
  { pattern: '!_', meaning: 'scene_end' },
  { pattern: '!#', meaning: 'combined' },
];

/**
 * Extract script blocks that contain control codes
 */
function findScriptBlocks(buf) {
  const blocks = [];
  
  // Find all occurrences of control patterns
  const controlPositions = [];
  for (let i = 0; i < buf.length - 2; i++) {
    // Check for # patterns
    if (buf[i] === 0x23) { // '#'
      const next = String.fromCharCode(buf[i+1]);
      if ('LOXPGFMSABC'.includes(next)) {
        controlPositions.push({ pos: i, type: '#' + next });
      }
    }
    // Check for ! patterns
    if (buf[i] === 0x21) { // '!'
      const next = buf[i+1];
      if (next === 0x40 || next === 0x5F || next === 0x23) { // @, _, #
        controlPositions.push({ pos: i, type: '!' + String.fromCharCode(next) });
      }
    }
  }
  
  if (controlPositions.length === 0) return blocks;
  
  // Group nearby control codes into script blocks
  let blockStart = controlPositions[0].pos;
  let lastPos = blockStart;
  
  for (let i = 1; i < controlPositions.length; i++) {
    const pos = controlPositions[i].pos;
    
    // If gap is > 500 bytes, it's a new block
    if (pos - lastPos > 500) {
      if (lastPos - blockStart > 10) {
        blocks.push({ start: blockStart, end: lastPos + 10 });
      }
      blockStart = pos;
    }
    lastPos = pos;
  }
  
  // Last block
  if (lastPos - blockStart > 10) {
    blocks.push({ start: blockStart, end: Math.min(lastPos + 200, buf.length) });
  }
  
  return blocks;
}

/**
 * Extract Japanese strings with context
 */
function extractJapaneseStrings(buf, diskName) {
  const strings = [];
  
  // First pass: find all Japanese text blocks
  let i = 0;
  while (i < buf.length - 4) {
    // Look for start of Japanese text (Shift-JIS ranges)
    const b = buf[i];
    const isJpStart = (b >= 0x82 && b <= 0x84) ||  // Hiragana/Katakana
                      (b >= 0x88 && b <= 0x9F) ||  // Kanji
                      (b >= 0xE0 && b <= 0xEF);    // Extended kanji
    
    if (!isJpStart || i + 1 >= buf.length) {
      i++;
      continue;
    }
    
    // Check second byte is valid SJIS
    if (buf[i+1] < 0x40 || buf[i+1] === 0x7F) {
      i++;
      continue;
    }
    
    const start = i;
    let hasDialogBracket = false;
    let hasControlCode = false;
    
    // Read the full string
    while (i < buf.length) {
      const b = buf[i];
      
      // Null terminator
      if (b === 0) break;
      
      // Control code markers
      if (b === 0x23 || b === 0x21) {
        const next = buf[i+1];
        if (b === 0x23 && next >= 0x41 && next <= 0x5A) hasControlCode = true;
        if (b === 0x21 && (next === 0x40 || next === 0x5F)) hasControlCode = true;
      }
      
      // Dialog brackets 「」
      if (b === 0x81 && (buf[i+1] === 0x75 || buf[i+1] === 0x76)) hasDialogBracket = true;
      
      // Full-width SJIS character
      if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC)) {
        if (i + 1 < buf.length && buf[i+1] >= 0x40 && buf[i+1] !== 0x7F) {
          i += 2;
          continue;
        }
      }
      
      // Half-width katakana
      if (b >= 0xA1 && b <= 0xDF) {
        i++;
        continue;
      }
      
      // ASCII printable + common control chars
      if ((b >= 0x20 && b < 0x7F) || b === 0x0A || b === 0x0D || b === 0x40) {
        i++;
        continue;
      }
      
      // Unknown byte - likely end of string
      break;
    }
    
    const len = i - start;
    if (len < 6) continue; // Too short
    
    const bytes = buf.slice(start, i);
    let text;
    try {
      text = iconv.decode(bytes, 'shiftjis');
    } catch (e) {
      continue;
    }
    
    // Quality checks
    const fullWidth = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
    const totalJp = (text.match(/[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/g) || []).length;
    
    if (fullWidth < 2) continue; // Not enough real Japanese
    
    // Check for known patterns that indicate real script text
    const isRealText = hasDialogBracket ||
                       hasControlCode ||
                       KNOWN_NAMES.some(name => text.includes(name)) ||
                       text.includes('。') ||
                       text.includes('！') ||
                       text.includes('？') ||
                       (fullWidth >= 5 && totalJp / text.length > 0.5);
    
    // Strong filter for garbage
    const isGarbage = /^[ｦ-ﾟ]{4,}$/.test(text) ||  // All half-width katakana
                      /[\x00-\x1F]/.test(text) ||   // Control chars in decoded text
                      text.length > 500;             // Too long
    
    if (!isRealText && isGarbage) continue;
    
    strings.push({
      disk: diskName,
      offset: start,
      length: len,
      maxBytes: len,
      text: text,
      hasDialog: hasDialogBracket,
      hasControl: hasControlCode,
      quality: isRealText ? 'high' : 'medium'
    });
    
    // Skip forward (but not past null)
    if (i === start) i++;
  }
  
  return strings;
}

/**
 * Score string quality for prioritization
 */
function scoreString(s) {
  let score = 0;
  
  // Dialog brackets are high value
  if (s.text.includes('「') || s.text.includes('」')) score += 50;
  
  // Control codes indicate script
  if (s.hasControl) score += 30;
  
  // Known character names
  if (KNOWN_NAMES.some(name => s.text.includes(name))) score += 40;
  
  // Sentence-ending punctuation
  if (/[。！？]/.test(s.text)) score += 20;
  
  // Full-width based on actual count
  const fullWidth = (s.text.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length;
  score += Math.min(fullWidth * 2, 30);
  
  // Penalize garbage
  if (/^[ｦ-ﾟ\s]{3,}$/.test(s.text)) score -= 50;
  if (s.text.length < 5) score -= 20;
  
  return score;
}

/**
 * Deduplicate strings by text content
 */
function deduplicateStrings(strings) {
  const seen = new Map();
  const unique = [];
  
  for (const s of strings) {
    const normalized = s.text.trim();
    if (!seen.has(normalized)) {
      seen.set(normalized, true);
      unique.push(s);
    }
  }
  
  return unique;
}

/**
 * Main extraction function
 */
async function main() {
  console.log('=== ALSHARK Reverse-Engineered Extractor ===\n');
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const allStrings = [];
  const stats = {};
  
  for (const disk of DISK_CONFIG) {
    const diskPath = path.join(ALSHARK_DIR, disk.file);
    
    if (!fs.existsSync(diskPath)) {
      console.log(`[SKIP] ${disk.name}: File not found`);
      continue;
    }
    
    console.log(`[${disk.name}] Processing ${disk.file}...`);
    const buf = fs.readFileSync(diskPath);
    
    // Extract strings
    const strings = extractJapaneseStrings(buf, disk.name);
    
    // Score and filter
    const scored = strings.map(s => ({ ...s, score: scoreString(s) }));
    const filtered = scored.filter(s => s.score > 0);
    
    // Sort by score
    filtered.sort((a, b) => b.score - a.score);
    
    console.log(`  Found: ${strings.length} strings, ${filtered.length} quality strings`);
    
    // Sample output
    if (filtered.length > 0) {
      console.log('  Top strings:');
      for (let i = 0; i < Math.min(3, filtered.length); i++) {
        console.log(`    [${filtered[i].score}] ${filtered[i].text.slice(0, 50)}...`);
      }
    }
    
    stats[disk.name] = {
      total: strings.length,
      quality: filtered.length,
      highQuality: filtered.filter(s => s.quality === 'high').length
    };
    
    allStrings.push(...filtered);
    
    // Save disk-specific extraction
    const diskOutput = {
      disk: disk.name,
      file: disk.file,
      extracted: new Date().toISOString(),
      stringCount: filtered.length,
      strings: filtered
    };
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${disk.name.toLowerCase()}-strings.json`),
      JSON.stringify(diskOutput, null, 2)
    );
  }
  
  // Deduplicate across disks
  const unique = deduplicateStrings(allStrings);
  
  // Save master extraction
  const masterOutput = {
    game: 'Alshark',
    platform: 'PC-98',
    extracted: new Date().toISOString(),
    stats: stats,
    totalStrings: allStrings.length,
    uniqueStrings: unique.length,
    strings: unique
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'alshark-master.json'),
    JSON.stringify(masterOutput, null, 2)
  );
  
  console.log('\n=== Extraction Summary ===');
  console.log(`Total strings: ${allStrings.length}`);
  console.log(`Unique strings: ${unique.length}`);
  console.log(`Output: ${OUTPUT_DIR}/`);
  
  // Per-disk stats
  console.log('\nPer-disk breakdown:');
  for (const [name, stat] of Object.entries(stats)) {
    console.log(`  ${name}: ${stat.quality} quality (${stat.highQuality} high)`);
  }
  
  // Quality tier breakdown
  const highQuality = unique.filter(s => s.score >= 50);
  const mediumQuality = unique.filter(s => s.score >= 20 && s.score < 50);
  const lowQuality = unique.filter(s => s.score > 0 && s.score < 20);
  
  console.log('\nQuality tiers:');
  console.log(`  High (dialog/script): ${highQuality.length}`);
  console.log(`  Medium (sentences): ${mediumQuality.length}`);
  console.log(`  Low (fragments): ${lowQuality.length}`);
}

main().catch(console.error);
