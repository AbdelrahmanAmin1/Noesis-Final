'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { extractText, extractStructured } = require('../services/extract.service');

function makePptx(filePath) {
  const zip = new AdmZip();
  zip.addFile('ppt/slides/slide1.xml', Buffer.from(`
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
          <p:txBody><a:p><a:r><a:t>Encapsulation in Java</a:t></a:r></a:p></p:txBody>
        </p:sp>
        <p:sp>
          <p:txBody>
            <a:p><a:r><a:t>Private fields protect object state.</a:t></a:r></a:p>
            <a:p><a:r><a:t>Public methods provide controlled access.</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:sld>
  `));
  zip.addFile('ppt/notesSlides/notesSlide1.xml', Buffer.from(`
    <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>Use a Counter example with increment().</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:notes>
  `));
  zip.writeZip(filePath);
}

function uploadedPdfFixture() {
  const dir = path.join(__dirname, '..', 'uploads', 'materials');
  try {
    return fs.readdirSync(dir)
      .filter(name => name.toLowerCase().endsWith('.pdf'))
      .map(name => path.join(dir, name))
      .find(file => fs.statSync(file).size > 0);
  } catch (_) {
    return null;
  }
}

describe('extract.service video grounding fixtures', () => {
  it('extracts non-empty, slide-numbered text from PPTX files', async () => {
    const filePath = path.join(os.tmpdir(), `noesis-extract-${Date.now()}.pptx`);
    makePptx(filePath);
    try {
      const text = await extractText(filePath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      expect(text).toMatch(/Slide 1/);
      expect(text).toMatch(/Title: Encapsulation in Java/);
      expect(text).toMatch(/Private fields protect object state/);
      expect(text).toMatch(/Speaker note: Use a Counter example/);
    } finally {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });

  it('keeps image uploads as visual sources instead of reading binary as text', async () => {
    const filePath = path.join(os.tmpdir(), `noesis-image-${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    try {
      const text = await extractText(filePath, 'image/png');
      const structured = await extractStructured(filePath, 'image/png');
      expect(text).toBe('');
      expect(structured.type).toBe('image');
      expect(structured.visualSources).toHaveLength(1);
      expect(structured.pages[0].sourceKind).toBe('image');
    } finally {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });

  const pdfFixture = uploadedPdfFixture();
  const pdfTest = pdfFixture ? it : it.skip;
  pdfTest('extracts non-empty text from an uploaded PDF fixture when available', async () => {
    const text = await extractText(pdfFixture, 'application/pdf');
    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/class|object|encapsulation|data|algorithm/i);
  });
});
