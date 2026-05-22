'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const lessons = require('../services/lesson.service');
const slides = require('../services/slides.service');
const { scoreVideoScript } = require('../services/video-quality.service');

function assertPngSize(filePath, width, height) {
  const buffer = fs.readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  expect(buffer.readUInt32BE(16)).toBe(width);
  expect(buffer.readUInt32BE(20)).toBe(height);
  expect(buffer.length).toBeGreaterThan(10_000);
}

function fileHash(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

describe('demo-quality video regression set', () => {
  const cases = ['Inheritance', 'Polymorphism', 'Linked List', 'Hash Table', 'Stack', 'Queue', 'Binary Search Tree', 'Big-O', 'Encapsulation', 'Abstraction'];

  it.each(cases)('%s lesson creates a callout-free, topic-specific storyboard', (topic) => {
    const lesson = lessons.fallbackLesson(topic);
    const script = lessons.lessonToVideoScript(lesson);
    const quality = scoreVideoScript(script, { concept: topic, threshold: 0.75 });
    const text = JSON.stringify(script);

    expect(script.slides.length).toBeGreaterThanOrEqual(8);
    expect(script.slides.length).toBeLessThanOrEqual(12);
    expect(script.slides.every(s => !s.callouts || s.callouts.length === 0)).toBe(true);
    expect(text).not.toMatch(/\[chunk:\s*\d+\]/i);
    expect(text).not.toContain('...');
    expect(script.slides.some(s => s.code_focus && s.code_focus.lineRange)).toBe(true);
    expect(quality.passed).toBe(true);
  });

  it('renders an inheritance UML slide as a nonblank 1280x720 PNG', async () => {
    const lesson = lessons.fallbackLesson('Inheritance');
    const script = lessons.lessonToVideoScript(lesson);
    const slide = script.slides.find(s => s.visual_type === 'class_diagram');
    const outPath = path.join(os.tmpdir(), `noesis_inheritance_regression_${Date.now()}.png`);
    try {
      const rendered = await slides.renderSlide(slide, outPath);
      expect(rendered.endsWith('.png')).toBe(true);
      assertPngSize(rendered, 1280, 720);
    } finally {
      try { fs.unlinkSync(outPath); } catch (_) {}
    }
  });

  it('renders a hash-table slide as a nonblank 1280x720 PNG', async () => {
    const lesson = lessons.fallbackLesson('Hash Table');
    const script = lessons.lessonToVideoScript(lesson);
    const slide = script.slides.find(s => s.visual_type === 'hash_table');
    const outPath = path.join(os.tmpdir(), `noesis_hash_table_regression_${Date.now()}.png`);
    try {
      expect(slide).toBeDefined();
      const rendered = await slides.renderSlide(slide, outPath);
      expect(rendered.endsWith('.png')).toBe(true);
      assertPngSize(rendered, 1280, 720);
    } finally {
      try { fs.unlinkSync(outPath); } catch (_) {}
    }
  });

  it('renders animated pointer frames for a linked-list scene', async () => {
    const lesson = lessons.fallbackLesson('Linked List');
    const script = lessons.lessonToVideoScript(lesson);
    const slide = script.slides.find(s => s.visual_type === 'linkedlist') || script.slides[0];
    const dir = path.join(os.tmpdir(), `noesis_linked_frames_${Date.now()}`);
    try {
      const frames = await slides.renderAnimatedFrames(slide, dir, 4, 'frame');
      expect(frames.length).toBe(4);
      assertPngSize(frames[0], 1280, 720);
      expect(fileHash(frames[0])).not.toBe(fileHash(frames[frames.length - 1]));
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
