# Bilingual Translation System - Quick Start Guide

## 🎮 Translating Your First Game

This system allows you to extract Japanese text from PC-98 game disks, translate it to English, and create patched versions - all from within DiskScribe2026 Desktop.

### Prerequisites

1. **Game Disk Images** - You need copies of your game disks in supported formats:
   - .hdm (Anex86/T98 format)
   - .hdi (Anex86 format)  
   - .d88 (D88 format)
   - .fdi (FDI format)
   - .nhd, .hdd, .fdd, .img, .ima, .vfd, .xdf, .raw, .bin

2. **DiskScribe2026 Desktop** - Latest version with buildnumber ≥ with bilingual translation UI

3. **Text Editor** - For editing JSON translation files offline (optional)

---

## 📋 Step-by-Step Process

### STEP 1: Open DiskScribe2026 Desktop

Launch the application. You should see:
- Header with "DiskScribe2026 Desktop" and workbench mode (DiskTools/DiskEdit)
- Toolbar with buttons including "Queue Files", "Run Batch", "Translation Tools"
- Status bar at bottom showing "Open a disk image to begin"

### STEP 2: Queue Your Game Disks

1. Click **"Queue Files"** button in toolbar
2. Navigate to your disk images folder
3. Select all disk images from your game:
   - System disk
   - Data disk
   - Visual disk
   - Opening disk
   - Ending disk
   - Any other game disks
4. Click "Add" to queue them

You should see them appear in the queue view with file paths and sizes listed.

### STEP 3: Open Translation Tools

1. Click **"Translation Tools"** button in toolbar
2. The Translation Workflow panel opens on the right
3. You'll see:
   - Status indicators (0 Total, 0 Translated, 0 Verified)
   - Category filter tabs (All, Dialog, UI/Menu, Combat, Names/Items, Other)
   - Large bilingual table with columns for Japanese and English
   - Four main action buttons

### STEP 4: Extract Text from Disks

1. In the Translation Workflow panel, click **"📥 Extract"**
2. The app scans all queued disks:
   - Reads all disk image files
   - Detects Shift-JIS Japan text patterns
   - Identifies ASCII text
   - Categorizes by context (UI, dialog, combat, etc.)
   - Records exact byte offsets
3. Status shows: "Extracting... this may take a minute"
4. Progress bar fills as extraction proceeds
5. When done, status shows: "✓ Extracted 252,086 strings"

**What was extracted:**
- 252,086 total text strings across all disks
- Breakdown: UI/Menu items, Dialog, Combat status, Names/Items, Other
- Each string knows: its disk, exact offset, original Japanese, category

### STEP 5: Auto-Translate to English

1. Click **"🤖 Auto-Translate"** button
2. The system applies translations:
   - Uses built-in glossary of game terms
   - "新しいゲーム" → "New Game"
   - "攻撃" → "Attack"
   - "セーブ" → "Save"
   - Handles unknown terms gracefully
3. Progress updates real-time
4. Statistics update as translations complete:
   - Total: 252,086
   - Translated: (count)
   - Verified: 0 (need manual review/approval)

### STEP 6: Review & Edit Translations

The bilingual table now shows:
- **Left column (🇯🇵):** Original Japanese text
- **Middle column (🇺🇸):** Automatically generated English translation
- **Right column:** Status badge showing "→" (auto-translated)

**To edit a translation:**
1. Click the English text field you want to change
2. Edit the text directly
3. The status changes from "→" (auto) to "●" (manual override)
4. Press Tab or click elsewhere to save

**To filter and focus on specific categories:**
1. Click filter tabs: "Dialog", "UI/Menu", "Combat", "Names/Items", "Other"
2. Table shows only that category
3. Review and edit those strings
4. Switch tabs to edit other categories

**Why edit?**
- Fix ambiguous translations
- Shorten text that won't fit in game UI  boxes
- Ensure character names are consistent
- Match tone (formal vs casual)
- Fix any mistakes from auto-translation

### STEP 7: Mark Translations as Verified

Once you're happy with a translation:
1. Click the status badge (current status shown)
2. A dialog appears: "Mark as verified?"
3. Click "✓ Verify"
4. Badge changes to green "✓"
5. Verified count increases

**Why verify?**
- Only verified translations will be applied to disks
- Helps you track what's been reviewed
- Ensures quality before patching disks

### STEP 8: Save Your Translation Work

1. Click **"💾 Save"** button
2. Your translation work is copied to clipboard as JSON
3. Paste into a text editor and save as `alshark-translations.json`
4. This is your backup in case something goes wrong
5. Can be loaded back in later sessions

**The JSON includes:**
```json
{
  "exportDate": "2026-02-26T15:30:00Z",
  "totalStrings": 252086,
  "byCategory": {
    "ui_menu": [
      {
        "disk": "System disk.hdm",
        "offset": "0x000082",
        "originalText": "新しいゲーム",
        "translation": "New Game",
        "verified": true
      },
      ...more strings...
    ],
    ...other categories...
  }
}
```

### STEP 9: Apply Translations to Disks (Patch)

1. Click **"✅ Apply"** button
2. The system:
   - Reads original disk files
   - Creates `.backup` copies (for safety)
   - Finds each translation offset in the disk
   - Replaces Japanese bytes with English bytes
   - Handles length constraints:
     - Truncates long translations safely
     - Pads short translations with null bytes
   - Creates new `.patched` disk files
   - Verifies patched file integrity
3. Status shows: "✓ Patched 3 disks successfully"

**Output files created:**
- `System disk.hdm.backup.1708959000` - Original backup
- `System disk.hdm.patched` - Patched version with English
- `System disk.hdm.patched.backup.1708959000` - Backup of patched

### STEP 10: Test Your Patched Disks

1. Open your PC-98 emulator (Anex86, T98-Next, etc.)
2. Configure to use the `.patched` disk files instead of originals
3. Boot the game
4. Verify:
   - Menu text appears in English
   - Dialog is readable English
   - Text fits in UI boxes
   - No corrupted characters

**If something doesn't look right:**
- Original disks are untouched (in backups)
- Go back to Step 6 and edit that specific string
- Re-translate that string
- Re-apply translations
- Re-test

---

## 💡 Pro Tips

### For Long Dialog Text
- If a translation is too long for a text box:
  1. Edit the English text to be shorter
  2. Keep meaning but remove unnecessary words
  3. Use abbreviations if appropriate
  4. Status will show length warning

### For Consistent Terminology
- Game characters should always be called by same English name
- Items should be consistent across all mentions
- Look at "Names/Items" category to ensure consistency

### For Batch Projects
- Extract once, translate over time
- Save regularly with "💾 Save"
- You can reload your session later
- Team members can translate different categories

### If You Know Japanese
- Use "🇯🇵 Japanese" column to verify auto-translations are sensible
- Edit to match original nuance if needed
- Manual review by native speaker ensures quality

### Collaborating with Others
- Share extraction JSON file
- Each person translates different category
- Combine translations back together
- Verify full game in context

---

## ⚙️ Advanced Options

### Using Claude API for Better Translations
(Coming soon - environment variable setup)

###File-by-File Control
- Extract a single disk instead of batch
- Translate incrementally
- Re-extract individual disks if content changes

---

## 🔧 Troubleshooting

**"No extraction yet" message appears**
- Make sure you clicked "Queue Files" first
- Make sure disks stayed in queue
- Click "Extract" again

**Some translations are still Japanese**
- These are unknown or very rare phrases
- Edit manually or research what they mean
- It's OK to leave untranslated if you don't know them

**Text doesn't fit in game UI boxes**
- Go back to Stage 6
- Edit the English to be shorter
- Re-apply translations
- Re-test

**Patched disk won't boot**
- Check backups were created (look for .backup files)
- Original disks still work - test with those
- Verify patches were applied correctly
- Check disk image format compatibility

**Emulator shows garbled characters**
- This usually means encoding issue
- Verify you're using standard ASCII for English
- Avoid special unicode characters if game expects ASCII

---

## 📊 What Happens Under The Hood

1. **Extraction**: Scans disk files byte-by-byte, finds text boundaries using character encoding rules, records offsets
2. **Translation**: Uses glossary/API to convert Japanese to English, caches duplicates, validates length
3. **Verification**: User reviews and approves translations
4. **Patching**: Reads original disk, creates backup, finds offset, replaces bytes, writes new file, verifies integrity
5. **Testing**: You verify game works with patched disks

---

## 🎯 Success Criteria

You'll know it worked when:
- ✅ Game boots with patched disks
- ✅ Menu shows English text
- ✅ Dialog is in English
- ✅ Text fits in UI boxes without wrapping incorrectly
- ✅ No weird characters or corruption
- ✅ Game is fully playable

---

## 📞 Support & Next Steps

- Original disks are always safe (backups preserved)
- You can iterate: edit translations → re-patch → re-test
- Share your patched disks with the community
- Document any special handling in README
- Consider sharing your translation file for others

---

**Congratulations!** 🎉 You've successfully localized a PC-98 game from Japanese to English!
