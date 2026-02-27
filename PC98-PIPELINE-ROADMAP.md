DiskScribe2026: PC-98 Translation Pipeline - Implementation Roadmap
═══════════════════════════════════════════════════════════════════════════════

## CURRENT STATUS → SPEC MAPPING

### ✅ Phase 1 MVP - Already Built

┌─ String Table Extraction ────────────────────────────────────────────────┐
│ Current: extract-alshark-v2.js                                          │
│ Status: ✅ Production tested on 6 disks, 252,086 strings extracted      │
│ Output format: Matches spec JSON exactly                                │
│ ├─ Per-disk JSON files with metadata (offset, encoding, category)      │
│ ├─ Shift-JIS decoding working                                          │
│ ├─ Control code detection working                                      │
│ └─ Master extraction JSON with all strings                             │
│                                                                         │
│ Need to refactor: Extract into reusable TextExtractor class            │
└─────────────────────────────────────────────────────────────────────────┘

┌─ Translation Engine ──────────────────────────────────────────────────┐
│ Current: translation-service.js                                        │
│ Status: ✅ Mock translations tested, Claude API ready                 │
│ ├─ Pluggable backends (Claude, Mock, future APIs)                    │
│ ├─ Glossary support for terms                                        │
│ ├─ Batch processing with caching                                     │
│ └─ Context-aware (knows file, offset, category)                      │
│                                                                      │
│ Ready: Just needs environment variable for API key                   │
└──────────────────────────────────────────────────────────────────────┘

┌─ Patch & Rebuild ─────────────────────────────────────────────────────┐
│ Current: disk-reinsertion.js                                           │
│ Status: ✅ Byte-level patching tested on real disk                   │
│ ├─ TextRegion: offset tracking, encoding, byte replacement           │
│ ├─ DiskPatcher: backup creation, validation, reinsertion            │
│ ├─ BatchPatcher: multi-disk coordination                            │
│ └─ Safety: automatic backups, pre/post verification                │
│                                                                      │
│ Need: Integrate with disk extraction (HDM → filesystem)            │
└──────────────────────────────────────────────────────────────────────┘

## ❌ MISSING: Phase 1 Step 5 - TEXT REFLOW/WRAPPING

This is the critical gap. Text flows from extraction → translation → **HERE** → patching.

### Current Flow:
```
extract-alshark-v2.js         translation-service.js         disk-reinsertion.js
         ↓                               ↓                              ↓
   "そうか。"  ───────→  "I understand."  ───────→  **[NEEDS WRAPPING]**  ───────→ patch disk
  (8 bytes)          (14 bytes, wider!)       (won't fit textbox!)
```

### Problem Case (from game research):
- Text box width: 16 tiles = 16 ASCII chars = 8 Japanese chars
- Original: "そうか。" = 4 chars = fits
- Translation: "I understand." = 12 chars = OVERFLOW 25%
- Options:
  1. Truncate: "I understan" (loses meaning)
  2. Abbreviate: "I get it." (changes tone)
  3. Wrap: Put on multiple lines if textbox supports it
  4. Phonetic: "I understand" → "I see" (4 chars, preserves meaning)

---

## PHASE 1 FINAL PIECE: TEXT REFLOW ENGINE

### Module: `src/text-reflow.js` (NEW)

```typescript
interface TextboxConstraint {
  widthTiles: number;        // Textbox width in tiles/characters
  heightTiles?: number;      // Number of lines (optional)
  encoding: 'ascii' | 'sjis' | 'mixed';  // What text can appear here
  preserveNewlines?: boolean; // Keep explicit \n?
  controlCodes?: string[];   // Reserved bytes: [0xFF], [0xFE], etc
}

interface WrappedText {
  original: string;
  translation: string;
  wrapped: string;           // Lines joined by \n or control char
  lines: string[];
  byteLengths: number[];     // Per-line byte length
  warnings: string[];        // "Line 2 exceeds by 5 chars", "Line ends with 。"
  status: 'ok' | 'truncated' | 'wrapped' | 'overflow' | 'needs_manual';
}

class TextReflowEngine {
  
  // Core reflow algorithm
  reflowText(
    translation: string,
    constraint: TextboxConstraint,
    config?: ReflowConfig
  ): WrappedText {
    // 1. Detect language (Japanese vs English)
    // 2. Apply break rules (space-based for EN, char-based for JP)
    // 3. Split into lines respecting width
    // 4. Check final fit
    // 5. Return wrapped + warnings
  }
  
  // Language-specific strategies
  private wrapEnglish(text: string, widthChars: number): string[]
  private wrapJapanese(text: string, widthChars: number): string[]
  
  // Constraint checking
  getConstraintFor(gameFile: string, offset: number): TextboxConstraint {
    // Look up from patch profile (later: load from file)
    // For now: return sensible defaults for Alshark
  }
}
```

### Flow:
```
Translation      TextReflowEngine          Constrained Output
      ↓                  ↓                         ↓
"I understand."  → reflowText()  →  ["I", "understand."]
                    (16 chars)      (2 lines × 8 chars each)
```

### Profiles (future, start with hardcoded)

For **Alshark PC-98**, known textbox dimensions:
- Dialog: 16 chars × 3 lines
- Menu: 12 chars × 1 line
- Status: 8 chars × 4 lines
- (These come from game research: ROM disassembly, emulator observation)

---

## INTEGRATION POINTS

### 1. Bilingual Translation UI
```typescript
// In bilingual-translation-ui.ts, after translation:

const wrapped = reflowEngine.reflowText(
  translation,
  constraint,
  { language: 'en', hyphenation: true }
);

// Display in table:
// ┌─ Japanese ────────┬─ Translation ─────┬─ Wrapped ─────────┐
// │ そうか。          │ I understand.     │ I understand. ✓   │
// │                   │                   │ (Fits: 2 lines)   │
```

### 2. Text Region (disk-reinsertion.js)
```typescript
// When setting translation on a TextRegion:

textRegion.setTranslation(translation);
textRegion.reflowedText = reflow.reflowText(
  translation,
  constraints[textRegion.offset]
);

// Use reflowedText bytes for patching, not raw translation
const patchBytes = encode(textRegion.reflowedText);
```

### 3. Project JSON (Phase 1.5)
```json
{
  "project": {
    "name": "Alshark English Translation",
    "gameId": "alshark-pc98",
    "patchProfile": "alshark-pc98-1992",
    "resultDisk": "Alshark (Data disk)-TRANSLATED.hdm"
  },
  "strings": [
    {
      "id": "s_000123",
      "offsetHex": "0x000003",
      "original": "そうか。",
      "translation": "I understand.",
      "wrapped": "I\nunderstand.",
      "textboxConstraint": {
        "widthTiles": 16,
        "status": "ok"
      },
      "status": "needs_review"
    }
  ]
}
```

---

## IMPLEMENTATION SEQUENCE (This Week)

### Task 1: Refactor to Modules (2-3 hours)
- Move TextExtractor into `src/text-extractor.js` (reusable class)
- Move TranslationManager, backends into `src/translation-engine.js`
- Move TextRegion, DiskPatcher into `src/disk-engine.js`
- Create barrel export: `src/localization-engine.js`

### Task 2: Implement Wrap Engine (3-4 hours)
- Create `src/text-reflow.js` with TextReflowEngine
- Implement `wrapEnglish()` (space-based breaking)
- Implement `wrapJapanese()` (char-based, avoid punctuation leads)
- Test on sample strings from Alshark extraction
- Hardcode constraint profiles for Alshark disks

### Task 3: 1-Pass Integration (2 hours)
- Update `bilingual-translation-ui.ts` to use reflow on each translation
- Show wrapped preview in the table
- Display "✓ Fits" / "⚠️ Truncated" / "❌ Overflow" badges

### Task 4: Project File (2 hours)
- Create `project-manager.js` to save/load JSON
- Add "Save Project" button to UI
- Implement "Load Project" to resume
- Store all strings with wrapped versions

---

## TECHNICAL DETAILS: English Wrapping

The "magic" is in smart breaking:

```
Text:      "I understand."
Width:     16 chars
Options:
  A) "I understand." (14 chars, fits on 1 line) ✓
  B) "I\nunderstand." (2 lines, 5 + 12) ✓
  C) "I understand" (truncate punct) ✗

Choose A if width ≥ 14, else choose B.

Advanced: Hyphenate if width < 8 chars
  "Understanding" → "Under-\nstanding" (6 + 7 chars)
```

Algorithm pseudocode:
```javascript
function wrapEnglish(text, width) {
  // 1. Try fit on 1 line
  if (text.length <= width) return [text];
  
  // 2. Try break at spaces
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  // 3. If any line still too long, hyphenate it
  return lines.flatMap(line => {
    if (line.length <= width) return [line];
    return hyphenate(line, width);
  });
}
```

---

## Phase 2/3 Roadmap (Later)

### Phase 2:
- ✓ Multi-disk projects (already have BatchPatcher)
- ✓ Patch profiles (load from JSON, not hardcoded)
- ✓ Visual preview with textbox mockup in UI
- ✗ Glossary/translation memory persistence
- ✗ Collaboration features

### Phase 3:
- ✗ Custom font injection
- ✗ Pointer repacking (allow longer strings)
- ✗ Scene-aware translation grouping
- ✗ Advanced glyph coverage reporting

---

## Success Criteria (Phase 1 Complete)

- [ ] Extract 252K+ strings from Alshark
- [ ] Translate all with English equivalents
- [ ] **REFLOW** each to fit original textboxes
- [ ] Patch all 6 disks with reflowed text
- [ ] Save project to JSON
- [ ] Load project and resume
- [ ] Boot patched game in emulator
- [ ] See native English text in game UI and dialog

At this point: "It just works" for Alshark. Everything is reproducible, versionable, reversible.

---

## Files to Create/Modify (This Week)

### Create:
```
src/text-reflow.js              (200 lines)
src/localization-engine.js      (30 lines, barrel)
src/project-manager.js          (150 lines)
apps/.../src/text-reflow-ui.ts  (UI preview, optional)
```

### Modify:
```
src/text-extractor.js           (refactor only)
src/translation-engine.js       (refactor only)
src/disk-engine.js              (refactor only)
apps/.../src/bilingual-translation-ui.ts (add reflow display)
```

Total new code: ~400 lines
Total refactoring: ~100 lines (reorganizing existing code)

---

## NEXT STEP

Ready to start building?

1. **Start with wrap engine** (Task 2) — implement & test in isolation
2. **Then integrate** into bilingual UI

OR

3. **Refactor first** (Task 1) — tidy up modules
4. **Then add wrap engine**

Which order?
