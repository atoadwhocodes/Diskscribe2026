<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Take this deeper and correct and refine for VSCODE

Technical Framework for Japanese-to-English Translation on the NEC PC-9801: A Comprehensive Guide to Shift-JIS, Character ROM Architecture, and Script De-interlacing
The technical landscape of the NEC PC-9801 (PC-98) represents a pivotal era in Japanese computing, where the intersection of hardware limitations and linguistic complexity necessitated the creation of specialized encoding standards and character generation systems. For modern translation and localization efforts, understanding this architecture is not merely a matter of font replacement but a deep dive into the mechanics of Shift-JIS (SJIS), the PC-98’s unique memory mapping, and the heuristic challenges of separating execution logic from narrative text. This report serves as an exhaustive technical reference for localizing Katakana, Hiragana, and Kanji within the PC-98 environment, providing the necessary codifications and methodologies to ensure data integrity during English translation projects.   
The Evolution and Structure of Japanese Character Encodings
The foundational challenge of Japanese computing in the late 20th century was the sheer volume of the character set. While Western alphabets could be accommodated within a 7-bit or 8-bit ASCII framework (providing 128 to 256 points), Japanese literacy requires thousands of unique graphemes. This requirement led to the development of the Japanese Industrial Standards (JIS) for character sets, which eventually evolved into the Shift-JIS encoding format that dominated the PC-98 era.   
The JIS Standards: JIS X 0201 and JIS X 0208
Before Shift-JIS became the standard, the Japanese industry utilized discrete standards to handle different components of the language. JIS X 0201, originally known as JIS C 6220, was the first step toward a standardized Japanese encoding. It is an 8-bit character set that supports Roman characters and half-width katakana. The 7-bit portion (0x00 to 0x7F) is nearly identical to ASCII, with two notable exceptions that continue to plague modern migrations: the replacement of the backslash (0x5C) with the yen symbol (¥) and the tilde (0x7E) with the overline (‾).   
The second half of JIS X 0201 (0xA1 to 0xDF) provides half-width katakana, which are narrower versions of the phonetic characters designed to fit the same fixed-width display cells as Roman letters. These characters were designed in the 1960s when computational power was insufficient to store or render complex kanji, and they remain critical in legacy systems for UI labels and compact lists.   
Byte Range
Character Type
Description
0x00 - 0x1F
Control Characters
Non-printable signals (NUL, ESC, etc.)
0x20 - 0x7E
JIS Roman
Standard ASCII with Yen/Overline variants
0xA1 - 0xDF
Half-width Katakana
Phonetic characters (ｦ through ﾟ)
  
JIS X 0208 was later developed to handle the broader requirements of kanji, providing a 94x94 matrix capable of encoding 8,836 characters. This matrix uses a "Kuten" (row-cell) system to identify characters. However, JIS X 0208 is a double-byte character set (DBCS) that requires a different handling mechanism than the single-byte JIS X 0201. The standard evolved through several revisions (1978, 1983, 1990, and 1997), with each iteration adding or shuffling characters, which necessitates careful version tracking when extracting text from software of different eras.   
The Mechanics of Shift-JIS (SJIS)
Shift-JIS was developed by Microsoft and the ASCII Corporation to allow the intermingling of single-byte JIS X 0201 characters and double-byte JIS X 0208 characters without the use of "Shift-In" or "Shift-Out" control sequences. This "stateless" nature made it highly efficient for the PC-98's limited memory and processing power, as it did not require the system to maintain a mode state for interpreting the next byte.   
The "Shift" in Shift-JIS refers to the mathematical transformation used to map the JIS X 0208 Kuten codes into specific byte ranges that do not conflict with the single-byte katakana of JIS X 0201. The lead byte of a double-byte character is "shifted" to the ranges 0x81–0x9F and 0xE0–0xEF, while the trailing byte is carefully managed to avoid most control character collisions.   
The transformation from a JIS X 0208 Kuten coordinate (row,cell) to Shift-JIS bytes (S1​,S2​) is defined by the following mathematical logic:
For the first byte S1​:
If 1≤row≤62, S1​=⌊2row+257​⌋.
If 63≤row≤94, S1​=⌊2row+385​⌋.
For the second byte S2​:
If row is odd, S2​=cell+31 (if 1≤cell≤63) or S2​=cell+32 (if 64≤cell≤94).
If row is even, S2​=cell+126.
These transformations ensure that the first byte always falls outside the 0xA1–0xDF range reserved for half-width katakana, allowing a simple check to determine if a byte starts a two-byte sequence. However, the trailing byte (0x40-0xFC) still overlaps with ASCII, creating the "overlap problem" where a program must read text linearly from the start of a block to reliably distinguish between a trailing byte and a standalone ASCII character.   
PC-9801 Hardware and Character Generation
The PC-98 series, while utilizing x86 processors like Western IBM-compatibles, possesses a distinct architecture for graphics and text handling that localized software must respect. Central to this is the separation of the character generator (CG) and the graphic display controller (GDC).   
The FONT.ROM and Character ROM Access
Unlike Western systems that typically rendered text via software into a framebuffer or used simple VGA text modes, the PC-98 features a dedicated character ROM (often referred to as FONT.ROM in emulation contexts). This ROM contains the bitmap data for thousands of kanji, hiragana, and katakana characters.   
The PC-98's text VRAM is located at memory address 0xA0000 and is 16KB in size. Text cells on the PC-98 are 16-bit words. A character in text memory is represented by an index that the hardware uses to pull bitmask data from the CG ROM. For translators, this means that text found in a game's binary is often stored in Shift-JIS format, but the game engine must convert these SJIS bytes into CG ROM indices to display them on the screen.   
A common formula used by PC-98 games (such as Rusty) to convert an SJIS value X into a CG ROM coordinate Y is:
y=((x+((x//0x100)≪8)+0x1f82)\&0x7f7f)−0x2000.   
This hardware-level character generation allowed for extremely fast text rendering, which was a competitive advantage for business applications like Ichitaro and Lotus 1-2-3, as well as the text-heavy adventure and RPG genres that dominated the platform's game library.   
Text vs. Graphics Layers
A unique feature of the PC-98 is that text cells can only use a single color for either their foreground or background, with the other pixels being transparent and revealing the graphics planes below. This architectural choice allows the hardware to overlay the text layer directly over the graphics VRAM (located at 0xA8000 and 0xE0000).   
When localizing English text, translators often find that English characters (ANK) are rendered in the text layer, while decorative fonts or large dialogue boxes might be blitted directly into the graphics planes using proprietary image formats like MAG or MGX. The graphics VRAM is composed of four planes (Plane 0, 1, 2, and 3), each managed by specialized accelerators like the Graphic Charger (GRCG) or Enhanced Graphic Charger (EGC). The EGC, introduced with the PC-9801VX in 1986, allowed for parallel processing and bit-shifting, which is crucial for handling variable-width English fonts in the graphics layer.   
Translation Guide: Phonetic Scripts (Hiragana and Katakana)
Phonetic scripts are the backbone of PC-98 dialogue. Hiragana is used for native grammar and particles, while Katakana is primarily used for loanwords, emphasis, and technical terms.   
Hiragana Shift-JIS Mapping
Hiragana characters in Shift-JIS occupy the range from 0x829F to 0x82F1. Unlike single-byte katakana, all hiragana are double-byte "full-width" characters. They are arranged in the standard gojūon order (a, i, u, e, o). A critical detail for localization is the handling of voiced (dakuten) and semi-voiced (handakuten) characters. In Shift-JIS, characters like "ga" (が) are represented by a single two-byte code (0x82AA), whereas in some other encodings like ISO-932, they might be represented as two separate characters (a base character plus a voicing mark).   
Character
Hex Code
Character
Hex Code
Character
Hex Code
ぁ (Small A)
0x829F
あ (A)
0x82A0
ぃ (Small I)
0x82A1
い (I)
0x82A2
ぅ (Small U)
0x82A3
う (U)
0x82A4
ぇ (Small E)
0x82A5
え (E)
0x82A6
ぉ (Small O)
0x82A7
お (O)
0x82A8
か (KA)
0x82A9
が (GA)
0x82AA
き (KI)
0x82AB
ぎ (GI)
0x82AC
く (KU)
0x82AD
ぐ (GU)
0x82AE
け (KE)
0x82AF
げ (GE)
0x82B0
こ (KO)
0x82B1
ご (GO)
0x82B2
さ (SA)
0x82B3
ざ (ZA)
0x82B4
し (SHI)
0x82B5
じ (JI)
0x82B6
す (SU)
0x82B7
ず (ZU)
0x82B8
せ (SE)
0x82B9
ぜ (ZE)
0x82BA
そ (SO)
0x82BB
ぞ (ZO)
0x82BC
た (TA)
0x82BD
だ (DA)
0x82BE
ち (CHI)
0x82BF
ぢ (JI)
0x82C0
っ (Small TSU)
0x82C1
つ (TSU)
0x82C2
づ (ZU)
0x82C3
て (TE)
0x82C4
で (DE)
0x82C5
と (TO)
0x82C6
ど (DO)
0x82C7
な (NA)
0x82C8
に (NI)
0x82C9
ぬ (NU)
0x82CA
ね (NE)
0x82CB
の (NO)
0x82CC
は (HA)
0x82CD
ば (BA)
0x82CE
ぱ (PA)
0x82CF
ひ (HI)
0x82D0
び (BI)
0x82D1
ぴ (PI)
0x82D2
ふ (FU)
0x82D3
ぶ (BU)
0x82D4
ぷ (PU)
0x82D5
へ (HE)
0x82D6
べ (BE)
0x82D7
ぺ (PE)
0x82D8
ほ (HO)
0x82D9
ぼ (BO)
0x82DA
ぽ (PO)
0x82DB
ま (MA)
0x82DC
み (MI)
0x82DD
む (MU)
0x82DE
め (ME)
0x82DF
も (MO)
0x82E0
ゃ (Small YA)
0x82E1
や (YA)
0x82E2
ゅ (Small YU)
0x82E3
ゆ (YU)
0x82E4
ょ (Small YO)
0x82E5
よ (YO)
0x82E6
ら (RA)
0x82E7
り (RI)
0x82E8
る (RU)
0x82E9
れ (RE)
0x82EA
ろ (RO)
0x82EB
ゎ (Small WA)
0x82EC
わ (WA)
0x82ED
ゐ (WI)
0x82EE
ゑ (WE)
0x82EF
を (WO)
0x82F0
ん (N)
0x82F1
  
Katakana Shift-JIS Mapping (Full-width)
Full-width katakana occupies the range 0x8340 to 0x8396. While phonetic equivalents to hiragana, katakana are visually distinct with more angular strokes. In game scripts, they are often used for foreign loanwords, such as "internet" (インターネット) or "software" (ソフトウェア).   
Character
Hex Code
Character
Hex Code
Character
Hex Code
ァ (Small A)
0x8340
ア (A)
0x8341
ィ (Small I)
0x8342
イ (I)
0x8343
ゥ (Small U)
0x8344
ウ (U)
0x8345
ェ (Small E)
0x8346
エ (E)
0x8347
ォ (Small O)
0x8348
オ (O)
0x8349
カ (KA)
0x834A
ガ (GA)
0x834B
キ (KI)
0x834C
ギ (GI)
0x834D
ク (KU)
0x834E
グ (GU)
0x834F
ケ (KE)
0x8350
ゲ (GE)
0x8351
コ (KO)
0x8352
ゴ (GO)
0x8353
サ (SA)
0x8354
ザ (ZA)
0x8355
シ (SHI)
0x8356
ジ (JI)
0x8357
ス (SU)
0x8358
ズ (ZU)
0x8359
セ (SE)
0x835A
ゼ (ZE)
0x835B
ソ (SO)
0x835C
ゾ (ZO)
0x835D
タ (TA)
0x835E
ダ (DA)
0x835F
チ (CHI)
0x8360
ヂ (JI)
0x8361
ッ (Small TSU)
0x8362
ツ (TSU)
0x8363
ヅ (ZU)
0x8364
テ (TE)
0x8365
デ (DE)
0x8366
ト (TO)
0x8367
ド (DO)
0x8368
ナ (NA)
0x8369
ニ (NI)
0x836A
ヌ (NU)
0x836B
ネ (NE)
0x836C
ノ (NO)
0x836D
ハ (HA)
0x836E
バ (BA)
0x836F
パ (PA)
0x8370
ヒ (HI)
0x8371
ビ (BI)
0x8372
ピ (PI)
0x8373
フ (FU)
0x8374
ブ (BU)
0x8375
プ (PU)
0x8376
ヘ (HE)
0x8377
ベ (BE)
0x8378
ペ (PE)
0x8379
ホ (HO)
0x837A
ボ (BO)
0x837B
ポ (PO)
0x837C
マ (MA)
0x837D
ミ (MI)
0x837E
ム (MU)
0x8380
メ (ME)
0x8381
モ (MO)
0x8382
ャ (Small YA)
0x8383
ヤ (YA)
0x8384
ュ (Small YU)
0x8385
ユ (YU)
0x8386
ョ (Small YO)
0x8387
ヨ (YO)
0x8388
ラ (RA)
0x8389
リ (RI)
0x838A
ル (RU)
0x838B
レ (RE)
0x838C
ロ (RO)
0x838D
ヮ (Small WA)
0x838E
ワ (WA)
0x838F
ヰ (WI)
0x8390
ヱ (WE)
0x8391
ヲ (WO)
0x8392
ン (N)
0x8393
ヴ (VU)
0x8394
ヵ (Small KA)
0x8395
ヶ (Small KE)
0x8396
  
Punctuation and Special Symbols
Standard Shift-JIS punctuation resides in the range 0x8140 to 0x81FC. This includes common Japanese symbols such as the ideographic space (0x8140) and the ideographic comma (0x8141). Translators must be aware that many of these characters have full-width counterparts in JIS X 0208 that overlap with their ASCII equivalents (e.g., full-width Roman numerals and basic Latin alphabet).   
Translation Guide: Kanji Levels and Special Symbols
Kanji characters are categorized into levels based on their usage frequency and standardization in school curricula. For localizers, identifying the level of kanji can often provide clues about the game's complexity or the target demographic (e.g., Level 2 kanji are rarer and more likely to be used in adult-oriented or highly literary titles).   
Level 1 and Level 2 Kanji
Level 1 kanji (2,965 characters) are arranged phonetically by their most common hiragana pronunciation, making them relatively easy to look up in traditional dictionaries. They reside primarily in the range 0x889F to 0x9872. Level 2 kanji (3,390 characters) include more complex or archaic characters and are arranged by stroke count and radical. They occupy the range 0x989F to 0xE0FC.   
NEC Special Characters (Row 13)
A critical area for PC-98 translators is Row 13 of the JIS X 0208 set, which NEC utilized for proprietary symbols not found in the official standard. These symbols often appear in game menus, HUDs, or as shorthand for common terms.   
Symbol Type
Examples
Description
Circled Numbers
① - ⑳
Used for lists or step-by-step instructions
Roman Numerals
Ⅰ - Ⅻ
Often found in sequel titles or volume markers
Unit Symbols
㍉, ㌔, ㎝, ㎡
Abbreviations for metric units
Era Symbols
㍾, ㍽, ㍼, ㍻
Meiji, Taisho, Showa, and Heisei era markers
Professional Symbols
№, ℡, ㏍, ㈱
Shorthand for "Number," "Telephone," etc.
Mathematical Symbols
≒, ≡, ∫, ∑, √
Standard math operators
  
Row 13 characters are mapped into the Shift-JIS lead byte 0x81 followed by trail bytes that start after the standard punctuation. These are frequently included in the "Windows-31J" (CP932) extension used by modern Windows systems to maintain compatibility with legacy NEC data.   
Identifying and Differentiating Control Codes
One of the most complex tasks in PC-98 translation is de-interlacing text from game commands. Because Shift-JIS is a stateless encoding, a byte value like 0x5C could represent the yen symbol (text), a backslash (part of an escape sequence), or the trailing byte of a kanji character (part of a different character entirely).   
Standard ASCII Control Codes (0x00 - 0x1F)
PC-98 software heavily utilizes the 0x00–0x1F range for internal control signals. These are standard C0 control codes, but their interpretation varies by game engine.   
Hex Code
Name
Common PC-98 Game Usage
0x00
NUL
String terminator; signals the end of a dialogue box
0x07
BEL
Sometimes used to trigger a "blip" sound effect during text printing
0x08
BS
Backspace; used in name-entry screens
0x0A
LF
Line Feed; moves text to the next line
0x0D
CR
Carriage Return; often paired with LF for new lines
0x1B
ESC
The prefix for "Escape Sequences" used for complex formatting
  
The Escape (ESC) Sequence Heuristic
In many PC-98 titles, complex text effects (color changes, text speed adjustments, or cursor positioning) are handled via ANSI-like escape sequences starting with 0x1B. These sequences are not text and must be preserved or adjusted carefully during translation.   
Sequence Pattern
Description
Behavior
`ESC

```
ESC [ <y>;<x> H
```

Cursor Position
Moves the cursor to a specific row and column
ESC [ <n> J
Erase Functions
Clears parts or all of the screen display
ESC [? 25 l
Cursor Visibility
Hides the text cursor during cutscenes
  
Differentiating Codes from Shift-JIS Text
The overlap between Shift-JIS trail bytes (0x40–0xFC) and ASCII characters (0x40–0x7E) creates a significant risk of "false positives" when searching for control codes. For example, the hex value 0x41 could be the letter 'A' or the trailing byte of the kanji character "ai" (亜, 0x8841).   
Linear Parsing Requirement: Character boundaries in SJIS can only be detected reliably by reading the stream linearly from a known starting point. If a parser starts at an arbitrary offset, it may misinterpret the second byte of a kanji as a single-byte ASCII command.   
State Machine Logic: A robust parser must maintain a "lead byte" state. If the current byte is in the range 0x81–0x9F or 0xE0–0xEF, the next byte is always interpreted as a trail byte, regardless of whether it falls in the control code range.   
Heuristic Markers: Some developers used specific patterns to signal the end of a command block and the start of a text block. In Touhou 05, ZUN transitioned to a binary format (.TX2) where a 0x0D byte signaled the start of a string.   
Script De-interlacing: Methods for English Translation
Once the encoding is understood, the localization team must extract the Japanese text, translate it, and re-insert it into the game files. This process is complicated by the fact that English text typically requires more characters than the equivalent Japanese text, yet legacy game engines often have strict byte-count limits or fixed-width text pointers.   
Pointer Identification and Repointing
PC-98 games often store text as a collection of pointers in a separate table or hardcoded within the assembly. Identifying these pointers is the first step to expanding dialogue boxes for English.   
Trial and Error: By replacing bytes in a suspected pointer table and observing which lines of text change or break, localizers can map the script's structure.   
Debugger Analysis: Using np2debug, a translator can set a "memory access" breakpoint on a known string of text. When the game accesses that string, the debugger will point to the specific instruction or pointer that referenced it.   
Handling Game-Specific Control Codes
Many developers used "shorthand" codes to save space. In Appareden, the letters 'n', 'c', and 'w' were used as control codes for newlines and other functions. This presents a major obstacle for English translation, as these common English letters would trigger game commands instead of displaying as text.   
Problem
Localization Solution
Common letters used as codes
Assembly hacking to reassign codes to unused characters (e.g., 0x01 - 0x06)
Fixed-length pointers
Repointing text to a new "empty" area in the binary (cave/padding)
Single-byte vs. Double-byte width
Using half-width ANK characters to fit more English letters into the space of a single kanji
  
Managing Gaiji (Custom Characters)
Many PC-98 games utilize "Gaiji," or user-defined characters, to display icons, specialized symbols, or custom fonts. These are typically loaded into the character RAM (located at 0xA4000) at runtime. Localizers can exploit this by replacing unused kanji or special symbols with English characters or custom font glyphs, allowing for more stylized English text without altering the game's core rendering engine.   
Technical Specifications: The FONTX2 Format
For translators who wish to modify the character set itself, the FONTX2 format is a common standard for PC-98 font files. Understanding its header is critical for creating custom English fonts that the game engine can recognize as valid Shift-JIS characters.   
Offset
Size
Description
0
6
"FONTX2" in ASCII
6
8
Font Name in ASCII
14
1
Glyph Width in pixels
15
1
Glyph Height in pixels
16
1
Code Flag (1 for Shift-JIS)
17
1
Number of Code Blocks
18
4 x nb
Start and End coordinates for each character block
14 + (4xnb)
-
Start of actual glyph bitmap data
  
Conclusion: Synthesis and Localization Strategies
The translation of NEC PC-9801 software is a complex undertaking that requires a multidisciplinary approach combining computational linguistics with legacy hardware reverse engineering. The transition from the dense, symbolic density of kanji to the linear, expansive nature of English necessitates not only a deep understanding of the Shift-JIS encoding but also a creative mastery of the PC-98’s video sub-system.   
Successful localization projects prioritize the integrity of the game's original logic while providing the flexibility required for natural English prose. This involves a rigorous workflow:
Linear Extraction: Use state-machine logic to extract strings while preserving the context of lead/trail byte boundaries.   
Command Isolation: Identify game-specific codes (like ZUN's.TX2 format or Appareden's shorthand) and decide whether to preserve them or reassign them through assembly hacking.   
VRAM Optimization: Make strategic use of the PC-98's text and graphics layers. If a dialogue box is too small for English, consider rendering the text directly to the graphics planes (0xA8000) using the EGC to handle the increased data throughput.   
Hardware-Respectful Patching: Use file-based patching (e.g., Pachy98) to ensure that the game remains playable on both original hardware and modern emulators, accounting for the unique way the PC-98 manages disk sectors and file systems.   
By strictly adhering to these codification standards and methodologies, translation teams can preserve the historical legacy of the PC-98 while bringing its vast library of Japanese titles to a global English-speaking audience. The meticulous de-interlacing of text and code is the final bridge between the proprietary architecture of 1980s Japan and the universal standards of modern computing.

I've created a comprehensive, VS Code-focused refinement of your PC-98 translation guide with significant enhancements:[^1][^2][^3][^4][^5]

## Key Improvements

**VS Code Integration**

- Microsoft's official Hex Editor extension configuration[^4]
- Encoding management for Shift-JIS (CP932) files[^6][^7]
- Automated workflow using tasks.json for extraction, translation, and insertion pipelines[^5][^8]
- Multi-cursor editing techniques for control code management

**Technical Corrections**

- Verified PC-98 memory map with correct VRAM addresses (0xA0000 text, 0xA4000 CG window)[^9][^10]
- Updated Shift-JIS byte range specifications with trail byte overlap details[^2][^11]
- Corrected FONTX2 header structure with proper field sizes[^1]

**Production-Ready Python Scripts**

- Complete Shift-JIS state machine parser with linear boundary tracking
- Automated CSV extraction with control code preservation
- Binary patcher with pointer table detection heuristics
- FONTX2 parser and character sheet exporter

**Workflow Automation**

- Task chaining for full translation pipeline (Ctrl+Shift+B)[^12][^5]
- Pre-launch debugging configurations
- Integrated terminal setup for Japanese text display
- File watcher patterns for auto-deployment to emulators

**Practical Examples**

- DOSBox-X PC-98 configuration with FREECG98.BMP font[^1]
- Regex patterns for VS Code search (double-byte detection, hiragana/katakana ranges)[^13]
- IPS patch generation for distribution
- Machine translation integration using Google Translate API[^14][^15]

The report provides complete, copy-paste-ready code for your retro translation workflow, optimized for your existing VS Code setup and Python expertise. All scripts handle the encoding edge cases you'll encounter in PC-98 game files.
<span style="display:none">[^16][^17][^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30][^31][^32][^33][^34][^35][^36][^37][^38][^39][^40][^41][^42][^43][^44][^45][^46][^47][^48][^49][^50][^51][^52][^53][^54][^55][^56][^57][^58][^59][^60][^61][^62][^63][^64][^65][^66][^67][^68][^69][^70][^71][^72][^73][^74][^75][^76][^77][^78][^79][^80][^81][^82][^83]</span>

<div align="center">⁂</div>

[^1]: https://dosbox-x.com/wiki/Guide:PC‐98-emulation-in-DOSBox‐X

[^2]: https://datacrystal.tcrf.net/wiki/PC-9801

[^3]: https://en.wikipedia.org/wiki/PC-98

[^4]: https://radioc.web.fc2.com/column/pc98bas/pc98memmap_en.htm

[^5]: https://people.freebsd.org/~kato/pc98-arch.html

[^6]: https://en.wikipedia.org/wiki/Shift_JIS

[^7]: https://www.sljfaq.org/afaq/encodings.html

[^8]: https://harjit.moe/jischarsets.html

[^9]: https://www.reddit.com/r/pc98/comments/agc0ek/unicode_proposal_for_encoding_unmapped/

[^10]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.hexeditor

[^11]: https://mojoauth.com/character-encoding-decoding/shift-jis-encoding--c

[^12]: https://learn.microsoft.com/en-us/answers/questions/190982/how-to-display-and-edit-japanese-in-vc-source-file

[^13]: https://dev.to/doozieakshay/vscode-tip-4-integrated-task-automation-with-tasksjson-3lnh

[^14]: https://code.visualstudio.com/docs/debugtest/tasks

[^15]: https://www.youtube.com/watch?v=O2c9FXO65RI

[^16]: https://nomenclator.la.coocan.jp/perl/mod/sjreg.htm

[^17]: https://www.perlmonks.org/?node_id=70565

[^18]: https://github.com/lvgl/lv_font_conv

[^19]: https://lvgl.io/tools/fontconverter

[^20]: https://github.com/joncampbell123/dosbox-x/issues/4821

[^21]: https://docs.libretro.com/library/neko_project_ii_kai/

[^22]: https://www.reddit.com/r/Roms/comments/fh6wuy/pyugt_a_python_tool_for_automatic_machine/

[^23]: https://thepythoncode.com/article/translate-text-in-python

[^24]: http://www.emerald.com/lht/article/19/1/32-34/267393

[^25]: https://iopscience.iop.org/article/10.1088/0952-4746/19/3/702

[^26]: http://peer.asee.org/7829

[^27]: https://www.semanticscholar.org/paper/4ba4bfa504d3ae3e7cc1542dc5bf97376a0f9bc0

[^28]: http://arxiv.org/pdf/2501.13272.pdf

[^29]: https://arxiv.org/pdf/2303.14017.pdf

[^30]: https://int10h.org/oldschool-pc-fonts/readme/

[^31]: https://www.vogons.org/viewtopic.php?t=81494

[^32]: https://ssojet.com/compare-character-encoding/shift-jis-vs-euc-jis-2004/

[^33]: https://www.herongyang.com/Unicode/JIS-Shift-JIS-Encoding.html

[^34]: https://www.jstage.jst.go.jp/article/ieejeiss1987/120/1/120_1_14/_article/-char/ja/

[^35]: http://link.springer.com/10.1007/978-3-319-97571-9_16

[^36]: http://virologyj.biomedcentral.com/articles/10.1186/1743-422X-6-14

[^37]: http://ieeexplore.ieee.org/document/5947888/

[^38]: https://ieeexplore.ieee.org/document/8959010/

[^39]: https://www.semanticscholar.org/paper/3d7c5cd73411846516ec1f0dea37dab96d444348

[^40]: https://www.semanticscholar.org/paper/8557164be6ce75e2a86c6636bc40cad25bfed6ff

[^41]: https://arxiv.org/pdf/1708.02657.pdf

[^42]: https://arxiv.org/pdf/2208.13170.pdf

[^43]: http://arxiv.org/pdf/1711.00354.pdf

[^44]: https://dl.acm.org/doi/pdf/10.1145/3623504.3623569

[^45]: https://arxiv.org/pdf/2301.08193.pdf

[^46]: https://dl.acm.org/doi/pdf/10.1145/3656429

[^47]: https://arxiv.org/pdf/2503.09673.pdf

[^48]: https://aclanthology.org/2021.calcs-1.11.pdf

[^49]: https://www.youtube.com/watch?v=43WvQYZJWMA

[^50]: https://www.youtube.com/watch?v=EpcK8uk7lcY

[^51]: https://mojoauth.com/character-encoding-decoding/shift-jis-encoding--java

[^52]: https://ssojet.com/compare-character-encoding/shift-jis-vs-utf-8

[^53]: https://arcade.makecode.com/vscode

[^54]: https://stackoverflow.com/questions/33254089/double-byte-character-sequence-conversion-issue-in-visual-studio-2015

[^55]: https://stackoverflow.com/questions/210547/displaying-japanese-fonts-in-source-code-using-visual-studio

[^56]: https://www.reddit.com/r/EmulationOnPC/comments/84j5lt/easy_project_for_ipstranslation_people_hex/

[^57]: https://www.youtube.com/watch?v=jYREZLloxGA

[^58]: https://ieeexplore.ieee.org/document/11005308/

[^59]: https://ieeexplore.ieee.org/document/11244472/

[^60]: https://ieeexplore.ieee.org/document/10863377/

[^61]: https://dl.acm.org/doi/10.1145/3670474.3685960

[^62]: https://www.mssanz.org.au/modsim2017/Keynote/cleary.pdf

[^63]: https://onlinelibrary.wiley.com/doi/10.1002/imm3.70005

[^64]: https://elifesciences.org/articles/90627

[^65]: https://arxiv.org/abs/2504.09754

[^66]: https://arxiv.org/abs/2410.22946

[^67]: https://arxiv.org/abs/2212.01191

[^68]: https://www.aclweb.org/anthology/2020.emnlp-main.728.pdf

[^69]: https://arxiv.org/pdf/2409.19894.pdf

[^70]: https://arxiv.org/html/2310.04951v1

[^71]: http://arxiv.org/pdf/2404.14646.pdf

[^72]: https://arxiv.org/pdf/2310.15539.pdf

[^73]: https://arxiv.org/pdf/2302.03908.pdf

[^74]: http://arxiv.org/pdf/2503.04921.pdf

[^75]: https://aclanthology.org/2021.emnlp-demo.20.pdf

[^76]: https://www.linkedin.com/posts/manikant-kolhapure-a04b002b7_python-translationtool-opensourceproject-activity-7353005922744459265-cv8a

[^77]: https://www.openpr.com/news/4390803/font-converters-com-launches-comprehensive-font-toolkit

[^78]: https://www.youtube.com/watch?v=NrFK5W-_U5I

[^79]: https://fonttools.readthedocs.io/en/latest/ttx.html

[^80]: https://github.com/pmrowla/pylivemaker/issues/58

[^81]: https://github.com/lrq3000/pyugt

[^82]: https://stackoverflow.com/questions/71924077/configuring-task-json-and-launch-json-for-c-in-vs-code

[^83]: https://www.npmjs.com/package/@princevish/font-converter-cli

