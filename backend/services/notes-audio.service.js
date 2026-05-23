'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const tts = require('./tts.service');
const jobs = require('./jobs.service');
const { HttpError } = require('../middleware/error');
const log = require('../utils/logger');

function nowIso() { return new Date().toISOString(); }

function cleanText(value, max = 8000) {
  return String(value || '')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/```[\s\S]*?```/g, (m) => m.slice(0, 900))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function normalizeStyle(value) {
  const style = String(value || 'brief').toLowerCase();
  if (!['brief', 'detailed'].includes(style)) throw new HttpError(400, 'invalid_audio_style');
  return style;
}

function noteHash(note, style, voice, speed) {
  return crypto.createHash('sha1')
    .update([note.id, note.updated_at, note.body_md, note.lesson_json, style, voice, speed].join('\n'))
    .digest('hex')
    .slice(0, 16);
}

function noteTopic(note) {
  const lesson = parseJson(note.lesson_json, null);
  return lesson && lesson.topic || note.title || 'this note';
}

function noteBody(note) {
  const lesson = parseJson(note.lesson_json, null);
  if (lesson && Array.isArray(lesson.sections)) {
    return cleanText(lesson.sections.map(s => `${s.title || s.type || 'Section'}: ${s.content || ''}`).join('\n\n'));
  }
  return cleanText(note.body_md || '');
}

function fallbackScript(note, style) {
  const topic = noteTopic(note);
  const body = noteBody(note);
  const core = body.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, style === 'brief' ? 4 : 8);
  if (style === 'brief') {
    return [
      `Brief explanation of ${topic}.`,
      `The key idea is this: ${core[0] || topic} matters because it gives you a rule you can apply, not just a term to memorize.`,
      `Focus on the main relationship, then test it with one small example from the note.`,
      `Common mistake: reading the note passively instead of asking what changes, what stays protected, and why the rule prevents an error.`,
      `Checkpoint: can you explain ${topic} in one sentence and give one example?`,
    ].join('\n\n');
  }
  return [
    `Detailed walkthrough of ${topic}.`,
    `Start with the definition: ${core[0] || topic}. Put it into your own words before memorizing vocabulary.`,
    `Now trace the mechanism. ${core[1] || 'Identify the moving parts, the rule, and the result after the rule is applied.'}`,
    `Example: choose one tiny case and walk through it step by step. If the note includes code, name the state before each important line, then say what changes after that line runs.`,
    `Common mistake: students often remember the label but skip the invariant or reason behind it. The fix is to ask what would break if the rule were removed.`,
    `Exam tip: define the concept, give the smallest valid example, mention one edge case, and connect it back to the original problem.`,
    `Final checkpoint: explain ${topic}, give one example, and name one mistake to avoid.`,
  ].join('\n\n');
}

function scriptLooksEducational(script, note, style) {
  const text = cleanText(script, 12000);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (style === 'brief' && (words < 70 || words > 360)) return false;
  if (style === 'detailed' && words < 130) return false;
  if (!/(key idea|definition|example|common mistake|checkpoint|exam tip|walkthrough|step)/i.test(text)) return false;
  const rawStart = cleanText(note.body_md || '', 500).slice(0, 220);
  if (rawStart.length >= 160 && text.slice(0, 260).includes(rawStart.slice(0, 140))) return false;
  return true;
}

async function generateScript(note, style) {
  const topic = noteTopic(note);
  const body = noteBody(note);
  const prompt = [
    `Create a ${style} spoken educational explanation for the study note titled "${topic}".`,
    'Do not read the raw note verbatim. Teach it like a tutor.',
    style === 'brief'
      ? 'Brief mode: 1-2 minutes, high-level summary, key ideas only, one checkpoint.'
      : 'Detailed mode: deeper walkthrough, concrete examples, common mistakes, exam tips, and code explanation if code exists.',
    'Use clear spoken paragraphs. Avoid markdown tables.',
    `Note content:\n${body.slice(0, 6000)}`,
  ].join('\n\n');
  const providers = [...new Set([env.NOTES_AUDIO_PROVIDER, env.NOTES_PROVIDER, env.AI_PROVIDER].filter(Boolean))];
  if (env.NODE_ENV !== 'test') {
    for (const provider of providers) {
      try {
        const generated = await ai.generate(prompt, {
          provider,
          feature: 'notes',
          temperature: 0.25,
          max_tokens: style === 'brief' ? 520 : 900,
          num_predict: style === 'brief' ? 520 : 900,
        });
        const script = cleanText(generated && (generated.text || generated.output || generated), 10000);
        if (scriptLooksEducational(script, note, style)) return script;
      } catch (err) {
        log.warn('notes_audio_script_fallback', err.message || err);
      }
    }
  }
  return fallbackScript(note, style);
}

function completedAudioFor(db, userId, noteId, style, voice, speed, hash) {
  return db.prepare(`
    SELECT * FROM note_audio
    WHERE user_id=? AND note_id=? AND style=? AND voice=? AND speed=? AND content_hash=? AND status='completed'
    ORDER BY updated_at DESC
  `).get(userId, noteId, style, voice, speed, hash);
}

async function generateNoteAudio(userId, noteId, opts = {}, jobId = null) {
  const db = getDb();
  const style = normalizeStyle(opts.style);
  const voice = String(opts.voice || 'default').slice(0, 40);
  const speed = String(opts.speed || 'normal').slice(0, 20);
  const note = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(noteId, userId);
  if (!note) throw new HttpError(404, 'note_not_found');
  const hash = noteHash(note, style, voice, speed);
  const cached = !opts.regenerate && completedAudioFor(db, userId, noteId, style, voice, speed, hash);
  if (cached && fs.existsSync(cached.audio_path)) return cached;
  if (opts.regenerate) {
    db.prepare(`
      UPDATE note_audio SET status='superseded', updated_at=?
      WHERE user_id=? AND note_id=? AND style=? AND voice=? AND speed=? AND content_hash=? AND status='completed'
    `).run(nowIso(), userId, noteId, style, voice, speed, hash);
  }

  const audioDir = path.join(env.UPLOAD_DIR, 'audio', 'notes');
  fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `note-${noteId}-${style}-${hash}.wav`);
  const now = nowIso();
  const insert = db.prepare(`
    INSERT INTO note_audio (user_id, note_id, style, voice, speed, script_md, audio_path, status, error, content_hash, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const row = insert.run(userId, noteId, style, voice, speed, '', audioPath, 'running', null, hash, now, now);
  const audioId = row.lastInsertRowid;
  const updateJob = (patch) => { if (jobId) jobs.update(jobId, patch); };

  try {
    updateJob({ status: 'running', progress: 20, message: 'Writing voice explanation script...' });
    const script = await generateScript(note, style);
    if (!scriptLooksEducational(script, note, style)) throw new Error('notes_audio_script_quality_failed');
    db.prepare('UPDATE note_audio SET script_md=?, updated_at=? WHERE id=?').run(script, nowIso(), audioId);
    updateJob({ progress: 60, message: 'Generating speech audio...' });
    await tts.synthesizeSentences(script.split(/\n+/).filter(Boolean), audioPath, { voice, speed });
    const completedAt = nowIso();
    db.prepare('UPDATE note_audio SET status=?, error=NULL, updated_at=? WHERE id=?').run('completed', completedAt, audioId);
    const completed = db.prepare('SELECT * FROM note_audio WHERE id=?').get(audioId);
    updateJob({ status: 'completed', progress: 100, message: 'Note audio ready.', result: publicAudioResult(completed) });
    return completed;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    db.prepare('UPDATE note_audio SET status=?, error=?, updated_at=? WHERE id=?').run('failed', message, nowIso(), audioId);
    updateJob({ status: 'failed', progress: 100, error: message, message: 'Note audio failed.' });
    throw err;
  }
}

function createNoteAudioJob(userId, noteId, opts = {}) {
  const job = jobs.create('note_audio', { userId, noteId, style: normalizeStyle(opts.style) });
  setImmediate(() => {
    generateNoteAudio(userId, noteId, opts, job.id).catch(() => {});
  });
  return job;
}

function latestAudio(userId, noteId, style = 'brief') {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM note_audio
    WHERE user_id=? AND note_id=? AND style=? AND status='completed'
    ORDER BY updated_at DESC
  `).get(userId, noteId, normalizeStyle(style));
}

function publicAudioResult(row) {
  if (!row) return null;
  return {
    audio_id: row.id,
    note_id: row.note_id,
    style: row.style,
    voice: row.voice,
    speed: row.speed,
    status: row.status,
    error: row.error,
    script_md: row.script_md,
    audio_url: `/api/notes/${row.note_id}/audio?style=${encodeURIComponent(row.style)}`,
    updated_at: row.updated_at,
  };
}

module.exports = {
  createNoteAudioJob,
  generateNoteAudio,
  latestAudio,
  publicAudioResult,
  _internals: { fallbackScript, scriptLooksEducational, normalizeStyle },
};
