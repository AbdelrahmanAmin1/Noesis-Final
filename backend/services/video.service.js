'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { z } = require('zod');
const env = require('../config/env');
const { getDb } = require('../config/db');
const ai = require('./ai.service');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const { retrieve } = require('./rag.service');
const tts = require('./tts.service');
const slides = require('./slides.service');
const jobs = require('./jobs.service');
const log = require('../utils/logger');
const {
  resolveBinary,
  spawnMissingMessage,
  concatListPath,
  FFMPEG_PACKAGE,
  FFPROBE_PACKAGE,
} = require('../utils/mediaBinaries');

const ScriptSchema = z.object({
  slides: z.array(z.object({
    title: z.string().min(1),
    bullets: z.array(z.string()).min(1).max(8),
    narration: z.string().min(1),
  })).min(2).max(8),
});

const _queue = [];
let _busy = false;

function enqueue(task) {
  _queue.push(task);
  setImmediate(drain);
}

async function drain() {
  if (_busy) return;
  const task = _queue.shift();
  if (!task) return;
  _busy = true;
  try { await task(); }
  catch (e) { log.error('video_task_error', e.message || e); }
  finally { _busy = false; setImmediate(drain); }
}

function nowIso() { return new Date().toISOString(); }

const FFMPEG_BIN = resolveBinary(env.FFMPEG_PATH, 'ffmpeg', FFMPEG_PACKAGE);
const FFPROBE_BIN = resolveBinary(env.FFPROBE_PATH, 'ffprobe', FFPROBE_PACKAGE);

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', (err) => {
      if (err && err.code === 'ENOENT') reject(new Error(spawnMissingMessage('ffmpeg', FFMPEG_BIN, err)));
      else reject(err);
    });
    p.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg_${code}: ${stderr.slice(-400)}`));
    });
  });
}

function ffprobe(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', (err) => {
      if (err && err.code === 'ENOENT') reject(new Error(spawnMissingMessage('ffprobe', FFPROBE_BIN, err)));
      else reject(err);
    });
    p.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe_${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function probeMedia(filePath) {
  const raw = await ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath]);
  return JSON.parse(raw || '{}');
}

function assertAudioFile(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1024) {
    throw new Error('tts_empty_audio: narration audio was not created');
  }
}

function hasStream(info, type) {
  return !!(info && Array.isArray(info.streams) && info.streams.some(s => s.codec_type === type));
}

function mediaDuration(info) {
  const n = info && info.format ? parseFloat(info.format.duration) : NaN;
  return Number.isFinite(n) ? n : null;
}

function escapeDrawText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function wrapWords(text, maxChars, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawText(text, x, y, size, color = '0xfafaff') {
  return `drawtext=text='${escapeDrawText(text)}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
}

async function renderSlideFrameWithFfmpeg(slide, outPath, idx, total) {
  const filters = [
    'drawbox=x=0:y=0:w=iw:h=ih:color=0x08081a@1:t=fill',
    'drawbox=x=760:y=0:w=520:h=720:color=0x172554@0.28:t=fill',
    'drawbox=x=58:y=48:w=1164:h=624:color=0x111126@0.78:t=fill',
    'drawbox=x=58:y=48:w=6:h=624:color=0xa5b4fc@0.95:t=fill',
    drawText('NOESIS AI TUTOR', 92, 78, 22, '0xa5b4fc'),
    drawText(`SLIDE ${idx + 1} / ${total}`, 1040, 78, 20, '0x9ca3af'),
  ];

  wrapWords(slide.title || 'Tutor explanation', 34, 2)
    .forEach((line, i) => filters.push(drawText(line, 92, 128 + i * 62, 52, '0xfafaff')));

  let y = 292;
  const bullets = (slide.bullets || []).slice(0, 6);
  for (const bullet of bullets) {
    const lines = wrapWords(bullet, 52, 2);
    lines.forEach((line, lineIdx) => {
      filters.push(drawText(`${lineIdx === 0 ? '- ' : '  '}${line}`, 112, y, 30, '0xe8e6f5'));
      y += 38;
    });
    y += 18;
  }
  filters.push('drawbox=x=92:y=636:w=140:h=3:color=0xc99afc@0.95:t=fill');
  filters.push(drawText('Based on your uploaded material', 260, 624, 20, '0x9ca3af'));

  await ffmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x08081a:s=1280x720:d=1',
    '-vf', filters.join(','),
    '-frames:v', '1',
    outPath,
  ]);
  return outPath;
}

function fallbackVideoScript(concept, chunks) {
  const source = chunks.map(c => c.text || '').join('\n\n');
  const sentences = source
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 25 && s.length <= 220)
    .slice(0, 12);
  const code = (source.match(/```[\s\S]*?```/) || [''])[0]
    .replace(/```[a-z]*\n?/i, '')
    .replace(/```$/, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const pick = (start, count) => sentences.slice(start, start + count);
  const concise = (s) => s.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').slice(0, 92);
  const base = [
    {
      title: concept || 'Tutor explanation',
      bullets: ['Source-grounded explanation', 'Key definitions and relationships', 'Practice-ready summary'],
      narration: `This tutor video explains ${concept || 'the selected concept'} using the uploaded material. We will focus on the source content, pull out the main definitions, connect the ideas, and finish with an exam-ready summary.`,
    },
    {
      title: 'Core idea',
      bullets: (pick(0, 4).length ? pick(0, 4) : ['The source material does not include enough detail for this section.']).map(concise),
      narration: (pick(0, 3).join(' ') || 'The uploaded material has limited extractable detail, so this section summarizes only what could be read from the file.'),
    },
    {
      title: code.length ? 'Example from source' : 'How to reason about it',
      bullets: (code.length ? code : pick(4, 4).length ? pick(4, 4) : ['Identify the data structure or OOP concept.', 'Ask what operations are supported.', 'Compare costs and trade-offs.']).map(concise),
      narration: (code.length
        ? `The source includes an implementation example. Read the code by identifying the object, method, or data operation first, then connect each line to the concept being explained.`
        : (pick(4, 3).join(' ') || 'Reason about this concept by naming the abstraction, listing its operations, and checking the time and space trade-offs.')),
    },
    {
      title: 'Summary',
      bullets: (pick(8, 4).length ? pick(8, 4) : ['Name the concept precisely.', 'Explain the key operation.', 'State the complexity or design trade-off.', 'Avoid common misconceptions.']).map(concise),
      narration: (pick(8, 3).join(' ') || `To review ${concept || 'this topic'}, state the definition, describe where it applies, and connect it to OOP or Data Structures vocabulary such as encapsulation, arrays, stacks, queues, trees, graphs, hashing, sorting, searching, and Big-O when relevant.`),
    },
  ];
  return { slides: base };
}

function normalizeScript(script, concept, chunks) {
  const fallback = fallbackVideoScript(concept, chunks);
  const src = script && Array.isArray(script.slides) && script.slides.length >= 2 ? script : fallback;
  const slidesOut = src.slides.slice(0, 8).map((s, i) => ({
    title: String(s.title || (i === 0 ? concept : `Part ${i + 1}`)).slice(0, 90),
    bullets: (Array.isArray(s.bullets) && s.bullets.length ? s.bullets : fallback.slides[Math.min(i, fallback.slides.length - 1)].bullets)
      .map(b => String(b || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6),
    narration: String(s.narration || fallback.slides[Math.min(i, fallback.slides.length - 1)].narration || '').replace(/\s+/g, ' ').trim(),
  })).filter(s => s.title && s.bullets.length && s.narration);
  return { slides: slidesOut.length >= 2 ? slidesOut : fallback.slides };
}

async function generateVideo({ userId, materialId, concept }) {
  const db = getDb();
  const ins = db.prepare(`INSERT INTO videos (material_id, user_id, status, created_at) VALUES (?,?,?,?)`);
  const r = ins.run(materialId, userId, 'queued', nowIso());
  const videoId = r.lastInsertRowid;
  const job = jobs.create('video', { userId, videoId });
  enqueue(() => runPipeline({ videoId, userId, materialId, concept, jobId: job.id }));
  return { videoId, jobId: job.id };
}

async function runPipeline({ videoId, userId, materialId, concept, jobId }) {
  const db = getDb();
  const setStatus = (s, extra = {}) => {
    const fields = ['status=?'];
    const params = [s];
    for (const [k, v] of Object.entries(extra)) { fields.push(`${k}=?`); params.push(v); }
    params.push(videoId);
    db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id=?`).run(...params);
  };
  try {
    setStatus('processing');
    jobs.update(jobId, { status: 'running', progress: 5, stage: 'Retrieving source content...' });

    // 1. RAG + script
    const chunks = await retrieve(materialId, concept, 6);
    jobs.update(jobId, { progress: 12, stage: 'Writing tutor script...' });
    let script;
    try {
      const prompt = prompts.VIDEO_SCRIPT(concept, chunks);
      const raw = await ai.generate(prompt, { format: 'json', temperature: 0.5 });
      script = await parseJsonSafe(raw, ScriptSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    } catch (e) {
      log.warn('video_script_fallback', e.message || e);
      script = fallbackVideoScript(concept, chunks);
    }
    script = normalizeScript(script, concept, chunks);
    setStatus('processing', { script_md: JSON.stringify(script) });
    jobs.update(jobId, { progress: 25, stage: 'Creating narration...' });

    // 2. Per-slide audio + slide image
    const workDir = path.join(env.UPLOAD_DIR, 'videos', String(videoId));
    fs.mkdirSync(workDir, { recursive: true });
    const segPaths = [];
    const audioPaths = [];

    for (let i = 0; i < script.slides.length; i++) {
      const s = script.slides[i];
      const slideImg = path.join(workDir, `slide_${i}.png`);
      const audioFile = path.join(workDir, `audio_${i}.wav`);
      const segMp4 = path.join(workDir, `seg_${i}.mp4`);

      const renderedPath = await slides.renderSlide(s, slideImg);
      // If native canvas is unavailable, create a readable slide frame with FFmpeg drawtext.
      let imgForFfmpeg = renderedPath;
      if (renderedPath.endsWith('.svg')) {
        imgForFfmpeg = await renderSlideFrameWithFfmpeg(s, path.join(workDir, `slide_${i}_frame.png`), i, script.slides.length);
      }
      await tts.synthesize(s.narration, audioFile);
      assertAudioFile(audioFile);
      audioPaths.push(audioFile);
      jobs.update(jobId, { stage: `Rendering slide ${i + 1} of ${script.slides.length}...` });
      // Combine slide+audio -> segment mp4 (duration = audio length)
      await ffmpeg([
        '-y',
        '-loop', '1', '-i', imgForFfmpeg,
        '-i', audioFile,
        '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k',
        '-shortest', '-r', '30',
        segMp4,
      ]);
      segPaths.push(segMp4);
      jobs.update(jobId, { progress: 25 + Math.floor(((i + 1) / script.slides.length) * 60) });
    }

    // 3. Concat segments
    const listFile = path.join(workDir, 'segments.txt');
    fs.writeFileSync(listFile, segPaths.map(p => `file '${concatListPath(p)}'`).join('\n'));
    const audioManifest = path.join(workDir, 'audio_manifest.json');
    fs.writeFileSync(audioManifest, JSON.stringify({ audio: audioPaths }, null, 2));
    const finalPath = path.join(env.UPLOAD_DIR, 'videos', `${videoId}.mp4`);
    jobs.update(jobId, { progress: 90, stage: 'Merging narration and visuals...' });
    await ffmpeg([
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      finalPath,
    ]);

    const mediaInfo = await probeMedia(finalPath);
    if (!hasStream(mediaInfo, 'video')) throw new Error('video_render_failed: no video stream in output');
    if (!hasStream(mediaInfo, 'audio')) throw new Error('video_render_failed: no audio stream in output');
    const duration = mediaDuration(mediaInfo);

    setStatus('ready', { output_path: finalPath, slides_dir: workDir, audio_path: audioManifest, duration_s: duration });
    jobs.update(jobId, { status: 'completed', progress: 100, stage: 'Video ready.', result: { videoId, output_path: finalPath, duration_s: duration } });
  } catch (e) {
    log.error('video_pipeline', e.message || e);
    setStatus('failed');
    jobs.update(jobId, { status: 'failed', error: String(e.message || e), stage: 'Video generation failed.' });
  }
}

function getVideo(userId, id) {
  const db = getDb();
  return db.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').get(id, userId);
}

module.exports = { generateVideo, getVideo };
module.exports._internals = { FFMPEG_BIN, FFPROBE_BIN, ffmpeg, ffprobe, probeMedia, renderSlideFrameWithFfmpeg };
