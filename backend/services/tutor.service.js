'use strict';

const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const jobs = require('./jobs.service');
const { HttpError } = require('../middleware/error');
const { retrieveLessonContext, groundingTier } = require('./rag.service');
const topicResolver = require('./topic-resolver.service');
const materialUnderstanding = require('./material-understanding.service');
const learningMaps = require('./learning-map.service');
const materialService = require('./material.service');
const domainDetection = require('./domain-detection.service');
const sourceGroundingJudge = require('./source-grounding-judge.service');
const sourceTopicPlans = require('./source-topic-plan.service');
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

function parseKeywords(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function topicFromMaterialSource(userId, materialId, hint, fallback, domainInfo) {
  const understanding = materialUnderstanding.understandGeneralFromDb(userId, materialId, {
    explicitQuery: hint,
    title: fallback,
    hint,
    domainInfo,
    limit: 24,
  });
  return {
    topic: understanding.topic || cleanText(fallback, 120) || 'Uploaded Material',
    confidence: understanding.confidence || 0.3,
    source: understanding.source || 'material_source_terms',
    alternatives: understanding.alternatives || [],
    understanding,
  };
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
      sourceKind: c.source_kind || c.sourceKind || 'text',
      sourceVisualId: c.source_visual_id || c.sourceVisualId || null,
    };
  });
}

function visualTypeFor(topic) {
  const t = String(topic || '').toLowerCase();
  if (t.includes('polymorphism')) return 'polymorphism_dispatch';
  if (t.includes('inheritance')) return 'inheritance_tree';
  if (t.includes('linked')) return 'linkedlist';
  if (t.includes('hash')) return 'hash_table';
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
  if (t.includes('hash')) {
    return {
      language: 'java',
      content: [
        'int index = (key.hashCode() & 0x7fffffff) % table.length;',
        'Entry current = table[index];',
        'while (current != null) {',
        '  if (current.key.equals(key)) return current.value;',
        '  current = current.next;',
        '}',
      ].join('\n'),
      walkthrough: [
        { lineRange: '1', text: 'The hash code is converted into a valid bucket index.' },
        { lineRange: '2', text: 'Lookup jumps directly to that bucket.' },
        { lineRange: '3-5', text: 'A collision chain is scanned until the exact key is found.' },
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
  if (t.includes('bst') || t.includes('binary search tree')) {
    return {
      language: 'java',
      content: [
        'Node insert(Node root, int value) {',
        '  if (root == null) return new Node(value);',
        '  if (value < root.value) root.left = insert(root.left, value);',
        '  else if (value > root.value) root.right = insert(root.right, value);',
        '  return root;',
        '}',
      ].join('\n'),
      walkthrough: [
        { lineRange: '2', text: 'An empty spot becomes the new node.' },
        { lineRange: '3', text: 'Smaller values move into the left subtree.' },
        { lineRange: '4', text: 'Larger values move into the right subtree.' },
      ],
    };
  }
  if (t.includes('big-o') || t.includes('big o') || t.includes('complexity')) {
    return {
      language: 'java',
      content: [
        'for (int i = 0; i < n; i++) {',
        '  System.out.println(items[i]);',
        '}',
        '',
        'for (int i = 0; i < n; i++) {',
        '  for (int j = 0; j < n; j++) compare(i, j);',
        '}',
      ].join('\n'),
      walkthrough: [
        { lineRange: '1-3', text: 'One loop grows linearly, so it is O(n).' },
        { lineRange: '5-7', text: 'Nested loops multiply work, so they are O(n^2).' },
      ],
    };
  }
  return null;
}

function contentFromUnderstanding(topic, understanding = {}) {
  const keyConcepts = Array.isArray(understanding.keyConcepts) && understanding.keyConcepts.length
    ? understanding.keyConcepts.slice(0, 6)
    : [topic].filter(Boolean);
  const excerpts = Array.isArray(understanding.representativeExcerpts) && understanding.representativeExcerpts.length
    ? understanding.representativeExcerpts
    : (Array.isArray(understanding.sourceEvidence) ? understanding.sourceEvidence.map(item => item && item.quote).filter(Boolean) : []);
  const primary = keyConcepts[0] || topic || 'the uploaded material';
  const secondary = keyConcepts[1] || keyConcepts[0] || topic || 'the next key idea';
  const excerpt = excerpts[0] || `The source frames ${topic} through ${keyConcepts.slice(0, 3).join(', ') || 'its key ideas'}.`;
  const conceptList = keyConcepts.slice(0, 5).join(', ') || topic || 'the source concepts';
  return {
    warmup: {
      title: `Start with ${primary}`,
      content: `${topic} is best learned from the uploaded material by anchoring on ${primary}. The source gives you concrete details first, then the tutor can help connect those details into a study-ready explanation.`,
      question: `What does the source say is most important about ${primary}?`,
      hint: `Start from this source detail: ${cleanText(excerpt, 220)}`,
      example: `Use the source excerpt as your first example, then explain why ${primary} matters.`,
    },
    intuition: {
      title: 'How the ideas fit',
      content: `The intuition is to connect ${conceptList}. Instead of memorizing labels, look for the relationship: which concept defines the issue, which one explains the mechanism, and which one shows the consequence.`,
      question: `How does ${primary} connect to ${secondary}?`,
      hint: 'Look for cause, contrast, sequence, or purpose in the source wording.',
      example: excerpts[1] || `Make a small concept map with ${primary} in the center and the supporting terms around it.`,
    },
    trick: {
      title: 'Common confusion',
      content: `A common confusion is treating the headings as isolated vocabulary. For this material, the safer move is to explain how each source term changes the meaning of the next one.`,
      question: 'Which term would be easy to memorize but hard to apply?',
      hint: 'Pick the most abstract term and attach it to a concrete source detail.',
      example: excerpts[2] || `Turn ${secondary} into a short scenario, example, event, or case from the material.`,
    },
    formalize: {
      title: 'Study-ready explanation',
      content: `A complete answer about ${topic} should define the main idea, name the key source concepts, explain one relationship among them, and include one concrete detail from the uploaded material.`,
      question: `What would a complete answer about ${topic} need to include?`,
      hint: `Use this order: define ${primary}, connect it to ${secondary}, then cite one source detail.`,
      example: `Definition plus relationship plus source example is the minimum study unit.`,
    },
    apply: {
      title: 'Apply it',
      content: `Now apply the material by using ${conceptList} to analyze a short case, event, problem, or decision from the subject. The goal is to prove you can use the idea, not just repeat the heading.`,
      question: `Can you create one source-based example or checkpoint question for ${topic}?`,
      hint: 'Use the exact source terms, then ask what changes, why it matters, or what mistake to avoid.',
      example: excerpts[3] || `Create a mini case from the uploaded material and explain the result using ${primary}.`,
    },
  };
}

function contentForTopic(topic, understanding = null) {
  const t = String(topic || '').toLowerCase();
  if (understanding && topicKind(topic) === 'general') return contentFromUnderstanding(topic, understanding);
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
  if (t.includes('hash')) {
    return {
      warmup: {
        title: 'Key to bucket',
        content: 'A hash table stores key-value pairs by computing a bucket index from the key. The goal is to avoid scanning every entry when you look up one key.',
        question: 'What are the two steps between a key and the bucket where it should be searched?',
        hint: 'First compute a hash, then map it into the array range.',
        example: '`index = hash(key) % bucketCount`.',
      },
      intuition: {
        title: 'Collision reality',
        content: 'Different keys can land in the same bucket. That is a collision, and a real hash table must handle it with a chain, probing, or another strategy.',
        question: 'Why does a hash table compare keys even after computing the hash?',
        hint: 'A hash narrows the search, but it is not guaranteed unique.',
        example: '`cat` and `cot` might share bucket 2, so equals decides which entry matches.',
      },
      trick: {
        title: 'Load factor',
        content: 'The load factor is size divided by bucket count. When it grows too high, buckets become crowded, so the table resizes and rehashes entries.',
        question: 'What happens to expected O(1) lookup if load factor keeps growing?',
        hint: 'Crowded buckets mean more collision work.',
        example: 'A table of 8 buckets and 6 entries has load factor 0.75.',
      },
      formalize: {
        title: 'Expected versus worst case',
        content: 'Lookup, insertion, and deletion are expected O(1) with a good hash function and controlled load factor. Worst case is O(n) when many keys collide into the same search path.',
        question: 'Why is O(1) called expected instead of guaranteed?',
        hint: 'Consider all keys landing in one bucket.',
        example: 'One bucket with n collided entries behaves like a linear scan.',
      },
      apply: {
        title: 'Trace lookup',
        content: 'To trace lookup, compute the bucket index, open that bucket, compare keys, and continue through the collision chain or probe sequence until you find the key or prove it is absent.',
        question: 'When should lookup stop in a separate-chaining table?',
        hint: 'Either the key is found or the chain ends.',
        example: '`bucket 2 -> (cat,41) -> (cot,19) -> null`.',
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
    warmup: { title: `Start with ${topic}`, content: `${topic} is easier to learn when you connect the main definition to the specific examples and vocabulary in the uploaded material.`, question: `What problem, decision, or idea does ${topic} help explain?`, hint: 'Look for the purpose the source gives before memorizing terms.', example: `Use one source example to explain why ${topic} matters.` },
    intuition: { title: 'Core intuition', content: `The intuition is to identify the key terms in ${topic}, then describe how they relate to each other in plain language.`, question: 'Which idea is central, and which details support it?', hint: 'Separate the main claim from examples, labels, and supporting facts.', example: 'Turn the source heading into a one-sentence explanation.' },
    trick: { title: 'Common confusion', content: `Most mistakes happen when students memorize words from ${topic} without connecting them to a concrete scenario from the material.`, question: 'What is one example that would make the idea less abstract?', hint: 'Use a familiar situation, case, or decision from the source.', example: 'Explain the concept with a real case, then name the likely misconception.' },
    formalize: { title: 'Study-ready rule', content: `A strong explanation of ${topic} names the concept, gives its purpose, and shows one consequence or application from the material.`, question: 'What would a complete exam answer need to include?', hint: 'Include definition, purpose, and one concrete detail.', example: 'Definition plus source-based example is the minimum study unit.' },
    apply: { title: 'Practice it', content: `Apply ${topic} by summarizing it, mapping the important terms, and answering one checkpoint question about how it works in context.`, question: 'Can you explain it in one sentence and one example?', hint: 'A good explanation includes purpose, evidence, and a small application.', example: 'Use the uploaded material to create a mini scenario and explain the outcome.' },
  };
}

function baseSteps(topic, opts = {}) {
  const topicContent = contentForTopic(topic, opts.understanding || null);
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

function buildPlan(topic, currentStepIndex = 0, opts = {}) {
  const steps = baseSteps(topic, opts).map((step, index) => ({
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
  const initialTopic = isGeneric(requested) ? (material && material.display_title) || 'Resolving topic' : requested || (material && material.display_title) || 'Uploaded Material';
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

async function retrieveContextCached(materialId, topic, opts = {}) {
  const includeSystem = opts.includeSystem !== false;
  const key = `${materialId || 'system'}:${topic}:system:${includeSystem ? 1 : 0}`;
  const hit = cacheGet(cache.rag, key);
  if (hit) return { ...hit, cacheHit: true };
  const ctx = await retrieveLessonContext(materialId || null, topic, { feature: 'tutor', k: 6, minScore: 0.05, maxMerged: 10, includeSystem });
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
    const domainInfo = session.material_id
      ? domainDetection.detectMaterialDomain(userId, session.material_id, { hint: session.concept || (material && material.title) })
      : { domain: 'general', confidence: 0.3, evidence: [], source: 'system' };
    const useCuratedCs = domainDetection.shouldUseCuratedCs(domainInfo);
    const topicInfo = useCuratedCs
      ? await resolveTopicCached(session.material_id, session.concept || (material && material.title))
      : topicFromMaterialSource(userId, session.material_id, session.concept, material && (material.display_title || material.title), domainInfo);
    let sourceTopic = topicInfo.topic || (!isGeneric(session.concept) && session.concept) || (material && (material.display_title || material.title));
    let topic = cleanText(sourceTopic, 120) || 'Uploaded Material';

    jobUpdate({ progress: 45, message: 'Retrieving material context...' });
    updateSessionProgress(sessionId, { status: 'retrieving_context', trace: { message: 'Retrieving material context...', topic } });
    const retrievalStarted = Date.now();
    let context = await retrieveContextCached(session.material_id, topic, { includeSystem: useCuratedCs });
    let materialTitle = material && material.display_title || topic;
    let sources = sourceChunksForClient(context.chunks, materialTitle);
    let sourceTitle = sourceTitleFromChunks(context.chunks, topicInfo.sourceTitle || materialTitle);
    let tutorChunks = context.uploaded && Array.isArray(context.uploaded.chunks) ? context.uploaded.chunks : context.chunks;
    let sourceOutline = session.material_id
      ? materialUnderstanding.buildSourceOutline(tutorChunks, {
        explicitQuery: session.concept,
        hint: topic,
        title: material && material.title,
        materialTitle: materialTitle,
        domainInfo,
      })
      : null;
    let sourceTopicPlan = session.material_id
      ? sourceTopicPlans.buildSourceTopicPlan({
        materialId: session.material_id,
        materialTitle,
        sourceScope: 'material',
        explicitTopic: session.concept,
        requestedTopic: topic,
        domainInfo,
        chunks: tutorChunks,
        sourceOutline,
        maxBalancedChunks: 24,
      })
      : null;
    let topicVerifier = sourceGroundingJudge.judge({
      feature: 'tutor',
      stage: 'pre_generation',
      materialId: session.material_id,
      resolvedTopic: topic,
      requestedTopic: session.concept,
      domainInfo,
      sourceOutline,
      materialUnderstanding: topicInfo.understanding || null,
      chunks: tutorChunks,
      sourceTopicPlan,
      attempt: 0,
    });
    if (topicVerifier.decision === sourceGroundingJudge.DECISIONS.RETRY && topicVerifier.correctedTopic) {
      topic = cleanText(topicVerifier.correctedTopic, 120) || topic;
      sourceTopic = topic;
      context = await retrieveContextCached(session.material_id, topic, { includeSystem: useCuratedCs });
      materialTitle = material && material.display_title || topic;
      sources = sourceChunksForClient(context.chunks, materialTitle);
      sourceTitle = sourceTitleFromChunks(context.chunks, topicInfo.sourceTitle || materialTitle);
      tutorChunks = context.uploaded && Array.isArray(context.uploaded.chunks) ? context.uploaded.chunks : context.chunks;
      sourceOutline = session.material_id
        ? materialUnderstanding.buildSourceOutline(tutorChunks, {
          explicitQuery: session.concept,
          hint: topic,
          title: material && material.title,
          materialTitle,
          domainInfo,
        })
        : null;
      sourceTopicPlan = session.material_id
        ? sourceTopicPlans.buildSourceTopicPlan({
          materialId: session.material_id,
          materialTitle,
          sourceScope: 'material',
          explicitTopic: session.concept,
          requestedTopic: topic,
          domainInfo,
          chunks: tutorChunks,
          sourceOutline,
          maxBalancedChunks: 24,
        })
        : null;
      topicVerifier = sourceGroundingJudge.judge({
        feature: 'tutor',
        stage: 'pre_generation',
        materialId: session.material_id,
        resolvedTopic: topic,
        requestedTopic: session.concept,
        domainInfo,
        sourceOutline,
        materialUnderstanding: topicInfo.understanding || null,
        chunks: tutorChunks,
        sourceTopicPlan,
        attempt: 1,
      });
    }
    if (topicVerifier.decision === sourceGroundingJudge.DECISIONS.BLOCK) {
      throw new HttpError(422, 'generation_verifier_blocked', 'The tutor could not verify a safe source topic for this material.', { verifier: topicVerifier });
    }

    jobUpdate({ progress: 75, message: 'Generating warm-up...' });
    updateSessionProgress(sessionId, { status: 'generating_step', trace: { message: 'Generating warm-up...', sourceTitle } });
    const generationStarted = Date.now();
    const plan = buildPlan(topic, 0, { understanding: topicInfo.understanding || null });
    const sourceRefs = sources.slice(0, 3).map(s => s.id);
    plan.steps = plan.steps.map((step, index) => ({ ...step, sourceRefs: index === 0 ? sourceRefs : [] }));
    const learningMap = learningMaps.buildLearningMap(userId, { materialId: session.material_id, rootTopic: topic });
    const trace = {
      provider: env.TUTOR_PROVIDER,
      model: env.TUTOR_PROVIDER === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL,
      topic,
      topicConfidence: topicInfo.confidence || 0,
      topicSource: topicInfo.topic_source || topicInfo.source || 'resolver',
      domain: domainInfo,
      materialUnderstanding: topicInfo.understanding || null,
      verifier: {
        pre: topicVerifier,
      },
      sourceTopicPlan: sourceTopicPlan ? {
        topicMode: sourceTopicPlan.topicMode,
        primaryTopic: sourceTopicPlan.primaryTopic,
        topicBundle: sourceTopicPlan.topicBundle,
        allowedTopics: sourceTopicPlan.allowedTopics,
      } : null,
      curatedCs: useCuratedCs,
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
  const baseSteps = plan.steps && plan.steps[0] && plan.steps[0].id ? plan.steps : legacyPlanToSteps(plan);
  const stepRows = db.prepare('SELECT idx, step_id, answer_json, feedback_md, status FROM tutor_steps WHERE session_id=? ORDER BY idx').all(s.id);
  const stepState = new Map(stepRows.map(row => [row.step_id || String(row.idx), row]));
  const steps = baseSteps.map((step, idx) => {
    const row = stepState.get(step.id) || stepState.get(String(idx));
    const answerState = parseJson(row && row.answer_json, null);
    return {
      ...step,
      status: row && row.status || step.status,
      learnerAnswer: answerState && answerState.answer || '',
      learnerChoice: answerState && answerState.choice,
      lastIntent: answerState && answerState.intent || '',
      feedback: row && row.feedback_md || step.feedback || '',
      feedback_md: row && row.feedback_md || step.feedback_md || '',
    };
  });
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

function tutorSourcesForFeedback(s) {
  return parseJson(s.sources_json, []).map((c, i) => ({
    id: c.id || c.chunkId || i + 1,
    text: c.excerpt || c.text || '',
  })).filter(c => c.text);
}

function normalizeTutorAction(payload = {}, answer = '', choice = null) {
  const raw = String(payload.action || payload.intent || '').trim().toLowerCase();
  const map = {
    confused: 'im_confused',
    im_confused: 'im_confused',
    "i'm confused": 'im_confused',
    example: 'give_example',
    give_example: 'give_example',
    check: 'check_answer',
    check_answer: 'check_answer',
    advance: 'continue',
    continue: 'continue',
  };
  if (map[raw]) return map[raw];
  if (choice != null || answer) return 'check_answer';
  return 'continue';
}

function normalizeTutorMode(value) {
  return ['socratic', 'explain', 'example'].includes(value) ? value : 'socratic';
}

function topicKind(topic) {
  const text = String(topic || '').toLowerCase();
  if (/(encapsulation|inheritance|polymorphism|abstraction|class|object|oop)/.test(text)) return 'oop';
  if (/(linked list|node|stack|queue|tree|hash|heap|graph|data structure)/.test(text)) return 'ds';
  if (/(algorithm|binary search|linear search|sorting|big-o|big o|complexity)/.test(text)) return 'algorithm';
  return 'general';
}

function bankAccountExample() {
  return [
    'Here is a real encapsulation example with a `BankAccount`.',
    '',
    '```java',
    'class BankAccount {',
    '  private double balance;',
    '',
    '  public BankAccount(double openingBalance) {',
    '    if (openingBalance < 0) throw new IllegalArgumentException("negative opening balance");',
    '    balance = openingBalance;',
    '  }',
    '',
    '  public void deposit(double amount) {',
    '    if (amount <= 0) throw new IllegalArgumentException("deposit must be positive");',
    '    balance += amount;',
    '  }',
    '',
    '  public boolean withdraw(double amount) {',
    '    if (amount <= 0 || amount > balance) return false;',
    '    balance -= amount;',
    '    return true;',
    '  }',
    '',
    '  public double getBalance() { return balance; }',
    '}',
    '```',
    '',
    'Line by line: `private balance` blocks outside code from setting impossible values like `-500`. `deposit` and `withdraw` are the controlled public doors. Each method validates the request before changing state. The common mistake is making `balance` public, because then any caller can bypass the rules.',
  ].join('\n');
}

function topicExample(topic, current) {
  const kind = topicKind(topic);
  const lower = String(topic || '').toLowerCase();
  if (lower.includes('encapsulation')) return bankAccountExample();
  if (lower.includes('polymorphism')) {
    return [
      'Concrete polymorphism example:',
      '',
      '```java',
      'Shape s = new Circle();',
      's.draw();        // runs Circle.draw()',
      's = new Rectangle();',
      's.draw();        // runs Rectangle.draw()',
      '```',
      '',
      'The variable type is `Shape`, but Java chooses the overridden method from the actual runtime object. A common mistake is thinking the reference type alone decides the method.',
    ].join('\n');
  }
  if (lower.includes('linked')) {
    return [
      'Concrete linked-list insertion example:',
      '',
      '```java',
      'Node newNode = new Node(value);',
      'newNode.next = current.next;',
      'current.next = newNode;',
      '```',
      '',
      'The order matters. First create the node, then save the old next pointer, then redirect `current.next`. If you skip the second line, the rest of the list can become unreachable.',
    ].join('\n');
  }
  if (lower.includes('inheritance')) {
    return [
      'Concrete inheritance example:',
      '',
      '```java',
      'class Shape {',
      '  double area() { return 0; }',
      '}',
      '',
      'class Circle extends Shape {',
      '  double radius;',
      '  Circle(double radius) { this.radius = radius; }',
      '  @Override double area() { return Math.PI * radius * radius; }',
      '}',
      '```',
      '',
      '`Circle extends Shape` means Circle is a specialized Shape. The common mistake is using inheritance for a has-a relationship, like saying a Car extends Engine instead of a Car having an Engine.',
    ].join('\n');
  }
  if (lower.includes('stack')) {
    return [
      'Concrete stack example:',
      '',
      '```java',
      'Stack<String> history = new Stack<>();',
      'history.push("typed A");',
      'history.push("typed B");',
      'String last = history.pop(); // "typed B"',
      '```',
      '',
      'A stack is LIFO: the last thing pushed is the first thing popped. A common mistake is treating it like a queue and expecting the oldest item to leave first.',
    ].join('\n');
  }
  if (lower.includes('queue')) {
    return [
      'Concrete queue example:',
      '',
      '```java',
      'Queue<String> line = new ArrayDeque<>();',
      'line.add("A");',
      'line.add("B");',
      'String first = line.remove(); // "A"',
      '```',
      '',
      'A queue is FIFO: the first item added is the first removed. A common mistake is removing from the rear, which breaks queue order.',
    ].join('\n');
  }
  if (lower.includes('bst') || lower.includes('binary search tree')) {
    return [
      'Concrete BST insertion example:',
      '',
      '```java',
      'Node insert(Node root, int value) {',
      '  if (root == null) return new Node(value);',
      '  if (value < root.value) root.left = insert(root.left, value);',
      '  else if (value > root.value) root.right = insert(root.right, value);',
      '  return root;',
      '}',
      '```',
      '',
      'Each comparison chooses left or right. The common mistake is forgetting that the BST rule must hold for every subtree, not just the root.',
    ].join('\n');
  }
  if (lower.includes('big-o') || lower.includes('big o') || lower.includes('complexity')) {
    return [
      'Concrete Big-O example:',
      '',
      '```java',
      'for (int i = 0; i < n; i++) print(items[i]);     // O(n)',
      '',
      'for (int i = 0; i < n; i++)',
      '  for (int j = 0; j < n; j++) compare(i, j);    // O(n^2)',
      '```',
      '',
      'Big-O describes how work grows as input grows. A common mistake is counting exact milliseconds instead of the growth pattern.',
    ].join('\n');
  }
  if (kind === 'oop' || kind === 'ds') {
    return `${current.example || current.content}\n\nFor this kind of topic, trace one tiny state change and name the rule before and after the change. The common mistake is memorizing the term without checking what changes in the object or structure.`;
  }
  return `${current.example || current.content}\n\nMini example: pick one input, apply the rule once, then explain what changed and why that change was allowed.`;
}

function modePrefix(mode, action) {
  if (mode === 'socratic' && action !== 'give_example') return 'Let me guide you rather than dump the answer:';
  if (mode === 'example') return 'I will anchor this in a concrete example:';
  return 'Here is the clear version:';
}

function modeSystemPrompt(mode, topic = '') {
  const kind = topicKind(topic);
  if (mode === 'socratic') return [
    'You are a Socratic tutor. NEVER give the full answer directly.',
    '- Ask one guiding question at a time.',
    '- Give a hint if the learner is stuck.',
    '- Check understanding before moving forward.',
    '- Build toward the answer step by step.',
    '- End with a checkpoint question.',
  ].join('\n');
  if (mode === 'example') return [
    'You are an example-first tutor.',
    kind === 'general'
      ? '- Lead with a concrete scenario or source-based example immediately.'
      : '- Lead with a concrete, runnable code example immediately.',
    kind === 'general'
      ? '- Explain each part of the example step by step.'
      : '- Explain each line of the code.',
    '- Connect the example back to the concept.',
    '- Mention one common mistake.',
    kind === 'general'
      ? '- End with: "Try applying this: [specific challenge]"'
      : '- End with: "Try modifying this: [specific challenge]"',
  ].join('\n');
  return [
    'You are a clear, direct tutor explaining concepts.',
    '- Start with a concise definition.',
    '- Use a real-world analogy.',
    '- Give a concrete code example only for OOP/Data Structures/Algorithms topics.',
    '- For other subjects, give a concrete scenario or case instead of code.',
    '- Walk through the example step by step.',
    '- End with a checkpoint: ask one question to verify understanding.',
  ].join('\n');
}

function actionPromptSection(action, topic = '') {
  const kind = topicKind(topic);
  if (action === 'im_confused') return [
    'The learner is confused. Respond by:',
    '1. Restate the concept in simpler terms (no jargon).',
    '2. Use one everyday analogy.',
    '3. Break it into 2-3 tiny steps.',
    '4. Ask ONE simple yes/no or fill-in-the-blank question.',
  ].join('\n');
  if (action === 'give_example') return [
    kind === 'general'
      ? 'Give a concrete, source-based scenario or example. Do not include code unless the uploaded material is actually about programming.'
      : 'Give a REAL, complete code example. For OOP topics use Java.',
    kind === 'general'
      ? 'Include the setup, the decision or action, and the result.'
      : 'Include: class definition, method, and a main() that demonstrates the concept.',
    'Explain each part. Connect to the concept. Mention one common mistake.',
  ].join('\n');
  if (action === 'check_answer') return [
    'Evaluate the learner\'s answer:',
    '1. What is CORRECT in their answer.',
    '2. What is MISSING or incomplete.',
    '3. Give the improved/complete answer.',
    '4. Suggest the next step.',
  ].join('\n');
  return [
    'Advance to the next meaningful step in the lesson.',
    'Do NOT repeat what was just covered. Build on it.',
    'Introduce the next sub-topic or a harder variant.',
  ].join('\n');
}

function tutorActionLabel(action) {
  return {
    im_confused: "I'm confused",
    give_example: 'Give an example',
    check_answer: 'Check my answer',
    continue: 'Continue',
  }[action] || 'Tutor turn';
}

function turnAvatarState(action, stay, correct) {
  if (action === 'check_answer' && !correct) return 'listening';
  if (action === 'im_confused') return 'speaking';
  if (action === 'give_example') return 'speaking';
  if (action === 'continue' && !stay) return 'speaking';
  return stay ? 'listening' : 'speaking';
}

function parseStructuredTutorJson(value) {
  const raw = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!/^\{/.test(raw)) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function responseTypeForAction(action) {
  if (action === 'give_example') return 'example';
  if (action === 'check_answer') return 'feedback';
  if (action === 'im_confused') return 'hint';
  if (action === 'continue') return 'next_step';
  return 'explanation';
}

function structuredResponseFromFeedback(feedback, { action, topic, current }) {
  const parsed = parseStructuredTutorJson(feedback);
  if (parsed) return parsed;
  const code = action === 'give_example' || action === 'continue' ? codeForTopic(topic) : null;
  return {
    type: responseTypeForAction(action),
    title: action === 'give_example'
      ? `Example: ${topic}`
      : (action === 'im_confused' ? 'Simpler version' : (current && current.title) || topic || 'Tutor response'),
    explanation: feedback,
    question: current && current.question || '',
    hint: action === 'im_confused' ? (current && current.hint || '') : '',
    example: action === 'give_example' ? (current && current.example || '') : '',
    code,
    visual: { type: visualTypeFor(topic), nodes: [], edges: [], caption: topic || '' },
    sources: [],
    trace: {},
  };
}

function deterministicFeedback({ action, mode, topic, current, answer, hasMcq, correct }) {
  const prefix = modePrefix(mode, action);
  if (action === 'im_confused') {
    return {
      feedback: [
        `${prefix} ${current.title || 'this idea'} is one rule plus one example.`,
        `Simpler version: ${current.hint || current.content}`,
        `Analogy: think of it like a checklist. Each item helps you see whether the idea fits the situation.`,
        `Mini example: ${current.example || topicExample(topic, current).split('\n')[0]}`,
        `One small check: ${current.question || 'Which part is unclear: the definition, the example, or the application?'}`,
      ].join('\n\n'),
      professorCue: 'listening',
      followUpQuestion: current.question || 'Which part feels unclear: the definition, the example, or the application?',
    };
  }
  if (action === 'give_example') {
    return {
      feedback: `${prefix}\n\n${topicExample(topic, current)}\n\nNow connect it back: ${current.content}`,
      professorCue: 'explaining',
      followUpQuestion: current.question || 'Can you now describe the rule in your own words?',
    };
  }
  if (action === 'continue') {
    return {
      feedback: `${prefix} we are ready to move on. Keep this checkpoint in mind: ${current.hint || current.content}`,
      professorCue: 'thinking',
      followUpQuestion: 'Watch how the next step builds on this one.',
    };
  }
  if (action === 'check_answer' && !answer && !hasMcq) {
    return {
      feedback: `I need a short answer before I can check it. Write one sentence with the rule you think applies, then add one concrete detail from the example. I will tell you what is correct, what is missing, and how to sharpen it.`,
      professorCue: 'listening',
      followUpQuestion: current.question || 'What is your best one-sentence answer?',
    };
  }
  if (answer && answer.length < 8 && !hasMcq) {
    return {
      feedback: `Good start, but it is too thin to check deeply yet. What is correct: you are pointing at the right topic. What is missing: one concrete detail or example. Better answer: ${current.hint || 'name the rule, then connect it to the example before moving on.'}`,
      professorCue: 'listening',
      followUpQuestion: current.question || 'What detail would make your answer more precise?',
    };
  }
  if (hasMcq && !correct) {
    return {
      feedback: `Not quite. What is correct: you tried to apply the current rule. What is missing: this choice does not match the example's behavior. Correction: ${current.explanation || current.hint || 're-check the example and choose the option that follows the rule.'}`,
      professorCue: 'listening',
      followUpQuestion: current.question || 'Try choosing again after using the hint.',
    };
  }
  if (answer) {
    return {
      feedback: `Nice. What is correct: your answer gives enough substance to connect with the key idea. What to sharpen: make the rule explicit. Better answer: ${current.content} Next step: apply that rule to a concrete example.`,
      professorCue: 'explaining',
      followUpQuestion: 'Ready for the next step?',
    };
  }
  return {
    feedback: `${prefix} ${current.content}\n\nCheckpoint: ${current.question || current.hint || 'Try to explain the rule in your own words.'}`,
    professorCue: 'thinking',
    followUpQuestion: 'Watch how the next step builds on this one.',
  };
}

function tutorReplyIsUseful(text, { action, topic, mode }) {
  const value = cleanText(text, 2800);
  const minLen = (action === 'im_confused') ? 90 : 180;
  if (value.length < minLen) return false;
  if (/\.\.\./.test(value)) return false;
  if (parseStructuredTutorJson(value)) return false;
  if (/^\s*[{[]/.test(value) && /"?(explanation|question|hint|example|code)"?\s*:/i.test(value)) return false;
  if (/we will define|trace an example|placeholder|apply it\.?$/i.test(value)) return false;
  if (action === 'give_example') {
    if (!/(example|for instance|scenario|case|worked|source|material|```|class|node|stack|queue|hash|bankaccount)/i.test(value)) return false;
    if (topicKind(topic) !== 'general' && !/```|class\s+\w+|new\s+\w+|Node|push|pop|enqueue|hash/i.test(value)) return false;
  }
  if (action === 'im_confused' && !/(simpler|analogy|think of|imagine|mini example|small check|jargon)/i.test(value)) return false;
  if (action === 'im_confused' && !/\?/.test(value)) return false;
  if (action === 'check_answer' && !/(correct|missing|better|not quite|feedback|sharpen|correction)/i.test(value)) return false;
  if (mode === 'socratic' && action !== 'give_example' && !/\?/.test(value)) return false;
  if (mode === 'example' && topicKind(topic) !== 'general' && action !== 'check_answer' && action !== 'im_confused' && !/```/.test(value)) return false;
  return true;
}

async function modelFeedbackOrFallback(s, current, answerText, correct, fallback, ctx = {}) {
  if (!answerText) return fallback;
  if (env.NODE_ENV === 'test') return fallback;
  const action = ctx.action || 'check_answer';
  const mode = normalizeTutorMode(ctx.mode || s.mode);
  const sources = tutorSourcesForFeedback(s);
  const prompt = [
    modeSystemPrompt(mode, s.topic || s.concept),
    '',
    `Topic: ${s.topic || s.concept}.`,
    actionPromptSection(action, s.topic || s.concept),
    '',
    '- Be concrete and step-by-step.',
    '- If action is give_example for OOP/Data Structures, include a real runnable code example in a ``` block.',
    '- If action is im_confused, simplify, use one analogy, and ask one simple question.',
    '- If action is check_answer, evaluate what is correct, what is missing, give a better answer, and suggest the next step.',
    '',
    `Current step: ${current.title}. Question: ${current.question}. Key idea: ${current.content}`,
    `Learner message: ${answerText}`,
    `Correctness signal: ${correct ? 'likely correct' : 'needs correction'}`,
    sources.length ? `Source excerpts:\n${sources.slice(0, 3).map((src, i) => `[${i + 1}] ${src.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const providers = [...new Set([env.TUTOR_PROVIDER, env.TUTOR_FALLBACK_PROVIDER].filter(Boolean))];
  for (const provider of providers) {
    try {
      const generated = await Promise.race([
        ai.generate(prompt, {
          provider,
          feature: 'tutor',
          temperature: 0.25,
          max_tokens: 800,
          num_predict: 800,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('tutor_feedback_timeout')), 12000)),
      ]);
      const text = cleanText(generated && (generated.text || generated.output || generated), 2400);
      if (tutorReplyIsUseful(text, { action, topic: s.topic || s.concept, mode })) return { ...fallback, feedback: text };
    } catch (err) {
      log.warn('tutor_feedback_fallback', err.message || err);
    }
  }
  return fallback;
}

async function continueSession(userId, sessionId, payload = {}) {
  const db = getDb();
  const started = Date.now();
  const s = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
  if (!s) throw new HttpError(404, 'session_not_found');
  if ((s.status || 'ready') !== 'ready') throw new HttpError(409, 'session_not_ready');
  const plan = parseJson(s.plan_json, { steps: [] });
  const steps = plan.steps && plan.steps[0] && plan.steps[0].id ? plan.steps : legacyPlanToSteps(plan);
  const idx = Math.max(0, Math.min(Number(s.current_step || 0), steps.length - 1));
  const current = steps[idx];
  const answer = cleanText(payload.userAnswer || payload.answer || payload.text || '', 500);
  const choice = typeof payload.choice === 'number' ? payload.choice : null;
  const mode = normalizeTutorMode(payload.mode || s.mode);
  const action = normalizeTutorAction(payload, answer, choice);
  const hasMcq = Array.isArray(current.options) && typeof current.correct_idx === 'number';
  const correct = hasMcq && choice != null ? choice === current.correct_idx : (answer ? answer.length >= 8 : true);
  const stay = action === 'im_confused' ||
    action === 'give_example' ||
    (action === 'check_answer' && !answer && choice == null) ||
    (action === 'check_answer' && answer && answer.length < 8 && !hasMcq) ||
    (action === 'check_answer' && hasMcq && choice != null && !correct);
  const fallback = deterministicFeedback({ action, mode, topic: s.topic || s.concept, current, answer, hasMcq, correct });
  let feedbackResult = await modelFeedbackOrFallback(
    s,
    current,
    answer || (action === 'im_confused' ? 'I am confused.' : action === 'give_example' ? 'Give me an example.' : action === 'continue' ? 'Continue.' : ''),
    correct,
    fallback,
    { action, mode }
  );
  if (!tutorReplyIsUseful(feedbackResult.feedback, { action, topic: s.topic || s.concept, mode })) {
    feedbackResult = fallback;
  }
  const feedback = feedbackResult.feedback;
  const response = structuredResponseFromFeedback(feedback, { action, mode, topic: s.topic || s.concept, current });
  const nextIndex = stay ? idx : Math.min(idx + 1, steps.length - 1);
  const updatedSteps = steps.map((step, i) => ({
    ...step,
    status: i < nextIndex ? 'completed' : (i === nextIndex ? 'active' : 'locked'),
    learnerAnswer: i === idx ? answer : step.learnerAnswer,
    learnerChoice: i === idx ? choice : step.learnerChoice,
    lastIntent: i === idx ? action : step.lastIntent,
    feedback: i === idx ? feedback : step.feedback,
    feedback_md: i === idx ? feedback : step.feedback_md,
  }));
  db.prepare('UPDATE tutor_sessions SET current_step=?, plan_json=?, mode=?, updated_at=? WHERE id=?')
    .run(nextIndex, JSON.stringify({ ...plan, steps: updatedSteps }), mode, nowIso(), sessionId);
  storeSteps(db, sessionId, updatedSteps);
  db.prepare('UPDATE tutor_steps SET answer_json=?, feedback_md=?, status=? WHERE session_id=? AND idx=?')
    .run(JSON.stringify({ answer, choice, intent: action, action, mode }), feedback, stay ? 'active' : 'completed', sessionId, idx);
  if (action === 'check_answer' && (answer || choice != null)) {
    recordConceptOutcome(userId, s.topic || s.concept, !!correct, { correctDelta: correct ? 4 : 0, incorrectDelta: correct ? 0 : -3 });
  }
  const trace = { ...parseJson(s.trace_json, {}), lastContinueMs: Date.now() - started, lastAnswerWeak: stay, lastIntent: action, lastAction: action, lastMode: mode };
  db.prepare('UPDATE tutor_sessions SET trace_json=? WHERE id=?').run(JSON.stringify(trace), sessionId);
  const userLabel = choice != null
    ? `Choice ${String.fromCharCode(65 + choice)}`
    : (answer || tutorActionLabel(action));
  const turn = {
    id: `turn-${sessionId}-${idx}-${Date.now()}`,
    action,
    userLabel,
    feedback,
    response,
    followUpQuestion: feedbackResult.followUpQuestion || fallback.followUpQuestion || '',
    avatarState: turnAvatarState(action, stay, correct),
    correct,
    stay,
    stepIndex: idx,
    nextStepIndex: nextIndex,
    createdAt: nowIso(),
  };
  return {
    feedback,
    response,
    stay,
    action,
    mode,
    professorCue: feedbackResult.professorCue || fallback.professorCue || (stay ? 'listening' : 'explaining'),
    followUpQuestion: feedbackResult.followUpQuestion || fallback.followUpQuestion || '',
    correct,
    nextStep: updatedSteps[nextIndex],
    steps: updatedSteps,
    currentStepIndex: nextIndex,
    trace,
    turn,
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
  _internals: { isGeneric, cache, validateStep, contentForTopic, deterministicFeedback, tutorReplyIsUseful, normalizeTutorAction, topicExample, structuredResponseFromFeedback },
};
