'use strict';

const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 80;
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

function chunkByChapter(text, chapters) {
  const all = [];
  for (const ch of chapters) {
    const slice = text.slice(ch.char_start, ch.char_end);
    const cs = chunkText(slice);
    for (const c of cs) all.push({ ...c, chapter_idx: ch.idx });
  }
  return all.map((c, i) => ({ ...c, idx: i }));
}

module.exports = { chunkText, chunkByChapter, estimateTokens };
