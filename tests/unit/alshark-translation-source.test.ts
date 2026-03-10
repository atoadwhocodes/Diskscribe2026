const {
  getEffectiveTranslation
} = require('../../scripts/alshark-translation-source.js');

describe('getEffectiveTranslation', () => {
  it('prefers patchText when present', () => {
    expect(getEffectiveTranslation({
      translation: 'Longer base line',
      patchText: 'Short line'
    })).toBe('Short line');
  });

  it('falls back to translation and ignores sentinel values', () => {
    expect(getEffectiveTranslation({
      translation: 'Usable translation'
    })).toBe('Usable translation');

    expect(getEffectiveTranslation({
      translation: '[ERROR]'
    })).toBe('');

    expect(getEffectiveTranslation({
      translation: '[EMPTY]'
    })).toBe('');
  });
});
