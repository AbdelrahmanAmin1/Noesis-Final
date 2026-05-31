'use strict';

const captions = require('../services/captions.service');

describe('English WebVTT captions', () => {
  it('builds sentence cues with cumulative scene timestamps', () => {
    const vtt = captions.buildWebVtt([
      { narration: 'First scene. Second sentence!', durationSec: 4 },
      { narration: 'Next scene?', durationSec: 2.5 },
    ]);

    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.000\nFirst scene.');
    expect(vtt).toContain('00:00:02.000 --> 00:00:04.000\nSecond sentence!');
    expect(vtt).toContain('00:00:04.000 --> 00:00:06.500\nNext scene?');
  });

  it('returns a valid empty WebVTT document for empty narration', () => {
    expect(captions.buildWebVtt([{ narration: '', durationSec: 3 }])).toBe('WEBVTT\n\n');
  });

  it('keeps subtitle text readable and removes cue delimiter injection', () => {
    const vtt = captions.buildWebVtt([{ narration: 'Use A & B < C --> D.', durationSec: 1 }]);
    expect(vtt).toContain('Use A & B < C -> D.');
    expect(vtt.match(/-->/g)).toHaveLength(1);
  });
});
