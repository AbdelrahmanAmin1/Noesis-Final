'use strict';

const TARGET_TOKENS = 600;
const OVERLAP_TOKENS = 100;
const TOK_CHARS = 4; // ~4 chars per token

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
    if (!trimmed || trimmed.length > 100) continue;
    if (/^#{1,4}\s+\S/.test(trimmed)) return trimmed.replace(/^#+\s*/, '').slice(0, 80);
    if (/^(?:Title:|Slide \d+)/.test(trimmed)) {
      const stripped = trimmed.replace(/^(?:Title:\s*|Slide \d+\s*)/, '').trim();
      if (stripped) return stripped.slice(0, 80);
      const next = lines.slice(i + 1).find(l => l.trim().length > 0);
      if (next && next.trim().length < 80) return next.trim().slice(0, 80);
      return '';
    }
  }
  const first = (lines.find(l => l.trim().length > 0 && l.trim().length < 60) || '').trim();
  if (first && /^[A-Z]/.test(first) && !/[.!?]$/.test(first)) return first.slice(0, 80);
  return '';
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
      all.push({
        ...c,
        chapter_idx: ch.idx,
        chapter_title: ch.title || '',
        heading: detectHeading(c.text),
        has_code: hasCode(c.text),
      });
    }
  }
  return all.map((c, i) => ({ ...c, idx: i }));
}

module.exports = { chunkText, chunkByChapter, estimateTokens, detectHeading, hasCode };
