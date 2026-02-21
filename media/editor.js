/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./media-src/necCharsets.ts"
/*!**********************************!*\
  !*** ./media-src/necCharsets.ts ***!
  \**********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CHARSET_PROFILES: () => (/* binding */ CHARSET_PROFILES),
/* harmony export */   DEFAULT_CHARSET_ID: () => (/* binding */ DEFAULT_CHARSET_ID),
/* harmony export */   classifyByteForCharset: () => (/* binding */ classifyByteForCharset),
/* harmony export */   decodeBytesByCharset: () => (/* binding */ decodeBytesByCharset),
/* harmony export */   getCharsetLegend: () => (/* binding */ getCharsetLegend),
/* harmony export */   getCharsetProfile: () => (/* binding */ getCharsetProfile),
/* harmony export */   glyphForByteForCharset: () => (/* binding */ glyphForByteForCharset),
/* harmony export */   normalizeCharsetId: () => (/* binding */ normalizeCharsetId)
/* harmony export */ });
const DEFAULT_CHARSET_ID = 'pc98-cp932';
const CHARSET_PROFILES = [
    {
        id: 'pc98-cp932',
        label: 'PC-98 CP932 (Windows-31J)',
        description: 'Primary NEC PC-98 game/disk text encoding (Shift-JIS with NEC/IBM extensions).',
        legend: 'PC-98 CP932 byte roles: lead 0x81-0x9F/0xE0-0xFC, half-width kana 0xA1-0xDF, trail 0x40-0x7E/0x80-0xFC.'
    },
    {
        id: 'pc98-shift-jis',
        label: 'PC-98 Shift-JIS (strict)',
        description: 'Shift-JIS decode path without explicit CP932 preference hints.',
        legend: 'Shift-JIS byte roles: lead 0x81-0x9F/0xE0-0xFC, half-width kana 0xA1-0xDF, trail 0x40-0x7E/0x80-0xFC.'
    },
    {
        id: 'pc88-shift-jis',
        label: 'PC-88 Shift-JIS (N88)',
        description: 'Common late-era PC-88 text encoding for N88-BASIC and DOS tools.',
        legend: 'PC-88 Shift-JIS roles match standard Shift-JIS; high leads can include NEC/IBM extension regions.'
    },
    {
        id: 'pc88-jis7',
        label: 'PC-88 JIS 7-bit (ESC)',
        description: 'ISO-2022-JP/JIS escape-sequence text seen in some PC-88 materials.',
        legend: 'JIS 7-bit roles: ESC (0x1B) switches sets, SO/SI (0x0E/0x0F) shift kana, 0x21-0x7E payload bytes.'
    },
    {
        id: 'pc88-ank',
        label: 'PC-88 ANK + Kana + Graphics',
        description: 'Single-byte PC-88 text/label bytes: ANK ASCII, half-width kana, and graphics/gaiji candidates.',
        legend: 'PC-88 ANK roles: ANK 0x20-0x7E, kana 0xA1-0xDF, graphics/gaiji candidates 0x80-0x9F and 0xE0-0xFF.'
    },
    {
        id: 'jis-x-0201-roman',
        label: 'JIS X 0201 Roman',
        description: 'Roman set with yen at 0x5C and overline at 0x7E.',
        legend: 'JIS X 0201 Roman roles: printable 0x20-0x7E with 0x5C=>\u00A5 and 0x7E=>\u203E, controls below 0x20.'
    },
    {
        id: 'jis-x-0201-kana',
        label: 'JIS X 0201 Kana',
        description: 'Single-byte half-width katakana extension over Roman bytes.',
        legend: 'JIS X 0201 Kana roles: Roman bytes 0x20-0x7E and half-width kana 0xA1-0xDF.'
    },
    {
        id: 'euc-jp',
        label: 'EUC-JP',
        description: 'UNIX-oriented Japanese multibyte encoding.',
        legend: 'EUC-JP roles: ASCII 0x00-0x7F, kana lead 0x8E, plane-2 lead 0x8F, multibyte bytes 0xA1-0xFE.'
    },
    {
        id: 'iso-2022-jp',
        label: 'ISO-2022-JP',
        description: 'Email/transport-safe Japanese encoding with escape sequences.',
        legend: 'ISO-2022-JP roles: ESC (0x1B) and shift bytes manage state; payload uses 7-bit JIS bytes.'
    },
    {
        id: 'utf-8',
        label: 'UTF-8',
        description: 'Unicode UTF-8 for modern tooling artifacts.',
        legend: 'UTF-8 roles: lead bytes 0xC2-0xF4, continuation bytes 0x80-0xBF, ASCII at 0x00-0x7F.'
    },
    {
        id: 'utf-16le',
        label: 'UTF-16 LE',
        description: 'Unicode UTF-16 little-endian.',
        legend: 'UTF-16 roles are code-unit based; frame view shows byte-level hints only.'
    },
    {
        id: 'utf-16be',
        label: 'UTF-16 BE',
        description: 'Unicode UTF-16 big-endian.',
        legend: 'UTF-16 roles are code-unit based; frame view shows byte-level hints only.'
    },
    {
        id: 'ascii',
        label: 'ASCII',
        description: '7-bit ASCII display.',
        legend: 'ASCII roles: printable bytes 0x20-0x7E, control bytes below 0x20 and 0x7F.'
    },
    {
        id: 'latin1',
        label: 'Latin-1',
        description: 'Single-byte ISO-8859-1 pass-through.',
        legend: 'Latin-1 roles: single-byte codepoints with C0/C1 control regions.'
    }
];
const PROFILE_BY_ID = new Map(CHARSET_PROFILES.map((profile) => [profile.id, profile]));
const LEGACY_ALIASES = new Map([
    ['cp932', 'pc98-cp932'],
    ['shift-jis', 'pc98-cp932'],
    ['shift_jis', 'pc98-cp932'],
    ['windows-31j', 'pc98-cp932'],
    ['ms932', 'pc98-cp932'],
    ['sjis', 'pc98-cp932'],
    ['pc98', 'pc98-cp932'],
    ['pc-98', 'pc98-cp932'],
    ['pc88', 'pc88-ank'],
    ['pc-88', 'pc88-ank'],
    ['jis0201-roman', 'jis-x-0201-roman'],
    ['jis0201-kana', 'jis-x-0201-kana'],
    ['jis-x-0201', 'jis-x-0201-kana'],
    ['iso2022jp', 'iso-2022-jp'],
    ['eucjp', 'euc-jp'],
    ['utf8', 'utf-8'],
    ['utf16le', 'utf-16le'],
    ['utf16be', 'utf-16be']
]);
function normalizeCharsetId(value) {
    var _a;
    const raw = String(value !== null && value !== void 0 ? value : '')
        .trim()
        .toLowerCase();
    if (PROFILE_BY_ID.has(raw)) {
        return raw;
    }
    return (_a = LEGACY_ALIASES.get(raw)) !== null && _a !== void 0 ? _a : DEFAULT_CHARSET_ID;
}
function getCharsetProfile(value) {
    var _a;
    return (_a = PROFILE_BY_ID.get(normalizeCharsetId(value))) !== null && _a !== void 0 ? _a : PROFILE_BY_ID.get(DEFAULT_CHARSET_ID);
}
function getCharsetLegend(value) {
    return getCharsetProfile(value).legend;
}
function decodeBytesByCharset(bytes, value) {
    const charset = normalizeCharsetId(value);
    switch (charset) {
        case 'pc98-cp932':
            return decodeWithTextDecoder(bytes, 'shift-jis');
        case 'pc98-shift-jis':
        case 'pc88-shift-jis':
            return decodeWithTextDecoder(bytes, 'shift-jis');
        case 'pc88-jis7':
            return decodeWithTextDecoder(bytes, 'iso-2022-jp');
        case 'pc88-ank':
            return decodePc88Ank(bytes);
        case 'jis-x-0201-roman':
            return decodeJisX0201Roman(bytes);
        case 'jis-x-0201-kana':
            return decodeJisX0201Kana(bytes);
        case 'euc-jp':
            return decodeWithTextDecoder(bytes, 'euc-jp');
        case 'iso-2022-jp':
            return decodeWithTextDecoder(bytes, 'iso-2022-jp');
        case 'utf-8':
        case 'utf-16le':
        case 'utf-16be':
            return decodeWithTextDecoder(bytes, charset);
        case 'latin1':
            return decodeLatin1(bytes);
        case 'ascii':
        default:
            return decodeAscii(bytes);
    }
}
function glyphForByteForCharset(byte, value) {
    const charset = normalizeCharsetId(value);
    switch (charset) {
        case 'pc98-cp932':
        case 'pc98-shift-jis':
        case 'pc88-shift-jis':
            return glyphForShiftJisSingleByte(byte);
        case 'pc88-ank':
            return glyphForPc88Ank(byte);
        case 'jis-x-0201-roman':
            return glyphForJisX0201Roman(byte);
        case 'jis-x-0201-kana':
            return glyphForJisX0201Kana(byte);
        case 'latin1':
            return glyphForLatin1(byte);
        case 'ascii':
            return glyphForAscii(byte);
        default:
            return glyphForAscii(byte);
    }
}
function classifyByteForCharset(byte, value) {
    const charset = normalizeCharsetId(value);
    switch (charset) {
        case 'pc98-cp932':
            return classifyCp932Byte(byte);
        case 'pc98-shift-jis':
        case 'pc88-shift-jis':
            return classifyShiftJisByte(byte);
        case 'pc88-jis7':
        case 'iso-2022-jp':
            return classifyIso2022Byte(byte);
        case 'pc88-ank':
            return classifyPc88AnkByte(byte);
        case 'jis-x-0201-roman':
            return classifyJisX0201RomanByte(byte);
        case 'jis-x-0201-kana':
            return classifyJisX0201KanaByte(byte);
        case 'euc-jp':
            return classifyEucJpByte(byte);
        case 'utf-8':
            return classifyUtf8Byte(byte);
        case 'utf-16le':
        case 'utf-16be':
            return classifyUtf16Byte(byte);
        case 'latin1':
            return classifyLatin1Byte(byte);
        case 'ascii':
        default:
            return classifyAsciiByte(byte);
    }
}
function decodeWithTextDecoder(bytes, label) {
    try {
        return new TextDecoder(label, { fatal: false }).decode(bytes);
    }
    catch (_a) {
        return decodeAscii(bytes);
    }
}
function decodeAscii(bytes) {
    const out = [];
    for (const byte of bytes) {
        out.push(glyphForAscii(byte));
    }
    return out.join('');
}
function decodeLatin1(bytes) {
    const out = [];
    for (const byte of bytes) {
        if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
            out.push(String.fromCharCode(byte));
            continue;
        }
        out.push(String.fromCharCode(byte));
    }
    return out.join('');
}
function decodeJisX0201Roman(bytes) {
    const out = [];
    for (const byte of bytes) {
        out.push(glyphForJisX0201Roman(byte));
    }
    return out.join('');
}
function decodeJisX0201Kana(bytes) {
    const out = [];
    for (const byte of bytes) {
        out.push(glyphForJisX0201Kana(byte));
    }
    return out.join('');
}
function decodePc88Ank(bytes) {
    const out = [];
    for (const byte of bytes) {
        out.push(glyphForPc88Ank(byte));
    }
    return out.join('');
}
function glyphForAscii(byte) {
    if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
        return String.fromCharCode(byte);
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return String.fromCharCode(byte);
    }
    if (byte < 0x20 || byte === 0x7f) {
        return '.';
    }
    return '.';
}
function glyphForLatin1(byte) {
    if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
        return String.fromCharCode(byte);
    }
    if (byte >= 0x20) {
        return String.fromCharCode(byte);
    }
    return '.';
}
function glyphForJisX0201Roman(byte) {
    if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
        return String.fromCharCode(byte);
    }
    if (byte === 0x5c) {
        return '\u00A5';
    }
    if (byte === 0x7e) {
        return '\u203E';
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return String.fromCharCode(byte);
    }
    if (byte < 0x20 || byte === 0x7f) {
        return '.';
    }
    return '.';
}
function glyphForJisX0201Kana(byte) {
    if (byte >= 0xa1 && byte <= 0xdf) {
        return String.fromCharCode(0xff61 + (byte - 0xa1));
    }
    return glyphForJisX0201Roman(byte);
}
function glyphForShiftJisSingleByte(byte) {
    if (byte >= 0x20 && byte <= 0x7e) {
        return String.fromCharCode(byte);
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
        return String.fromCharCode(0xff61 + (byte - 0xa1));
    }
    if (byte < 0x20 || byte === 0x7f) {
        return '(ctrl)';
    }
    return '.';
}
function glyphForPc88Ank(byte) {
    if (byte >= 0x20 && byte <= 0x7e) {
        return glyphForJisX0201Roman(byte);
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
        return String.fromCharCode(0xff61 + (byte - 0xa1));
    }
    if ((byte >= 0x80 && byte <= 0x9f) || byte >= 0xe0) {
        return '\u3013';
    }
    if (byte < 0x20 || byte === 0x7f) {
        return '(ctrl)';
    }
    return '.';
}
function classifyAsciiByte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte <= 0x7e) {
        return 'ASCII printable';
    }
    return 'outside ASCII';
}
function classifyLatin1Byte(byte) {
    if (byte <= 0x1f || byte === 0x7f || (byte >= 0x80 && byte <= 0x9f)) {
        return 'control';
    }
    return 'Latin-1 printable';
}
function classifyUtf8Byte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte <= 0x7e) {
        return 'ASCII';
    }
    if (byte >= 0x80 && byte <= 0xbf) {
        return 'UTF-8 continuation';
    }
    if (byte >= 0xc2 && byte <= 0xdf) {
        return 'UTF-8 lead (2-byte)';
    }
    if (byte >= 0xe0 && byte <= 0xef) {
        return 'UTF-8 lead (3-byte)';
    }
    if (byte >= 0xf0 && byte <= 0xf4) {
        return 'UTF-8 lead (4-byte)';
    }
    return 'invalid UTF-8 byte';
}
function classifyUtf16Byte(byte) {
    if (byte === 0x00) {
        return 'UTF-16 null/high-byte candidate';
    }
    if (byte < 0x20 || byte === 0x7f) {
        return 'control/code-unit byte';
    }
    return 'UTF-16 code-unit byte';
}
function classifyJisX0201RomanByte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        if (byte === 0x5c) {
            return 'yen sign (\u00A5)';
        }
        if (byte === 0x7e) {
            return 'overline (\u203E)';
        }
        return 'Roman printable';
    }
    return 'outside JIS X 0201 Roman';
}
function classifyJisX0201KanaByte(byte) {
    if (byte >= 0xa1 && byte <= 0xdf) {
        return 'half-width katakana';
    }
    return classifyJisX0201RomanByte(byte);
}
function classifyCp932Byte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return 'ASCII / trail candidate';
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
        return 'half-width kana';
    }
    if ((byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xec)) {
        return 'Shift-JIS lead byte';
    }
    if (byte >= 0xed && byte <= 0xee) {
        return 'NEC extension lead byte';
    }
    if (byte >= 0xfa && byte <= 0xfc) {
        return 'IBM/NEC extension lead byte';
    }
    if ((byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc)) {
        return 'Shift-JIS trail candidate';
    }
    return 'unclassified';
}
function classifyShiftJisByte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return 'ASCII / trail candidate';
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
        return 'half-width kana';
    }
    if ((byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc)) {
        return 'Shift-JIS lead byte';
    }
    if ((byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc)) {
        return 'Shift-JIS trail candidate';
    }
    return 'unclassified';
}
function classifyPc88AnkByte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte >= 0x20 && byte <= 0x7e) {
        return 'ANK printable';
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
        return 'half-width kana';
    }
    if ((byte >= 0x80 && byte <= 0x9f) || byte >= 0xe0) {
        return 'PC-88 graphics/gaiji candidate';
    }
    return 'unclassified';
}
function classifyEucJpByte(byte) {
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte <= 0x7e) {
        return 'ASCII';
    }
    if (byte === 0x8e) {
        return 'kana lead (SS2)';
    }
    if (byte === 0x8f) {
        return 'plane-2 lead (SS3)';
    }
    if (byte >= 0xa1 && byte <= 0xfe) {
        return 'EUC-JP multibyte byte';
    }
    return 'invalid EUC-JP byte';
}
function classifyIso2022Byte(byte) {
    if (byte === 0x1b) {
        return 'escape sequence marker';
    }
    if (byte === 0x0e) {
        return 'SO shift-out (kana)';
    }
    if (byte === 0x0f) {
        return 'SI shift-in (Roman)';
    }
    if (byte < 0x20 || byte === 0x7f) {
        return 'control';
    }
    if (byte >= 0x21 && byte <= 0x7e) {
        return 'JIS payload (7-bit)';
    }
    return 'outside 7-bit transport range';
}


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*****************************!*\
  !*** ./media-src/editor.ts ***!
  \*****************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _necCharsets__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./necCharsets */ "./media-src/necCharsets.ts");
// @ts-nocheck

const vscode = acquireVsCodeApi();
const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 20;
const OVERSCAN_ROWS = 24;
const CHUNK_BYTES = 65536;
const MAX_CHUNKS_PER_MODE = 128;
const MAX_TRANSLATION_BYTES = 8192;
const MAX_CHAR_FRAME_BYTES = 192;
const persisted = vscode.getState() || {};
const elements = {
    status: document.getElementById('status'),
    fileName: document.getElementById('fileName'),
    format: document.getElementById('format'),
    parserId: document.getElementById('parserId'),
    dataOffsetBytes: document.getElementById('dataOffsetBytes'),
    sizeBytes: document.getElementById('sizeBytes'),
    sectorSize: document.getElementById('sectorSize'),
    totalSectors: document.getElementById('totalSectors'),
    geometry: document.getElementById('geometry'),
    partitionRows: document.getElementById('partitionRows'),
    jumpResult: document.getElementById('jumpResult'),
    hexModeSelect: document.getElementById('hexModeSelect'),
    hexRangeMeta: document.getElementById('hexRangeMeta'),
    hexScroller: document.getElementById('hexScroller'),
    hexSpacer: document.getElementById('hexSpacer'),
    hexRows: document.getElementById('hexRows'),
    shiftJisPreview: document.getElementById('shiftJisPreview'),
    notes: document.getElementById('notes'),
    refreshButton: document.getElementById('refreshButton'),
    jumpOffsetButton: document.getElementById('jumpOffsetButton'),
    jumpLbaButton: document.getElementById('jumpLbaButton'),
    copyOffsetButton: document.getElementById('copyOffsetButton'),
    copyLbaButton: document.getElementById('copyLbaButton'),
    extractSelectionButton: document.getElementById('extractSelectionButton'),
    translationEncoding: document.getElementById('translationEncoding'),
    translationMeta: document.getElementById('translationMeta'),
    decodedSelection: document.getElementById('decodedSelection'),
    translationDraft: document.getElementById('translationDraft'),
    copyDecodedButton: document.getElementById('copyDecodedButton'),
    copyDraftButton: document.getElementById('copyDraftButton'),
    clearDraftButton: document.getElementById('clearDraftButton'),
    charsetLegend: document.getElementById('charsetLegend'),
    charFrameRows: document.getElementById('charFrameRows')
};
const hasPersistedTranslationEncoding = typeof persisted.translationEncoding === 'string' && persisted.translationEncoding.length > 0;
const state = {
    summary: undefined,
    defaultMode: persisted.defaultMode === 'raw' ? 'raw' : 'disk',
    mode: persisted.mode === 'raw' ? 'raw' : 'disk',
    fileSize: 0,
    dataOffset: 0,
    sectorSize: 512,
    geometry: undefined,
    translationEncoding: (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.normalizeCharsetId)(persisted.translationEncoding),
    translationDraft: typeof persisted.translationDraft === 'string' ? persisted.translationDraft : '',
    selectionStart: Number.isInteger(persisted.selectionStart) ? persisted.selectionStart : 0,
    selectionEnd: Number.isInteger(persisted.selectionEnd) ? persisted.selectionEnd : 0,
    cursorOffset: Number.isInteger(persisted.cursorOffset) ? persisted.cursorOffset : 0,
    anchorOffset: Number.isInteger(persisted.anchorOffset) ? persisted.anchorOffset : 0,
    caches: {
        disk: new Map(),
        raw: new Map()
    },
    requestSeq: 0,
    pendingById: new Map(),
    pendingKeys: new Set(),
    renderedRowStart: -1,
    renderedRowEnd: -1
};
if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', () => {
        post({ type: 'refresh' });
    });
}
if (elements.jumpOffsetButton) {
    elements.jumpOffsetButton.addEventListener('click', () => {
        void promptJumpOffset();
    });
}
if (elements.jumpLbaButton) {
    elements.jumpLbaButton.addEventListener('click', () => {
        void promptJumpLba();
    });
}
if (elements.copyOffsetButton) {
    elements.copyOffsetButton.addEventListener('click', () => {
        void copyOffsetToClipboard();
    });
}
if (elements.copyLbaButton) {
    elements.copyLbaButton.addEventListener('click', () => {
        void copyLbaToClipboard();
    });
}
if (elements.extractSelectionButton) {
    elements.extractSelectionButton.addEventListener('click', () => {
        void requestExtractSelection();
    });
}
if (elements.translationEncoding) {
    elements.translationEncoding.addEventListener('change', () => {
        const value = (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.normalizeCharsetId)(elements.translationEncoding.value);
        state.translationEncoding = value;
        persistState();
        refreshTranslationPanels();
    });
}
if (elements.translationDraft) {
    elements.translationDraft.addEventListener('input', () => {
        state.translationDraft = elements.translationDraft.value || '';
        persistState();
    });
}
if (elements.copyDecodedButton) {
    elements.copyDecodedButton.addEventListener('click', () => {
        void copyDecodedToClipboard();
    });
}
if (elements.copyDraftButton) {
    elements.copyDraftButton.addEventListener('click', () => {
        void copyDraftToClipboard();
    });
}
if (elements.clearDraftButton) {
    elements.clearDraftButton.addEventListener('click', () => {
        clearDraft();
    });
}
if (elements.hexModeSelect) {
    elements.hexModeSelect.addEventListener('change', () => {
        const requested = elements.hexModeSelect.value === 'raw' ? 'raw' : 'disk';
        const nextMode = chooseMode(requested);
        if (nextMode !== state.mode) {
            state.mode = nextMode;
        }
        const clampedStart = clampOffset(state.selectionStart, state.mode);
        const clampedEnd = clampOffset(state.selectionEnd, state.mode);
        state.selectionStart = Math.min(clampedStart, clampedEnd);
        state.selectionEnd = Math.max(clampedStart, clampedEnd);
        state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
        state.anchorOffset = state.selectionStart;
        persistState();
        post({
            type: 'hex.select',
            mode: state.mode,
            start: state.selectionStart,
            end: state.selectionEnd
        });
        renderHexViewport(true);
        scrollToOffset(state.cursorOffset, false);
    });
}
if (elements.hexScroller) {
    elements.hexScroller.addEventListener('scroll', () => {
        renderHexViewport(false);
    });
}
if (elements.hexRows) {
    elements.hexRows.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-byte-off]') : null;
        if (!target) {
            return;
        }
        const offset = Number.parseInt(target.getAttribute('data-byte-off') || '', 10);
        if (!Number.isFinite(offset)) {
            return;
        }
        if (event.shiftKey) {
            const start = Math.min(state.anchorOffset, offset);
            const end = Math.max(state.anchorOffset, offset);
            state.selectionStart = clampOffset(start, state.mode);
            state.selectionEnd = clampOffset(end, state.mode);
        }
        else {
            state.anchorOffset = offset;
            state.selectionStart = clampOffset(offset, state.mode);
            state.selectionEnd = clampOffset(offset, state.mode);
        }
        state.cursorOffset = clampOffset(offset, state.mode);
        persistState();
        post({
            type: 'hex.select',
            mode: state.mode,
            start: state.selectionStart,
            end: state.selectionEnd
        });
        renderHexViewport(false);
    });
}
if (elements.partitionRows) {
    elements.partitionRows.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-partition-lba]') : null;
        if (!target) {
            return;
        }
        const lba = Number.parseInt(target.getAttribute('data-partition-lba') || '', 10);
        if (!Number.isFinite(lba) || lba < 0) {
            return;
        }
        const offset = lba * (state.sectorSize || 512);
        post({
            type: 'hex.jump',
            mode: 'disk',
            offset
        });
        setText(elements.jumpResult, `Jump target: partition LBA ${formatNumber(lba)} (0x${offset.toString(16).toUpperCase()} offset)`);
    });
}
syncTranslatorInputs();
refreshTranslationPanels();
window.addEventListener('resize', () => {
    renderHexViewport(false);
});
window.addEventListener('keydown', (event) => {
    const isModifier = event.ctrlKey || event.metaKey;
    if (!isModifier || event.altKey) {
        return;
    }
    const key = event.key.toLowerCase();
    if (key === 'g') {
        event.preventDefault();
        void promptJumpOffset();
        return;
    }
    if (key === 'l') {
        event.preventDefault();
        void promptJumpLba();
    }
});
window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string') {
        return;
    }
    switch (message.type) {
        case 'diskSummary':
            renderSummary(message.summary);
            break;
        case 'hex.init':
            handleHexInit(message);
            break;
        case 'hex.data':
            handleHexData(message);
            break;
        case 'hex.jumpAck':
            handleHexJumpAck(message);
            break;
        case 'hex.selectAck':
            handleHexSelectAck(message);
            break;
        case 'error':
            renderError(message.message);
            break;
        default:
            break;
    }
});
function renderSummary(summary) {
    if (!summary) {
        return;
    }
    state.summary = summary;
    state.fileSize = Number(summary.sizeBytes) || 0;
    state.dataOffset = Number(summary.dataOffsetBytes) || 0;
    state.sectorSize = Number(summary.sectorSize) || 512;
    state.geometry = summary.geometry;
    setText(elements.status, 'Disk image loaded.');
    setText(elements.fileName, summary.fileName);
    setText(elements.format, summary.format);
    setText(elements.parserId, summary.parserId || '-');
    setText(elements.dataOffsetBytes, withUnits(summary.dataOffsetBytes, 'bytes'));
    setText(elements.sizeBytes, withUnits(summary.sizeBytes, 'bytes'));
    setText(elements.sectorSize, withUnits(summary.sectorSize, 'bytes'));
    setText(elements.totalSectors, formatNumber(summary.totalSectors));
    if (summary.geometry) {
        setText(elements.geometry, `${formatNumber(summary.geometry.cylinders)} cyl / ${summary.geometry.heads} heads / ${summary.geometry.sectorsPerTrack} spt`);
    }
    else {
        setText(elements.geometry, 'Unknown');
    }
    renderPartitions(summary.partitions || []);
    setText(elements.shiftJisPreview, summary.shiftJisPreview || '(no preview)');
    setText(elements.notes, summary.notes && summary.notes.length > 0
        ? summary.notes.map((note) => `- ${note}`).join('\n')
        : '- none');
    clearChunkCaches();
    state.pendingById.clear();
    state.pendingKeys.clear();
    state.mode = chooseMode(state.defaultMode);
    state.selectionStart = clampOffset(state.selectionStart, state.mode);
    state.selectionEnd = clampOffset(state.selectionEnd, state.mode);
    state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
    state.anchorOffset = state.selectionStart;
    syncModeSelect();
    persistState();
    renderHexViewport(true);
    refreshTranslationPanels();
}
function handleHexInit(message) {
    const nextDefault = message.defaultMode === 'raw' ? 'raw' : 'disk';
    state.defaultMode = nextDefault;
    state.mode = chooseMode(state.mode || nextDefault);
    if (!hasPersistedTranslationEncoding && typeof message.defaultCharset === 'string') {
        state.translationEncoding = (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.normalizeCharsetId)(message.defaultCharset);
    }
    if (Number.isFinite(message.fileSize)) {
        state.fileSize = Number(message.fileSize);
    }
    if (Number.isFinite(message.dataOffset)) {
        state.dataOffset = Number(message.dataOffset);
    }
    if (Number.isFinite(message.sectorSize) && Number(message.sectorSize) > 0) {
        state.sectorSize = Number(message.sectorSize);
    }
    state.selectionStart = clampOffset(state.selectionStart, state.mode);
    state.selectionEnd = clampOffset(state.selectionEnd, state.mode);
    state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
    state.anchorOffset = state.selectionStart;
    syncModeSelect();
    persistState();
    renderHexViewport(true);
    refreshTranslationPanels();
}
function handleHexData(message) {
    if (typeof message.requestId !== 'string') {
        return;
    }
    const pending = state.pendingById.get(message.requestId);
    if (pending) {
        state.pendingById.delete(message.requestId);
        state.pendingKeys.delete(pending.key);
    }
    const mode = message.mode === 'raw' ? 'raw' : 'disk';
    const offset = Number.isInteger(message.offset) ? message.offset : pending ? pending.offset : 0;
    const bytes = decodeBase64(message.bytesBase64);
    if (bytes.length === 0) {
        if (mode === state.mode) {
            renderHexViewport(false);
            refreshTranslationPanels();
        }
        return;
    }
    const cache = getModeCache(mode);
    cache.delete(offset);
    cache.set(offset, bytes);
    trimChunkCache(cache);
    if (mode === state.mode) {
        renderHexViewport(false);
        refreshTranslationPanels();
    }
}
function handleHexJumpAck(message) {
    const mode = message.mode === 'raw' ? 'raw' : 'disk';
    state.mode = chooseMode(mode);
    syncModeSelect();
    const offset = clampOffset(Number(message.offset) || 0, state.mode);
    state.cursorOffset = offset;
    state.anchorOffset = offset;
    state.selectionStart = offset;
    state.selectionEnd = offset;
    setText(elements.jumpResult, `Jump target: ${state.mode} offset ${formatNumber(offset)} (0x${offset
        .toString(16)
        .toUpperCase()})`);
    persistState();
    renderHexViewport(true);
    scrollToOffset(offset, true);
    refreshTranslationPanels();
}
function handleHexSelectAck(message) {
    const mode = message.mode === 'raw' ? 'raw' : 'disk';
    state.mode = chooseMode(mode);
    syncModeSelect();
    const start = clampOffset(Number(message.start) || 0, state.mode);
    const end = clampOffset(Number(message.end) || 0, state.mode);
    state.selectionStart = Math.min(start, end);
    state.selectionEnd = Math.max(start, end);
    state.cursorOffset = state.selectionStart;
    state.anchorOffset = state.selectionStart;
    persistState();
    renderHexViewport(false);
    refreshTranslationPanels();
}
function renderError(message) {
    setText(elements.status, 'Unable to load disk image.');
    setText(elements.jumpResult, 'No active jump target.');
    renderPartitions([]);
    setText(elements.hexRangeMeta, 'No range selected.');
    if (elements.hexRows) {
        elements.hexRows.textContent = '';
    }
    if (elements.hexSpacer) {
        elements.hexSpacer.style.height = '0px';
    }
    setText(elements.notes, `- ${message || 'Unknown error'}`);
    refreshTranslationPanels();
}
function renderPartitions(partitions) {
    var _a;
    if (!elements.partitionRows) {
        return;
    }
    elements.partitionRows.innerHTML = '';
    if (!Array.isArray(partitions) || partitions.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'No partitions detected.';
        row.appendChild(cell);
        elements.partitionRows.appendChild(row);
        return;
    }
    for (const partition of partitions) {
        const row = document.createElement('tr');
        row.className = 'partitionRow';
        row.setAttribute('data-partition-lba', String((_a = partition.startLba) !== null && _a !== void 0 ? _a : 0));
        row.title = 'Click to jump to this partition start.';
        const bootMarker = partition.bootable ? '*' : '';
        const typeHex = Number(partition.typeCode || 0).toString(16).padStart(2, '0');
        appendCell(row, String(partition.index || '-'));
        appendCell(row, `${bootMarker}${partition.typeName || 'Unknown'} (0x${typeHex})`);
        appendCell(row, formatNumber(partition.startLba));
        appendCell(row, formatNumber(partition.totalSectors));
        appendCell(row, `${formatNumber(partition.startOffsetBytes)} bytes`);
        elements.partitionRows.appendChild(row);
    }
}
function renderHexViewport(force) {
    if (!elements.hexScroller || !elements.hexSpacer || !elements.hexRows) {
        return;
    }
    const viewLength = getViewLength(state.mode);
    if (viewLength <= 0) {
        elements.hexSpacer.style.height = '0px';
        elements.hexRows.textContent = '';
        setText(elements.hexRangeMeta, `No bytes in ${state.mode} view.`);
        state.renderedRowStart = -1;
        state.renderedRowEnd = -1;
        return;
    }
    const totalRows = Math.ceil(viewLength / BYTES_PER_ROW);
    elements.hexSpacer.style.height = `${Math.max(totalRows * ROW_HEIGHT, ROW_HEIGHT)}px`;
    const visible = getVisibleRows(totalRows);
    ensureBytesForRows(visible.r0, visible.r1);
    if (!force && visible.r0 === state.renderedRowStart && visible.r1 === state.renderedRowEnd) {
        updateRangeMeta();
        return;
    }
    elements.hexRows.textContent = '';
    const fragment = document.createDocumentFragment();
    for (let rowIndex = visible.r0; rowIndex <= visible.r1; rowIndex += 1) {
        fragment.appendChild(renderRow(rowIndex, viewLength));
    }
    elements.hexRows.appendChild(fragment);
    state.renderedRowStart = visible.r0;
    state.renderedRowEnd = visible.r1;
    updateRangeMeta();
}
function renderRow(rowIndex, viewLength) {
    const row = document.createElement('div');
    row.className = 'hexRow';
    row.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`;
    const rowOffset = rowIndex * BYTES_PER_ROW;
    const address = document.createElement('span');
    address.className = 'hexAddr';
    address.textContent = rowOffset.toString(16).padStart(8, '0');
    row.appendChild(address);
    const bytesColumn = document.createElement('span');
    bytesColumn.className = 'hexBytes';
    const asciiColumn = document.createElement('span');
    asciiColumn.className = 'hexAscii';
    for (let i = 0; i < BYTES_PER_ROW; i += 1) {
        const offset = rowOffset + i;
        if (offset >= viewLength) {
            appendPlaceholderByte(bytesColumn, asciiColumn);
            continue;
        }
        const byteValue = getByte(offset, state.mode);
        const isRange = offset >= state.selectionStart && offset <= state.selectionEnd;
        const isCursor = offset === state.cursorOffset;
        const byteCell = document.createElement('span');
        byteCell.className = 'hexByte';
        byteCell.setAttribute('data-byte-off', String(offset));
        if (byteValue === undefined) {
            byteCell.classList.add('is-missing');
            byteCell.textContent = '..';
        }
        else {
            byteCell.textContent = byteValue.toString(16).padStart(2, '0');
        }
        if (isRange) {
            byteCell.classList.add('is-range');
        }
        if (isCursor) {
            byteCell.classList.add('is-cursor');
        }
        bytesColumn.appendChild(byteCell);
        bytesColumn.appendChild(document.createTextNode(' '));
        const asciiCell = document.createElement('span');
        asciiCell.className = 'asciiByte';
        asciiCell.setAttribute('data-byte-off', String(offset));
        if (byteValue === undefined) {
            asciiCell.classList.add('is-missing');
            asciiCell.textContent = ' ';
        }
        else {
            asciiCell.textContent = byteValue >= 0x20 && byteValue <= 0x7e ? String.fromCharCode(byteValue) : '.';
        }
        if (isRange) {
            asciiCell.classList.add('is-range');
        }
        if (isCursor) {
            asciiCell.classList.add('is-cursor');
        }
        asciiColumn.appendChild(asciiCell);
    }
    row.appendChild(bytesColumn);
    row.appendChild(asciiColumn);
    return row;
}
function appendPlaceholderByte(bytesColumn, asciiColumn) {
    const byteCell = document.createElement('span');
    byteCell.className = 'hexByte is-placeholder';
    byteCell.textContent = '  ';
    bytesColumn.appendChild(byteCell);
    bytesColumn.appendChild(document.createTextNode(' '));
    const asciiCell = document.createElement('span');
    asciiCell.className = 'asciiByte is-placeholder';
    asciiCell.textContent = ' ';
    asciiColumn.appendChild(asciiCell);
}
function ensureBytesForRows(r0, r1) {
    const viewLength = getViewLength(state.mode);
    if (viewLength <= 0) {
        return;
    }
    const start = r0 * BYTES_PER_ROW;
    const endExclusive = Math.min(viewLength, (r1 + 1) * BYTES_PER_ROW);
    if (endExclusive <= start) {
        return;
    }
    const firstChunk = Math.floor(start / CHUNK_BYTES);
    const lastChunk = Math.floor((endExclusive - 1) / CHUNK_BYTES);
    for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
        const chunkStart = chunkIndex * CHUNK_BYTES;
        const chunkLength = Math.min(CHUNK_BYTES, viewLength - chunkStart);
        if (chunkLength <= 0) {
            continue;
        }
        requestChunk(state.mode, chunkStart, chunkLength);
    }
}
function requestChunk(mode, offset, length) {
    const cache = getModeCache(mode);
    if (cache.has(offset)) {
        return;
    }
    const key = `${mode}:${offset}:${length}`;
    if (state.pendingKeys.has(key)) {
        return;
    }
    const requestId = `hex-${++state.requestSeq}`;
    state.pendingById.set(requestId, { mode, offset, length, key });
    state.pendingKeys.add(key);
    post({
        type: 'hex.read',
        requestId,
        mode,
        offset,
        length
    });
}
function getByte(offset, mode) {
    const cache = getModeCache(mode);
    const chunkStart = Math.floor(offset / CHUNK_BYTES) * CHUNK_BYTES;
    const chunk = cache.get(chunkStart);
    if (!chunk) {
        return undefined;
    }
    const index = offset - chunkStart;
    if (index < 0 || index >= chunk.length) {
        return undefined;
    }
    return chunk[index];
}
function clearChunkCaches() {
    state.caches.disk.clear();
    state.caches.raw.clear();
}
function trimChunkCache(cache) {
    while (cache.size > MAX_CHUNKS_PER_MODE) {
        const first = cache.keys().next();
        if (first.done) {
            break;
        }
        cache.delete(first.value);
    }
}
function getModeCache(mode) {
    return mode === 'raw' ? state.caches.raw : state.caches.disk;
}
function getVisibleRows(totalRows) {
    const scroller = elements.hexScroller;
    if (!scroller) {
        return { r0: 0, r1: Math.max(0, totalRows - 1) };
    }
    const top = scroller.scrollTop;
    const height = scroller.clientHeight || 360;
    let r0 = Math.floor(top / ROW_HEIGHT) - OVERSCAN_ROWS;
    let r1 = Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN_ROWS;
    r0 = Math.max(0, r0);
    r1 = Math.max(r0, Math.min(totalRows - 1, r1));
    return { r0, r1 };
}
function scrollToOffset(offset, center) {
    const scroller = elements.hexScroller;
    if (!scroller) {
        return;
    }
    const row = Math.floor(offset / BYTES_PER_ROW);
    let targetTop = row * ROW_HEIGHT;
    if (center) {
        targetTop = Math.max(0, targetTop - Math.floor(scroller.clientHeight / 2));
    }
    scroller.scrollTop = targetTop;
}
function updateRangeMeta() {
    const mode = state.mode;
    const viewLength = getViewLength(mode);
    if (viewLength <= 0) {
        setText(elements.hexRangeMeta, `No bytes in ${mode} view.`);
        return;
    }
    const start = clampOffset(state.selectionStart, mode);
    const end = clampOffset(state.selectionEnd, mode);
    const cursor = clampOffset(state.cursorOffset, mode);
    const rangeLength = Math.abs(end - start) + 1;
    let meta = `${mode} range ${formatNumber(start)}-${formatNumber(end)} (${formatNumber(rangeLength)} bytes) | cursor ${formatNumber(cursor)}`;
    const diskOffset = toDiskOffset(mode, cursor);
    if (diskOffset !== undefined && diskOffset >= 0) {
        const lba = Math.floor(diskOffset / (state.sectorSize || 512));
        meta += ` | LBA ${formatNumber(lba)}`;
        const chs = toChs(lba);
        if (chs) {
            meta += ` | CHS ${chs.c}/${chs.h}/${chs.s}`;
        }
    }
    else {
        meta += ' | LBA n/a';
    }
    setText(elements.hexRangeMeta, meta);
}
function toDiskOffset(mode, offset) {
    if (mode === 'disk') {
        return offset;
    }
    const diskOffset = offset - state.dataOffset;
    return diskOffset >= 0 ? diskOffset : undefined;
}
function toChs(lba) {
    const geometry = state.geometry;
    if (!geometry) {
        return undefined;
    }
    const heads = Number(geometry.heads);
    const sectorsPerTrack = Number(geometry.sectorsPerTrack);
    if (!Number.isFinite(heads) || !Number.isFinite(sectorsPerTrack) || heads <= 0 || sectorsPerTrack <= 0) {
        return undefined;
    }
    const sectorsPerCylinder = heads * sectorsPerTrack;
    const c = Math.floor(lba / sectorsPerCylinder);
    const remainder = lba % sectorsPerCylinder;
    const h = Math.floor(remainder / sectorsPerTrack);
    const s = (remainder % sectorsPerTrack) + 1;
    return { c, h, s };
}
function getViewLength(mode) {
    if (mode === 'disk') {
        return Math.max(0, state.fileSize - state.dataOffset);
    }
    return Math.max(0, state.fileSize);
}
function chooseMode(mode) {
    if (mode === 'disk') {
        if (getViewLength('disk') <= 0 && getViewLength('raw') > 0) {
            return 'raw';
        }
        return 'disk';
    }
    return 'raw';
}
function clampOffset(offset, mode) {
    const viewLength = getViewLength(mode);
    if (viewLength <= 0) {
        return 0;
    }
    const numeric = Number.isFinite(offset) ? Math.floor(offset) : 0;
    if (numeric < 0) {
        return 0;
    }
    if (numeric >= viewLength) {
        return viewLength - 1;
    }
    return numeric;
}
function syncModeSelect() {
    if (elements.hexModeSelect) {
        elements.hexModeSelect.value = state.mode;
    }
}
async function promptJumpOffset() {
    const modeInput = window.prompt('Offset mode (disk/raw):', state.mode);
    if (modeInput === null) {
        return;
    }
    const mode = modeInput.trim().toLowerCase() === 'raw' ? 'raw' : 'disk';
    const offsetInput = window.prompt('Enter offset in decimal or hex (0x..., ...h):', mode === 'disk' ? '0x0' : '0');
    if (offsetInput === null) {
        return;
    }
    const offset = parseOffsetInput(offsetInput);
    if (offset === undefined || offset < 0) {
        setText(elements.status, 'Invalid offset input.');
        return;
    }
    post({
        type: 'hex.jump',
        mode,
        offset
    });
}
async function promptJumpLba() {
    const lbaInput = window.prompt('Enter LBA (decimal):', '0');
    if (lbaInput === null) {
        return;
    }
    const lba = parseDecimalInteger(lbaInput);
    if (lba === undefined || lba < 0) {
        setText(elements.status, 'Invalid LBA input.');
        return;
    }
    const offset = lba * (state.sectorSize || 512);
    post({
        type: 'hex.jump',
        mode: 'disk',
        offset
    });
}
async function copyOffsetToClipboard() {
    const start = clampOffset(state.selectionStart, state.mode);
    const text = `0x${start.toString(16).toUpperCase()}`;
    const copied = await copyText(text);
    if (!copied) {
        setText(elements.status, 'Unable to copy offset to clipboard.');
        return;
    }
    setText(elements.status, `Copied offset: ${text}`);
}
async function copyLbaToClipboard() {
    const cursor = clampOffset(state.cursorOffset, state.mode);
    const diskOffset = toDiskOffset(state.mode, cursor);
    if (diskOffset === undefined || diskOffset < 0) {
        setText(elements.status, 'LBA unavailable for current selection.');
        return;
    }
    const lba = Math.floor(diskOffset / (state.sectorSize || 512));
    const text = String(lba);
    const copied = await copyText(text);
    if (!copied) {
        setText(elements.status, 'Unable to copy LBA to clipboard.');
        return;
    }
    setText(elements.status, `Copied LBA: ${formatNumber(lba)}`);
}
async function requestExtractSelection() {
    const start = clampOffset(state.selectionStart, state.mode);
    const end = clampOffset(state.selectionEnd, state.mode);
    post({
        type: 'hex.extract',
        mode: state.mode,
        start,
        end
    });
}
function refreshTranslationPanels() {
    syncTranslatorInputs();
    syncCharsetLegend();
    const viewLength = getViewLength(state.mode);
    if (viewLength <= 0) {
        setText(elements.translationMeta, 'No bytes available in current view.');
        setText(elements.decodedSelection, '(no bytes available)');
        renderCharFramePlaceholder('No bytes available in current view.');
        return;
    }
    const start = clampOffset(state.selectionStart, state.mode);
    const end = clampOffset(state.selectionEnd, state.mode);
    const range = normalizeRange(start, end);
    const totalLength = range.end - range.start + 1;
    if (totalLength <= 0) {
        setText(elements.translationMeta, 'No byte selection.');
        setText(elements.decodedSelection, '(select bytes in hex view)');
        renderCharFramePlaceholder('Select bytes to inspect character framing.');
        return;
    }
    ensureBytesForOffsetRange(range.start, range.end);
    const selection = collectSelectionBytes(range.start, range.end, MAX_TRANSLATION_BYTES);
    if (!selection) {
        setText(elements.translationMeta, 'Selection is outside available bytes.');
        setText(elements.decodedSelection, '(selection out of range)');
        renderCharFramePlaceholder('Selection is outside available bytes.');
        return;
    }
    if (selection.missing) {
        setText(elements.translationMeta, `Loading bytes for ${formatNumber(totalLength)} selected byte(s)...`);
        setText(elements.decodedSelection, '(loading selected bytes from disk...)');
    }
    else {
        const profile = (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.getCharsetProfile)(state.translationEncoding);
        const decoded = decodeSelectionBytes(selection.bytes, state.translationEncoding);
        const detail = selection.total > selection.readLength
            ? `, showing first ${formatNumber(selection.readLength)}`
            : '';
        setText(elements.translationMeta, `Decode ${formatNumber(selection.total)} byte(s) as ${profile.label}${detail}.`);
        setText(elements.decodedSelection, decoded.length > 0 ? decoded : '(decoded text is empty)');
    }
    renderCharFrameRows(range.start, range.end);
}
function syncTranslatorInputs() {
    if (elements.translationEncoding) {
        const normalized = (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.normalizeCharsetId)(state.translationEncoding);
        if (elements.translationEncoding.value !== normalized) {
            elements.translationEncoding.value = normalized;
        }
    }
    if (elements.translationDraft && elements.translationDraft.value !== state.translationDraft) {
        elements.translationDraft.value = state.translationDraft;
    }
}
function syncCharsetLegend() {
    setText(elements.charsetLegend, (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.getCharsetLegend)(state.translationEncoding));
}
async function copyDecodedToClipboard() {
    const text = elements.decodedSelection ? elements.decodedSelection.textContent || '' : '';
    if (!text || text.startsWith('(loading')) {
        setText(elements.status, 'No decoded selection text to copy yet.');
        return;
    }
    const copied = await copyText(text);
    if (!copied) {
        setText(elements.status, 'Unable to copy decoded text.');
        return;
    }
    setText(elements.status, 'Copied decoded selection text.');
}
async function copyDraftToClipboard() {
    const text = (elements.translationDraft ? elements.translationDraft.value : state.translationDraft) || '';
    if (!text) {
        setText(elements.status, 'Translation draft is empty.');
        return;
    }
    const copied = await copyText(text);
    if (!copied) {
        setText(elements.status, 'Unable to copy translation draft.');
        return;
    }
    setText(elements.status, 'Copied translation draft.');
}
function clearDraft() {
    state.translationDraft = '';
    if (elements.translationDraft) {
        elements.translationDraft.value = '';
    }
    persistState();
    setText(elements.status, 'Cleared translation draft.');
}
function renderCharFrameRows(start, end) {
    if (!elements.charFrameRows) {
        return;
    }
    elements.charFrameRows.innerHTML = '';
    const range = normalizeRange(start, end);
    const totalLength = range.end - range.start + 1;
    const rowCount = Math.min(totalLength, MAX_CHAR_FRAME_BYTES);
    for (let i = 0; i < rowCount; i += 1) {
        const offset = range.start + i;
        const row = document.createElement('tr');
        const byte = getByte(offset, state.mode);
        appendCell(row, `0x${offset.toString(16).toUpperCase().padStart(8, '0')}`);
        if (byte === undefined) {
            appendCell(row, '..');
            appendCell(row, '(loading)');
            appendCell(row, 'pending');
            elements.charFrameRows.appendChild(row);
            continue;
        }
        appendCell(row, `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`);
        appendCell(row, toGlyph(byte, state.translationEncoding));
        appendCell(row, classifyByteRole(byte, state.translationEncoding));
        elements.charFrameRows.appendChild(row);
    }
    if (rowCount === 0) {
        renderCharFramePlaceholder('Select bytes to inspect character framing.');
        return;
    }
    if (totalLength > rowCount) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = `Showing first ${formatNumber(rowCount)} of ${formatNumber(totalLength)} selected bytes.`;
        row.appendChild(cell);
        elements.charFrameRows.appendChild(row);
    }
}
function renderCharFramePlaceholder(message) {
    if (!elements.charFrameRows) {
        return;
    }
    elements.charFrameRows.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = message;
    row.appendChild(cell);
    elements.charFrameRows.appendChild(row);
}
function decodeSelectionBytes(bytes, encoding) {
    return (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.decodeBytesByCharset)(bytes, encoding);
}
function toGlyph(byte, encoding) {
    return (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.glyphForByteForCharset)(byte, encoding);
}
function classifyByteRole(byte, encoding) {
    return (0,_necCharsets__WEBPACK_IMPORTED_MODULE_0__.classifyByteForCharset)(byte, encoding);
}
function collectSelectionBytes(start, end, maxBytes) {
    const range = normalizeRange(start, end);
    const viewLength = getViewLength(state.mode);
    if (range.start < 0 || range.start >= viewLength) {
        return undefined;
    }
    const safeEnd = Math.min(range.end, viewLength - 1);
    const total = safeEnd - range.start + 1;
    const readLength = Math.min(total, maxBytes);
    const bytes = new Uint8Array(readLength);
    let missing = false;
    for (let i = 0; i < readLength; i += 1) {
        const byte = getByte(range.start + i, state.mode);
        if (byte === undefined) {
            missing = true;
            continue;
        }
        bytes[i] = byte;
    }
    return {
        bytes,
        total,
        readLength,
        missing
    };
}
function ensureBytesForOffsetRange(start, end) {
    const viewLength = getViewLength(state.mode);
    if (viewLength <= 0) {
        return;
    }
    const range = normalizeRange(start, end);
    const clampedStart = clampOffset(range.start, state.mode);
    const clampedEnd = clampOffset(range.end, state.mode);
    const firstChunk = Math.floor(clampedStart / CHUNK_BYTES);
    const lastChunk = Math.floor(clampedEnd / CHUNK_BYTES);
    for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
        const chunkStart = chunkIndex * CHUNK_BYTES;
        const chunkLength = Math.min(CHUNK_BYTES, viewLength - chunkStart);
        if (chunkLength > 0) {
            requestChunk(state.mode, chunkStart, chunkLength);
        }
    }
}
function normalizeRange(start, end) {
    return start <= end ? { start, end } : { start: end, end: start };
}
async function copyText(value) {
    if (!value) {
        return false;
    }
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return true;
        }
    }
    catch (_a) {
        // Fall through to legacy copy.
    }
    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'absolute';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    }
    catch (_b) {
        copied = false;
    }
    document.body.removeChild(helper);
    return copied;
}
function parseDecimalInteger(value) {
    const cleaned = value.trim().replace(/,/g, '');
    if (!/^[0-9]+$/.test(cleaned)) {
        return undefined;
    }
    const parsed = Number.parseInt(cleaned, 10);
    if (!Number.isSafeInteger(parsed)) {
        return undefined;
    }
    return parsed;
}
function parseOffsetInput(value) {
    const cleaned = value.trim().replace(/,/g, '').toLowerCase();
    if (cleaned.length === 0) {
        return undefined;
    }
    let parsed;
    if (/^0x[0-9a-f]+$/.test(cleaned)) {
        parsed = Number.parseInt(cleaned, 16);
    }
    else if (/^[0-9a-f]+h$/.test(cleaned)) {
        parsed = Number.parseInt(cleaned.slice(0, -1), 16);
    }
    else if (/^[0-9]+$/.test(cleaned)) {
        parsed = Number.parseInt(cleaned, 10);
    }
    else {
        return undefined;
    }
    if (!Number.isSafeInteger(parsed)) {
        return undefined;
    }
    return parsed;
}
function decodeBase64(base64) {
    if (typeof base64 !== 'string' || base64.length === 0) {
        return new Uint8Array();
    }
    try {
        const binary = atob(base64);
        const output = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            output[i] = binary.charCodeAt(i);
        }
        return output;
    }
    catch (_a) {
        return new Uint8Array();
    }
}
function setText(element, text) {
    if (element) {
        element.textContent = text;
    }
}
function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}
function withUnits(value, units) {
    return `${formatNumber(value)} ${units}`;
}
function appendCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
}
function post(message) {
    vscode.postMessage(message);
}
function persistState() {
    vscode.setState({
        defaultMode: state.defaultMode,
        mode: state.mode,
        translationEncoding: state.translationEncoding,
        translationDraft: state.translationDraft,
        selectionStart: state.selectionStart,
        selectionEnd: state.selectionEnd,
        cursorOffset: state.cursorOffset,
        anchorOffset: state.anchorOffset
    });
}

})();

/******/ })()
;
//# sourceMappingURL=editor.js.map