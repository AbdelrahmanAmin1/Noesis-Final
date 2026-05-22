'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'prompts', 'templates');
const templateCache = new Map();

const SYSTEM_BASE_FALLBACK = 'You are Noesis, an expert CS tutor specializing in Object-Oriented Programming and Data Structures. You teach like a passionate university lecturer — clear definitions, deep explanations, real code examples, diagrams, analogies, and step-by-step walkthroughs. Use proper CS terminology (classes, objects, inheritance, polymorphism, encapsulation, abstraction, interfaces, arrays, linked lists, stacks, queues, trees, graphs, hash tables, sorting, searching, Big-O notation). Be pedagogically clear and thorough — explain the WHY, not just the WHAT. Use the source excerpts to detect the topic, identify course-specific definitions, and ground key claims. Then ENHANCE the explanation with your professional CS knowledge: add depth, code examples, diagrams, analogies, common mistakes, and complexity analysis. Do not restrict yourself to only repeating the source — use it as a foundation and build a complete educational explanation on top. Never hallucinate course-specific facts not in the source. If source coverage is weak, teach from standard CS knowledge and say so.';

const NOTES_SUMMARY_FALLBACK = `{{SYSTEM_BASE}}

Task: Write a comprehensive, visually attractive study note titled "{{TITLE}}". Use the source excerpts as your grounding, then enhance with professional CS knowledge to create a complete educational resource.

Required structure:
## 1. Overview
Clear definition. Why this concept matters. Where it is used.

## 2. Deep Explanation
Thorough explanation of how it works. Use a real-world analogy to build intuition.

## 3. Code Example
\`\`\`java
// Include a complete, annotated code example (8-15 lines minimum)
// Add inline comments explaining each significant line
\`\`\`

## 4. Step-by-Step Walkthrough
Walk through the code or concept step by step. Show what happens at each stage.

## 5. Complexity Analysis
Time and space complexity with a comparison table if relevant:
| Operation | Time | Space |
|-----------|------|-------|

## 6. Common Mistakes
> **Warning:** List 2-3 common mistakes students make, with explanation of why they are wrong.

## 7. Quick Reference
> **Exam Tip:** Key facts to remember, formatted as a concise checklist.

## Related Topics
List 2-3 related concepts the student should study next.

Source excerpts:
{{SOURCE_EXCERPTS}}

Rules:
- Write 800-1500 words. Be thorough, not shallow.
- Include at least one complete code example with inline comments.
- Use markdown formatting: headings, bold, code blocks, tables, blockquotes.
- Use > **Note:** for important callouts and > **Warning:** for common mistakes.
- Do not include raw chunk IDs in the output — they are for your reference only.
- Output ONLY the markdown body. No preamble.`;

const LESSON_GENERATE_FALLBACK = `{{SYSTEM_BASE}}

Task: Generate one structured EducationalLesson JSON object for "{{TOPIC}}".

Audience: beginner CS student.
Lesson type: {{LESSON_TYPE}}
Grounding: {{GROUNDING_STATUS}}

{{ENRICHMENT_POLICY}}

Use source excerpts for course-specific facts. Use curated local knowledge for deep explanation, code, diagrams, mistakes, and complexity. Do not merely summarize the source.

Source excerpts:
{{SOURCE_EXCERPTS}}

Curated local knowledge:
{{CURATED_KNOWLEDGE}}

Return ONLY valid JSON:
{"topic":"{{TOPIC}}","audienceLevel":"beginner","lessonType":"oop|data_structure|algorithm|general","sourceMaterial":{"title":"{{TITLE}}","grounding":"{{GROUNDING_STATUS}}","selectedChunkIds":[]},"learningObjectives":["..."],"prerequisites":["..."],"sections":[{"type":"hook|definition|deep_explanation|analogy|code_example|code_walkthrough|diagram|mindmap|common_mistakes|complexity|checkpoint|recap|next_steps","title":"...","content":"...","cards":[{"title":"...","text":"..."}],"code":{"language":"java","content":"...","explanation":[{"lineRange":"1-3","text":"..."}]},"diagram":{"type":"uml_class|inheritance_tree|linked_list|hash_table|stack|queue|tree|big_o_chart|mindmap|flow","nodes":[],"edges":[],"operations":[],"caption":""},"callouts":[{"type":"remember|exam_tip|warning|source","text":"...","sourceChunkIds":[]}],"quiz":[{"question":"...","options":["..."],"answer":"...","explanation":"..."}]}],"relatedTopics":["..."]}

Required:
- Include hook, definition, deep_explanation, diagram, code_example, code_walkthrough, common_mistakes, checkpoint, recap, and next_steps sections.
- Include real runnable code for OOP/Data Structures/Algorithms.
- Include line-by-line code explanation.
- Include semantic diagram nodes and edges.
- Do not output raw markdown notes. JSON only.
- Do not show [chunk:ID] in visible content; put ids in sourceChunkIds.
- Never use placeholder phrases such as "Trace an example", "Define the idea", "Apply main rule", "Code sketch", or "Avoid mistakes".
- Inheritance must include Shape, Circle, Rectangle, extends, overriding, UML inheritance arrow, and composition warning.
- Polymorphism must include superclass reference, subclass object, dynamic dispatch, overriding vs overloading, and static/final warning.
- Linked List must include node, head, next, traversal, insertion, deletion, memory-style diagram, and complexity.
- Stack must include LIFO, push, pop, peek, vertical stack diagram, underflow, and use cases.`;

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

For each step, provide real teaching content. Ground each step in the source excerpts, but do not put raw chunk ids in learner-facing text. No placeholders, ellipses, or generic chapter/document wording.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"steps":[{"id":"warmup","label":"Warm-up","title":"Same call, different object","content":"A clear 2-4 sentence explanation.","question":"One Socratic check question.","hint":"One helpful hint.","example":"A concrete example.","visual":{"type":"mindmap","nodes":[],"edges":[]},"code":null,"sourceRefs":[]}]}`;

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

const TUTOR_CHAT_FALLBACK = `{{SYSTEM_BASE}}

You are Noesis in free-form chat mode. Answer the student's question using the uploaded material excerpts as the primary source of truth.

Grounding tier: {{GROUNDING_TIER}}

Conversation so far:
{{CONVERSATION_HISTORY}}

Source excerpts:
{{SOURCE_EXCERPTS}}

Student question:
{{USER_MESSAGE}}

Rules:
- Give a clear, helpful answer in markdown.
- Cite source details naturally using [Source 1], [Source 2], etc. only when that exact excerpt supports the claim.
- Do not cite general CS knowledge or conversation memory as a source.
- If Grounding tier is weak, begin with: "I could not find strong support for this in your uploaded material." Then clearly label any extra help as general CS explanation.
- If there are no relevant excerpts, do not fabricate course-specific details. Offer a general explanation only if it is clearly marked as general help.
- If the excerpts do not support the answer well, say that clearly before adding general CS knowledge.
- Do not invent course-specific details that are not in the excerpts.
- Keep the answer focused on the student's question.
- End with exactly 2-3 follow-up suggestions inside this block:
[SUGGESTIONS]
- ...
- ...
[/SUGGESTIONS]

Output only the answer and the suggestions block.`;

const TUTOR_CHAT_ACTION_FALLBACK = `{{SYSTEM_BASE}}

You are Noesis in free-form chat mode. The student clicked a study action chip.

Action: {{ACTION_LABEL}}
Grounding tier: {{GROUNDING_TIER}}

Action instructions:
{{ACTION_INSTRUCTIONS}}

Conversation so far:
{{CONVERSATION_HISTORY}}

Source excerpts:
{{SOURCE_EXCERPTS}}

Student request:
{{USER_MESSAGE}}

Rules:
- Use the uploaded material excerpts as the primary source of truth.
- Cite source details naturally using [Source 1], [Source 2], etc. only when that exact excerpt supports the claim.
- Do not cite general CS knowledge or conversation memory as a source.
- If Grounding tier is weak, begin with: "I could not find strong support for this in your uploaded material." Then clearly label any extra help as general CS explanation.
- If there are no relevant excerpts, do not fabricate course-specific details. Offer a general study response only if it is clearly marked as general help.
- If the excerpts do not support the answer well, say that clearly before adding general CS knowledge.
- Keep the response useful for studying, not generic.
- End with exactly 2-3 follow-up suggestions inside:
[SUGGESTIONS]
- ...
- ...
[/SUGGESTIONS]
{{STRUCTURED_OUTPUT_INSTRUCTIONS}}

Output only the answer, the suggestions block, and any requested structured block.`;

const VIDEO_SCRIPT_FALLBACK = `{{SYSTEM_BASE}}

Task: Write a deep educational tutor video script (8-12 slides) on: "{{CONCEPT}}". This must feel like an expert tutor at a whiteboard — teaching deeply with explanations, code, and visuals.

Educational slide sequence (skip only if truly irrelevant):
1. TITLE — Hook: why this topic matters + 2-3 learning objectives.
2. DEFINITION — Formal definition, real-world context, where it is used.
3. ANALOGY — Fully developed real-world analogy mapped to the concept.
4. CORE CONCEPT — Step-by-step explanation of the main idea with concrete examples.
5. WORKED EXAMPLE — Walk through a specific example showing inputs, operations, outputs.
6. CODE EXAMPLE — Complete working code (8-15 lines with comments) in example_code field. Narration explains each line.
7. VISUAL DIAGRAM — Best visual_type: class_diagram (OOP), tree (BST/heap), stack_queue (stack/queue), linkedlist, hash_table, bigo_chart (complexity), flow (algorithms).
8. COMMON MISTAKES — 2-3 mistakes with WHY they are wrong vs. the correct approach.
9. COMPLEXITY — Time/space analysis with concrete comparisons.
10. SUMMARY — Key takeaways as recap.
11. QUIZ — One check-for-understanding question with the answer.

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"slides":[{"title":"...","visual_type":"mindmap|flow|comparison|code|summary|class_diagram|tree|stack_queue|linkedlist|hash_table|bigo_chart","bullets":["...","..."],"visual_nodes":["Node","LinkedList","head","next"],"visual_edges":[["head","Node"]],"callouts":["..."],"example_code":"...","narration":"..."}]}

Rules:
- Produce 8-12 slides. Every slide MUST have deep narration (4-8 sentences for teaching slides, 2-4 for title/quiz/recap).
- Bullets can be up to 120 characters. Write meaningful content, not vague labels.
- visual_nodes must use concrete names (class names, data values, operations) not abstract labels.
- Narration must EXPLAIN and TEACH. Build understanding progressively. Vary sentence openings.
- Do not include raw chunk references in bullets or callouts.
- Code slides: put full annotated code in example_code. Narrate line-by-line.`;

const VIDEO_SCRIPT_M1_FALLBACK = `{{SYSTEM_BASE}}

Task: Write a deep, educational AI tutor video script on "{{CONCEPT}}" for a beginner CS student. This should feel like an expert tutor explaining at a whiteboard — teaching deeply, not just listing topics.

Grounding status: {{GROUNDING_STATUS}}
{{GROUNDING_INSTRUCTION}}

Required slide sequence (8-10 slides):
1. title — Hook the student: why should they care about this topic?
2. objectives — 3 specific learning outcomes
3. concept — Deep definition with WHY it matters and WHERE it is used
4. analogy — Fully developed real-world analogy mapped to the technical concept
5. diagram — Visual model using the best diagram type for this concept
6. code — Complete working code example (8-15 lines) with inline comments
7. step_by_step — Walk through the code/concept step by step, showing what happens at each stage
8. mistakes — 2-3 common mistakes with explanation of WHY they are wrong
9. recap — Summarize the key takeaways
10. quiz — One meaningful check-for-understanding question with answer

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{
  "topic": "{{CONCEPT}}",
  "audienceLevel": "beginner",
  "learningObjectives": ["...", "...", "..."],
  "slides": [
    {
      "slideType": "title|objectives|concept|analogy|diagram|code|step_by_step|mistakes|recap|quiz",
      "title": "...",
      "bullets": ["...", "..."],
      "narration": "...",
      "visual": {
        "type": "mindmap|flow|comparison|code|summary|class_diagram|tree|stack_queue|linkedlist|bigo_chart",
        "description": "...",
        "nodes": ["...", "..."],
        "edges": [["...", "..."]]
      },
      "callouts": ["..."],
      "example_code": ""
    }
  ]
}

Rules:
- Produce 8-10 slides.
- NARRATION IS THE MOST IMPORTANT PART. Each slide narration must be 4-8 sentences for concept/analogy/code/step_by_step slides. Explain deeply — the WHY, not just the WHAT. Speak like a tutor who wants the student to truly understand.
- For title/objectives/recap/quiz slides, 2-4 sentences is acceptable.
- Use 2-5 bullets per slide. Each bullet can be up to 120 characters — write meaningful explanations, not vague labels.
- visual_nodes must name concrete concepts, data values, or class names — not abstract labels like "Definition" or "Purpose".
- visual_edges must connect labels that appear in visual_nodes.
- callouts are short tutor tips or warnings (1-2 per slide). Do not include raw chunk references.
- For CODE slides: put complete, working code (8-15 lines with comments) in the example_code field. The narration should explain the code line by line.
- For ANALOGY slides: fully develop the analogy. Map each part of the real-world scenario to the technical concept.
- For DIAGRAM slides: use the best visual_type for the concept (class_diagram for OOP, tree for trees, linkedlist for linked lists, hash_table for hash tables/maps, stack_queue for stacks/queues, bigo_chart for complexity, flow for algorithms).
- If grounding is LOW, say so in slide 1 narration + callout, then teach from standard CS knowledge.
- Do NOT use generic bullets like "What X means" or "Why it matters" — actually explain what it means and why it matters.
- Vary sentence openings in narration. Use transitions: "Now let us look at...", "The key insight is...", "Notice how...".`;

const VIDEO_CONCEPT_EXTRACT_FALLBACK = `{{SYSTEM_BASE}}

You are choosing the real educational topic for a tutor video.

Reject generic labels such as Document, File, Material, Untitled, Chapter 1, or uploaded filenames.
Choose the most specific CS topic actually supported by the excerpts. Prefer OOP and Data Structures concepts such as Encapsulation, Inheritance, Polymorphism, Stack, Queue, Linked List, Binary Search Tree, Big-O, Array, Recursion, or Hash Table when supported.

Material title: "{{MATERIAL_TITLE}}"
Rejected hint: "{{REJECTED_HINT}}"

Source excerpts:
{{SOURCE_EXCERPTS}}

Output STRICT JSON only:
{"topic":"Encapsulation","alternatives":["Class","Object","Abstraction"]}`;

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

const NOTES_GROUNDING = {
  strong: 'The source material covers this topic thoroughly. Use it as your primary reference — cite definitions, examples, and key points from the source. Then enhance with professional CS knowledge for completeness.',
  moderate: 'The source material partially covers this topic. Start from what is provided, then supplement freely with standard CS knowledge to create a complete educational note.',
  weak: 'The uploaded material has minimal content on this topic. Teach from professional CS knowledge. Note in the Overview that source coverage was limited, then deliver a comprehensive note.',
};

const NOTES_SUMMARY = (chunks, title, opts = {}) => {
  const tier = opts.groundingTier || 'moderate';
  const groundingLine = `\nGrounding: ${tier.toUpperCase()}. ${NOTES_GROUNDING[tier] || NOTES_GROUNDING.moderate}\n`;
  return renderTemplate('notes-summary.txt', NOTES_SUMMARY_FALLBACK, {
    SYSTEM_BASE: SYSTEM_BASE + groundingLine,
    TITLE: title,
    SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 1000, maxTotalChars: 7000 }),
  });
};

const LESSON_GENERATE = (chunks, title, opts = {}) => {
  const tier = opts.groundingTier || 'moderate';
  return renderTemplate('lesson-generate.txt', LESSON_GENERATE_FALLBACK, {
    SYSTEM_BASE,
    TITLE: title,
    TOPIC: opts.topic || title,
    LESSON_TYPE: opts.lessonType || 'general',
    GROUNDING_STATUS: tier,
    ENRICHMENT_POLICY: opts.enrichmentPolicyPrompt || 'Enrichment policy: Use the uploaded source as the primary source of truth. Add examples only to simplify the same detected topic.',
    SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 950, maxTotalChars: 6200 }),
    CURATED_KNOWLEDGE: opts.curatedKnowledge || '(No curated local knowledge provided.)',
  });
};

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

const TUTOR_CHAT = (chunks, message, opts = {}) => renderTemplate('tutor-chat.txt', TUTOR_CHAT_FALLBACK, {
  SYSTEM_BASE,
  USER_MESSAGE: message,
  GROUNDING_TIER: opts.groundingTier || 'moderate',
  CONVERSATION_HISTORY: opts.conversationHistory || '(No previous chat turns.)',
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 800, maxTotalChars: 5200 }),
});

const TUTOR_CHAT_ACTION = (chunks, message, opts = {}) => renderTemplate('tutor-chat-action.txt', TUTOR_CHAT_ACTION_FALLBACK, {
  SYSTEM_BASE,
  USER_MESSAGE: message,
  ACTION_LABEL: opts.actionLabel || 'Study action',
  ACTION_INSTRUCTIONS: opts.actionInstructions || 'Help the student study the current concept.',
  STRUCTURED_OUTPUT_INSTRUCTIONS: opts.structuredOutputInstructions || '',
  GROUNDING_TIER: opts.groundingTier || 'moderate',
  CONVERSATION_HISTORY: opts.conversationHistory || '(No previous chat turns.)',
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 800, maxTotalChars: 5200 }),
});

const VIDEO_SCRIPT = (concept, chunks, opts = {}) => {
  const tpl = visualTemplates.findTemplate(concept);
  const hint = tpl
    ? `\nVisual hint for "${concept}": use visual_type "${tpl.type}" with nodes like ${JSON.stringify(tpl.nodes.slice(0, 5))}.`
    : '';
  const lowGrounding = !!opts.lowGrounding;
  const tier = opts.groundingTier || (lowGrounding ? 'weak' : 'strong');
  const groundingInstructions = {
    strong: 'The source material covers this topic well. Use it as your foundation — cite key definitions and facts from the source. Then enhance with your CS knowledge: add depth, analogies, code examples, and common mistakes that go beyond the source.',
    moderate: 'The source material gives partial context on this topic. Start from what the source provides, then freely supplement with standard CS knowledge to create a complete, deep explanation.',
    weak: 'The uploaded material has minimal coverage of this topic. Teach from professional CS knowledge. Disclose in the first slide that the uploaded material did not contain detailed content on this specific topic, then deliver a thorough lesson.',
  };
  return renderTemplate('video-script.txt', VIDEO_SCRIPT_M1_FALLBACK, {
    SYSTEM_BASE,
    CONCEPT: concept,
    GROUNDING_STATUS: tier.toUpperCase(),
    GROUNDING_INSTRUCTION: groundingInstructions[tier] || groundingInstructions.moderate,
    SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 900, maxTotalChars: 6000 }) + hint,
  });
};

const VIDEO_CONCEPT_EXTRACT = (chunks, opts = {}) => renderTemplate('video-concept-extract.txt', VIDEO_CONCEPT_EXTRACT_FALLBACK, {
  SYSTEM_BASE,
  MATERIAL_TITLE: opts.materialTitle || '',
  REJECTED_HINT: opts.rejectedHint || '',
  SOURCE_EXCERPTS: sourceExcerpts(chunks, { maxCharsPerChunk: 800, maxTotalChars: 4200 }),
});

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
  LESSON_GENERATE,
  FLASHCARDS,
  QUIZ_MCQ,
  TUTOR_PLAN,
  TUTOR_FEEDBACK,
  TUTOR_STEP_EXPLAIN,
  TUTOR_CHAT,
  TUTOR_CHAT_ACTION,
  VIDEO_SCRIPT,
  VIDEO_CONCEPT_EXTRACT,
  CONCEPT_EXTRACT,
  REPAIR_JSON,
  _internals: { readTemplate, renderTemplate, sourceExcerpts, templateCache },
};
