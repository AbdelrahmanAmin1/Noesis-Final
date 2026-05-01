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

function synthSapi(text, outPath) {
  return new Promise((resolve, reject) => {
    const textPath = outPath.replace(/\.[^.]+$/i, '') + '.txt';
    const scriptPath = outPath.replace(/\.[^.]+$/i, '') + '.ps1';
    fs.writeFileSync(textPath, text, 'utf8');
    const script = [
      "$ErrorActionPreference='Stop'",
      'Add-Type -AssemblyName System.Speech',
      '$text = Get-Content -LiteralPath $args[0] -Raw',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$s.Rate = 0',
      '$s.Volume = 100',
      '$s.SetOutputToWaveFile($args[1])',
      '$s.Speak($text)',
      '$s.Dispose()',
    ].join('; ');
    fs.writeFileSync(scriptPath, script, 'utf8');
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, textPath, outPath]);
    let stderr = '';
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', (err) => {
      try { fs.unlinkSync(textPath); } catch (_) {}
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      reject(err);
    });
    p.on('close', code => {
      try { fs.unlinkSync(textPath); } catch (_) {}
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) resolve(outPath);
      else reject(new Error(`sapi_failed_${code}: ${stderr.slice(0, 200)}`));
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
  let lastErr = null;
  if (engine === 'piper' && env.TTS_VOICE_PATH && fs.existsSync(env.TTS_VOICE_PATH)) {
    try { return await synthPiper(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (engine === 'espeak') {
    return synthEspeak(safe, outPath);
  }
  if (engine === 'say') {
    return synthSay(safe, outPath);
  }
  if (engine === 'sapi') {
    return synthSapi(safe, outPath);
  }
  if (process.platform === 'win32') {
    try { return await synthSapi(safe, outPath); } catch (e) { lastErr = e; }
  }
  try { return await synthEspeak(safe, outPath); } catch (e) { lastErr = e; }
  try { return await synthSay(safe, outPath); } catch (e) { lastErr = e; }
  if (engine === 'silence' || process.env.NOESIS_ALLOW_SILENT_TTS === 'true') {
    return synthSilence(safe, outPath);
  }
  throw new Error(`tts_unavailable: install Piper/espeak, set TTS_ENGINE=sapi on Windows, or provide TTS_BIN/TTS_VOICE_PATH. Last error: ${lastErr ? lastErr.message : 'none'}`);
}

module.exports = { synthesize, _internals: { synthSapi, synthSilence } };
