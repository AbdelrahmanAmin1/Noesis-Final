'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../config/env');
const log = require('../utils/logger');

let _detectedEngine = null;

function detectTTS() {
  if (_detectedEngine) return _detectedEngine;

  const configured = (env.TTS_ENGINE || 'piper').toLowerCase();
  const piperConfigured = configured === 'piper';
  const piperBin = env.TTS_BIN || 'piper';
  const piperVoicePath = env.TTS_VOICE_PATH ? path.resolve(env.ROOT_DIR, env.TTS_VOICE_PATH) : '';
  const piperBinExists = checkBinaryExists(piperBin);
  const piperVoiceExists = !!(piperVoicePath && fs.existsSync(piperVoicePath));
  const piperVoiceJsonPath = piperVoicePath ? `${piperVoicePath}.json` : '';
  const piperVoiceJsonExists = !!(piperVoiceJsonPath && fs.existsSync(piperVoiceJsonPath));
  const piperVoiceLooksValid = piperVoiceExists && /\.onnx$/i.test(piperVoicePath) && piperVoiceJsonExists;
  const piperReady = piperBinExists && piperVoiceLooksValid;
  const warnings = [];

  let activeEngine = configured;
  let recommendation = null;

  if (configured === 'piper' && !piperReady) {
    if (!piperBinExists && !piperVoiceExists) {
      recommendation = 'Download Piper from github.com/rhasspy/piper/releases and the en_US-lessac-medium voice from huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium';
    } else if (!piperVoiceExists) {
      recommendation = 'Set TTS_VOICE_PATH in .env to a downloaded .onnx voice model (recommended: ./tts-models/en_US-lessac-medium.onnx; fallback: ./tts-models/en_US-amy-medium.onnx)';
    } else if (!/\.onnx$/i.test(piperVoicePath)) {
      recommendation = 'TTS_VOICE_PATH exists but does not point to an .onnx Piper voice model.';
    } else if (!piperVoiceJsonExists) {
      recommendation = 'Piper voice metadata is missing. Place the matching .onnx.json file next to the .onnx model.';
    } else {
      recommendation = 'Piper binary not found. Set TTS_BIN to the path of your piper executable.';
    }
    warnings.push(recommendation);
    if (process.platform === 'win32') activeEngine = 'sapi';
    else activeEngine = 'espeak';
  }

  _detectedEngine = {
    configured_engine: configured,
    active_engine: activeEngine,
    piper_configured: piperConfigured,
    piper_ready: piperReady,
    piper_binary: piperBin,
    piper_binary_found: piperBinExists,
    piper_voice_found: !!piperVoiceExists,
    piper_voice_json_found: !!piperVoiceJsonExists,
    piper_voice_valid: !!piperVoiceLooksValid,
    voice_path: env.TTS_VOICE_PATH || '',
    voice_path_resolved: piperVoicePath,
    sentence_pause_ms: env.TTS_PAUSE_MS_SENTENCE,
    section_pause_ms: env.TTS_PAUSE_MS_SECTION,
    recommendation,
    warnings,
  };

  if (recommendation) {
    log.warn(`TTS: ${configured} configured but not ready - falling back to ${activeEngine}. ${recommendation}`);
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
  const dot = '__NOESIS_DOT__';
  const protected_ = String(text || '')
    .replace(/\b(e\.g|i\.e|vs|etc|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|O\.\w)\./gi, (m) => m.replace(/\./g, dot))
    .replace(/(\w)\.(\w)/g, `$1${dot}$2`);
  return protected_
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.replace(new RegExp(dot, 'g'), '.').trim())
    .filter(s => s.length > 0);
}

function clampMs(value, fallback, min = 0, max = 2000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function escapeSsml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeSentences(input) {
  const list = Array.isArray(input) ? input : splitSentences(input);
  return list
    .map(s => String(s || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function pacedPlainText(sentences, opts = {}) {
  const pause = clampMs(opts.pauseMs, env.TTS_PAUSE_MS_SENTENCE || 250);
  const sectionPause = clampMs(opts.sectionPauseMs, env.TTS_PAUSE_MS_SECTION || 600);
  const gap = sectionPause >= pause * 2 ? '\n\n' : '\n';
  return normalizeSentences(sentences).join(gap);
}

function synthPiper(text, outPath) {
  const voicePath = path.resolve(env.ROOT_DIR, env.TTS_VOICE_PATH);
  const binPath = env.TTS_BIN && env.TTS_BIN !== 'piper'
    ? path.resolve(env.ROOT_DIR, env.TTS_BIN)
    : (env.TTS_BIN || 'piper');
  return new Promise((resolve, reject) => {
    const args = ['--model', voicePath, '--output_file', outPath];
    const p = spawn(binPath, args);
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

function synthSapi(text, outPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const tempBase = path.join(
      os.tmpdir(),
      `noesis-tts-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    const textPath = `${tempBase}.txt`;
    const scriptPath = `${tempBase}.ps1`;

    const sentences = normalizeSentences(text);
    const pauseMs = clampMs(opts.pauseMs, env.TTS_PAUSE_MS_SENTENCE || 250);
    const sectionPauseMs = clampMs(opts.sectionPauseMs, env.TTS_PAUSE_MS_SECTION || 600);
    const ssml = sentences.map((s, i) => {
      const escaped = escapeSsml(s);
      if (i === 0) {
        return `<s><emphasis level="moderate">${escaped}</emphasis></s><break time="${pauseMs + 100}ms"/>`;
      }
      if (/\?$/.test(s)) {
        return `<s><prosody pitch="+3%">${escaped}</prosody></s><break time="${pauseMs + 50}ms"/>`;
      }
      if (/^(?:Notice|Important|Remember|Key|Warning|Note that)/i.test(s)) {
        return `<s><prosody rate="-8%" pitch="+2%">${escaped}</prosody></s><break time="${pauseMs}ms"/>`;
      }
      return `<s>${escaped}</s><break time="${pauseMs}ms"/>`;
    }).join('') + `<break time="${sectionPauseMs}ms"/>`;
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
  return s.slice(0, MAX_NARRATION_CHARS - 3) + '...';
}

async function synthesize(text, outPath, opts = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const sentences = normalizeSentences(opts.sentences && opts.sentences.length ? opts.sentences : text);
  const safe = clipNarration(pacedPlainText(sentences.length ? sentences : [text], opts));
  const status = detectTTS();
  const engine = status.active_engine;
  let lastErr = null;

  if (engine === 'silence') {
    return synthSilence(safe, outPath);
  }
  if (engine === 'piper' && status.piper_voice_found) {
    try { return await synthPiper(safe, outPath); } catch (e) { lastErr = e; log.warn('tts_piper_failed', e.message || e); }
  }
  if (engine === 'espeak') {
    try { return await synthEspeak(safe, outPath); } catch (e) { lastErr = e; log.warn('tts_espeak_failed', e.message || e); }
  }
  if (engine === 'say') {
    try { return await synthSay(safe, outPath); } catch (e) { lastErr = e; log.warn('tts_say_failed', e.message || e); }
  }
  if (engine === 'sapi' || process.platform === 'win32') {
    try { return await synthSapi(sentences.length ? sentences : safe, outPath, opts); } catch (e) { lastErr = e; log.warn('tts_sapi_failed', e.message || e); }
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

async function synthesizeSentences(sentences, outPath, opts = {}) {
  const list = normalizeSentences(sentences);
  return synthesize(list.join(' '), outPath, { ...opts, sentences: list });
}

module.exports = {
  synthesize,
  synthesizeSentences,
  detectTTS,
  _internals: { synthSapi, synthSilence, splitSentences, normalizeSentences, pacedPlainText },
};
