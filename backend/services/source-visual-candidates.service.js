'use strict';

function clean(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function headingFor(chunk) {
  return clean(chunk && (chunk.chapter_title || chunk.slide_title || chunk.section_title || chunk.heading) || '', 100);
}

function looksTableLike(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => /\t|\s{3,}|\|/.test(line))) return true;
  return /\b(types?|categories|classified|includes?|consists of|advantages?|disadvantages?)\b/i.test(String(text || ''));
}

function fromChunks(chunks = [], opts = {}) {
  const max = opts.max || 8;
  const out = [];
  const seen = new Set();
  const add = (candidate) => {
    const key = [candidate.type, candidate.sourcePage, candidate.slideNumber, candidate.heading].join('|').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  for (const chunk of chunks || []) {
    const heading = headingFor(chunk);
    const text = clean(chunk && chunk.text || '', 260);
    if (chunk && chunk.source_page != null) {
      add({
        type: 'source_page_reference',
        sourcePage: chunk.source_page,
        slideNumber: null,
        heading,
        caption: heading ? `Source page ${chunk.source_page}: ${heading}` : `Source page ${chunk.source_page}`,
        evidence: text,
        chunkId: chunk.id || chunk.chunk_id || null,
      });
    }
    if (chunk && chunk.slide_number != null) {
      add({
        type: 'source_slide_reference',
        sourcePage: null,
        slideNumber: chunk.slide_number,
        heading: heading || clean(chunk.slide_title, 100),
        caption: heading ? `Source slide ${chunk.slide_number}: ${heading}` : `Source slide ${chunk.slide_number}`,
        evidence: text,
        chunkId: chunk.id || chunk.chunk_id || null,
      });
    }
    if (looksTableLike(chunk && chunk.text)) {
      add({
        type: /compare|contrast|versus|advantage|disadvantage/i.test(chunk.text || '') ? 'comparison_table' : 'classification_table',
        sourcePage: chunk && chunk.source_page || null,
        slideNumber: chunk && chunk.slide_number || null,
        heading,
        caption: heading ? `Table candidate: ${heading}` : 'Table candidate from source text',
        evidence: text,
        chunkId: chunk && (chunk.id || chunk.chunk_id) || null,
      });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

module.exports = {
  fromChunks,
  _internals: { looksTableLike, headingFor },
};
