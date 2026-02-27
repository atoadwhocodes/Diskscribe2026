═══════════════════════════════════════════════════════════════════════════════
                    PROJECT FILE FORMAT - REFERENCE
═══════════════════════════════════════════════════════════════════════════════

## File Type: .project.json

Translation project files are standard JSON documents containing all metadata,
translations, and statistics for a PC-98 game localization project.

───────────────────────────────────────────────────────────────────────────────
## Schema Overview

```json
{
  "metadata": {
    "version": "1.0.0",
    "name": "Alshark English Translation",
    "gameId": "alshark-pc98",
    "sourceLanguage": "ja",
    "targetLanguage": "en",
    "created": "2026-02-26T12:00:00.000Z",
    "modified": "2026-02-26T14:30:00.000Z",
    "author": "Translator Name",
    "description": "Full English translation of Alshark for PC-98",
    "tags": ["alshark-pc98", "ja", "en", "game"],
    "checksum": "1aa9e6a3f3002d79"
  },

  "config": {
    "patchProfile": "alshark-pc98",
    "creationType": "alshark-pc98",
    "encoding": "shift_jis",
    "preserveNewlines": true,
    "aggressiveReflow": false,
    "backupBeforePatch": true,
    "verifyAfterPatch": true
  },

  "statistics": {
    "totalStrings": 252086,
    "translated": 245000,
    "verified": 100000,
    "withWarnings": 500,
    "byCategory": {
      "ui_menu": { "total": 50, "translated": 50, "verified": 50 },
      "dialog": { "total": 100, "translated": 100, "verified": 80 },
      "combat_status": { "total": 30, "translated": 25, "verified": 15 },
      "name_item": { "total": 20, "translated": 20, "verified": 20 },
      "other": { "total": 100086, "translated": 100085, "verified": 90000 }
    },
    "byDisk": {
      "Alshark (System disk).hdm": { "total": 60000, "translated": 58000, "verified": 50000 },
      "Alshark (Data disk).hdm": { "total": 70000, "translated": 68000, "verified": 20000 },
      "Alshark (Visual disk).hdm": { "total": 45000, "translated": 45000, "verified": 20000 },
      "Alshark (Opening disk).hdm": { "total": 35000, "translated": 35000, "verified": 10000 },
      "Alshark (Ending disk).hdm": { "total": 40000, "translated": 35000, "verified": 0 },
      "Alshark (User disk).hdm": { "total": 2086, "translated": 2000, "verified": 0 }
    }
  },

  "output": {
    "patchedDisks": [
      { "originalName": "Alshark (System disk).hdm", "patchedName": "Alshark (System disk)-TRANSLATED.hdm", "date": "2026-02-26T14:30:00.000Z" }
    ],
    "backups": [
      { "diskName": "Alshark (System disk).hdm", "backupPath": "backups/Alshark (System disk).hdm.backup.1772102822414" }
    ],
    "lastPatchTime": "2026-02-26T14:30:00.000Z"
  },

  "strings": [
    {
      "id": "s_000000",
      "disk": "Alshark (System disk).hdm",
      "offset": "0x000082",
      "offsetHex": "0x000082",
      "originalBytes": [142, 175, 193, 172],
      "original": "あたらしいゲーム",
      "translation": "New Game",
      "wrapped": "New Game",
      "wrappedLines": ["New Game"],
      "category": "ui_menu",
      "encoding": "shift_jis",
      "isJapanese": true,
      "verified": true,
      "reflowStatus": "ok",
      "warnings": [],
      "notes": ""
    },
    {
      "id": "s_000001",
      "disk": "Alshark (System disk).hdm",
      "offset": "0x00008a",
      "offsetHex": "0x00008a",
      "originalBytes": [203, 145],
      "original": "こんにちは、勇者よ。",
      "translation": "Hello brave warrior.",
      "wrapped": "Hello brave\nwarrior.",
      "wrappedLines": ["Hello brave", "warrior."],
      "category": "dialog",
      "encoding": "shift_jis",
      "isJapanese": true,
      "verified": false,
      "reflowStatus": "wrapped",
      "warnings": [
        "Text may need more natural phrasing"
      ],
      "notes": "Consider 'Hero' instead of 'brave warrior' for consistency"
    }
  ]
}
```

───────────────────────────────────────────────────────────────────────────────
## Field Definitions

### metadata (Object)
Project metadata and information.

**version** (string)
- Schema version for compatibility checking
- Current: "1.0.0"

**name** (string)
- Human-readable project name
- Example: "Alshark English Translation"

**gameId** (string)
- Unique identifier for the game
- Format: {game}-{system}-{variant}
- Example: "alshark-pc98"

**sourceLanguage** (string)
- Source language code (ISO 639-1)
- Example: "ja" (Japanese)

**targetLanguage** (string)
- Target language code (ISO 639-1)
- Example: "en" (English)

**created** (ISO 8601 string)
- Project creation timestamp
- Format: "2026-02-26T12:00:00.000Z"

**modified** (ISO 8601 string)
- Last modification timestamp
- Updates automatically

**author** (string)
- Project creator/lead translator

**description** (string)
- Project description (optional)

**tags** (string array)
- Searchable tags for organization
- Example: ["alshark-pc98", "ja", "en", "game"]

**checksum** (string)
- SHA256 hash (first 16 chars) of strings for integrity
- Automatically calculated during save

───────────────────────────────────────────────────────────────────────────────
### config (Object)
Project configuration settings.

**patchProfile** (string)
- Game profile for constraints
- Example: "alshark-pc98"

**creationType** (string)
- Type of content created
- Values: "alshark-pc98" (others for future games)

**encoding** (string)
- Text encoding for the game
- Example: "shift_jis"

**preserveNewlines** (boolean)
- Whether to preserve \n in original text
- Default: true

**aggressiveReflow** (boolean)
- Forcefully truncate to fit constraints
- Default: false (warns instead)

**backupBeforePatch** (boolean)
- Automatically backup before patching
- Default: true

**verifyAfterPatch** (boolean)
- Verify disk integrity after patching
- Default: true

───────────────────────────────────────────────────────────────────────────────
### statistics (Object)
Automatically calculated statistics (READ-ONLY in manual editing).

**totalStrings** (number)
- Total number of strings in project

**translated** (number)
- Strings with non-empty translations

**verified** (number)
- Strings marked as verified/complete

**withWarnings** (number)
- Strings flagged with warnings

**byCategory** (Object)
- Stats grouped by text category
- Each has: total, translated, verified

**byDisk** (Object)
- Stats grouped by source disk
- Each has: total, translated, verified

───────────────────────────────────────────────────────────────────────────────
### output (Object)
Patching output history.

**patchedDisks** (Array)
- List of created patched disk files
- Contains: originalName, patchedName, date

**backups** (Array)
- List of backup files created
- Contains: diskName, backupPath

**lastPatchTime** (ISO 8601 string)
- Timestamp of most recent patch operation

───────────────────────────────────────────────────────────────────────────────
### strings (Array)
Array of TextString objects, one per extracted string.

**id** (string)
- Unique identifier within project
- Format: "s_XXXXXX" (padded 6-digit index)

**disk** (string)
- Source disk filename
- Example: "Alshark (System disk).hdm"

**offset** (string)
- Byte offset in disk (decimal string)
- Example: "0x000082"

**offsetHex** (string)
- Byte offset in hex notation
- Example: "0x000082"

**originalBytes** (byte array)
- Original bytes at this location
- Used for validation

**original** (string)
- Original Japanese text

**translation** (string)
- English translation (editable)

**wrapped** (string)
- Reflowed version (newline-separated)
- Used for actual patching

**wrappedLines** (string array)
- Individual lines after wrapping
- Example: ["Hello brave", "warrior."]

**category** (string)
- Text classification
- Values: "ui_menu", "dialog", "combat_status", "name_item", "location", "other"

**encoding** (string)
- Text encoding ("shift_jis", etc.)

**isJapanese** (boolean)
- Whether original is Japanese

**verified** (boolean)
- Whether translator approved this translation

**reflowStatus** (string)
- Reflow result status
- Values: "ok", "wrapped", "truncated", "overflow", "needs_manual", "not_checked"

**warnings** (string array)
- List of warnings/issues
- Examples: "Text exceeds textbox", "Overflow in wrapped"

**notes** (string)
- Translator notes (optional)

───────────────────────────────────────────────────────────────────────────────
## Usage Examples

### Create new project
```javascript
const { ProjectManager } = require('./src/project-manager.js');
const pm = new ProjectManager();
pm.createProject('Alshark English', 'alshark-pc98', 'ja', 'en');
```

### Load existing project
```javascript
const pm = new ProjectManager();
pm.load('path/to/alshark-translation.project.json');
```

### Add extracted strings
```javascript
pm.addStringsFromExtraction(extractedData);
pm.updateStatistics();
```

### Update translation
```javascript
pm.updateString('s_000000', 'New Game', 'New Game', true);
```

### Save project
```javascript
pm.save('path/to/save/alshark-translation.project.json');
```

### Export translations
```javascript
// CSV export
const csv = pm.export('csv', { onlyVerified: true });

// Verified translations only
const verified = pm.export('translation-only', { onlyVerified: true });
```

### Get summary
```javascript
console.log(pm.getSummary());
```

───────────────────────────────────────────────────────────────────────────────
## File Size Notes

Typical project file sizes:

- 5,000 strings: ~500 KB
- 50,000 strings: ~5 MB
- 250,000 strings (Alshark): ~25 MB

JSON is human-readable and can be edited manually with any text editor.

───────────────────────────────────────────────────────────────────────────────
## Backward Compatibility

Projects are versioned using semantic versioning (metadata.version).

Current version: 1.0.0

Projects from earlier versions should be upgraded using migration functions
(to be implemented when format changes).

───────────────────────────────────────────────────────────────────────────────
## Integrity Verification

Projects include a SHA256 checksum of the strings data.

When loading a project:
- Checksum is automatically verified
- If mismatch found, loading fails with error
- Prevents accidental file corruption

To recalculate after manual editing:
```javascript
pm.save()  // Automatically recalculates checksum
```

═══════════════════════════════════════════════════════════════════════════════
