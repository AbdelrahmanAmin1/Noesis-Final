'use strict';

const { z } = require('zod');
const { extractJson, parseJsonSafe, JsonSafeError } = require('../utils/jsonSafe');

describe('extractJson', () => {
  it('extracts JSON object from clean input', () => {
    const result = extractJson('{"key":"value"}');
    expect(result).toBe('{"key":"value"}');
  });

  it('extracts JSON from markdown code fence', () => {
    const result = extractJson('```json\n{"cards":[{"q":"hi"}]}\n```');
    expect(result).toBe('{"cards":[{"q":"hi"}]}');
  });

  it('extracts JSON object from surrounding text', () => {
    const result = extractJson('Here is the result: {"a":1} and done.');
    expect(result).toBe('{"a":1}');
  });

  it('extracts JSON array', () => {
    const result = extractJson('[1,2,3]');
    expect(result).toBe('[1,2,3]');
  });

  it('returns null for no JSON', () => {
    const result = extractJson('just plain text');
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson(null)).toBeNull();
  });

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":true}}';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ outer: { inner: true } });
  });

  it('extracts valid JSON even when brackets appear earlier', () => {
    const input = 'check {"cards":[{"q":"a"}]}';
    const result = extractJson(input);
    expect(result).toContain('cards');
  });
});

describe('parseJsonSafe', () => {
  const SimpleSchema = z.object({
    name: z.string().min(1),
    value: z.number(),
  });

  it('parses valid JSON matching schema', async () => {
    const result = await parseJsonSafe('{"name":"test","value":42}', SimpleSchema);
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('throws on schema mismatch without repair', async () => {
    await expect(
      parseJsonSafe('{"name":"","value":42}', SimpleSchema)
    ).rejects.toThrow();
  });

  it('throws on invalid JSON without repair', async () => {
    await expect(
      parseJsonSafe('not json at all', SimpleSchema)
    ).rejects.toThrow();
  });

  it('calls repair function on parse failure', async () => {
    const repairFn = async () => '{"name":"repaired","value":99}';
    const result = await parseJsonSafe('broken{json', SimpleSchema, repairFn);
    expect(result.name).toBe('repaired');
    expect(result.value).toBe(99);
  });

  it('calls repair function on schema mismatch', async () => {
    const repairFn = async () => '{"name":"fixed","value":1}';
    const result = await parseJsonSafe('{"name":"","value":"not_a_number"}', SimpleSchema, repairFn);
    expect(result.name).toBe('fixed');
  });

  it('throws JsonSafeError when repair also fails', async () => {
    const repairFn = async () => 'still broken';
    await expect(
      parseJsonSafe('bad input', SimpleSchema, repairFn)
    ).rejects.toThrow(JsonSafeError);
  });
});

describe('Flashcard schema validation', () => {
  const FlashSchema = z.object({
    cards: z.array(z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    })).min(1),
  });

  it('validates correct flashcard JSON', async () => {
    const input = '{"cards":[{"question":"What is OOP?","answer":"Object-Oriented Programming"}]}';
    const result = await parseJsonSafe(input, FlashSchema);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].question).toBe('What is OOP?');
  });

  it('rejects empty cards array', async () => {
    await expect(
      parseJsonSafe('{"cards":[]}', FlashSchema)
    ).rejects.toThrow();
  });
});

describe('Quiz schema validation', () => {
  const QuizSchema = z.object({
    questions: z.array(z.object({
      question: z.string().min(1),
      options: z.array(z.string()).length(4),
      correct_idx: z.number().int().min(0).max(3),
    })).min(1),
  });

  it('validates correct quiz JSON', async () => {
    const input = JSON.stringify({
      questions: [{
        question: 'What is a stack?',
        options: ['LIFO', 'FIFO', 'Random', 'Sorted'],
        correct_idx: 0,
      }],
    });
    const result = await parseJsonSafe(input, QuizSchema);
    expect(result.questions[0].correct_idx).toBe(0);
  });

  it('rejects incorrect number of options', async () => {
    const input = JSON.stringify({
      questions: [{
        question: 'Bad question',
        options: ['A', 'B'],
        correct_idx: 0,
      }],
    });
    await expect(parseJsonSafe(input, QuizSchema)).rejects.toThrow();
  });

  it('rejects out-of-range correct_idx', async () => {
    const input = JSON.stringify({
      questions: [{
        question: 'Test',
        options: ['A', 'B', 'C', 'D'],
        correct_idx: 5,
      }],
    });
    await expect(parseJsonSafe(input, QuizSchema)).rejects.toThrow();
  });
});
