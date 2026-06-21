'use strict';

const DOCUMENT_REFERENCE_RE = /\b(?:uploaded|provided|source) (?:material|document|text|content|file|pdf|notes?)\b|\b(?:document|file) (?:name|title)\b|\b(?:handout|syllabus|slide deck|lecture notes|course notes|worksheet)\b/i;
const COURSE_CODE_RE = /\b[A-Z]{2,6}\s*[-_]?\s*\d{2,4}[A-Z]?\b/i;
const TERM_DATE_RE = /\b(?:fall|spring|summer|winter|semester|term)\s*[,:'-]?\s*(?:19|20)\d{2}(?:\s*[-/]\s*\d{2,4})?\b/i;
const CREDIT_RE = /\b(?:thanks|credit|courtesy) to\b|\b(?:prepared|written|created|compiled|presented) by\b|\b(?:author|instructor|professor|copyright|all rights reserved)\b/i;
const FILE_NAME_RE = /\b[^\s]+\.(?:pdf|pptx?|docx?|txt|md)\b/i;
const NUMBERED_META_RE = /^(?:chapter|lecture|lesson|module|unit|part|section|slide|page|p\.)\s*#?\s*\d+\s*$/i;
const NUMBERED_DOCUMENT_RE = /^(?:[^.!?]{2,80}\s+)?(?:handout|worksheet|lecture|slide)\s*#?\s*\d+\b/i;
const GENERIC_LABEL_RE = /^(?:document|file|material|upload|uploaded material|source|lesson|notes?|contents?|untitled|overview|introduction|summary|page\s*\d+|\d+)$/i;
const LEADING_FRAGMENT_RE = /^(?:and|but|or|from|to|of|for|with|without|into|onto|than|that|which|while|because|therefore|however\s*,?\s*(?:in|on|at|for)?|although)\b/i;
const TRAILING_FRAGMENT_RE = /\b(?:and|but|or|the|a|an|to|of|for|with|without|into|from|that|which|does not|is not|are not)\s*[,:;\-]*$/i;
const BROKEN_SHORT_TOKEN_RE = /\b[a-z]\s+[a-z]{2}\b/;
const PAGE_LECTURE_PREFIX_RE = /(^|[\n\r]\s*)(?:#{1,6}\s*)?(?:page|slide|lecture|chapter|lesson|module|unit|part|section|p\.)\s*#?\s*\d+[a-z]?\s*[:.)\-\u2013\u2014]?\s*/gi;
const COURSE_CODE_WITH_NUMBER_RE = /\b[A-Z]{2,8}\s*[-_]?\s*\d{2,4}[A-Z]?(?:\s+\d{1,3})?\b[,:;]?\s*/g;
const FULL_DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi;
const NUMERIC_DATE_RE = /\b\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})\b/g;
const AUTHOR_TAIL_RE = /,\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:and|&)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)?)\s*$/;
const AUTHOR_LIST_TAIL_RE = /\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:and|&)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/;
const SOURCE_LABEL_RE = /\[(?:chunk|source[_\s-]*chunk)\s*:?\s*\d+\]|\bsource[_\s-]*chunk[_\s-]*ids?\s*:?\s*\[[^\]]*\]|\bchunk\s*id\s*#?\s*\d+\b/gi;
const PAGE_MENTION_RE = /\b(?:on|from|see|shown on|look at|refer to|according to)\s+(?:the\s+)?(?:page|slide|lecture|chapter)\s*#?\s*\d+[a-z]?\b/gi;
const STANDALONE_PAGE_RE = /\b(?:page|slide|lecture|chapter)\s*#?\s*\d+[a-z]?\b/gi;
const GENERIC_LOCATION_META_RE = /\b(?:the\s+)?(?:page|slide|lecture|chapter|course|document)\s+(?:numbers?|headers?|labels?|titles?)\b/gi;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isDocumentMetadata(value) {
  const text = clean(value);
  if (!text) return false;
  return DOCUMENT_REFERENCE_RE.test(text)
    || COURSE_CODE_RE.test(text)
    || TERM_DATE_RE.test(text)
    || CREDIT_RE.test(text)
    || FILE_NAME_RE.test(text)
    || NUMBERED_META_RE.test(text)
    || NUMBERED_DOCUMENT_RE.test(text);
}

function stripSourceNoise(value, opts = {}) {
  const preserveNewlines = opts.preserveNewlines !== false;
  const original = String(value || '');
  const metadataish = /(?:^|[\n\r]\s*)(?:#{1,6}\s*)?(?:page|slide|lecture|chapter|lesson|module|unit|part|section|p\.)\s*#?\s*\d+/i.test(original)
    || COURSE_CODE_WITH_NUMBER_RE.test(original)
    || FULL_DATE_RE.test(original)
    || TERM_DATE_RE.test(original)
    || CREDIT_RE.test(original)
    || FILE_NAME_RE.test(original);
  COURSE_CODE_WITH_NUMBER_RE.lastIndex = 0;
  FULL_DATE_RE.lastIndex = 0;
  let text = original
    .replace(/\r\n/g, '\n')
    .replace(SOURCE_LABEL_RE, '')
    .replace(PAGE_MENTION_RE, '')
    .replace(GENERIC_LOCATION_META_RE, '')
    .replace(PAGE_LECTURE_PREFIX_RE, '$1')
    .replace(COURSE_CODE_WITH_NUMBER_RE, '')
    .replace(FULL_DATE_RE, '')
    .replace(NUMERIC_DATE_RE, '')
    .replace(TERM_DATE_RE, '')
    .replace(/\b(?:lecture|slide|page)\s*[:#-]?\s*$/gim, '')
    .replace(/\b(?:prepared|written|created|compiled|presented)\s+by\s+[^.!?\n]{2,80}/gi, '')
    .replace(/\b(?:author|instructor|professor)\s*:?\s+[^.!?\n]{2,80}/gi, '');
  if (metadataish) text = text.replace(AUTHOR_TAIL_RE, '').replace(AUTHOR_LIST_TAIL_RE, '');
  text = text
    .replace(STANDALONE_PAGE_RE, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/\s*[-\u2013\u2014]\s*(?=[,.;:!?]|\n|$)/g, '')
    .replace(/(^|\n)\s*[-\u2013\u2014:;,]\s*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!preserveNewlines) text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function cleanVisible(value) {
  return clean(stripSourceNoise(value, { preserveNewlines: false }));
}

function sourceLabel(value, fallback = 'Source excerpt') {
  const text = cleanVisible(value);
  if (!text || isWeakHeading(text) || /^(?:page|slide|lecture|chapter|document|source excerpt)$/i.test(text)) return fallback;
  return text;
}

function sanitizeObjectStrings(value, seen = new WeakSet()) {
  if (typeof value === 'string') return stripSourceNoise(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitizeObjectStrings(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = sanitizeObjectStrings(item, seen);
  return out;
}

function isIncompleteLabel(value) {
  const text = clean(value);
  if (!text) return true;
  if (LEADING_FRAGMENT_RE.test(text) || TRAILING_FRAGMENT_RE.test(text)) return true;
  if (text.split(/\s+/).length <= 3 && /[,;:]$/.test(text)) return true;
  return false;
}

function isWeakHeading(value) {
  const text = clean(value);
  if (!text || text.length > 120) return true;
  if (GENERIC_LABEL_RE.test(text) || isDocumentMetadata(text) || isIncompleteLabel(text)) return true;
  if (/^[.!?,;:\-]+$/.test(text)) return true;
  return false;
}

function hasBrokenWordArtifact(value) {
  const text = String(value || '');
  return BROKEN_SHORT_TOKEN_RE.test(text)
    || /\b(?:enca\s+psulat|reque\s+sts|mess\s+ages|interf\s+ace|implem\s+entation|objec\s+ts?)\b/i.test(text);
}

function isMalformedVisibleText(value) {
  const text = clean(value);
  if (!text || hasBrokenWordArtifact(text)) return true;
  if (text.length < 8 || isIncompleteLabel(text)) return true;
  return false;
}

module.exports = {
  clean,
  cleanVisible,
  normalize,
  isDocumentMetadata,
  isIncompleteLabel,
  isWeakHeading,
  hasBrokenWordArtifact,
  isMalformedVisibleText,
  stripSourceNoise,
  sourceLabel,
  sanitizeObjectStrings,
};
