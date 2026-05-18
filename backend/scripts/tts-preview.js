'use strict';

const path = require('path');
const tts = require('../services/tts.service');
const env = require('../config/env');

async function main() {
  const args = process.argv.slice(2);
  const textArgIndex = args.findIndex(arg => arg === '--text' || arg === '-t');
  const outputArgIndex = args.findIndex(arg => arg === '--out' || arg === '-o');
  const text = textArgIndex >= 0
    ? args.slice(textArgIndex + 1, outputArgIndex > textArgIndex ? outputArgIndex : undefined).join(' ')
    : args.filter(arg => !arg.startsWith('--')).join(' ');
  const cleanText = text.trim() || 'Inheritance lets a child class specialize a parent class. Notice how Shape defines the contract, while Circle and Rectangle provide their own area formulas.';
  const requestedOut = outputArgIndex >= 0 ? args[outputArgIndex + 1] : '';
  const outPath = requestedOut ? path.resolve(process.cwd(), requestedOut) : path.join(env.UPLOAD_DIR, 'tts-preview.wav');
  const status = tts.detectTTS();
  console.log(JSON.stringify(status, null, 2));
  await tts.synthesize(cleanText, outPath, {
    pauseMs: env.TTS_PAUSE_MS_SENTENCE,
    sectionPauseMs: env.TTS_PAUSE_MS_SECTION,
  });
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
