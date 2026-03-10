const {
  buildControlSafePatch,
  fitAsciiText,
  sequentialReplacementTransform,
  stripOuterQuotesTransform,
  tightenSentenceSpacingTransform,
  tightenSlashSpacingTransform
} = require('../../scripts/lib/text-slot-patcher.js');

describe('text-slot-patcher', () => {
  it('fits separator-heavy menu text before truncating', () => {
    const result = fitAsciiText('Data / Status / Items / Tactics / Equip / Skills / System', 55, {
      transforms: [tightenSlashSpacingTransform()]
    });

    expect(result.text).toBe('Data/Status/Items/Tactics/Equip/Skills/System');
    expect(result.adjusted).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.appliedStrategies).toContain('tighten-slash-spacing');
  });

  it('applies configured shortening transforms before falling back to truncation', () => {
    const result = fitAsciiText('"You are late. It is dangerous."', 27, {
      transforms: [
        stripOuterQuotesTransform(),
        tightenSentenceSpacingTransform(),
        sequentialReplacementTransform('shorten', [
          { pattern: /\byou are\b/gi, replace: 'You\'re' },
          { pattern: /\bit is\b/gi, replace: 'it\'s' }
        ])
      ]
    });

    expect(result.text).toBe('You\'re late.it\'s dangerous.');
    expect(result.adjusted).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.appliedStrategies).toEqual([
      'sanitize-ascii',
      'strip-outer-quotes',
      'tighten-sentence-spacing',
      'shorten'
    ]);
  });

  it('truncates at a word boundary when no transform fits the text', () => {
    const originalBuffer = Buffer.from('AAAAAAAAAAAAAAAAAAAA\0', 'ascii');
    const patch = buildControlSafePatch({
      originalBuffer,
      offset: 0,
      maxBytes: 20,
      translation: 'This line is too long for now',
      fitOptions: { transforms: [] }
    });

    expect(patch).not.toBeNull();
    expect(patch.truncated).toBe(true);
    expect(patch.fit.appliedStrategies.at(-1)).toBe('truncate-word-boundary');
    expect(patch.region.slice(0, patch.length).toString('ascii').trim()).toBe('This line is too');
  });
});
