'use strict';

const sourceTextQuality = require('./source-text-quality.service');

const TARGET_TOKENS = 600;
const OVERLAP_TOKENS = 100;
const TOK_CHARS = 4; // ~4 chars per token
const WEAK_HEADING_RE = /^(?:top|home|welcome|contents?|table of contents|index|appendix|acknowledgements?|references?|bibliography|copyright|license|quiz answer keys?|answer keys?|answers?|untitled|document|material|file)$/i;

function estimateTokens(s) {
  return Math.ceil((s || '').length / TOK_CHARS);
}

function chunkText(text, opts = {}) {
  const targetChars = (opts.targetTokens || TARGET_TOKENS) * TOK_CHARS;
  const overlapChars = (opts.overlapTokens || OVERLAP_TOKENS) * TOK_CHARS;
  if (!text || !text.trim()) return [];
  const units = semanticUnits(text, targetChars);
  const chunks = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const value = current.join('\n\n').trim();
    if (value) chunks.push(value);
  };

  for (const unit of units) {
    const candidate = [...current, unit].join('\n\n');
    if (current.length && candidate.length > targetChars) {
      const previous = current;
      flush();
      current = overlapUnits(previous, overlapChars);
      while (current.length && [...current, unit].join('\n\n').length > targetChars) current.shift();
    }
    current.push(unit);
  }
  flush();

  return chunks.map((chunk, idx) => ({ idx, text: chunk, token_count: estimateTokens(chunk) }));
}

function semanticUnits(text, targetChars) {
  const units = [];
  const seen = new Set();
  const add = (value) => {
    const clean = String(value || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) return;
    for (const part of splitLongUnit(clean, targetChars)) {
      const key = part.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (key.length >= 80 && seen.has(key)) continue;
      if (key.length >= 80) seen.add(key);
      units.push(part);
    }
  };

  for (const rawParagraph of String(text || '').split(/\n{2,}/)) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) continue;
    const lines = paragraph.split(/\n+/).map(line => line.trim()).filter(Boolean);
    if (lines.length <= 2 && sourceTextQuality.isDocumentMetadata(paragraph)) continue;
    const codeLike = /(?:^|\n)\s*(?:\/\/|#include|public\s|private\s|class\s|def\s|function\s|for\s*\(|if\s*\(|return\b|[{}])/.test(paragraph);
    const headingOnly = lines.length === 1 && lines[0].length <= 100 && !/[.!?]$/.test(lines[0]);
    if (codeLike || headingOnly) {
      add(codeLike ? lines.join('\n') : lines[0]);
      continue;
    }
    const prose = lines.join(' ').replace(/\s+/g, ' ').trim();
    const sentences = prose.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map(item => item.trim()).filter(Boolean);
    if (sentences.length > 1) sentences.forEach(add);
    else add(prose);
  }
  return units;
}

function splitLongUnit(value, targetChars) {
  const parts = [];
  let remaining = String(value || '').trim();
  const minimumCut = Math.max(40, Math.floor(targetChars * 0.55));
  while (remaining.length > targetChars) {
    const window = remaining.slice(0, targetChars + 1);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    if (cut >= minimumCut) cut += 1;
    else cut = window.lastIndexOf('\n');
    if (cut < minimumCut) cut = window.lastIndexOf(' ');
    if (cut < 1) cut = targetChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function overlapUnits(units, overlapChars) {
  if (!overlapChars) return [];
  const tail = [];
  let length = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    const nextLength = length + unit.length + (tail.length ? 2 : 0);
    if (nextLength > overlapChars) break;
    tail.unshift(unit);
    length = nextLength;
  }
  return tail;
}

function detectHeading(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.length > 100 || WEAK_HEADING_RE.test(trimmed)) continue;
    if (/^#{1,4}\s+\S/.test(trimmed)) return trimmed.replace(/^#+\s*/, '').slice(0, 80);
    if (/^(?:Title:|Slide \d+)/.test(trimmed)) {
      const stripped = trimmed.replace(/^(?:Title:\s*|Slide \d+\s*)/, '').trim();
      if (stripped && !WEAK_HEADING_RE.test(stripped)) return stripped.slice(0, 80);
      const next = lines.slice(i + 1).find(l => l.trim().length > 0 && !WEAK_HEADING_RE.test(l.trim()));
      if (next && next.trim().length < 80) return next.trim().slice(0, 80);
      return '';
    }
    if (sourceTextQuality.isWeakHeading(trimmed)) continue;
  }
  const first = (lines.find(l => l.trim().length > 0 && l.trim().length < 60) || '').trim();
  if (first && /^[A-Z]/.test(first) && !/[.!?]$/.test(first) && !WEAK_HEADING_RE.test(first)) return first.slice(0, 80);
  return '';
}

function slideMeta(text, chapterTitle = '') {
  const source = `${chapterTitle || ''}\n${text || ''}`;
  const m = source.match(/\bSlide\s+(\d+)\b/i);
  const slide_number = m ? parseInt(m[1], 10) : null;
  let slide_title = '';
  const lines = String(source || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/^Slide\s+\d+\b/i.test(lines[i])) {
      const stripped = lines[i].replace(/^Slide\s+\d+\s*[:.-]?\s*/i, '').trim();
      if (stripped && stripped.length < 100) {
        slide_title = stripped;
        break;
      }
      const next = lines.slice(i + 1).find(l => l.length > 0 && l.length < 100);
      if (next) slide_title = next;
      break;
    }
  }
  return { slide_number, slide_title };
}

function sourcePageMeta(text, chapterTitle = '') {
  const source = `${chapterTitle || ''}\n${text || ''}`;
  const match = source.match(/(?:^|\n)\s*(?:page|p\.)\s*(\d{1,4})\b/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function keywords(text, max = 12) {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'you', 'your', 'class', 'void', 'public']);
  const counts = new Map();
  for (const token of String(text || '').toLowerCase().match(/[a-z][a-z0-9+-]{2,}/g) || []) {
    if (stop.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

function hasCode(text) {
  if (/```[\s\S]*?```/.test(text)) return true;
  const codePatterns = /\b(?:class\s+\w+|void\s+\w+|public\s+(?:static|class|void|int|String)|private\s+|def\s+\w+|function\s+\w+|import\s+\w+|#include|return\s+\w+)\b/;
  return codePatterns.test(text);
}

function chunkByChapter(text, chapters) {
  const all = [];
  for (const ch of chapters) {
    const slice = text.slice(ch.char_start, ch.char_end);
    const cs = chunkText(slice);
    for (const c of cs) {
      const heading = detectHeading(c.text);
      const meta = slideMeta(c.text, ch.title || '');
      all.push({
        ...c,
        chapter_idx: ch.idx,
        chapter_title: ch.title || '',
        heading,
        section_title: heading || ch.title || '',
        slide_number: meta.slide_number,
        slide_title: meta.slide_title,
        source_page: c.source_page || ch.source_page || sourcePageMeta(c.text, ch.title || ''),
        has_code: hasCode(c.text),
        keywords: keywords(c.text),
        keywords_json: JSON.stringify(keywords(c.text)),
      });
    }
  }
  return all.map((c, i) => ({ ...c, idx: i }));
}

module.exports = {
  chunkText,
  chunkByChapter,
  estimateTokens,
  detectHeading,
  hasCode,
  slideMeta,
  sourcePageMeta,
  keywords,
  _internals: { overlapUnits, semanticUnits, splitLongUnit },
};
