'use strict';

describe('ocr.service provider checks', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('child_process');
  });

  it('reports local OCR provider availability without throwing', () => {
    const ocr = require('../services/ocr.service');
    const availability = ocr.providerAvailability('ocrmypdf');

    expect(availability.provider).toBe('ocrmypdf');
    expect(typeof availability.available).toBe('boolean');
    expect(Array.isArray(availability.missing)).toBe(true);
    if (availability.available) {
      expect(availability.missing).toEqual([]);
    } else {
      expect(availability.missing).toContain('ocrmypdf');
    }
    expect(ocr.providerAvailability('missing-provider')).toMatchObject({
      provider: 'missing-provider',
      available: false,
      missing: ['missing-provider'],
    });
  });

  it('routes image OCR to a lightweight tesseract provider by default', () => {
    const ocr = require('../services/ocr.service');

    expect(ocr._internals.providerForType('image', 'ocrmypdf')).toBe('tesseract');
    expect(ocr._internals.providerForType('image', 'tesseractjs')).toBe('tesseractjs');
  });

  it('limits PPTX image OCR to weak slides', () => {
    const ocr = require('../services/ocr.service');
    const weak = ocr._internals.weakVisualSources({
      pages: [
        { slideNumber: 1, text: 'A full slide with enough extracted lecture text to avoid OCR. '.repeat(20) },
        { slideNumber: 2, text: 'Diagram' },
      ],
      visualSources: [
        { slideNumber: 1, name: 'decorative.png' },
        { slideNumber: 2, name: 'diagram.png' },
      ],
    });

    expect(weak).toHaveLength(1);
    expect(weak[0].name).toBe('diagram.png');
  });
});
