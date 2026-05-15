'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'prompts', 'templates');
const templateCache = new Map();

const SYSTEM_BASE_FALLBACK = 'You are Noesis, a focused academic tutor specializing in Computer Science - especially Object-Oriented Programming and Data Structures. Use proper CS terminology (classes, objects, inheritance, polymorphism, encapsulation, abstraction, interfaces, arrays, linked lists, stacks, queues, trees, graphs, hash tables, sorting, searching, Big-O notation) where applicable. Be precise, concise, and pedagogically clear. IMPORTANT: Base your answers primarily on the source excerpts provided. Cite chunk IDs as [chunk:ID] when grounding claims. If the source excerpts do not contain enough information to answer accurately, say so explicitly rather than inventing facts. Prefer source material over general knowledge.';

const NOTES_SUMMARY_FALLBACK = `{{SYSTEM_BASE}}

Task: Write a study-quality markdown note titled "{{TITLE}}". Use the source excerpts below. Cite chunk ids inline as [chunk:ID] when grounding a claim. Structure the note as: (1) Definition / Overview, (2) Key properties and characteristics, (3) Implementation details with code examples where relevant, (4) Time and space complexity analysis if applicable, (5) Common mistakes or misconceptions, (6) Exam-ready summary. Use h2/h3 headings, short paragraphs, and bullet lists where helpful.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output: ONLY the markdown body. No preamble.`;

const FLASHCARDS_FALLBACK = `{{SYSTEM_BASE}}

Task: Generate {{COUNT}} high-quality flashcards from the source excerpts. Prefer atomic facts, definitions, and contrasts. Avoid trivia.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only, no commentary:
{"cards":[{"question":"...","answer":"...","source_chunk_id": 1, "difficulty": "easy|medium|hard", "topic": "..."}]}

Use a numeric source_chunk_id from the cited source excerpts when possible. Use null when no single source chunk applies.`;

const QUIZ_MCQ_FALLBACK = `{{SYSTEM_BASE}}

Task: Generate {{COUNT}} multiple-choice quiz questions at {{DIFFICULTY}} difficulty. Focus on conceptual understanding: ask about time complexity, design trade-offs, when to use which data structure, OOP design principles, and common pitfalls. Avoid purely syntactic questions. Each question must have exactly 4 options with ONE correct answer (correct_idx 0-3). Each must include a short, helpful explanation that justifies the correct answer and addresses common misconceptions. Include a difficulty field and a topic tag for every question.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","difficulty":"{{DIFFICULTY}}","topic":"Arrays / Big-O / Encapsulation"}]}`;

const TUTOR_PLAN_FALLBACK = `{{SYSTEM_BASE}}

Build a 5-step Socratic-style learning plan for the concept: "{{CONCEPT}}". Mode: {{MODE}}. The 5 steps should follow: (1) Warm-up, (2) Intuition, (3) The trick / core idea, (4) Formalize, (5) Apply.

For each step, provide a short title (1-3 words) and a concise probing question OR explanation (depending on mode). Ground each question and explanation in the source excerpts, and cite relevant chunk ids inside explanations as [chunk:ID].

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"steps":[{"t":"Warm-up","q":"...","options":["A","B","C","D"],"correct_idx":1,"explanation":"..."}]}
Each step MUST include 4 options and a correct_idx with explanation.`;

const TUTOR_FEEDBACK_FALLBACK = `{{SYSTEM_BASE}}

The student is learning: "{{CONCEPT}}". Step: "{{STEP_TITLE}} - {{STEP_QUESTION}}".
The student answered: "{{USER_ANSWER}}". The answer is {{CORRECTNESS}}.

Use the relevant source excerpts below when available. Cite chunk ids as [chunk:ID] only when you use a source detail.

Source excerpts:
{{SOURCE_EXCERPTS}}

Write a 2-3 sentence feedback in markdown. If correct, deepen the insight. If incorrect, gently redirect with a hint without revealing the full answer. If the student's answer reflects a common misconception, name the misconception and explain why it is wrong.

Output: only the markdown text.`;

const TUTOR_STEP_EXPLAIN_FALLBACK = `{{SYSTEM_BASE}}

The student is studying "{{CONCEPT}}" in {{MODE}} mode.

Source excerpts:
{{SOURCE_EXCERPTS}}

Write one concise tutor step that teaches or demonstrates the concept. Use source details when available and cite chunk ids as [chunk:ID]. Keep it interactive by ending with one short check-for-understanding question.

Output: only markdown.`;

const VIDEO_SCRIPT_FALLBACK = `{{SYSTEM_BASE}}

Task: Write a tutor-whiteboard narrated explainer video script (8-12 slides) on: "{{CONCEPT}}". This should feel like an expert tutor explaining the material at a whiteboard — not a plain bullet deck.

Follow this educational slide sequence (skip slides that don't apply to the concept):
1. TITLE slide (visual_type: "mindmap") — Topic name + 2-3 learning objectives as bullets.
2. DEFINITION slide (visual_type: "mindmap") — Formal definition, why it matters, where it's used.
3. ANALOGY slide (visual_type: "comparison") — A real-world analogy that builds intuition.
4. CORE CONCEPT slide (visual_type: "flow" or "mindmap") — Step-by-step explanation of the main idea.
5. WORKED EXAMPLE slide (visual_type: "flow") — Walk through a concrete example step by step.
6. CODE EXAMPLE slide (visual_type: "code") — Show implementation with annotations. Put code in example_code field.
7. VISUAL DIAGRAM slide — Use the best visual_type for the concept:
   - "class_diagram" for OOP relationships (inheritance, composition)
   - "tree" for tree/BST/heap structures
   - "stack_queue" for stack or queue operations
   - "linkedlist" for linked list traversal or insertion
   - "bigo_chart" for complexity comparisons
   - "flow" for algorithms or processes
8. COMMON MISTAKES slide (visual_type: "comparison") — Show 2-3 mistakes vs. correct approaches.
9. COMPLEXITY slide (visual_type: "bigo_chart" or "comparison") — Time/space complexity analysis.
10. SUMMARY slide (visual_type: "summary") — Key takeaways as a recap mindmap.
11. QUIZ slide (visual_type: "mindmap") — One check-for-understanding question with the answer.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"slides":[{"title":"...","visual_type":"mindmap|flow|comparison|code|summary|class_diagram|tree|stack_queue|linkedlist|bigo_chart","bullets":["...","..."],"visual_nodes":["concept A","concept B"],"visual_edges":[["concept A","concept B"]],"callouts":["..."],"example_code":"...","narration":"..."}]}

Rules:
- Produce 8-12 slides. Every slide MUST have narration (2-4 sentences, spoken like a tutor).
- Use 2-5 short bullets per slide.
- visual_nodes must name concrete concepts from the source.
- visual_edges must connect node labels that appear in visual_nodes.
- callouts are short tutor hints or warnings (1-2 per slide).
- example_code is optional — include only on code slides.
- Ground narration in the source excerpts. Cite chunk ids like [chunk:12].
- Narration should explain WHY, not just WHAT. Build understanding progressively.`;

const CONCEPT_EXTRACT_FALLBACK = `{{SYSTEM_BASE}}

Identify the 3-8 most important named concepts in these excerpts. Output STRICT JSON only:
{"concepts":["...","..."]}

Source excerpts:
{{SOURCE_EXCERPTS}}`;

function readTemplate(fileName, fallback) {
  if (templateCache.has(fileName)) return templateCache.get(fileName);
  let value = fallback;
  try {
    const loaded = fs.readFileSync(path.join(TEMPLATE_DIR, fileName), 'utf8').trim();
    if (loaded) value = loaded;
  } catch (_) {
    value = fallback;
  }
  templateCache.set(fileName, value);
  return value;
}

function renderTemplate(fileName, fallback, vars) {
  const template = readTemplate(fileName, fallback);
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const value = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    return String(value == null ? '' : value);
  });
}

function cleanExcerptText(text) {
  let value = String(text || '').trim();
  if (/<\/?(a|p|dgm|c):/i.test(value)) value = value.replace(/<[^>]+>/g, ' ');
  return value.replace(/\s+/g, ' ').trim();
}

function sourceExcerpts(chunks, opts = {}) {
  const maxCharsPerChunk = opts.maxCharsPerChunk || 1200;
  const maxTotalChars = opts.maxTotalChars || 7000;
  let total = 0;
  const excerpts = [];
  for (const c of chunks || []) {
    let text = cleanExcerptText(c.text);
    if (!text) continue;
    if (maxCharsPerChunk && text.length > maxCharsPerChunk) text = `${text.slice(0, maxCharsPerChunk).trim()}...`;
    const available = maxTotalChars - total;
    if (available <= 0) break;
    if (text.length > available) text = `${text.slice(0, Math.max(0, available - 3)).trim()}...`;
    excerpts.push(`[chunk:${c.id}] ${text}`);
    total += text.length;
  }
  const joined = excerpts.join('\n\n');
  return joined || '(No source excerpts provided.)';
}

const visualTemplates = require('./visual-templates');

const SYSTEM_BASE = readTemplate('system-base.txt', SYSTEM_BASE_FALLBACK);

const NOTES_SUMMARY = (chunks, title) => renderTemplate('notes-summary.txt', NOTES_SUMMARY_FALLBACK, {
  SYSTEM_BASE,
  TITLE: title,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 900, maxTotalChars: 5200 }),
});

const FLASHCARDS = (chunks, count) => renderTemplate('flashcards.txt', FLASHCARDS_FALLBACK, {
  SYSTEM_BASE,
  COUNT: count,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 520, maxTotalChars: 3200 }),
});

const QUIZ_MCQ = (chunks, count, difficulty) => renderTemplate('quiz-mcq.txt', QUIZ_MCQ_FALLBACK, {
  SYSTEM_BASE,
  COUNT: count,
  DIFFICULTY: difficulty,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 850, maxTotalChars: 5200 }),
});

const TUTOR_PLAN = (concept, mode, chunks) => renderTemplate('tutor-plan.txt', TUTOR_PLAN_FALLBACK, {
  SYSTEM_BASE,
  CONCEPT: concept,
  MODE: mode,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 900, maxTotalChars: 5200 }),
});

const TUTOR_FEEDBACK = (concept, step, userAnswerText, correct, chunks = []) => renderTemplate('tutor-feedback.txt', TUTOR_FEEDBACK_FALLBACK, {
  SYSTEM_BASE,
  CONCEPT: concept,
  STEP_TITLE: step && step.t,
  STEP_QUESTION: step && step.q,
  USER_ANSWER: userAnswerText,
  CORRECTNESS: correct ? 'CORRECT' : 'INCORRECT',
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 700, maxTotalChars: 2600 }),
});

const TUTOR_STEP_EXPLAIN = (concept, mode, chunks) => renderTemplate('tutor-step-explain.txt', TUTOR_STEP_EXPLAIN_FALLBACK, {
  SYSTEM_BASE,
  CONCEPT: concept,
  MODE: mode,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 800, maxTotalChars: 3600 }),
});

const VIDEO_SCRIPT = (concept, chunks) => {
  const tpl = visualTemplates.findTemplate(concept);
  const hint = tpl
    ? `\nVisual hint for "${concept}": use visual_type "${tpl.type}" with nodes like ${JSON.stringify(tpl.nodes.slice(0, 5))}.`
    : '';
  return renderTemplate('video-script.txt', VIDEO_SCRIPT_FALLBACK, {
    SYSTEM_BASE,
    CONCEPT: concept,
    SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 650, maxTotalChars: 3600 }) + hint,
  });
};

const CONCEPT_EXTRACT = (chunks) => renderTemplate('concept-extract.txt', CONCEPT_EXTRACT_FALLBACK, {
  SYSTEM_BASE,
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 800, maxTotalChars: 4200 }),
});

const REPAIR_JSON = (raw) => `Fix the JSON below. Output ONLY valid JSON with no commentary. If structure is unclear, choose the most sensible interpretation.

INPUT:
${raw}

OUTPUT:`;

module.exports = {
  SYSTEM_BASE,
  NOTES_SUMMARY,
  FLASHCARDS,
  QUIZ_MCQ,
  TUTOR_PLAN,
  TUTOR_FEEDBACK,
  TUTOR_STEP_EXPLAIN,
  VIDEO_SCRIPT,
  CONCEPT_EXTRACT,
  REPAIR_JSON,
  _internals: { readTemplate, renderTemplate, sourceExcerpts, templateCache },
};
