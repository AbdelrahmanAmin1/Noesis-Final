'use strict';

const fs = require('fs');
const path = require('path');
const sourceTextQuality = require('./source-text-quality.service');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function extractText(filePath, mimeOrExt) {
  const ext = (path.extname(filePath) || '').toLowerCase();
  const mime = (mimeOrExt || '').toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(filePath));
    return cleanText(data.text || '');
  }
  if (ext === '.pptx' || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return cleanText(extractPptxText(filePath));
  }
  if (ext === '.ppt' || mime === 'application/vnd.ms-powerpoint') {
    throw new Error('ppt_legacy_unsupported: PowerPoint .ppt files are binary and cannot be indexed reliably. Please save the deck as .pptx and upload it again.');
  }
  if (ext === '.docx' || ext === '.doc' || mime.includes('officedocument') || mime.includes('msword')) {
    const mammoth = require('mammoth');
    const out = await mammoth.extractRawText({ path: filePath });
    return cleanText(out.value || '');
  }
  if (isImageFile(ext, mime)) {
    return '';
  }
  return cleanText(fs.readFileSync(filePath, 'utf8'));
}

async function extractStructured(filePath, mimeOrExt, opts = {}) {
  const ext = (path.extname(filePath) || '').toLowerCase();
  const mime = (mimeOrExt || '').toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') return extractPdfStructure(filePath, opts);
  if (ext === '.pptx' || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return extractPptxStructure(filePath);
  }
  if (ext === '.ppt' || mime === 'application/vnd.ms-powerpoint') {
    throw new Error('ppt_legacy_unsupported: PowerPoint .ppt files are binary and cannot be indexed reliably. Please save the deck as .pptx and upload it again.');
  }
  if (isImageFile(ext, mime)) {
    return {
      type: 'image',
      text: '',
      pageCount: 1,
      pages: [{ pageNumber: 1, slideNumber: null, heading: '', text: '', sourceKind: 'image' }],
      visualSources: [{ pageNumber: 1, slideNumber: null, filePath, mime, name: path.basename(filePath) }],
      diagnostics: { imageUpload: true },
    };
  }
  const text = await extractText(filePath, mimeOrExt);
  return {
    type: ext === '.docx' || ext === '.doc' || mime.includes('officedocument') || mime.includes('msword') ? 'doc' : 'text',
    text,
    pageCount: 1,
    pages: [{ pageNumber: 1, slideNumber: null, heading: '', text, sourceKind: 'text' }],
    visualSources: [],
    diagnostics: {},
  };
}

function extractEmbeddedImages(pdfBuffer, maxImages = 12) {
  const images = [];
  const MAX_IMG_BYTES = 5 * 1024 * 1024;
  try {
    let i = 0;
    const len = pdfBuffer.length;
    while (i < len - 3 && images.length < maxImages) {
      if (pdfBuffer[i] === 0xFF && pdfBuffer[i + 1] === 0xD8 && pdfBuffer[i + 2] === 0xFF) {
        const end = Math.min(i + MAX_IMG_BYTES, len);
        let j = i + 3;
        let found = false;
        while (j < end - 1) {
          if (pdfBuffer[j] === 0xFF && pdfBuffer[j + 1] === 0xD9) { j += 2; found = true; break; }
          j++;
        }
        if (found && j - i > 4000) {
          images.push({ buffer: pdfBuffer.slice(i, j), mime: 'image/jpeg', name: `embedded-${images.length + 1}.jpg`, offset: i });
        }
        i = found ? j : i + 3;
      } else {
        i++;
      }
    }
  } catch (_) {}
  return images;
}

async function extractPdfStructure(filePath, opts = {}) {
  const pdfParse = require('pdf-parse');
  const pages = [];
  let pageNumber = 0;
  const pdfBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(pdfBuffer, {
    pagerender: async (pageData) => {
      pageNumber += 1;
      const content = await pageData.getTextContent();
      const text = textFromPdfItems(content.items || []);
      pages.push({
        pageNumber,
        slideNumber: null,
        heading: headingFromText(text),
        text: cleanText(text),
        sourceKind: opts.fromOcrPdf ? 'ocr' : 'text',
      });
      return text;
    },
  });
  if (!pages.length && data.text) {
    pages.push({ pageNumber: 1, slideNumber: null, heading: headingFromText(data.text), text: cleanText(data.text), sourceKind: opts.fromOcrPdf ? 'ocr' : 'text' });
  }
  const embeddedImages = extractEmbeddedImages(pdfBuffer);
  const visualSources = embeddedImages.map((img, idx) => ({
    pageNumber: Math.max(1, Math.min(
      pages.length || data.numpages || 1,
      Math.floor((Number(img.offset || 0) / Math.max(1, pdfBuffer.length)) * (pages.length || data.numpages || 1)) + 1,
    )),
    slideNumber: null,
    buffer: img.buffer,
    mime: img.mime,
    name: img.name,
    associationMethod: 'pdf_byte_offset_estimate',
    associationConfidence: 0.25,
  }));
  return {
    type: 'pdf',
    text: cleanText(pages.map(p => `Page ${p.pageNumber}\n${p.text}`).filter(Boolean).join('\n\n') || data.text || ''),
    pageCount: data.numpages || pages.length || 1,
    pages,
    visualSources,
    diagnostics: {
      pdfPages: data.numpages || pages.length || 1,
      fromOcrPdf: !!opts.fromOcrPdf,
      embeddedImages: visualSources.length,
    },
  };
}

function textFromPdfItems(items = []) {
  const lines = [];
  let current = null;
  for (const item of items) {
    const str = item && item.str ? String(item.str) : '';
    if (!str.trim()) continue;
    const y = item && item.transform ? Math.round(Number(item.transform[5] || 0)) : null;
    const x = item && item.transform ? Number(item.transform[4] || 0) : 0;
    const height = Math.abs(Number(item.height || (item.transform && item.transform[3]) || 0));
    if (current && y != null && current.y != null && Math.abs(y - current.y) > 2) {
      lines.push(current);
      current = null;
    }
    if (!current) current = { y, height, items: [] };
    current.height = Math.max(current.height || 0, height);
    current.items.push({ str, x, width: Math.max(0, Number(item.width || 0)) });
  }
  if (current) lines.push(current);
  if (!lines.length) return '';

  const lineGaps = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = Math.abs(Number(lines[i - 1].y || 0) - Number(lines[i].y || 0));
    if (gap > 2 && gap < 40) lineGaps.push(gap);
  }
  const baselineGap = median(lineGaps) || 12;
  const bodyHeight = median(lines.map(line => line.height).filter(height => height > 0)) || 10;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > 0) {
      const prev = lines[i - 1];
      const verticalGap = Math.abs(Number(prev.y || 0) - Number(line.y || 0));
      const fontBreak = Math.max(prev.height || 0, line.height || 0) > bodyHeight * 1.24;
      if (verticalGap > baselineGap * 1.42 || fontBreak) out.push('');
    }
    out.push(joinPdfLine(line.items));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function median(values = []) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function joinPdfLine(items = []) {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  let text = '';
  let previous = null;
  for (const item of ordered) {
    const value = String(item.str || '').replace(/[ \t]+/g, ' ');
    if (!value.trim()) continue;
    if (!previous) {
      text = value.trimStart();
      previous = item;
      continue;
    }
    const gap = item.x - (previous.x + previous.width);
    const visibleChars = String(previous.str || '').replace(/\s/g, '').length || 1;
    const averageCharWidth = previous.width / visibleChars;
    const spacingThreshold = Math.max(1.2, Math.min(4, averageCharWidth * 0.45));
    if (!/\s$/.test(text) && !/^\s/.test(value) && gap > spacingThreshold) text += ' ';
    text += value;
    previous = item;
  }
  return text.replace(/[ \t]+/g, ' ').trim();
}

function extractPptxText(filePath) {
  const structured = extractPptxStructure(filePath);
  if (!structured.text) {
    throw new Error('pptx_no_extractable_text');
  }
  return structured.text;
}

function extractPptxStructure(filePath) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  const byName = new Map(entries.map(e => [e.entryName, e]));

  const slideNames = entries
    .map(e => e.entryName)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slideNames.length) {
    throw new Error('pptx_no_slides_found');
  }

  const parts = [];
  const pages = [];
  const visualSources = [];
  for (const slideName of slideNames) {
    const n = slideNumber(slideName);
    const slideXml = byName.get(slideName).getData().toString('utf8');
    const slideText = extractSlideXmlText(slideXml);
    const notesName = `ppt/notesSlides/notesSlide${n}.xml`;
    const notesEntry = byName.get(notesName);
    const notesText = notesEntry ? extractParagraphText(notesEntry.getData().toString('utf8')) : [];
    const lines = [...slideText, ...notesText.map(t => `Speaker note: ${t}`)]
      .map(s => s.trim())
      .filter(Boolean);
    if (lines.length) {
      parts.push(`Slide ${n}\n${lines.join('\n')}`);
    }
    const text = cleanText(lines.join('\n'));
    pages.push({
      pageNumber: null,
      slideNumber: n,
      heading: headingFromSlideLines(lines),
      text,
      sourceKind: 'text',
    });
    visualSources.push(...extractSlideImageSources(zip, byName, slideName, slideXml, n));
  }

  return {
    type: 'slides',
    text: cleanText(parts.join('\n\n')),
    pageCount: slideNames.length,
    pages,
    visualSources,
    diagnostics: {
      slideCount: slideNames.length,
      embeddedImages: visualSources.length,
    },
  };
}

function slideNumber(name) {
  const m = String(name).match(/slide(\d+)\.xml/i);
  return m ? parseInt(m[1], 10) : 0;
}

function extractSlideXmlText(xml) {
  const titleShapes = [];
  const titleTexts = [];
  const shapeRe = /<p:sp\b[\s\S]*?<\/p:sp>/gi;
  let m;
  while ((m = shapeRe.exec(xml))) {
    if (!/<p:ph\b[^>]*\btype=(["'])(?:title|ctrTitle)\1/i.test(m[0])) continue;
    titleShapes.push(m[0]);
    titleTexts.push(...extractParagraphText(m[0]).map(t => `Title: ${t}`));
  }

  let bodyXml = xml;
  titleShapes.forEach(shape => { bodyXml = bodyXml.replace(shape, ''); });

  const tableBlocks = [];
  bodyXml = bodyXml.replace(/<a:tbl\b[\s\S]*?<\/a:tbl>/gi, (block) => {
    tableBlocks.push(block);
    return '';
  });

  const tableTexts = tableBlocks.flatMap(extractTableText);
  const bodyTexts = extractParagraphText(bodyXml);
  return collapseRepeats([...titleTexts, ...bodyTexts, ...tableTexts]);
}

function extractTableText(tableXml) {
  const rows = [];
  const rowRe = /<a:tr\b[\s\S]*?<\/a:tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tableXml))) {
    const cells = [];
    const cellRe = /<a:tc\b[\s\S]*?<\/a:tc>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[0]))) {
      const cellText = extractParagraphText(cellMatch[0]).join(' / ').trim();
      cells.push(cellText);
    }
    const rowText = cells.map(c => c.trim()).filter(Boolean).join('\t');
    if (rowText) rows.push(`Table row: ${rowText}`);
  }
  return collapseRepeats(rows);
}

function extractParagraphText(xml) {
  const paragraphs = [];
  const re = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const text = textRunsInBlock(m[1]);
    if (text) paragraphs.push(text);
  }
  return collapseRepeats(paragraphs);
}

function textRunsInBlock(xml) {
  const runs = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const text = decodeXml(m[1]).replace(/\s+/g, ' ');
    if (text.trim()) runs.push(text);
  }
  return runs.join('').replace(/\s+/g, ' ').trim();
}

function extractSlideImageSources(zip, byName, slideName, slideXml, n) {
  const relsName = `ppt/slides/_rels/slide${n}.xml.rels`;
  const relsEntry = byName.get(relsName);
  if (!relsEntry) return [];
  const embeddedIds = new Set();
  const embedRe = /\br:embed=(["'])([^"']+)\1/gi;
  let embedMatch;
  while ((embedMatch = embedRe.exec(slideXml))) embeddedIds.add(embedMatch[2]);

  const relsXml = relsEntry.getData().toString('utf8');
  const out = [];
  const relRe = /<Relationship\b([^>]+?)\/?>/gi;
  let relMatch;
  while ((relMatch = relRe.exec(relsXml))) {
    const attrs = parseXmlAttrs(relMatch[1]);
    if (!attrs.Id || !attrs.Target || !/\/image$/i.test(attrs.Type || '')) continue;
    if (embeddedIds.size && !embeddedIds.has(attrs.Id)) continue;
    const entryName = path.posix.normalize(path.posix.join(path.posix.dirname(slideName), attrs.Target));
    const entry = byName.get(entryName);
    if (!entry) continue;
    out.push({
      pageNumber: null,
      slideNumber: n,
      name: path.posix.basename(entryName),
      entryName,
      mime: mimeFromName(entryName),
      buffer: entry.getData(),
    });
  }
  return out;
}

function parseXmlAttrs(value) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)=(["'])(.*?)\2/g;
  let m;
  while ((m = re.exec(value || ''))) attrs[m[1]] = decodeXml(m[3]);
  return attrs;
}

function mimeFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function isImageFile(ext, mime) {
  return IMAGE_EXTS.has(ext) || String(mime || '').startsWith('image/');
}

function xmlTextRuns(xml) {
  const paragraphs = extractParagraphText(xml);
  if (paragraphs.length) return paragraphs;
  const runs = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const text = decodeXml(m[1]).replace(/\s+/g, ' ').trim();
    if (text) runs.push(text);
  }
  return collapseRepeats(runs);
}

function collapseRepeats(items) {
  const out = [];
  for (const item of items) {
    if (out[out.length - 1] !== item) out.push(item);
  }
  return out;
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\uF0A7\uF075\uF0B7\u2022]/g, '\n- ')
    .replace(/\n\s*-\s*\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headingFromSlideLines(lines) {
  for (const line of lines || []) {
    const text = String(line || '').replace(/^Title:\s*/i, '').replace(/^Speaker note:\s*/i, '').trim();
    if (text && !isWeakHeading(text) && text.length <= 120) return text;
  }
  return '';
}

function headingFromText(text) {
  const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  return headingFromSlideLines(lines);
}

const WEAK_HEADING_RE = /^(?:top|home|welcome|contents?|table of contents|index|appendix|acknowledgements?|references?|bibliography|copyright|license|quiz answer keys?|answer keys?|answers?|untitled|document|material|file)$/i;

function isWeakHeading(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (sourceTextQuality.isWeakHeading(text)) return true;
  if (WEAK_HEADING_RE.test(text)) return true;
  return /^(?:page|p\.)\s*\d+$/i.test(text);
}

function looksLikeContentHeading(trimmed, prevBlank, nextBlank) {
  if (!trimmed || trimmed.length > 120 || isWeakHeading(trimmed)) return false;
  if (/^(?:chapter\s+\d+|ch\.?\s*\d+|section\s+\d+|\d+\.\s+\S|#{1,3}\s+\S|topic\s*[:]\s*\S|module\s+\d+|unit\s+\d+)/i.test(trimmed)) return true;
  if (/^Slide\s+\d+/i.test(trimmed)) return true;
  if (/^(?:[A-Z][A-Za-z0-9(),/&:+-]*\s+){1,8}[A-Z][A-Za-z0-9(),/&:+-]*$/.test(trimmed) && !/[.!?,;:]$/.test(trimmed)) {
    return prevBlank || nextBlank || /(?:system|structure|function|properties|terminology|applications|operations|traversal|construction|hashing|skeleton|bones?|vertebrae|limb|tree|search)/i.test(trimmed);
  }
  return false;
}

// Detect chapters via heading regex + short-line heuristic; fallback to single chapter.
function detectChapters(text) {
  const lines = text.split('\n');
  const headings = [];
  let charPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 120) {
      const prevBlank = i === 0 || lines[i - 1].trim() === '';
      const nextBlank = i >= lines.length - 1 || lines[i + 1].trim() === '';
      const isHeading = looksLikeContentHeading(trimmed, prevBlank, nextBlank);
      if (isHeading) {
        let title = trimmed.replace(/^#+\s*/, '').replace(/^Slide\s+\d+\s*[:.-]?\s*/i, '').slice(0, 120).trim();
        if (/^Slide\s+\d+/i.test(trimmed) && !title) {
          const next = lines.slice(i + 1).map(l => l.trim()).find(l => l && l.length < 120 && !/^[-•]$/.test(l));
          title = next ? next.replace(/^Title:\s*/i, '').trim() : `Slide ${headings.length + 1}`;
        }
        if (isWeakHeading(title)) {
          charPos += line.length + 1;
          continue;
        }
        const pageMatch = lines.slice(Math.max(0, i - 2), i + 1).join('\n').match(/\b(?:page|p\.)\s*(\d{1,4})\b/i);
        headings.push({
          idx: headings.length,
          title: title || `Section ${headings.length + 1}`,
          char_start: charPos,
          source_page: pageMatch ? parseInt(pageMatch[1], 10) : null,
        });
      }
    }
    charPos += line.length + 1;
  }
  if (headings.length === 0) {
    return [{ idx: 0, title: 'Document', char_start: 0, char_end: text.length }];
  }
  for (let i = 0; i < headings.length; i++) {
    headings[i].char_end = i + 1 < headings.length ? headings[i + 1].char_start : text.length;
  }
  return headings;
}

module.exports = {
  extractText,
  extractStructured,
  detectChapters,
  _internals: {
    joinPdfLine,
    textFromPdfItems,
    extractPdfStructure,
    extractPptxStructure,
    extractPptxText,
    extractSlideImageSources,
    headingFromSlideLines,
    isImageFile,
    mimeFromName,
    parseXmlAttrs,
    xmlTextRuns,
    extractSlideXmlText,
    extractTableText,
    looksLikeContentHeading,
    isWeakHeading,
  },
};
