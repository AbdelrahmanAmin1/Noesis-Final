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

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg_${code}: ${stderr.slice(-400)}`));
    });
  });
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
    jobs.update(jobId, { status: 'running', progress: 5 });

    // 1. RAG + script
    const chunks = await retrieve(materialId, concept, 6);
    const prompt = prompts.VIDEO_SCRIPT(concept, chunks);
    const raw = await ai.generate(prompt, { format: 'json', temperature: 0.5 });
    const script = await parseJsonSafe(raw, ScriptSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    setStatus('processing', { script_md: JSON.stringify(script) });
    jobs.update(jobId, { progress: 25 });

    // 2. Per-slide audio + slide image
    const workDir = path.join(env.UPLOAD_DIR, 'videos', String(videoId));
    fs.mkdirSync(workDir, { recursive: true });
    const segPaths = [];

    for (let i = 0; i < script.slides.length; i++) {
      const s = script.slides[i];
      const slideImg = path.join(workDir, `slide_${i}.png`);
      const audioFile = path.join(workDir, `audio_${i}.wav`);
      const segMp4 = path.join(workDir, `seg_${i}.mp4`);

      const renderedPath = await slides.renderSlide(s, slideImg);
      // If the renderer fell back to SVG, convert via ffmpeg
      let imgForFfmpeg = renderedPath;
      if (renderedPath.endsWith('.svg')) {
        // ffmpeg might not handle SVG without librsvg; emit a colored placeholder PNG via ffmpeg lavfi
        const placeholder = path.join(workDir, `slide_${i}_ph.png`);
        await ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=0x08081a:s=1280x720`, '-frames:v', '1', placeholder]);
        imgForFfmpeg = placeholder;
      }
      await tts.synthesize(s.narration, audioFile);
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
    fs.writeFileSync(listFile, segPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const finalPath = path.join(env.UPLOAD_DIR, 'videos', `${videoId}.mp4`);
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath]);

    setStatus('ready', { output_path: finalPath, slides_dir: workDir });
    jobs.update(jobId, { status: 'completed', progress: 100, result: { videoId, output_path: finalPath } });
  } catch (e) {
    log.error('video_pipeline', e.message || e);
    setStatus('failed');
    jobs.update(jobId, { status: 'failed', error: String(e.message || e) });
  }
}

function getVideo(userId, id) {
  const db = getDb();
  return db.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').get(id, userId);
}

module.exports = { generateVideo, getVideo };
