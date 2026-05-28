'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const codeWindow = require('../utils/code-window');

const W = 1280;
const H = 720;
const CARD = '#ffffff';
const LINE = '#cbd5e1';
const INK = '#0f172a';
const MUTED = '#64748b';
const BLUE = '#2563eb';
const MAX_BULLETS = Math.max(3, Math.min(5, Number(env.VIDEO_SLIDE_MAX_BULLETS) || 5));
const VISUAL_TYPES = [
  'mindmap',
  'flow',
  'comparison',
  'code',
  'summary',
  'class_diagram',
  'tree',
  'stack_queue',
  'linkedlist',
  'hash_table',
  'bigo_chart',
  'cards',
  'table',
  'source_reference',
  'none',
];

let _canvas = null;
function loadCanvas() {
  if (_canvas !== null) return _canvas;
  try { _canvas = require('canvas'); }
  catch (_) { _canvas = false; }
  return _canvas;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeVisibleText(value) {
  return String(value || '')
    .replace(/\[chunk:\s*\d+\]/gi, '')
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
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u03b1/g, 'alpha')
    .replace(/\u2248/g, '~=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u00d7/g, 'x')
    .replace(/\u00b2/g, '^2')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanList(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source
    .map(v => normalizeVisibleText(v))
    .filter(Boolean);
}

function compactText(text, max = 72) {
  const normalized = normalizeVisibleText(text);
  if (normalized.length <= max) return normalized;
  const normalizedSlice = normalized.slice(0, max).replace(/\s+\S*$/, '').trim();
  return (normalizedSlice || normalized.slice(0, max).trim()).replace(/[,;:\-.]+$/g, '');
}

function inset(region, pad) {
  return { x: region.x + pad, y: region.y + pad, w: region.w - pad * 2, h: region.h - pad * 2 };
}

function setFont(ctx, size, weight = '500', family = 'Arial') {
  ctx.font = `${weight} ${size}px ${family}`;
}

function splitLongWord(word, maxChars) {
  const out = [];
  let value = String(word || '');
  while (value.length > maxChars) {
    out.push(value.slice(0, Math.max(1, maxChars - 1)) + '-');
    value = value.slice(Math.max(1, maxChars - 1));
  }
  if (value) out.push(value);
  return out;
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const approxChars = Math.max(8, Math.floor(maxWidth / 9));
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    .flatMap(w => w.length > approxChars ? splitLongWord(w, approxChars) : [w]);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const original = words.join(' ');
  if (lines.length === maxLines && original.length > lines.join(' ').length) {
    lines[maxLines - 1] = ellipsizeToWidth(ctx, lines[maxLines - 1], maxWidth);
  }
  return lines;
}

function ellipsizeToWidth(ctx, text, maxWidth) {
  let value = String(text || '').trim();
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return value.trimEnd();
}

function fitFontSize(ctx, text, maxWidth, maxLines, startPx, minPx, weight = '500', family = 'Arial') {
  for (let size = startPx; size >= minPx; size--) {
    setFont(ctx, size, weight, family);
    const lines = wrapText(ctx, text, maxWidth, maxLines + 1);
    if (lines.length <= maxLines) return size;
  }
  return minPx;
}

function drawTextBox(ctx, text, region, options = {}) {
  const {
    color = INK,
    startPx = 24,
    minPx = 14,
    weight = '500',
    family = 'Arial',
    maxLines = 3,
    lineGap = 6,
    align = 'left',
    valign = 'top',
  } = options;
  const size = fitFontSize(ctx, text, region.w, maxLines, startPx, minPx, weight, family);
  setFont(ctx, size, weight, family);
  const lines = wrapText(ctx, text, region.w, maxLines);
  const lineHeight = Math.ceil(size * 1.2) + lineGap;
  const totalH = lines.length * lineHeight - lineGap;
  let y = region.y;
  if (valign === 'center') y += Math.max(0, (region.h - totalH) / 2);
  if (valign === 'bottom') y += Math.max(0, region.h - totalH);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  for (const line of lines) {
    let x = region.x;
    if (align === 'center') x += Math.max(0, (region.w - ctx.measureText(line).width) / 2);
    if (align === 'right') x += Math.max(0, region.w - ctx.measureText(line).width);
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return { size, lines, height: totalH };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 2) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawCard(ctx, region, label) {
  fillRoundRect(ctx, region.x, region.y, region.w, region.h, 14, CARD, LINE, 2);
  if (label) {
    setFont(ctx, 16, '700');
    ctx.fillStyle = BLUE;
    ctx.textBaseline = 'top';
    ctx.fillText(String(label).toUpperCase(), region.x + 22, region.y + 18);
  }
}

function drawBox(ctx, text, region, fill = '#dbeafe', stroke = '#94a3b8', options = {}) {
  fillRoundRect(ctx, region.x, region.y, region.w, region.h, options.radius || 12, fill, stroke, 2);
  drawTextBox(ctx, compactText(text, options.maxChars || 54), inset(region, options.pad || 12), {
    startPx: options.startPx || 19,
    minPx: options.minPx || 13,
    weight: options.weight || '700',
    maxLines: options.maxLines || 2,
    align: options.align || 'left',
    valign: options.valign || 'center',
    color: options.color || INK,
    family: options.family || 'Arial',
  });
}

function drawLine(ctx, x1, y1, x2, y2, color = '#94a3b8', width = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArrow(ctx, x1, y1, x2, y2, color = '#334155', width = 3) {
  drawLine(ctx, x1, y1, x2, y2, color, width);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function getSlideText(slide) {
  return [
    slide.topic,
    slide.slideType,
    slide.slide_type,
    slide.title,
    ...(slide.bullets || []),
    ...(slide.visual_nodes || []),
  ].join(' ').toLowerCase();
}

function inferVisualType(slide) {
  const nested = slide.visual && slide.visual.type;
  const explicit = slide.visual_type || nested;
  if (VISUAL_TYPES.includes(explicit)) return explicit;
  const text = getSlideText(slide);
  if (text.includes('linked list') || text.includes('linkedlist')) return 'linkedlist';
  if (text.includes('hash table') || text.includes('hashmap') || text.includes('hash map') || text.includes('hash function') || text.includes('collision') || text.includes('load factor') || text.includes('bucket')) return 'hash_table';
  if (text.includes('big-o') || text.includes('big o') || text.includes('complexity') || /o\([^)]+\)/.test(text)) return 'bigo_chart';
  if (text.includes('stack') || text.includes('queue') || text.includes('fifo') || text.includes('lifo')) return 'stack_queue';
  if (text.includes('tree') || text.includes('bst') || text.includes('binary search')) return 'tree';
  if (text.includes('class') || text.includes('inheritance') || text.includes('encapsulation') || text.includes('polymorphism')) return 'class_diagram';
  if ((slide.slideType || slide.slide_type) === 'code' || slide.example_code) return 'code';
  if ((slide.slideType || slide.slide_type) === 'step_by_step') return 'flow';
  if ((slide.slideType || slide.slide_type) === 'mistakes' || (slide.slideType || slide.slide_type) === 'analogy') return 'comparison';
  if ((slide.slideType || slide.slide_type) === 'recap') return 'summary';
  return 'mindmap';
}

function computeLayout(slide, width = W, height = H) {
  const header = { x: 64, y: 18, w: width - 128, h: 72 };
  return {
    mode: 'tutor_board',
    header,
    visual: { x: 64, y: 118, w: width - 128, h: 444 },
    bullets: { x: 64, y: 584, w: width - 128, h: 82 },
  };
}

function slideVisualData(slide, bullets) {
  const visual = slide.visual || {};
  const nodes = cleanList(slide.visual_nodes && slide.visual_nodes.length ? slide.visual_nodes : visual.nodes, [slide.title, ...bullets])
    .slice(0, 10);
  const edges = (Array.isArray(slide.visual_edges) && slide.visual_edges.length ? slide.visual_edges : visual.edges || [])
    .filter(e => Array.isArray(e) && e.length >= 2)
    .map(e => [String(e[0] || '').trim(), String(e[1] || '').trim()])
    .filter(e => e[0] && e[1])
    .slice(0, 12);
  return {
    type: inferVisualType(slide),
    nodes,
    edges,
    details: slide.visual_node_details || visual.node_details || {},
    operations: cleanList(slide.operations && slide.operations.length ? slide.operations : visual.operations, []),
    caption: slide.caption || visual.caption || '',
    imagePath: slide.image_path || slide.imagePath || visual.imagePath || visual.image_path || '',
    imageUrl: slide.image_url || slide.imageUrl || visual.imageUrl || visual.image_url || '',
    sourceVisualId: slide.source_visual_id || slide.sourceVisualId || visual.sourceVisualId || visual.source_visual_id || null,
    sourcePage: slide.source_page || slide.sourcePage || visual.sourcePage || visual.source_page || null,
    slideNumber: slide.slide_number || slide.slideNumber || visual.slideNumber || visual.slide_number || null,
  };
}

function drawBullets(ctx, bullets, region) {
  drawCard(ctx, region, 'Focus');
  const content = inset(region, 18);
  content.y += 32;
  content.h -= 32;
  const safeBullets = bullets.slice(0, 2);
  let x = content.x;
  const y = content.y + 2;
  safeBullets.forEach((item, i) => {
    const label = compactText(item, 34);
    setFont(ctx, 18, '700');
    const w = Math.min(360, Math.max(132, ctx.measureText(label).width + 42));
    fillRoundRect(ctx, x, y, w, 38, 19, i === 0 ? '#dbeafe' : '#dcfce7', i === 0 ? BLUE : '#16a34a', 2);
    drawTextBox(ctx, label, { x: x + 18, y: y + 8, w: w - 36, h: 22 }, {
      startPx: 17,
      minPx: 12,
      weight: '700',
      maxLines: 1,
      align: 'center',
    });
    x += w + 16;
  });
}

function drawCallouts(ctx, callouts, region) {
  const items = cleanList(callouts, []).slice(0, 3);
  if (!items.length) return;
  drawCard(ctx, region, 'Callout');
  const content = inset(region, 18);
  content.y += 34;
  content.h -= 34;
  const gap = 10;
  const boxH = Math.max(42, Math.floor((content.h - gap * (items.length - 1)) / items.length));
  items.forEach((item, i) => {
    drawBox(ctx, item, { x: content.x, y: content.y + i * (boxH + gap), w: content.w, h: boxH }, '#fef9c3', '#f59e0b', {
      startPx: 18,
      minPx: 13,
      maxLines: 2,
      maxChars: 86,
    });
  });
}

function drawMindmap(ctx, slide, visual, region, summary = false) {
  const nodes = visual.nodes.length ? visual.nodes : [slide.title || 'Concept'];
  const r = inset(region, 38);
  const center = { x: r.x + r.w / 2 - 112, y: r.y + r.h / 2 - 46, w: 224, h: 92 };
  const around = nodes.slice(1, 7);
  const pos = [
    { x: r.x + 12, y: r.y + 24 },
    { x: r.x + r.w - 196, y: r.y + 24 },
    { x: r.x + 12, y: r.y + r.h - 92 },
    { x: r.x + r.w - 196, y: r.y + r.h - 92 },
    { x: r.x + r.w / 2 - 92, y: r.y },
    { x: r.x + r.w / 2 - 92, y: r.y + r.h - 72 },
  ];
  around.forEach((_, i) => drawLine(ctx, center.x + center.w / 2, center.y + center.h / 2, pos[i].x + 92, pos[i].y + 38));
  drawBox(ctx, nodes[0], center, summary ? '#ede9fe' : '#dbeafe', BLUE, { align: 'center', maxLines: 2 });
  around.forEach((node, i) => drawBox(ctx, node, { x: pos[i].x, y: pos[i].y, w: 184, h: 76 }, ['#dcfce7', '#fef3c7', '#fce7f3'][i % 3]));
}

function drawFlow(ctx, visual, region) {
  const nodes = (visual.nodes.length ? visual.nodes : ['Step 1', 'Step 2', 'Step 3']).slice(0, 5);
  const r = inset(region, 34);
  const gap = 24;
  const boxW = Math.min(170, Math.floor((r.w - gap * (nodes.length - 1)) / nodes.length));
  const boxH = Math.min(100, Math.max(74, r.h * 0.36));
  const y = r.y + r.h / 2 - boxH / 2;
  nodes.forEach((node, i) => {
    const x = r.x + i * (boxW + gap);
    drawBox(ctx, node, { x, y, w: boxW, h: boxH }, ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'][i % 4]);
    if (i < nodes.length - 1) drawArrow(ctx, x + boxW + 4, y + boxH / 2, x + boxW + gap - 7, y + boxH / 2);
  });
}

function drawComparison(ctx, visual, bullets, region) {
  const r = inset(region, 34);
  const gap = 26;
  const colW = Math.floor((r.w - gap) / 2);
  const leftTitle = visual.nodes[0] || 'Idea A';
  const rightTitle = visual.nodes[1] || 'Idea B';
  drawBox(ctx, leftTitle, { x: r.x, y: r.y, w: colW, h: 64 }, '#dbeafe', BLUE, { align: 'center' });
  drawBox(ctx, rightTitle, { x: r.x + colW + gap, y: r.y, w: colW, h: 64 }, '#dcfce7', '#16a34a', { align: 'center' });
  const items = bullets.slice(0, 4);
  const itemH = Math.min(74, Math.floor((r.h - 94) / 2));
  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawBox(ctx, item, {
      x: r.x + col * (colW + gap) + 18,
      y: r.y + 92 + row * (itemH + 24),
      w: colW - 36,
      h: itemH,
    }, col ? '#f0fdf4' : '#eff6ff');
  });
}

function drawCardsVisual(ctx, visual, region) {
  const nodes = (visual.nodes.length ? visual.nodes : ['Source concept', 'Supporting detail', 'Review question']).slice(0, 6);
  const r = inset(region, 26);
  const cols = nodes.length > 3 ? 3 : Math.max(1, nodes.length);
  const rows = Math.ceil(nodes.length / cols);
  const gap = 16;
  const cardW = Math.floor((r.w - gap * (cols - 1)) / cols);
  const cardH = Math.floor((r.h - gap * (rows - 1)) / rows);
  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawBox(ctx, node, {
      x: r.x + col * (cardW + gap),
      y: r.y + row * (cardH + gap),
      w: cardW,
      h: Math.max(70, cardH),
    }, ['#dbeafe', '#dcfce7', '#fef3c7'][i % 3], '#94a3b8', { align: 'center', maxLines: 3 });
  });
}

function drawTableVisual(ctx, visual, region) {
  const rows = (visual.operations.length ? visual.operations : visual.nodes).slice(0, 5);
  const r = inset(region, 26);
  const rowH = Math.max(50, Math.floor(r.h / Math.max(1, rows.length)));
  rows.forEach((row, i) => {
    const y = r.y + i * rowH;
    fillRoundRect(ctx, r.x, y, r.w, rowH - 8, 8, i % 2 ? '#f8fafc' : '#eff6ff', '#cbd5e1', 1.5);
    const parts = String(row || '').split(':');
    drawTextBox(ctx, parts[0] || row, { x: r.x + 16, y: y + 10, w: Math.floor(r.w * 0.34), h: rowH - 20 }, { startPx: 17, minPx: 12, weight: '700', maxLines: 2 });
    drawTextBox(ctx, parts.slice(1).join(':') || '', { x: r.x + Math.floor(r.w * 0.38), y: y + 10, w: Math.floor(r.w * 0.58), h: rowH - 20 }, { startPx: 16, minPx: 11, maxLines: 2 });
  });
}

function drawSourceReference(ctx, slide, visual, region) {
  const r = inset(region, 36);
  const title = visual.caption || slide.title || 'Source reference';
  drawBox(ctx, title, { x: r.x, y: r.y, w: r.w, h: 64 }, '#e0f2fe', BLUE, { align: 'center', startPx: 21 });
  if (visual.image) {
    const imgArea = { x: r.x + 34, y: r.y + 88, w: r.w - 68, h: r.h - 116 };
    fillRoundRect(ctx, imgArea.x, imgArea.y, imgArea.w, imgArea.h, 10, '#f8fafc', '#cbd5e1', 1.5);
    const scale = Math.min(imgArea.w / visual.image.width, imgArea.h / visual.image.height);
    const w = visual.image.width * scale;
    const h = visual.image.height * scale;
    ctx.drawImage(visual.image, imgArea.x + (imgArea.w - w) / 2, imgArea.y + (imgArea.h - h) / 2, w, h);
    return;
  }
  const nodes = (visual.nodes.length ? visual.nodes : slide.bullets || []).slice(0, 4);
  nodes.forEach((node, i) => {
    drawBox(ctx, node, { x: r.x + 34, y: r.y + 104 + i * 58, w: r.w - 68, h: 46 }, i % 2 ? '#f0fdf4' : '#fef3c7', '#94a3b8', { maxLines: 1 });
  });
}

function drawNoVisual(ctx, slide, bullets, region) {
  const r = inset(region, 54);
  drawTextBox(ctx, slide.title || 'Source-led explanation', { x: r.x, y: r.y + 34, w: r.w, h: 80 }, {
    color: BLUE,
    startPx: 30,
    minPx: 18,
    weight: '700',
    align: 'center',
    maxLines: 2,
  });
  drawTextBox(ctx, (bullets || []).join('  |  ') || 'Follow the narration and source-backed takeaway.', { x: r.x, y: r.y + 150, w: r.w, h: 160 }, {
    color: INK,
    startPx: 24,
    minPx: 15,
    align: 'center',
    maxLines: 4,
  });
}

function parseHighlightLines(focus) {
  if (!focus) return [];
  if (Array.isArray(focus.highlightLines) && focus.highlightLines.length) {
    return focus.highlightLines.map(Number).filter(Number.isFinite);
  }
  const match = String(focus.lineRange || '').match(/(\d+)\s*(?:-\s*(\d+))?/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const lines = [];
  for (let n = Math.min(start, end); n <= Math.max(start, end); n++) lines.push(n);
  return lines;
}

function drawCode(ctx, slide, bullets, region) {
  const focus = slide.code_focus || slide.codeFocus || null;
  const r = inset(region, 42);
  fillRoundRect(ctx, r.x, r.y, r.w, r.h, 14, '#111827', '#38bdf8', 2);
  const content = inset(r, 24);
  const explanationH = focus && focus.explanation ? Math.min(136, Math.max(94, Math.floor(content.h * 0.24))) : 0;
  const codeArea = { x: content.x, y: content.y, w: content.w, h: content.h - explanationH };
  const maxLines = Math.max(5, Math.floor(codeArea.h / 28));
  const normalized = codeWindow.normalizeCodeWindow({
    ...(focus || {}),
    content: (focus && focus.content) || slide.example_code || bullets.join('\n'),
    highlightLines: focus && focus.highlightLines || parseHighlightLines(focus),
  }, { maxVisibleLines: maxLines, contextBefore: 2 });
  const visible = normalized.displayLines;
  const highlights = normalized.highlightLines || [];
  let fontSize = 19;
  for (; fontSize >= 15; fontSize--) {
    setFont(ctx, fontSize, '500', 'Consolas, monospace');
    if (visible.every(line => ctx.measureText(`${String(line.number).padStart(2, ' ')}  ${line.text}`).width <= codeArea.w)) break;
  }
  setFont(ctx, fontSize, '500', 'Consolas, monospace');
  ctx.textBaseline = 'top';
  const lineHeight = Math.ceil(fontSize * 1.45);
  visible.forEach((line, i) => {
    const y = codeArea.y + i * lineHeight;
    const active = highlights.includes(line.number);
    if (active) fillRoundRect(ctx, codeArea.x - 8, y - 4, codeArea.w + 16, lineHeight, 8, '#1e3a8a', '#38bdf8', 1);
    ctx.fillStyle = active ? '#ffffff' : '#93c5fd';
    ctx.fillText(String(line.number).padStart(2, ' '), codeArea.x, y);
    ctx.fillStyle = active ? '#e0f2fe' : '#cbd5e1';
    ctx.fillText(ellipsizeToWidth(ctx, line.text, codeArea.w - 48), codeArea.x + 44, y);
  });
  if (focus && focus.explanation) {
    drawTextBox(ctx, focus.explanation, { x: content.x, y: content.y + content.h - explanationH + 6, w: content.w, h: explanationH - 8 }, {
      color: '#dbeafe',
      startPx: 19,
      minPx: 12,
      weight: '600',
      maxLines: 5,
    });
  }
}

function drawUmlClassBox(ctx, name, detail, box, fill, stroke) {
  fillRoundRect(ctx, box.x, box.y, box.w, box.h, 10, fill, stroke, 2);
  const titleH = 36;
  const fieldH = Math.max(30, Math.floor((box.h - titleH) * 0.46));
  drawTextBox(ctx, name, { x: box.x + 10, y: box.y + 9, w: box.w - 20, h: 24 }, {
    startPx: 18,
    minPx: 13,
    weight: '700',
    align: 'center',
    maxLines: 1,
  });
  drawLine(ctx, box.x, box.y + titleH, box.x + box.w, box.y + titleH, stroke, 2);
  drawLine(ctx, box.x, box.y + titleH + fieldH, box.x + box.w, box.y + titleH + fieldH, stroke, 2);
  const fields = (detail && detail.fields || []).slice(0, 2);
  const methods = (detail && detail.methods || []).slice(0, 2);
  setFont(ctx, 13, '500', 'Consolas, monospace');
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  const fieldLines = fields.length ? fields : ['state'];
  const methodLines = methods.length ? methods : ['behavior()'];
  fieldLines.forEach((line, i) => {
    ctx.fillText(ellipsizeToWidth(ctx, `- ${line}`, box.w - 22), box.x + 12, box.y + titleH + 9 + i * 18);
  });
  methodLines.forEach((line, i) => {
    ctx.fillText(ellipsizeToWidth(ctx, `+ ${line}`, box.w - 22), box.x + 12, box.y + titleH + fieldH + 9 + i * 18);
  });
}

function drawClassDiagram(ctx, slide, visual, bullets, region) {
  if (visual.edges && visual.edges.length && visual.nodes && visual.nodes.length >= 2) {
    const r = inset(region, 24);
    const nodeNames = visual.nodes.slice(0, 5);
    const parentCandidates = visual.edges.map(e => e[1]);
    const parent = parentCandidates.find(name => nodeNames.includes(name)) || nodeNames[0];
    const children = nodeNames.filter(n => n !== parent).slice(0, 3);
    const details = visual.details || {};
    const parentBox = { x: r.x + r.w / 2 - 150, y: r.y + 8, w: 300, h: 118 };
    drawUmlClassBox(ctx, parent, details[parent], parentBox, '#dbeafe', BLUE);
    const childY = r.y + Math.min(234, r.h - 132);
    const gap = 26;
    const childW = Math.min(240, Math.floor((r.w - gap * Math.max(0, children.length - 1)) / Math.max(1, children.length)));
    children.forEach((child, i) => {
      const totalW = children.length * childW + (children.length - 1) * gap;
      const x = r.x + r.w / 2 - totalW / 2 + i * (childW + gap);
      const box = { x, y: childY, w: childW, h: 118 };
      drawArrow(ctx, box.x + box.w / 2, box.y - 2, parentBox.x + parentBox.w / 2, parentBox.y + parentBox.h + 4, '#334155', 3);
      drawUmlClassBox(ctx, child, details[child], box, '#dcfce7', '#16a34a');
    });
    const caption = visual.caption || 'extends means each child is a specialized kind of the parent';
    drawTextBox(ctx, caption, { x: r.x, y: r.y + r.h - 34, w: r.w, h: 26 }, {
      color: MUTED,
      startPx: 18,
      minPx: 13,
      align: 'center',
      maxLines: 1,
    });
    return;
  }
  const r = inset(region, 18);
  const className = visual.nodes[0] || slide.title || 'ClassName';
  const fields = bullets.filter(b => /field|property|private|data|state|attribute/i.test(b)).slice(0, 3);
  const methods = bullets.filter(b => /method|public|function|operation|get|set|use/i.test(b)).slice(0, 3);
  const splitAt = Math.max(1, Math.ceil(bullets.length / 2));
  const safeFields = (fields.length ? fields : bullets.slice(0, splitAt)).map(b => compactText(b.replace(/^-+\s*/, ''), 56));
  const safeMethods = (methods.length ? methods : bullets.slice(splitAt)).map(b => compactText(b.replace(/^-+\s*/, ''), 56));
  const box = { x: r.x + r.w / 2 - 260, y: r.y + 8, w: 520, h: Math.min(282, r.h - 16) };
  const fieldSep = box.y + 66;
  const methodSep = box.y + Math.floor(box.h * 0.58);
  fillRoundRect(ctx, box.x, box.y, box.w, box.h, 12, '#f8fafc', BLUE, 2);
  drawTextBox(ctx, className, { x: box.x + 20, y: box.y + 16, w: box.w - 40, h: 38 }, {
    startPx: 26,
    minPx: 18,
    weight: '700',
    align: 'center',
    maxLines: 1,
  });
  drawLine(ctx, box.x, fieldSep, box.x + box.w, fieldSep, BLUE, 2);
  drawLine(ctx, box.x, methodSep, box.x + box.w, methodSep, BLUE, 2);
  const fieldLines = safeFields.length ? safeFields : ['- private state'];
  const methodLines = safeMethods.length ? safeMethods : ['+ public behavior'];
  setFont(ctx, 18, '500', 'Consolas, monospace');
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  const fieldMax = Math.max(1, Math.floor((methodSep - fieldSep - 14) / 24));
  const methodMax = Math.max(1, Math.floor((box.y + box.h - methodSep - 14) / 24));
  fieldLines.slice(0, fieldMax).forEach((line, i) => ctx.fillText(ellipsizeToWidth(ctx, `- ${line}`, box.w - 40), box.x + 24, fieldSep + 14 + i * 24));
  methodLines.slice(0, methodMax).forEach((line, i) => ctx.fillText(ellipsizeToWidth(ctx, `+ ${line}`, box.w - 40), box.x + 24, methodSep + 14 + i * 24));
}

function drawTree(ctx, visual, region) {
  const nodes = (visual.nodes.length ? visual.nodes : ['Root', 'Left', 'Right', 'Leaf A', 'Leaf B', 'Leaf C', 'Leaf D']).slice(0, 10);
  const r = inset(region, 42);
  const levels = [[0], [1, 2], [3, 4, 5, 6], [7, 8, 9]];
  const levelGap = Math.min(92, r.h / Math.max(3, levels.filter(l => l.some(i => i < nodes.length)).length));
  const positions = {};
  levels.forEach((indexes, level) => {
    const valid = indexes.filter(i => i < nodes.length);
    const spacing = r.w / (valid.length + 1);
    valid.forEach((idx, pos) => {
      positions[idx] = { x: r.x + spacing * (pos + 1), y: r.y + 26 + level * levelGap };
    });
  });
  Object.keys(positions).map(Number).forEach(i => {
    if (i === 0) return;
    const parent = Math.floor((i - 1) / 2);
    if (positions[parent]) drawLine(ctx, positions[parent].x, positions[parent].y + 24, positions[i].x, positions[i].y - 24, '#94a3b8', 3);
  });
  Object.entries(positions).forEach(([idx, p]) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
    ctx.fillStyle = Number(idx) === 0 ? '#dbeafe' : '#dcfce7';
    ctx.fill();
    ctx.strokeStyle = Number(idx) === 0 ? BLUE : '#16a34a';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawTextBox(ctx, nodes[Number(idx)], { x: p.x - 28, y: p.y - 13, w: 56, h: 28 }, {
      startPx: 16,
      minPx: 10,
      weight: '700',
      align: 'center',
      valign: 'center',
      maxLines: 1,
    });
  });
}

function drawStackQueue(ctx, slide, visual, region) {
  const text = getSlideText(slide);
  const isQueue = text.includes('queue') || text.includes('fifo');
  const rawItems = (visual.nodes.length ? visual.nodes : ['A', 'B', 'C', 'D'])
    .filter(n => !/^(top|front|rear)$/i.test(String(n || '').trim()));
  const items = rawItems.length ? rawItems.slice(0, 6) : ['A', 'B', 'C', 'D'];
  const ops = cleanList(visual.operations, []);
  const r = inset(region, 52);
  if (!isQueue) {
    const boxW = Math.min(360, r.w * 0.45);
    const boxH = Math.min(54, (r.h - 70) / items.length);
    const x = r.x + r.w / 2 - boxW / 2;
    const baseY = r.y + r.h - boxH - 30;
    items.forEach((item, i) => {
      const y = baseY - i * (boxH + 6);
      drawBox(ctx, item, { x, y, w: boxW, h: boxH }, ['#dbeafe', '#dcfce7', '#fef3c7'][i % 3], '#94a3b8', { align: 'center', maxLines: 1 });
    });
    drawArrow(ctx, x - 96, baseY - (items.length - 1) * (boxH + 6) + boxH / 2, x - 8, baseY - (items.length - 1) * (boxH + 6) + boxH / 2, '#ef4444', 3);
    drawTextBox(ctx, 'TOP', { x: x - 150, y: baseY - (items.length - 1) * (boxH + 6) + 8, w: 52, h: 24 }, { color: '#ef4444', startPx: 18, minPx: 14, weight: '700' });
    drawTextBox(ctx, ops.length ? ops.join(' / ') : 'push / pop / peek', { x, y: r.y + r.h - 24, w: boxW, h: 24 }, { color: MUTED, startPx: 18, minPx: 14, align: 'center', maxLines: 1 });
    return;
  }
  const gap = 12;
  const boxW = Math.min(128, (r.w - gap * (items.length - 1)) / items.length);
  const boxH = 70;
  const startX = r.x + r.w / 2 - ((boxW * items.length + gap * (items.length - 1)) / 2);
  const y = r.y + r.h / 2 - boxH / 2;
  items.forEach((item, i) => {
    const x = startX + i * (boxW + gap);
    drawBox(ctx, item, { x, y, w: boxW, h: boxH }, ['#dbeafe', '#dcfce7', '#fef3c7'][i % 3], '#94a3b8', { align: 'center', maxLines: 1 });
    if (i < items.length - 1) drawArrow(ctx, x + boxW + 2, y + boxH / 2, x + boxW + gap - 4, y + boxH / 2);
  });
  drawTextBox(ctx, ops.find(o => /dequeue/i.test(o)) || 'dequeue', { x: startX, y: y - 42, w: 120, h: 24 }, { color: '#ef4444', startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
  drawTextBox(ctx, ops.find(o => /enqueue/i.test(o)) || 'enqueue', { x: startX + (items.length - 1) * (boxW + gap) - 20, y: y + boxH + 18, w: 140, h: 24 }, { color: BLUE, startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
}

function drawLinkedList(ctx, visual, region) {
  const rawNodes = (visual.nodes.length ? visual.nodes : ['10', '20', '30'])
    .filter(n => !/^(head|null)$/i.test(String(n || '').trim()));
  const nodes = (rawNodes.length ? rawNodes : ['10', '20', '30']).slice(0, 5);
  const r = inset(region, 42);
  const gap = 28;
  const nodeW = Math.min(150, Math.floor((r.w - gap * (nodes.length + 1) - 84) / nodes.length));
  const nodeH = 72;
  const totalW = nodes.length * nodeW + (nodes.length - 1) * gap + 84;
  const x0 = r.x + r.w / 2 - totalW / 2;
  const y = r.y + r.h / 2 - nodeH / 2;
  drawTextBox(ctx, 'HEAD', { x: x0, y: y + 22, w: 58, h: 24 }, { color: '#16a34a', startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
  drawArrow(ctx, x0 + 62, y + nodeH / 2, x0 + 82, y + nodeH / 2, '#16a34a', 3);
  nodes.forEach((node, i) => {
    const x = x0 + 84 + i * (nodeW + gap);
    fillRoundRect(ctx, x, y, nodeW, nodeH, 10, '#dbeafe', BLUE, 2);
    drawLine(ctx, x + nodeW * 0.65, y, x + nodeW * 0.65, y + nodeH, BLUE, 2);
    drawTextBox(ctx, node, { x: x + 10, y: y + 20, w: nodeW * 0.62 - 18, h: 30 }, { startPx: 18, minPx: 11, weight: '700', align: 'center', maxLines: 1 });
    drawTextBox(ctx, 'next', { x: x + nodeW * 0.65 + 8, y: y + 24, w: nodeW * 0.35 - 16, h: 24 }, { startPx: 14, minPx: 10, weight: '700', align: 'center', maxLines: 1, color: MUTED });
    if (i < nodes.length - 1) drawArrow(ctx, x + nodeW + 2, y + nodeH / 2, x + nodeW + gap - 6, y + nodeH / 2);
    else drawTextBox(ctx, 'NULL', { x: x + nodeW + 16, y: y + 22, w: 64, h: 24 }, { color: '#ef4444', startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
  });
  if (visual.operations && visual.operations.length) {
    drawTextBox(ctx, visual.operations.join(' -> '), { x: r.x, y: r.y + r.h - 28, w: r.w, h: 24 }, {
      color: MUTED,
      startPx: 17,
      minPx: 12,
      align: 'center',
      maxLines: 1,
    });
  }
}

function drawHashTable(ctx, slide, visual, region) {
  const r = inset(region, 40);
  const text = getSlideText(slide);
  const nodes = visual.nodes.length ? visual.nodes : ['key "cat"', 'hash(key)', 'index = hash mod m', 'bucket 2', '(cat, 41)', '(cot, 19)'];
  const ops = visual.operations.length ? visual.operations : ['hash', 'mod', 'lookup/insert', 'collision chain'];
  const keyLabel = nodes.find(n => /\bkey\b/i.test(n)) || nodes[0] || 'key';
  const hashLabel = nodes.find(n => /\bhash\b/i.test(n)) || 'hash(key)';
  const indexLabel = nodes.find(n => /\bindex\b|\bmod\b|\bbucket index\b/i.test(n)) || 'index = hash mod m';
  const bucketLabel = nodes.find(n => /\bbucket\b/i.test(n)) || 'bucket 2';
  const values = nodes
    .filter(n => !/\bkey\b|\bhash\b|\bindex\b|\bmod\b|\bbucket\b|\btable\b/i.test(n))
    .slice(0, 4);
  const chain = values.length ? values : ['(cat, 41)', '(cot, 19)'];

  const topY = r.y + 18;
  const stepW = Math.min(215, (r.w - 96) / 3);
  const stepH = 68;
  const stepX = [r.x + 20, r.x + 20 + stepW + 48, r.x + 20 + (stepW + 48) * 2];
  const stepLabels = [keyLabel, hashLabel, indexLabel];
  stepLabels.forEach((label, i) => {
    drawBox(ctx, label, { x: stepX[i], y: topY, w: stepW, h: stepH }, ['#dbeafe', '#dcfce7', '#fef3c7'][i], ['#2563eb', '#16a34a', '#f59e0b'][i], {
      align: 'center',
      maxLines: 2,
      maxChars: 34,
      startPx: 18,
    });
    if (i < stepLabels.length - 1) {
      drawArrow(ctx, stepX[i] + stepW + 8, topY + stepH / 2, stepX[i + 1] - 10, topY + stepH / 2, '#334155', 3);
    }
  });

  const tableX = r.x + 44;
  const tableY = r.y + 136;
  const rowH = 46;
  const bucketW = 248;
  const slotW = 64;
  const bucketCount = 5;
  drawTextBox(ctx, 'bucket array', { x: tableX, y: tableY - 30, w: bucketW, h: 24 }, { color: MUTED, startPx: 16, minPx: 12, weight: '700', maxLines: 1 });
  for (let i = 0; i < bucketCount; i++) {
    const y = tableY + i * rowH;
    const active = i === 2 || /bucket\s*2|index\s*2/.test(text);
    fillRoundRect(ctx, tableX, y, slotW, rowH - 6, 8, active ? '#dbeafe' : '#f8fafc', active ? BLUE : '#94a3b8', active ? 3 : 2);
    drawTextBox(ctx, String(i), { x: tableX, y: y + 9, w: slotW, h: 24 }, { align: 'center', color: active ? BLUE : MUTED, startPx: 17, minPx: 12, weight: '700', maxLines: 1 });
    fillRoundRect(ctx, tableX + slotW + 10, y, bucketW - slotW - 10, rowH - 6, 8, active ? '#eff6ff' : '#ffffff', active ? BLUE : LINE, active ? 3 : 2);
    drawTextBox(ctx, active ? compactText(bucketLabel, 28) : 'empty', { x: tableX + slotW + 24, y: y + 9, w: bucketW - slotW - 38, h: 24 }, { color: active ? INK : MUTED, startPx: 16, minPx: 11, maxLines: 1 });
  }

  const chainX = tableX + bucketW + 86;
  const chainY = tableY + 2 * rowH - 2;
  drawArrow(ctx, tableX + bucketW + 10, chainY + 20, chainX - 14, chainY + 20, '#2563eb', 4);
  chain.forEach((item, i) => {
    const x = chainX + i * 152;
    const w = 124;
    drawBox(ctx, item, { x, y: chainY - 8, w, h: 58 }, i === 0 ? '#dcfce7' : '#fee2e2', i === 0 ? '#16a34a' : '#ef4444', {
      align: 'center',
      maxLines: 2,
      maxChars: 28,
      startPx: 16,
    });
    if (i < chain.length - 1) drawArrow(ctx, x + w + 4, chainY + 20, x + 146, chainY + 20, '#ef4444', 3);
  });
  drawTextBox(ctx, chain.length > 1 ? 'collision: chain same bucket' : 'slot holds matching entry', { x: chainX, y: chainY + 66, w: Math.min(460, r.x + r.w - chainX), h: 28 }, {
    color: chain.length > 1 ? '#b91c1c' : '#166534',
    startPx: 17,
    minPx: 12,
    weight: '700',
    maxLines: 1,
  });

  const bottom = { x: r.x + 332, y: r.y + r.h - 74, w: r.w - 372, h: 54 };
  const alpha = text.includes('load') || text.includes('resize') ? 'load factor alpha = size / buckets; resize when alpha is high' : 'expected O(1), worst-case O(n) if collisions cluster';
  drawBox(ctx, alpha, bottom, '#f8fafc', '#94a3b8', { maxLines: 2, startPx: 17, minPx: 12, maxChars: 78 });
  drawTextBox(ctx, ops.slice(0, 4).join(' -> '), { x: r.x + 20, y: r.y + r.h - 34, w: 290, h: 24 }, {
    color: MUTED,
    startPx: 16,
    minPx: 11,
    weight: '700',
    maxLines: 1,
  });
}

function drawBigOChart(ctx, slide, region) {
  const text = getSlideText(slide);
  const r = inset(region, 46);
  const chart = { x: r.x + 54, y: r.y + 24, w: r.w - 250, h: r.h - 74 };
  drawLine(ctx, chart.x, chart.y + chart.h, chart.x + chart.w, chart.y + chart.h, '#334155', 3);
  drawLine(ctx, chart.x, chart.y, chart.x, chart.y + chart.h, '#334155', 3);
  drawTextBox(ctx, 'n', { x: chart.x + chart.w - 18, y: chart.y + chart.h + 12, w: 36, h: 24 }, { color: MUTED, startPx: 17, minPx: 13, maxLines: 1 });
  drawTextBox(ctx, 'time', { x: chart.x - 44, y: chart.y - 10, w: 42, h: 24 }, { color: MUTED, startPx: 17, minPx: 13, maxLines: 1 });
  const curves = [
    { key: 'o(1)', label: 'O(1)', color: '#16a34a', f: t => 0.80 },
    { key: 'o(log n)', label: 'O(log n)', color: '#2563eb', f: t => 0.80 - Math.log2(1 + t * 15) / 8 },
    { key: 'o(n)', label: 'O(n)', color: '#eab308', f: t => 0.84 - t * 0.55 },
    { key: 'o(n log n)', label: 'O(n log n)', color: '#f97316', f: t => 0.88 - t * Math.log2(2 + t * 8) / 4.5 },
    { key: 'o(n^2)', label: 'O(n^2)', color: '#ef4444', f: t => 0.92 - t * t * 0.82 },
  ];
  curves.forEach(curve => {
    const highlight = text.includes(curve.key) || (curve.key === 'o(n^2)' && text.includes('quadratic'));
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = highlight ? 5 : 3;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = chart.x + t * chart.w;
      const y = chart.y + Math.max(0.04, Math.min(0.92, curve.f(t))) * chart.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  const legendX = chart.x + chart.w + 34;
  const legendY = chart.y + 18;
  curves.forEach((curve, i) => {
    const highlight = text.includes(curve.key) || (curve.key === 'o(n^2)' && text.includes('quadratic'));
    drawLine(ctx, legendX, legendY + i * 24 + 10, legendX + 24, legendY + i * 24 + 10, curve.color, highlight ? 5 : 3);
    drawTextBox(ctx, curve.label, { x: legendX + 32, y: legendY + i * 24, w: 92, h: 22 }, {
      color: curve.color,
      startPx: highlight ? 17 : 15,
      minPx: 12,
      weight: highlight ? '700' : '500',
      maxLines: 1,
    });
  });
}

function drawVisual(ctx, slide, visual, bullets, region) {
  const type = visual.type;
  if (type === 'none') return drawNoVisual(ctx, slide, bullets, region);
  drawCard(ctx, region, type.replace(/_/g, ' '));
  const content = inset(region, 18);
  content.y += 34;
  content.h -= 34;
  if (type === 'cards') return drawCardsVisual(ctx, visual, content);
  if (type === 'table') return drawTableVisual(ctx, visual, content);
  if (type === 'source_reference') return drawSourceReference(ctx, slide, visual, content);
  if (type === 'flow') return drawFlow(ctx, visual, content);
  if (type === 'comparison') return drawComparison(ctx, visual, bullets, content);
  if (type === 'code') return drawCode(ctx, slide, bullets, content);
  if (type === 'class_diagram') return drawClassDiagram(ctx, slide, visual, bullets, content);
  if (type === 'tree') return drawTree(ctx, visual, content);
  if (type === 'stack_queue') return drawStackQueue(ctx, slide, visual, content);
  if (type === 'linkedlist') return drawLinkedList(ctx, visual, content);
  if (type === 'hash_table') return drawHashTable(ctx, slide, visual, content);
  if (type === 'bigo_chart') return drawBigOChart(ctx, slide, content);
  return drawMindmap(ctx, slide, visual, content, type === 'summary');
}

function drawHeader(ctx, slide, layout) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, 104);
  setFont(ctx, 21, '700');
  ctx.fillStyle = '#bfdbfe';
  ctx.textBaseline = 'top';
  ctx.fillText('NOESIS TUTOR WHITEBOARD', layout.header.x, 22);
  drawTextBox(ctx, slide.title || 'Tutor explanation', { x: layout.header.x, y: 52, w: layout.header.w, h: 38 }, {
    color: '#ffffff',
    startPx: 31,
    minPx: 19,
    weight: '700',
    maxLines: 1,
  });
}

function wrapByChars(text, maxChars, maxLines = 3) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    .flatMap(w => w.length > maxChars ? splitLongWord(w, maxChars) : [w]);
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
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = compactText(lines[maxLines - 1], Math.max(4, maxChars - 1));
  }
  return lines;
}

function svgText(text, x, y, size, color = INK, maxChars = 42, maxLines = 2, weight = '500') {
  return wrapByChars(text, maxChars, maxLines).map((line, i) =>
    `<text x="${x}" y="${y + i * (size + 8)}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`
  ).join('\n');
}

function svgBox(text, x, y, w, h, fill = '#dbeafe', stroke = '#94a3b8') {
  const chars = Math.max(10, Math.floor(w / 14));
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    svgText(compactText(text, 72), x + 14, y + 26, 17, INK, chars, 2, '700'),
  ].join('\n');
}

function renderSvg(slide) {
  const visualType = inferVisualType(slide);
  const layout = computeLayout(slide, W, H);
  const bullets = cleanList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).slice(0, 2);
  const visual = slideVisualData(slide, bullets);
  const bulletLines = bullets.map((b, i) => svgText(`- ${b}`, layout.bullets.x + 24, layout.bullets.y + 74 + i * 54, 19, '#1e293b', Math.floor((layout.bullets.w - 48) / 12), 2)).join('\n');
  const nodeBoxes = visual.nodes.slice(0, 8).map((node, i) => {
    const cols = layout.mode === 'diagram' ? 4 : 3;
    const bw = Math.floor((layout.visual.w - 74) / cols);
    const bh = 68;
    const x = layout.visual.x + 24 + (i % cols) * (bw + 14);
    const y = layout.visual.y + 74 + Math.floor(i / cols) * 88;
    return svgBox(node, x, y, bw, bh, ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'][i % 4]);
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect width="100%" height="104" fill="#0f172a"/>
  <text x="64" y="38" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700" fill="#bfdbfe">NOESIS TUTOR WHITEBOARD</text>
  ${svgText(slide.title || 'Tutor explanation', 64, 82, 29, '#ffffff', 48, 1, '700')}
  <rect x="${layout.bullets.x}" y="${layout.bullets.y}" width="${layout.bullets.w}" height="${layout.bullets.h}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <rect x="${layout.visual.x}" y="${layout.visual.y}" width="${layout.visual.w}" height="${layout.visual.h}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <text x="${layout.bullets.x + 22}" y="${layout.bullets.y + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="${BLUE}">FOCUS</text>
  <text x="${layout.visual.x + 22}" y="${layout.visual.y + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="${BLUE}">${escapeXml(visualType.replace(/_/g, ' ').toUpperCase())}</text>
  ${bulletLines}
  ${nodeBoxes}
</svg>`;
}

function drawPointer(ctx, from, to, label, progress = 1) {
  const eased = 0.5 - Math.cos(Math.max(0, Math.min(1, progress)) * Math.PI) / 2;
  const tip = {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
  };
  drawArrow(ctx, from.x, from.y, tip.x, tip.y, '#ef4444', 5);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 14 + Math.sin(progress * Math.PI * 2) * 3, 0, Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.stroke();
  if (label) {
    fillRoundRect(ctx, from.x - 8, from.y - 42, Math.min(220, Math.max(88, label.length * 9 + 28)), 32, 16, '#fee2e2', '#ef4444', 2);
    drawTextBox(ctx, label, { x: from.x + 8, y: from.y - 35, w: 190, h: 24 }, {
      color: '#991b1b',
      startPx: 15,
      minPx: 11,
      weight: '700',
      maxLines: 1,
    });
  }
}

function drawFocusRing(ctx, region, color = '#ef4444', progress = 1) {
  const pulse = Math.sin(progress * Math.PI * 2);
  const pad = 8 + pulse * 3;
  roundRect(ctx, region.x - pad, region.y - pad, region.w + pad * 2, region.h + pad * 2, 16);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawMovingBadge(ctx, text, x, y, color = '#ef4444') {
  const label = compactText(text, 28);
  setFont(ctx, 16, '700');
  const w = Math.min(220, Math.max(86, ctx.measureText(label).width + 28));
  fillRoundRect(ctx, x, y, w, 34, 17, '#ffffff', color, 3);
  drawTextBox(ctx, label, { x: x + 12, y: y + 8, w: w - 24, h: 18 }, {
    color,
    startPx: 15,
    minPx: 11,
    weight: '700',
    maxLines: 1,
    align: 'center',
  });
}

function drawAnimationOverlay(ctx, slide, layout, visual, progress = 1) {
  const type = visual.type;
  const label = slide.pointerLabel || slide.focusTarget || slide.title || '';
  const phase = Math.max(0, Math.min(1, progress));
  const pulse = 0.5 - Math.cos(phase * Math.PI * 2) / 2;
  if (type === 'code') {
    const r = layout.visual;
    const focus = slide.code_focus || slide.codeFocus || {};
    const normalized = codeWindow.normalizeCodeWindow({
      ...focus,
      content: focus.content || slide.example_code || '',
    }, { maxVisibleLines: 12, contextBefore: 2 });
    const line = normalized.highlightLines.length ? Math.min(...normalized.highlightLines) : normalized.visibleStartLine;
    const visibleOffset = Math.max(0, Math.min(11, line - normalized.visibleStartLine));
    const y = r.y + 76 + visibleOffset * 31;
    drawPointer(ctx, { x: r.x + r.w - 116, y: r.y + 76 }, { x: r.x + 188, y }, slide.pointerLabel || 'active line', phase);
    return drawFocusRing(ctx, { x: r.x + 132, y: y - 14, w: r.w - 260, h: 36 }, '#38bdf8', phase);
  }
  if (type === 'class_diagram') {
    const r = layout.visual;
    const lower = getSlideText(slide);
    const isPoly = lower.includes('polymorphism') || lower.includes('dispatch') || lower.includes('runtime');
    const parent = { x: r.x + r.w / 2 - 150, y: r.y + 74, w: 300, h: 118 };
    const leftChild = { x: r.x + r.w / 2 - 280, y: r.y + 300, w: 240, h: 118 };
    const rightChild = { x: r.x + r.w / 2 + 40, y: r.y + 300, w: 240, h: 118 };
    if (phase < 0.34) {
      drawFocusRing(ctx, parent, '#2563eb', phase);
      return drawMovingBadge(ctx, isPoly ? 'Shape ref' : 'Parent class', parent.x + parent.w + 18, parent.y + 8, '#2563eb');
    }
    if (phase < 0.67) {
      drawPointer(ctx, { x: parent.x + parent.w / 2, y: parent.y + parent.h + 4 }, { x: leftChild.x + leftChild.w / 2, y: leftChild.y - 4 }, isPoly ? 'Circle.area()' : 'extends', pulse);
      return drawFocusRing(ctx, leftChild, '#16a34a', phase);
    }
    drawPointer(ctx, { x: parent.x + parent.w / 2, y: parent.y + parent.h + 4 }, { x: rightChild.x + rightChild.w / 2, y: rightChild.y - 4 }, isPoly ? 'Rectangle.area()' : 'extends', pulse);
    return drawFocusRing(ctx, rightChild, '#16a34a', phase);
  }
  if (type === 'linkedlist') {
    const r = layout.visual;
    const steps = [
      { label: 'head', x: r.x + 150 },
      { label: 'node', x: r.x + 340 },
      { label: 'next', x: r.x + 540 },
      { label: 'null', x: r.x + Math.min(r.w - 110, 820) },
    ];
    const idx = Math.min(steps.length - 1, Math.floor(phase * steps.length));
    const current = steps[idx];
    const next = steps[Math.min(steps.length - 1, idx + 1)];
    const y = r.y + r.h / 2 + 18;
    drawPointer(ctx, { x: current.x, y: r.y + 72 }, { x: current.x + (next.x - current.x) * pulse, y }, current.label, phase);
    return drawMovingBadge(ctx, current.label, current.x - 40, y + 42, '#16a34a');
  }
  if (type === 'hash_table') {
    const r = layout.visual;
    const steps = [
      { label: 'key', x: r.x + 116, y: r.y + 112 },
      { label: 'hash', x: r.x + 360, y: r.y + 112 },
      { label: 'index', x: r.x + 604, y: r.y + 112 },
      { label: 'bucket', x: r.x + 238, y: r.y + 290 },
      { label: 'collision', x: r.x + 650, y: r.y + 290 },
    ];
    const idx = Math.min(steps.length - 1, Math.floor(phase * steps.length));
    const current = steps[idx];
    drawMovingBadge(ctx, current.label, current.x - 42, current.y - 58, idx === 4 ? '#ef4444' : '#2563eb');
    drawPointer(ctx, { x: current.x + 80, y: current.y - 42 }, { x: current.x, y: current.y }, current.label, pulse);
    return drawFocusRing(ctx, { x: current.x - 58, y: current.y - 34, w: idx < 3 ? 132 : 172, h: 58 }, idx === 4 ? '#ef4444' : '#2563eb', phase);
  }
  if (type === 'stack_queue') {
    const r = layout.visual;
    const isQueue = getSlideText(slide).includes('queue') || getSlideText(slide).includes('fifo');
    if (isQueue) {
      const x = r.x + r.w - 250 - pulse * 180;
      drawBox(ctx, 'new', { x, y: r.y + r.h / 2 - 42, w: 86, h: 54 }, '#fee2e2', '#ef4444', { align: 'center', maxLines: 1 });
      return drawPointer(ctx, { x: r.x + r.w - 94, y: r.y + r.h - 38 }, { x, y: r.y + r.h / 2 - 14 }, 'enqueue', phase);
    }
    const x = r.x + r.w / 2 - 44;
    const y = r.y + 72 + pulse * 92;
    drawBox(ctx, 'item', { x, y, w: 88, h: 50 }, '#fee2e2', '#ef4444', { align: 'center', maxLines: 1 });
    return drawPointer(ctx, { x: r.x + 150, y: r.y + 82 }, { x, y: y + 24 }, slide.pointerLabel || 'push/pop', phase);
  }
  const r = layout.visual;
  return drawPointer(ctx, { x: r.x + r.w - 90, y: r.y + 82 }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, label, pulse);
}

async function renderWithCanvas(slide, outPath, options = {}) {
  const c = loadCanvas();
  if (!c) return false;
  const { createCanvas, loadImage } = c;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const visualType = inferVisualType(slide);
  const layout = computeLayout(slide, W, H);
  const bullets = cleanList(slide.bullets, ['Tutor focus']).slice(0, 2);
  const visual = slideVisualData({ ...slide, visual_type: visualType }, bullets);
  if (visual.imagePath && fs.existsSync(visual.imagePath) && typeof loadImage === 'function') {
    try { visual.image = await loadImage(visual.imagePath); } catch (_) {}
  }

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  drawHeader(ctx, slide, layout);
  drawBullets(ctx, bullets, layout.bullets);
  drawVisual(ctx, slide, visual, bullets, layout.visual);
  if (options.animationProgress != null) {
    drawAnimationOverlay(ctx, slide, layout, visual, options.animationProgress);
  }

  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return true;
}

async function renderSlide(slide, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const ok = await renderWithCanvas(slide, outPath);
  if (ok) return outPath;
  const svgPath = outPath.replace(/\.png$/i, '.svg');
  fs.writeFileSync(svgPath, renderSvg(slide), 'utf8');
  return svgPath;
}

async function renderAnimatedFrames(slide, outDir, frameCount = 24, prefix = 'frame', options = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const frames = [];
  const count = Math.max(2, Math.min(240, Number(frameCount) || 24));
  const loopFrames = Math.max(6, Math.min(48, Number(options.loopFrames) || 18));
  for (let i = 0; i < count; i++) {
    const outPath = path.join(outDir, `${prefix}_${String(i).padStart(4, '0')}.png`);
    const progress = (i % loopFrames) / Math.max(1, loopFrames - 1);
    const ok = await renderWithCanvas(slide, outPath, { animationProgress: progress });
    if (!ok) return [];
    frames.push(outPath);
  }
  return frames;
}

module.exports = {
  renderSlide,
  renderAnimatedFrames,
  computeLayout,
  W,
  H,
  _internals: {
    inferVisualType,
    wrapText,
    fitFontSize,
    drawTextBox,
    compactText,
    normalizeVisibleText,
    loadCanvas,
    drawAnimationOverlay,
  },
};
