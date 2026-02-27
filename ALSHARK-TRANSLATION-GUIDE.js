/**
 * ALSHARK FAN TRANSLATION PROJECT GUIDE
 * Complete workflow for extracting and translating Alshark game text
 * using DiskScribe2026
 */

const fs = require('fs');

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║' + ' ALSHARK FAN TRANSLATION PROJECT - COMPLETE GUIDE '.padEnd(69) + '║');
console.log('╚' + '═'.repeat(68) + '╝');
console.log('');

console.log('PROJECT OVERVIEW');
console.log('═'.repeat(70));
console.log('');
console.log('Game: Alshark (アルシャーク)');
console.log('Platform: PC-98 (NEC PC9001/9801 computer)');
console.log('Format: HDM disk images (1.2 MB floppy format)');
console.log('Disks: 6 system/data disks');
console.log('Text Encoding: Shift-JIS (Japanese)');
console.log('Goal: Extract all dialog/UI text and create English translation');
console.log('');

console.log('DISK INVENTORY');
console.log('═'.repeat(70));
console.log('');
console.log('✓ Alshark (System disk).hdm       - Main executable & system resources');
console.log('✓ Alshark (Data disk).hdm         - Game data (maps, sprites, etc.)');
console.log('✓ Alshark (Visual disk).hdm       - Graphics and visual assets');
console.log('✓ Alshark (Opening disk).hdm      - Intro/opening sequence');
console.log('✓ Alshark (Ending disk).hdm       - Ending/credits sequences');
console.log('✓ Alshark (User disk).hdm         - Save data and user files');
console.log('');
console.log('Total size: 7.22 MB (6 x 1.2 MB)');
console.log('Text content detected: 218,582 Shift-JIS byte pairs ✓');
console.log('Null-terminated strings: 32,649 ✓');
console.log('');

console.log('STEP-BY-STEP TRANSLATION WORKFLOW');
console.log('═'.repeat(70));
console.log('');

console.log('PHASE 1: INITIAL SETUP');
console.log('-'.repeat(70));
console.log('');
console.log('1. Prepare workspace:');
console.log('   □ Create project folder: E:\\Alshark-Translation\\');
console.log('   □ Create subfolders:');
console.log('     - disk-images/        (copy all 6 HDM files here)');
console.log('     - extracted-text/     (text extracted from disks)');
console.log('     - translations/       (working translation files)');
console.log('     - batch-plans/        (save DiskScribe batch jobs)');
console.log('     - reference/          (notes, screenshots, etc.)');
console.log('');

console.log('2. Launch DiskScribe2026:');
console.log('   □ Run: npm run desktop:start');
console.log('   □ Wait for Electron window to open');
console.log('   □ Verify UI loads (DiskTools/DiskEdit tabs visible)');
console.log('');

console.log('PHASE 2: SYSTEMATIC DISK SCANNING');
console.log('-'.repeat(70));
console.log('');
console.log('Process each disk to locate and map all text strings.');
console.log('');

console.log('For each disk (System -> Data -> Visual -> Opening -> Ending -> User):');
console.log('');
console.log('A. OPEN DISK (Ctrl+O):');
console.log('   □ Click "Open Volume" button or press Ctrl+O');
console.log('   □ Navigate to disk-images/ folder');
console.log('   □ Select first disk (Alshark (System disk).hdm)');
console.log('   □ Wait for summary to load');
console.log('   □ Review volume information panel (file size, offsets, etc.)');
console.log('');

console.log('B. ENTER DISKDIT MODE (Ctrl+2):');
console.log('   □ Press Ctrl+2 to switch to DiskEdit expert mode');
console.log('   □ Arm expert actions: Ctrl+Shift+E (enables byte extraction)');
console.log('   □ This unlocks the Extract Selection button');
console.log('');

console.log('C. HEX VIEWER INSPECTION:');
console.log('   □ Hex viewer shows 16-byte rows with offset markers');
console.log('   □ Display modes:');
console.log('     - Disk mode: offsets relative to data start');
console.log('     - Raw mode:  absolute file byte offsets');
console.log('   □ Left panel shows volume summary');
console.log('');

console.log('D. LOCATE TEXT (Ctrl+G):');
console.log('   □ Use Ctrl+G to jump to specific byte offsets');
console.log('   □ Or press Ctrl+L to jump to LBA sectors');
console.log('   □ Example: Jump to offset 0x1000 to find executable code');
console.log('   □ Scan visually for:');
console.log('     - Shift-JIS patterns (0x81-0x9F, 0xE0-0xEF followed by valid byte)');
console.log('     - NULL bytes between strings (0x00)');
console.log('     - ASCII text (0x20-0x7E)');
console.log('     - String tables with length prefixes');
console.log('');

console.log('E. SELECT & DECODE TEXT:');
console.log('   □ Click on first byte of text string in hex viewer');
console.log('   □ Shift+Click on last byte to select range');
console.log('   □ Right panel shows "Character Frame"');
console.log('   □ Character roles are auto-classified:');
console.log('     - ASCII: Single-byte 0x20-0x7E');
console.log('     - Shift-JIS lead: 0x81-0x9F, 0xE0-0xEF');
console.log('     - Shift-JIS trail: 0x40-0x7E, 0x80-0xFC');
console.log('     - Control: 0x00-0x1F');
console.log('');

console.log('F. REVIEW CHARACTER TRANSLATION:');
console.log('   □ "Decoded Text" field (read-only) shows Shift-JIS interpretation');
console.log('   □ "Draft" field allows you to input English translation');
console.log('   □ Charset selector lets you try different encodings:');
console.log('     * Shift-JIS (primary)');
console.log('     * EUC-JP (alternative)');
console.log('     * ISO-2022-JP (variant)');
console.log('     * JIS X0201 (old standard)');
console.log('     * ASCII (English/code)');
console.log('');

console.log('G. COPY ORIGINAL TEXT:');
console.log('   □ Select text in "Decoded Text" field');
console.log('   □ Copy (Ctrl+C) for external translation tools');
console.log('   □ Paste into Google Translate or translation software');
console.log('   □ Get rough translation for reference');
console.log('');

console.log('H. DOCUMENT OFFSET:');
console.log('   □ Note the byte offset shown in status bar');
console.log('   □ Record in translation file:');
console.log('     Disk: Alshark (System disk).hdm');
console.log('     Offset: 0x12345');
console.log('     Original: (Japanese text from Decoded Text field)');
console.log('     Translation: (Your English translation)');
console.log('     Length: X bytes');
console.log('');

console.log('PHASE 3: BATCH QUEUE FOR MULTI-DISK EXTRACTION');
console.log('-'.repeat(70));
console.log('');
console.log('After scanning one disk, queue all disks for systematic processing:');
console.log('');

console.log('A. QUEUE MULTIPLE DISKS (Ctrl+Shift+O):');
console.log('   □ Press Ctrl+Shift+O or click "Queue Files"');
console.log('   □ Select all 6 HDM files at once');
console.log('   □ Or drag-drop folder containing all disks');
console.log('   □ App shows queue with files ready');
console.log('');

console.log('B. ADD FOLDER (if needed):');
console.log('   □ Click "Queue Folder" button');
console.log('   □ App recursively scans for .hdm, .hdi, .nhd, etc.');
console.log('   □ Automatically filters to supported disk formats');
console.log('   □ Shows count of matched disks');
console.log('');

console.log('C. RUN BATCH (Ctrl+Enter):');
console.log('   □ Press Ctrl+Enter or click "Run Batch"');
console.log('   □ App processes each disk sequentially');
console.log('   □ For each disk:');
console.log('     - Loads and parses disk image');
console.log('     - Generates summary (size, sectors, partitions)');
console.log('     - Creates hex preview (first 256KB sample)');
console.log('     - Detects geometry (CHS calculations)');
console.log('   □ Progress bar shows: X of Y complete');
console.log('   □ Completed disks stay loaded for manual inspection');
console.log('');

console.log('D. SAVE BATCH PLAN:');
console.log('   □ Click "Save Plan" button');
console.log('   □ Save as: alshark-batch.json');
console.log('   □ File contains list of all queued disks');
console.log('   □ Later: "Load Plan" to reload same batch');
console.log('');

console.log('PHASE 4: DETAILED TEXT EXTRACTION');
console.log('-'.repeat(70));
console.log('');
console.log('After batch processing, go through each disk methodically:');
console.log('');

console.log('For each disk in detail:');
console.log('');
console.log('□ Create text log file (e.g., system-disk-strings.txt)');
console.log('□ Systematically walk through hex view from start to end');
console.log('□ Record every text string found:');
console.log('  - Offset (hex)');
console.log('  - Length (bytes)');
console.log('  - Raw hex');
console.log('  - Decoded Shift-JIS text');
console.log('  - Character by character breakdown via Character Frame');
console.log('  - Pattern type (dialog, menu, status message, etc.)');
console.log('');

console.log('Tips for finding text:');
console.log('□ Look for changes in byte patterns');
console.log('□ Executable code: Mixed 0x00-0xFF values');
console.log('□ Text strings: Clusters of 0x81-0xEF (Shift-JIS)');
console.log('□ Separators: NULL bytes (0x00) between strings');
console.log('□ Menu text: Often aligned on boundaries or follows length byte');
console.log('');

console.log('PHASE 5: TEXT CONVERSION & REPATRIATION');
console.log('-'.repeat(70));
console.log('');
console.log('Once you have all extracted text and translations:');
console.log('');

console.log('□ Create master translation table:');
console.log('  Disk | Offset | Size | Original JP | English Translation');
console.log('  -----+--------+------+-------------+-------------------');
console.log('   Sys | 0x1234 | 12   | こんにちは  | Hello');
console.log('   Sys | 0x1240 | 8    | ありがとう  | Thank you');
console.log('');

console.log('□ For actual game patching (separate tool):');
console.log('  1. Read original disk');
console.log('  2. For each translation entry:');
console.log('     - Verify offset in disk');
console.log('     - If English length <= original: direct replacement');
console.log('     - If longer: may need to relocate to different offset');
console.log('  3. Create patched disk image');
console.log('  4. Test in emulator (Anex86, Neko Project II, etc.)');
console.log('');

console.log('UTILITY FEATURES FOR TRANSLATION');
console.log('═'.repeat(70));
console.log('');

console.log('DIAGNOSTICS EXPORT (Ctrl+Shift+D):');
console.log('  Press Ctrl+Shift+D to export:');
console.log('  - Complete session state (all loaded disks)');
console.log('  - Full hex preview of current disk');
console.log('  - Partition table information');
console.log('  - Notes field for documentation');
console.log('  - Saved as JSON for archival/debugging');
console.log('');

console.log('EXTRACT BYTE RANGE:');
console.log('  In DiskEdit mode (Ctrl+2 with expert armed):');
console.log('  □ Select byte range in hex viewer');
console.log('  □ Click "Extract Selection"');
console.log('  □ Save as .bin file');
console.log('  □ File contents = exact bytes from disk');
console.log('  □ Useful for: resource analysis, tool compatibility');
console.log('');

console.log('REPORT ISSUE:');
console.log('  Click "Report Issue" button to:');
console.log('  □ Open GitHub issue template');
console.log('  □ Pre-filled with your session context:');
console.log('    - Current disk path');
console.log('    - Current queue status');
console.log('    - Recent errors/messages');
console.log('    - App version and system info');
console.log('');

console.log('KEYBOARD REFERENCE');
console.log('═'.repeat(70));
console.log('');
console.log('Navigation:');
console.log('  Ctrl+G         Jump to byte offset (hex or decimal)');
console.log('  Ctrl+L         Jump to LBA logical block address');
console.log('  Click hex row   Navigate within view');
console.log('');
console.log('Selection & Copying:');
console.log('  Click + Shift+Click    Select byte range');
console.log('  Ctrl+C                 Copy offset/LBA');
console.log('  Ctrl+C (from text)     Copy decoded text');
console.log('');
console.log('Mode Selection:');
console.log('  Ctrl+1                 DiskTools (guided/safe mode)');
console.log('  Ctrl+2                 DiskEdit (expert/manual mode)');
console.log('  Ctrl+Shift+E           Arm expert actions (enable extracts)');
console.log('');
console.log('File Operations:');
console.log('  Ctrl+O                 Open single disk image');
console.log('  Ctrl+Shift+O           Queue multiple disks');
console.log('  Ctrl+Enter             Run batch queue');
console.log('  Esc                    Stop batch queue');
console.log('');
console.log('Other:');
console.log('  Ctrl+Shift+D           Export diagnostics');
console.log('  Click "Report Issue"   Open GitHub issue template');
console.log('');

console.log('TROUBLESHOOTING');
console.log('═'.repeat(70));
console.log('');

console.log('Issue: Disk shows garbage text');
console.log('Solution:');
console.log('  □ Check Character Frame panel for byte roles');
console.log('  □ Try different Charset dropdown:');
console.log('    - Shift-JIS (default)');
console.log('    - EUC-JP (alternative Japanese)');
console.log('    - ASCII (for English sections)');
console.log('  □ Some bytes may be control codes, not text');
console.log('');

console.log('Issue: Cannot extract byte range');
console.log('Solution:');
console.log('  □ Verify you\'re in DiskEdit mode (Ctrl+2)');
console.log('  □ Verify expert actions are armed (Ctrl+Shift+E)');
console.log('  □ Try extracting different offset/length');
console.log('');

console.log('Issue: Text selection seems incomplete');
console.log('Solution:');
console.log('  □ Remember: 1 character = 2 bytes in Shift-JIS');
console.log('  □ Select from start of lead byte to end of trail byte');
console.log('  □ Character Frame shows individual byte roles');
console.log('  □ Watch for multi-byte sequences');
console.log('');

console.log('NEXT STEPS');
console.log('═'.repeat(70));
console.log('');
console.log('1. Copy all 6 Alshark HDM files to working folder');
console.log('2. Launch DiskScribe2026: npm run desktop:start');
console.log('3. Open first disk: Ctrl+O');
console.log('4. Switch to DiskEdit: Ctrl+2');
console.log('5. Arm expert: Ctrl+Shift+E');
console.log('6. Start scanning systematically (Ctrl+G to jump, click to select)');
console.log('7. Record all text in translation spreadsheet/database');
console.log('8. Use batch queue (Ctrl+Shift+O) to process all disks');
console.log('9. Compile master translation table');
console.log('10. Use separate patching tool to create English version');
console.log('');

console.log('═'.repeat(70));
console.log('Good luck with your Alshark English translation project!');
console.log('═'.repeat(70));
console.log('');
