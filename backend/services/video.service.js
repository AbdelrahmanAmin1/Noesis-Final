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

const VISUAL_TYPES = ['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'bigo_chart'];

const ScriptSchema = z.object({
  slides: z.array(z.object({
    title: z.string().min(1),
    visual_type: z.enum(VISUAL_TYPES).optional().default('mindmap'),
    bullets: z.array(z.string()).min(1).max(8),
    visual_nodes: z.array(z.string()).optional().default([]),
    visual_edges: z.array(z.tuple([z.string(), z.string()])).optional().default([]),
    callouts: z.array(z.string()).optional().default([]),
    example_code: z.string().optional().default(''),
    narration: z.string().min(1),
  })).min(2).max(12),
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
  const visualType = VISUAL_TYPES.includes(slide.visual_type)
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
  } else if (visualType === 'class_diagram') {
    const classes = nodes.slice(0, 4);
    const boxW = 200, boxH = 80;
    classes.forEach((cls, i) => {
      const x = rightX + (i % 2) * 240 + 60;
      const yy = rightY + 50 + Math.floor(i / 2) * 150;
      drawLabeledBox(filters, cls, x, yy, boxW, boxH, i === 0 ? '0xdbeafe@1' : '0xdcfce7@1', '0x2563eb@1');
      if (i > 0) {
        const parentX = rightX + 60 + boxW / 2;
        const parentY = rightY + 50 + boxH;
        filters.push(`drawbox=x=${parentX}:y=${parentY}:w=2:h=${yy - parentY}:color=0x2563eb@0.6:t=fill`);
      }
    });
  } else if (visualType === 'tree') {
    const treeNodes = nodes.slice(0, 7);
    const levels = [[0], [1, 2], [3, 4, 5, 6]];
    levels.forEach((idxList, level) => {
      const levelW = 640;
      const spacing = levelW / (idxList.length + 1);
      idxList.forEach((ni, pos) => {
        if (ni >= treeNodes.length) return;
        const x = rightX + spacing * (pos + 1) - 45;
        const yy = rightY + 50 + level * 120;
        drawLabeledBox(filters, treeNodes[ni], x, yy, 90, 50, '0xdbeafe@1', '0x2563eb@1');
        if (level > 0) {
          const parentIdx = levels[level - 1][Math.floor(pos / 2)];
          if (parentIdx < treeNodes.length) {
            const parentSpacing = levelW / (levels[level - 1].length + 1);
            const px = rightX + parentSpacing * (Math.floor(pos / 2) + 1);
            filters.push(`drawbox=x=${px}:y=${rightY + 50 + (level - 1) * 120 + 50}:w=2:h=70:color=0x64748b@0.5:t=fill`);
          }
        }
      });
    });
  } else if (visualType === 'stack_queue') {
    const elements = nodes.slice(0, 6);
    const isStack = (slide.title || '').toLowerCase().includes('stack');
    if (isStack) {
      elements.forEach((el, i) => {
        const yy = rightY + 360 - i * 56;
        drawLabeledBox(filters, el, rightX + 200, yy, 240, 48, ['0xdbeafe@1', '0xdcfce7@1', '0xfef3c7@1'][i % 3]);
      });
      filters.push(drawText('TOP ->', rightX + 120, rightY + 360 - (elements.length - 1) * 56 + 12, 20, '0xef4444'));
      filters.push(drawText('push() / pop()', rightX + 200, rightY + 400, 18, '0x64748b'));
    } else {
      elements.forEach((el, i) => {
        const x = rightX + 40 + i * 105;
        drawLabeledBox(filters, el, x, rightY + 180, 96, 60, ['0xdbeafe@1', '0xdcfce7@1', '0xfef3c7@1'][i % 3]);
        if (i < elements.length - 1) filters.push(drawText('->', x + 100, rightY + 204, 22, '0x334155'));
      });
      filters.push(drawText('FRONT', rightX + 40, rightY + 252, 16, '0xef4444'));
      filters.push(drawText('REAR', rightX + 40 + (elements.length - 1) * 105, rightY + 252, 16, '0x2563eb'));
      filters.push(drawText('enqueue() / dequeue()', rightX + 180, rightY + 290, 18, '0x64748b'));
    }
  } else if (visualType === 'linkedlist') {
    const listNodes = nodes.slice(0, 6);
    listNodes.forEach((el, i) => {
      const x = rightX + 20 + i * 115;
      drawLabeledBox(filters, el, x, rightY + 200, 100, 56, '0xdbeafe@1', '0x2563eb@1');
      if (i < listNodes.length - 1) {
        filters.push(drawText('->', x + 106, rightY + 220, 24, '0x334155'));
      }
    });
    filters.push(drawText('HEAD', rightX + 20, rightY + 268, 16, '0x16a34a'));
    if (listNodes.length > 1) filters.push(drawText('NULL', rightX + 20 + listNodes.length * 115 - 10, rightY + 220, 16, '0xef4444'));
  } else if (visualType === 'bigo_chart') {
    filters.push('drawbox=x=560:y=180:w=600:h=380:color=0xffffff@1:t=fill');
    filters.push('drawbox=x=600:y=200:w=520:h=320:color=0xf1f5f9@1:t=fill');
    filters.push(drawText('n ->', 850, 530, 18, '0x64748b'));
    filters.push(drawText('time', 580, 190, 18, '0x64748b'));
    const curves = [
      { label: 'O(1)', color: '0x16a34a', points: [[620, 480], [900, 480], [1100, 480]] },
      { label: 'O(log n)', color: '0x2563eb', points: [[620, 480], [800, 420], [1100, 380]] },
      { label: 'O(n)', color: '0xeab308', points: [[620, 480], [800, 380], [1100, 260]] },
      { label: 'O(n^2)', color: '0xef4444', points: [[620, 480], [760, 420], [1100, 210]] },
    ];
    curves.forEach((c, ci) => {
      filters.push(drawText(c.label, 1108, c.points[2][1] - 8, 17, c.color));
      for (let j = 0; j < c.points.length - 1; j++) {
        const [x1, y1] = c.points[j];
        const [x2, y2] = c.points[j + 1];
        const dx = x2 - x1, dy = y2 - y1;
        const steps = Math.max(1, Math.floor(dx / 8));
        for (let s = 0; s < steps; s++) {
          const px = x1 + Math.floor(dx * s / steps);
          const py = y1 + Math.floor(dy * s / steps);
          filters.push(`drawbox=x=${px}:y=${py}:w=3:h=3:color=${c.color}@1:t=fill`);
        }
      }
    });
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
    .slice(0, 20);
  const code = (source.match(/```[\s\S]*?```/) || [''])[0]
    .replace(/```[a-z]*\n?/i, '')
    .replace(/```$/, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  const pick = (start, count) => sentences.slice(start, start + count);
  const concise = (s) => s.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').slice(0, 92);
  const c = concept || 'Selected concept';

  const base = [
    {
      title: c,
      visual_type: 'mindmap',
      bullets: ['Understand the definition and purpose', 'See how it connects to related concepts', 'Practice with examples and analysis'],
      visual_nodes: [c, 'Definition', 'Properties', 'Operations', 'Examples'],
      visual_edges: [[c, 'Definition'], [c, 'Properties'], [c, 'Operations'], [c, 'Examples']],
      callouts: ['Learning objectives for this video.'],
      example_code: '',
      narration: `Welcome to this tutor video on ${c}. We will start with the definition, build intuition with an analogy, walk through the core idea step by step, look at code, and finish with a summary.`,
    },
    {
      title: `What is ${c}?`,
      visual_type: 'mindmap',
      bullets: (pick(0, 3).length ? pick(0, 3) : [`${c} is a fundamental concept in computer science.`, 'It defines how data is organized or how objects interact.', 'Understanding it is essential for writing efficient code.']).map(concise),
      visual_nodes: [c, 'Formal definition', 'Why it matters', 'Where it is used'],
      visual_edges: [[c, 'Formal definition'], [c, 'Why it matters'], [c, 'Where it is used']],
      callouts: ['Start by stating the definition in your own words.'],
      example_code: '',
      narration: (pick(0, 2).join(' ') || `${c} is a core concept you will encounter frequently. Let us define it precisely and understand why it matters before diving into the details.`),
    },
    {
      title: 'Real-world analogy',
      visual_type: 'comparison',
      bullets: [`Think of ${c} like a real-world system`, 'The analogy helps build intuition', 'Map each part of the analogy to the technical concept'].map(concise),
      visual_nodes: ['Real world', 'Technical concept', 'Analogy maps to', 'Key insight'],
      visual_edges: [['Real world', 'Analogy maps to'], ['Analogy maps to', 'Technical concept']],
      callouts: ['Analogies help but are not exact — know the limits.'],
      example_code: '',
      narration: `A good way to understand ${c} is through analogy. Think of it like a system you already know from everyday life, then map each part to the technical definition we just covered.`,
    },
    {
      title: 'Core idea step by step',
      visual_type: 'flow',
      bullets: (pick(3, 4).length ? pick(3, 4) : ['Identify the abstraction', 'Define the operations', 'Trace through an example', 'Check edge cases']).map(concise),
      visual_nodes: ['Identify', 'Define', 'Trace', 'Verify'],
      visual_edges: [['Identify', 'Define'], ['Define', 'Trace'], ['Trace', 'Verify']],
      callouts: ['Follow the idea one step at a time.'],
      example_code: '',
      narration: (pick(3, 3).join(' ') || `Now let us break down the core idea. First identify the abstraction, then define the key operations, trace through a concrete example, and verify with edge cases.`),
    },
    {
      title: 'Worked example',
      visual_type: 'flow',
      bullets: (pick(7, 4).length ? pick(7, 4) : ['Start with input', 'Apply the operation', 'Show intermediate state', 'Arrive at the result']).map(concise),
      visual_nodes: ['Input', 'Step 1', 'Step 2', 'Result'],
      visual_edges: [['Input', 'Step 1'], ['Step 1', 'Step 2'], ['Step 2', 'Result']],
      callouts: ['Walk through this example on paper yourself.'],
      example_code: '',
      narration: (pick(7, 3).join(' ') || `Let us walk through a concrete example. Start with a specific input, apply the operation step by step, and observe how the state changes until we reach the result.`),
    },
    {
      title: code.length ? 'Code example' : 'Implementation approach',
      visual_type: 'code',
      bullets: (code.length ? code : ['Define the class or function', 'Implement the key operation', 'Handle edge cases', 'Test with sample input']).map(concise),
      visual_nodes: code.length ? ['Class', 'Method', 'Input', 'Output'] : ['Design', 'Implement', 'Test', 'Refine'],
      visual_edges: code.length ? [['Class', 'Method'], ['Input', 'Output']] : [['Design', 'Implement'], ['Implement', 'Test']],
      callouts: code.length ? ['Read each line and name its role.'] : ['Pseudocode first, then real code.'],
      example_code: code.join('\n'),
      narration: (code.length
        ? `Here is an implementation example from the source. Read through the code by identifying the class or function, its inputs, the operation it performs, and the output it produces.`
        : `When implementing ${c}, start by defining the interface, then fill in the key operation. Always handle edge cases and test with sample input.`),
    },
    {
      title: 'Common mistakes',
      visual_type: 'comparison',
      bullets: [`Mistake: confusing ${c} with a similar concept`, 'Mistake: ignoring edge cases', 'Correct: always check boundary conditions', 'Correct: use the right abstraction for the task'].map(concise),
      visual_nodes: ['Common mistake', 'Correct approach', 'Why it matters', 'How to avoid'],
      visual_edges: [['Common mistake', 'Why it matters'], ['Correct approach', 'How to avoid']],
      callouts: ['Most exam errors come from these pitfalls.'],
      example_code: '',
      narration: `Let us look at common mistakes students make with ${c}. The most frequent one is confusing it with a similar concept. Always check your boundary conditions and make sure you are using the right abstraction.`,
    },
    {
      title: 'Summary and review',
      visual_type: 'summary',
      bullets: (pick(11, 4).length ? pick(11, 4) : ['Define the concept precisely', 'Name the key operations', 'State the complexity or trade-off', 'Avoid the common pitfalls']).map(concise),
      visual_nodes: [c, 'Definition', 'Operations', 'Complexity', 'Pitfalls'],
      visual_edges: [[c, 'Definition'], [c, 'Operations'], [c, 'Complexity'], [c, 'Pitfalls']],
      callouts: ['Can you explain this concept without looking at notes?'],
      example_code: '',
      narration: (pick(11, 3).join(' ') || `To review: state the definition of ${c}, list its key operations, analyze the complexity, and remember the common pitfalls. If you can explain all four from memory, you have mastered this topic.`),
    },
  ];
  return { slides: base };
}

function normalizeScript(script, concept, chunks) {
  const fallback = fallbackVideoScript(concept, chunks);
  const src = script && Array.isArray(script.slides) && script.slides.length >= 2 ? script : fallback;
  const typeByIndex = ['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'bigo_chart'];
  const slidesOut = src.slides.slice(0, 12).map((s, i) => ({
    title: String(s.title || (i === 0 ? concept : `Part ${i + 1}`)).slice(0, 90),
    visual_type: VISUAL_TYPES.includes(s.visual_type)
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
    const chunks = await retrieve(materialId, concept, { feature: 'video' });
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
      try {
        await tts.synthesize(s.narration, audioFile);
        assertAudioFile(audioFile);
      } catch (ttsErr) {
        log.warn(`video_tts_slide_${i}`, `TTS failed, using silence: ${ttsErr.message || ttsErr}`);
        await tts._internals.synthSilence(s.narration, audioFile);
      }
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
