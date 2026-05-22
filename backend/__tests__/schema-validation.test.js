'use strict';

const { z } = require('zod');

describe('Flashcard schema (from flashcard.routes.js)', () => {
  const FlashSchema = z.object({
    cards: z.array(z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      difficulty: z.preprocess((value) => {
        const normalized = String(value || 'medium').toLowerCase();
        return ['easy', 'medium', 'hard'].includes(normalized) ? normalized : 'medium';
      }, z.enum(['easy', 'medium', 'hard'])).optional().default('medium'),
      topic: z.string().optional().default('General'),
      source_chunk_id: z.preprocess((value) => {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isInteger(n) ? n : null;
      }, z.number().int().nullable()).optional().default(null),
    })).min(1),
  });

  it('accepts valid flashcard data', () => {
    const data = {
      cards: [{
        question: 'What is encapsulation?',
        answer: 'Bundling data and methods together.',
        difficulty: 'easy',
        topic: 'OOP',
        source_chunk_id: 5,
      }],
    };
    const result = FlashSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.cards[0].difficulty).toBe('easy');
  });

  it('normalizes difficulty to lowercase', () => {
    const data = {
      cards: [{ question: 'Q', answer: 'A', difficulty: 'HARD' }],
    };
    const result = FlashSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.cards[0].difficulty).toBe('hard');
  });

  it('defaults invalid difficulty to medium', () => {
    const data = {
      cards: [{ question: 'Q', answer: 'A', difficulty: 'impossible' }],
    };
    const result = FlashSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.cards[0].difficulty).toBe('medium');
  });

  it('defaults missing fields', () => {
    const data = {
      cards: [{ question: 'Q', answer: 'A' }],
    };
    const result = FlashSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.cards[0].difficulty).toBe('medium');
    expect(result.data.cards[0].topic).toBe('General');
    expect(result.data.cards[0].source_chunk_id).toBeNull();
  });

  it('rejects empty cards array', () => {
    const result = FlashSchema.safeParse({ cards: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing question', () => {
    const result = FlashSchema.safeParse({
      cards: [{ question: '', answer: 'A' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('Quiz schema (from quiz.routes.js)', () => {
  const QuizSchema = z.object({
    questions: z.array(z.object({
      question: z.string().min(1),
      options: z.array(z.string()).length(4),
      correct_idx: z.number().int().min(0).max(3),
      explanation: z.string().optional().default(''),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      topic: z.string().optional(),
      concept: z.string().optional().default(''),
    })).min(1),
  });

  it('accepts valid quiz data', () => {
    const data = {
      questions: [{
        question: 'What is the time complexity of array access?',
        options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
        correct_idx: 0,
        explanation: 'Arrays provide constant-time access by index.',
        difficulty: 'easy',
        topic: 'Arrays',
      }],
    };
    const result = QuizSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 4 options', () => {
    const data = {
      questions: [{
        question: 'Q',
        options: ['A', 'B'],
        correct_idx: 0,
      }],
    };
    expect(QuizSchema.safeParse(data).success).toBe(false);
  });

  it('rejects more than 4 options', () => {
    const data = {
      questions: [{
        question: 'Q',
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_idx: 0,
      }],
    };
    expect(QuizSchema.safeParse(data).success).toBe(false);
  });

  it('rejects correct_idx out of range', () => {
    const data = {
      questions: [{
        question: 'Q',
        options: ['A', 'B', 'C', 'D'],
        correct_idx: 4,
      }],
    };
    expect(QuizSchema.safeParse(data).success).toBe(false);
  });

  it('allows negative zero as correct_idx 0', () => {
    const data = {
      questions: [{
        question: 'Q',
        options: ['A', 'B', 'C', 'D'],
        correct_idx: 0,
      }],
    };
    expect(QuizSchema.safeParse(data).success).toBe(true);
  });
});

describe('Video script schema (from video.service.js)', () => {
  const VISUAL_TYPES = ['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'hash_table', 'bigo_chart'];

  const ScriptSchema = z.object({
    slides: z.array(z.object({
      title: z.string().min(1),
      visual_type: z.enum(VISUAL_TYPES).optional().default('mindmap'),
      bullets: z.array(z.string()).min(1).max(8),
      visual_nodes: z.array(z.string()).optional().default([]),
      visual_edges: z.array(z.tuple([z.string(), z.string()])).optional().default([]),
      callouts: z.array(z.string()).optional().default([]),
      example_code: z.string().optional().default(''),
      narration: z.string().min(1),
    })).min(2).max(12),
  });

  it('accepts valid 2-slide script', () => {
    const data = {
      slides: [
        { title: 'Intro', bullets: ['Point 1'], narration: 'Welcome to the lesson.' },
        { title: 'Summary', bullets: ['Recap'], narration: 'That wraps up the lesson.' },
      ],
    };
    const result = ScriptSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.slides[0].visual_type).toBe('mindmap');
  });

  it('accepts all 10 visual types', () => {
    for (const vt of VISUAL_TYPES) {
      const data = {
        slides: [
          { title: 'Slide 1', visual_type: vt, bullets: ['B1'], narration: 'N1' },
          { title: 'Slide 2', bullets: ['B2'], narration: 'N2' },
        ],
      };
      expect(ScriptSchema.safeParse(data).success).toBe(true);
    }
  });

  it('rejects single slide', () => {
    const data = {
      slides: [{ title: 'Only', bullets: ['B1'], narration: 'N1' }],
    };
    expect(ScriptSchema.safeParse(data).success).toBe(false);
  });

  it('rejects more than 12 slides', () => {
    const slides = Array.from({ length: 13 }, (_, i) => ({
      title: `Slide ${i}`, bullets: ['B'], narration: 'N',
    }));
    expect(ScriptSchema.safeParse({ slides }).success).toBe(false);
  });

  it('rejects empty narration', () => {
    const data = {
      slides: [
        { title: 'S1', bullets: ['B'], narration: '' },
        { title: 'S2', bullets: ['B'], narration: 'ok' },
      ],
    };
    expect(ScriptSchema.safeParse(data).success).toBe(false);
  });
});
