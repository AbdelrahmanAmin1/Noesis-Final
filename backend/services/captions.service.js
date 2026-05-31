'use strict';

const fs = require('fs');
const path = require('path');
const tts = require('./tts.service');

function timestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':')
    + `.${String(millis).padStart(3, '0')}`;
}

function cleanCueText(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-->/g, '->')
    .trim();
}

function cueDurations(sentences, durationSec) {
  const duration = Math.max(0, Number(durationSec) || 0);
  const weights = sentences.map(sentence => Math.max(1, sentence.split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return weights.map(weight => duration * weight / total);
}

function buildWebVtt(entries = []) {
  const cues = [];
  let offset = 0;
  let cueId = 1;
  for (const entry of entries) {
    const duration = Math.max(0, Number(entry && entry.durationSec) || 0);
    const narration = cleanCueText(entry && entry.narration);
    const sentences = tts._internals.splitSentences(narration).map(cleanCueText).filter(Boolean);
    const durations = cueDurations(sentences, duration);
    let sceneOffset = offset;
    for (let index = 0; index < sentences.length; index += 1) {
      const end = index === sentences.length - 1 ? offset + duration : sceneOffset + durations[index];
      if (end > sceneOffset) {
        cues.push(`${cueId}\n${timestamp(sceneOffset)} --> ${timestamp(end)}\n${sentences[index]}`);
        cueId += 1;
      }
      sceneOffset = end;
    }
    offset += duration;
  }
  return `WEBVTT\n\n${cues.join('\n\n')}${cues.length ? '\n' : ''}`;
}

function writeWebVtt(entries, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buildWebVtt(entries), 'utf8');
  return outPath;
}

module.exports = { buildWebVtt, writeWebVtt, _internals: { cleanCueText, cueDurations, timestamp } };
