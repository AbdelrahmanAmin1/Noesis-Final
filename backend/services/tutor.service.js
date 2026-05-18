'use strict';

const { getDb } = require('../config/db');
const env = require('../config/env');
const jobs = require('./jobs.service');
const { HttpError } = require('../middleware/error');
const { retrieveLessonContext, groundingTier } = require('./rag.service');
const topicResolver = require('./topic-resolver.service');
const learningMaps = require('./learning-map.service');
const materialService = require('./material.service');
const { recordConceptOutcome } = require('./mastery.service');
const log = require('../utils/logger');

function nowIso() { return new Date().toISOString(); }

const STEP_META = [
  { id: 'warmup', label: 'Warm-up' },
  { id: 'intuition', label: 'Intuition' },
  { id: 'trick', label: 'The Trick' },
  { id: 'formalize', label: 'Formalize' },
  { id: 'apply', label: 'Apply' },
];

const cache = {
  topic: new Map(),
  rag: new Map(),
  step: new Map(),
};

function cacheGet(map, key) {
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() - item.at > env.TUTOR_CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(map, key, value) {
  map.set(key, { at: Date.now(), value });
  return value;
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function cleanText(value, max = 1200) {
  return String(value || '')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function isGeneric(value) {
  return topicResolver.isGenericTopic(value) || /^\d+$/.test(String(value || '').trim());
}

function sourceTitleFromChunks(chunks, fallback) {
  const title = (chunks || []).map(c => c.chapter_title || c.heading || c.slide_title || c.section_title).find(Boolean);
  return cleanText(title || fallback || '', 120);
}

function sourceChunksForClient(chunks, materialTitle) {
  return (chunks || []).slice(0, 8).map((c, i) => {
    const heading = c.heading || c.slide_title || c.section_title || c.chapter_title || materialTitle || `Source ${i + 1}`;
    const location = c.slide_number ? `Slide ${c.slide_number}` : (c.source_page ? `Page ${c.source_page}` : (c.chapter_title || 'Material excerpt'));
    return {
      id: c.id,
      chunkId: c.id,
      idx: c.idx,
      materialTitle: materialTitle || '',
      heading: cleanText(heading, 120),
      location,
      excerpt: cleanText(c.text, 520),
      score: typeof c.score === 'number' ? c.score : null,
      corpus: c.corpus || 'uploaded',
    };
  });
}

function visualTypeFor(topic) {
  const t = String(topic || '').toLowerCase();
  if (t.includes('polymorphism')) return 'polymorphism_dispatch';
  if (t.includes('inheritance')) return 'inheritance_tree';
  if (t.includes('linked')) return 'linkedlist';
  if (t.includes('stack')) return 'stack';
  if (t.includes('queue')) return 'queue';
  if (t.includes('binary') || t.includes('bst') || t.includes('tree')) return 'tree';
  if (t.includes('big') || t.includes('complexity')) return 'big_o';
  if (t.includes('encapsulation')) return 'flow';
  if (t.includes('abstraction')) return 'mindmap';
  return 'mindmap';
}

function codeForTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (t.includes('polymorphism')) {
    return {
      language: 'java',
      content: [
        'Shape s = new Circle();',
        's.draw();        // calls Circle.draw()',
        's = new Rectangle();',
        's.draw();        // calls Rectangle.draw()',
      ].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'The reference type is Shape, but the runtime object is Circle.' },
        { lineRange: '2', text: 'Java chooses the overridden method on the actual object.' },
        { lineRange: '3-4', text: 'The same call can dispatch differently after reassignment.' },
      ],
    };
  }
  if (t.includes('inheritance')) {
    return {
      language: 'java',
      content: [
        'class Shape { double area() { return 0; } }',
        'class Circle extends Shape {',
        '  double area() { return Math.PI * r * r; }',
        '}',
      ].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'Shape defines shared behavior.' },
        { lineRange: '2', text: 'Circle inherits from Shape using extends.' },
        { lineRange: '3', text: 'Circle overrides the inherited area behavior.' },
      ],
    };
  }
  if (t.includes('linked')) {
    return {
      language: 'java',
      content: [
        'Node newNode = new Node(value);',
        'newNode.next = current.next;',
        'current.next = newNode;',
      ].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'Create the node before changing links.' },
        { lineRange: '2', text: 'Save the old next pointer first.' },
        { lineRange: '3', text: 'Then link the current node to the new node.' },
      ],
    };
  }
  if (t.includes('stack')) {
    return {
      language: 'java',
      content: ['stack.push(x);', 'int top = stack.peek();', 'int removed = stack.pop();'].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'Push places an item on top.' },
        { lineRange: '2', text: 'Peek reads the top without removing it.' },
        { lineRange: '3', text: 'Pop removes the most recent item.' },
      ],
    };
  }
  if (t.includes('queue')) {
    return {
      language: 'java',
      content: ['queue.add(x);       // rear', 'int first = queue.remove(); // front'].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'Enqueue adds at the rear.' },
        { lineRange: '2', text: 'Dequeue removes from the front.' },
      ],
    };
  }
  return null;
}

function contentForTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (t.includes('polymorphism')) {
    return {
      warmup: {
        title: 'Same call, different object',
        content: 'Polymorphism solves a specific problem: one reference type can point at different runtime objects, and the same method call should use the behavior of the actual object.',
        question: 'If `Shape s` points to a `Circle`, which `draw()` should run: Shape or Circle?',
        hint: 'Look at the object created with `new`, not only the variable type.',
        example: '`Shape s = new Circle(); s.draw();` chooses `Circle.draw()` at runtime.',
      },
      intuition: {
        title: 'Runtime behavior',
        content: 'Think of the reference as a remote control. The label on the remote says Shape, but the device it controls might be a Circle or Rectangle. The button name is the same; the receiver decides what happens.',
        question: 'Why is runtime type more important than reference type for overridden methods?',
        hint: 'Overriding is about the object implementation that exists at runtime.',
        example: 'A list of Shape references can hold circles, rectangles, and triangles.',
      },
      trick: {
        title: 'Superclass reference',
        content: 'The trick is that a superclass reference can store a subclass object. This lets one loop call the same method on many objects without asking what exact subclass each object is.',
        question: 'What benefit do we get from writing code against `Shape` instead of only `Circle`?',
        hint: 'Think about adding a new subclass later without rewriting the loop.',
        example: '`Shape[] shapes = { new Circle(), new Rectangle() };`',
      },
      formalize: {
        title: 'Dynamic dispatch',
        content: 'Formally, dynamic dispatch means the method implementation is selected at runtime for overridden instance methods. It does not work the same way for static, final, or private methods.',
        question: 'Which idea is polymorphism closer to: overriding or overloading?',
        hint: 'Overloading is chosen by parameter types at compile time; overriding is chosen by runtime object.',
        example: '`draw()` overridden in Circle and Rectangle is polymorphism; `draw(int size)` is overloading.',
      },
      apply: {
        title: 'Apply the pattern',
        content: 'Use polymorphism when different classes share a common operation but perform it differently. The caller depends on the common type; each subclass owns its own behavior.',
        question: 'Where would this make your code easier to extend?',
        hint: 'Look for repeated if/else checks on object type.',
        example: 'Payroll systems, drawing programs, and game entities often use polymorphic calls.',
      },
    };
  }
  if (t.includes('linked')) {
    return {
      warmup: { title: 'Arrays versus nodes', content: 'A linked list stores items as nodes connected by references instead of one continuous block like an array.', question: 'What does a node need besides the data value?', hint: 'It needs a way to find the next node.', example: '`[data | next]`' },
      intuition: { title: 'Follow the arrows', content: 'The head pointer tells you where the list starts. Each node points to the next node, and the final node points to null.', question: 'Why can traversal only move forward in a singly linked list?', hint: 'Each node only knows its next neighbor.', example: '`head -> 10 -> 20 -> null`' },
      trick: { title: 'Never lose next', content: 'The dangerous part of insertion and deletion is changing links in the wrong order. If you overwrite a next reference too early, the rest of the list can become unreachable.', question: 'Before inserting after current, which pointer should be saved first?', hint: 'Save `current.next` before redirecting it.', example: '`newNode.next = current.next` before `current.next = newNode`.' },
      formalize: { title: 'Head, next, null', content: 'The formal model is a head reference plus nodes. Each node has data and next. Search and traversal are O(n); insertion after a known node is O(1).', question: 'Why is searching O(n)?', hint: 'You may need to visit each node one at a time.', example: 'Finding value 30 may require checking 10, then 20, then 30.' },
      apply: { title: 'Insert and delete', content: 'Apply linked lists when cheap local insertion matters more than random access. Always draw the pointer changes before writing code.', question: 'What mistake causes a deleted node to leave the list broken?', hint: 'Check which node should point around the removed node.', example: '`prev.next = current.next` removes current from the chain.' },
    };
  }
  if (t.includes('stack')) {
    return {
      warmup: { title: 'Last item first', content: 'A stack is a collection where the most recently added item is the first one removed.', question: 'If A, then B, then C are pushed, which item pops first?', hint: 'Look at the top of the pile.', example: 'C is removed first.' },
      intuition: { title: 'Top pointer', content: 'The top is the only active end. Push adds to the top, pop removes from the top, and peek reads the top.', question: 'Why does stack access feel restricted?', hint: 'Only one end is allowed.', example: 'Undo history uses the newest action first.' },
      trick: { title: 'Check underflow', content: 'The common bug is popping from an empty stack. A real implementation checks underflow before removing.', question: 'What should happen if `pop()` is called on an empty stack?', hint: 'The stack has no valid top item.', example: 'Throw an exception or return an error state.' },
      formalize: { title: 'Push, pop, peek', content: 'Push, pop, and peek are usually O(1) because they operate only at the top.', question: 'Why does pop not need to scan the whole stack?', hint: 'The top item is already known.', example: '`push(x)`, `peek()`, `pop()`.' },
      apply: { title: 'Use cases', content: 'Stacks fit nested or reversible processes: undo, function calls, expression parsing, and depth-first search.', question: 'Which app feature naturally behaves like a stack?', hint: 'Think of reversing the most recent action.', example: 'Undo in an editor.' },
    };
  }
  if (t.includes('queue')) {
    return {
      warmup: { title: 'First item first', content: 'A queue removes items in the same order they arrived. It is FIFO: first in, first out.', question: 'If A, then B, then C enter a queue, which leaves first?', hint: 'Think of a line at a counter.', example: 'A leaves first.' },
      intuition: { title: 'Front and rear', content: 'The front is where items leave; the rear is where new items enter. Keeping these roles separate preserves fairness.', question: 'Why should enqueue and dequeue happen at different ends?', hint: 'Otherwise the order would not stay FIFO.', example: 'Print jobs are processed in arrival order.' },
      trick: { title: 'Move the pointers', content: 'The trick is tracking front and rear carefully, especially when the queue becomes empty.', question: 'What changes after dequeue?', hint: 'The front pointer moves to the next item.', example: '`front = front.next` in a linked queue.' },
      formalize: { title: 'Enqueue, dequeue, peek', content: 'Enqueue, dequeue, and peek are O(1) with the right representation because each touches only one end.', question: 'What operation reads the next item without removing it?', hint: 'It looks at the front.', example: '`peek()` returns the front item.' },
      apply: { title: 'Use cases', content: 'Queues model waiting: CPU scheduling, message queues, breadth-first search, and customer service lines.', question: 'Why does BFS use a queue?', hint: 'It explores older discovered nodes before newer ones.', example: 'Visit all neighbors at distance 1 before distance 2.' },
    };
  }
  if (t.includes('inheritance')) {
    return {
      warmup: { title: 'Shared behavior', content: 'Inheritance lets a child class reuse and specialize behavior from a parent class.', question: 'What should Circle and Rectangle share if both are Shapes?', hint: 'Look for common methods or state.', example: 'Both can expose an `area()` method.' },
      intuition: { title: 'Is-a relationship', content: 'Use inheritance when a subclass truly is a more specific version of a superclass.', question: 'Is a Circle a Shape, or does it merely have a Shape?', hint: 'Inheritance models “is-a,” composition models “has-a.”', example: '`Circle extends Shape`.' },
      trick: { title: 'Override carefully', content: 'The subclass can override a method to provide specialized behavior while keeping the same method contract.', question: 'Why should the method name/signature stay compatible?', hint: 'Callers using the parent type depend on that contract.', example: '`Circle.area()` replaces the default Shape behavior.' },
      formalize: { title: 'Superclass and subclass', content: 'The parent class defines inherited members. The child class extends it, gains those members, and may add or override behavior.', question: 'What keyword creates inheritance in Java?', hint: 'It appears in the class declaration.', example: '`class Circle extends Shape`.' },
      apply: { title: 'Prefer composition sometimes', content: 'Inheritance is powerful but can over-couple classes. If the relationship is “has-a” or behavior changes independently, composition is safer.', question: 'When would composition be better than inheritance?', hint: 'Look for reusable parts rather than a true subtype.', example: 'A Car has an Engine; it is not an Engine.' },
    };
  }
  return {
    warmup: { title: `Start with ${topic}`, content: `${topic} is easier to learn when you connect the definition to a concrete example and one common mistake.`, question: `What problem does ${topic} help solve?`, hint: 'Look for the behavior or trade-off the concept controls.', example: `We will define ${topic}, build a mental model, and apply it.` },
    intuition: { title: 'Core intuition', content: `The intuition is to identify the moving parts of ${topic} and how they interact.`, question: 'Which part changes, and which rule stays stable?', hint: 'Separate vocabulary from behavior.', example: 'Draw the parts before memorizing terms.' },
    trick: { title: 'Key trick', content: `Most mistakes happen when students memorize ${topic} without tracing a concrete example.`, question: 'What is the smallest example you can trace?', hint: 'Use a tiny input or object setup.', example: 'Trace state before and after one operation.' },
    formalize: { title: 'Formal rule', content: `A formal explanation names the rule, the constraints, and the edge cases for ${topic}.`, question: 'What edge case would break a shallow understanding?', hint: 'Think about empty inputs, nulls, or boundary cases.', example: 'Write the rule, then test a boundary.' },
    apply: { title: 'Practice it', content: `Apply ${topic} by explaining it, drawing it, and solving one small problem.`, question: 'Can you explain it in one sentence and one example?', hint: 'A good explanation includes purpose and behavior.', example: 'Definition plus example is the minimum study unit.' },
  };
}

function baseSteps(topic) {
  const topicContent = contentForTopic(topic);
  const code = codeForTopic(topic);
  return STEP_META.map((meta, index) => {
    const data = topicContent[meta.id] || topicContent.warmup;
    const includeCode = meta.id === 'apply' || meta.id === 'formalize';
    return {
      id: meta.id,
      label: meta.label,
      status: index === 0 ? 'active' : 'locked',
      title: data.title,
      content: data.content,
      question: data.question,
      hint: data.hint,
      example: data.example,
      code: includeCode ? code : null,
      visual: { type: visualTypeFor(topic), nodes: [], edges: [] },
      sourceRefs: [],
    };
  });
}

function validateStep(step) {
  const text = [step.title, step.content, step.question, step.hint].join(' ');
  if (/\.\.\.|Trace an example|Code sketch|Define the idea|concrete example required/i.test(text)) {
    throw new Error('low_quality_tutor_step');
  }
  if (!step.title || !step.content || step.content.length < 50 || !step.question || !step.hint) {
    throw new Error('incomplete_tutor_step');
  }
  return step;
}

function buildPlan(topic, currentStepIndex = 0) {
  const steps = baseSteps(topic).map((step, index) => ({
    ...step,
    status: index < currentStepIndex ? 'completed' : (index === currentStepIndex ? 'active' : 'locked'),
  }));
  steps.forEach(validateStep);
  return { steps };
}

function legacyPlanToSteps(plan) {
  return (plan && Array.isArray(plan.steps) ? plan.steps : []).map((s, index) => ({
    id: STEP_META[index] ? STEP_META[index].id : `step-${index + 1}`,
    label: s.label || s.t || (STEP_META[index] && STEP_META[index].label) || `Step ${index + 1}`,
    status: s.status || 'locked',
    title: s.title || s.t || `Step ${index + 1}`,
    content: s.content || s.explanation || s.q || '',
    question: s.question || s.q || '',
    hint: s.hint || '',
    example: s.example || '',
    options: s.options || null,
    correct_idx: typeof s.correct_idx === 'number' ? s.correct_idx : null,
    visual: s.visual || { type: 'mindmap', nodes: [], edges: [] },
    code: s.code || null,
    sourceRefs: s.sourceRefs || [],
  }));
}

function ownedMaterial(db, userId, materialId) {
  if (!materialId) return null;
  const material = db.prepare('SELECT * FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!material) throw new HttpError(404, 'material_not_found');
  material.display_title = materialService.displayTitleForMaterial(db, material);
  return material;
}

function createSkeletonSession(userId, payload = {}) {
  const db = getDb();
  const materialId = payload.material_id ? parseInt(payload.material_id, 10) : null;
  if (payload.material_id && !Number.isInteger(materialId)) throw new HttpError(400, 'invalid_material_id');
  const material = ownedMaterial(db, userId, materialId);
  const requested = cleanText(payload.concept || '', 120);
  const mode = ['socratic', 'explain', 'example'].includes(payload.mode) ? payload.mode : 'socratic';
  const initialTopic = isGeneric(requested) ? (material && material.display_title) || 'Resolving topic' : requested || (material && material.display_title) || 'Object-Oriented Programming basics';
  const plan = {
    steps: STEP_META.map((s, i) => ({
      id: s.id,
      label: s.label,
      status: i === 0 ? 'active' : 'locked',
      title: i === 0 ? 'Preparing warm-up' : s.label,
      content: '',
      question: '',
      hint: '',
      example: '',
      visual: { type: 'mindmap', nodes: [], edges: [] },
      sourceRefs: [],
    })),
  };
  const now = nowIso();
  const r = db.prepare(`INSERT INTO tutor_sessions
    (user_id, material_id, concept, mode, plan_json, current_step, started_at, status, topic, source_title, sources_json, trace_json, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, materialId || null, initialTopic, mode, JSON.stringify(plan), 0, now, 'starting', initialTopic, material && material.display_title || '', '[]', '{}', now);
  return { sessionId: r.lastInsertRowid, materialId, mode };
}

function updateSessionProgress(sessionId, patch) {
  const db = getDb();
  const current = db.prepare('SELECT trace_json FROM tutor_sessions WHERE id=?').get(sessionId);
  const trace = { ...parseJson(current && current.trace_json, {}), ...patch.trace };
  db.prepare(`UPDATE tutor_sessions SET status=?, last_error=?, trace_json=?, updated_at=? WHERE id=?`)
    .run(patch.status || 'starting', patch.last_error || null, JSON.stringify(trace), nowIso(), sessionId);
}

async function resolveTopicCached(materialId, hint) {
  const key = `${materialId || 'system'}:${hint || ''}`;
  const hit = cacheGet(cache.topic, key);
  if (hit) return { ...hit, cacheHit: true };
  const info = await topicResolver.resolveTopic({ materialId, hint, feature: 'tutor', minConfidence: 0.2 });
  return cacheSet(cache.topic, key, { ...info, cacheHit: false });
}

async function retrieveContextCached(materialId, topic) {
  const key = `${materialId || 'system'}:${topic}`;
  const hit = cacheGet(cache.rag, key);
  if (hit) return { ...hit, cacheHit: true };
  const ctx = await retrieveLessonContext(materialId || null, topic, { feature: 'tutor', k: 6, minScore: 0.05, maxMerged: 10 });
  return cacheSet(cache.rag, key, { ...ctx, cacheHit: false });
}

function storeSteps(db, sessionId, steps) {
  const upsert = db.prepare(`INSERT INTO tutor_steps
    (session_id, idx, kind, prompt, step_id, step_json, status, source_refs_json, trace_json)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(session_id, step_id) DO UPDATE SET
      idx=excluded.idx,
      prompt=excluded.prompt,
      step_json=excluded.step_json,
      status=excluded.status,
      source_refs_json=excluded.source_refs_json,
      trace_json=excluded.trace_json`);
  db.transaction(() => {
    steps.forEach((step, idx) => {
      upsert.run(sessionId, idx, 'structured', JSON.stringify(step), step.id, JSON.stringify(step), step.status || 'locked', JSON.stringify(step.sourceRefs || []), '{}');
    });
  })();
}

async function runStartJob(userId, sessionId, jobId = null) {
  const db = getDb();
  const started = Date.now();
  const jobUpdate = (patch) => { if (jobId) jobs.update(jobId, patch); };
  try {
    jobUpdate({ status: 'running', progress: 10, result: { session_id: sessionId }, message: 'Starting tutor session...' });
    updateSessionProgress(sessionId, { status: 'starting', trace: { message: 'Starting tutor session...', provider: env.TUTOR_PROVIDER } });
    const session = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
    if (!session) throw new HttpError(404, 'session_not_found');
    const material = ownedMaterial(db, userId, session.material_id);

    jobUpdate({ progress: 25, message: 'Resolving topic...' });
    updateSessionProgress(sessionId, { status: 'resolving_topic', trace: { message: 'Resolving topic...' } });
    const topicStarted = Date.now();
    const topicInfo = await resolveTopicCached(session.material_id, session.concept || (material && material.title));
    const topic = topicInfo.topic || (!isGeneric(session.concept) && session.concept) || 'Object-Oriented Programming basics';

    jobUpdate({ progress: 45, message: 'Retrieving material context...' });
    updateSessionProgress(sessionId, { status: 'retrieving_context', trace: { message: 'Retrieving material context...', topic } });
    const retrievalStarted = Date.now();
    const context = await retrieveContextCached(session.material_id, topic);
    const materialTitle = material && material.display_title || topic;
    const sources = sourceChunksForClient(context.chunks, materialTitle);
    const sourceTitle = sourceTitleFromChunks(context.chunks, topicInfo.sourceTitle || materialTitle);

    jobUpdate({ progress: 75, message: 'Generating warm-up...' });
    updateSessionProgress(sessionId, { status: 'generating_step', trace: { message: 'Generating warm-up...', sourceTitle } });
    const generationStarted = Date.now();
    const plan = buildPlan(topic, 0);
    const sourceRefs = sources.slice(0, 3).map(s => s.id);
    plan.steps = plan.steps.map((step, index) => ({ ...step, sourceRefs: index === 0 ? sourceRefs : [] }));
    const learningMap = learningMaps.buildLearningMap(userId, { materialId: session.material_id, rootTopic: topic });
    const trace = {
      provider: env.TUTOR_PROVIDER,
      model: env.TUTOR_PROVIDER === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL,
      topic,
      topicConfidence: topicInfo.confidence || 0,
      topicSource: topicInfo.topic_source || topicInfo.source || 'resolver',
      sourceTitle,
      retrievalMs: Date.now() - retrievalStarted,
      generationMs: Date.now() - generationStarted,
      topicMs: retrievalStarted - topicStarted,
      totalMs: Date.now() - started,
      groundingTier: groundingTier(context),
      chunksRetrieved: sources.length,
      cacheHit: !!(topicInfo.cacheHit || context.cacheHit),
      fallbackUsed: false,
      warnings: topicInfo.rejectedHint ? [`Ignored generic topic "${topicInfo.rejectedHint}".`] : [],
    };

    db.prepare(`UPDATE tutor_sessions
      SET status='ready', concept=?, topic=?, source_title=?, plan_json=?, sources_json=?, trace_json=?, learning_map_json=?, current_step=0, last_error=NULL, updated_at=?
      WHERE id=? AND user_id=?`)
      .run(topic, topic, sourceTitle, JSON.stringify(plan), JSON.stringify(sources), JSON.stringify(trace), JSON.stringify(learningMap), nowIso(), sessionId, userId);
    storeSteps(db, sessionId, plan.steps);
    jobUpdate({ status: 'completed', progress: 100, result: { session_id: sessionId }, message: 'Tutor session ready.' });
    return getSession(userId, sessionId);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    log.warn('tutor_start_failed', message);
    db.prepare('UPDATE tutor_sessions SET status=?, last_error=?, trace_json=?, updated_at=? WHERE id=? AND user_id=?')
      .run('failed', message, JSON.stringify({ provider: env.TUTOR_PROVIDER, error: message, totalMs: Date.now() - started }), nowIso(), sessionId, userId);
    jobUpdate({ status: 'failed', progress: 100, error: message, result: { session_id: sessionId }, message: 'Tutor session failed.' });
    throw err;
  }
}

function getSession(userId, sessionId) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
  if (!s) throw new HttpError(404, 'session_not_found');
  const plan = parseJson(s.plan_json, { steps: [] });
  const steps = plan.steps && plan.steps[0] && plan.steps[0].id ? plan.steps : legacyPlanToSteps(plan);
  const notes = db.prepare('SELECT id, body, flashcard_worthy, created_at, step_id, note_kind, source_refs_json FROM tutor_notes WHERE session_id=? ORDER BY created_at').all(s.id)
    .map(n => ({ ...n, sourceRefs: parseJson(n.source_refs_json, []) }));
  return {
    sessionId: s.id,
    session_id: s.id,
    materialId: s.material_id,
    material_id: s.material_id,
    topic: s.topic || s.concept,
    concept: s.topic || s.concept,
    sourceTitle: s.source_title || '',
    mode: s.mode,
    status: s.status || 'ready',
    currentStepIndex: s.current_step || 0,
    current_step: s.current_step || 0,
    steps,
    plan: { steps, source_chunks: parseJson(s.sources_json, []) },
    sources: parseJson(s.sources_json, []),
    source_chunks: parseJson(s.sources_json, []),
    notes,
    trace: parseJson(s.trace_json, {}),
    learningMap: parseJson(s.learning_map_json, null),
    started_at: s.started_at,
    ended_at: s.ended_at,
    error: s.last_error || null,
  };
}

function getStatus(userId, sessionId) {
  const db = getDb();
  const s = db.prepare('SELECT id, status, current_step, last_error, trace_json FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
  if (!s) throw new HttpError(404, 'session_not_found');
  const status = s.status || 'ready';
  const progressMap = { starting: 10, resolving_topic: 25, retrieving_context: 45, generating_step: 75, ready: 100, failed: 100 };
  const messageMap = {
    starting: 'Starting tutor session...',
    resolving_topic: 'Resolving the real topic...',
    retrieving_context: 'Retrieving material context...',
    generating_step: 'Generating warm-up question...',
    ready: 'Tutor session ready.',
    failed: 'Could not start tutor session.',
  };
  return {
    sessionId: s.id,
    status,
    progress: progressMap[status] || 0,
    message: messageMap[status] || status,
    error: s.last_error || null,
    currentStepIndex: s.current_step || 0,
    trace: parseJson(s.trace_json, {}),
  };
}

function continueSession(userId, sessionId, payload = {}) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
  if (!s) throw new HttpError(404, 'session_not_found');
  if ((s.status || 'ready') !== 'ready') throw new HttpError(409, 'session_not_ready');
  const plan = parseJson(s.plan_json, { steps: [] });
  const steps = plan.steps && plan.steps[0] && plan.steps[0].id ? plan.steps : legacyPlanToSteps(plan);
  const idx = Math.max(0, Math.min(Number(s.current_step || 0), steps.length - 1));
  const current = steps[idx];
  const answer = cleanText(payload.answer || payload.text || '', 500);
  const choice = typeof payload.choice === 'number' ? payload.choice : null;
  const hasMcq = Array.isArray(current.options) && typeof current.correct_idx === 'number';
  const correct = hasMcq && choice != null ? choice === current.correct_idx : (answer ? answer.length >= 8 : true);
  let stay = false;
  let feedback;
  if (answer && answer.length < 8 && !hasMcq) {
    stay = true;
    feedback = `Good start. Add one concrete detail: ${current.hint || 'connect the idea to the example before moving on.'}`;
  } else if (hasMcq && choice != null && !correct) {
    stay = true;
    feedback = current.explanation || current.hint || 'Not quite. Re-check the example and try again.';
  } else if (answer) {
    feedback = `Nice. Your answer connects to the key idea: ${current.content}`;
  } else {
    feedback = `Let's keep going. Remember: ${current.hint || current.content}`;
  }
  const nextIndex = stay ? idx : Math.min(idx + 1, steps.length - 1);
  const updatedSteps = steps.map((step, i) => ({
    ...step,
    status: i < nextIndex ? 'completed' : (i === nextIndex ? 'active' : 'locked'),
  }));
  db.prepare('UPDATE tutor_sessions SET current_step=?, plan_json=?, updated_at=? WHERE id=?')
    .run(nextIndex, JSON.stringify({ ...plan, steps: updatedSteps }), nowIso(), sessionId);
  storeSteps(db, sessionId, updatedSteps);
  db.prepare('UPDATE tutor_steps SET answer_json=?, feedback_md=?, status=? WHERE session_id=? AND idx=?')
    .run(JSON.stringify({ answer, choice }), feedback, stay ? 'active' : 'completed', sessionId, idx);
  recordConceptOutcome(userId, s.topic || s.concept, !!correct, { correctDelta: correct ? 4 : 0, incorrectDelta: correct ? 0 : -3 });
  const trace = { ...parseJson(s.trace_json, {}), lastContinueMs: 0, lastAnswerWeak: stay };
  db.prepare('UPDATE tutor_sessions SET trace_json=? WHERE id=?').run(JSON.stringify(trace), sessionId);
  return {
    feedback,
    correct,
    nextStep: updatedSteps[nextIndex],
    steps: updatedSteps,
    currentStepIndex: nextIndex,
    trace,
  };
}

function createStartJob(userId, sessionId) {
  const job = jobs.create('tutor_session_start', { userId, sessionId });
  setImmediate(() => {
    runStartJob(userId, sessionId, job.id).catch(() => {});
  });
  return job;
}

module.exports = {
  createSkeletonSession,
  createStartJob,
  runStartJob,
  getSession,
  getStatus,
  continueSession,
  sourceChunksForClient,
  buildPlan,
  _internals: { isGeneric, cache, validateStep, contentForTopic },
};
