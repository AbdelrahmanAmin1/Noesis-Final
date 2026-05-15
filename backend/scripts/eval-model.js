#!/usr/bin/env node
'use strict';

/**
 * Model Evaluation Script for Noesis
 *
 * Usage:
 *   node scripts/eval-model.js                         # evaluate current default model
 *   node scripts/eval-model.js --model qwen2.5-coder:7b
 *   node scripts/eval-model.js --model llama3.1:8b
 *   node scripts/eval-model.js --provider groq --model llama-3.3-70b-versatile
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { z } = require('zod');

const modelArg = process.argv.find(a => a.startsWith('--model='));
const providerArg = process.argv.find(a => a.startsWith('--provider='));
if (modelArg) {
  const model = modelArg.split('=')[1];
  if (providerArg && providerArg.split('=')[1] === 'groq') {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_MODEL = model;
  } else {
    process.env.OLLAMA_GEN_MODEL = model;
  }
}
if (providerArg && !modelArg) {
  process.env.AI_PROVIDER = providerArg.split('=')[1];
}

const env = require('../config/env');
const ai = require('../services/ai.service');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');

const SAMPLE_CHUNKS = [
  {
    id: 1,
    text: 'Encapsulation is the practice of bundling state (fields) and the behavior that operates on that state (methods) into a single unit — a class — and deliberately controlling what the outside world is allowed to see or change.',
  },
  {
    id: 2,
    text: 'A BankAccount keeps its balance and the rules for changing it (deposit, withdraw) in one place. Code that wants to mutate the balance must go through the methods, not poke the field.',
  },
  {
    id: 3,
    text: 'An array is a fixed-size, contiguous block of memory holding elements of one type. Indexing is O(1) because the address of element i is base + i × sizeof(T) — pure arithmetic, no traversal.',
  },
  {
    id: 4,
    text: 'A binary search tree (BST) is a binary tree where for every node, all keys in the left subtree are smaller and all keys in the right subtree are larger. Lookup, insertion, and deletion are O(h) where h is the height.',
  },
  {
    id: 5,
    text: 'Big-O describes the upper bound on the growth rate of an algorithm\'s running time as input size n grows, ignoring constant factors and lower-order terms. O(1) constant, O(log n) logarithmic, O(n) linear, O(n log n) linearithmic, O(n²) quadratic.',
  },
];

const FlashcardSchema = z.object({
  cards: z.array(z.object({
    question: z.string().min(5),
    answer: z.string().min(5),
    source_chunk_id: z.union([z.number(), z.null()]).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    topic: z.string().optional(),
  })).min(1),
});

const QuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string().min(5),
    options: z.array(z.string()).length(4),
    correct_idx: z.number().int().min(0).max(3),
    explanation: z.string().min(5),
    difficulty: z.string().optional(),
    topic: z.string().optional(),
  })).min(1),
});

const results = [];

async function runTest(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    results.push({ name, pass: true, elapsed_ms: elapsed, ...result });
    console.log(`  ✓ ${name} (${elapsed}ms)`);
  } catch (err) {
    const elapsed = Date.now() - start;
    results.push({ name, pass: false, elapsed_ms: elapsed, error: err.message || String(err) });
    console.log(`  ✗ ${name} (${elapsed}ms) — ${err.message || err}`);
  }
}

async function testFlashcardJSON() {
  const prompt = prompts.FLASHCARDS(SAMPLE_CHUNKS, 5);
  const raw = await ai.generate(prompt, { format: 'json', temperature: 0.3 });
  const parsed = parseJsonSafe(raw, FlashcardSchema);
  if (!parsed || !parsed.cards || parsed.cards.length < 1) throw new Error('No valid cards generated');
  return { card_count: parsed.cards.length, sample: parsed.cards[0].question.slice(0, 80) };
}

async function testQuizJSON() {
  const prompt = prompts.QUIZ_MCQ(SAMPLE_CHUNKS, 3, 'medium');
  const raw = await ai.generate(prompt, { format: 'json', temperature: 0.3 });
  const parsed = parseJsonSafe(raw, QuizSchema);
  if (!parsed || !parsed.questions || parsed.questions.length < 1) throw new Error('No valid questions generated');
  return { question_count: parsed.questions.length, sample: parsed.questions[0].question.slice(0, 80) };
}

async function testNotesQuality() {
  const prompt = prompts.NOTES_SUMMARY(SAMPLE_CHUNKS.slice(0, 2), 'Encapsulation');
  const raw = await ai.generate(prompt, { temperature: 0.35 });
  const requiredTerms = ['encapsulation', 'private', 'class'];
  const lower = raw.toLowerCase();
  const found = requiredTerms.filter(t => lower.includes(t));
  if (found.length < 2) throw new Error(`Only found ${found.length}/3 required terms: ${found.join(', ')}`);
  return { length: raw.length, terms_found: found };
}

async function testOOPExplanation() {
  const prompt = `You are a CS tutor. Explain polymorphism with a code example. Include: definition, why it matters, and a Java example.`;
  const raw = await ai.generate(prompt, { temperature: 0.3 });
  const lower = raw.toLowerCase();
  const checks = {
    has_definition: lower.includes('polymorphism'),
    has_code: raw.includes('class ') || raw.includes('void ') || raw.includes('public '),
    has_override: lower.includes('override') || lower.includes('overrid'),
    length_ok: raw.length > 200,
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  if (passCount < 3) throw new Error(`Only ${passCount}/4 checks passed: ${JSON.stringify(checks)}`);
  return checks;
}

async function testDSExplanation() {
  const prompt = `You are a CS tutor. Explain how insertion works in a Binary Search Tree, step by step. Include the time complexity.`;
  const raw = await ai.generate(prompt, { temperature: 0.3 });
  const lower = raw.toLowerCase();
  const checks = {
    has_bst: lower.includes('binary search tree') || lower.includes('bst'),
    has_steps: lower.includes('step') || lower.includes('1.') || lower.includes('first'),
    has_complexity: lower.includes('o(') || lower.includes('log n') || lower.includes('height'),
    length_ok: raw.length > 200,
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  if (passCount < 3) throw new Error(`Only ${passCount}/4 checks passed: ${JSON.stringify(checks)}`);
  return checks;
}

async function testBigOExplanation() {
  const prompt = `You are a CS tutor. Compare O(n) and O(log n) with examples. Explain when each applies.`;
  const raw = await ai.generate(prompt, { temperature: 0.3 });
  const lower = raw.toLowerCase();
  const checks = {
    has_on: lower.includes('o(n)'),
    has_ologn: lower.includes('o(log n)') || lower.includes('o(log(n))'),
    has_example: lower.includes('search') || lower.includes('binary') || lower.includes('linear') || lower.includes('array'),
    length_ok: raw.length > 150,
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  if (passCount < 3) throw new Error(`Only ${passCount}/4 checks passed: ${JSON.stringify(checks)}`);
  return checks;
}

async function testRAGGrounding() {
  const prompt = `Based ONLY on the following source excerpts, explain what encapsulation is. Cite chunk IDs.

[chunk:1] Encapsulation is the practice of bundling state (fields) and the behavior that operates on that state (methods) into a single unit.
[chunk:2] A BankAccount keeps its balance and the rules for changing it (deposit, withdraw) in one place.

Answer:`;
  const raw = await ai.generate(prompt, { temperature: 0.2 });
  const lower = raw.toLowerCase();
  const checks = {
    has_encapsulation: lower.includes('encapsulation'),
    cites_chunks: raw.includes('[chunk:1]') || raw.includes('[chunk:2]') || raw.includes('chunk 1') || raw.includes('chunk 2'),
    no_hallucination: !lower.includes('inheritance') && !lower.includes('polymorphism'),
    length_ok: raw.length > 50,
  };
  const passCount = Object.values(checks).filter(Boolean).length;
  if (passCount < 3) throw new Error(`Only ${passCount}/4 checks passed: ${JSON.stringify(checks)}`);
  return checks;
}

async function main() {
  const provider = env.AI_PROVIDER;
  const model = provider === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL;

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Noesis Model Evaluation`);
  console.log(`  Provider: ${provider}`);
  console.log(`  Model:    ${model}`);
  console.log(`═══════════════════════════════════════════\n`);

  try {
    await ai.assertModelsAvailable({ generation: true });
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    console.error(`Make sure ${provider === 'groq' ? 'GROQ_API_KEY is set' : 'Ollama is running and the model is pulled'}.`);
    process.exit(1);
  }

  console.log('Running tests...\n');

  await runTest('1. Flashcard JSON generation', testFlashcardJSON);
  await runTest('2. Quiz JSON generation', testQuizJSON);
  await runTest('3. Notes quality (Encapsulation)', testNotesQuality);
  await runTest('4. OOP explanation (Polymorphism)', testOOPExplanation);
  await runTest('5. DS explanation (BST insertion)', testDSExplanation);
  await runTest('6. Big-O explanation (O(n) vs O(log n))', testBigOExplanation);
  await runTest('7. RAG grounding (chunk citation)', testRAGGrounding);

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const avgTime = Math.round(results.reduce((s, r) => s + r.elapsed_ms, 0) / total);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Results: ${passed}/${total} passed`);
  console.log(`  Avg response time: ${avgTime}ms`);
  console.log(`═══════════════════════════════════════════\n`);

  const reportPath = path.resolve(__dirname, '..', 'eval', `eval-${provider}-${model.replace(/[/:]/g, '-')}-${Date.now()}.json`);
  const reportDir = path.dirname(reportPath);
  require('fs').mkdirSync(reportDir, { recursive: true });
  require('fs').writeFileSync(reportPath, JSON.stringify({
    provider,
    model,
    timestamp: new Date().toISOString(),
    summary: { passed, total, avg_response_ms: avgTime },
    tests: results,
  }, null, 2));
  console.log(`Report saved: ${reportPath}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
