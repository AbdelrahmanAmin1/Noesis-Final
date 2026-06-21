'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'docs', 'testing-evaluation-report.docx');
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PER_PX = 9525;
const MAX_IMAGE_CX = Math.round(6.3 * 914400);
const MAX_IMAGE_CY = Math.round(7.2 * 914400);

function requireAdmZip() {
  const candidates = [
    path.join(ROOT, 'backend', 'node_modules', 'adm-zip'),
    'adm-zip',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {
      // Try the next location.
    }
  }
  throw new Error('adm-zip is required. Run npm install in backend first.');
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function abs(file) {
  return path.isAbsolute(file) ? file : path.join(ROOT, file);
}

function xml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textRuns(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  return lines.map((line, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t>`).join('');
}

function p(text, style) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${styleXml}<w:r>${textRuns(text)}</w:r></w:p>`;
}

function bullet(text) {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r>${textRuns(text)}</w:r></w:p>`;
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function cell(text) {
  return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${p(String(text == null ? '' : text))}</w:tc>`;
}

function table(headers, rows) {
  const headerXml = `<w:tr>${headers.map(h => `<w:tc><w:tcPr><w:shd w:fill="EDEDED"/><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${p(h)}</w:tc>`).join('')}</w:tr>`;
  const bodyXml = rows.map(row => `<w:tr>${headers.map((_, index) => cell(row[index])).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>${headerXml}${bodyXml}</w:tbl>`;
}

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 1000) / 10}%` : 'N/A';
}

function latestEvidenceSummary() {
  const explicit = process.env.NOESIS_EVIDENCE_SUMMARY || process.argv[3];
  if (explicit && fs.existsSync(abs(explicit))) return abs(explicit);
  const runsDir = path.join(ROOT, 'docs', 'test-evidence', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('No evidence runs found.');
  const candidates = fs.readdirSync(runsDir)
    .map(name => path.join(runsDir, name, 'results', 'evidence-summary.json'))
    .filter(file => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!candidates.length) throw new Error('No evidence-summary.json files found.');
  return candidates[0];
}

function providerEntries(evidence) {
  if (evidence.providerEvals) return Object.entries(evidence.providerEvals);
  return evidence.evals ? [['ollama', evidence.evals]] : [];
}

function listBackendTestFiles() {
  const dir = path.join(ROOT, 'backend', '__tests__');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(test|spec)\.[cm]?js$/i.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort().map(file => {
    const text = fs.readFileSync(file, 'utf8');
    const tests = (text.match(/\b(?:it|test)\s*\(/g) || []).length;
    const suites = (text.match(/\bdescribe\s*\(/g) || []).length;
    return { file: rel(file), tests, suites };
  });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return { width: 1200, height: 800 };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function imageDrawing(relId, id, title, file) {
  const size = pngSize(file);
  let cx = size.width * EMU_PER_PX;
  let cy = size.height * EMU_PER_PX;
  const scale = Math.min(1, MAX_IMAGE_CX / cx, MAX_IMAGE_CY / cy);
  cx = Math.round(cx * scale);
  cy = Math.round(cy * scale);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(title)}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(path.basename(file))}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function buildDocument(evidence, imageRels) {
  const testFiles = listBackendTestFiles();
  const providerRows = providerEntries(evidence).map(([provider, item]) => {
    const result = item.result || {};
    return [
      provider,
      result.model || 'N/A',
      result.records || 0,
      result.passed || 0,
      result.failed || 0,
      result.averageScore == null ? 'N/A' : `${result.averageScore}/3`,
      result.jsonValidityRate == null ? 'N/A' : percent(result.jsonValidityRate),
      item.command ? item.command.logPath : 'N/A',
    ];
  });
  const evalRows = providerEntries(evidence).flatMap(([provider, item]) => {
    const result = item.result || {};
    return (result.fileResults || []).map(row => [
      provider,
      row.file,
      row.feature,
      row.records,
      `${row.averageScore}/3`,
      `${row.passed}/${row.records}`,
      row.failed,
    ]);
  });
  const evalCaseRows = providerEntries(evidence).flatMap(([provider, item]) => {
    const result = item.result || {};
    return (result.fileResults || []).flatMap(file => (file.cases || []).map(testCase => [
      provider,
      file.file,
      testCase.id || `line ${testCase.line || ''}`,
      testCase.ok ? 'passed' : 'failed',
      testCase.score == null ? 'N/A' : testCase.score,
      Array.isArray(testCase.keywordHits) ? `${testCase.keywordHits.length}/${testCase.keywordTotal}` : 'N/A',
      testCase.jsonValid ? 'yes' : 'no',
      testCase.error || testCase.responsePreview || '',
    ]));
  });
  const smokeRows = ((evidence.apiSmoke && evidence.apiSmoke.result && evidence.apiSmoke.result.steps) || []).map(step => [
    step.id,
    step.title,
    step.status,
    step.durationMs,
    step.error || JSON.stringify(step.result || {}).slice(0, 350),
  ]);
  const commandRows = (evidence.commands || []).map(command => [
    command.label || command.id,
    command.command,
    command.ok ? 'passed' : 'failed',
    command.durationMs,
    command.logPath,
  ]);
  const claimRows = evidence.wordComparison && evidence.wordComparison.claims
    ? evidence.wordComparison.claims.map(item => [
      item.claim,
      item.expected,
      item.actual == null ? 'not found' : item.actual,
      item.supported ? 'supported' : 'not supported',
    ])
    : [];

  const body = [];
  body.push(p('Noesis Testing and Evaluation Report', 'Title'));
  body.push(p(`Generated: ${evidence.generatedAt || new Date().toISOString()}`));
  body.push(p(`Repository: ${ROOT}`));
  body.push(p(`Evidence run: ${evidence.runDir || rel(path.dirname(latestEvidenceSummary()))}`));
  body.push(p('This Word document is generated from reproducible local evidence. It intentionally excludes secrets from backend/.env.'));
  body.push(p('Executive Summary', 'Heading1'));
  body.push(table(['Metric', 'Value'], [
    ['Overall evidence score', evidence.score ? `${evidence.score.total}/100` : 'N/A'],
    ['Backend tests', evidence.backendTests && evidence.backendTests.summary ? `${evidence.backendTests.summary.pass}/${evidence.backendTests.summary.tests} passed across ${evidence.backendTests.summary.testFiles || testFiles.length} files` : 'N/A'],
    ['API smoke workflow', evidence.apiSmoke && evidence.apiSmoke.result ? `${evidence.apiSmoke.result.passed} passed, ${evidence.apiSmoke.result.failed} failed, ${evidence.apiSmoke.result.environmentDependent} environment-dependent` : 'N/A'],
    ['Ollama model', evidence.environment ? evidence.environment.generationModel : 'N/A'],
    ['Groq model', evidence.environment ? evidence.environment.groqModel : 'N/A'],
    ['Screenshot count', String((evidence.screenshots || []).filter(item => item.ok).length)],
  ]));

  body.push(p('Provider AI Evaluation Scores', 'Heading1'));
  body.push(table(['Provider', 'Model', 'Records', 'Passed', 'Failed', 'Average', 'JSON Validity', 'Log'], providerRows));

  body.push(p('Backend Test Inventory', 'Heading1'));
  body.push(table(['Test file', 'Test cases', 'Suites'], testFiles.map(item => [item.file, item.tests, item.suites])));

  body.push(p('Automated Command Results', 'Heading1'));
  body.push(table(['Command', 'Invocation', 'Status', 'Duration ms', 'Log'], commandRows));

  body.push(p('API Smoke Workflow', 'Heading1'));
  body.push(table(['Step', 'Title', 'Status', 'Duration ms', 'Evidence preview'], smokeRows));

  body.push(p('Evaluation File Results', 'Heading1'));
  body.push(table(['Provider', 'JSONL file', 'Feature', 'Records', 'Average', 'Passed', 'Failed'], evalRows));

  body.push(p('Evaluation Case Scores', 'Heading1'));
  body.push(table(['Provider', 'JSONL file', 'Case', 'Status', 'Score', 'Keyword hits', 'JSON valid', 'Preview/error'], evalCaseRows));

  body.push(p('Static Validation', 'Heading1'));
  body.push(table(['Area', 'Status', 'Evidence'], [
    ['Frontend bundle verification', evidence.frontend && evidence.frontend.command && evidence.frontend.command.ok ? 'passed' : 'failed', evidence.frontend && evidence.frontend.command ? evidence.frontend.command.logPath : 'N/A'],
    ['Knowledge validation', evidence.knowledge && evidence.knowledge.command && evidence.knowledge.command.ok ? 'passed' : 'failed', evidence.knowledge && evidence.knowledge.command ? evidence.knowledge.command.logPath : 'N/A'],
    ['License/source validation', evidence.licenses && evidence.licenses.command && evidence.licenses.command.ok ? 'passed' : 'failed', evidence.licenses && evidence.licenses.command ? evidence.licenses.command.logPath : 'N/A'],
  ]));

  body.push(p('Word Baseline Claim Comparison', 'Heading1'));
  body.push(table(['Claim', 'Expected', 'Current evidence', 'Status'], claimRows));

  body.push(p('Screenshot Evidence', 'Heading1'));
  body.push(p('The following screenshots are generated from the evidence HTML pages produced by the suite.'));
  for (const image of imageRels) {
    body.push(p(image.title, 'Heading2'));
    body.push(p(`Source: ${image.path}`));
    body.push(imageDrawing(image.relId, image.id, image.title, image.absPath));
  }

  body.push(p('Artifacts', 'Heading1'));
  for (const item of [
    'docs/testing-evaluation-report.md',
    'docs/testing-evaluation-summary.json',
    'docs/testing-evaluation-screenshot-index.md',
    evidence.runDir || '',
  ].filter(Boolean)) {
    body.push(bullet(item));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="${REL_NS}"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
${body.join('\n')}
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

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRels(imageRels) {
  const base = [
    `<Relationship Id="rStyles" Type="${REL_NS}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rNumbering" Type="${REL_NS}/numbering" Target="numbering.xml"/>`,
  ];
  const images = imageRels.map(item => `<Relationship Id="${item.relId}" Type="${REL_NS}/image" Target="media/${path.basename(item.absPath)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${base.concat(images).join('\n')}
</Relationships>`;
}

function main() {
  const summaryPath = latestEvidenceSummary();
  const evidence = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const screenshots = (evidence.screenshots || [])
    .filter(item => item.ok && item.screenshotPath && fs.existsSync(abs(item.screenshotPath)))
    .map((item, index) => ({
      id: index + 1,
      relId: `rImg${index + 1}`,
      title: item.title || path.basename(item.screenshotPath),
      path: item.screenshotPath,
      absPath: abs(item.screenshotPath),
    }));

  const AdmZip = requireAdmZip();
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes(), 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(rootRels(), 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(buildDocument(evidence, screenshots), 'utf8'));
  zip.addFile('word/styles.xml', Buffer.from(stylesXml(), 'utf8'));
  zip.addFile('word/numbering.xml', Buffer.from(numberingXml(), 'utf8'));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(documentRels(screenshots), 'utf8'));
  for (const image of screenshots) {
    zip.addFile(`word/media/${path.basename(image.absPath)}`, fs.readFileSync(image.absPath));
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  zip.writeZip(OUTPUT);

  console.log(`Generated ${rel(OUTPUT)}`);
  console.log(`Evidence summary: ${rel(summaryPath)}`);
  console.log(`Embedded screenshots: ${screenshots.length}`);
}

main();
