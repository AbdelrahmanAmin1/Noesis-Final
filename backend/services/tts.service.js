'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

function synthPiper(text, outPath) {
  return new Promise((resolve, reject) => {
    const args = ['--model', env.TTS_VOICE_PATH, '--output_file', outPath];
    const p = spawn(env.TTS_BIN || 'piper', args);
    p.stdin.write(text);
    p.stdin.end();
    let stderr = '';
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`piper_failed_${code}: ${stderr.slice(0, 200)}`));
    });
  });
}

function synthEspeak(text, outPath) {
  return new Promise((resolve, reject) => {
    // espeak-ng -w out.wav "text"
    const p = spawn('espeak-ng', ['-w', outPath, text]);
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`espeak_failed_${code}`));
    });
  });
}

function synthSay(text, outPath) {
  // macOS 'say' produces aiff; ffmpeg can transcode. Here we just write an AIFF and let ffmpeg pick it up.
  return new Promise((resolve, reject) => {
    const p = spawn('say', ['-o', outPath, text]);
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`say_failed_${code}`));
    });
  });
}

function silenceDuration(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Math.ceil(words / 2.6)));
}

function synthSilence(text, outPath) {
  const sampleRate = 44100;
  const channels = 2;
  const bitsPerSample = 16;
  const dataSize = silenceDuration(text) * sampleRate * channels * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buf.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(outPath, buf);
  return Promise.resolve(outPath);
}

// OS argv length limit varies (~32KB on Linux, ~8KB on Windows). Cap narration well below.
const MAX_NARRATION_CHARS = 4000;

function clipNarration(text) {
  const s = String(text || '');
  if (s.length <= MAX_NARRATION_CHARS) return s;
  return s.slice(0, MAX_NARRATION_CHARS - 1) + '…';
}

async function synthesize(text, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const safe = clipNarration(text);
  const engine = (env.TTS_ENGINE || 'piper').toLowerCase();
  if (engine === 'piper' && env.TTS_VOICE_PATH && fs.existsSync(env.TTS_VOICE_PATH)) {
    return synthPiper(safe, outPath);
  }
  if (engine === 'espeak') {
    return synthEspeak(safe, outPath);
  }
  if (engine === 'say') {
    return synthSay(safe, outPath);
  }
  try { return await synthEspeak(safe, outPath); } catch (_) {}
  try { return await synthSay(safe, outPath); } catch (_) {}
  return synthSilence(safe, outPath);
}

module.exports = { synthesize };
