'use strict';

describe('TTS detection', () => {
  let tts;

  beforeAll(() => {
    process.env.TTS_ENGINE = 'piper';
    process.env.TTS_VOICE_PATH = '';
    tts = require('../services/tts.service');
  });

  it('exports detectTTS function', () => {
    expect(typeof tts.detectTTS).toBe('function');
  });

  it('exports synthesize function', () => {
    expect(typeof tts.synthesize).toBe('function');
  });

  it('returns a status object with required fields', () => {
    const status = tts.detectTTS();
    expect(status).toBeDefined();
    expect(status).toHaveProperty('configured_engine');
    expect(status).toHaveProperty('active_engine');
    expect(status).toHaveProperty('piper_binary_found');
    expect(status).toHaveProperty('piper_voice_found');
    expect(status).toHaveProperty('voice_path');
  });

  it('detects piper is configured', () => {
    const status = tts.detectTTS();
    expect(status.configured_engine).toBe('piper');
  });

  it('falls back when piper voice is not set', () => {
    const status = tts.detectTTS();
    expect(status.piper_voice_found).toBe(false);
    expect(status.active_engine).not.toBe('piper');
    expect(status.recommendation).toBeDefined();
    expect(typeof status.recommendation).toBe('string');
    expect(status.recommendation.length).toBeGreaterThan(0);
  });
});

describe('TTS silence fallback', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  it('synthSilence creates a valid WAV file', async () => {
    const tts = require('../services/tts.service');
    const outPath = path.join(os.tmpdir(), `noesis_test_silence_${Date.now()}.wav`);
    try {
      await tts._internals.synthSilence('This is a test sentence for silence synthesis.', outPath);
      expect(fs.existsSync(outPath)).toBe(true);
      const stat = fs.statSync(outPath);
      expect(stat.size).toBeGreaterThan(44);
      const header = Buffer.alloc(12);
      const fd = fs.openSync(outPath, 'r');
      fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);
      expect(header.toString('ascii', 0, 4)).toBe('RIFF');
      expect(header.toString('ascii', 8, 12)).toBe('WAVE');
    } finally {
      try { fs.unlinkSync(outPath); } catch (_) {}
    }
  });

  it('splitSentences splits on punctuation', () => {
    const { splitSentences } = require('../services/tts.service')._internals;
    const result = splitSentences('Hello world. This is a test! Is it working?');
    expect(result).toEqual(['Hello world.', 'This is a test!', 'Is it working?']);
  });
});
