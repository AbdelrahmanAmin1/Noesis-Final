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
    visual_type: z.enum(['mindmap', 'flow', 'comparison', 'code', 'summary']).optional().default('mindmap'),
    bullets: z.array(z.string()).min(1).max(8),
    visual_nodes: z.array(z.string()).optional().default([]),
    visual_edges: z.array(z.tuple([z.string(), z.string()])).optional().default([]),
    callouts: z.array(z.string()).optional().default([]),
    example_code: z.string().optional().default(''),
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

function cleanTextList(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source
    .map(v => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function compactText(text, max = 64) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function drawLabeledBox(filters, text, x, y, w, h, fill, stroke = '0x64748b@0.75') {
  filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${fill}:t=fill`);
  filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${stroke}:t=2`);
  wrapWords(compactText(text, 56), Math.max(12, Math.floor(w / 18)), 2)
    .forEach((line, i) => filters.push(drawText(line, x + 16, y + 28 + i * 26, 22, '0x0f172a')));
}

async function renderSlideFrameWithFfmpeg(slide, outPath, idx, total) {
  const visualType = ['mindmap', 'flow', 'comparison', 'code', 'summary'].includes(slide.visual_type)
    ? slide.visual_type
    : (idx === total - 1 ? 'summary' : 'mindmap');
  const bullets = cleanTextList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).slice(0, 5);
  const nodes = cleanTextList(slide.visual_nodes, [slide.title, ...bullets]).slice(0, 7);
  const callouts = cleanTextList(slide.callouts, bullets.slice(0, 2)).slice(0, 3);
  const filters = [
    'drawbox=x=0:y=0:w=iw:h=ih:color=0xf8fafc@1:t=fill',
    'drawbox=x=0:y=0:w=iw:h=96:color=0x0f172a@1:t=fill',
    'drawbox=x=64:y=134:w=408:h=506:color=0xffffff@1:t=fill',
    'drawbox=x=64:y=134:w=408:h=506:color=0xcbd5e1@1:t=2',
    'drawbox=x=506:y=134:w=710:h=506:color=0xffffff@1:t=fill',
    'drawbox=x=506:y=134:w=710:h=506:color=0xcbd5e1@1:t=2',
    drawText('NOESIS TUTOR WHITEBOARD', 64, 34, 22, '0xbfdbfe'),
    drawText(`SLIDE ${idx + 1} / ${total}`, 1080, 34, 20, '0xcbd5e1'),
    drawText(visualType.toUpperCase(), 92, 158, 18, '0x2563eb'),
  ];

  wrapWords(slide.title || 'Tutor explanation', 42, 1)
    .forEach((line, i) => filters.push(drawText(line, 64, 66 + i * 34, 30, '0xffffff')));

  let y = 212;
  for (const bullet of bullets) {
    const lines = wrapWords(bullet, 52, 2);
    lines.forEach((line, lineIdx) => {
      filters.push(drawText(`${lineIdx === 0 ? '- ' : '  '}${line}`, 92, y, 23, '0x1e293b'));
      y += 30;
    });
    y += 14;
  }

  const rightX = 536;
  const rightY = 172;
  if (visualType === 'flow') {
    const steps = nodes.slice(0, 4);
    steps.forEach((node, i) => {
      const x = rightX + i * 164;
      drawLabeledBox(filters, node, x, 276, 140, 92, ['0xdbeafe@1', '0xdcfce7@1', '0xfef3c7@1', '0xfce7f3@1'][i % 4]);
      if (i < steps.length - 1) filters.push(drawText('->', x + 146, 322, 28, '0x334155'));
    });
  } else if (visualType === 'comparison') {
    const left = nodes[0] || 'Concept A';
    const right = nodes[1] || 'Concept B';
    drawLabeledBox(filters, left, rightX + 24, 214, 284, 66, '0xdbeafe@1');
    drawLabeledBox(filters, right, rightX + 360, 214, 284, 66, '0xdcfce7@1');
    bullets.slice(0, 4).forEach((bullet, i) => {
      const x = i % 2 === 0 ? rightX + 42 : rightX + 378;
      const yy = 326 + Math.floor(i / 2) * 104;
      drawLabeledBox(filters, bullet, x, yy, 248, 74, i % 2 === 0 ? '0xeff6ff@1' : '0xf0fdf4@1');
    });
  } else if (visualType === 'code') {
    const codeLines = String(slide.example_code || bullets.join('\n'))
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 7);
    filters.push('drawbox=x=560:y=210:w=418:h=318:color=0x111827@1:t=fill');
    filters.push('drawbox=x=560:y=210:w=418:h=318:color=0x38bdf8@1:t=2');
    codeLines.forEach((line, i) => filters.push(drawText(compactText(line, 42), 584, 246 + i * 34, 22, '0xe0f2fe')));
    callouts.slice(0, 3).forEach((callout, i) => drawLabeledBox(filters, callout, 1004, 218 + i * 104, 174, 74, '0xfef9c3@1'));
  } else {
    const center = nodes[0] || slide.title || 'Core concept';
    drawLabeledBox(filters, center, rightX + 236, 284, 224, 98, '0xdbeafe@1', '0x2563eb@1');
    const around = nodes.slice(1, 7);
    const positions = [
      [rightX + 42, 204], [rightX + 474, 204],
      [rightX + 42, 422], [rightX + 474, 422],
      [rightX + 242, 174], [rightX + 242, 502],
    ];
    around.forEach((node, i) => {
      const [x, yy] = positions[i];
      filters.push(`drawbox=x=${Math.min(x + 126, rightX + 348)}:y=${Math.min(yy + 38, 330)}:w=2:h=86:color=0x94a3b8@0.55:t=fill`);
      drawLabeledBox(filters, node, x, yy, 184, 76, ['0xdcfce7@1', '0xfef3c7@1', '0xfce7f3@1'][i % 3]);
    });
  }

  let calloutY = 558;
  for (const callout of callouts.slice(0, visualType === 'code' ? 1 : 2)) {
    drawLabeledBox(filters, callout, 92, calloutY, 352, 54, '0xfef9c3@1', '0xf59e0b@1');
    calloutY += 64;
  }

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
      visual_type: 'mindmap',
      bullets: ['Source-grounded explanation', 'Key definitions and relationships', 'Practice-ready summary'],
      visual_nodes: [concept || 'Selected concept', 'Definitions', 'Relationships', 'Examples', 'Summary'],
      visual_edges: [[concept || 'Selected concept', 'Definitions'], [concept || 'Selected concept', 'Relationships'], [concept || 'Selected concept', 'Examples']],
      callouts: ['Start with the source vocabulary.', 'Connect each term to an operation or example.'],
      example_code: '',
      narration: `This tutor video explains ${concept || 'the selected concept'} using the uploaded material. We will focus on the source content, pull out the main definitions, connect the ideas, and finish with an exam-ready summary.`,
    },
    {
      title: 'Core idea',
      visual_type: 'flow',
      bullets: (pick(0, 4).length ? pick(0, 4) : ['The source material does not include enough detail for this section.']).map(concise),
      visual_nodes: ['Identify', 'Connect', 'Apply', 'Check'],
      visual_edges: [['Identify', 'Connect'], ['Connect', 'Apply'], ['Apply', 'Check']],
      callouts: ['Follow the idea one step at a time.'],
      example_code: '',
      narration: (pick(0, 3).join(' ') || 'The uploaded material has limited extractable detail, so this section summarizes only what could be read from the file.'),
    },
    {
      title: code.length ? 'Example from source' : 'How to reason about it',
      visual_type: code.length ? 'code' : 'comparison',
      bullets: (code.length ? code : pick(4, 4).length ? pick(4, 4) : ['Identify the data structure or OOP concept.', 'Ask what operations are supported.', 'Compare costs and trade-offs.']).map(concise),
      visual_nodes: code.length ? ['Example', 'Input', 'Operation', 'Result'] : ['Use when', 'Avoid when', 'Costs', 'Trade-offs'],
      visual_edges: code.length ? [['Input', 'Operation'], ['Operation', 'Result']] : [['Use when', 'Trade-offs'], ['Avoid when', 'Costs']],
      callouts: code.length ? ['Read the example by naming each role.'] : ['Compare behavior before memorizing syntax.'],
      example_code: code.join('\n'),
      narration: (code.length
        ? `The source includes an implementation example. Read the code by identifying the object, method, or data operation first, then connect each line to the concept being explained.`
        : (pick(4, 3).join(' ') || 'Reason about this concept by naming the abstraction, listing its operations, and checking the time and space trade-offs.')),
    },
    {
      title: 'Summary',
      visual_type: 'summary',
      bullets: (pick(8, 4).length ? pick(8, 4) : ['Name the concept precisely.', 'Explain the key operation.', 'State the complexity or design trade-off.', 'Avoid common misconceptions.']).map(concise),
      visual_nodes: [concept || 'Concept', 'Definition', 'Operation', 'Complexity', 'Pitfalls'],
      visual_edges: [[concept || 'Concept', 'Definition'], [concept || 'Concept', 'Operation'], [concept || 'Concept', 'Complexity'], [concept || 'Concept', 'Pitfalls']],
      callouts: ['Review by drawing the relationships yourself.'],
      example_code: '',
      narration: (pick(8, 3).join(' ') || `To review ${concept || 'this topic'}, state the definition, describe where it applies, and connect it to OOP or Data Structures vocabulary such as encapsulation, arrays, stacks, queues, trees, graphs, hashing, sorting, searching, and Big-O when relevant.`),
    },
  ];
  return { slides: base };
}

function normalizeScript(script, concept, chunks) {
  const fallback = fallbackVideoScript(concept, chunks);
  const src = script && Array.isArray(script.slides) && script.slides.length >= 2 ? script : fallback;
  const typeByIndex = ['mindmap', 'flow', 'comparison', 'code', 'summary'];
  const slidesOut = src.slides.slice(0, 8).map((s, i) => ({
    title: String(s.title || (i === 0 ? concept : `Part ${i + 1}`)).slice(0, 90),
    visual_type: ['mindmap', 'flow', 'comparison', 'code', 'summary'].includes(s.visual_type)
      ? s.visual_type
      : (i === src.slides.length - 1 ? 'summary' : typeByIndex[i % typeByIndex.length]),
    bullets: (Array.isArray(s.bullets) && s.bullets.length ? s.bullets : fallback.slides[Math.min(i, fallback.slides.length - 1)].bullets)
      .map(b => String(b || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6),
    visual_nodes: cleanTextList(s.visual_nodes, [s.title || concept, ...(s.bullets || [])]).slice(0, 8),
    visual_edges: (Array.isArray(s.visual_edges) ? s.visual_edges : [])
      .filter(edge => Array.isArray(edge) && edge.length >= 2)
      .map(edge => [String(edge[0] || '').trim(), String(edge[1] || '').trim()])
      .filter(edge => edge[0] && edge[1])
      .slice(0, 10),
    callouts: cleanTextList(s.callouts, []).slice(0, 4),
    example_code: String(s.example_code || '').slice(0, 1000),
    narration: String(s.narration || fallback.slides[Math.min(i, fallback.slides.length - 1)].narration || '').replace(/\s+/g, ' ').trim(),
  })).filter(s => s.title && s.bullets.length && s.narration);
  return { slides: slidesOut.length >= 2 ? slidesOut : fallback.slides };
}

async function generateVideo({ userId, materialId, concept }) {
  await ai.assertModelsAvailable({ generation: true, embedding: true });
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
      const raw = await ai.generate(prompt, { format: 'json', temperature: 0.45, num_ctx: 3072, num_predict: 1100 });
      script = await parseJsonSafe(raw, ScriptSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0, num_predict: 700 }));
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
