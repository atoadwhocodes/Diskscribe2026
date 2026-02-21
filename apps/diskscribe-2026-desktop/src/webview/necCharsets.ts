export type CharsetId =
  | 'pc98-cp932'
  | 'pc98-shift-jis'
  | 'pc88-shift-jis'
  | 'pc88-jis7'
  | 'pc88-ank'
  | 'jis-x-0201-roman'
  | 'jis-x-0201-kana'
  | 'euc-jp'
  | 'iso-2022-jp'
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'ascii'
  | 'latin1';

export interface CharsetProfile {
  id: CharsetId;
  label: string;
  description: string;
  legend: string;
}

export const DEFAULT_CHARSET_ID: CharsetId = 'pc98-cp932';

export const CHARSET_PROFILES: ReadonlyArray<CharsetProfile> = [
  {
    id: 'pc98-cp932',
    label: 'PC-98 CP932 (Windows-31J)',
    description: 'Primary NEC PC-98 game/disk text encoding (Shift-JIS with NEC/IBM extensions).',
    legend:
      'PC-98 CP932 byte roles: lead 0x81-0x9F/0xE0-0xFC, half-width kana 0xA1-0xDF, trail 0x40-0x7E/0x80-0xFC.'
  },
  {
    id: 'pc98-shift-jis',
    label: 'PC-98 Shift-JIS (strict)',
    description: 'Shift-JIS decode path without explicit CP932 preference hints.',
    legend:
      'Shift-JIS byte roles: lead 0x81-0x9F/0xE0-0xFC, half-width kana 0xA1-0xDF, trail 0x40-0x7E/0x80-0xFC.'
  },
  {
    id: 'pc88-shift-jis',
    label: 'PC-88 Shift-JIS (N88)',
    description: 'Common late-era PC-88 text encoding for N88-BASIC and DOS tools.',
    legend:
      'PC-88 Shift-JIS roles match standard Shift-JIS; high leads can include NEC/IBM extension regions.'
  },
  {
    id: 'pc88-jis7',
    label: 'PC-88 JIS 7-bit (ESC)',
    description: 'ISO-2022-JP/JIS escape-sequence text seen in some PC-88 materials.',
    legend:
      'JIS 7-bit roles: ESC (0x1B) switches sets, SO/SI (0x0E/0x0F) shift kana, 0x21-0x7E payload bytes.'
  },
  {
    id: 'pc88-ank',
    label: 'PC-88 ANK + Kana + Graphics',
    description: 'Single-byte PC-88 text/label bytes: ANK ASCII, half-width kana, and graphics/gaiji candidates.',
    legend:
      'PC-88 ANK roles: ANK 0x20-0x7E, kana 0xA1-0xDF, graphics/gaiji candidates 0x80-0x9F and 0xE0-0xFF.'
  },
  {
    id: 'jis-x-0201-roman',
    label: 'JIS X 0201 Roman',
    description: 'Roman set with yen at 0x5C and overline at 0x7E.',
    legend:
      'JIS X 0201 Roman roles: printable 0x20-0x7E with 0x5C=>\u00A5 and 0x7E=>\u203E, controls below 0x20.'
  },
  {
    id: 'jis-x-0201-kana',
    label: 'JIS X 0201 Kana',
    description: 'Single-byte half-width katakana extension over Roman bytes.',
    legend:
      'JIS X 0201 Kana roles: Roman bytes 0x20-0x7E and half-width kana 0xA1-0xDF.'
  },
  {
    id: 'euc-jp',
    label: 'EUC-JP',
    description: 'UNIX-oriented Japanese multibyte encoding.',
    legend:
      'EUC-JP roles: ASCII 0x00-0x7F, kana lead 0x8E, plane-2 lead 0x8F, multibyte bytes 0xA1-0xFE.'
  },
  {
    id: 'iso-2022-jp',
    label: 'ISO-2022-JP',
    description: 'Email/transport-safe Japanese encoding with escape sequences.',
    legend:
      'ISO-2022-JP roles: ESC (0x1B) and shift bytes manage state; payload uses 7-bit JIS bytes.'
  },
  {
    id: 'utf-8',
    label: 'UTF-8',
    description: 'Unicode UTF-8 for modern tooling artifacts.',
    legend:
      'UTF-8 roles: lead bytes 0xC2-0xF4, continuation bytes 0x80-0xBF, ASCII at 0x00-0x7F.'
  },
  {
    id: 'utf-16le',
    label: 'UTF-16 LE',
    description: 'Unicode UTF-16 little-endian.',
    legend:
      'UTF-16 roles are code-unit based; frame view shows byte-level hints only.'
  },
  {
    id: 'utf-16be',
    label: 'UTF-16 BE',
    description: 'Unicode UTF-16 big-endian.',
    legend:
      'UTF-16 roles are code-unit based; frame view shows byte-level hints only.'
  },
  {
    id: 'ascii',
    label: 'ASCII',
    description: '7-bit ASCII display.',
    legend:
      'ASCII roles: printable bytes 0x20-0x7E, control bytes below 0x20 and 0x7F.'
  },
  {
    id: 'latin1',
    label: 'Latin-1',
    description: 'Single-byte ISO-8859-1 pass-through.',
    legend:
      'Latin-1 roles: single-byte codepoints with C0/C1 control regions.'
  }
];

const PROFILE_BY_ID = new Map<CharsetId, CharsetProfile>(
  CHARSET_PROFILES.map((profile) => [profile.id, profile])
);
const DEFAULT_PROFILE = PROFILE_BY_ID.get(DEFAULT_CHARSET_ID) ?? CHARSET_PROFILES[0];

const LEGACY_ALIASES = new Map<string, CharsetId>([
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

export function normalizeCharsetId(value: unknown): CharsetId {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (PROFILE_BY_ID.has(raw as CharsetId)) {
    return raw as CharsetId;
  }

  return LEGACY_ALIASES.get(raw) ?? DEFAULT_CHARSET_ID;
}

export function getCharsetProfile(value: unknown): CharsetProfile {
  return PROFILE_BY_ID.get(normalizeCharsetId(value)) ?? DEFAULT_PROFILE;
}

export function getCharsetLegend(value: unknown): string {
  return getCharsetProfile(value).legend;
}

export function decodeBytesByCharset(bytes: Uint8Array, value: unknown): string {
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

export function glyphForByteForCharset(byte: number, value: unknown): string {
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

export function classifyByteForCharset(byte: number, value: unknown): string {
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

function decodeWithTextDecoder(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return decodeAscii(bytes);
  }
}

function decodeAscii(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(glyphForAscii(byte));
  }
  return out.join('');
}

function decodeLatin1(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
      out.push(String.fromCharCode(byte));
      continue;
    }
    out.push(String.fromCharCode(byte));
  }
  return out.join('');
}

function decodeJisX0201Roman(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(glyphForJisX0201Roman(byte));
  }
  return out.join('');
}

function decodeJisX0201Kana(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(glyphForJisX0201Kana(byte));
  }
  return out.join('');
}

function decodePc88Ank(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(glyphForPc88Ank(byte));
  }
  return out.join('');
}

function glyphForAscii(byte: number): string {
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

function glyphForLatin1(byte: number): string {
  if (byte === 0x0a || byte === 0x0d || byte === 0x09) {
    return String.fromCharCode(byte);
  }
  if (byte >= 0x20) {
    return String.fromCharCode(byte);
  }
  return '.';
}

function glyphForJisX0201Roman(byte: number): string {
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

function glyphForJisX0201Kana(byte: number): string {
  if (byte >= 0xa1 && byte <= 0xdf) {
    return String.fromCharCode(0xff61 + (byte - 0xa1));
  }
  return glyphForJisX0201Roman(byte);
}

function glyphForShiftJisSingleByte(byte: number): string {
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

function glyphForPc88Ank(byte: number): string {
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

function classifyAsciiByte(byte: number): string {
  if (byte < 0x20 || byte === 0x7f) {
    return 'control';
  }
  if (byte <= 0x7e) {
    return 'ASCII printable';
  }
  return 'outside ASCII';
}

function classifyLatin1Byte(byte: number): string {
  if (byte <= 0x1f || byte === 0x7f || (byte >= 0x80 && byte <= 0x9f)) {
    return 'control';
  }
  return 'Latin-1 printable';
}

function classifyUtf8Byte(byte: number): string {
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

function classifyUtf16Byte(byte: number): string {
  if (byte === 0x00) {
    return 'UTF-16 null/high-byte candidate';
  }
  if (byte < 0x20 || byte === 0x7f) {
    return 'control/code-unit byte';
  }
  return 'UTF-16 code-unit byte';
}

function classifyJisX0201RomanByte(byte: number): string {
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

function classifyJisX0201KanaByte(byte: number): string {
  if (byte >= 0xa1 && byte <= 0xdf) {
    return 'half-width katakana';
  }
  return classifyJisX0201RomanByte(byte);
}

function classifyCp932Byte(byte: number): string {
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

function classifyShiftJisByte(byte: number): string {
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

function classifyPc88AnkByte(byte: number): string {
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

function classifyEucJpByte(byte: number): string {
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

function classifyIso2022Byte(byte: number): string {
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
