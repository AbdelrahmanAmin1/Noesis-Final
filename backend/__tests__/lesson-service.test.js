'use strict';

const lessons = require('../services/lesson.service');
const { scoreVideoScript } = require('../services/video-quality.service');

describe('lesson.service', () => {
  it('extracts markdown from JSON-wrapped note responses', () => {
    const raw = '{"title":"Chapter 10","markdown":"## Inheritance\\n\\nA child class extends a parent class."}';
    const md = lessons.extractMarkdownFromModelOutput(raw);
    expect(md).toContain('## Inheritance');
    expect(md).not.toContain('{"title"');
    expect(md).not.toContain('\\n');
  });

  it('creates an inheritance fallback lesson with required teaching assets', () => {
    const lesson = lessons.fallbackLesson('Inheritance');
    const text = JSON.stringify(lesson).toLowerCase();
    expect(lesson.sections.some(s => s.type === 'code_example')).toBe(true);
    expect(lesson.sections.some(s => s.type === 'diagram')).toBe(true);
    expect(text).toContain('shape');
    expect(text).toContain('circle');
    expect(text).toContain('rectangle');
    expect(text).toContain('extends');
    expect(text).toContain('composition');
  });

  it('fails generic chapter lessons instead of saving placeholder notes', () => {
    const lesson = lessons.fallbackLesson('Chapter 10');
    const quality = lessons.scoreLesson(lesson);
    expect(quality.passed).toBe(false);
    expect(quality.genericFailure).toBe(true);
  });

  it('converts a lesson into a video script that passes stricter inheritance scoring', () => {
    const lesson = lessons.fallbackLesson('Inheritance');
    const script = lessons.lessonToVideoScript(lesson);
    const quality = scoreVideoScript(script, { concept: 'Inheritance', chunks: [], threshold: 0.75 });
    expect(quality.passed).toBe(true);
    expect(quality.criteria.find(c => c.name === 'inheritance_specifics').passed).toBe(true);
    expect(script.slides.every(s => !s.callouts || s.callouts.length === 0)).toBe(true);
    expect(script.slides.every(s => (s.bullets || []).length <= 2)).toBe(true);
    expect(script.slides.flatMap(s => s.bullets || []).every(b => b.split(/\s+/).length <= 5 || /\w+\.\w+\(\)/.test(b))).toBe(true);
    expect(script.slides.every(s => !/\b(the|but|because|with|to)$/i.test(s.title))).toBe(true);
    expect(script.slides.some(s => s.sceneType === 'code_walkthrough' && s.code_focus && s.code_focus.lineRange)).toBe(true);
    expect(JSON.stringify(script)).not.toContain('...');
  });

  it('preserves linked-list complexity and diagram content', () => {
    const lesson = lessons.fallbackLesson('Linked List');
    const text = JSON.stringify(lesson).toLowerCase();
    expect(text).toContain('head');
    expect(text).toContain('next');
    expect(text).toContain('o(1)');
    expect(text).toContain('o(n)');
  });
});
