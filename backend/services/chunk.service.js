'use strict';

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
  const out = [];
  if (!text || !text.trim()) return out;

  // Split into paragraphs first to keep semantic boundaries.
  const paras = text.split(/\n{2,}/);
  let buf = '';
  for (const p of paras) {
    const candidate = buf ? buf + '\n\n' + p : p;
    if (candidate.length <= targetChars) {
      buf = candidate;
    } else {
      if (buf) out.push(buf);
      // If a single paragraph exceeds target, hard split it.
      if (p.length > targetChars) {
        let i = 0;
        while (i < p.length) {
          out.push(p.slice(i, i + targetChars));
          i += targetChars - overlapChars;
        }
        buf = '';
      } else {
        buf = p;
      }
    }
  }
  if (buf) out.push(buf);

  // Apply overlap by stitching tail of previous chunk to start of next.
  const overlapped = [];
  for (let i = 0; i < out.length; i++) {
    if (i === 0) {
      overlapped.push(out[i]);
    } else {
      const prev = out[i - 1];
      const tail = prev.slice(Math.max(0, prev.length - overlapChars));
      overlapped.push(tail + '\n' + out[i]);
    }
  }

  return overlapped.map((text, idx) => ({ idx, text, token_count: estimateTokens(text) }));
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

module.exports = { chunkText, chunkByChapter, estimateTokens, detectHeading, hasCode, slideMeta, sourcePageMeta, keywords };
