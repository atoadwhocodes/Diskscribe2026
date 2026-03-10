function isSjisLead(byteValue) {
  return (byteValue >= 0x81 && byteValue <= 0x9f) || (byteValue >= 0xe0 && byteValue <= 0xfc);
}

function isSjisTrail(byteValue) {
  return ((byteValue >= 0x40 && byteValue <= 0x7e) || (byteValue >= 0x80 && byteValue <= 0xfc)) && byteValue !== 0x7f;
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ''), 'ascii');
}

function collapseWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeAsciiText(text, options = {}) {
  const punctuationMap = options.punctuationMap || [
    [/[‘’]/g, '\''],
    [/[“”]/g, '"'],
    [/\u2026/g, '...'],
    [/[\u2013\u2014]/g, '-'],
    [/\u3000/g, ' ']
  ];
  let value = String(text || '');

  for (const [pattern, replacement] of punctuationMap) {
    value = value.replace(pattern, replacement);
  }

  if (options.reservedCharactersPattern) {
    value = value.replace(options.reservedCharactersPattern, ' ');
  }

  value = value.replace(/[^\x20-\x7e]/g, ' ');
  return collapseWhitespace(value);
}

function createRegexTransform(name, pattern, replacement) {
  return {
    name,
    apply(text) {
      return text.replace(pattern, replacement);
    }
  };
}

function tightenSlashSpacingTransform() {
  return createRegexTransform('tighten-slash-spacing', /\s*\/\s*/g, '/');
}

function stripOuterQuotesTransform() {
  return {
    name: 'strip-outer-quotes',
    apply(text) {
      const value = String(text || '').trim();
      if (value.length < 2) {
        return value;
      }

      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
        return value.slice(1, -1).trim();
      }

      return value;
    }
  };
}

function tightenEllipsisTransform() {
  return createRegexTransform('tighten-ellipsis', /\.{3,}/g, '..');
}

function protectAbbreviations(text, abbreviations) {
  if (!Array.isArray(abbreviations) || abbreviations.length === 0) {
    return {
      value: text,
      restore(current) {
        return current;
      }
    };
  }

  let value = text;
  const tokens = [];

  for (const abbreviation of abbreviations) {
    const escaped = String(abbreviation).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\.\\s+`, 'g');

    value = value.replace(pattern, (match) => {
      const token = `__ABBR_${tokens.length}__`;
      tokens.push(match);
      return token;
    });
  }

  return {
    value,
    restore(current) {
      return tokens.reduce(
        (restored, match, index) => restored.replace(new RegExp(`__ABBR_${index}__`, 'g'), match),
        current
      );
    }
  };
}

function tightenSentenceSpacingTransform(options = {}) {
  const abbreviations = options.abbreviations || [];

  return {
    name: 'tighten-sentence-spacing',
    apply(text) {
      const protectedText = protectAbbreviations(text, abbreviations);
      const tightened = protectedText.value.replace(/([.!?;:])\s+(?=[A-Z"'(])/g, '$1');
      return protectedText.restore(tightened);
    }
  };
}

function tightenCommaSpacingTransform() {
  return createRegexTransform('tighten-comma-spacing', /,\s+(?=[A-Z"'(])/g, ',');
}

function tightenAllPunctuationSpacingTransform(options = {}) {
  const abbreviations = options.abbreviations || [];

  return {
    name: 'tighten-all-punctuation-spacing',
    apply(text) {
      const protectedText = protectAbbreviations(text, abbreviations);
      const tightened = protectedText.value.replace(/([.!?;:,])\s+(?=[A-Za-z0-9"'(])/g, '$1');
      return protectedText.restore(tightened);
    }
  };
}

function sequentialReplacementTransform(name, rules) {
  return {
    name,
    apply(text) {
      return (rules || []).reduce((current, rule) => current.replace(rule.pattern, rule.replace), text);
    }
  };
}

function trimLeadingPhrasesTransform(phrases) {
  const normalized = (phrases || []).map((phrase) => String(phrase));

  return {
    name: 'trim-leading-phrases',
    apply(text) {
      for (const phrase of normalized) {
        const pattern = new RegExp(`^${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (pattern.test(text)) {
          return collapseWhitespace(text.replace(pattern, ''));
        }
      }

      return text;
    }
  };
}

function trimWordsTransform(words) {
  const normalized = (words || []).map((word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!normalized.length) {
    return {
      name: 'trim-words',
      apply(text) {
        return text;
      }
    };
  }

  const pattern = new RegExp(`\\b(?:${normalized.join('|')})\\b`, 'gi');

  return {
    name: 'trim-words',
    apply(text) {
      return collapseWhitespace(text.replace(pattern, ' '));
    }
  };
}

function replaceAndWithAmpersandTransform() {
  return createRegexTransform('and-to-ampersand', /\s+and\s+/gi, ' & ');
}

function fitAsciiText(text, capacity, options = {}) {
  const transforms = options.transforms || [];
  const base = sanitizeAsciiText(text, options);
  const appliedStrategies = ['sanitize-ascii'];
  let current = base;
  const originalLength = byteLength(base);

  if (originalLength <= capacity) {
    return {
      text: current,
      originalLength,
      finalLength: originalLength,
      preTruncateLength: originalLength,
      savedBytes: 0,
      adjusted: false,
      truncated: false,
      overflowBytes: 0,
      appliedStrategies
    };
  }

  for (const transform of transforms) {
    if (!transform || typeof transform.apply !== 'function') {
      continue;
    }

    const transformed = sanitizeAsciiText(transform.apply(current), options);
    if (!transformed || transformed === current) {
      continue;
    }

    current = transformed;
    appliedStrategies.push(transform.name || 'transform');

    if (byteLength(current) <= capacity) {
      return {
        text: current,
        originalLength,
        finalLength: byteLength(current),
        preTruncateLength: byteLength(current),
        savedBytes: originalLength - byteLength(current),
        adjusted: current !== base,
        truncated: false,
        overflowBytes: 0,
        appliedStrategies
      };
    }
  }

  const preTruncateLength = byteLength(current);
  const truncated = truncateAtWordBoundary(current, capacity);
  return {
    text: truncated,
    originalLength,
    finalLength: byteLength(truncated),
    preTruncateLength,
    savedBytes: originalLength - byteLength(truncated),
    adjusted: truncated !== base,
    truncated: true,
    overflowBytes: Math.max(0, preTruncateLength - capacity),
    appliedStrategies: [...appliedStrategies, 'truncate-word-boundary']
  };
}

function truncateAtWordBoundary(text, capacity) {
  const value = String(text || '');
  if (byteLength(value) <= capacity) {
    return value;
  }

  let candidate = value.slice(0, capacity);
  const lastSpace = candidate.lastIndexOf(' ');

  if (lastSpace >= Math.max(4, capacity - 24)) {
    candidate = candidate.slice(0, lastSpace);
  }

  return candidate.replace(/[ ,;:\/-]+$/g, '').trimEnd();
}

function findStringLength(buffer, offset, maxBytes) {
  const limit = maxBytes ? Math.min(buffer.length, offset + maxBytes) : buffer.length;
  let end = offset;

  while (end < limit && buffer[end] !== 0x00) {
    end++;
  }

  return end - offset;
}

function collectTextSlots(region) {
  const textSlots = [];
  let index = 0;

  while (index < region.length) {
    const byteValue = region[index];

    if (isSjisLead(byteValue) && index + 1 < region.length && isSjisTrail(region[index + 1])) {
      textSlots.push(index, index + 1);
      index += 2;
      continue;
    }

    if (byteValue >= 0xa1 && byteValue <= 0xdf) {
      textSlots.push(index);
      index++;
      continue;
    }

    if (byteValue === 0x23 && index + 1 < region.length) {
      const letter = region[index + 1];
      if (letter >= 0x41 && letter <= 0x5a) {
        let codeLength = 2;
        if (index + 2 < region.length) {
          const paramCount = region[index + 2];
          if (paramCount >= 0x01 && paramCount <= 0x0f && index + 3 + paramCount <= region.length) {
            codeLength = 3 + paramCount;
          }
        }
        index += codeLength;
        continue;
      }
    }

    if (byteValue === 0x21 && index + 1 < region.length) {
      const next = region[index + 1];
      if (next === 0x30 || next === 0x40 || next === 0x5f || next === 0x23) {
        index += 2;
        continue;
      }
    }

    if (byteValue === 0x30 && index + 1 < region.length && (region[index + 1] === 0x5f || region[index + 1] === 0x23)) {
      const second = region[index + 1];
      index += 2;
      if (second === 0x5f && index < region.length && region[index] >= 0x30 && region[index] <= 0x39) {
        index++;
      }
      continue;
    }

    if ((byteValue === 0x24 || byteValue === 0x25) && index + 1 < region.length) {
      index += 2;
      continue;
    }

    if (byteValue === 0x40 || byteValue < 0x20) {
      index++;
      continue;
    }

    if (byteValue >= 0x20 && byteValue <= 0x7e) {
      textSlots.push(index);
      index++;
      continue;
    }

    index++;
  }

  return textSlots;
}

function buildControlSafePatch(options) {
  const length = findStringLength(options.originalBuffer, options.offset, options.maxBytes);
  if (length < 4) {
    return null;
  }

  const region = Buffer.from(options.originalBuffer.slice(options.offset, options.offset + length));
  const textSlots = collectTextSlots(region);
  if (!textSlots.length) {
    return null;
  }

  const fit = fitAsciiText(options.translation, textSlots.length, options.fitOptions);
  if (!fit.text) {
    return null;
  }

  const bytes = Buffer.from(fit.text, 'ascii');
  if (!bytes.length) {
    return null;
  }

  let written = 0;
  for (const slot of textSlots) {
    region[slot] = written < bytes.length ? bytes[written++] : 0x20;
  }

  return {
    region,
    length,
    capacity: textSlots.length,
    used: Math.min(bytes.length, textSlots.length),
    truncated: fit.truncated,
    fit
  };
}

module.exports = {
  buildControlSafePatch,
  createRegexTransform,
  fitAsciiText,
  sanitizeAsciiText,
  sequentialReplacementTransform,
  stripOuterQuotesTransform,
  tightenAllPunctuationSpacingTransform,
  tightenCommaSpacingTransform,
  tightenEllipsisTransform,
  tightenSentenceSpacingTransform,
  tightenSlashSpacingTransform,
  trimLeadingPhrasesTransform,
  trimWordsTransform,
  replaceAndWithAmpersandTransform
};
