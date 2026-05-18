'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');

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
  'bigo_chart',
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

function cleanList(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source
    .map(v => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function compactText(text, max = 72) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
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
  const suffix = '...';
  while (value.length > 1 && ctx.measureText(value + suffix).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}${suffix}`;
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
  const visualType = inferVisualType(slide);
  const diagramFirst = ['code', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'bigo_chart'].includes(visualType);
  const header = { x: 64, y: 18, w: width - 128, h: 72 };
  if (diagramFirst) {
    return {
      mode: 'diagram',
      header,
      visual: { x: 64, y: 124, w: width - 128, h: 340 },
      bullets: { x: 64, y: 486, w: 612, h: 172 },
      callouts: { x: 704, y: 486, w: width - 768, h: 172 },
    };
  }
  return {
    mode: 'default',
    header,
    bullets: { x: 64, y: 134, w: 408, h: 386 },
    visual: { x: 506, y: 134, w: 710, h: 386 },
    callouts: { x: 64, y: 548, w: width - 128, h: 94 },
  };
}

function slideVisualData(slide, bullets) {
  const visual = slide.visual || {};
  const nodes = cleanList(slide.visual_nodes && slide.visual_nodes.length ? slide.visual_nodes : visual.nodes, [slide.title, ...bullets])
    .map(n => compactText(n, 64))
    .slice(0, 10);
  const edges = (Array.isArray(slide.visual_edges) && slide.visual_edges.length ? slide.visual_edges : visual.edges || [])
    .filter(e => Array.isArray(e) && e.length >= 2)
    .map(e => [String(e[0] || '').trim(), String(e[1] || '').trim()])
    .filter(e => e[0] && e[1])
    .slice(0, 12);
  return { type: inferVisualType(slide), nodes, edges };
}

function drawBullets(ctx, bullets, region) {
  drawCard(ctx, region, 'Key Points');
  const content = inset(region, 18);
  content.y += 32;
  content.h -= 32;
  const safeBullets = bullets.slice(0, MAX_BULLETS);
  let fontSize = 22;
  let layouts = [];
  for (; fontSize >= 16; fontSize--) {
    setFont(ctx, fontSize, '500');
    const lineHeight = Math.ceil(fontSize * 1.18);
    const gap = 8;
    layouts = safeBullets.map(b => wrapText(ctx, `- ${b}`, content.w, 2));
    const total = layouts.reduce((sum, lines) => sum + lines.length * lineHeight + gap, -gap);
    if (total <= content.h) break;
  }
  setFont(ctx, fontSize, '500');
  ctx.fillStyle = '#1e293b';
  ctx.textBaseline = 'top';
  const lineHeight = Math.ceil(fontSize * 1.18);
  let y = content.y;
  for (const lines of layouts) {
    if (y + lineHeight > content.y + content.h) break;
    for (const line of lines) {
      if (y + lineHeight > content.y + content.h) break;
      ctx.fillText(line, content.x, y);
      y += lineHeight;
    }
    y += 8;
  }
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

function drawCode(ctx, slide, bullets, region) {
  const codeLines = String(slide.example_code || bullets.join('\n'))
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const r = inset(region, 42);
  fillRoundRect(ctx, r.x, r.y, r.w, r.h, 14, '#111827', '#38bdf8', 2);
  const content = inset(r, 24);
  const maxLines = Math.max(4, Math.floor(content.h / 30));
  let fontSize = 21;
  for (; fontSize >= 15; fontSize--) {
    setFont(ctx, fontSize, '500', 'Consolas, monospace');
    if (codeLines.slice(0, maxLines).every(line => ctx.measureText(compactText(line, 90)).width <= content.w)) break;
  }
  setFont(ctx, fontSize, '500', 'Consolas, monospace');
  ctx.fillStyle = '#e0f2fe';
  ctx.textBaseline = 'top';
  const lineHeight = Math.ceil(fontSize * 1.5);
  codeLines.slice(0, maxLines).forEach((line, i) => {
    ctx.fillText(ellipsizeToWidth(ctx, line, content.w), content.x, content.y + i * lineHeight);
  });
}

function drawClassDiagram(ctx, slide, visual, bullets, region) {
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
  const items = (visual.nodes.length ? visual.nodes : ['A', 'B', 'C', 'D']).slice(0, 6);
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
    drawTextBox(ctx, 'push / pop', { x, y: r.y + r.h - 24, w: boxW, h: 24 }, { color: MUTED, startPx: 18, minPx: 14, align: 'center', maxLines: 1 });
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
  drawTextBox(ctx, 'dequeue', { x: startX, y: y - 42, w: 120, h: 24 }, { color: '#ef4444', startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
  drawTextBox(ctx, 'enqueue', { x: startX + (items.length - 1) * (boxW + gap) - 20, y: y + boxH + 18, w: 140, h: 24 }, { color: BLUE, startPx: 18, minPx: 13, weight: '700', maxLines: 1 });
}

function drawLinkedList(ctx, visual, region) {
  const nodes = (visual.nodes.length ? visual.nodes : ['data', 'data', 'data']).slice(0, 5);
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
  drawCard(ctx, region, type.replace(/_/g, ' '));
  const content = inset(region, 18);
  content.y += 34;
  content.h -= 34;
  if (type === 'flow') return drawFlow(ctx, visual, content);
  if (type === 'comparison') return drawComparison(ctx, visual, bullets, content);
  if (type === 'code') return drawCode(ctx, slide, bullets, content);
  if (type === 'class_diagram') return drawClassDiagram(ctx, slide, visual, bullets, content);
  if (type === 'tree') return drawTree(ctx, visual, content);
  if (type === 'stack_queue') return drawStackQueue(ctx, slide, visual, content);
  if (type === 'linkedlist') return drawLinkedList(ctx, visual, content);
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
  const bullets = cleanList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).map(b => compactText(b, 120)).slice(0, MAX_BULLETS);
  const visual = slideVisualData(slide, bullets);
  const callouts = cleanList(slide.callouts, []).map(c => compactText(c, 120)).slice(0, 3);
  const bulletLines = bullets.map((b, i) => svgText(`- ${b}`, layout.bullets.x + 24, layout.bullets.y + 74 + i * 54, 19, '#1e293b', Math.floor((layout.bullets.w - 48) / 12), 2)).join('\n');
  const nodeBoxes = visual.nodes.slice(0, 8).map((node, i) => {
    const cols = layout.mode === 'diagram' ? 4 : 3;
    const bw = Math.floor((layout.visual.w - 74) / cols);
    const bh = 68;
    const x = layout.visual.x + 24 + (i % cols) * (bw + 14);
    const y = layout.visual.y + 74 + Math.floor(i / cols) * 88;
    return svgBox(node, x, y, bw, bh, ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'][i % 4]);
  }).join('\n');
  const calloutBoxes = callouts.map((c, i) => {
    const w = Math.floor((layout.callouts.w - 44 - Math.max(0, callouts.length - 1) * 12) / Math.max(1, callouts.length));
    return svgBox(c, layout.callouts.x + 22 + i * (w + 12), layout.callouts.y + 42, w, 42, '#fef9c3', '#f59e0b');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect width="100%" height="104" fill="#0f172a"/>
  <text x="64" y="38" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700" fill="#bfdbfe">NOESIS TUTOR WHITEBOARD</text>
  ${svgText(slide.title || 'Tutor explanation', 64, 82, 29, '#ffffff', 48, 1, '700')}
  <rect x="${layout.bullets.x}" y="${layout.bullets.y}" width="${layout.bullets.w}" height="${layout.bullets.h}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <rect x="${layout.visual.x}" y="${layout.visual.y}" width="${layout.visual.w}" height="${layout.visual.h}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <rect x="${layout.callouts.x}" y="${layout.callouts.y}" width="${layout.callouts.w}" height="${layout.callouts.h}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <text x="${layout.bullets.x + 22}" y="${layout.bullets.y + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="${BLUE}">KEY POINTS</text>
  <text x="${layout.visual.x + 22}" y="${layout.visual.y + 24}" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="${BLUE}">${escapeXml(visualType.replace(/_/g, ' ').toUpperCase())}</text>
  ${bulletLines}
  ${nodeBoxes}
  ${calloutBoxes}
</svg>`;
}

async function renderWithCanvas(slide, outPath) {
  const c = loadCanvas();
  if (!c) return false;
  const { createCanvas } = c;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const visualType = inferVisualType(slide);
  const layout = computeLayout(slide, W, H);
  const bullets = cleanList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).map(b => compactText(b, 140)).slice(0, MAX_BULLETS);
  const callouts = cleanList(slide.callouts, []).map(c => compactText(c, 120)).slice(0, 3);
  const visual = slideVisualData({ ...slide, visual_type: visualType }, bullets);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  drawHeader(ctx, slide, layout);
  drawBullets(ctx, bullets, layout.bullets);
  drawVisual(ctx, slide, visual, bullets, layout.visual);
  drawCallouts(ctx, callouts, layout.callouts);

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

module.exports = {
  renderSlide,
  computeLayout,
  W,
  H,
  _internals: {
    inferVisualType,
    wrapText,
    fitFontSize,
    drawTextBox,
    compactText,
  },
};
