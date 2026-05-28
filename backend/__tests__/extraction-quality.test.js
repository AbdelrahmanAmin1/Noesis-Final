'use strict';

describe('extraction-quality.service', () => {
  it('does not request OCR for useful normal text', () => {
    const svc = require('../services/extraction-quality.service');
    const quality = svc.analyzeExtraction({
      type: 'pdf',
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: 'Encapsulation protects object state by keeping fields private and exposing controlled methods.\nA constructor establishes valid state before other methods use it.\nAccess modifiers keep outside code from bypassing validation.' },
        { pageNumber: 2, text: 'Public methods provide a narrow interface for safe changes.\nA setter can reject invalid values before they enter the object.\nThis keeps the class invariant stable across calls.' },
      ],
      visualSources: [],
    }, { minTextCharsPerPage: 120 });

    expect(quality.needsOcr).toBe(false);
    expect(quality.reasons).toHaveLength(0);
  });

  it('requests OCR for scanned-like or image-only material', () => {
    const svc = require('../services/extraction-quality.service');
    const quality = svc.analyzeExtraction({
      type: 'pdf',
      pageCount: 3,
      pages: [
        { pageNumber: 1, text: '' },
        { pageNumber: 2, text: 'Page 2' },
        { pageNumber: 3, text: '' },
      ],
      visualSources: [{ pageNumber: 1 }, { pageNumber: 2 }, { pageNumber: 3 }],
    }, { minTextCharsPerPage: 150 });

    expect(quality.needsOcr).toBe(true);
    expect(quality.reasons).toEqual(expect.arrayContaining(['too_little_text', 'many_empty_pages']));
  });

  it('treats repeated boilerplate navigation as weak extraction', () => {
    const svc = require('../services/extraction-quality.service');
    const pages = [1, 2, 3, 4].map(pageNumber => ({
      pageNumber,
      text: `Course Home\nNext\nPrevious\nPage ${pageNumber}\n${pageNumber === 2 ? 'Only one useful sentence appears here.' : ''}`,
    }));
    const quality = svc.analyzeExtraction({ type: 'slides', pageCount: 4, pages, visualSources: [] }, { minTextCharsPerPage: 100 });

    expect(quality.needsOcr).toBe(true);
    expect(quality.reasons).toContain('repeated_navigation_or_boilerplate');
  });

  it('merges normal text and OCR text while preserving page provenance', () => {
    const svc = require('../services/extraction-quality.service');
    const merged = svc.mergeStructuredWithOcr({
      type: 'pdf',
      pages: [
        { pageNumber: 1, text: 'Binary search trees keep smaller values on the left.', heading: 'BST' },
        { pageNumber: 2, text: '', heading: 'Traversal' },
      ],
    }, {
      provider: 'ocrmypdf',
      pages: [
        { pageNumber: 1, text: 'Binary search trees keep smaller values on the left.\nThe right branch stores larger values.' },
        { pageNumber: 2, text: 'Inorder traversal visits left, root, then right.' },
      ],
    });

    expect(merged.text).toContain('Page 1');
    expect(merged.text).toContain('The right branch stores larger values.');
    expect(merged.text).toContain('Page 2');
    expect(merged.pages[0].sourceKind).toBe('mixed');
    expect(merged.pages[1].sourceKind).toBe('ocr');
    expect((merged.pages[0].text.match(/Binary search trees keep smaller values/g) || [])).toHaveLength(1);
  });
});
