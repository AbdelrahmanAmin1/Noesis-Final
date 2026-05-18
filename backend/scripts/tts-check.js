'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const tts = require('../services/tts.service');

function main() {
  const status = tts.detectTTS();
  console.log(JSON.stringify(status, null, 2));

  if (status.configured_engine !== 'piper') {
    console.warn('TTS_ENGINE is not piper. Set TTS_ENGINE=piper for demo narration.');
    process.exitCode = 1;
    return;
  }

  const voicePath = status.voice_path_resolved;
  const metadataPath = voicePath ? `${voicePath}.json` : '';
  const missing = [];
  if (!status.piper_binary_found) missing.push(`Piper binary not found: ${status.piper_binary}`);
  if (!voicePath || !fs.existsSync(voicePath)) missing.push(`Voice model missing: ${voicePath || path.resolve(env.ROOT_DIR, './tts-models/en_US-lessac-medium.onnx')}`);
  if (!metadataPath || !fs.existsSync(metadataPath)) missing.push(`Voice metadata missing: ${metadataPath || './tts-models/en_US-lessac-medium.onnx.json'}`);

  if (missing.length) {
    console.warn('\nPiper is configured but not ready:');
    for (const item of missing) console.warn(`- ${item}`);
    console.warn('\nDownload en_US-lessac-medium.onnx and en_US-lessac-medium.onnx.json into backend/tts-models/.');
    process.exitCode = 1;
    return;
  }

  console.log('\nPiper is ready for local narration.');
}

main();
