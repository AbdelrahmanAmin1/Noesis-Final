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

function renderSvg(slide) {
  const title = escapeXml(slide.title || '');
  const bullets = (slide.bullets || []).slice(0, 6).map(escapeXml);
  const lines = bullets.map((b, i) =>
    `<text x="80" y="${260 + i * 64}" font-family="Geist, system-ui, sans-serif" font-size="32" fill="#e8e6f5">• ${b}</text>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="80%" cy="20%">
      <stop offset="0" stop-color="#a5b4fc" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#08081a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#08081a"/>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="80" y="120" font-family="Fraunces, Georgia, serif" font-size="14" letter-spacing="3" fill="#a5b4fc">NOĒSIS</text>
  <text x="80" y="200" font-family="Fraunces, Georgia, serif" font-weight="300" font-size="56" fill="#fafaff">${title}</text>
  ${lines}
  <rect x="80" y="${H - 80}" width="120" height="2" fill="#c99afc"/>
</svg>`;
}

async function renderWithCanvas(slide, outPath) {
  const c = loadCanvas();
  if (!c) return false;
  const { createCanvas } = c;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#08081a';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, 800);
  grad.addColorStop(0, 'rgba(165,180,252,0.35)');
  grad.addColorStop(1, 'rgba(8,8,26,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Eyebrow
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('NOĒSIS', 80, 120);
  // Title
  ctx.fillStyle = '#fafaff';
  ctx.font = '300 56px serif';
  wrapText(ctx, slide.title || '', 80, 200, W - 160, 64);
  // Bullets
  ctx.fillStyle = '#e8e6f5';
  ctx.font = '32px sans-serif';
  const bullets = (slide.bullets || []).slice(0, 6);
  for (let i = 0; i < bullets.length; i++) {
    wrapText(ctx, '• ' + bullets[i], 80, 280 + i * 64, W - 160, 36);
  }
  // Accent bar
  ctx.fillStyle = '#c99afc';
  ctx.fillRect(80, H - 80, 120, 2);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  return true;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

async function renderSlide(slide, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const ok = await renderWithCanvas(slide, outPath);
  if (ok) return outPath;
  // Fallback: write SVG (ffmpeg can render SVG via librsvg if compiled in; else slides.service exposes svgPath for caller).
  const svgPath = outPath.replace(/\.png$/i, '.svg');
  fs.writeFileSync(svgPath, renderSvg(slide), 'utf8');
  return svgPath;
}

module.exports = { renderSlide, W, H };
