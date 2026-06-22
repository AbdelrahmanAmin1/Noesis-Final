'use strict';

const sourceTextQuality = require('./source-text-quality.service');

const DATE_RE = /^(?:\w+day,?\s+)?(?:\d{1,2}[\/-]){2}\d{2,4}$|^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}$/i;
const PAGE_NUMBER_RE = /^(?:page|slide|p\.)?\s*\d{1,4}(?:\s*(?:of|\/|-)\s*\d{1,4})?$/i;
const NAVIGATION_RE = /^(?:home|next|previous|back|menu|navigation|click to continue|table of contents|contents)$/i;
const ANNOUNCEMENT_RE = /^(?:announcement|reminder|due date|office hours|exam date|assignment due|contact information)\b/i;
const PRESENTER_RE = /^(?:(?:presented|prepared|created|compiled)\s+by|(?:professor|instructor|lecturer|presenter)\s*:)/i;
const DECORATIVE_RE = /^(?:welcome|thank you|questions\??|end|divider|section break|course logo|university logo)$/i;
const EMPTY_EXERCISE_RE = /^(?:exercise|activity|practice|try it|your turn|discussion|question)\s*\d*\s*[:.-]?\s*(?:solve|answer|discuss|complete|work with a partner)?\s*$/i;

const EDUCATIONAL_PATTERNS = [
  ['definition', /\b(?:is defined as|refers to|means that|definition|we call|is a|are a)\b/i],
  ['learning_outcome', /\b(?:learning outcomes?|objectives?|by the end|you will be able to|students? should)\b/i],
  ['example', /\b(?:example|for instance|e\.g\.|case study|consider)\b/i],
  ['rule', /\b(?:rule|must|always|never|requires?|constraint|principle)\b/i],
  ['comparison', /\b(?:compare|contrast|versus|vs\.?|difference|similarity|advantage|disadvantage)\b/i],
  ['process', /\b(?:step\s*\d+|first|second|then|finally|process|procedure|algorithm|workflow)\b/i],
  ['warning', /\b(?:warning|caution|common mistake|pitfall|avoid|do not|don't)\b/i],
  ['summary', /\b(?:summary|recap|key point|takeaway|in conclusion)\b/i],
  ['formula', /(?:^|\s)[A-Za-z0-9_()]+\s*(?:=|<=|>=|≈|∑|√|\^|\+|\*|\/)\s*[A-Za-z0-9_()]/],
  ['diagram_label', /\b(?:figure|diagram|flowchart|class diagram|architecture|node|edge|label|shown below|shown above)\b/i],
];

const CODE_RE = /(?:```|^\s*(?:class|interface|def|function|const|let|var|public|private|protected|import|#include)\b|\b(?:if|for|while)\s*\(|[{};]\s*$)/im;

function clean(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

function fingerprint(value) {
  return sourceTextQuality.normalize(value).replace(/\b\d{1,4}\b/g, '#');
}

function pageLocation(page = {}) {
  return { pageNumber: page.pageNumber || null, slideNumber: page.slideNumber || null };
}

function unitsForPage(page = {}) {
  const text = clean(page.text || page.normalText || page.ocrText || '');
  if (!text) return [];
  const blocks = text.split(/\n{2,}/).flatMap((block) => {
    const value = clean(block);
    if (!value) return [];
    if (CODE_RE.test(value) || /\t|\s{3,}/.test(value)) return [value];
    return value.split(/\n+/).map(clean).filter(Boolean);
  });
  return blocks.map((textValue, index) => ({
    id: `${page.slideNumber != null ? 's' : 'p'}:${page.slideNumber ?? page.pageNumber ?? 1}:${index}`,
    text: textValue,
    rawText: textValue,
    ...pageLocation(page),
    heading: page.heading || '',
    ocrConfidence: page.ocrConfidence == null ? null : Number(page.ocrConfidence),
    ocrWords: page.ocrWords || [],
  }));
}

function repeatedFingerprints(pages = []) {
  const counts = new Map();
  for (const page of pages) {
    const onPage = new Set(unitsForPage(page).map(unit => fingerprint(unit.text)).filter(value => value.length >= 4));
    for (const value of onPage) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pages.length * 0.4));
  return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([value]) => value));
}

function educationalSignals(value) {
  const text = clean(value);
  const signals = EDUCATIONAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (CODE_RE.test(text)) signals.push('code');
  return [...new Set(signals)];
}

function lowValueReasons(unit, context = {}) {
  const text = clean(unit && unit.text);
  const reasons = [];
  if (!text) return ['empty'];
  const signals = educationalSignals(text);
  const normalized = fingerprint(text);
  if (PAGE_NUMBER_RE.test(text)) reasons.push('page_or_slide_number');
  if (DATE_RE.test(text)) reasons.push('date');
  if (NAVIGATION_RE.test(text)) reasons.push('navigation');
  if (ANNOUNCEMENT_RE.test(text)) reasons.push('announcement');
  if (PRESENTER_RE.test(text)) reasons.push('presenter_or_author');
  if (DECORATIVE_RE.test(text)) reasons.push('decorative_label');
  if (EMPTY_EXERCISE_RE.test(text)) reasons.push('empty_exercise_prompt');
  if (sourceTextQuality.isDocumentMetadata(text)) reasons.push('document_metadata');
  if (context.repeated && context.repeated.has(normalized)) {
    if (signals.length === 0 || text.split(/\s+/).length <= 10) reasons.push('repeated_header_or_footer');
  }
  if (context.titleFingerprint && normalized === context.titleFingerprint && context.titleOccurrences > 1) reasons.push('repeated_title');
  return [...new Set(reasons)];
}

function detectContentType(value) {
  const text = clean(value);
  if (CODE_RE.test(text)) return 'code';
  if (/^(?:table row:)|\t|\|.+\|/.test(text)) return 'table';
  const signals = educationalSignals(text);
  if (signals.includes('formula')) return 'formula';
  if (signals.includes('diagram_label')) return 'diagram_label';
  if (signals.includes('example')) return 'example';
  if (signals.includes('learning_outcome')) return 'learning_outcome';
  if (signals.includes('definition')) return 'definition';
  if (signals.includes('warning')) return 'warning';
  if (signals.includes('summary')) return 'summary';
  return 'prose';
}

function analyzePages(pages = [], opts = {}) {
  const repeated = repeatedFingerprints(pages);
  const titleFingerprint = fingerprint(opts.title || '');
  const titleOccurrences = pages.reduce((count, page) => count + unitsForPage(page).filter(unit => fingerprint(unit.text) === titleFingerprint).length, 0);
  const analyzedPages = [];
  const candidates = [];
  const lowValueTextRemoved = [];
  for (const page of pages) {
    const pageCandidates = [];
    const pageRemoved = [];
    for (const unit of unitsForPage(page)) {
      const signals = educationalSignals(unit.text);
      const reasons = lowValueReasons(unit, { repeated, titleFingerprint, titleOccurrences });
      const row = { ...unit, contentType: detectContentType(unit.text), educationalSignals: signals, lowValueReasons: reasons };
      if (reasons.length && !signals.includes('code') && !signals.includes('formula') && !signals.includes('definition')) {
        pageRemoved.push(row);
        lowValueTextRemoved.push(row);
      } else {
        pageCandidates.push(row);
        candidates.push(row);
      }
    }
    analyzedPages.push({
      ...page,
      candidateUnits: pageCandidates,
      lowValueUnits: pageRemoved,
      provisionalEducationalText: pageCandidates.map(unit => unit.text).join('\n'),
    });
  }
  return {
    pages: analyzedPages,
    candidates,
    lowValueTextRemoved,
    provisionalText: candidates.map(unit => unit.text).join('\n\n'),
    repeatedFingerprints: repeated,
  };
}

module.exports = {
  analyzePages,
  detectContentType,
  educationalSignals,
  fingerprint,
  lowValueReasons,
  unitsForPage,
  _internals: { repeatedFingerprints },
};
