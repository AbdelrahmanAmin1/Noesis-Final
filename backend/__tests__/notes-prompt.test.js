'use strict';

const prompts = require('../utils/prompts');

describe('NOTES_SUMMARY prompt', () => {
  const mockChunks = [
    { id: 1, text: 'Encapsulation is the bundling of data and methods that operate on that data within a single class.' },
    { id: 2, text: 'Access modifiers (private, protected, public) control visibility of class members.' },
  ];

  it('generates a prompt string with the title', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Encapsulation');
    expect(result).toContain('Encapsulation');
    expect(result).toContain('chunk:1');
  });

  it('includes grounding instructions for strong tier', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Encapsulation', { groundingTier: 'strong' });
    expect(result).toContain('STRONG');
    expect(result).toContain('primary reference');
  });

  it('includes grounding instructions for weak tier', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Encapsulation', { groundingTier: 'weak' });
    expect(result).toContain('WEAK');
    expect(result).toContain('CS knowledge');
  });

  it('defaults to moderate when no tier specified', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Stacks');
    expect(result).toContain('MODERATE');
  });

  it('includes structured note requirements', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Stacks');
    expect(result).toContain('Stacks');
    expect(result).toContain('chunk:1');
    expect(result).toContain('chunk:2');
    expect(result).toMatch(/markdown|note|summary/i);
  });
});

describe('VIDEO_SCRIPT prompt', () => {
  const mockChunks = [
    { id: 10, text: 'A stack is a Last-In-First-Out data structure supporting push and pop operations.' },
  ];

  it('generates prompt with grounding tier', () => {
    const result = prompts.VIDEO_SCRIPT('Stack', mockChunks, { groundingTier: 'strong' });
    expect(result).toContain('STRONG');
    expect(result).toContain('Stack');
  });

  it('adapts instructions for weak grounding', () => {
    const result = prompts.VIDEO_SCRIPT('Stack', mockChunks, { groundingTier: 'weak', lowGrounding: true });
    expect(result).toContain('WEAK');
    expect(result).toContain('professional CS knowledge');
  });

  it('includes video-specific instructions', () => {
    const result = prompts.VIDEO_SCRIPT('Stack', mockChunks, {});
    expect(result).toContain('slides');
    expect(result).toContain('narration');
    expect(result).toContain('visual');
  });
});
