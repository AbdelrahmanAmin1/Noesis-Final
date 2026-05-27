'use strict';

const fs = require('fs');
const path = require('path');

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
  return cleanText(fs.readFileSync(filePath, 'utf8'));
}

function extractPptxText(filePath) {
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
  }

  if (!parts.length) {
    throw new Error('pptx_no_extractable_text');
  }
  return parts.join('\n\n');
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

function xmlTextRuns(xml) {
  return extractParagraphText(xml);
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

const WEAK_HEADING_RE = /^(?:top|home|welcome|contents?|table of contents|index|appendix|acknowledgements?|references?|bibliography|copyright|license|quiz answer keys?|answer keys?|answers?|untitled|document|material|file)$/i;

function isWeakHeading(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
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

module.exports = { extractText, detectChapters, _internals: { extractPptxText, xmlTextRuns, extractSlideXmlText, extractTableText, looksLikeContentHeading, isWeakHeading } };
