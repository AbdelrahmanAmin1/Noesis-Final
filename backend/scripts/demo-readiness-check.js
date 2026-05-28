#!/usr/bin/env node
'use strict';

const http = require('http');
const env = require('../config/env');

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function healthUrl() {
  return `http://localhost:${env.PORT}/api/health`;
}

function getJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(body) });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `Invalid JSON response: ${err.message}` });
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });
    req.on('error', err => resolve({ ok: false, status: null, error: err.message }));
  });
}

function printLocalConfig() {
  console.log('Noesis demo readiness check');
  console.log('');
  console.log('Local configuration');
  console.log(`- Port: ${env.PORT}`);
  console.log(`- Demo mode: ${yesNo(env.NOESIS_DEMO_MODE)}`);
  console.log(`- AI provider: ${env.AI_PROVIDER}`);
  console.log(`- Notes provider: ${env.NOTES_PROVIDER}`);
  console.log(`- Video script provider: ${env.VIDEO_SCRIPT_PROVIDER}`);
  console.log(`- Tutor provider: ${env.TUTOR_PROVIDER}`);
  console.log(`- Tutor fallback provider: ${env.TUTOR_FALLBACK_PROVIDER}`);
  console.log(`- Groq configured: ${yesNo(!!env.GROQ_API_KEY)}`);
  console.log(`- TTS engine: ${env.TTS_ENGINE}`);
  console.log(`- Video renderer: ${env.VIDEO_RENDERER}`);
  console.log(`- OCR enabled: ${yesNo(env.OCR_ENABLED)}`);
  console.log(`- OCR provider: ${env.OCR_PROVIDER}`);
  console.log('');
}

function printHealth(result) {
  console.log(`Health endpoint: ${healthUrl()}`);
  if (!result.ok) {
    console.log(`- Status: unavailable${result.status ? ` (${result.status})` : ''}`);
    console.log(`- Detail: ${result.error || 'Backend did not return a successful health response.'}`);
    console.log('- Action: start the backend with `cd backend && npm start`, then rerun this check.');
    return;
  }

  const data = result.data || {};
  const demo = data.demo || {};
  const ai = data.ai || {};
  const generation = ai.generation || {};
  const renderer = data.renderer || {};
  const tts = data.tts || {};
  const hasOcrStatus = Object.prototype.hasOwnProperty.call(data, 'ocr');
  const ocr = data.ocr || {};

  console.log('- Status: reachable');
  console.log(`- Overall ok: ${yesNo(data.ok)}`);
  console.log(`- Generation ok: ${yesNo(generation.ok)}`);
  console.log(`- Generation provider: ${ai.provider || data.provider || 'unknown'}`);
  console.log(`- Renderer ok: ${yesNo(renderer.ok)}`);
  console.log(`- OCR available: ${hasOcrStatus ? yesNo(!ocr.provider || ocr.available) : 'unknown (restart backend to expose OCR status)'}`);
  console.log(`- Active TTS engine: ${tts.active_engine || tts.engine || 'unknown'}`);
  console.log(`- Demo ok: ${yesNo(demo.ok)}`);

  const warnings = [];
  if (!generation.ok) warnings.push('AI generation is not ready. Check Ollama/Groq configuration.');
  if (demo.enabled && !demo.tutorGroqReady) warnings.push('Tutor is set to Groq but cloud generation is not configured.');
  if (demo.enabled && demo.groqReady === false) warnings.push('Strict demo health expects Groq for notes/video; core local flows may still work.');
  if (demo.enabled && demo.piperReady === false) warnings.push('Strict demo health expects Piper TTS; text-only and SAPI/espeak flows may still be usable.');
  if (renderer.ok === false) warnings.push('Video renderer is not ready; use storyboard review as the live fallback.');
  if (!hasOcrStatus) warnings.push('Health endpoint did not report OCR status. Restart the backend so the readiness check can use the current OCR health code.');
  if (env.OCR_ENABLED && hasOcrStatus && ocr.available === false) warnings.push('OCR is enabled but the selected local OCR provider is unavailable. Upload ingestion will fall back to normal extraction when possible.');

  if (warnings.length) {
    console.log('');
    console.log('Warnings');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

async function main() {
  printLocalConfig();
  const result = await getJson(healthUrl());
  printHealth(result);
  console.log('');
  console.log('Demo docs');
  console.log('- docs/noesis-demo-readiness.md');
  console.log('- docs/noesis-demo-script.md');
  console.log('- demo-materials/oop-encapsulation-demo.md');
  console.log('- demo-materials/linked-list-demo.md');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  healthUrl,
  getJson,
};
