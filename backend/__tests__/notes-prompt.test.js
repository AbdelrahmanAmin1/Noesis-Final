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

  it('accepts educational context without asking for visible chunk ids', () => {
    const result = prompts.NOTES_SUMMARY(mockChunks, 'Encapsulation', {
      educationalContext: 'Curated knowledge: BankAccount with private balance and validated deposit.',
    });
    expect(result).toContain('Educational context');
    expect(result).toContain('BankAccount');
    expect(result).toContain('primary source');
    expect(result).toContain('Do not include raw chunk IDs');
    expect(result).not.toContain('Cite chunk ids inline');
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

describe('LESSON_GENERATE prompt', () => {
  it('asks for structured EducationalLesson JSON and bans placeholders', () => {
    const result = prompts.LESSON_GENERATE(
      [{ id: 3, text: 'Inheritance uses extends between parent and child classes.' }],
      'Inheritance',
      { topic: 'Inheritance', lessonType: 'oop', groundingTier: 'strong', curatedKnowledge: '{"topic":"Inheritance"}' }
    );
    expect(result).toContain('EducationalLesson');
    expect(result).toContain('"sections"');
    expect(result).toContain('Shape');
    expect(result).toContain('Code sketch');
  });

  it('includes educational context and uploaded-first policy', () => {
    const result = prompts.LESSON_GENERATE(
      [{ id: 4, text: 'The lecture says encapsulation protects object state.' }],
      'Encapsulation',
      {
        topic: 'Encapsulation',
        lessonType: 'oop',
        groundingTier: 'strong',
        curatedKnowledge: '{"topic":"Encapsulation","codeExamples":[{"title":"BankAccount"}]}',
        educationalContext: 'uploaded material first; curated knowledge second; BankAccount private balance',
      }
    );
    expect(result).toContain('Educational context');
    expect(result).toContain('uploaded material first');
    expect(result).toContain('BankAccount');
    expect(result).toContain('primary source for course-specific facts');
  });

  it('can carry linked-list curated context for diagrams and mistakes', () => {
    const result = prompts.LESSON_GENERATE(
      [{ id: 5, text: 'Linked lists use nodes connected by references.' }],
      'Linked List',
      {
        topic: 'Linked List',
        lessonType: 'data_structure',
        groundingTier: 'moderate',
        educationalContext: 'Linked List curated context: HEAD -> [data|next] -> null; losing next reference mistake',
      }
    );
    expect(result).toContain('HEAD -> [data|next] -> null');
    expect(result).toContain('losing next reference');
    expect(result).toContain('memory-style diagram');
  });

  it('requires Queue-specific notes assets without asking for sourceChunkIds', () => {
    const result = prompts.LESSON_GENERATE(
      [{ id: 6, text: 'Queues use first-in, first-out behavior.' }],
      'Queue',
      {
        topic: 'Queue',
        lessonType: 'data_structure',
        groundingTier: 'weak',
        educationalContext: 'Queue context: FIFO, enqueue, dequeue, front, rear, underflow, O(1), Horizontal FIFO Queue Diagram',
      }
    );

    expect(result).toContain('Queue must include FIFO');
    expect(result).toContain('front and rear pointers');
    expect(result).toContain('underflow');
    expect(result).toContain('O(1) enqueue/dequeue');
    expect(result).toContain('horizontal queue diagram');
    expect(result).toContain('mini quiz');
    expect(result).toContain('Do not emit sourceChunkIds');
    expect(result).not.toContain('"sourceChunkIds"');
  });

  it('includes source facts and bans instructional general-note language', () => {
    const result = prompts.LESSON_GENERATE(
      [{ id: 9, text: 'Market segmentation divides customers into groups with similar needs.' }],
      'Marketing Strategy',
      {
        topic: 'Marketing Strategy',
        lessonType: 'general',
        groundingTier: 'strong',
        sourceOutline: {
          sourceFacts: {
            definitions: ['Targeting means choosing which segment the company will serve.'],
            facts: ['Market segmentation divides customers into groups with similar needs.'],
            classifications: ['Segments include demographic, geographic, behavioral, and psychographic groups.'],
            processes: [],
            examples: ['Examples include demographic and behavioral segments.'],
            numbers: [],
            relationships: ['Positioning explains how the brand should be perceived compared with competitors.'],
            memoryHints: [],
            reviewQuestions: ['Why should a target market be measurable?'],
          },
          meaningfulSections: [],
        },
      }
    );

    expect(result).toContain('Source facts extracted from uploaded material');
    expect(result).toContain('Market segmentation divides customers');
    expect(result).toContain('Targeting means choosing');
    expect(result).toContain('do not write instructions about how to study');
    expect(result).toContain('Choose one concrete detail');
    expect(result).toContain('Name one key idea');
    expect(result).toContain('Source-backed ideas');
  });
});

describe('lesson source visuals', () => {
  it('renders an important visuals section without exposing OCR wording', () => {
    const lessons = require('../services/lesson.service');
    const lesson = lessons.generalMaterialLesson(
      'Bone Classification',
      'Anatomy Slides',
      'strong',
      [1, 2],
      [{ id: 1, text: 'Bones are classified as long, short, flat, irregular, and sesamoid.' }],
      { domainInfo: { domain: 'general' } }
    );
    lesson.sourceVisuals = [{
      pageNumber: 4,
      sourcePage: 4,
      heading: 'Bone shape classification diagram',
      nearbyText: 'Explains long, short, flat, irregular, and sesamoid bones.',
      importanceScore: 0.9,
    }];

    const md = lessons.lessonToMarkdown(lesson);
    expect(md).toContain('## Important Visuals From the Material');
    expect(md).toContain('Page 4: Bone shape classification diagram');
    expect(md).not.toMatch(/\bOCR\b/i);
  });
});
