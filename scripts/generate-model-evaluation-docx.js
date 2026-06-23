'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'docs', 'noesis-model-evaluation-and-selection.md');
const OUTPUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'docs', 'noesis-model-evaluation-and-selection.docx');
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function requireAdmZip() {
  for (const candidate of [path.join(ROOT, 'backend', 'node_modules', 'adm-zip'), 'adm-zip']) {
    try {
      return require(candidate);
    } catch (_) {
      // Try the next location.
    }
  }
  throw new Error('adm-zip is required. Run npm install in backend first.');
}

function xml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function textRuns(text) {
  return String(text == null ? '' : text)
    .split(/\r?\n/)
    .map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t>`)
    .join('');
}

function paragraph(text, style) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${styleXml}<w:r>${textRuns(text)}</w:r></w:p>`;
}

function bullet(text) {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r>${textRuns(text)}</w:r></w:p>`;
}

function table(headers, rows) {
  const width = Math.max(1400, Math.floor(9600 / Math.max(headers.length, 1)));
  const cell = (value, shaded) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shaded ? '<w:shd w:fill="EDEDED"/>' : ''}</w:tcPr>${paragraph(value)}</w:tc>`;
  const headerXml = `<w:tr>${headers.map(header => cell(header, true)).join('')}</w:tr>`;
  const rowXml = rows.map(row => `<w:tr>${headers.map((_, index) => cell(row[index] || '', false)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>${headerXml}${rowXml}</w:tbl>`;
}

function splitTableRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(cell => cell.trim().replace(/<br\s*\/?>/gi, '\n'));
}

function isSeparatorRow(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function stripMarkdownInline(text) {
  return String(text || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const body = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitTableRow(line).map(stripMarkdownInline);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]).map(stripMarkdownInline));
        i += 1;
      }
      body.push(table(headers, rows));
      continue;
    }

    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1) body.push(paragraph(stripMarkdownInline(h1[1]), 'Title'));
    else if (h2) body.push(paragraph(stripMarkdownInline(h2[1]), 'Heading1'));
    else if (h3) body.push(paragraph(stripMarkdownInline(h3[1]), 'Heading2'));
    else if (/^\s*[-*]\s+/.test(line)) body.push(bullet(stripMarkdownInline(line.replace(/^\s*[-*]\s+/, ''))));
    else body.push(paragraph(stripMarkdownInline(line)));
    i += 1;
  }
  return body.join('\n');
}

function documentXml(markdown) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL_NS}">
<w:body>
${renderMarkdown(markdown)}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rStyles" Type="${REL_NS}/styles" Target="styles.xml"/>
<Relationship Id="rNumbering" Type="${REL_NS}/numbering" Target="numbering.xml"/>
</Relationships>`;
}

function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`Input Markdown not found: ${INPUT}`);
  const AdmZip = requireAdmZip();
  const markdown = fs.readFileSync(INPUT, 'utf8');
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml(), 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(rootRelsXml(), 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml(markdown), 'utf8'));
  zip.addFile('word/styles.xml', Buffer.from(stylesXml(), 'utf8'));
  zip.addFile('word/numbering.xml', Buffer.from(numberingXml(), 'utf8'));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(documentRelsXml(), 'utf8'));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  zip.writeZip(OUTPUT);
  console.log(`Generated ${rel(OUTPUT)}`);
}

main();
