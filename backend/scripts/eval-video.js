'use strict';

const fs = require('fs');
const path = require('path');

for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--model=(.+)$/);
  if (m) process.env.OLLAMA_GEN_MODEL = m[1];
}

const { z } = require('zod');
const env = require('../config/env');
const ai = require('../services/ai.service');
const prompts = require('../utils/prompts');
const { extractJson } = require('../utils/jsonSafe');

const VISUAL_TYPES = ['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'bigo_chart'];

const SlideSchema = z.object({
  slideType: z.string().optional(),
  title: z.string().min(1),
  bullets: z.array(z.string()).optional().default([]),
  narration: z.string().optional().default(''),
  visual: z.object({
    type: z.string().optional(),
    nodes: z.array(z.string()).optional().default([]),
    edges: z.array(z.any()).optional().default([]),
  }).optional(),
  visual_type: z.string().optional(),
  visual_nodes: z.array(z.string()).optional().default([]),
  callouts: z.array(z.string()).optional().default([]),
  example_code: z.string().optional().default(''),
}).passthrough();

const ScriptSchema = z.object({
  topic: z.string().optional(),
  audienceLevel: z.string().optional(),
  learningObjectives: z.array(z.string()).optional().default([]),
  slides: z.array(SlideSchema).min(1),
}).passthrough();

const TOPICS = [
  {
    topic: 'Encapsulation',
    chunks: [
      'Encapsulation keeps object state private and exposes methods to control access. [chunk:101]',
      'Classes should protect invariants by validating changes through public methods. [chunk:102]',
    ],
  },
  {
    topic: 'Polymorphism',
    chunks: [
      'Polymorphism lets code call the same method name on different object types. [chunk:201]',
      'Overriding enables dynamic dispatch through a shared interface or superclass. [chunk:202]',
    ],
  },
  {
    topic: 'Linked List',
    chunks: [
      'A linked list stores data in nodes where each node points to the next node. [chunk:301]',
      'Insertion can update references without shifting contiguous array elements. [chunk:302]',
    ],
  },
  {
    topic: 'Stack',
    chunks: [
      'A stack is a last-in-first-out data structure with push, pop, and peek operations. [chunk:401]',
      'Stacks are useful for function calls, undo, and parsing nested expressions. [chunk:402]',
    ],
  },
  {
    topic: 'Binary Search Tree',
    chunks: [
      'In a binary search tree, smaller keys go left and larger keys go right. [chunk:501]',
      'Search, insert, and delete depend on tree height, so balance affects performance. [chunk:502]',
    ],
  },
  {
    topic: 'Big-O',
    chunks: [
      'Big-O notation describes how runtime or memory grows as input size increases. [chunk:601]',
      'Common growth classes include O(1), O(log n), O(n), O(n log n), and O(n^2). [chunk:602]',
    ],
  },
];

function chunksFor(topicDef, offset) {
  return topicDef.chunks.map((text, i) => ({
    id: offset + i + 1,
    text,
    chapter_title: topicDef.topic,
    heading: topicDef.topic,
    score: 0.9 - i * 0.05,
  }));
}

function visualTypeOf(slide) {
  return (slide.visual && slide.visual.type) || slide.visual_type || '';
}

function coerceScript(obj) {
  if (Array.isArray(obj)) return { slides: obj };
  if (!obj || typeof obj !== 'object') return { slides: [] };
  const slides =
    (Array.isArray(obj.slides) && obj.slides) ||
    (obj.video && Array.isArray(obj.video.slides) && obj.video.slides) ||
    (obj.script && Array.isArray(obj.script.slides) && obj.script.slides) ||
    (obj.lesson && Array.isArray(obj.lesson.slides) && obj.lesson.slides) ||
    [];
  return { ...obj, slides };
}

async function parseLooseScript(raw) {
  let candidate = extractJson(raw);
  let obj = null;
  if (candidate) {
    try { obj = JSON.parse(candidate); } catch (_) {}
  }
  if (!obj) {
    const repaired = await ai.generate(prompts.REPAIR_JSON(String(raw || '').slice(0, 20000)), { temperature: 0, num_predict: 900 });
    candidate = extractJson(repaired);
    if (candidate) obj = JSON.parse(candidate);
  }
  const coerced = coerceScript(obj);
  const parsed = ScriptSchema.safeParse(coerced);
  return {
    script: parsed.success ? parsed.data : coerced,
    schemaValid: parsed.success,
    schemaErrors: parsed.success ? [] : parsed.error.errors.slice(0, 8),
  };
}

function includesAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t)).length;
}

function scoreScript(topic, parsed, responseTimeMs, schemaValid, schemaErrors) {
  const slides = parsed && Array.isArray(parsed.slides) ? parsed.slides : [];
  const allText = JSON.stringify(parsed || {}).toLowerCase();
  const visualTypes = [...new Set(slides.map(visualTypeOf).filter(Boolean))];
  const oopTerms = ['class', 'object', 'method', 'interface', 'override', 'private', 'encapsulation', 'polymorphism'];
  const dsTerms = ['node', 'pointer', 'stack', 'queue', 'tree', 'binary', 'complexity', 'big-o', 'o(n)', 'push', 'pop'];
  const topicWords = topic.toLowerCase().split(/\W+/).filter(Boolean);
  const criteria = {
    jsonValidity: true,
    slideCountRange: slides.length >= 8 && slides.length <= 10,
    narrationPresence: slides.length > 0 && slides.every(s => String(s.narration || '').length >= 40),
    topicCoverage: topicWords.every(w => allText.includes(w)),
    oopKeywordCoverage: includesAny(allText, oopTerms),
    dataStructuresKeywordCoverage: includesAny(allText, dsTerms),
    visualTypeCoverage: visualTypes.filter(v => VISUAL_TYPES.includes(v)).length >= 3,
    responseTimeMs,
    groundedness: /\[chunk:\d+\]/i.test(JSON.stringify(parsed || {})),
  };
  const scored = Object.entries(criteria)
    .filter(([key]) => key !== 'responseTimeMs')
    .reduce((sum, [, value]) => sum + (value ? 1 : 0), 0);
  return {
    topic,
    score: scored,
    maxScore: 8,
    criteria,
    schemaValid,
    schemaErrors,
    slideCount: slides.length,
    visualTypes,
    titles: slides.map(s => s.title).slice(0, 12),
  };
}

async function generateForTopic(topicDef, index) {
  const started = Date.now();
  const chunks = chunksFor(topicDef, index * 100);
  const prompt = prompts.VIDEO_SCRIPT(topicDef.topic, chunks, { lowGrounding: false });
  try {
    const raw = await ai.generate(prompt, { format: 'json', temperature: 0.25, num_ctx: 4096, num_predict: 2200 });
    const parsed = await parseLooseScript(raw);
    return {
      ...scoreScript(topicDef.topic, parsed.script, Date.now() - started, parsed.schemaValid, parsed.schemaErrors),
      ok: true,
    };
  } catch (err) {
    return {
      topic: topicDef.topic,
      ok: false,
      score: 0,
      maxScore: 8,
      error: err.message || String(err),
      rawSnippet: err.raw ? String(err.raw).slice(0, 600) : undefined,
      criteria: { jsonValidity: false, responseTimeMs: Date.now() - started },
    };
  }
}

function fileSafe(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

async function main() {
  await ai.assertModelsAvailable({ generation: true, embedding: false });
  const results = [];
  for (let i = 0; i < TOPICS.length; i++) {
    const result = await generateForTopic(TOPICS[i], i);
    results.push(result);
    console.log(`${result.ok ? 'ok' : 'fail'} ${result.topic}: ${result.score}/${result.maxScore} (${result.criteria.responseTimeMs}ms)`);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const model = env.AI_PROVIDER === 'ollama' ? env.OLLAMA_GEN_MODEL : env.GROQ_MODEL;
  const report = {
    created_at: new Date().toISOString(),
    provider: env.AI_PROVIDER,
    model,
    topics: results,
    summary: {
      passed: results.filter(r => r.ok).length,
      total: results.length,
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      averageResponseTimeMs: results.reduce((sum, r) => sum + (r.criteria.responseTimeMs || 0), 0) / results.length,
    },
  };
  const outDir = path.join(env.ROOT_DIR, 'eval');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `eval-video-${fileSafe(env.AI_PROVIDER)}-${fileSafe(model)}-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(outPath);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
