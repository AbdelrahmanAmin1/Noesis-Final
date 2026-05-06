'use strict';

const fs = require('fs');
const path = require('path');

const W = 1280;
const H = 720;

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

function compact(text, max = 72) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function wrapByWords(text, maxChars, maxLines = 3) {
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

function svgText(text, x, y, size, color = '#0f172a', maxChars = 34, maxLines = 2, weight = '500') {
  return wrapByWords(text, maxChars, maxLines).map((line, i) =>
    `<text x="${x}" y="${y + i * (size + 8)}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`
  ).join('\n');
}

function svgBox(text, x, y, w, h, fill, stroke = '#94a3b8') {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    svgText(text, x + 16, y + 32, 20, '#0f172a', Math.max(10, Math.floor(w / 16)), 2, '600'),
  ].join('\n');
}

function renderSvg(slide) {
  const visualType = ['mindmap', 'flow', 'comparison', 'code', 'summary'].includes(slide.visual_type)
    ? slide.visual_type
    : 'mindmap';
  const bullets = cleanList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).slice(0, 5);
  const nodes = cleanList(slide.visual_nodes, [slide.title, ...bullets]).slice(0, 7);
  const callouts = cleanList(slide.callouts, bullets.slice(0, 2)).slice(0, 3);
  const bulletText = bullets.map((b, i) =>
    svgText(`- ${b}`, 92, 218 + i * 72, 24, '#1e293b', 34, 2, '500')
  ).join('\n');

  let visual = '';
  if (visualType === 'flow') {
    visual = nodes.slice(0, 4).map((node, i) => {
      const x = 546 + i * 162;
      return `${svgBox(node, x, 300, 134, 86, ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'][i % 4])}${i < 3 ? svgText('->', x + 140, 350, 26, '#334155', 3, 1, '700') : ''}`;
    }).join('\n');
  } else if (visualType === 'comparison') {
    const left = nodes[0] || 'Concept A';
    const right = nodes[1] || 'Concept B';
    visual = [
      svgBox(left, 558, 218, 284, 68, '#dbeafe', '#2563eb'),
      svgBox(right, 886, 218, 284, 68, '#dcfce7', '#16a34a'),
      ...bullets.slice(0, 4).map((b, i) => svgBox(b, i % 2 === 0 ? 578 : 906, 326 + Math.floor(i / 2) * 110, 244, 74, i % 2 === 0 ? '#eff6ff' : '#f0fdf4')),
    ].join('\n');
  } else if (visualType === 'code') {
    const codeLines = String(slide.example_code || bullets.join('\n')).split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 7);
    visual = [
      '<rect x="560" y="210" width="424" height="330" rx="12" fill="#111827" stroke="#38bdf8" stroke-width="2"/>',
      ...codeLines.map((line, i) => svgText(compact(line, 42), 584, 252 + i * 36, 20, '#e0f2fe', 42, 1, '500')),
      ...callouts.slice(0, 3).map((c, i) => svgBox(c, 1010, 220 + i * 104, 174, 76, '#fef9c3', '#f59e0b')),
    ].join('\n');
  } else {
    const center = nodes[0] || slide.title || 'Core concept';
    const positions = [[578, 214], [1010, 214], [578, 438], [1010, 438], [782, 174], [782, 514]];
    visual = [
      '<line x1="880" y1="333" x2="670" y2="252" stroke="#94a3b8" stroke-width="3"/>',
      '<line x1="880" y1="333" x2="1070" y2="252" stroke="#94a3b8" stroke-width="3"/>',
      '<line x1="880" y1="333" x2="670" y2="476" stroke="#94a3b8" stroke-width="3"/>',
      '<line x1="880" y1="333" x2="1070" y2="476" stroke="#94a3b8" stroke-width="3"/>',
      svgBox(center, 768, 284, 224, 98, '#dbeafe', '#2563eb'),
      ...nodes.slice(1, 7).map((node, i) => svgBox(node, positions[i][0], positions[i][1], 184, 76, ['#dcfce7', '#fef3c7', '#fce7f3'][i % 3])),
    ].join('\n');
  }

  const calloutText = callouts.slice(0, visualType === 'code' ? 1 : 2).map((c, i) =>
    svgBox(c, 92, 558 + i * 64, 352, 54, '#fef9c3', '#f59e0b')
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect width="100%" height="96" fill="#0f172a"/>
  <text x="64" y="38" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#bfdbfe">NOESIS TUTOR WHITEBOARD</text>
  ${svgText(slide.title || 'Tutor explanation', 64, 76, 30, '#ffffff', 42, 1, '700')}
  <rect x="64" y="134" width="408" height="506" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="506" y="134" width="710" height="506" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="92" y="176" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#2563eb">${escapeXml(visualType.toUpperCase())}</text>
  ${bulletText}
  ${calloutText}
  ${visual}
</svg>`;
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

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = null) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function wrapCanvasLines(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
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
  return lines;
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const lines = wrapCanvasLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function drawBox(ctx, text, x, y, w, h, fill, stroke = '#94a3b8') {
  fillRoundRect(ctx, x, y, w, h, 12, fill, stroke);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 20px Arial';
  drawWrapped(ctx, compact(text, 56), x + 16, y + 32, w - 32, 26, 2);
}

function drawMindmap(ctx, slide, nodes, summary = false) {
  const center = nodes[0] || slide.title || 'Core concept';
  const cx = 768;
  const cy = 284;
  const positions = [[578, 214], [1010, 214], [578, 438], [1010, 438], [782, 174], [782, 514]];
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  positions.slice(0, Math.min(nodes.length - 1, 6)).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(cx + 112, cy + 49);
    ctx.lineTo(x + 92, y + 38);
    ctx.stroke();
  });
  drawBox(ctx, center, cx, cy, 224, 98, summary ? '#ede9fe' : '#dbeafe', '#2563eb');
  nodes.slice(1, 7).forEach((node, i) => {
    const [x, y] = positions[i];
    drawBox(ctx, node, x, y, 184, 76, ['#dcfce7', '#fef3c7', '#fce7f3'][i % 3]);
  });
}

function drawFlow(ctx, nodes) {
  const steps = nodes.slice(0, 4);
  steps.forEach((node, i) => {
    const x = 546 + i * 162;
    drawBox(ctx, node, x, 300, 134, 86, ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3'][i % 4]);
    if (i < steps.length - 1) {
      ctx.fillStyle = '#334155';
      ctx.font = '700 28px Arial';
      ctx.fillText('->', x + 142, 352);
    }
  });
}

function drawComparison(ctx, nodes, bullets) {
  drawBox(ctx, nodes[0] || 'Concept A', 558, 218, 284, 68, '#dbeafe', '#2563eb');
  drawBox(ctx, nodes[1] || 'Concept B', 886, 218, 284, 68, '#dcfce7', '#16a34a');
  bullets.slice(0, 4).forEach((bullet, i) => {
    drawBox(ctx, bullet, i % 2 === 0 ? 578 : 906, 326 + Math.floor(i / 2) * 110, 244, 74, i % 2 === 0 ? '#eff6ff' : '#f0fdf4');
  });
}

function drawCode(ctx, slide, bullets, callouts) {
  const codeLines = String(slide.example_code || bullets.join('\n'))
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 7);
  fillRoundRect(ctx, 560, 210, 424, 330, 12, '#111827', '#38bdf8');
  ctx.fillStyle = '#e0f2fe';
  ctx.font = '20px Consolas, monospace';
  codeLines.forEach((line, i) => ctx.fillText(compact(line, 42), 584, 252 + i * 36));
  callouts.slice(0, 3).forEach((callout, i) => drawBox(ctx, callout, 1010, 220 + i * 104, 174, 76, '#fef9c3', '#f59e0b'));
}

async function renderWithCanvas(slide, outPath) {
  const c = loadCanvas();
  if (!c) return false;
  const { createCanvas } = c;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const visualType = ['mindmap', 'flow', 'comparison', 'code', 'summary'].includes(slide.visual_type)
    ? slide.visual_type
    : 'mindmap';
  const bullets = cleanList(slide.bullets, ['Source-grounded concept', 'Tutor explanation']).slice(0, 5);
  const nodes = cleanList(slide.visual_nodes, [slide.title, ...bullets]).slice(0, 7);
  const callouts = cleanList(slide.callouts, bullets.slice(0, 2)).slice(0, 3);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = '#bfdbfe';
  ctx.font = '700 22px Arial';
  ctx.fillText('NOESIS TUTOR WHITEBOARD', 64, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px Arial';
  drawWrapped(ctx, slide.title || 'Tutor explanation', 64, 76, 1060, 34, 1);

  fillRoundRect(ctx, 64, 134, 408, 506, 16, '#ffffff', '#cbd5e1');
  fillRoundRect(ctx, 506, 134, 710, 506, 16, '#ffffff', '#cbd5e1');

  ctx.fillStyle = '#2563eb';
  ctx.font = '700 18px Arial';
  ctx.fillText(visualType.toUpperCase(), 92, 176);

  ctx.fillStyle = '#1e293b';
  ctx.font = '500 24px Arial';
  let y = 218;
  for (const bullet of bullets) {
    y = drawWrapped(ctx, `- ${bullet}`, 92, y, 336, 30, 2) + 16;
  }

  callouts.slice(0, visualType === 'code' ? 1 : 2).forEach((callout, i) => {
    drawBox(ctx, callout, 92, 558 + i * 64, 352, 54, '#fef9c3', '#f59e0b');
  });

  if (visualType === 'flow') drawFlow(ctx, nodes);
  else if (visualType === 'comparison') drawComparison(ctx, nodes, bullets);
  else if (visualType === 'code') drawCode(ctx, slide, bullets, callouts);
  else drawMindmap(ctx, slide, nodes, visualType === 'summary');

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

module.exports = { renderSlide, W, H };
