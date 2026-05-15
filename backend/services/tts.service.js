'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const log = require('../utils/logger');

let _detectedEngine = null;

function detectTTS() {
  if (_detectedEngine) return _detectedEngine;

  const configured = (env.TTS_ENGINE || 'piper').toLowerCase();
  const piperBinExists = checkBinaryExists(env.TTS_BIN || 'piper');
  const piperVoiceExists = env.TTS_VOICE_PATH && fs.existsSync(path.resolve(env.ROOT_DIR, env.TTS_VOICE_PATH));
  const piperReady = piperBinExists && piperVoiceExists;

  let activeEngine = configured;
  let recommendation = null;

  if (configured === 'piper' && !piperReady) {
    if (!piperBinExists && !piperVoiceExists) {
      recommendation = 'Download Piper from github.com/rhasspy/piper/releases and a voice from huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/amy/medium';
    } else if (!piperVoiceExists) {
      recommendation = 'Set TTS_VOICE_PATH in .env to a downloaded .onnx voice model (e.g. ./tts-models/en_US-amy-medium.onnx)';
    } else {
      recommendation = 'Piper binary not found. Set TTS_BIN to the path of your piper executable.';
    }
    if (process.platform === 'win32') activeEngine = 'sapi';
    else activeEngine = 'espeak';
  }

  _detectedEngine = {
    configured_engine: configured,
    active_engine: activeEngine,
    piper_binary_found: piperBinExists,
    piper_voice_found: !!piperVoiceExists,
    voice_path: env.TTS_VOICE_PATH || '',
    recommendation,
  };

  if (recommendation) {
    log.warn(`TTS: ${configured} configured but not ready — falling back to ${activeEngine}. ${recommendation}`);
  } else {
    log.info(`TTS: ${activeEngine} ready${activeEngine === 'piper' ? ` (voice: ${env.TTS_VOICE_PATH})` : ''}`);
  }

  return _detectedEngine;
}

function checkBinaryExists(name) {
  try {
    const { execSync } = require('child_process');
    const cmd = process.platform === 'win32' ? `where "${name}" 2>nul` : `which "${name}" 2>/dev/null`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch (_) {
    if (name !== 'piper' && fs.existsSync(path.resolve(env.ROOT_DIR, name))) return true;
    return false;
  }
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function synthPiper(text, outPath) {
  const voicePath = path.resolve(env.ROOT_DIR, env.TTS_VOICE_PATH);
  return new Promise((resolve, reject) => {
    const args = ['--model', voicePath, '--output_file', outPath];
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
    const p = spawn('espeak-ng', ['-w', outPath, text]);
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`espeak_failed_${code}`));
    });
  });
}

function synthSay(text, outPath) {
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

    const sentences = splitSentences(text);
    const ssml = sentences.map(s =>
      `<s>${s}</s><break time="350ms"/>`
    ).join('');
    const ssmlWrapped = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="-5%">${ssml}</prosody></speak>`;

    fs.writeFileSync(textPath, ssmlWrapped, 'utf8');
    const script = [
      "$ErrorActionPreference='Stop'",
      'Add-Type -AssemblyName System.Speech',
      '$ssml = Get-Content -LiteralPath $args[0] -Raw',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$s.Volume = 100',
      '$s.SetOutputToWaveFile($args[1])',
      '$s.SpeakSsml($ssml)',
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

const MAX_NARRATION_CHARS = 4000;

function clipNarration(text) {
  const s = String(text || '');
  if (s.length <= MAX_NARRATION_CHARS) return s;
  return s.slice(0, MAX_NARRATION_CHARS - 1) + '…';
}

async function synthesize(text, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const safe = clipNarration(text);
  const status = detectTTS();
  const engine = status.active_engine;
  let lastErr = null;

  if (engine === 'piper' && status.piper_voice_found) {
    try { return await synthPiper(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (engine === 'espeak') {
    try { return await synthEspeak(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (engine === 'say') {
    try { return await synthSay(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (engine === 'sapi' || process.platform === 'win32') {
    try { return await synthSapi(safe, outPath); } catch (e) { lastErr = e; }
  }
  // Last resort fallback chain
  if (!lastErr || engine !== 'espeak') {
    try { return await synthEspeak(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (!lastErr || engine !== 'say') {
    try { return await synthSay(safe, outPath); } catch (e) { lastErr = e; }
  }
  if (engine === 'silence' || process.env.NOESIS_ALLOW_SILENT_TTS === 'true') {
    return synthSilence(safe, outPath);
  }
  throw new Error(`tts_unavailable: ${status.active_engine} failed. ${status.recommendation || 'Install Piper or set TTS_ENGINE=sapi on Windows.'} Last error: ${lastErr ? lastErr.message : 'none'}`);
}

module.exports = { synthesize, detectTTS, _internals: { synthSapi, synthSilence, splitSentences } };
