'use strict';

const env = require('../config/env');

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function usefulCharCount(value) {
  return (String(value || '').match(/[A-Za-z0-9]/g) || []).length;
}

function normalizedLine(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b\d{1,4}\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function repeatedLineRatio(pages = []) {
  const counts = new Map();
  let total = 0;
  for (const page of pages) {
    const seenOnPage = new Set();
    for (const line of String(page.text || '').split(/\n+/)) {
      const norm = normalizedLine(line);
      if (!norm || norm.length < 4 || seenOnPage.has(norm)) continue;
      seenOnPage.add(norm);
      counts.set(norm, (counts.get(norm) || 0) + 1);
      total += 1;
    }
  }
  if (!total || pages.length < 2) return 0;
  let repeated = 0;
  for (const count of counts.values()) {
    if (count >= Math.max(2, Math.ceil(pages.length * 0.4))) repeated += count;
  }
  return repeated / total;
}

function visualLocations(structured = {}) {
  const locations = new Set();
  for (const visual of structured.visualSources || []) {
    const key = visual.slideNumber != null ? `s:${visual.slideNumber}` : `p:${visual.pageNumber || 1}`;
    locations.add(key);
  }
  return locations;
}

function analyzeExtraction(structured = {}, opts = {}) {
  const minChars = opts.minTextCharsPerPage ?? env.OCR_MIN_TEXT_CHARS_PER_PAGE;
  const pages = Array.isArray(structured.pages) && structured.pages.length
    ? structured.pages
    : [{ pageNumber: 1, text: structured.text || '' }];
  const pageCount = Math.max(1, structured.pageCount || pages.length || 1);
  const totalTextChars = pages.reduce((sum, p) => sum + String(p.text || '').trim().length, 0);
  const usefulChars = pages.reduce((sum, p) => sum + usefulCharCount(p.text), 0);
  const usefulCharsPerPage = usefulChars / pageCount;
  const emptyPages = pages.filter(p => usefulCharCount(p.text) < Math.min(60, minChars)).length;
  const emptyPageRatio = emptyPages / pageCount;
  const repeatedBoilerplateRatio = repeatedLineRatio(pages);
  const contentDensity = totalTextChars ? usefulChars / totalTextChars : 0;
  const vLocations = visualLocations(structured);
  const imageOnlyPages = pages.filter((p) => {
    const key = p.slideNumber != null ? `s:${p.slideNumber}` : `p:${p.pageNumber || 1}`;
    return usefulCharCount(p.text) < Math.min(80, minChars) && vLocations.has(key);
  }).length;
  const imageOnlyPageRatio = imageOnlyPages / pageCount;
  const isOcrCapableType = ['pdf', 'slides', 'image'].includes(structured.type);

  const reasons = [];
  if (usefulChars < Math.max(120, minChars * Math.min(pageCount, 2))) reasons.push('too_little_text');
  if (usefulCharsPerPage < minChars) reasons.push('low_useful_chars_per_page');
  if (emptyPageRatio >= 0.5) reasons.push('many_empty_pages');
  if (repeatedBoilerplateRatio >= 0.35) reasons.push('repeated_navigation_or_boilerplate');
  if (contentDensity > 0 && contentDensity < 0.45) reasons.push('low_content_density');
  if (imageOnlyPageRatio >= 0.25) reasons.push('image_heavy_low_text_pages');
  if (structured.type === 'image') reasons.push('image_upload');

  const needsOcr = isOcrCapableType && reasons.length > 0;
  return {
    type: structured.type || 'unknown',
    pageCount,
    totalTextChars,
    usefulChars,
    usefulCharsPerPage,
    emptyPages,
    emptyPageRatio,
    repeatedBoilerplateRatio,
    contentDensity,
    imageOnlyPages,
    imageOnlyPageRatio,
    needsOcr,
    reasons,
  };
}

function fingerprint(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceUnits(value) {
  const text = cleanText(value);
  if (!text) return [];
  const raw = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (raw.length <= 1) return text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  return raw;
}

function mergeText(normalText, ocrText) {
  const seen = new Set();
  const out = [];
  for (const part of [...sentenceUnits(normalText), ...sentenceUnits(ocrText)]) {
    const key = fingerprint(part);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return cleanText(out.join('\n'));
}

function locationKey(page) {
  if (page && page.slideNumber != null) return `s:${page.slideNumber}`;
  return `p:${page && page.pageNumber != null ? page.pageNumber : 1}`;
}

function mergeStructuredWithOcr(structured = {}, ocrResult = null) {
  const byKey = new Map();
  for (const page of structured.pages || []) {
    const key = locationKey(page);
    byKey.set(key, {
      ...page,
      normalText: cleanText(page.text || page.normalText || ''),
      ocrText: '',
    });
  }
  for (const page of (ocrResult && ocrResult.pages) || []) {
    const key = locationKey(page);
    const current = byKey.get(key) || {
      pageNumber: page.pageNumber || null,
      slideNumber: page.slideNumber || null,
      heading: '',
      normalText: '',
      text: '',
    };
    current.ocrText = mergeText(current.ocrText || '', page.text || page.ocrText || '');
    byKey.set(key, current);
  }

  const pages = [...byKey.values()]
    .sort((a, b) => (a.slideNumber || a.pageNumber || 0) - (b.slideNumber || b.pageNumber || 0))
    .map((page) => {
      const mergedText = mergeText(page.normalText || page.text || '', page.ocrText || '');
      const normalChars = usefulCharCount(page.normalText || page.text || '');
      const ocrChars = usefulCharCount(page.ocrText || '');
      let sourceKind = page.sourceKind || 'text';
      if (normalChars && ocrChars) sourceKind = 'mixed';
      else if (ocrChars) sourceKind = 'ocr';
      else if (!normalChars && page.sourceKind === 'image') sourceKind = 'image';
      return {
        ...page,
        text: mergedText,
        normalText: page.normalText || page.text || '',
        ocrText: page.ocrText || '',
        normalTextChars: normalChars,
        ocrTextChars: ocrChars,
        sourceKind,
      };
    });

  const text = pages.map((page) => {
    const label = page.slideNumber != null ? `Slide ${page.slideNumber}` : `Page ${page.pageNumber || 1}`;
    return page.text ? `${label}\n${page.text}` : '';
  }).filter(Boolean).join('\n\n');

  return {
    ...structured,
    pages,
    text: cleanText(text || structured.text || ''),
    ocrResult: ocrResult || null,
  };
}

module.exports = {
  analyzeExtraction,
  cleanText,
  mergeStructuredWithOcr,
  mergeText,
  usefulCharCount,
  _internals: {
    fingerprint,
    normalizedLine,
    repeatedLineRatio,
    sentenceUnits,
    visualLocations,
  },
};
