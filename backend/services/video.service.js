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
const { retrieveWithMeta, retrieveLessonContext, groundingTier: computeGroundingTier } = require('./rag.service');
const lessons = require('./lesson.service');
const topicResolver = require('./topic-resolver.service');
const tts = require('./tts.service');
const slides = require('./slides.service');
const renderer = require('./renderer.service');
const jobs = require('./jobs.service');
const { scoreVideoScript } = require('./video-quality.service');
const storyboards = require('./storyboard.service');
const { HttpError } = require('../middleware/error');
const log = require('../utils/logger');
const {
  resolveBinary,
  spawnMissingMessage,
  concatListPath,
  FFMPEG_PACKAGE,
  FFPROBE_PACKAGE,
} = require('../utils/mediaBinaries');

const VISUAL_TYPES = ['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'hash_table', 'bigo_chart'];
const SLIDE_TYPES = ['title', 'objectives', 'concept', 'analogy', 'diagram', 'code', 'step_by_step', 'mistakes', 'recap', 'quiz'];

const ScriptSchema = z.object({
  topic: z.string().min(3).optional(),
  audienceLevel: z.string().optional(),
  learningObjectives: z.array(z.string()).optional().default([]),
  slides: z.array(z.object({
    slideType: z.enum(SLIDE_TYPES).optional(),
    title: z.string().min(1),
    bullets: z.array(z.string()).min(1).max(5),
    narration: z.string().min(1),
    visual: z.object({
      type: z.enum(VISUAL_TYPES).optional().default('mindmap'),
      description: z.string().optional().default(''),
      nodes: z.array(z.string()).optional().default([]),
      edges: z.array(z.array(z.string()).min(2)).optional().default([]),
    }).optional(),
    visual_type: z.enum(VISUAL_TYPES).optional(),
    visual_nodes: z.array(z.string()).optional().default([]),
    visual_edges: z.array(z.array(z.string()).min(2)).optional().default([]),
    visual_node_details: z.record(z.any()).optional().default({}),
    operations: z.array(z.string()).optional().default([]),
    caption: z.string().optional().default(''),
    code_focus: z.any().optional(),
    callouts: z.array(z.string()).optional().default([]),
    example_code: z.string().optional().default(''),
  })).min(8).max(12),
});

const ConceptResolutionSchema = z.object({
  topic: z.string().min(3),
  alternatives: z.array(z.string()).optional().default([]),
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

function normalizeVisibleText(value) {
  return String(value || '')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\u00e2\u20ac[\u0090\u0091\u0092\u0093\u0094\u201c\u201d]/g, '-')
    .replace(/\u00e2\u20ac[\u0152\u009d]/g, '"')
    .replace(/\u00e2\u20ac[\u02dc\u2122]/g, "'")
    .replace(/\u00c2\u00b7/g, '-')
    .replace(/\u00ce\u00b1/g, 'alpha')
    .replace(/\u00e2\u2030\u02c6/g, '~=')
    .replace(/\u00e2\u2030\u00a4/g, '<=')
    .replace(/\u00e2\u2030\u00a5/g, '>=')
    .replace(/\u00e2\u02c6\u2019/g, '-')
    .replace(/\u00c3\u2014/g, 'x')
    .replace(/\u00c2\u00b2/g, '^2')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/α/g, 'alpha')
    .replace(/≈/g, '~=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/×/g, 'x')
    .replace(/²/g, '^2')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTextList(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source
    .map(v => normalizeVisibleText(v))
    .filter(Boolean);
}

function compactText(text, max = 64) {
  const value = normalizeVisibleText(text);
  if (value.length <= max) return value;
  const slice = value.slice(0, max).replace(/\s+\S*$/, '').trim();
  return (slice || value.slice(0, max).trim()).replace(/[,;:\-.]+$/g, '');
}

const HANGING_WORD_RE = /\b(?:a|an|and|as|at|because|before|but|by|for|from|if|in|into|is|of|on|or|that|the|then|through|to|with|while)$/i;

function semanticDisplayLabel(value) {
  const text = normalizeVisibleText(stripChunkRefs(value));
  const lower = text.toLowerCase();
  if (/\bwhat you will be able\b|\blearning objectives?\b/.test(lower)) return 'Objectives';
  if (/^explain how\b/.test(lower)) {
    if (lower.includes('encapsulation')) return 'Encapsulation goal';
    if (lower.includes('class') || lower.includes('object')) return 'Class/object goal';
    if (lower.includes('inheritance')) return 'Inheritance goal';
    if (lower.includes('polymorphism')) return 'Dispatch goal';
    if (lower.includes('linked')) return 'Linked-list goal';
    if (lower.includes('hash')) return 'Hash-table goal';
    return 'Learning goal';
  }
  if (/\brecap\b|\bnext step\b/.test(lower)) return 'Recap';
  if (/\bdefine\b|\bdefinition\b/.test(lower)) return 'Definition';
  if (/\btrace\b|\bworked example\b|\bconcrete example\b/.test(lower)) return 'Worked example';
  if (/\bavoid\b|\bcommon mistake\b|\bmistakes?\b/.test(lower)) return 'Common mistake';
  if (/\bsame method\b|\bmethod call\b/.test(lower)) return 'Same method call';
  if (/\bchild class\b/.test(lower)) return 'Child class';
  if (/\bparent class\b/.test(lower)) return 'Parent class';
  if (/\bshape\b/.test(lower) && /\breference\b/.test(lower)) return 'Shape reference';
  if (/\bsuperclass\b/.test(lower) && /\breference\b/.test(lower)) return 'Superclass reference';
  if (/\bsame method\b|\bmethod call\b/.test(lower)) return 'Same method call';
  if (/\bruntime\b/.test(lower) && /\bobject\b/.test(lower)) return 'Runtime object';
  if (/\bdynamic dispatch\b|\bdispatch\b/.test(lower)) return 'Dynamic dispatch';
  if (/\bcircle\.area\(\)|circle area/.test(lower)) return 'Circle.area()';
  if (/\brectangle\.area\(\)|rectangle area/.test(lower)) return 'Rectangle.area()';
  if (/\bcircle\b/.test(lower) && /\bobject\b/.test(lower)) return 'Circle object';
  if (/\brectangle\b/.test(lower) && /\bobject\b/.test(lower)) return 'Rectangle object';
  if (/\boverload/.test(lower)) return 'Overloading contrast';
  if (/\boverrid/.test(lower)) return 'Overriding';
  if (/\bstatic\b|\bfinal\b/.test(lower)) return 'Static/final warning';
  if (/\bcomposition\b/.test(lower)) return 'Composition contrast';
  if (/\bhead\b/.test(lower)) return 'Head pointer';
  if (/\bnode\b/.test(lower) && /\bnext\b/.test(lower)) return 'Node.next';
  if (/\bnull\b/.test(lower)) return 'Null stop';
  if (/\bhash function\b|\bhash\(key\)/.test(lower)) return 'Hash function';
  if (/\bbucket index\b|\bindex\b.*\bmod\b/.test(lower)) return 'Bucket index';
  if (/\bbucket\b/.test(lower)) return 'Bucket';
  if (/\bcollision\b/.test(lower)) return 'Collision';
  if (/\bload factor\b|\balpha\b/.test(lower)) return 'Load factor';
  if (/\bresize\b|\brehash\b/.test(lower)) return 'Resize';
  if (/\binsert/.test(lower)) return 'Insertion step';
  if (/\bdelete|deletion/.test(lower)) return 'Deletion step';
  if (/\bpush\b/.test(lower)) return 'Push';
  if (/\bpop\b/.test(lower)) return 'Pop';
  if (/\bpeek\b/.test(lower)) return 'Peek';
  if (/\blifo\b/.test(lower)) return 'LIFO';
  if (/\bnested\b/.test(lower) && /\bstack\b/.test(lower)) return 'Stack use case';
  if (/\btop\b/.test(lower) && /\bactive\b/.test(lower)) return 'Top item';
  if (/\benqueue\b/.test(lower)) return 'Enqueue';
  if (/\bdequeue\b/.test(lower)) return 'Dequeue';
  if (/\brear\b/.test(lower)) return 'Rear pointer';
  if (/\bfifo\b|\bfirst-in\b|\bfirst in\b|oldest item leaves/.test(lower)) return 'FIFO';
  if (/\bunderflow\b/.test(lower)) return 'Underflow';
  if (/\bbinary search tree\b|\bbst\b/.test(lower)) return 'BST rule';
  if (/\bcomparison\b/.test(lower) && /\bhalf\b/.test(lower)) return 'Halving search';
  if (/\bdeleting\b|\btwo children\b/.test(lower)) return 'Delete case';
  if (/\bo\(1\)/i.test(text)) return 'O(1)';
  if (/\bo\(n\)/i.test(text)) return 'O(n)';
  if (/\bdominant term\b|\bgrowth rate\b|\bbig-o\b/.test(lower)) return 'Growth rate';
  if (/\bcomplexity\b/.test(lower)) return 'Complexity';
  if (/\bprivate\b|\bbalance\b/.test(lower) && /\bfield|state|private\b/.test(lower)) return 'Private state';
  if (/\bpublic\b/.test(lower) && /\bmethod\b/.test(lower)) return 'Public methods';
  if (/\binvariant\b|\bvalid state\b/.test(lower)) return 'Invariant';
  if (/\babstraction\b|\bobject does\b|\bpublic contract\b|\bcontract\b/.test(lower)) return 'Public contract';
  if (/\bworking code\b|\bcode example\b/.test(lower)) return 'Code example';
  if (/\bread\b/.test(lower) && /\broles\b/.test(lower)) return 'Code roles';
  if (/\bpoint\b/.test(lower) && /\bpart\b/.test(lower)) return 'Diagram roles';
  if (/\banalogy\b/.test(lower) && /\bstops?\b/.test(lower)) return 'Analogy limit';
  if (/\bwhy\b/.test(lower) && /\bline\b/.test(lower)) return 'Line purpose';
  if (/\btie\b/.test(lower) && /\bcost\b/.test(lower)) return 'Operation cost';
  if (/\bsay why\b|\banswer is correct\b/.test(lower)) return 'Reason';
  if (/\bmental model\b/.test(lower)) return 'Mental model';
  if (/\bdefinition\b/.test(lower)) return 'Definition';
  if (/\bmistake\b/.test(lower)) return 'Common mistake';
  return '';
}

function focusDisplayLabel(value) {
  const text = normalizeVisibleText(stripChunkRefs(value)).replace(/[.!?]+$/g, '');
  if (!text) return '';
  const semantic = semanticDisplayLabel(text);
  if (semantic) return semantic;
  const token = text.match(/\b[A-Z][A-Za-z0-9_]*\.[A-Za-z0-9_]+\(\)/);
  if (token) return token[0];
  const words = text.split(/\s+/).filter(word => !/^(the|a|an|to|with|through|because|that|this|these|those|your|you)$/i.test(word));
  if (words.length > 5) return '';
  const label = words.join(' ');
  if (!label || label.length > 38 || HANGING_WORD_RE.test(label)) return '';
  return label;
}

function displayTitle(value, fallback) {
  const text = normalizeVisibleText(stripChunkRefs(value)).replace(/[.!?]+$/g, '');
  if (text && text.length <= 64 && !HANGING_WORD_RE.test(text)) return text;
  return semanticDisplayLabel(text) || fallback || 'Tutor scene';
}

function safeCaption(value) {
  const text = normalizeVisibleText(stripChunkRefs(value));
  if (!text || text.length > 140 || HANGING_WORD_RE.test(text)) return '';
  return text;
}

function stripChunkRefs(text) {
  return normalizeVisibleText(String(text || '').replace(/\[chunk:\d+\]/g, '').replace(/\s{2,}/g, ' '));
}

const FILE_EXT_RE = /\.(pdf|docx?|pptx?|txt|md)$/i;
const GENERIC_CONCEPT_RE = /^(document|file|material|untitled|untitled document|chapter\s*\d+)$/i;
const KNOWN_CONCEPTS = [
  { topic: 'Encapsulation', terms: ['encapsulation', 'private field', 'getter', 'setter', 'data hiding'] },
  { topic: 'Inheritance', terms: ['inheritance', 'extends', 'superclass', 'subclass'] },
  { topic: 'Polymorphism', terms: ['polymorphism', 'override', 'dynamic dispatch'] },
  { topic: 'Abstraction', terms: ['abstraction', 'interface', 'abstract class'] },
  { topic: 'Stack', terms: ['stack', 'push', 'pop', 'lifo'] },
  { topic: 'Queue', terms: ['queue', 'enqueue', 'dequeue', 'fifo'] },
  { topic: 'Linked List', terms: ['linked list', 'node.next', 'next pointer'] },
  { topic: 'Binary Search Tree', terms: ['binary search tree', 'bst', 'left subtree', 'right subtree'] },
  { topic: 'Big-O', terms: ['big-o', 'o(n)', 'o(log n)', 'time complexity'] },
  { topic: 'Array', terms: ['array', 'index', 'contiguous'] },
  { topic: 'Hash Table', terms: ['hash table', 'hashmap', 'hash function'] },
  { topic: 'Recursion', terms: ['recursion', 'base case', 'recursive case'] },
];

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function comparableName(value) {
  return normalizeName(value)
    .replace(FILE_EXT_RE, '')
    .toLowerCase();
}

function isGenericConcept(value) {
  const text = normalizeName(value);
  if (text.length < 3) return true;
  if (FILE_EXT_RE.test(text)) return true;
  return GENERIC_CONCEPT_RE.test(text);
}

function isUploadedFilename(value, material) {
  const name = comparableName(value);
  if (!name || !material) return false;
  const title = comparableName(material.title);
  const stored = comparableName(path.basename(material.file_path || ''));
  return (!!title && name === title) || (!!stored && name === stored);
}

function validConceptHint(value, material) {
  const text = normalizeName(value).replace(/^["']|["']$/g, '').slice(0, 90);
  if (isGenericConcept(text)) return null;
  if (isUploadedFilename(text, material)) return null;
  return text;
}

function inferKnownConcept(chunks) {
  const text = (chunks || []).map(c => `${c.chapter_title || ''} ${c.heading || ''} ${c.slide_title || ''} ${c.text || ''}`).join('\n').toLowerCase();
  let best = null;
  for (const item of KNOWN_CONCEPTS) {
    let score = 0;
    for (const term of item.terms) {
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = text.match(re);
      if (matches) score += matches.length * (term.length > 8 ? 2 : 1);
    }
    if (!best || score > best.score) best = { topic: item.topic, score };
  }
  if (best && best.score > 0) return best.topic;
  if (/\b(class|object|method|field|constructor)\b/.test(text)) return 'Object-Oriented Programming';
  if (/\b(array|tree|graph|node|algorithm|complexity)\b/.test(text)) return 'Data Structures';
  return 'Object-Oriented Programming';
}

async function resolveConcept({ materialId, hint }) {
  const resolved = await topicResolver.resolveTopic({
    materialId,
    hint,
    feature: 'video',
    minConfidence: 0.24,
  });
  return {
    topic: resolved.topic || null,
    source: resolved.topic_source || resolved.source || 'resolver',
    confidence: resolved.confidence,
    sourceTitle: resolved.sourceTitle,
    alternatives: resolved.alternatives || [],
  };
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
  const callouts = [];
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
    codeLines.forEach((line, i) => filters.push(drawText(compactText(line, 34), 584, 246 + i * 34, 20, '0xe0f2fe')));
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
  } else if (visualType === 'hash_table') {
    const raw = nodes.length ? nodes : ['key "cat"', 'hash(key)', 'index = hash mod m', 'bucket 2', '(cat, 41)', '(cot, 19)'];
    const stepLabels = [
      raw.find(n => /\bkey\b/i.test(n)) || raw[0] || 'key',
      raw.find(n => /\bhash\b/i.test(n)) || 'hash(key)',
      raw.find(n => /\bindex\b|\bmod\b/i.test(n)) || 'index = hash mod m',
    ];
    stepLabels.forEach((label, i) => {
      const x = rightX + 28 + i * 202;
      drawLabeledBox(filters, label, x, rightY + 52, 172, 62, ['0xdbeafe@1', '0xdcfce7@1', '0xfef3c7@1'][i], ['0x2563eb@1', '0x16a34a@1', '0xf59e0b@1'][i]);
      if (i < stepLabels.length - 1) filters.push(drawText('->', x + 178, rightY + 74, 24, '0x334155'));
    });
    for (let i = 0; i < 5; i++) {
      const y = rightY + 162 + i * 46;
      const active = i === 2;
      filters.push(`drawbox=x=${rightX + 48}:y=${y}:w=64:h=38:color=${active ? '0xdbeafe@1' : '0xf8fafc@1'}:t=fill`);
      filters.push(`drawbox=x=${rightX + 48}:y=${y}:w=64:h=38:color=${active ? '0x2563eb@1' : '0x94a3b8@1'}:t=2`);
      filters.push(drawText(String(i), rightX + 74, y + 9, 17, active ? '0x2563eb' : '0x64748b'));
      filters.push(`drawbox=x=${rightX + 122}:y=${y}:w=166:h=38:color=${active ? '0xeff6ff@1' : '0xffffff@1'}:t=fill`);
      filters.push(`drawbox=x=${rightX + 122}:y=${y}:w=166:h=38:color=${active ? '0x2563eb@1' : '0xcbd5e1@1'}:t=2`);
      filters.push(drawText(active ? 'bucket 2' : 'empty', rightX + 142, y + 9, 16, active ? '0x0f172a' : '0x64748b'));
    }
    const chain = raw.filter(n => !/\bkey\b|\bhash\b|\bindex\b|\bmod\b|\bbucket\b|\btable\b/i.test(n)).slice(0, 3);
    const entries = chain.length ? chain : ['(cat, 41)', '(cot, 19)'];
    filters.push(drawText('->', rightX + 300, rightY + 256, 26, '0x2563eb'));
    entries.forEach((entry, i) => {
      const x = rightX + 344 + i * 122;
      drawLabeledBox(filters, entry, x, rightY + 236, 106, 58, i === 0 ? '0xdcfce7@1' : '0xfee2e2@1', i === 0 ? '0x16a34a@1' : '0xef4444@1');
      if (i < entries.length - 1) filters.push(drawText('->', x + 108, rightY + 256, 22, '0xef4444'));
    });
    drawLabeledBox(filters, 'expected O(1), worst O(n)', rightX + 330, rightY + 330, 300, 58, '0xf8fafc@1', '0x94a3b8@1');
    drawText('load factor = size / buckets', rightX + 334, rightY + 416, 18, '0x64748b');
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

function conceptProfile(concept) {
  const c = normalizeName(concept) || 'Object-Oriented Programming';
  const lower = c.toLowerCase();
  if (lower.includes('encapsulation')) {
    return {
      definition: 'Encapsulation bundles data with methods and controls access through a public interface.',
      why: 'It protects object state and keeps changes predictable.',
      analogy: 'A bank account exposes deposit and withdraw, not direct balance edits.',
      diagramNodes: ['Encapsulation', 'Private Fields', 'Public Methods', 'Validation', 'Class Invariant'],
      code: 'class BankAccount {\n  private double balance;\n  public void deposit(double amount) {\n    if (amount <= 0) return;\n    balance += amount;\n  }\n  public double getBalance() { return balance; }\n}',
      steps: ['Keep fields private', 'Expose methods', 'Validate changes', 'Preserve invariants'],
      mistakes: ['Making fields public', 'Skipping validation', 'Leaking internal collections'],
      quiz: 'Why should balance be private instead of public?',
      answer: 'So all changes pass through controlled methods.',
    };
  }
  if (lower.includes('inheritance')) {
    return {
      definition: 'Inheritance lets a child class reuse and specialize a parent class through an is-a relationship.',
      why: 'It keeps shared contracts in one place while subclasses provide specialized behavior.',
      analogy: 'Shape is the general category; Circle and Rectangle are specific kinds of Shape.',
      diagramNodes: ['Shape', 'Circle', 'Rectangle', 'extends', 'area() override'],
      code: 'abstract class Shape {\n  abstract double area();\n}\nclass Circle extends Shape {\n  double radius;\n  @Override double area() { return Math.PI * radius * radius; }\n}\nclass Rectangle extends Shape {\n  double width, height;\n  @Override double area() { return width * height; }\n}',
      steps: ['Create the parent Shape contract', 'Use extends for Circle and Rectangle', 'Override area() in each child', 'Use composition for has-a relationships'],
      mistakes: ['Using inheritance for has-a relationships', 'Forgetting @Override', 'Mixing inheritance with polymorphism too early'],
      quiz: 'Which is inheritance: Circle is a Shape, or Circle has a radius?',
      answer: 'Circle is a Shape, because inheritance models is-a.',
    };
  }
  if (lower.includes('polymorphism')) {
    return {
      definition: 'Polymorphism means the same method call can run different overridden methods depending on the runtime object.',
      why: 'It lets code depend on a general type while subclasses provide behavior.',
      analogy: 'A remote control has the same play button, but each device responds in its own way.',
      diagramNodes: ['Shape reference', 'Circle object', 'Rectangle object', 'area()', 'dynamic dispatch'],
      code: 'Shape shape = new Circle(2);\nSystem.out.println(shape.area());\nshape = new Rectangle(3, 4);\nSystem.out.println(shape.area());',
      steps: ['Declare a superclass reference', 'Assign a subclass object', 'Call an overridden method', 'Runtime object chooses implementation'],
      mistakes: ['Confusing overriding with overloading', 'Expecting static methods to dispatch dynamically', 'Trying to override final methods'],
      quiz: 'If Shape s = new Rectangle(3,4), which area method runs?',
      answer: 'Rectangle.area() runs because dispatch follows the runtime object.',
    };
  }
  if (lower.includes('hash table') || lower.includes('hashmap') || lower.includes('hash map') || lower.includes('hash function')) {
    return {
      definition: 'A hash table stores key-value pairs by hashing a key to choose a bucket index.',
      why: 'With a good hash function and controlled load factor, lookup, insert, and delete are expected O(1).',
      analogy: 'It is like a labeled cabinet: compute the drawer number, then check the few items in that drawer.',
      diagramNodes: ['key "cat"', 'hash(key)', 'index = hash mod buckets', 'bucket 2', '(cat, 41)', '(cot, 19)', 'collision chain', 'resize'],
      code: 'int index = (key.hashCode() & 0x7fffffff) % table.length;\nfor (Entry e = table[index]; e != null; e = e.next) {\n  if (e.key.equals(key)) return e.value;\n}\nreturn null;\n// Resize when load factor grows too high.',
      steps: ['Hash the key', 'Convert hash to bucket index', 'Search the bucket chain', 'Resize when load factor is high'],
      mistakes: ['Thinking O(1) is guaranteed', 'Ignoring collisions', 'Using mutable keys', 'Forgetting equals/hashCode consistency'],
      quiz: 'Why can a hash table lookup become O(n) in the worst case?',
      answer: 'Many keys can collide into one bucket, forcing a linear scan of that bucket.',
    };
  }
  if (lower.includes('linked list')) {
    return {
      definition: 'A linked list is a chain of nodes where each node stores data and a next reference.',
      why: 'It makes insertion and deletion about reconnecting references instead of shifting contiguous array elements.',
      analogy: 'It is like a treasure hunt where each clue points to the next clue.',
      diagramNodes: ['head', 'Node(10)', 'Node(20)', 'Node(30)', 'null'],
      code: 'class Node {\n  int data;\n  Node next;\n  Node(int data) { this.data = data; }\n}\nNode insertFront(Node head, int value) {\n  Node node = new Node(value);\n  node.next = head;\n  return node;\n}',
      steps: ['Start at head', 'Follow next references', 'Save links before rewiring', 'Stop at null'],
      mistakes: ['Losing the next reference', 'Skipping null checks', 'Assuming O(1) random access'],
      quiz: 'When inserting at the front, what should newNode.next point to?',
      answer: 'The old head, so the existing chain is preserved.',
    };
  }
  if (lower.includes('binary search tree') || lower === 'bst') {
    return {
      definition: 'A binary search tree keeps smaller keys on the left and larger keys on the right.',
      why: 'That ordering lets search and insertion discard half of a subtree at each step.',
      analogy: 'It is like sorting decisions in a yes/no decision tree.',
      diagramNodes: ['BST', 'Root', 'Left Smaller', 'Right Larger', 'Height'],
      code: 'Node insert(Node root, int key) {\n  if (root == null) return new Node(key);\n  if (key < root.key) root.left = insert(root.left, key);\n  else if (key > root.key) root.right = insert(root.right, key);\n  return root;\n}',
      steps: ['Start at root', 'Compare key', 'Move left or right', 'Insert at empty spot'],
      mistakes: ['Ignoring duplicates', 'Forgetting height matters', 'Assuming every BST is balanced'],
      quiz: 'What controls BST operation time?',
      answer: 'The height of the tree.',
    };
  }
  if (lower.includes('stack')) {
    return {
      definition: 'A stack is a LIFO structure where the last item pushed is the first popped.',
      why: 'It models nested work such as function calls, undo, and parsing.',
      analogy: 'It works like a stack of plates: take from the top first.',
      diagramNodes: ['Stack', 'Top', 'Push', 'Pop', 'LIFO'],
      code: 'stack.push(item);\nlet top = stack.pop();\nlet next = stack.peek();',
      steps: ['Push adds to top', 'Peek reads top', 'Pop removes top', 'Underflow if empty'],
      mistakes: ['Removing from bottom', 'Popping an empty stack', 'Confusing LIFO with FIFO'],
      quiz: 'Which item is popped first after A, B, C are pushed?',
      answer: 'C, because it was pushed last.',
    };
  }
  if (lower.includes('queue')) {
    return {
      definition: 'A queue is a FIFO structure where the first item enqueued is the first dequeued.',
      why: 'It preserves arrival order for scheduling, buffers, and breadth-first search.',
      analogy: 'It works like a line at a service desk.',
      diagramNodes: ['Queue', 'Front', 'Rear', 'Enqueue', 'Dequeue'],
      code: 'queue.enqueue(item);\nlet first = queue.dequeue();',
      steps: ['Enqueue at rear', 'Dequeue from front', 'Preserve order', 'Check empty state'],
      mistakes: ['Removing from rear', 'Confusing FIFO with LIFO', 'Ignoring empty queues'],
      quiz: 'Which item leaves first after A, B, C are enqueued?',
      answer: 'A, because it arrived first.',
    };
  }
  if (lower.includes('big-o') || lower.includes('complexity')) {
    return {
      definition: 'Big-O describes how running time or memory grows as input size increases.',
      why: 'It helps compare algorithms without depending on a specific machine.',
      analogy: 'It is like comparing travel routes by how they scale as the city grows.',
      diagramNodes: ['Big-O', 'O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
      code: 'for (let i = 0; i < n; i++) {\n  visit(items[i]);\n}\n// One loop over n items is O(n).',
      steps: ['Find the input size', 'Count dominant work', 'Drop constants', 'Keep growth term'],
      mistakes: ['Keeping constants', 'Ignoring nested loops', 'Confusing best and worst case'],
      quiz: 'Why is binary search O(log n)?',
      answer: 'Each comparison cuts the remaining search space roughly in half.',
    };
  }
  return {
    definition: `${c} is a core CS concept used to organize data, behavior, or algorithmic work.`,
    why: 'It matters because it changes how clearly and efficiently a program can solve a problem.',
    analogy: 'Think of it as choosing the right tool and rules before building a solution.',
    diagramNodes: [c, 'Purpose', 'Parts', 'Rules', 'Example'],
    code: `// Concrete ${c} example should be generated from the lesson model.\n// Identify the data, operation, and result before memorizing syntax.`,
    steps: ['Name the concrete parts', 'Show one valid operation', 'Track state changes', 'Check boundary cases'],
    mistakes: ['Memorizing labels only', 'Skipping concrete operations', 'Ignoring trade-offs'],
    quiz: `What problem does ${c} help solve?`,
    answer: 'It gives a structured way to reason about code and trade-offs.',
  };
}

function sourceTakeaways(chunks) {
  return (chunks || [])
    .map(c => String(c.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(t => compactText(t, 90));
}

function preferredDiagramVisualType(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('linked list') || lower.includes('linkedlist')) return 'linkedlist';
  if (lower.includes('hash table') || lower.includes('hashmap') || lower.includes('hash map') || lower.includes('hash function') || lower.includes('collision') || lower.includes('load factor') || lower.includes('bucket')) return 'hash_table';
  if (lower.includes('big-o') || lower.includes('big o') || lower.includes('complexity') || /\bo\([^)]+\)/.test(lower)) return 'bigo_chart';
  if (lower.includes('stack') || lower.includes('queue') || lower.includes('fifo') || lower.includes('lifo')) return 'stack_queue';
  if (lower.includes('tree') || lower.includes('bst') || lower.includes('binary search')) return 'tree';
  if (lower.includes('encapsulation') || lower.includes('inheritance') || lower.includes('polymorphism') || lower.includes('abstraction') || lower.includes('class')) return 'class_diagram';
  return 'mindmap';
}

function inferScriptVisualType(slide, concept, slideType, nodes, bullets, index, total) {
  if (slideType === 'code' || slide.example_code) return 'code';
  if (slideType === 'diagram') return preferredDiagramVisualType(`${concept} ${slide.title || ''} ${nodes.join(' ')}`);
  if (slideType === 'step_by_step') return 'flow';
  if (slideType === 'mistakes' || slideType === 'analogy') return 'comparison';
  if (slideType === 'recap' || index === total - 1) return 'summary';
  const byText = preferredDiagramVisualType(`${slide.title || ''} ${nodes.join(' ')} ${bullets.join(' ')}`);
  return byText === 'class_diagram' ? 'mindmap' : byText;
}

function fallbackVideoScriptM1(concept, chunks, lowGrounding = false) {
  const c = normalizeName(concept) || inferKnownConcept(chunks);
  const p = conceptProfile(c);
  const sourceNotes = sourceTakeaways(chunks);
  const groundingCallout = lowGrounding
    ? 'Uploaded material had weak support; using general CS knowledge.'
    : 'Grounded in your study material.';
  const introNarration = lowGrounding
    ? `The uploaded material does not contain enough specific information about ${c}. I will say that clearly, then teach the standard CS idea using general knowledge.`
    : `In this lesson, we will study ${c} using the uploaded material where it gives useful evidence.`;
  return {
    topic: c,
    audienceLevel: 'beginner',
    learningObjectives: [`Define ${c}`, 'Explain why it matters', 'Trace a concrete worked example'],
    slides: [
      {
        slideType: 'title',
        title: c,
        visual_type: 'mindmap',
        bullets: [`What ${c} means`, 'Why it matters', 'How to use it'],
        visual_nodes: [c, ...p.diagramNodes.slice(1, 5)],
        visual_edges: p.diagramNodes.slice(1, 4).map(n => [c, n]),
        callouts: [groundingCallout],
        narration: `${introNarration} By the end, you should be able to explain the idea and spot common mistakes.`,
      },
      {
        slideType: 'objectives',
        title: 'Learning Objectives',
        visual_type: 'summary',
        bullets: [`Define ${c}`, 'Trace a concrete worked example', 'Correct common misconceptions'],
        visual_nodes: ['Objectives', 'Definition', 'Example', 'Mistakes'],
        visual_edges: [['Objectives', 'Definition'], ['Objectives', 'Example'], ['Objectives', 'Mistakes']],
        callouts: sourceNotes.length ? [`Source note: ${sourceNotes[0]}`] : [],
        narration: `We will start with a precise definition, then connect it to an analogy and a concrete example. Finally, we will review mistakes and answer a mini quiz.`,
      },
      {
        slideType: 'concept',
        title: `What is ${c}?`,
        visual_type: 'mindmap',
        bullets: [p.definition, p.why].map(x => compactText(x, 120)),
        visual_nodes: [c, 'Definition', 'Purpose', 'Interface', 'Trade-off'],
        visual_edges: [[c, 'Definition'], [c, 'Purpose'], [c, 'Trade-off']],
        callouts: [groundingCallout],
        narration: `${p.definition} ${p.why} This is the core idea to remember before looking at code.`,
      },
      {
        slideType: 'analogy',
        title: 'Simple Analogy',
        visual_type: 'comparison',
        bullets: [p.analogy, 'Map the analogy to code', 'Know where it stops'].map(x => compactText(x, 120)),
        visual_nodes: ['Analogy', c, 'Shared idea', 'Limit'],
        visual_edges: [['Analogy', 'Shared idea'], ['Shared idea', c]],
        callouts: ['Analogies build intuition, not proof.'],
        narration: `${p.analogy} The analogy helps you remember the behavior, but the formal rules still matter when writing code.`,
      },
      {
        slideType: 'diagram',
        title: 'Visual Model',
        visual_type: preferredDiagramVisualType(c),
        bullets: ['Label the concrete parts', 'Track the relationships', 'Walk through one operation'],
        visual_nodes: p.diagramNodes,
        visual_edges: p.diagramNodes.slice(1).map(n => [p.diagramNodes[0], n]),
        callouts: ['Use the diagram to explain the rule aloud.'],
        narration: `This diagram separates the pieces of ${c}. When studying, point to each part and say what role it plays.`,
      },
      {
        slideType: 'code',
        title: 'Concrete Code Example',
        visual_type: 'code',
        bullets: ['Identify the main operation', 'Read validation first', 'Trace state changes'],
        visual_nodes: ['Code', 'Input', 'Rule', 'Output'],
        visual_edges: [['Input', 'Rule'], ['Rule', 'Output']],
        callouts: ['Trace code line by line.'],
        example_code: p.code,
        narration: `Now connect the idea to code. Do not memorize the syntax first; identify the operation, the data it protects or changes, and the condition that keeps it correct.`,
      },
      {
        slideType: 'step_by_step',
        title: 'Step by Step',
        visual_type: 'flow',
        bullets: p.steps.map(x => compactText(x, 100)),
        visual_nodes: p.steps,
        visual_edges: p.steps.slice(0, -1).map((n, i) => [n, p.steps[i + 1]]),
        callouts: ['Trace one example before generalizing.'],
        narration: `Work through ${c} in this order: ${p.steps.join(', ')}. A step-by-step trace is the fastest way to reveal misunderstandings.`,
      },
      {
        slideType: 'mistakes',
        title: 'Common Mistakes',
        visual_type: 'comparison',
        bullets: p.mistakes.map(x => compactText(x, 100)),
        visual_nodes: ['Mistake', 'Correct Habit', ...p.mistakes.slice(0, 2)],
        visual_edges: [['Mistake', 'Correct Habit']],
        callouts: ['Most bugs come from violating the main rule.'],
        narration: `The common mistakes are not random; each one breaks the central rule of ${c}. When debugging, ask which rule was violated.`,
      },
      {
        slideType: 'recap',
        title: 'Recap',
        visual_type: 'summary',
        bullets: [p.definition, p.why, 'Use examples to test understanding'].map(x => compactText(x, 120)),
        visual_nodes: [c, 'Definition', 'Purpose', 'Example', 'Mistake'],
        visual_edges: [[c, 'Definition'], [c, 'Purpose'], [c, 'Example'], [c, 'Mistake']],
        callouts: ['Say the recap without looking.'],
        narration: `To recap, ${p.definition} It matters because ${p.why.toLowerCase()} You are ready when you can explain it with an example and a mistake to avoid.`,
      },
      {
        slideType: 'quiz',
        title: 'Mini Quiz',
        visual_type: 'mindmap',
        bullets: [p.quiz, `Answer: ${p.answer}`],
        visual_nodes: ['Question', 'Answer', c],
        visual_edges: [['Question', c], [c, 'Answer']],
        callouts: ['Pause and answer before revealing.'],
        narration: `Mini quiz: ${p.quiz} The answer is: ${p.answer} If that makes sense, you understand the main idea of ${c}.`,
      },
    ],
  };
}

function normalizeScript(script, concept, chunks, lowGrounding = false) {
  const fallback = fallbackVideoScriptM1(concept, chunks, lowGrounding);
  const src = script && Array.isArray(script.slides) && script.slides.length >= 2 ? script : fallback;
  const typeByIndex = ['mindmap', 'summary', 'mindmap', 'comparison', 'class_diagram', 'code', 'code', 'flow', 'comparison', 'bigo_chart', 'summary', 'mindmap'];
  const slidesIn = src.slides.slice(0, 12);
  while (slidesIn.length < 8) slidesIn.push(fallback.slides[slidesIn.length]);
  const slidesOut = slidesIn.map((s, i) => {
    const fb = fallback.slides[Math.min(i, fallback.slides.length - 1)];
    const visual = s.visual || {};
    const visualType = s.visual_type || visual.type;
    const rawBullets = Array.isArray(s.bullets) && s.bullets.length ? s.bullets : fb.bullets;
    const bullets = rawBullets
      .map(b => focusDisplayLabel(b))
      .filter(Boolean)
      .slice(0, 2);
    if (!bullets.length) {
      const fallbackLabel = focusDisplayLabel(s.title || fb.title || concept) || semanticDisplayLabel(concept) || 'Core idea';
      bullets.push(fallbackLabel);
    }
    const nodes = cleanTextList(s.visual_nodes && s.visual_nodes.length ? s.visual_nodes : visual.nodes, [s.title || concept, ...bullets])
      .map(n => stripChunkRefs(n)).slice(0, 8);
    const edges = (Array.isArray(s.visual_edges) && s.visual_edges.length ? s.visual_edges : visual.edges || [])
      .filter(edge => Array.isArray(edge) && edge.length >= 2)
      .map(edge => [String(edge[0] || '').trim(), String(edge[1] || '').trim(), String(edge[2] || '').trim()].filter(Boolean))
      .filter(edge => edge[0] && edge[1])
      .slice(0, 10);
    const slideType = SLIDE_TYPES.includes(s.slideType) ? s.slideType : (fb.slideType || SLIDE_TYPES[Math.min(i, SLIDE_TYPES.length - 1)]);
    const inferredVisualType = inferScriptVisualType(s, concept, slideType, nodes, bullets, i, slidesIn.length);
    return {
      slideType,
      slide_type: slideType,
      title: displayTitle(s.title || fb.title || (i === 0 ? concept : `Part ${i + 1}`), fb.title || `${slideType.replace(/_/g, ' ')} scene`),
      visual_type: VISUAL_TYPES.includes(visualType)
        ? visualType
        : (inferredVisualType !== 'mindmap' ? inferredVisualType : (i === slidesIn.length - 1 ? 'summary' : typeByIndex[i % typeByIndex.length])),
      bullets,
      visual_nodes: nodes,
      visual_edges: edges,
      visual_node_details: s.visual_node_details || {},
      operations: cleanTextList(s.operations, []),
      caption: safeCaption(s.caption || visual.caption || ''),
      code_focus: s.code_focus || s.codeFocus || null,
      focusTarget: focusDisplayLabel(s.focusTarget || bullets[0] || s.title || ''),
      pointerLabel: focusDisplayLabel(s.pointerLabel || s.focusTarget || bullets[0] || s.title || ''),
      animationType: s.animationType || s.animation_type || null,
      callouts: [],
      example_code: String(s.example_code || s.exampleCode || fb.example_code || '').slice(0, 1000),
      narration: String(s.narration || fb.narration || '').replace(/\s+/g, ' ').trim(),
    };
  }).filter(s => s.title && s.bullets.length && s.narration);
  if (lowGrounding && slidesOut[0]) {
    const disclaimer = 'Uploaded material had weak support; using general CS knowledge.';
    if (!slidesOut[0].narration.toLowerCase().includes('uploaded material')) {
      slidesOut[0].narration = `${disclaimer} ${slidesOut[0].narration}`;
    }
  }
  return {
    topic: validConceptHint(src.topic, null) || concept,
    audienceLevel: src.audienceLevel || 'beginner',
    learningObjectives: (src.learningObjectives || fallback.learningObjectives || []).slice(0, 4),
    slides: slidesOut.length >= 8 ? slidesOut : fallback.slides,
  };
}

function providerModel(provider) {
  return provider === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL;
}

function isGroqConfigured() {
  return !!env.GROQ_API_KEY;
}

async function parseValidateNormalize(raw, provider, concept, chunks, lowGrounding, repairTokens = 1200) {
  const parsed = await parseJsonSafe(raw, ScriptSchema, async (txt) => (
    ai.generate(prompts.REPAIR_JSON(txt), {
      provider,
      feature: 'video_script',
      format: 'json',
      temperature: 0,
      num_predict: repairTokens,
      max_tokens: repairTokens,
    })
  ));
  return normalizeScript(parsed, concept, chunks, lowGrounding);
}

async function generateScriptCandidate({ provider, prompt, concept, chunks, lowGrounding, options = {}, logMeta = {} }) {
  const started = Date.now();
  try {
    const raw = await ai.generate(prompt, {
      provider,
      feature: 'video_script',
      format: 'json',
      temperature: options.temperature ?? 0.35,
      num_ctx: options.num_ctx || 8192,
      num_predict: options.num_predict,
      max_tokens: options.max_tokens,
      model: options.model,
    });
    const script = await parseValidateNormalize(
      raw,
      provider,
      concept,
      chunks,
      lowGrounding,
      options.repairTokens || (provider === 'groq' ? 900 : 1200)
    );
    const quality = scoreVideoScript(script, {
      concept,
      chunks,
      lowGrounding,
      threshold: env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
    });
    log.info('video_script_provider', {
      provider,
      model: providerModel(provider),
      quality_score: quality.score,
      passed: quality.passed,
      duration_ms: Date.now() - started,
      ...logMeta,
    });
    return { provider, script, quality, valid: true, durationMs: Date.now() - started };
  } catch (e) {
    log.warn('video_script_provider_failed', {
      provider,
      model: providerModel(provider),
      error: e && e.code ? e.code : 'script_generation_failed',
      message: e && e.message ? String(e.message).slice(0, 180) : String(e).slice(0, 180),
      duration_ms: Date.now() - started,
      ...logMeta,
    });
    return {
      provider,
      script: null,
      valid: false,
      error: e,
      quality: { score: 0, passed: false, reasons: [e && e.message ? e.message : String(e)] },
      durationMs: Date.now() - started,
    };
  }
}

function compactGroqChunks(chunks, opts = {}) {
  const topK = Math.max(1, opts.topK || env.GROQ_VIDEO_TOP_K_CHUNKS || 4);
  const maxChunkChars = Math.max(200, opts.maxChunkChars || env.GROQ_VIDEO_MAX_CHUNK_CHARS || 900);
  return (chunks || []).slice(0, topK).map((c, i) => ({
    id: c.id || i + 1,
    idx: c.idx == null ? i : c.idx,
    title: compactText(c.heading || c.chapter_title || '', 80),
    score: Number(c.score || 0).toFixed(3),
    text: String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, maxChunkChars),
  }));
}

function buildCompactGroqVideoPrompt(concept, chunks, lowGrounding, budget = {}) {
  let topK = budget.topK || env.GROQ_VIDEO_TOP_K_CHUNKS || 4;
  let maxChunkChars = budget.maxChunkChars || env.GROQ_VIDEO_MAX_CHUNK_CHARS || 900;
  const maxInputChars = budget.maxInputChars || env.GROQ_VIDEO_MAX_INPUT_CHARS || 12000;
  let source = '';
  let prompt = '';
  do {
    const compactChunks = compactGroqChunks(chunks, { topK, maxChunkChars });
    source = compactChunks.map(c => (
      `[chunk:${c.id}] score=${c.score} title="${c.title}" excerpt="${c.text}"`
    )).join('\n\n');
    prompt = `Generate a deep educational AI tutor video lesson JSON for "${concept}".

Grounding: ${lowGrounding ? 'LOW. First slide must disclose weak uploaded-material support, then teach from professional CS knowledge.' : 'Use source chunks as foundation, then enhance with deep CS explanations, code examples, and analogies.'}

Source chunks:
${source || '(No source chunks available.)'}

Return ONLY strict JSON with this shape:
{"topic":"${concept}","audienceLevel":"beginner","learningObjectives":["..."],"slides":[{"slideType":"title|objectives|concept|analogy|diagram|code|step_by_step|mistakes|recap|quiz","title":"...","bullets":["..."],"narration":"...","visual":{"type":"mindmap|flow|comparison|code|summary|class_diagram|tree|stack_queue|linkedlist|hash_table|bigo_chart","nodes":["..."],"edges":[["...","..."]]},"example_code":"","code_focus":{"lineRange":"1-3","highlightLines":[1,2,3],"explanation":"why these lines exist"}}]}

Rules:
- 8-12 slides covering: title, objectives, concept, analogy, diagram, code, step_by_step, mistakes, recap, quiz.
- NARRATION IS THE MOST IMPORTANT PART. Write 4-8 sentences per teaching slide (concept/analogy/code/step_by_step). Explain the WHY, not just WHAT. Teach like a passionate tutor.
- Bullets can be up to 120 chars. Write meaningful content, not vague labels like "What X means".
- visual_nodes must use concrete names (class names, data values) not abstract labels like "Definition".
- For CODE slides: put complete working code (8-15 lines with comments) in example_code. Narrate line by line.
- Do not include callouts. Do not include raw chunk references in any visible text.
- Code walkthrough slides must include code_focus.lineRange and explain why those exact lines exist.
- Use diverse visual types appropriate to the concept.
- Use hash_table for hash tables/maps; include key, hash function, bucket index, collision handling, load factor, resize, expected O(1), and worst O(n).
- Avoid placeholders and generic text.`;
    if (prompt.length <= maxInputChars || maxChunkChars <= 350) break;
    maxChunkChars = Math.floor(maxChunkChars * 0.75);
  } while (prompt.length > maxInputChars);
  return {
    prompt: prompt.length > maxInputChars ? prompt.slice(0, maxInputChars) : prompt,
    chunksSent: Math.min(topK, (chunks || []).length),
    maxChunkChars,
    promptChars: Math.min(prompt.length, maxInputChars),
  };
}

async function generateGroqVideoCandidate(concept, chunks, lowGrounding, reason) {
  if (!isGroqConfigured()) {
    log.warn('video_script_fallback_unavailable', { provider: 'groq', reason: 'missing_groq_api_key' });
    return { provider: 'groq', valid: false, script: null, quality: { score: 0, passed: false, reasons: ['GROQ_API_KEY missing'] } };
  }
  const primaryBudget = {
    topK: env.GROQ_VIDEO_TOP_K_CHUNKS,
    maxChunkChars: env.GROQ_VIDEO_MAX_CHUNK_CHARS,
    maxInputChars: env.GROQ_VIDEO_MAX_INPUT_CHARS,
  };
  const built = buildCompactGroqVideoPrompt(concept, chunks, lowGrounding, primaryBudget);
  log.info('video_script_groq_request', {
    provider: 'groq',
    model: env.GROQ_MODEL,
    reason,
    chunks: built.chunksSent,
    max_output_tokens: env.GROQ_VIDEO_MAX_OUTPUT_TOKENS,
    prompt_chars: built.promptChars,
  });
  let candidate = await generateScriptCandidate({
    provider: 'groq',
    prompt: built.prompt,
    concept,
    chunks,
    lowGrounding,
    options: {
      temperature: 0.35,
      max_tokens: env.GROQ_VIDEO_MAX_OUTPUT_TOKENS,
      repairTokens: 900,
      model: env.GROQ_MODEL,
    },
    logMeta: { chunks: built.chunksSent, prompt_chars: built.promptChars },
  });
  const shouldRetrySmall = !candidate.valid && candidate.error && (
    candidate.error.code === 'ai_context_too_large' ||
    candidate.error.code === 'ai_request_failed' ||
    /token|context|too large|413/i.test(String(candidate.error.message || ''))
  );
  if (!shouldRetrySmall) return candidate;

  const retryBuilt = buildCompactGroqVideoPrompt(concept, chunks, lowGrounding, {
    topK: 2,
    maxChunkChars: 600,
    maxInputChars: Math.min(env.GROQ_VIDEO_MAX_INPUT_CHARS || 12000, 7000),
  });
  log.warn('video_script_groq_retry_small_context', {
    provider: 'groq',
    model: env.GROQ_MODEL,
    chunks: retryBuilt.chunksSent,
    max_output_tokens: 800,
    prompt_chars: retryBuilt.promptChars,
  });
  candidate = await generateScriptCandidate({
    provider: 'groq',
    prompt: retryBuilt.prompt,
    concept,
    chunks,
    lowGrounding,
    options: {
      temperature: 0.3,
      max_tokens: 800,
      repairTokens: 700,
      model: env.GROQ_MODEL,
    },
    logMeta: { chunks: retryBuilt.chunksSent, prompt_chars: retryBuilt.promptChars, retry: 'small_context' },
  });
  return candidate;
}

function selectBestScript(candidates, fallback, threshold) {
  const valid = candidates.filter(c => c && c.valid && c.script);
  const passing = valid.filter(c => c.quality && c.quality.score >= threshold);
  if (passing.length) return passing.sort((a, b) => b.quality.score - a.quality.score)[0];
  if (valid.length) return valid.sort((a, b) => (b.quality.score || 0) - (a.quality.score || 0))[0];
  return fallback;
}

async function generateVideoScriptWithFallback(concept, chunks, lowGrounding, groundingTier = 'moderate') {
  const threshold = env.VIDEO_SCRIPT_MIN_QUALITY_SCORE;
  const fallbackScript = normalizeScript(fallbackVideoScriptM1(concept, chunks, lowGrounding), concept, chunks, lowGrounding);
  const candidates = [];
  const configuredProvider = env.VIDEO_SCRIPT_PROVIDER === 'groq' ? 'groq' : 'ollama';
  const localPrompt = prompts.VIDEO_SCRIPT(concept, chunks, { lowGrounding, groundingTier });

  if (configuredProvider === 'groq') {
    const groq = await generateGroqVideoCandidate(concept, chunks, lowGrounding, 'direct_groq_video_script_provider');
    candidates.push(groq);
    if (!groq.valid && !env.VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS) {
      throw groq.error || new Error('groq_video_script_failed');
    }
    if (groq.valid && !env.VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS) {
      log.info('video_script_selected', { provider: 'groq', quality_score: groq.quality && groq.quality.score });
      return groq.script;
    }
    if ((!groq.valid || !groq.quality.passed) && env.VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS) {
      const local = await generateScriptCandidate({
        provider: 'ollama',
        prompt: localPrompt,
        concept,
        chunks,
        lowGrounding,
        options: { temperature: 0.35, num_ctx: 8192, num_predict: 4000 },
      });
      candidates.push(local);
    }
    const selected = selectBestScript(candidates, { provider: 'fallback', script: fallbackScript, quality: scoreVideoScript(fallbackScript, { concept, chunks, lowGrounding, threshold }), valid: true }, threshold);
    log.info('video_script_selected', { provider: selected.provider, quality_score: selected.quality && selected.quality.score });
    return selected.script;
  }

  const local = await generateScriptCandidate({
    provider: 'ollama',
    prompt: localPrompt,
    concept,
    chunks,
    lowGrounding,
    options: { temperature: 0.35, num_ctx: 8192, num_predict: 4000 },
  });
  candidates.push(local);

  if (local.valid && local.quality.score >= threshold) {
    log.info('video_script_selected', { provider: 'ollama', quality_score: local.quality.score });
    return local.script;
  }

  if (env.VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK) {
    if (isGroqConfigured()) {
      log.warn('video_script_fallback', {
        provider: 'groq',
        reason: local.valid ? 'local script below threshold' : 'local script invalid',
        local_score: local.quality && local.quality.score,
        threshold,
      });
      const groq = await generateGroqVideoCandidate(concept, chunks, lowGrounding, local.valid ? 'local_script_below_threshold' : 'local_script_invalid');
      candidates.push(groq);
      if (groq.valid && groq.quality.passed && (!local.valid || groq.quality.score > local.quality.score)) {
        log.info('video_script_selected', { provider: 'groq', quality_score: groq.quality.score, local_score: local.quality && local.quality.score });
        return groq.script;
      }
    } else {
      log.warn('video_script_groq_fallback_unavailable', { reason: 'missing_groq_api_key' });
    }
  }

  if (local.valid && (env.VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS || !env.VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK)) {
    log.info('video_script_selected', {
      provider: 'ollama',
      quality_score: local.quality.score,
      reasons: (local.quality.reasons || []).slice(0, 4),
    });
    return local.script;
  }

  const fallbackQuality = scoreVideoScript(fallbackScript, { concept, chunks, lowGrounding, threshold });
  log.warn('video_script_selected', { provider: 'fallback', quality_score: fallbackQuality.score });
  return fallbackScript;
}

async function generateVideo({ userId, materialId, concept }) {
  await ai.assertModelsAvailable({ generation: false, embedding: true });
  const db = getDb();
  const ins = db.prepare(`INSERT INTO videos (material_id, user_id, status, created_at) VALUES (?,?,?,?)`);
  const r = ins.run(materialId, userId, 'queued', nowIso());
  const videoId = r.lastInsertRowid;
  const job = jobs.create('video', { userId, videoId });
  enqueue(() => runPipeline({ videoId, userId, materialId, concept, jobId: job.id }));
  return { videoId, jobId: job.id };
}

function storyboardGateFailureMessage(quality) {
  const warnings = quality && quality.storyboard && Array.isArray(quality.storyboard.warnings)
    ? quality.storyboard.warnings
    : [];
  return `storyboard_quality_failed: ${warnings.slice(0, 5).join('; ') || 'storyboard gate did not pass'}`;
}

function storyboardQualityDetails(quality = {}) {
  const storyboardQuality = quality && quality.storyboard || {};
  const warnings = Array.isArray(storyboardQuality.warnings) ? storyboardQuality.warnings : [];
  const classified = storyboardQuality.classified || storyboards.classifyWarnings(warnings);
  return {
    ...storyboardQuality,
    warnings,
    classified,
  };
}

function hasApprovalOverride(quality = {}) {
  return !!(quality && quality.approvalOverride);
}

function storyboardRenderEligibility(prepared) {
  if (!prepared || !prepared.board) {
    return {
      ok: false,
      status: 404,
      code: 'storyboard_not_found',
      message: 'Storyboard not found.',
      details: null,
    };
  }
  const board = prepared.board;
  const quality = prepared.quality || {};
  const details = storyboardQualityDetails(quality);
  const critical = details.classified && Array.isArray(details.classified.critical)
    ? details.classified.critical
    : [];
  const approvedByStatus = board.status === 'approved' || board.status === 'rendering';
  const approvedByOverride = !!board.approved_at && hasApprovalOverride(quality);

  if (!approvedByStatus && !approvedByOverride) {
    return {
      ok: false,
      status: 409,
      code: 'storyboard_not_approved',
      message: 'Approve the storyboard before rendering MP4.',
      details,
    };
  }
  if (critical.length > 0) {
    return {
      ok: false,
      status: 422,
      code: 'storyboard_critical_blockers',
      message: 'Critical storyboard issues must be fixed before rendering MP4.',
      details,
    };
  }
  if (details.passed !== true && !hasApprovalOverride(quality)) {
    return {
      ok: false,
      status: 422,
      code: 'storyboard_quality_failed',
      message: 'Approve anyway before rendering a storyboard with non-critical warnings.',
      details,
    };
  }
  return {
    ok: true,
    details,
    approvedWithWarnings: details.passed !== true && hasApprovalOverride(quality),
  };
}

function assertStoryboardRenderable(prepared) {
  const eligibility = storyboardRenderEligibility(prepared);
  if (!eligibility.ok) {
    throw new HttpError(eligibility.status, eligibility.code, eligibility.message, eligibility.details);
  }
  return eligibility;
}

function isVisualValidationError(err) {
  const message = String(err && err.message || err || '');
  return !!(err && err.visualValidation)
    || /^(unsupported_visual_type|generic_fallback_not_allowed|concept_map_nodes_not_source_backed)/.test(message)
    || /unsupported_visual_type:|generic_fallback_not_allowed:|concept_map_nodes_not_source_backed/.test(message);
}

function storyboardFailureStatus(err) {
  const message = String(err && err.message || err || '');
  const code = String(err && err.code || '');
  return code === 'storyboard_quality_failed'
    || code === 'storyboard_critical_blockers'
    || message.startsWith('storyboard_quality_failed')
    || message.startsWith('storyboard_video_quality_failed')
    || isVisualValidationError(err)
    ? 'needs_review'
    : 'failed';
}

async function generateVideoFromStoryboard({ userId, storyboardId }) {
  const prepared = storyboards.scriptForRender(userId, storyboardId);
  if (!prepared || !prepared.board) throw new HttpError(404, 'storyboard_not_found', 'Storyboard not found.');
  if ((prepared.board.status === 'rendering' || prepared.board.status === 'rendered') && prepared.board.video_id) {
    const activeJob = jobs.listFor(userId).find(j =>
      j.kind === 'video'
      && j.meta
      && Number(j.meta.storyboardId) === Number(storyboardId)
      && ['queued', 'running'].includes(j.status)
    );
    if (activeJob) return { videoId: prepared.board.video_id, jobId: activeJob.id, status: activeJob.status };
    const existing = getVideo(userId, prepared.board.video_id);
    if (existing && existing.status === 'ready') return { videoId: existing.id, jobId: null, status: 'ready' };
  }
  const db = getDb();
  const eligibility = storyboardRenderEligibility(prepared);
  if (!eligibility.ok) {
    if (eligibility.code === 'storyboard_critical_blockers' || eligibility.code === 'storyboard_quality_failed') {
      db.prepare("UPDATE video_storyboards SET status='needs_review', quality_json=?, updated_at=? WHERE id=? AND user_id=?")
        .run(JSON.stringify(prepared.quality || {}), nowIso(), storyboardId, userId);
    }
    throw new HttpError(eligibility.status, eligibility.code, eligibility.message, eligibility.details);
  }
  const ins = db.prepare(`INSERT INTO videos (material_id, user_id, status, created_at, resolved_concept)
                          VALUES (?,?,?,?,?)`);
  const r = ins.run(prepared.board.material_id, userId, 'queued', nowIso(), prepared.board.topic);
  const videoId = r.lastInsertRowid;
  db.prepare("UPDATE video_storyboards SET status='rendering', video_id=?, updated_at=? WHERE id=? AND user_id=?")
    .run(videoId, nowIso(), storyboardId, userId);
  const job = jobs.create('video', { userId, videoId, storyboardId });
  enqueue(() => runStoryboardPipeline({ videoId, userId, storyboardId, jobId: job.id }));
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
    jobs.update(jobId, { status: 'running', progress: 5, stage: 'Resolving video topic...' });

    // 1. Resolve topic + RAG + script
    const conceptInfo = await resolveConcept({ materialId, hint: concept });
    const resolvedConcept = conceptInfo.topic;
    if (!resolvedConcept) {
      throw new Error(`video_topic_resolution_failed: choose a specific CS topic. Candidates: ${(conceptInfo.alternatives || []).map(c => c.topic).join(', ') || 'none'}`);
    }
    const materialRow = db.prepare('SELECT title FROM materials WHERE id=?').get(materialId) || {};
    setStatus('processing', { resolved_concept: resolvedConcept });
    jobs.update(jobId, { progress: 10, stage: `Retrieving source content for ${resolvedConcept}...` });

    const rag = await retrieveLessonContext(materialId, resolvedConcept, { feature: 'video', k: 10, minScore: 0.08, maxMerged: 14 });
    const chunks = rag.chunks || [];
    const uploadedRag = rag.uploaded || rag;
    const lowGrounding = (uploadedRag.chunks || []).length < 2 || uploadedRag.maxScore < 0.16 || uploadedRag.meanScore < 0.10;
    const groundingTier = computeGroundingTier(uploadedRag);
    log.info('video_rag', {
      videoId,
      materialId,
      resolvedConcept,
      conceptSource: conceptInfo.source,
      maxScore: Number(rag.maxScore || 0).toFixed(3),
      meanScore: Number(rag.meanScore || 0).toFixed(3),
      lowGrounding,
      chunks: chunks.map(c => ({ id: c.id, score: Number(c.score || 0).toFixed(3), chapter: c.chapter_title || '' })),
    });
    jobs.update(jobId, { progress: 12, stage: 'Building educational lesson model...' });
    const lesson = await lessons.generateEducationalLesson({
      topic: resolvedConcept,
      title: resolvedConcept,
      materialTitle: materialRow.title || resolvedConcept,
      chunks,
      groundingTier,
      lessonType: lessons.detectLessonType(resolvedConcept),
    });
    const script = normalizeScript(lessons.lessonToVideoScript(lesson), resolvedConcept, chunks, lowGrounding);
    const quality = scoreVideoScript(script, {
      concept: resolvedConcept,
      chunks: uploadedRag.chunks || [],
      lowGrounding,
      threshold: env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
    });
    if (!quality.passed) {
      throw new Error(`video_script_quality_failed: ${(quality.reasons || []).slice(0, 3).join('; ')}`);
    }
    setStatus('processing', {
      script_md: JSON.stringify(script),
      lesson_json: JSON.stringify(lesson),
      storyboard_json: JSON.stringify(script.scenes || script.slides),
      quality_json: JSON.stringify({
        script: quality,
        lesson: lesson.quality || lessons.scoreLesson(lesson),
        resolved_topic: resolvedConcept,
        topic_confidence: conceptInfo.confidence || null,
        topic_source: conceptInfo.source || null,
        source_title: conceptInfo.sourceTitle || materialRow.title || null,
        candidates: conceptInfo.alternatives || [],
      }),
    });
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
        throw new Error('video_canvas_required: install the optional canvas dependency before generating polished tutor videos');
      }
      try {
        await tts.synthesizeSentences(tts._internals.splitSentences(stripChunkRefs(s.narration)), audioFile, {
          pauseMs: env.TTS_PAUSE_MS_SENTENCE,
          sectionPauseMs: env.TTS_PAUSE_MS_SECTION,
        });
        assertAudioFile(audioFile);
      } catch (ttsErr) {
        log.warn(`video_tts_slide_${i}`, `TTS failed, using silence: ${ttsErr.message || ttsErr}`);
        await tts._internals.synthSilence(s.narration, audioFile);
      }
      audioPaths.push(audioFile);
      jobs.update(jobId, { stage: `Rendering slide ${i + 1} of ${script.slides.length}...` });
      let usedAnimatedFrames = false;
      try {
        const audioInfo = await probeMedia(audioFile);
        const audioDuration = mediaDuration(audioInfo) || s.durationTargetSec || 18;
        const framesDir = path.join(workDir, `frames_${i}`);
        const frameRate = 6;
        const frameCount = Math.max(18, Math.min(180, Math.ceil(audioDuration * frameRate) + 2));
        const frames = await slides.renderAnimatedFrames(s, framesDir, frameCount, 'frame', { loopFrames: frameRate * 3 });
        if (frames.length) {
          await ffmpeg([
            '-y',
            '-framerate', String(frameRate),
            '-i', path.join(framesDir, 'frame_%04d.png'),
            '-i', audioFile,
            '-vf', 'fps=30,format=yuv420p',
            '-c:v', 'libx264',
            '-c:a', 'aac', '-b:a', '160k',
            '-shortest',
            segMp4,
          ]);
          usedAnimatedFrames = true;
        }
      } catch (animErr) {
        log.warn(`video_animation_slide_${i}`, animErr.message || animErr);
      }
      if (!usedAnimatedFrames) {
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
      }
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
    const finalArgs = [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      finalPath,
    ];
    if (env.VIDEO_AUDIO_NORMALIZE) {
      const normalizedArgs = finalArgs.slice(0, -1).concat(['-af', 'loudnorm=I=-16:LRA=11:TP=-1.5', finalPath]);
      try {
        await ffmpeg(normalizedArgs);
      } catch (normErr) {
        log.warn('video_loudnorm_fallback', normErr.message || normErr);
        await ffmpeg(finalArgs);
      }
    } else {
      await ffmpeg(finalArgs);
    }

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

async function runStoryboardPipeline({ videoId, userId, storyboardId, jobId }) {
  const db = getDb();
  const setStatus = (s, extra = {}) => {
    const fields = ['status=?'];
    const params = [s];
    for (const [k, v] of Object.entries(extra)) { fields.push(`${k}=?`); params.push(v); }
    params.push(videoId);
    db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id=?`).run(...params);
  };
  const setBoardStatus = (s, extra = {}) => {
    const fields = ['status=?', 'updated_at=?'];
    const params = [s, nowIso()];
    for (const [k, v] of Object.entries(extra)) { fields.push(`${k}=?`); params.push(v); }
    params.push(storyboardId, userId);
    db.prepare(`UPDATE video_storyboards SET ${fields.join(', ')} WHERE id=? AND user_id=?`).run(...params);
  };
  try {
    setStatus('processing');
    setBoardStatus('rendering');
    jobs.update(jobId, { status: 'running', progress: 5, stage: 'Preparing approved storyboard...' });
    const prepared = storyboards.scriptForRender(userId, storyboardId);
    assertStoryboardRenderable(prepared);
    const script = normalizeScript(prepared.script, prepared.board.topic, [], false);
    const quality = scoreVideoScript(script, {
      concept: prepared.board.topic,
      chunks: [],
      lowGrounding: false,
      threshold: (env.STRICT_QUALITY_GATES || env.VIDEO_RENDER_STRICT) ? 0.88 : env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
    });
    if (!quality.passed) {
      throw new Error(`storyboard_video_quality_failed: ${(quality.reasons || []).slice(0, 3).join('; ')}`);
    }
    if (!prepared.visibleTextClean) {
      throw new Error(`storyboard_visible_text_leak: banned term "${prepared.visibleTextBanned}" found in learner-facing content`);
    }
    setStatus('processing', {
      script_md: JSON.stringify(script),
      lesson_json: JSON.stringify(prepared.lesson || {}),
      storyboard_json: JSON.stringify(prepared.board.storyboard),
      quality_json: JSON.stringify({ ...(prepared.quality || {}), renderScript: quality }),
      resolved_concept: prepared.board.topic,
    });
    jobs.update(jobId, { progress: 18, stage: 'Creating narration...' });

    const workDir = path.join(env.UPLOAD_DIR, 'videos', String(videoId));
    fs.mkdirSync(workDir, { recursive: true });
    const segPaths = [];
    const audioPaths = [];
    const remotionReady = renderer.remotionStatus();
    const forceRemotion = env.VIDEO_RENDERER_EXPLICIT && env.VIDEO_RENDERER === 'remotion';
    const forceCanvas = env.VIDEO_RENDERER_EXPLICIT && env.VIDEO_RENDERER === 'canvas';
    const useRemotion = forceRemotion || (!forceCanvas && remotionReady.ok);
    if (useRemotion) {
      if (!remotionReady.ok) throw new Error(`remotion_not_ready: missing ${remotionReady.missing.join(', ')}`);
      jobs.update(jobId, { progress: 19, stage: 'Using Remotion tutor-board renderer...' });
    } else if (!forceCanvas && !remotionReady.ok) {
      jobs.update(jobId, { progress: 19, stage: 'Remotion unavailable; using canvas renderer...' });
    }

    for (let i = 0; i < script.slides.length; i++) {
      const s = script.slides[i];
      const rawScene = prepared.board.storyboard && prepared.board.storyboard.scenes
        ? prepared.board.storyboard.scenes[i]
        : null;
      const storyboardScene = rawScene ? storyboards.sanitizeSceneForRender(rawScene) : null;
      const slideImg = path.join(workDir, `slide_${i}.png`);
      const audioFile = path.join(workDir, `audio_${i}.wav`);
      const segMp4 = path.join(workDir, `seg_${i}.mp4`);
      try {
        await tts.synthesizeSentences(tts._internals.splitSentences(stripChunkRefs(s.narration)), audioFile, {
          pauseMs: env.TTS_PAUSE_MS_SENTENCE,
          sectionPauseMs: env.TTS_PAUSE_MS_SECTION,
        });
        assertAudioFile(audioFile);
      } catch (ttsErr) {
        log.warn(`storyboard_tts_slide_${i}`, `TTS failed, using silence: ${ttsErr.message || ttsErr}`);
        await tts._internals.synthSilence(s.narration, audioFile);
      }
      audioPaths.push(audioFile);
      jobs.update(jobId, { stage: `Rendering approved scene ${i + 1} of ${script.slides.length}...` });
      let usedAnimatedFrames = false;
      try {
        const audioInfo = await probeMedia(audioFile);
        const audioDuration = mediaDuration(audioInfo) || s.durationTargetSec || 18;
        if (useRemotion) {
          const visualMp4 = path.join(workDir, `remotion_scene_${i}.mp4`);
          await renderer.renderRemotionScene({
            slide: s,
            scene: storyboardScene || {},
            outPath: visualMp4,
            durationSec: audioDuration,
            fps: 30,
            onProgress: ({ progress }) => {
              if (Number.isFinite(progress)) {
                jobs.update(jobId, {
                  stage: `Rendering Remotion scene ${i + 1} of ${script.slides.length} (${Math.round(progress * 100)}%)...`,
                });
              }
            },
          });
          await ffmpeg([
            '-y',
            '-i', visualMp4,
            '-i', audioFile,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '160k',
            '-shortest',
            segMp4,
          ]);
          usedAnimatedFrames = true;
        } else {
          const framesDir = path.join(workDir, `frames_${i}`);
          const frameRate = 6;
          const frameCount = Math.max(18, Math.min(180, Math.ceil(audioDuration * frameRate) + 2));
          const frames = await slides.renderAnimatedFrames(s, framesDir, frameCount, 'frame', { loopFrames: frameRate * 3 });
          if (frames.length) {
            await ffmpeg([
              '-y',
              '-framerate', String(frameRate),
              '-i', path.join(framesDir, 'frame_%04d.png'),
              '-i', audioFile,
              '-vf', 'fps=30,format=yuv420p',
              '-c:v', 'libx264',
              '-c:a', 'aac', '-b:a', '160k',
              '-shortest',
              segMp4,
            ]);
            usedAnimatedFrames = true;
          }
        }
      } catch (animErr) {
        log.warn(`storyboard_animation_slide_${i}`, animErr.message || animErr);
        if (isVisualValidationError(animErr)) throw animErr;
        if (useRemotion && forceRemotion) throw animErr;
        if (useRemotion) {
          jobs.update(jobId, { stage: `Remotion scene ${i + 1} runtime failure; falling back to canvas after visual validation passed...` });
        }
      }
      if (!usedAnimatedFrames) {
        const renderedPath = await slides.renderSlide(s, slideImg);
        if (renderedPath.endsWith('.svg')) {
          throw new Error('video_canvas_required: install the optional canvas dependency before rendering storyboard videos');
        }
        await ffmpeg([
          '-y',
          '-loop', '1', '-i', renderedPath,
          '-i', audioFile,
          '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '160k',
          '-shortest', '-r', '30',
          segMp4,
        ]);
      }
      segPaths.push(segMp4);
      jobs.update(jobId, { progress: 18 + Math.floor(((i + 1) / script.slides.length) * 70) });
    }

    const listFile = path.join(workDir, 'segments.txt');
    fs.writeFileSync(listFile, segPaths.map(p => `file '${concatListPath(p)}'`).join('\n'));
    const audioManifest = path.join(workDir, 'audio_manifest.json');
    fs.writeFileSync(audioManifest, JSON.stringify({ audio: audioPaths }, null, 2));
    const finalPath = path.join(env.UPLOAD_DIR, 'videos', `${videoId}.mp4`);
    jobs.update(jobId, { progress: 92, stage: 'Merging approved storyboard video...' });
    const finalArgs = [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      finalPath,
    ];
    if (env.VIDEO_AUDIO_NORMALIZE) {
      const normalizedArgs = finalArgs.slice(0, -1).concat(['-af', 'loudnorm=I=-16:LRA=11:TP=-1.5', finalPath]);
      try { await ffmpeg(normalizedArgs); }
      catch (normErr) {
        log.warn('storyboard_loudnorm_fallback', normErr.message || normErr);
        await ffmpeg(finalArgs);
      }
    } else {
      await ffmpeg(finalArgs);
    }
    const mediaInfo = await probeMedia(finalPath);
    if (!hasStream(mediaInfo, 'video')) throw new Error('video_render_failed: no video stream in output');
    if (!hasStream(mediaInfo, 'audio')) throw new Error('video_render_failed: no audio stream in output');
    const duration = mediaDuration(mediaInfo);
    setStatus('ready', { output_path: finalPath, slides_dir: workDir, audio_path: audioManifest, duration_s: duration });
    setBoardStatus('rendered', { rendered_at: nowIso(), video_id: videoId });
    jobs.update(jobId, { status: 'completed', progress: 100, stage: 'Approved storyboard video ready.', result: { videoId, output_path: finalPath, duration_s: duration } });
  } catch (e) {
    log.error('storyboard_video_pipeline', e.message || e);
    setStatus('failed');
    setBoardStatus(storyboardFailureStatus(e));
    jobs.update(jobId, { status: 'failed', error: String(e.message || e), stage: 'Storyboard render failed.' });
  }
}

function getVideo(userId, id) {
  const db = getDb();
  return db.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').get(id, userId);
}

module.exports = { generateVideo, generateVideoFromStoryboard, getVideo };
module.exports._internals = {
  FFMPEG_BIN,
  FFPROBE_BIN,
  ffmpeg,
  ffprobe,
  probeMedia,
  renderSlideFrameWithFfmpeg,
  resolveConcept,
  fallbackVideoScriptM1,
  normalizeScript,
  generateVideoScriptWithFallback,
  scoreVideoScript,
  preferredDiagramVisualType,
  isVisualValidationError,
  storyboardRenderEligibility,
  storyboardFailureStatus,
};
