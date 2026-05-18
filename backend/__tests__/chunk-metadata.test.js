'use strict';

const { chunkText, chunkByChapter, detectHeading, hasCode } = require('../services/chunk.service');

describe('detectHeading', () => {
  it('detects markdown headings', () => {
    expect(detectHeading('## Encapsulation in Java\nSome text here.')).toBe('Encapsulation in Java');
    expect(detectHeading('# Introduction\nWelcome.')).toBe('Introduction');
  });

  it('detects slide titles', () => {
    expect(detectHeading('Title: What is a Stack?\nStacks are LIFO.')).toBe('What is a Stack?');
    expect(detectHeading('Slide 5\nContent here.')).toBe('Content here.');
  });

  it('detects short capitalized lines without punctuation', () => {
    expect(detectHeading('Binary Search Trees\nA BST is a tree where...')).toBe('Binary Search Trees');
  });

  it('returns empty for body text', () => {
    expect(detectHeading('This is a regular paragraph with a lot of text explaining something about object-oriented programming and how it works in practice.')).toBe('');
  });
});

describe('hasCode', () => {
  it('detects fenced code blocks', () => {
    expect(hasCode('Some text\n```java\nclass Foo {}\n```\nMore text')).toBe(true);
  });

  it('detects class declarations', () => {
    expect(hasCode('public class LinkedList {')).toBe(true);
  });

  it('detects function definitions', () => {
    expect(hasCode('def insert(self, value):')).toBe(true);
    expect(hasCode('function push(item) {')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasCode('Encapsulation means hiding internal data from outside access.')).toBe(false);
  });
});

describe('chunkText', () => {
  it('produces chunks from text', () => {
    const text = Array(10).fill('This is a paragraph with enough text to fill one chunk slot.').join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('idx', 0);
    expect(chunks[0]).toHaveProperty('text');
    expect(chunks[0]).toHaveProperty('token_count');
  });

  it('handles empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
  });
});

describe('chunkByChapter', () => {
  it('adds heading and has_code metadata', () => {
    const text = '## Arrays\n\nArrays are contiguous memory.\n\n```java\nint[] arr = new int[5];\n```\n\nEnd of section.';
    const chapters = [{ idx: 0, title: 'Arrays', char_start: 0, char_end: text.length }];
    const chunks = chunkByChapter(text, chapters);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('heading');
    expect(chunks[0]).toHaveProperty('has_code');
    expect(chunks[0].chapter_title).toBe('Arrays');
    expect(chunks[0].has_code).toBe(true);
  });
});
