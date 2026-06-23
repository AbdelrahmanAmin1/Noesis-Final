'use strict';

const { z } = require('zod');
const env = require('../config/env');
const ai = require('./ai.service');
const knowledgeService = require('./knowledge.service');
const prompts = require('../utils/prompts');
const { extractJson, parseJsonSafe } = require('../utils/jsonSafe');
const diagrams = require('./diagram.service');
const { findTopicNodes } = require('../utils/visual-templates');
const codeWindow = require('../utils/code-window');
const materialUnderstanding = require('./material-understanding.service');
const sourceTextQuality = require('./source-text-quality.service');

const SECTION_TYPES = [
  'hook',
  'definition',
  'deep_explanation',
  'analogy',
  'code_example',
  'code_walkthrough',
  'diagram',
  'mindmap',
  'common_mistakes',
  'complexity',
  'checkpoint',
  'recap',
  'next_steps',
];

const DIAGRAM_TYPES = [
  'uml_class',
  'inheritance_tree',
  'linked_list',
  'hash_table',
  'stack',
  'queue',
  'tree',
  'big_o_chart',
  'mindmap',
  'flow',
  'concept_cards',
  'classification_table',
  'comparison_table',
  'source_page_reference',
  'source_slide_reference',
  'no_visual',
];
const CALLOUT_TYPES = ['remember', 'exam_tip', 'warning', 'source'];

const CodeExplanationSchema = z.union([
  z.string(),
  z.object({
    lineRange: z.string().optional().default(''),
    text: z.string().min(1),
  }),
]);

const CodeSchema = z.object({
  language: z.string().optional().default('text'),
  content: z.string().optional().default(''),
  explanation: z.array(CodeExplanationSchema).optional().default([]),
}).optional();

const DiagramSchema = z.object({
  type: z.enum(DIAGRAM_TYPES).optional().default('mindmap'),
  nodes: z.array(z.any()).optional().default([]),
  edges: z.array(z.any()).optional().default([]),
  operations: z.array(z.string()).optional().default([]),
  caption: z.string().optional().default(''),
}).optional();

const SourceVisualSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  pageNumber: z.number().nullable().optional(),
  sourcePage: z.number().nullable().optional(),
  slideNumber: z.number().nullable().optional(),
  heading: z.string().optional().default(''),
  caption: z.string().optional().default(''),
  nearbyText: z.string().optional().default(''),
  ocrText: z.string().optional().default(''),
  evidence: z.string().optional().default(''),
  visualTypeGuess: z.string().optional().default(''),
  materialId: z.union([z.number(), z.string()]).nullable().optional(),
  explanation: z.string().optional().default(''),
  importanceScore: z.number().optional().default(0),
  imagePath: z.string().nullable().optional(),
  thumbnailPath: z.string().nullable().optional(),
}).passthrough();

const SectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  title: z.string().min(1),
  content: z.string().optional().default(''),
  cards: z.array(z.any()).optional().default([]),
  code: CodeSchema,
  diagram: DiagramSchema,
  callouts: z.array(z.object({
    type: z.enum(CALLOUT_TYPES).optional().default('remember'),
    text: z.string().min(1),
    sourceChunkIds: z.array(z.union([z.number(), z.string()])).optional().default([]),
  })).optional().default([]),
  quiz: z.array(z.any()).optional().default([]),
  sourceVisuals: z.array(SourceVisualSchema).optional().default([]),
});

const StudyGuideSchema = z.object({
  whatYouWillLearn: z.array(z.string()).optional().default([]),
  keyConcepts: z.array(z.string()).optional().default([]),
  suggestedOrder: z.array(z.string()).optional().default([]),
  prerequisites: z.array(z.string()).optional().default([]),
  commonMistakes: z.array(z.object({
    mistake: z.string().min(1),
    correction: z.string().optional().default(''),
  })).optional().default([]),
  checkpoints: z.array(z.string()).optional().default([]),
}).optional().default({});

const EducationalLessonSchema = z.object({
  topic: z.string().min(2),
  audienceLevel: z.string().optional().default('beginner'),
  lessonType: z.enum(['oop', 'data_structure', 'algorithm', 'general']).optional().default('general'),
  sourceMaterial: z.object({
    title: z.string().optional().default(''),
    grounding: z.string().optional().default('moderate'),
    selectedChunkIds: z.array(z.union([z.number(), z.string()])).optional().default([]),
  }).optional().default({}),
  learningObjectives: z.array(z.string()).optional().default([]),
  prerequisites: z.array(z.string()).optional().default([]),
  studyGuide: StudyGuideSchema,
  sections: z.array(SectionSchema).min(6),
  relatedTopics: z.array(z.string()).optional().default([]),
  sourceVisuals: z.array(SourceVisualSchema).optional().default([]),
});

const VideoSceneSchema = z.object({
  sceneType: z.enum(['hook', 'objectives', 'definition', 'deep_explanation', 'diagram', 'code_example', 'code_walkthrough', 'common_mistakes', 'complexity', 'checkpoint', 'recap']),
  title: z.string().min(1),
  narration: z.string().min(1),
  onScreenText: z.array(z.string()).optional().default([]),
  visual: z.object({
    type: z.enum(['mindmap', 'flow', 'comparison', 'code', 'summary', 'class_diagram', 'tree', 'stack_queue', 'linkedlist', 'hash_table', 'bigo_chart', 'cards', 'table', 'source_reference', 'none']).optional().default('mindmap'),
    description: z.string().optional().default(''),
    nodes: z.array(z.any()).optional().default([]),
    edges: z.array(z.any()).optional().default([]),
    operations: z.array(z.string()).optional().default([]),
    caption: z.string().optional().default(''),
  }).optional().default({}),
  codeFocus: z.object({
    language: z.string().optional().default('text'),
    content: z.string().optional().default(''),
    lineRange: z.string().optional().default(''),
    visibleStartLine: z.number().optional(),
    visibleEndLine: z.number().optional(),
    highlightLines: z.array(z.number()).optional().default([]),
    explanation: z.string().optional().default(''),
    narrationFocus: z.string().optional().default(''),
    pointers: z.array(z.any()).optional().default([]),
  }).optional(),
  focusTarget: z.string().optional().default(''),
  pointerLabel: z.string().optional().default(''),
  animationType: z.string().optional().default('focus'),
  durationTargetSec: z.number().optional().default(24),
});

function cleanText(value, max = null) {
  const text = String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const cleaned = sourceTextQuality.stripSourceNoise(text);
  if (max && cleaned.length > max) return `${cleaned.slice(0, max - 1).trim()}...`;
  return cleaned;
}

function inlineText(value, max = null) {
  const text = cleanText(value).replace(/\s+/g, ' ').trim();
  if (max && text.length > max) return `${text.slice(0, max - 1).trim()}...`;
  return text;
}

function uniqueList(values, max = 12) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = inlineText(value, 180);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function detectLessonType(topic) {
  const lower = String(topic || '').toLowerCase();
  if (/(inheritance|polymorphism|encapsulation|abstraction|class|object|interface|oop)/.test(lower)) return 'oop';
  if (/(linked list|stack|queue|tree|heap|array|hash|graph|data structure)/.test(lower)) return 'data_structure';
  if (/(algorithm|sort|search|recursion|dynamic programming|big-o|complexity)/.test(lower)) return 'algorithm';
  return 'general';
}

function loadCuratedKnowledge(topic) {
  return knowledgeService.getTopic(topic);
}

function curatedAsPrompt(knowledge) {
  return knowledgeService.topicToPromptContext(knowledge);
}

function section(type, title, content, extra = {}) {
  return {
    type,
    title,
    content: cleanText(content),
    cards: extra.cards || [],
    code: extra.code,
    diagram: extra.diagram,
    callouts: extra.callouts || [],
    quiz: extra.quiz || [],
  };
}

function fallbackLesson(topic, opts = {}) {
  const t = inlineText(topic || 'Object-Oriented Programming', 90);
  const lower = t.toLowerCase();
  const materialTitle = opts.materialTitle || opts.title || '';
  const grounding = opts.groundingTier || 'moderate';
  const selectedChunkIds = (opts.chunks || []).slice(0, 6).map(c => c.id).filter(Boolean);
  const lessonType = opts.lessonType || detectLessonType(t);
  const domain = opts.domain || opts.domainInfo && opts.domainInfo.domain || '';

  if (lessonType === 'general' || (domain && domain !== 'cs')) {
    return generalMaterialLesson(t, materialTitle, grounding, selectedChunkIds, opts.chunks || [], opts);
  }

  if (lower.includes('inheritance')) return inheritanceLesson(t, materialTitle, grounding, selectedChunkIds);
  if (lower.includes('polymorphism')) return polymorphismLesson(t, materialTitle, grounding, selectedChunkIds);
  if (lower.includes('linked list')) return linkedListLesson(t, materialTitle, grounding, selectedChunkIds);
  if (lower.includes('tree') || /\bbst\b/.test(lower)) return treeLesson(t, materialTitle, grounding, selectedChunkIds);
  if (lower.includes('hash table') || lower.includes('hashmap') || lower.includes('hash map') || lower.includes('hash function') || lower === 'hashing') return hashTableLesson(t, materialTitle, grounding, selectedChunkIds);
  if (lower.includes('stack')) return stackLesson(t, materialTitle, grounding, selectedChunkIds);
  const curated = loadCuratedKnowledge(t);
  if (curated) return curatedFallbackLesson(t, curated, materialTitle, grounding, selectedChunkIds);
  return genericLesson(t, materialTitle, grounding, selectedChunkIds);
}

function baseLesson(topic, lessonType, materialTitle, grounding, selectedChunkIds) {
  return {
    topic,
    audienceLevel: 'beginner',
    lessonType,
    sourceMaterial: { title: materialTitle || '', grounding, selectedChunkIds },
    learningObjectives: [],
    prerequisites: [],
    sections: [],
    relatedTopics: [],
  };
}

function inheritanceLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson('Inheritance in OOP', 'oop', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [
    'Explain how a child class reuses and specializes a parent class.',
    'Read and write Java inheritance code using extends and method overriding.',
    'Use a UML inheritance arrow to distinguish inheritance from composition.',
  ];
  lesson.prerequisites = ['Classes and objects', 'Methods', 'Basic Java syntax'];
  lesson.sections = [
    section('hook', 'Why Inheritance Matters', 'Inheritance lets you model an "is-a" relationship. If every Shape has an area, Circle and Rectangle should not duplicate the idea of being a shape. They inherit the shared contract and specialize the details.'),
    section('definition', 'Definition', 'Inheritance is an OOP mechanism where a subclass receives fields and methods from a superclass and can add or override behavior. In Java, a class declares this relationship with extends.'),
    section('deep_explanation', 'Mental Model', 'Think of the parent class as the general promise and the child class as the specific version. Shape promises that every shape can calculate area. Circle fulfills that promise one way, and Rectangle fulfills it another way. The inherited relationship organizes code, but it should only be used when the child truly is a kind of the parent.'),
    section('diagram', 'UML Inheritance Diagram', 'A UML inheritance arrow points from the child class toward the parent class. The arrow means Circle and Rectangle are specialized Shapes.', {
      diagram: {
        type: 'uml_class',
        nodes: [
          { id: 'Shape', label: 'Shape', kind: 'abstract', fields: [], methods: ['area()'] },
          { id: 'Circle', label: 'Circle', fields: ['radius'], methods: ['area()'] },
          { id: 'Rectangle', label: 'Rectangle', fields: ['width', 'height'], methods: ['area()'] },
        ],
        edges: [['Circle', 'Shape', 'extends'], ['Rectangle', 'Shape', 'extends']],
        caption: 'Circle and Rectangle inherit the Shape contract and override area().',
      },
    }),
    section('code_example', 'Java Example', 'This example shows an abstract parent class and two child classes that override the same method.', {
      code: {
        language: 'java',
        content: 'abstract class Shape {\n  abstract double area();\n}\n\nclass Circle extends Shape {\n  private final double radius;\n  Circle(double radius) { this.radius = radius; }\n  @Override double area() { return Math.PI * radius * radius; }\n}\n\nclass Rectangle extends Shape {\n  private final double width, height;\n  Rectangle(double width, double height) { this.width = width; this.height = height; }\n  @Override double area() { return width * height; }\n}',
        explanation: [
          { lineRange: '1-3', text: 'Shape defines the common contract: every Shape must know how to compute area.' },
          { lineRange: '5', text: 'Circle extends Shape, so it is a specialized kind of Shape.' },
          { lineRange: '8', text: '@Override tells Java that Circle supplies its own area formula.' },
          { lineRange: '11-14', text: 'Rectangle reuses the same parent contract but implements a different formula.' },
        ],
      },
    }),
    section('code_walkthrough', 'Line-by-Line Walkthrough', 'Start at Shape: it does not know the formula, but it defines the required behavior. Circle stores radius because a circle needs radius to compute area. Rectangle stores width and height. The shared parent keeps the model consistent while each child owns its specialized calculation.'),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Using inheritance for code reuse only', text: 'If the child is not truly a kind of the parent, composition is usually safer.' },
        { title: 'Forgetting @Override', text: 'Without @Override, a typo can silently create a new method instead of replacing the parent behavior.' },
        { title: 'Mixing in polymorphism too early', text: 'Polymorphism uses inheritance, but inheritance itself is the parent-child relationship.' },
      ],
      callouts: [{ type: 'warning', text: 'Do not say Circle has-a Shape. Circle is-a Shape. A Drawing has-a list of Shapes.' }],
    }),
    section('checkpoint', 'Mini Checkpoint', 'Which relationship is inheritance: Car is a Vehicle, or Car has an Engine?', {
      quiz: [{
        question: 'Which one is an inheritance relationship?',
        options: ['Car has an Engine', 'Car is a Vehicle', 'Playlist has Songs', 'House has Rooms'],
        answer: 'Car is a Vehicle',
        explanation: '"Is-a" points to inheritance. "Has-a" points to composition.',
      }],
    }),
    section('recap', 'Recap', 'Inheritance models a true is-a relationship. The parent class captures shared behavior or contracts. Child classes extend the parent and can override methods to specialize behavior.'),
    section('next_steps', 'Next Steps', 'Study polymorphism next, because polymorphism explains how a Shape reference can call Circle or Rectangle behavior at runtime.'),
  ];
  lesson.relatedTopics = ['Polymorphism', 'Abstract classes', 'Composition'];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function polymorphismLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson('Polymorphism in OOP', 'oop', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [
    'Explain same method call, different runtime behavior.',
    'Trace dynamic dispatch through a superclass reference.',
    'Contrast overriding with overloading and static/final methods.',
  ];
  lesson.prerequisites = ['Inheritance', 'Method overriding', 'Object references'];
  lesson.sections = [
    section('hook', 'Why Polymorphism Matters', 'Polymorphism lets code depend on a general type while runtime objects decide the exact behavior. That is what makes extensible designs possible.'),
    section('definition', 'Definition', 'Polymorphism means one interface or superclass reference can refer to different subclass objects, and the overridden method that runs is chosen by the object type at runtime.'),
    section('deep_explanation', 'Dynamic Dispatch', 'The variable type controls what methods are legal to call, but the actual object controls which overridden implementation runs. A Shape reference can point to a Circle or Rectangle. Calling area() looks the same, but Java dispatches to the runtime object method.'),
    section('diagram', 'Runtime Dispatch Diagram', 'The call shape.area() travels through a Shape reference, then lands on the implementation belonging to the actual object.', {
      diagram: {
        type: 'flow',
        nodes: ['Shape shape', 'new Circle(2)', 'shape.area()', 'Circle.area()', '12.57'],
        edges: [['Shape shape', 'new Circle(2)'], ['shape.area()', 'Circle.area()'], ['Circle.area()', '12.57']],
        caption: 'Same call site, different behavior depending on the runtime object.',
      },
    }),
    section('code_example', 'Java Example', 'This code uses a superclass reference to call subclass behavior.', {
      code: {
        language: 'java',
        content: 'Shape shape = new Circle(2);\nSystem.out.println(shape.area());\n\nshape = new Rectangle(3, 4);\nSystem.out.println(shape.area());',
        explanation: [
          { lineRange: '1', text: 'The reference type is Shape, but the object is Circle.' },
          { lineRange: '2', text: 'Java runs Circle.area() because the object is a Circle.' },
          { lineRange: '4', text: 'The same reference now points to a Rectangle object.' },
          { lineRange: '5', text: 'The same method call now runs Rectangle.area().' },
        ],
      },
    }),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Confusing overloading with overriding', text: 'Overloading chooses among parameter lists at compile time. Overriding chooses subclass behavior at runtime.' },
        { title: 'Expecting static methods to dispatch dynamically', text: 'Static methods are resolved by the class, not by the runtime object.' },
        { title: 'Trying to override final methods', text: 'final prevents overriding, so polymorphic replacement cannot happen.' },
      ],
    }),
    section('checkpoint', 'Mini Checkpoint', 'If Shape s = new Rectangle(3,4), which method runs when s.area() is called?', {
      quiz: [{
        question: 'Which implementation runs?',
        options: ['Shape.area()', 'Rectangle.area()', 'Circle.area()', 'No method can run'],
        answer: 'Rectangle.area()',
        explanation: 'Dynamic dispatch uses the runtime object type, which is Rectangle.',
      }],
    }),
    section('recap', 'Recap', 'Polymorphism is about one call shape and multiple runtime behaviors. The reference type gives the shared interface; the object type provides the method implementation.'),
    section('next_steps', 'Next Steps', 'Practice tracing overriding, then compare it with method overloading using small Java examples.'),
  ];
  lesson.relatedTopics = ['Inheritance', 'Method overriding', 'Interfaces'];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function linkedListLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson('Linked List', 'data_structure', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [
    'Describe node, data, next, and head pointer.',
    'Trace traversal, insertion, and deletion without losing references.',
    'Compare linked-list operation complexity with arrays.',
  ];
  lesson.prerequisites = ['Objects or structs', 'References', 'Basic loops'];
  lesson.sections = [
    section('hook', 'Why Linked Lists Matter', 'A linked list stores items as nodes connected by references. Unlike an array, nodes do not need to sit next to each other in memory.'),
    section('definition', 'Definition', 'A singly linked list is a chain of nodes where each node stores data and a next reference to the following node. The head reference points to the first node.'),
    section('diagram', 'Memory-Style Diagram', 'The useful picture is not boxes in a row only. It is values connected by next references, with head pointing at the first node.', {
      diagram: {
        type: 'linked_list',
        nodes: ['head', 'Node(10)', 'Node(20)', 'Node(30)', 'null'],
        edges: [['head', 'Node(10)'], ['Node(10)', 'Node(20)'], ['Node(20)', 'Node(30)'], ['Node(30)', 'null']],
        caption: 'Each node points to the next node, and the last node points to null.',
      },
    }),
    section('code_example', 'Java Node Example', 'This minimal implementation shows the node shape and a front insertion.', {
      code: {
        language: 'java',
        content: 'class Node {\n  int data;\n  Node next;\n  Node(int data) { this.data = data; }\n}\n\nNode insertFront(Node head, int value) {\n  Node node = new Node(value);\n  node.next = head;\n  return node;\n}',
        explanation: [
          { lineRange: '1-4', text: 'Each node stores one value and a next reference.' },
          { lineRange: '7', text: 'Create the new node before changing the list.' },
          { lineRange: '8', text: 'Point the new node to the old head so the old list is not lost.' },
          { lineRange: '9', text: 'Return the new node as the new head.' },
        ],
      },
    }),
    section('code_walkthrough', 'Insertion Walkthrough', 'For front insertion, keep the old head alive. Create the new node, set new.next to the old head, then move head to the new node. If you move head first without saving the old chain, you can lose the rest of the list.'),
    section('complexity', 'Complexity', 'Head insertion is O(1). Search and traversal are O(n) because you may need to follow every next reference. Deleting after a known previous node is O(1), but finding that previous node is O(n).', {
      cards: [
        { title: 'Access by index', text: 'O(n)' },
        { title: 'Search', text: 'O(n)' },
        { title: 'Insert at head', text: 'O(1)' },
        { title: 'Delete after known node', text: 'O(1)' },
      ],
    }),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Losing next', text: 'Always save or reconnect next references before overwriting them.' },
        { title: 'Forgetting null checks', text: 'Traversal must stop when current becomes null.' },
        { title: 'Thinking linked lists give O(1) indexing', text: 'You cannot jump directly to index i without walking through nodes.' },
      ],
    }),
    section('checkpoint', 'Mini Checkpoint', 'What should node.next point to when inserting at the front?', {
      quiz: [{
        question: 'When inserting at the front, newNode.next should point to...',
        options: ['null always', 'the old head', 'the last node', 'itself'],
        answer: 'the old head',
        explanation: 'That preserves the old chain after the new node becomes head.',
      }],
    }),
    section('recap', 'Recap', 'A linked list is a chain of nodes. The head starts traversal. next references define order. Most mistakes come from changing references in the wrong order.'),
    section('next_steps', 'Next Steps', 'Practice deleting a node by value, then compare singly linked lists with doubly linked lists.'),
  ];
  lesson.relatedTopics = ['Doubly linked list', 'Stack', 'Queue'];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function treeLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const isBst = /\b(binary search tree|bst)\b/i.test(topic || '');
  const lesson = baseLesson(isBst ? 'Binary Search Tree' : 'Trees', 'data_structure', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [
    'Identify root, parent, child, leaf, height, and depth in a tree.',
    'Trace preorder, postorder, and inorder traversal order.',
    'Explain how binary trees and BSTs organize search and insertion paths.',
  ];
  lesson.prerequisites = ['Nodes and references', 'Recursion', 'Basic comparison logic'];
  lesson.sections = [
    section('hook', 'Why Trees Matter', 'A tree organizes data hierarchically. Instead of one linear chain, each node can branch to children, which makes trees useful for folders, expression parsing, search structures, and priority-based organization.'),
    section('definition', 'Definition', 'A tree is a collection of nodes connected by parent-child edges. The root is the top node, leaves have no children, and every non-root node has exactly one parent. Height and depth describe how far nodes are from the root or from the deepest leaf.'),
    section('diagram', 'Tree Structure Diagram', 'The core visual model is root to children to leaves. Traversal walks through that hierarchy in a systematic order.', {
      diagram: {
        type: 'tree',
        nodes: ['root', 'left child', 'right child', 'leaf one', 'leaf two', 'leaf three'],
        edges: [['root', 'left child'], ['root', 'right child'], ['left child', 'leaf one'], ['left child', 'leaf two'], ['right child', 'leaf three']],
        operations: ['visit root', 'traverse child edge', 'visit leaf'],
        caption: 'A tree branches from one root through parent-child edges to leaves.',
      },
    }),
    section('deep_explanation', 'Tree ADT and Implementation', 'A Tree ADT usually exposes root(), parent(v), children(v), size(), and tests such as isRoot(), isInternal(), and isExternal(). A common implementation stores a root reference, parent links, first-child links, and sibling links so the structure can represent any number of children.'),
    section('code_example', 'AI Helper Example: Java Tree Node', 'This is an AI helper example for extra practice, not copied from the uploaded source. It shows the references behind the hierarchy and a preorder traversal.', {
      code: {
        language: 'java',
        content: 'class TreeNode {\n  int data;\n  TreeNode left;\n  TreeNode right;\n}\n\nvoid preorder(TreeNode node) {\n  if (node == null) return;\n  visit(node);\n  preorder(node.left);\n  preorder(node.right);\n}',
        explanation: [
          { lineRange: '1-4', text: 'Each node stores data and child references.' },
          { lineRange: '7', text: 'The base case stops traversal at an empty child.' },
          { lineRange: '8', text: 'Preorder visits the root before its children.' },
          { lineRange: '9-10', text: 'Recursive calls traverse the left and right subtrees.' },
        ],
      },
    }),
    section('code_walkthrough', 'Traversal Walkthrough', 'Preorder is root then children. Postorder is children then root. Inorder applies to binary trees: left subtree, root, right subtree. The important habit is to track the current node and which subtree is visited next.'),
    section('complexity', 'BST Search and Height', 'A binary search tree adds an ordering rule: smaller values go left, larger values go right. Search follows one path down from the root, so the cost is O(h), where h is the height of the tree. Balanced trees keep h small; skewed trees can degrade toward O(n).', {
      cards: [
        { title: 'Search path', text: 'Compare once per level.' },
        { title: 'Balanced BST', text: 'Often O(log n).' },
        { title: 'Skewed BST', text: 'Can become O(n).' },
        { title: 'Inorder traversal', text: 'Visits values in sorted order.' },
      ],
    }),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Thinking every tree is a BST', text: 'A general tree only has hierarchy; a BST also has left-smaller/right-larger ordering.' },
        { title: 'Mixing height and depth', text: 'Depth counts from root to node; height counts from node to deepest leaf.' },
        { title: 'Forgetting subtree rules', text: 'BST ordering must hold for every subtree, not only the root.' },
      ],
    }),
    section('checkpoint', 'Mini Checkpoint', 'In a BST search, why can the algorithm skip an entire subtree after one comparison?', {
      quiz: [{
        question: 'Why does BST search choose only left or right at each node?',
        options: ['Because every node has one child', 'Because smaller keys are left and larger keys are right', 'Because traversal always starts at a leaf', 'Because arrays store the tree contiguously'],
        answer: 'Because smaller keys are left and larger keys are right',
        explanation: 'The ordering rule tells the search which subtree could contain the target and which subtree cannot.',
      }],
    }),
    section('recap', 'Recap', 'Trees are hierarchical structures with roots, parent-child edges, and leaves. Traversals define visit order, and BSTs add an ordering rule so search and insertion follow a path rather than scanning every node.'),
    section('next_steps', 'Next Steps', 'Practice drawing preorder, postorder, and inorder traversals, then compare balanced and skewed BST search paths.'),
  ];
  lesson.relatedTopics = ['Binary Search Tree', 'Heap', 'Graph Traversal'];
  return normalizeLesson(lesson, { topic: lesson.topic, skipEnsureFallback: true });
}

function hashTableLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson('Hash Table', 'data_structure', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [
    'Explain how a hash function maps a key to a bucket index.',
    'Trace lookup and insertion through collisions, chaining, and load factor.',
    'Compare expected O(1) behavior with worst-case O(n) collisions.',
  ];
  lesson.prerequisites = ['Arrays', 'Modulus operator', 'Key-value pairs', 'Basic object equality'];
  lesson.sections = [
    section('hook', 'Why Hash Tables Matter', 'Hash tables are the reason maps and dictionaries feel instant. Instead of scanning every pair, they compute where a key should live, then inspect only that bucket.'),
    section('definition', 'Definition', 'A hash table stores key-value pairs in an array of buckets. A hash function turns the key into an integer, and the table converts that integer into a bucket index with modulo.'),
    section('deep_explanation', 'Mental Model', 'Think in four moves: key, hash, index, bucket. The key is the thing you search for. The hash function creates a repeatable number from the key. Modulo maps that number into the bucket array. If multiple keys land in the same bucket, collision handling decides how they share the space.'),
    section('diagram', 'Hash Table Diagram', 'The useful picture is key to hash to bucket index to slot. This model also makes collisions visible instead of mysterious.', {
      diagram: {
        type: 'hash_table',
        nodes: ['key "cat"', 'hash(key)', 'index = hash mod buckets', 'bucket 2', '(cat, 41)', '(cot, 19)', 'collision chain', 'resize'],
        edges: [['key "cat"', 'hash(key)'], ['hash(key)', 'index = hash mod buckets'], ['index = hash mod buckets', 'bucket 2'], ['bucket 2', '(cat, 41)'], ['bucket 2', '(cot, 19)']],
        operations: ['hash', 'mod', 'insert/search', 'collision chain', 'resize'],
        caption: 'A key is hashed, reduced to a bucket index, then compared inside that bucket.',
      },
    }),
    section('code_example', 'AI Helper Example: Java Lookup Sketch', 'This is an AI helper example for extra practice, not copied from the uploaded source. It shows the lookup path for a separate-chaining hash table.', {
      code: {
        language: 'java',
        content: 'int index = (key.hashCode() & 0x7fffffff) % table.length;\nEntry current = table[index];\nwhile (current != null) {\n  if (current.key.equals(key)) return current.value;\n  current = current.next;\n}\nreturn null;',
        explanation: [
          { lineRange: '1', text: 'The hash code becomes a non-negative bucket index.' },
          { lineRange: '2', text: 'The table jumps directly to that bucket.' },
          { lineRange: '3-5', text: 'A collision chain is scanned with equals to find the exact key.' },
          { lineRange: '7', text: 'If the chain ends, the key is not present.' },
        ],
      },
    }),
    section('code_walkthrough', 'Line-by-Line Walkthrough', 'Line 1 computes the bucket index; it is not the final equality check. Line 2 jumps into the bucket array. Lines 3 through 5 handle collisions by walking the chain and comparing real keys. This is why hashing is fast on average but still needs collision logic.'),
    section('complexity', 'Complexity and Load Factor', 'Lookup, insert, and delete are expected O(1) when the hash function spreads keys well and the load factor stays controlled. Worst case is O(n) if many keys collide into the same bucket. The load factor alpha is size divided by bucket count; resizing keeps alpha from growing too high.', {
      cards: [
        { title: 'Expected lookup', text: 'O(1)' },
        { title: 'Worst-case lookup', text: 'O(n)' },
        { title: 'Load factor', text: 'alpha = size / buckets' },
        { title: 'Resize', text: 'Rehash into a larger bucket array' },
      ],
    }),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Thinking O(1) is guaranteed', text: 'O(1) is expected, not magic. Bad collisions can force a bucket scan.' },
        { title: 'Ignoring equals/hashCode consistency', text: 'Equal keys must produce equal hash codes, or lookup can fail.' },
        { title: 'Using mutable keys', text: 'If a key changes after insertion, its hash bucket may no longer match.' },
        { title: 'Letting load factor grow too high', text: 'Too many entries per bucket increases collision work.' },
      ],
    }),
    section('checkpoint', 'Mini Checkpoint', 'Why does a hash table still compare keys with equals after computing the hash?', {
      quiz: [{
        question: 'Why compare keys after hashing?',
        options: ['The hash is always unique', 'Different keys can collide', 'Modulo sorts the keys', 'Resize changes the value'],
        answer: 'Different keys can collide',
        explanation: 'A hash narrows the search to a bucket, but equality confirms the exact key.',
      }],
    }),
    section('recap', 'Recap', 'A hash table uses a hash function to choose a bucket. Collisions are normal and must be handled. Load factor controls resizing. Expected operations are O(1), but collision-heavy worst cases can become O(n).'),
    section('next_steps', 'Next Steps', 'Practice tracing insert, lookup, collision, and resize on a tiny table with five buckets. Then compare separate chaining with open addressing.'),
  ];
  lesson.relatedTopics = ['Hash functions', 'Separate chaining', 'Open addressing', 'Maps'];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function stackLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson('Stack', 'data_structure', materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = ['Explain LIFO order.', 'Trace push, pop, and peek.', 'Recognize underflow and stack use cases.'];
  lesson.prerequisites = ['Arrays or lists', 'Basic operations'];
  lesson.sections = [
    section('hook', 'Why Stacks Matter', 'A stack is perfect for nested work: undo history, browser back, parsing, and function calls. The newest item is handled first.'),
    section('definition', 'Definition', 'A stack is a Last-In, First-Out data structure. push adds to the top, pop removes from the top, and peek reads the top without removing it.'),
    section('diagram', 'Vertical Stack Diagram', 'The top is the only active end of the structure.', {
      diagram: {
        type: 'stack',
        nodes: ['top: C', 'B', 'A', 'bottom'],
        edges: [['push(D)', 'top'], ['pop()', 'C']],
        caption: 'After pushing A, B, C, the next pop returns C.',
      },
    }),
    section('code_example', 'Java Stack Sketch', 'This small implementation uses an array list as the backing store.', {
      code: {
        language: 'java',
        content: 'class IntStack {\n  private final java.util.ArrayList<Integer> data = new java.util.ArrayList<>();\n  void push(int value) { data.add(value); }\n  int peek() { return data.get(data.size() - 1); }\n  int pop() {\n    if (data.isEmpty()) throw new IllegalStateException(\"underflow\");\n    return data.remove(data.size() - 1);\n  }\n}',
        explanation: [
          { lineRange: '3', text: 'push appends at the top end.' },
          { lineRange: '4', text: 'peek reads the top without removing it.' },
          { lineRange: '6', text: 'Always check empty state before popping.' },
          { lineRange: '7', text: 'pop removes and returns the newest item.' },
        ],
      },
    }),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Confusing LIFO with FIFO', text: 'Stacks remove the newest item. Queues remove the oldest item.' },
        { title: 'Ignoring underflow', text: 'Popping from an empty stack should be handled explicitly.' },
        { title: 'Removing from the bottom', text: 'That breaks stack behavior and makes tracing incorrect.' },
      ],
    }),
    section('complexity', 'Complexity', 'With a dynamic array or linked list top, push, pop, and peek are O(1). Searching is O(n) because stack order does not support direct lookup by value.'),
    section('checkpoint', 'Mini Checkpoint', 'Push A, then B, then C. What does pop return?', {
      quiz: [{ question: 'What comes out first?', options: ['A', 'B', 'C', 'null'], answer: 'C', explanation: 'C was the last item pushed, so it is first out.' }],
    }),
    section('recap', 'Recap', 'Stacks are LIFO. Only the top is active. The core operations are push, pop, and peek.'),
    section('next_steps', 'Next Steps', 'Use stacks to evaluate parentheses matching or undo/redo behavior.'),
  ];
  lesson.relatedTopics = ['Queue', 'Recursion', 'Call stack'];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function autoCodeExplanations(code, topic) {
  const lines = String(code || '').split(/\r?\n/);
  const nonEmpty = lines.map((line, idx) => ({ line: line.trim(), number: idx + 1 })).filter(item => item.line);
  if (!nonEmpty.length) return [];
  const first = nonEmpty[0].number;
  const last = nonEmpty[nonEmpty.length - 1].number;
  const middle = nonEmpty[Math.floor(nonEmpty.length / 2)].number;
  const ranges = [
    { lineRange: `${first}-${Math.min(first + 2, last)}`, text: `This opening part sets up the structure or contract needed for ${topic}.` },
    { lineRange: `${middle}`, text: `This line is where the main idea of ${topic} becomes visible in code.` },
    { lineRange: `${Math.max(first, last - 2)}-${last}`, text: `The ending lines complete the operation and show the result or invariant that must hold.` },
  ];
  return ranges.filter((item, index, arr) => arr.findIndex(other => other.lineRange === item.lineRange) === index);
}

function complexityText(complexity) {
  if (!complexity || typeof complexity !== 'object' || !Object.keys(complexity).length) return '';
  return Object.entries(complexity)
    .map(([key, value]) => `${String(key).replace(/_/g, ' ')}: ${value}`)
    .join('; ');
}

function mistakeCard(item) {
  if (typeof item === 'string') return { title: videoText(item, 42), text: item };
  const mistake = item && (item.mistake || item.title || item.text) || '';
  const correction = item && item.correction ? ` Correction: ${item.correction}` : '';
  const why = item && item.whyItHappens ? ` Why it happens: ${item.whyItHappens}` : '';
  return {
    title: videoText(mistake, 42),
    text: cleanText(`${mistake}${why}${correction}`, 260),
  };
}

function parseKeywordsJson(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function isGenericSourceLabel(value) {
  const text = inlineText(value, 120);
  if (!text) return true;
  return /^(document|file|material|upload|uploaded material|source|lesson|chapter\s*\d+|slide\s*\d+|section\s*\d+|unit\s*\d+|module\s*\d+|top|home|welcome|introduction|overview|contents?|table of contents|index|appendix|acknowledgements?|references?|quiz(?:zes)?|quiz answer keys?|answer keys?|answers?|objectives?|learning objectives?|untitled|\d+)$/i.test(text)
    || isNoisySourceLabel(text);
}

function isNoisySourceLabel(value) {
  const text = inlineText(value, 120);
  if (!text) return true;
  const normalized = normalizedForCoverage(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (/\b\w+\.\w+\b/.test(text)) return true;
  if (/[{};]/.test(text)) return true;
  if (/[=()]/.test(text) && /\b(public|private|protected|return|void|null|new|class|node|head|next|set|get)\b/i.test(text)) return true;
  if (/^(?:and|or|the|this|that|he|es|fer|nd)\b/i.test(text) && words.length >= 4) return true;
  if (/\b(?:dr|prof|instructor|ccis|ksu|salah|hammami)\b/i.test(text)) return true;
  if (words.length >= 8 && !/\b(?:linked list|self referential|data structure|binary tree|tree|stack|queue|hash|graph|array|class|object|anatomy|skeletal|marketing|strategy|demand|supply|classification|process|implementation)\b/.test(normalized)) return true;
  return false;
}

function titleCaseLabel(value) {
  return inlineText(value, 90)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function sourceConceptsFromChunks(chunks, topic, max = 8) {
  const seen = new Set();
  const out = [];
  const add = (value) => {
    const label = titleCaseLabel(value);
    if (!label || isGenericSourceLabel(label)) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };
  add(topic);
  for (const chunk of chunks || []) {
    add(chunk.chapter_title || chunk.slide_title || chunk.section_title || chunk.heading);
    for (const keyword of parseKeywordsJson(chunk.keywords_json)) add(keyword);
    if (out.length >= max) break;
  }
  if (!out.length) add(topic);
  return out.slice(0, max);
}

function sourceExcerptSentences(chunks, max = 4) {
  const sentences = [];
  for (const chunk of chunks || []) {
    const text = String(chunk.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const clean = cleanText(sentence, 240);
      if (clean.length >= 35) sentences.push(clean);
      if (sentences.length >= max) return sentences;
    }
  }
  return sentences;
}

function outlineFromLessonInputs(chunks = [], opts = {}) {
  if (opts.sourceOutline && typeof opts.sourceOutline === 'object') return opts.sourceOutline;
  return materialUnderstanding.buildSourceOutline(chunks || [], {
    explicitQuery: opts.explicitQuery || opts.query || opts.topic,
    hint: opts.topic,
    title: opts.title || opts.materialTitle,
    materialTitle: opts.materialTitle || opts.title,
    scopeTitle: opts.scopeTitle,
    domainInfo: opts.domainInfo,
  });
}

function outlineConcepts(outline, fallbackConcepts = [], max = 10) {
  const sections = Array.isArray(outline && outline.meaningfulSections) ? outline.meaningfulSections : [];
  const values = [
    ...fallbackConcepts,
    outline && outline.mainTopic,
    ...(outline && Array.isArray(outline.keyConcepts) ? outline.keyConcepts : []),
    ...sections.map(section => section.title),
    ...sections.flatMap(section => Array.isArray(section.terms) ? section.terms.slice(0, 3) : []),
  ];
  return uniqueList(values, max).filter(label => !isGenericSourceLabel(label)).slice(0, max);
}

function outlineExamples(outline, chunks, max = 5) {
  const sections = Array.isArray(outline && outline.meaningfulSections) ? outline.meaningfulSections : [];
  const fromSections = sections.map(section => section.excerpt).filter(Boolean);
  const representative = Array.isArray(outline && outline.representativeExcerpts) ? outline.representativeExcerpts : [];
  return uniqueList([...fromSections, ...representative, ...sourceExcerptSentences(chunks, max)], max);
}

const SOURCE_FACT_KEYS = [
  'definitions',
  'facts',
  'classifications',
  'examples',
  'numbers',
  'relationships',
  'processes',
  'memoryHints',
  'reviewQuestions',
];

function sourceFactsFromOutline(outline) {
  const facts = {};
  for (const key of SOURCE_FACT_KEYS) facts[key] = [];
  const add = (key, value, max = 18) => {
    const text = cleanText(value, 260);
    if (!text || !facts[key] || facts[key].some(item => item.toLowerCase() === text.toLowerCase())) return;
    facts[key].push(text);
    if (facts[key].length > max) facts[key] = facts[key].slice(0, max);
  };
  const read = (source) => {
    if (!source || typeof source !== 'object') return;
    for (const key of SOURCE_FACT_KEYS) {
      for (const value of source[key] || []) add(key, value, key === 'facts' ? 24 : 16);
    }
  };
  read(outline && outline.sourceFacts);
  for (const section of (outline && outline.meaningfulSections) || []) read(section && section.sourceFacts);
  for (const quiz of (outline && outline.quizSections) || []) read(quiz && quiz.sourceFacts);
  return facts;
}

function flattenSourceFacts(facts, keys = SOURCE_FACT_KEYS, max = 12) {
  const values = [];
  for (const key of keys) values.push(...((facts && facts[key]) || []));
  return uniqueList(values, max);
}

function firstSourceFact(facts, keys = SOURCE_FACT_KEYS, fallback = '') {
  return flattenSourceFacts(facts, keys, 1)[0] || fallback;
}

function sourceFactLooksUseful(value) {
  const text = inlineText(value, 260);
  if (!text || text.length < 34) return false;
  const normalized = normalizedForCoverage(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  if (/^(?:once|thereby|because|while|when|where|es|fer|he|nd)\b/i.test(text)) return false;
  if (/\b(?:dr|prof|instructor|ccis|ksu|salah|hammami)\b/i.test(text)) return false;
  if (!/[a-z]{3,}/i.test(text)) return false;
  return true;
}

function rankSourceFacts(values = [], anchors = [], max = 12) {
  const anchorTerms = uniqueList(anchors, 12)
    .map(term => normalizedForCoverage(term))
    .filter(term => term && term.length >= 4);
  return uniqueList(values, 40)
    .filter(sourceFactLooksUseful)
    .map(value => {
      const normalized = normalizedForCoverage(value);
      const anchorHits = anchorTerms.filter(term => normalized.includes(term)).length;
      const sentenceBonus = /[.!?]$/.test(String(value).trim()) ? 1 : 0;
      const definitionBonus = /\b(is|are|means|contains|includes|refers|stores|supports|uses|based on)\b/i.test(value) ? 1 : 0;
      return { value, score: anchorHits * 4 + sentenceBonus + definitionBonus };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.value)
    .slice(0, max);
}

function sectionFactText(section, max = 300) {
  const facts = sourceFactsFromOutline({ sourceFacts: section && section.sourceFacts });
  const values = rankSourceFacts(
    flattenSourceFacts(facts, ['definitions', 'facts', 'relationships', 'classifications', 'processes', 'examples', 'numbers'], 8),
    [section && section.title, ...((section && section.terms) || [])],
    3
  );
  return cleanText(values.join(' '), max) || cleanText(section && section.excerpt || '', max);
}

function sourceSectionCards(outline, concepts, max = 6) {
  const sections = Array.isArray(outline && outline.meaningfulSections) ? outline.meaningfulSections : [];
  const cards = sections
    .filter(section => section && section.title && !isGenericSourceLabel(section.title))
    .slice(0, max)
    .map(section => ({
      title: inlineText(section.title, 80),
      text: sectionFactText(section, 300) || cleanText(Array.isArray(section.terms) ? section.terms.join(', ') : '', 260),
    }))
    .filter(card => card.title || card.text);
  if (cards.length) return cards;
  return concepts.slice(0, max).map(label => ({
    title: inlineText(label, 80),
    text: `${inlineText(label, 80)} appears as a source concept in the uploaded material.`,
  }));
}

function visualDecisionForGeneral(outline, concepts) {
  const sections = Array.isArray(outline && outline.meaningfulSections) ? outline.meaningfulSections : [];
  const realSections = sections.filter(section => section && section.title && !isGenericSourceLabel(section.title));
  const outlineText = realSections.map(section => `${section.title} ${section.excerpt || ''} ${(section.terms || []).join(' ')}`).join(' ').toLowerCase();
  if (/\b(classification|classified|types?|categories|includes?|consists of|divided into|groups?)\b/.test(outlineText) && realSections.length >= 3) {
    return { visualNeeded: true, visualType: 'classification_table', reason: 'The source presents categories or parts that are clearer as a table.' };
  }
  if (/\b(compare|contrast|versus|advantages?|disadvantages?|difference)\b/.test(outlineText) && realSections.length >= 2) {
    return { visualNeeded: true, visualType: 'comparison_table', reason: 'The source compares ideas that are clearer side by side.' };
  }
  if (realSections.some(section => section.sourcePage != null || section.slideNumber != null)) {
    return { visualNeeded: true, visualType: 'source_page_reference', reason: 'The source has page or slide anchors that can guide visual review.' };
  }
  if (realSections.length >= 4 && concepts.length >= 4) {
    return { visualNeeded: true, visualType: 'concept_cards', reason: 'Multiple source sections are best reviewed as concrete cards.' };
  }
  if (concepts.length >= 5) {
    return { visualNeeded: true, visualType: 'concept_cards', reason: 'Several source concepts can be grouped safely as cards.' };
  }
  return { visualNeeded: false, visualType: 'no_visual', reason: 'The source is better represented with source cards and checkpoints than a forced diagram.' };
}

function tableRowsFromCards(cards, max = 5) {
  return (cards || []).slice(0, max).map(card => ({
    concept: inlineText(card.title || 'Source concept', 54),
    detail: cleanText(card.text || '', 150),
  }));
}

function sourceVisualFromDecision(decision, lessonTopic, cards, concepts) {
  const nodes = cards.length
    ? cards.map(card => card.title).filter(Boolean).slice(0, 6)
    : [lessonTopic, ...concepts.slice(0, 5)];
  if (decision.visualType === 'classification_table' || decision.visualType === 'comparison_table') {
    return {
      type: decision.visualType,
      nodes,
      edges: [],
      operations: tableRowsFromCards(cards).map(row => `${row.concept}: ${row.detail}`),
      caption: decision.reason,
    };
  }
  if (decision.visualType === 'source_page_reference') {
    return {
      type: 'source_page_reference',
      nodes,
      edges: [],
      operations: ['review source page or slide evidence', 'connect labels to notes'],
      caption: decision.reason,
    };
  }
  if (decision.visualType === 'concept_cards') {
    return {
      type: 'concept_cards',
      nodes,
      edges: nodes.slice(0, -1).map((label, index) => [label, nodes[index + 1]]),
      operations: ['read concept', 'name source detail', 'answer review prompt'],
      caption: decision.reason,
    };
  }
  return null;
}

function reviewQuestionsForLesson(lessonTopic, concepts = []) {
  const topicText = String(lessonTopic || '').toLowerCase();
  if (/\b(tree|bst|binary search)\b/.test(topicText)) {
    return [
      'Which term describes a node with no children in a tree?',
      'Why does BST search move to only one subtree after each comparison?',
      'How are height and depth different in tree terminology?',
    ];
  }
  if (/\b(hash|hashing)\b/.test(topicText)) {
    return [
      'What does a hash function do before a value is stored?',
      'What is a collision in a hash table?',
      'Why does load factor matter for hash table performance?',
    ];
  }
  const cleanConcepts = uniqueList(concepts, 4);
  if (cleanConcepts.length >= 2) {
    return [
      `How does ${cleanConcepts[0]} relate to ${cleanConcepts[1]}?`,
      cleanConcepts[2] ? `When would ${cleanConcepts[2]} matter in this material?` : `Which detail explains ${cleanConcepts[0]} most clearly?`,
      `What mistake would confuse ${cleanConcepts[0]} with a nearby concept?`,
    ];
  }
  return [
    `Which definition is essential for ${lessonTopic}?`,
    `Which relationship or property should you check first when using ${lessonTopic}?`,
    `What example from the material best tests your understanding of ${lessonTopic}?`,
  ];
}

function quizOptionsForLesson(lessonTopic, concepts = []) {
  const topicText = String(lessonTopic || '').toLowerCase();
  const extras = [];
  if (/\b(tree|bst|binary search)\b/.test(topicText)) extras.push('Root node', 'Leaf node', 'Left subtree', 'Inorder traversal');
  if (/\b(hash|hashing)\b/.test(topicText)) extras.push('Hash function', 'Collision', 'Bucket', 'Load factor');
  return uniqueList([...concepts, ...extras], 4);
}

function generalMaterialLesson(topic, materialTitle, grounding, selectedChunkIds, chunks = [], opts = {}) {
  const outline = outlineFromLessonInputs(chunks, { ...opts, topic, materialTitle });
  const planConcepts = opts.sourceTopicPlan && Array.isArray(opts.sourceTopicPlan.topicBundle)
    ? opts.sourceTopicPlan.topicBundle.flatMap(item => [item && item.topic, ...((item && item.terms) || [])])
    : [];
  const fallbackConcepts = uniqueList([
    ...planConcepts,
    ...sourceConceptsFromChunks(chunks, topic, 8),
  ], 12);
  const concepts = outlineConcepts(outline, fallbackConcepts, 10);
  const examples = outlineExamples(outline, chunks, 5);
  const sourceFacts = sourceFactsFromOutline(outline);
  const sourceAnchors = [topic, outline && outline.mainTopic, ...concepts];
  const concreteFacts = rankSourceFacts(
    flattenSourceFacts(sourceFacts, ['definitions', 'facts', 'relationships', 'classifications', 'processes', 'examples', 'numbers'], 28),
    sourceAnchors,
    14
  );
  const classifications = flattenSourceFacts(sourceFacts, ['classifications'], 8);
  const processes = flattenSourceFacts(sourceFacts, ['processes'], 8);
  const reviewQuestions = flattenSourceFacts(sourceFacts, ['reviewQuestions'], 5);
  const lessonTopic = isGenericSourceLabel(topic)
    ? (outline.mainTopic && !isGenericSourceLabel(outline.mainTopic) ? outline.mainTopic : (concepts[0] || 'Study Notes from Uploaded Material'))
    : topic;
  const lesson = baseLesson(lessonTopic, 'general', materialTitle, grounding, selectedChunkIds);
  const mainConcept = concepts[0] || lessonTopic;
  const cards = sourceSectionCards(outline, concepts, 6);
  const visualDecision = visualDecisionForGeneral(outline, concepts);
  const sourcePath = cards.map(card => card.title).filter(Boolean).slice(0, 6);
  const overviewFacts = concreteFacts.slice(0, 4);
  const detailFacts = concreteFacts.slice(0, 8);
  const firstFact = concreteFacts[0]
    || rankSourceFacts(flattenSourceFacts(sourceFacts, ['definitions', 'facts', 'relationships', 'classifications'], 12), sourceAnchors, 1)[0]
    || examples[0]
    || `${lessonTopic} is the central topic identified from the uploaded material.`;
  const classificationText = classifications.length
    ? classifications.join(' ')
    : (cards.length >= 2 ? cards.map(card => `${card.title}: ${card.text}`).join(' ') : '');
  const processText = processes.length ? processes.join(' ') : '';
  const exampleText = rankSourceFacts([
    ...flattenSourceFacts(sourceFacts, ['examples', 'memoryHints', 'numbers'], 8),
    ...examples,
  ], sourceAnchors, 5).join(' ') || examples.slice(0, 3).join(' ');
  const reviewQuizItems = reviewQuestions.length
    ? reviewQuestions.slice(0, 3)
    : reviewQuestionsForLesson(lessonTopic, concepts);
  const quizOptions = quizOptionsForLesson(lessonTopic, concepts);
  lesson.learningObjectives = [
    `Explain ${lessonTopic} using source-grounded definitions and terminology.`,
    `Connect ${mainConcept} to related operations, properties, or examples from the material.`,
    'Answer practice questions with concept reasoning instead of document metadata.',
  ];
  lesson.prerequisites = [];
  lesson.studyGuide = {
    whatYouWillLearn: lesson.learningObjectives.slice(0, 4),
    keyConcepts: concepts.slice(0, 6),
    suggestedOrder: sourcePath.length ? sourcePath.slice(0, 6) : concepts.slice(0, 6),
    prerequisites: [],
    commonMistakes: [
      { mistake: 'Memorizing labels without their meaning', correction: detailFacts[0] || firstFact },
      { mistake: 'Mixing details from separate concepts', correction: sourcePath.length >= 2 ? `Keep ${sourcePath[0]} distinct from ${sourcePath[1]} before connecting them.` : `Tie every detail back to ${lessonTopic}.` },
    ],
    checkpoints: reviewQuizItems.slice(0, 3),
  };
  lesson.sections = [
    section('hook', 'Quick Summary', overviewFacts.join(' ') || firstFact),
    section('definition', 'Core Concepts', firstFact, { cards: cards.slice(0, 4) }),
    section('deep_explanation', 'Key Relationships', detailFacts.join(' ') || cards.map(card => `${card.title}: ${card.text}`).join(' ') || firstFact),
    section('deep_explanation', 'Learning Order', sourcePath.length ? sourcePath.map((item, index) => `${index + 1}. ${item}`).join(' ') : `Start with ${mainConcept}, then connect it to ${concepts.slice(1, 4).join(', ') || lessonTopic}.`),
  ];
  if (classifications.length || cards.length >= 3) {
    lesson.sections.push(section('deep_explanation', classifications.length ? 'Concept Groups' : 'Major Ideas', classificationText || detailFacts.join(' '), {
      cards: cards.slice(0, 6),
    }));
  }
  if (processes.length) {
    lesson.sections.push(section('code_walkthrough', 'Algorithms and Procedures', processText));
  }
  if (visualDecision.visualNeeded) {
    const visual = sourceVisualFromDecision(visualDecision, lessonTopic, cards, concepts);
    lesson.sections.push(section('diagram', 'Source Structure', classificationText || detailFacts.join(' ') || firstFact, {
      diagram: visual,
    }));
  }
  lesson.sections.push(
    section('deep_explanation', 'Examples And Memory Hints', exampleText || detailFacts.slice(0, 3).join(' ') || firstFact),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: [
        { title: 'Memorizing labels without meaning', text: `${mainConcept} should be connected to details such as ${detailFacts[0] || firstFact}.` },
        { title: 'Mixing separate source sections', text: sourcePath.length >= 2 ? `${sourcePath[0]} and ${sourcePath[1]} are related, but each section has its own terms and details.` : `Keep each detail tied to ${lessonTopic}.` },
      ],
    }),
    section('checkpoint', 'Practice Questions', reviewQuizItems.join(' '), {
      quiz: reviewQuizItems.slice(0, 3).map((question, index) => ({
        question,
        options: quizOptions,
        answer: quizOptions[index % Math.max(1, quizOptions.length)] || concepts[index] || concepts[0] || lessonTopic,
        explanation: detailFacts[index] || firstFact,
      })),
    }),
    section('recap', 'Final Review Checklist', `${lessonTopic} includes ${concepts.slice(0, 5).join(', ') || mainConcept}. Check that you can define the terms, explain the relationships, trace any listed procedures, and answer practice questions without relying on document labels. ${detailFacts.slice(0, 2).join(' ') || firstFact}`),
    section('next_steps', 'Related Study Path', `Review ${concepts.slice(0, 3).join(', ') || lessonTopic} in order, then practice with flashcards or a quiz from the same material.`),
  );
  lesson.relatedTopics = concepts.slice(1, 6);
  return normalizeLesson(lesson, { topic: lessonTopic, skipEnsureFallback: true });
}

function quizItemFromKnowledge(item) {
  if (typeof item === 'string') {
    return {
      question: item,
      options: [],
      answer: 'Explain using the rule from the lesson.',
      explanation: 'A good answer names the rule, traces the example, and checks the edge case.',
    };
  }
  return {
    question: item && item.question || '',
    options: item && item.options || [],
    answer: item && item.answer || 'Explain using the rule from the lesson.',
    explanation: item && item.explanation || 'A good answer names the rule, traces the example, and checks the edge case.',
  };
}

function curatedFallbackLesson(topic, knowledge, materialTitle, grounding, selectedChunkIds) {
  const canonical = inlineText(knowledge.topic || topic, 90);
  const lesson = baseLesson(canonical, detectLessonType(canonical), materialTitle, grounding, selectedChunkIds);
  const codeExample = Array.isArray(knowledge.codeExamples) && knowledge.codeExamples.length ? knowledge.codeExamples[0] : null;
  const diagram = Array.isArray(knowledge.diagrams) && knowledge.diagrams.length ? knowledge.diagrams[0] : null;
  const mistakes = (Array.isArray(knowledge.commonMistakes) ? knowledge.commonMistakes : []).slice(0, 4).map(mistakeCard);
  const complexity = complexityText(knowledge.complexity);
  const practice = Array.isArray(knowledge.miniQuiz) && knowledge.miniQuiz.length
    ? knowledge.miniQuiz.map(quizItemFromKnowledge)
    : (Array.isArray(knowledge.practiceQuestions) ? knowledge.practiceQuestions.map(quizItemFromKnowledge) : []);
  const aliases = Array.isArray(knowledge.aliases) ? knowledge.aliases.slice(0, 3).join(', ') : '';

  lesson.learningObjectives = [
    `Define ${canonical} precisely and explain why it matters.`,
    `Trace a concrete ${canonical} example using the diagram and code.`,
    mistakes.length ? `Avoid common ${canonical} mistakes such as ${videoText(mistakes[0].title || mistakes[0].text, 64)}.` : `Apply ${canonical} without relying on vague labels.`,
  ];
  lesson.prerequisites = Array.isArray(knowledge.prerequisites) && knowledge.prerequisites.length
    ? knowledge.prerequisites
    : (lesson.lessonType === 'oop' ? ['Classes and objects', 'Methods', 'Basic Java syntax'] : ['Variables', 'References', 'Basic Java syntax']);
  lesson.sections = [
    section('hook', `Why ${canonical} Matters`, `${canonical} matters because it gives students a reusable mental model instead of isolated facts. ${knowledge.deepExplanation || knowledge.definition || ''}`),
    section('definition', 'Definition', knowledge.definition || `${canonical} is a core computer science concept.`),
    section('deep_explanation', 'Deep Explanation', knowledge.deepExplanation || `Study ${canonical} by naming the parts, tracing one operation, and identifying the rule that must never be broken.`),
    section('analogy', 'Mental Model', knowledge.analogy || (aliases ? `Connect ${canonical} to its neighboring terms: ${aliases}. The analogy is useful only when it preserves the actual rule of the concept.` : `Build a mental model for ${canonical} before memorizing syntax.`)),
    section('diagram', diagram && diagram.caption ? diagram.caption : 'Visual Model', diagram ? `Use this visual model to point to each part of ${canonical} and explain its role.` : `Draw ${canonical} as parts connected by rules.`, {
      diagram: diagram || { type: 'mindmap', nodes: [canonical, 'Definition', 'Example', 'Mistakes'], edges: [[canonical, 'Definition'], [canonical, 'Example']] },
    }),
    section('code_example', codeExample && codeExample.title ? codeExample.title : 'Concrete Code Example', `This code anchors ${canonical} in a real implementation. Read it by asking why each line exists.`, {
      code: codeExample ? {
        language: codeExample.language || 'java',
        content: codeExample.code || codeExample.content || '',
        explanation: Array.isArray(codeExample.walkthrough) && codeExample.walkthrough.length
          ? codeExample.walkthrough
          : autoCodeExplanations(codeExample.code || codeExample.content || '', canonical),
      } : {
        language: 'text',
        content: `${canonical}: add a concrete operation example`,
        explanation: [{ lineRange: '1', text: `Replace this with a working ${canonical} example.` }],
      },
    }),
    section('code_walkthrough', 'Line-by-Line Walkthrough', `Trace the example by explaining the setup, the operation line, and the invariant or result. The goal is to say why each line exists, not only what it says.`),
    section('common_mistakes', 'Common Mistakes', '', {
      cards: mistakes.length
        ? mistakes
        : [{ title: 'Memorizing labels only', text: 'Always connect the name to behavior, code, and a visual example.' }],
    }),
    ...(complexity ? [section('complexity', 'Complexity', complexity)] : []),
    section('checkpoint', 'Mini Checkpoint', practice[0] && practice[0].question || `Explain ${canonical} using one diagram and one code example.`, {
      quiz: practice[0] ? [practice[0]] : [],
    }),
    section('recap', 'Recap', `${canonical} should now connect three things: the definition, the visual model, and the code behavior.`),
    section('next_steps', 'Next Steps', practice[1] && practice[1].question || `Practice ${canonical} by drawing the state before and after one operation.`),
  ];
  lesson.relatedTopics = Array.isArray(knowledge.nextTopics) && knowledge.nextTopics.length
    ? knowledge.nextTopics.slice(0, 5)
    : (Array.isArray(knowledge.aliases) ? knowledge.aliases.slice(0, 5) : []);
  return normalizeLesson(lesson, { topic: canonical, skipEnsureFallback: true });
}

function genericLesson(topic, materialTitle, grounding, selectedChunkIds) {
  const lesson = baseLesson(topic, detectLessonType(topic), materialTitle, grounding, selectedChunkIds);
  lesson.learningObjectives = [`Define ${topic}`, `Explain how ${topic} works`, `Apply ${topic} with a concrete example`];
  lesson.sections = [
    section('hook', `Why ${topic} Matters`, `${topic} is easier to learn when you connect the definition to a concrete example, a diagram, and one mistake to avoid.`),
    section('definition', 'Definition', `${topic} is a CS concept that should be explained with its purpose, rules, and trade-offs.`),
    section('deep_explanation', 'Deep Explanation', `Start by naming the problem ${topic} solves. Then identify the parts, the operation rules, and the reason those rules produce the desired behavior.`),
    section('diagram', 'Visual Model', `Use a diagram to separate the parts of ${topic} and show how they interact.`, {
      diagram: { type: 'mindmap', nodes: [topic, 'Purpose', 'Parts', 'Rules', 'Example', 'Mistakes'], edges: [[topic, 'Purpose'], [topic, 'Parts'], [topic, 'Rules'], [topic, 'Example']], caption: `Mindmap for studying ${topic}.` },
    }),
    section('code_example', 'Example', 'Add a concrete example before memorizing vocabulary.', {
      code: { language: 'text', content: `${topic}: concrete example required`, explanation: [{ lineRange: '1', text: 'Replace this with a topic-specific code or operation example.' }] },
    }),
    section('common_mistakes', 'Common Mistakes', '', { cards: [{ title: 'Memorizing labels only', text: 'Always connect the name to behavior and examples.' }, { title: 'Skipping edge cases', text: 'Ask what can go wrong at boundaries.' }] }),
    section('checkpoint', 'Mini Checkpoint', `Explain ${topic} in one sentence and give one example.`),
    section('recap', 'Recap', `${topic} should be learned as definition, mental model, example, mistake, and practice.`),
  ];
  return normalizeLesson(lesson, { topic, skipEnsureFallback: true });
}

function normalizeCards(cards) {
  return (Array.isArray(cards) ? cards : [])
    .map(card => {
      if (typeof card === 'string') return { title: inlineText(card, 80), text: '' };
      return {
        title: inlineText(card && (card.title || card.label || card.name), 80),
        text: cleanText(card && (card.text || card.content || card.description), 220),
      };
    })
    .filter(card => card.title || card.text)
    .slice(0, 8);
}

function normalizeCode(code) {
  if (!code || typeof code !== 'object') return undefined;
  const content = cleanText(code.content || code.code || '');
  if (!content) return undefined;
  const explanation = (Array.isArray(code.explanation) ? code.explanation : [])
    .map(item => typeof item === 'string'
      ? { lineRange: '', text: cleanText(item, 240) }
      : { lineRange: inlineText(item && item.lineRange, 30), text: cleanText(item && item.text, 260) })
    .filter(item => item.text)
    .slice(0, 8);
  return {
    language: inlineText(code.language || 'text', 24).toLowerCase(),
    content,
    explanation,
  };
}

function normalizeCallouts(callouts) {
  return (Array.isArray(callouts) ? callouts : [])
    .map(callout => {
      if (typeof callout === 'string') return { type: 'remember', text: cleanText(callout, 180), sourceChunkIds: [] };
      const type = CALLOUT_TYPES.includes(callout && callout.type) ? callout.type : 'remember';
      return {
        type,
        text: cleanText(callout && callout.text, 180),
        sourceChunkIds: Array.isArray(callout && callout.sourceChunkIds) ? callout.sourceChunkIds.slice(0, 6) : [],
      };
    })
    .filter(c => c.text)
    .slice(0, 5);
}

function normalizeQuiz(quiz) {
  return (Array.isArray(quiz) ? quiz : [])
    .map(q => ({
      question: cleanText(q && q.question, 220),
      options: Array.isArray(q && q.options) ? q.options.map(o => inlineText(o, 120)).filter(Boolean).slice(0, 5) : [],
      answer: inlineText(q && (q.answer || q.correctAnswer), 160),
      explanation: cleanText(q && q.explanation, 240),
    }))
    .filter(q => q.question)
    .slice(0, 3);
}

function normalizeSection(raw, index) {
  const type = SECTION_TYPES.includes(raw && raw.type) ? raw.type : SECTION_TYPES[Math.min(index, SECTION_TYPES.length - 1)];
  return {
    type,
    title: inlineText(raw && raw.title, 90) || type.replace(/_/g, ' '),
    content: cleanText(raw && raw.content, 2500),
    cards: normalizeCards(raw && raw.cards),
    code: normalizeCode(raw && raw.code),
    diagram: raw && raw.diagram ? diagrams.normalizeDiagram(raw.diagram, type === 'mindmap' ? 'mindmap' : 'flow') : undefined,
    callouts: normalizeCallouts(raw && raw.callouts),
    quiz: normalizeQuiz(raw && raw.quiz),
    sourceVisuals: normalizeSourceVisuals(raw && raw.sourceVisuals || raw && raw.source_visuals || [], 3),
  };
}

function normalizeStudyGuide(rawGuide, opts = {}) {
  const guide = rawGuide && typeof rawGuide === 'object' ? rawGuide : {};
  const sections = opts.sections || [];
  const pick = (primary, fallback) => Array.isArray(primary) && primary.length ? primary : fallback;
  const oldOutline = sections.find(section => /^source outline$/i.test(String(section.title || '').trim()));
  const outlineCards = oldOutline && Array.isArray(oldOutline.cards) ? oldOutline.cards : [];
  const mistakesSection = sections.find(section => section.type === 'common_mistakes');
  const checkpointSection = sections.find(section => section.type === 'checkpoint');
  const rawMistakes = pick(guide.commonMistakes, mistakesSection && mistakesSection.cards || []);
  const commonMistakes = rawMistakes.map(item => ({
    mistake: inlineText(item && (item.mistake || item.title || item.text), 160),
    correction: cleanText(item && (item.correction || item.text || ''), 260),
  })).filter(item => item.mistake).slice(0, 5);
  const checkpointQuestions = checkpointSection && Array.isArray(checkpointSection.quiz)
    ? checkpointSection.quiz.map(item => item && item.question)
    : [];
  const sectionOrder = sections
    .filter(section => !/^source outline$/i.test(String(section.title || '').trim()))
    .map(section => section.title);
  return {
    whatYouWillLearn: uniqueList(pick(guide.whatYouWillLearn, opts.learningObjectives || []), 6),
    keyConcepts: uniqueList(pick(guide.keyConcepts, [opts.topic, ...outlineCards.map(card => card && card.title)]), 8),
    suggestedOrder: uniqueList(pick(guide.suggestedOrder, outlineCards.length ? outlineCards.map(card => card && card.title) : sectionOrder), 8),
    prerequisites: uniqueList(pick(guide.prerequisites, opts.prerequisites || []), 6),
    commonMistakes,
    checkpoints: uniqueList(pick(guide.checkpoints, checkpointQuestions), 6),
  };
}

function normalizeSourceVisual(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sourcePage = raw.sourcePage ?? raw.pageNumber ?? raw.page_number ?? null;
  const slideNumber = raw.slideNumber ?? raw.slide_number ?? null;
  if (sourcePage == null && slideNumber == null && !raw.heading && !raw.caption) return null;
  const heading = sourceTextQuality.sourceLabel(raw.heading || raw.visualTypeGuess || raw.visual_type_guess || raw.caption, 'Source visual');
  return {
    id: raw.id || raw.sourceVisualId || raw.source_visual_id || null,
    materialId: raw.materialId || raw.material_id || null,
    pageNumber: sourcePage != null ? Number(sourcePage) : null,
    sourcePage: sourcePage != null ? Number(sourcePage) : null,
    slideNumber: slideNumber != null ? Number(slideNumber) : null,
    heading: inlineText(heading, 100),
    caption: inlineText(raw.caption || heading || 'Source visual', 160),
    nearbyText: inlineText(raw.nearbyText || raw.nearby_text || raw.evidence || '', 260),
    ocrText: inlineText(raw.ocrText || raw.ocr_text || '', 260),
    evidence: inlineText(raw.evidence || raw.nearbyText || raw.nearby_text || '', 260),
    visualTypeGuess: inlineText(raw.visualTypeGuess || raw.visual_type_guess || '', 80),
    explanation: inlineText(raw.explanation || raw.description || '', 220),
    importanceScore: Number(raw.importanceScore || raw.importance_score || 0),
    imagePath: raw.imagePath || raw.image_path || null,
    thumbnailPath: raw.thumbnailPath || raw.thumbnail_path || null,
  };
}

function normalizeSourceVisuals(values = [], max = 8) {
  const seen = new Set();
  const out = [];
  for (const item of values || []) {
    const visual = normalizeSourceVisual(item);
    if (!visual) continue;
    const key = [visual.sourcePage, visual.slideNumber, visual.heading].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(visual);
    if (out.length >= max) break;
  }
  return out;
}

function visualMatchWords(value) {
  return [...new Set(String(value || '').toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(word => word.length >= 3 && !/^(the|and|for|that|this|with|from|page|slide|source|visual|image|definition)$/.test(word)))];
}

function sectionMatchText(section) {
  return [
    section.title,
    section.type,
    section.content,
    ...(section.cards || []).flatMap(card => [card && card.title, card && card.text]),
    ...(section.callouts || []).map(callout => callout && callout.text),
    section.diagram && section.diagram.caption,
  ].filter(Boolean).join(' ').toLowerCase();
}

function explainSourceVisualForSection(visual, section) {
  const desc = inlineText(visual.ocrText || visual.nearbyText || visual.evidence || visual.caption || '', 180);
  if (visual.explanation) return visual.explanation;
  if (desc) return `This source image supports ${section.title}: ${desc}`;
  return `This source image supports the section on ${section.title}.`;
}

function attachSourceVisualsToSections(lesson, sourceVisuals = []) {
  const sections = (lesson.sections || []).map(section => ({
    ...section,
    sourceVisuals: normalizeSourceVisuals(section.sourceVisuals || [], 3),
  }));
  const visuals = normalizeSourceVisuals(sourceVisuals, env.SOURCE_VISUALS_MAX_PER_MATERIAL || 8);
  if (!sections.length || !visuals.length) return { ...lesson, sections, sourceVisuals: visuals };
  const assigned = new Set(sections.flatMap(section => section.sourceVisuals || []).map(v => String(v.id || `${v.sourcePage}:${v.slideNumber}:${v.heading}`)));
  const sectionTexts = sections.map(sectionMatchText);
  for (const visual of visuals) {
    const visualKey = String(visual.id || `${visual.sourcePage}:${visual.slideNumber}:${visual.heading}`);
    if (assigned.has(visualKey)) continue;
    const vText = [visual.heading, visual.caption, visual.nearbyText, visual.ocrText, visual.evidence, visual.visualTypeGuess].filter(Boolean).join(' ');
    const words = visualMatchWords(vText);
    if (!words.length) continue;
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < sectionTexts.length; i += 1) {
      const score = words.filter(word => sectionTexts[i].includes(word)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore < 1) continue;
    if ((sections[bestIdx].sourceVisuals || []).length >= 2) continue;
    sections[bestIdx].sourceVisuals = [
      ...(sections[bestIdx].sourceVisuals || []),
      { ...visual, explanation: explainSourceVisualForSection(visual, sections[bestIdx]) },
    ];
    assigned.add(visualKey);
  }
  return { ...lesson, sections, sourceVisuals: visuals };
}

function attachSourceVisuals(lesson, opts = {}) {
  const fromLesson = lesson && Array.isArray(lesson.sourceVisuals) ? lesson.sourceVisuals : [];
  const fromOpts = opts.sourceVisualCandidates || opts.sourceVisuals || [];
  const withVisuals = {
    ...lesson,
    sourceVisuals: normalizeSourceVisuals([...fromLesson, ...fromOpts], env.SOURCE_VISUALS_MAX_PER_MATERIAL || 8),
  };
  return attachSourceVisualsToSections(withVisuals, withVisuals.sourceVisuals);
}

function ensureRequiredSections(lesson, opts = {}) {
  const existing = new Set(lesson.sections.map(s => s.type));
  const fallback = fallbackLesson(lesson.topic || opts.topic || 'Object-Oriented Programming', {
    ...opts,
    title: lesson.sourceMaterial && lesson.sourceMaterial.title,
    groundingTier: lesson.sourceMaterial && lesson.sourceMaterial.grounding,
  });
  const requiresCode = isCsLessonForQuality(lesson, opts);
  const required = requiresCode
    ? ['hook', 'definition', 'deep_explanation', 'diagram', 'code_example', 'code_walkthrough', 'common_mistakes', 'checkpoint', 'recap']
    : ['hook', 'definition', 'deep_explanation', 'common_mistakes', 'checkpoint', 'recap', 'next_steps'];
  if (!requiresCode && opts.visualRequired) required.splice(3, 0, 'diagram');
  for (const type of required) {
    if (existing.has(type)) continue;
    const s = fallback.sections.find(item => item.type === type);
    if (s) lesson.sections.push(s);
  }
}

function normalizeLesson(raw, opts = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const topic = inlineText(src.topic || opts.topic || opts.title || 'Object-Oriented Programming', 90);
  const learningObjectives = uniqueList(src.learningObjectives || [], 6);
  const prerequisites = uniqueList(src.prerequisites || [], 6);
  const normalizedSections = (Array.isArray(src.sections) ? src.sections : []).map(normalizeSection).filter(s => s.title);
  const lesson = {
    topic,
    audienceLevel: inlineText(src.audienceLevel || 'beginner', 40) || 'beginner',
    lessonType: ['oop', 'data_structure', 'algorithm', 'general'].includes(src.lessonType) ? src.lessonType : detectLessonType(topic),
    sourceMaterial: {
      title: inlineText(src.sourceMaterial && src.sourceMaterial.title || opts.materialTitle || opts.title || '', 120),
      grounding: inlineText(src.sourceMaterial && src.sourceMaterial.grounding || opts.groundingTier || 'moderate', 40),
      selectedChunkIds: Array.isArray(src.sourceMaterial && src.sourceMaterial.selectedChunkIds) && src.sourceMaterial.selectedChunkIds.length
        ? src.sourceMaterial.selectedChunkIds.slice(0, 12)
        : (opts.chunks || []).slice(0, 8).map(c => c.id).filter(Boolean),
    },
    learningObjectives,
    prerequisites,
    studyGuide: normalizeStudyGuide(src.studyGuide || src.learningPath, { topic, sections: normalizedSections, learningObjectives, prerequisites }),
    sections: normalizedSections.filter(section => !/^source outline$/i.test(String(section.title || '').trim())),
    relatedTopics: uniqueList(src.relatedTopics || [], 8),
    sourceVisuals: normalizeSourceVisuals([...(src.sourceVisuals || []), ...(opts.sourceVisualCandidates || opts.sourceVisuals || [])], env.SOURCE_VISUALS_MAX_PER_MATERIAL || 8),
    topicMode: src.topicMode || opts.topicMode || undefined,
    sourceRepair: !!(src.sourceRepair || opts.sourceRepair),
  };
  if (lesson.learningObjectives.length < 2 && !opts.skipEnsureFallback) {
    lesson.learningObjectives = fallbackLesson(topic, opts).learningObjectives.slice(0, 4);
  }
  if (lesson.sections.length < 6 && !opts.skipEnsureFallback) {
    const fb = fallbackLesson(topic, opts);
    lesson.sections = lesson.sections.concat(fb.sections).slice(0, 12);
  }
  if (!opts.skipEnsureFallback) ensureRequiredSections(lesson, opts);
  lesson.studyGuide = normalizeStudyGuide(lesson.studyGuide, {
    topic,
    sections: lesson.sections,
    learningObjectives: lesson.learningObjectives,
    prerequisites: lesson.prerequisites,
  });
  lesson.sections = lesson.sections.slice(0, 14);
  return attachSourceVisualsToSections(lesson, lesson.sourceVisuals);
}

function isCsLessonForQuality(lesson, opts = {}) {
  const domain = String(opts.domain || opts.domainInfo && opts.domainInfo.domain || '').toLowerCase();
  const lessonType = String((lesson && lesson.lessonType) || opts.lessonType || '').toLowerCase();
  const topic = String((lesson && lesson.topic) || opts.topic || '').toLowerCase();
  if (opts.topicMode === 'material_wide' || opts.topicMode === 'source_repair' || opts.sourceRepair || lesson && lesson.sourceRepair) return false;
  if (domain && domain !== 'cs') return false;
  if (['oop', 'data_structure', 'algorithm'].includes(lessonType)) return true;
  return detectLessonType(topic) !== 'general';
}

const GENERAL_NOTE_INSTRUCTION_RE = /\b(choose one concrete detail|name one key idea|read the material as|for each idea|source-backed ideas|the detailed notes above|this visual only|treat the material like|write the definition|supporting detail and the relationship|strong answer names a source concept)\b/i;

function normalizedForCoverage(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function factSignature(value) {
  const words = normalizedForCoverage(value)
    .split(/\s+/)
    .filter(word => word.length >= 4 && !['source', 'material', 'uploaded', 'section', 'details', 'concept', 'important'].includes(word));
  return words.slice(0, 6);
}

function countSourceFactCoverage(visible, sourceOutline) {
  const facts = sourceFactsFromOutline(sourceOutline || {});
  const values = flattenSourceFacts(facts, ['definitions', 'facts', 'relationships', 'classifications', 'processes', 'examples', 'numbers'], 30);
  const hay = normalizedForCoverage(visible);
  let covered = 0;
  for (const value of values) {
    const sig = factSignature(value);
    if (sig.length < 3) continue;
    const hits = sig.filter(word => hay.includes(word)).length;
    if (hits >= Math.min(4, sig.length)) covered += 1;
  }
  return { covered, available: values.length, values };
}

function countSourceSectionCoverage(visible, sourceOutline) {
  const hay = normalizedForCoverage(visible);
  const sections = Array.isArray(sourceOutline && sourceOutline.meaningfulSections)
    ? sourceOutline.meaningfulSections.filter(section => section && section.title && !isGenericSourceLabel(section.title))
    : [];
  let covered = 0;
  for (const section of sections) {
    const titleWords = factSignature(section.title);
    const titleHit = titleWords.length && titleWords.every(word => hay.includes(word));
    const facts = sourceFactsFromOutline({ sourceFacts: section.sourceFacts });
    const sectionFacts = flattenSourceFacts(facts, ['definitions', 'facts', 'relationships', 'classifications', 'processes', 'examples', 'numbers'], 4);
    const factHit = sectionFacts.some(value => {
      const sig = factSignature(value);
      return sig.length >= 3 && sig.filter(word => hay.includes(word)).length >= Math.min(4, sig.length);
    });
    if (titleHit || factHit) covered += 1;
  }
  return { covered, available: sections.length };
}

function countTextOccurrences(text, needle) {
  const hay = normalizedForCoverage(text);
  const term = normalizedForCoverage(needle);
  if (!hay || !term || term.length < 4) return 0;
  return hay.split(term).length - 1;
}

function hasRepeatedGeneralHeadingLoop(visible, lesson, sourceOutline) {
  const lines = String(visible || '')
    .split(/\n+/)
    .map(line => normalizedForCoverage(line))
    .filter(line => line.length >= 24);
  const counts = new Map();
  for (const line of lines) {
    if (line.split(/\s+/).length > 8) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  if ([...counts.values()].some(count => count >= 4)) return true;
  return false;
}

function scoreLesson(lesson, opts = {}) {
  const all = JSON.stringify(lesson || {}).toLowerCase();
  const visible = lessonToMarkdown(lesson || {});
  const sections = Array.isArray(lesson && lesson.sections) ? lesson.sections : [];
  const sourceRepairMode = !!(opts.sourceRepair || opts.topicMode === 'source_repair' || (lesson && lesson.sourceRepair));
  const requiresCode = isCsLessonForQuality(lesson, opts);
  const hasCode = sections.some(s => s.code && s.code.content && s.code.content.length > 40);
  const hasDiagram = sections.some(s => s.diagram && s.diagram.nodes && s.diagram.nodes.length >= 3);
  const hasMistakes = sections.some(s => s.type === 'common_mistakes' && (s.cards.length || s.content.length > 40));
  const hasQuiz = sections.some(s => s.quiz && s.quiz.length);
  const selectedChunkCount = Array.isArray(lesson && lesson.sourceMaterial && lesson.sourceMaterial.selectedChunkIds)
    ? lesson.sourceMaterial.selectedChunkIds.length
    : 0;
  const outlineEvidenceCount = opts.sourceOutline && Array.isArray(opts.sourceOutline.sourceEvidence)
    ? opts.sourceOutline.sourceEvidence.length
    : 0;
  const hasSourceGrounding = selectedChunkCount > 0 || (Array.isArray(opts.chunks) && opts.chunks.length > 0) || outlineEvidenceCount > 0;
  const sourceTerms = Array.isArray(opts.chunks)
    ? sourceConceptsFromChunks(opts.chunks, lesson && lesson.topic, 10).map(term => String(term || '').toLowerCase())
    : [];
  const outlineTerms = opts.sourceOutline && Array.isArray(opts.sourceOutline.keyConcepts)
    ? opts.sourceOutline.keyConcepts.map(term => String(term || '').toLowerCase())
    : [];
  const outlineSectionTerms = opts.sourceOutline && Array.isArray(opts.sourceOutline.meaningfulSections)
    ? opts.sourceOutline.meaningfulSections.flatMap(section => [
      section && section.title,
      ...(Array.isArray(section && section.terms) ? section.terms : []),
    ]).map(term => String(term || '').toLowerCase())
    : [];
  const combinedSourceTerms = uniqueList([...sourceTerms, ...outlineTerms, ...outlineSectionTerms], 18).map(term => String(term || '').toLowerCase());
  const mentionsSourceTerms = combinedSourceTerms.some(term => term && visible.toLowerCase().includes(term));
  const hasGroundedGeneralContent = !requiresCode && hasSourceGrounding && (
    mentionsSourceTerms ||
    sections.filter(s => String(s.content || '').length > 60).length >= 5
  );
  const genericTopic = /^(document|file|material|chapter\s*\d+|\d+)$/i.test(String(lesson && lesson.topic || '').trim());
  const hasPlaceholders = /(trace an example|define the idea|apply main rule|code sketch|avoid mistakes|placeholder|todo\b|useconcept|concrete example required|replace this with a topic-specific)/i.test(all);
  const hasGenericChapterText = /\bdefine\s+chapter\b|chapter\s+\d+\s+is a cs concept|chapter\s+\d+\s+should be learned as definition/i.test(visible);
  const genericMindmapOnly = sections.some((s) => {
    const diagram = s.diagram || {};
    const labels = (diagram.nodes || []).map(n => String(typeof n === 'string' ? n : (n.label || n.id || n.name || '')).toLowerCase());
    const genericLabels = ['purpose', 'parts', 'rules', 'example', 'mistakes'];
    return (s.type === 'mindmap' || diagram.type === 'mindmap' || diagram.type === 'flow') &&
      labels.length >= 4 &&
      labels.filter(label => genericLabels.includes(label)).length >= Math.min(4, labels.length);
  });
  const sourceFreeGeneral = !requiresCode && !hasSourceGrounding;
  const generalInstructionalFailure = !requiresCode && GENERAL_NOTE_INSTRUCTION_RE.test(visible);
  const factCoverage = !requiresCode ? countSourceFactCoverage(visible, opts.sourceOutline) : { covered: 0, available: 0, values: [] };
  const sectionCoverage = !requiresCode ? countSourceSectionCoverage(visible, opts.sourceOutline) : { covered: 0, available: 0 };
  const minFactCoverage = factCoverage.available >= 5 ? 5 : Math.min(2, factCoverage.available);
  const minSectionCoverage = sectionCoverage.available >= 3 ? 3 : Math.min(1, sectionCoverage.available);
  const weakSourceFactCoverage = !requiresCode && factCoverage.available > 0 && factCoverage.covered < minFactCoverage;
  const weakSourceSectionCoverage = !requiresCode && sectionCoverage.available > 1 && sectionCoverage.covered < minSectionCoverage;
  const repeatedGeneralHeadingLoop = !requiresCode && hasRepeatedGeneralHeadingLoop(visible, lesson, opts.sourceOutline);
  const repeatedGeneralHeadingFailure = repeatedGeneralHeadingLoop && !sourceRepairMode;
  const hasStudyGuide = !!(
    lesson && lesson.studyGuide &&
    Array.isArray(lesson.studyGuide.whatYouWillLearn) && lesson.studyGuide.whatYouWillLearn.length &&
    Array.isArray(lesson.studyGuide.keyConcepts) && lesson.studyGuide.keyConcepts.length
  );
  const genericFailure = sourceFreeGeneral ||
    (genericTopic && !hasGroundedGeneralContent) ||
    hasGenericChapterText ||
    (genericMindmapOnly && requiresCode) ||
    hasPlaceholders ||
    generalInstructionalFailure ||
    weakSourceFactCoverage ||
    weakSourceSectionCoverage ||
    repeatedGeneralHeadingFailure;
  const criteria = [
    sections.length >= 8,
    requiresCode ? hasCode : true,
    requiresCode || opts.visualRequired ? hasDiagram : true,
    hasMistakes,
    hasQuiz,
    !genericFailure,
    (lesson.learningObjectives || []).length >= 2,
    hasStudyGuide,
  ];
  const score = criteria.filter(Boolean).length / criteria.length;
  return {
    score: Math.round(score * 1000) / 1000,
    passed: score >= 0.75 && !genericFailure,
    hasPlaceholders,
    genericTopic,
    hasGenericChapterText,
    genericMindmapOnly,
    requiresCode,
    generalInstructionalFailure,
    factCoverage: { covered: factCoverage.covered, available: factCoverage.available },
    sectionCoverage,
    weakSourceFactCoverage,
    weakSourceSectionCoverage,
    repeatedGeneralHeadingLoop,
    repeatedGeneralHeadingFailure,
    hasStudyGuide,
    genericFailure,
  };
}

async function parseLessonJson(raw, opts = {}) {
  const parsed = await parseJsonSafe(raw, EducationalLessonSchema, async (txt) => (
    ai.generate(prompts.REPAIR_JSON(txt), {
      provider: opts.provider,
      feature: 'notes',
      format: 'json',
      temperature: 0,
      max_tokens: 1200,
      num_predict: 1200,
    })
  ));
  return normalizeLesson(parsed, opts);
}

async function generateEducationalLesson(opts = {}) {
  const topic = inlineText(opts.topic || opts.title || 'Object-Oriented Programming', 90);
  const domain = String(opts.domain || opts.domainInfo && opts.domainInfo.domain || '').toLowerCase();
  const allowCurated = !domain || domain === 'cs';
  const curated = allowCurated
    ? (opts.curatedKnowledge || (opts.curatedTopicId ? loadCuratedKnowledge(opts.curatedTopicId) : null) || loadCuratedKnowledge(topic))
    : null;
  const selectedChunks = (opts.chunks || []).slice(0, 8);
  const fallback = fallbackLesson(topic, { ...opts, chunks: selectedChunks });
  const prompt = prompts.LESSON_GENERATE
    ? prompts.LESSON_GENERATE(selectedChunks, opts.title || topic, {
      topic,
      lessonType: opts.lessonType || detectLessonType(topic),
      curatedKnowledge: curatedAsPrompt(curated),
      educationalContext: opts.educationalContextPrompt || opts.educationalContext || '',
      sourceOutline: opts.sourceOutline || null,
      sourceFacts: opts.sourceFacts || opts.sourceOutline || null,
      topicMap: opts.topicMap || opts.sourceTopicPlan && opts.sourceTopicPlan.topicMap || null,
      sourceTopicPlan: opts.sourceTopicPlan || null,
      groundingTier: opts.groundingTier || 'moderate',
      enrichmentPolicyPrompt: opts.enrichmentPolicyPrompt || '',
    })
    : '';

  if (!prompt) return attachSourceVisuals(fallback, opts);

  try {
    const raw = await ai.generate(prompt, {
      feature: 'notes',
      format: 'json',
      temperature: opts.temperature ?? 0.25,
      num_ctx: opts.num_ctx || 8192,
      max_tokens: opts.max_tokens || env.GROQ_NOTES_MAX_OUTPUT_TOKENS || 3500,
      num_predict: opts.num_predict || 3500,
    });
    const lesson = await parseLessonJson(raw, { ...opts, topic, chunks: selectedChunks });
    const quality = scoreLesson(lesson, opts);
    if (!quality.passed) {
      const merged = normalizeLesson({
        ...fallback,
        sourceMaterial: lesson.sourceMaterial || fallback.sourceMaterial,
        sections: mergeSections(lesson.sections, fallback.sections),
      }, { ...opts, topic, chunks: selectedChunks });
      return attachSourceVisuals({ ...merged, quality }, opts);
    }
    return attachSourceVisuals({ ...lesson, quality }, opts);
  } catch (_) {
    return attachSourceVisuals({ ...fallback, quality: { score: 0, passed: false, fallback: true } }, opts);
  }
}

function mergeSections(primary, fallback) {
  const byType = new Map();
  for (const s of fallback || []) byType.set(s.type, s);
  for (const s of primary || []) {
    if (s && s.type) byType.set(s.type, s);
  }
  const order = ['hook', 'definition', 'deep_explanation', 'analogy', 'diagram', 'mindmap', 'code_example', 'code_walkthrough', 'complexity', 'common_mistakes', 'checkpoint', 'recap', 'next_steps'];
  return order.map(type => byType.get(type)).filter(Boolean);
}

function extractMarkdownFromModelOutput(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  const candidate = extractJson(text);
  let parsed = null;
  if (candidate) {
    try { parsed = JSON.parse(candidate); } catch (_) { parsed = null; }
  }
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.markdown === 'string') text = parsed.markdown;
    else if (typeof parsed.body_md === 'string') text = parsed.body_md;
    else if (parsed.lesson || parsed.sections) text = lessonToMarkdown(normalizeLesson(parsed.lesson || parsed));
  }
  text = text.replace(/\\n/g, '\n');
  return cleanText(text);
}

function markdownEscape(text) {
  return String(text || '').replace(/\|/g, '\\|');
}

function diagramToMermaid(diagram) {
  const d = diagrams.normalizeDiagram(diagram);
  if (!d.nodes.length) return '';
  if (d.type === 'uml_class' || d.type === 'inheritance_tree') {
    const lines = ['classDiagram'];
    for (const node of d.nodes) {
      lines.push(`class ${node.id.replace(/\W+/g, '') || 'Node'} {`);
      for (const field of node.fields || []) lines.push(`  ${field}`);
      for (const method of node.methods || []) lines.push(`  ${method}`);
      lines.push('}');
    }
    for (const edge of d.edges) lines.push(`${edge[1].replace(/\W+/g, '')} <|-- ${edge[0].replace(/\W+/g, '')}`);
    return lines.join('\n');
  }
  const lines = ['flowchart LR'];
  for (const node of d.nodes) lines.push(`  ${node.id.replace(/\W+/g, '') || 'N'}["${node.label}"]`);
  for (const edge of d.edges) lines.push(`  ${edge[0].replace(/\W+/g, '')} --> ${edge[1].replace(/\W+/g, '')}`);
  return lines.join('\n');
}

function sourceVisualMarkdownKey(v) {
  return String(v && (v.id || `${v.sourcePage || v.pageNumber || ''}:${v.slideNumber || ''}:${v.heading || ''}`)).toLowerCase();
}

function sourceVisualMarkdownLine(v) {
  const heading = sourceTextQuality.sourceLabel(v.heading || v.visualTypeGuess || 'source visual', 'Source visual');
  const desc = inlineText(v.explanation || v.ocrText || v.nearbyText || v.evidence || '', 220);
  const imgRef = v.imagePath ? ` _(image: ${v.imagePath})_` : '';
  return `> **[Source visual: ${inlineText(heading, 100)}]**${desc ? ` ${desc}` : ''}${imgRef}`;
}

function lessonToMarkdown(lessonInput) {
  const sourceOnlyMarkdown = lessonInput && (lessonInput.topicMode === 'material_wide' || lessonInput.sourceRepair);
  const markdownOpts = sourceOnlyMarkdown
    ? { topicMode: lessonInput.topicMode || 'source_repair', sourceRepair: !!lessonInput.sourceRepair, skipEnsureFallback: true }
    : {};
  const lesson = normalizeLesson(lessonInput || {}, markdownOpts);
  const lines = [`# ${lesson.topic}`, ''];
  if (lesson.learningObjectives.length) {
    lines.push('## Learning Objectives');
    for (const obj of lesson.learningObjectives) lines.push(`- ${obj}`);
    lines.push('');
  }
  const guide = lesson.studyGuide || {};
  if ((guide.whatYouWillLearn || []).length || (guide.keyConcepts || []).length) {
    lines.push('## Study Guide', '');
    if ((guide.whatYouWillLearn || []).length) {
      lines.push('### What you will learn');
      for (const item of guide.whatYouWillLearn) lines.push(`- ${item}`);
      lines.push('');
    }
    if ((guide.keyConcepts || []).length) lines.push(`**Key concepts:** ${guide.keyConcepts.join(', ')}`, '');
    if ((guide.suggestedOrder || []).length) {
      lines.push('### Suggested learning order');
      guide.suggestedOrder.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
      lines.push('');
    }
    if ((guide.prerequisites || []).length) lines.push(`**Prerequisites:** ${guide.prerequisites.join(', ')}`, '');
    if ((guide.commonMistakes || []).length) {
      lines.push('### Common mistakes');
      for (const item of guide.commonMistakes) lines.push(`- **${item.mistake}:** ${item.correction || 'Review the related source concept.'}`);
      lines.push('');
    }
    if ((guide.checkpoints || []).length) {
      lines.push('### Quick checkpoints');
      for (const item of guide.checkpoints) lines.push(`- ${item}`);
      lines.push('');
    }
  }
  const inlineVisualKeys = new Set();
  for (const s of lesson.sections) {
    lines.push(`## ${s.title}`);
    if (s.content) lines.push('', s.content, '');
    for (const card of s.cards || []) {
      lines.push(`> **${card.title || 'Key idea'}:** ${card.text || ''}`);
    }
    if (s.cards && s.cards.length) lines.push('');
    if (s.code && s.code.content) {
      lines.push(`\`\`\`${s.code.language || 'text'}`, s.code.content, '```', '');
      for (const item of s.code.explanation || []) {
        lines.push(`- ${item.lineRange ? `Lines ${item.lineRange}: ` : ''}${item.text}`);
      }
      if (s.code.explanation && s.code.explanation.length) lines.push('');
    }
    if (s.diagram && s.diagram.nodes && s.diagram.nodes.length) {
      const mermaid = diagramToMermaid(s.diagram);
      if (mermaid) lines.push('```mermaid', mermaid, '```', '');
      if (s.diagram.caption) lines.push(`_${s.diagram.caption}_`, '');
    }
    for (const callout of s.callouts || []) lines.push(`> **${markdownEscape(callout.type)}:** ${callout.text}`);
    if (s.callouts && s.callouts.length) lines.push('');
    for (const v of s.sourceVisuals || []) {
      lines.push(sourceVisualMarkdownLine(v));
      lines.push('');
      inlineVisualKeys.add(sourceVisualMarkdownKey(v));
    }
    for (const q of s.quiz || []) {
      lines.push(`**Question:** ${q.question}`);
      if (q.options && q.options.length) for (const opt of q.options) lines.push(`- ${opt}`);
      if (q.answer) lines.push(`**Answer:** ${q.answer}`);
      if (q.explanation) lines.push(q.explanation);
      lines.push('');
    }
  }
  if (lesson.sourceVisuals && lesson.sourceVisuals.length) {
    const unmatchedVisuals = lesson.sourceVisuals.filter(v => !inlineVisualKeys.has(sourceVisualMarkdownKey(v)));
    const sectionTexts = lesson.sections.map(s => [s.title, s.content, ...(s.cards || []).map(c => c.text)].filter(Boolean).join(' ').toLowerCase());
    const visualInsertions = new Map();
    for (let vi = unmatchedVisuals.length - 1; vi >= 0; vi--) {
      const v = unmatchedVisuals[vi];
      const vText = [v.heading, v.nearbyText, v.ocrText, v.visualTypeGuess].filter(Boolean).join(' ').toLowerCase();
      const vWords = vText.split(/\s+/).filter(w => w.length >= 3);
      if (!vWords.length) continue;
      let bestIdx = -1, bestScore = 0;
      for (let si = 0; si < sectionTexts.length; si++) {
        const score = vWords.filter(w => sectionTexts[si].includes(w)).length;
        if (score > bestScore) { bestScore = score; bestIdx = si; }
      }
      if (bestIdx >= 0 && bestScore >= 1) {
        if (!visualInsertions.has(bestIdx)) visualInsertions.set(bestIdx, []);
        visualInsertions.get(bestIdx).push(v);
        unmatchedVisuals.splice(vi, 1);
      }
    }
    const insertedSections = new Set();
    const sectionLines = lines.length;
    let insertOffset = 0;
    for (let si = 0; si < lesson.sections.length; si++) {
      if (!visualInsertions.has(si)) continue;
      const sectionTitle = lesson.sections[si].title;
      let pos = -1;
      for (let li = 0; li < lines.length; li++) {
        if (lines[li] === `## ${sectionTitle}`) { pos = li; break; }
      }
      if (pos < 0) continue;
      let endPos = pos + 1;
      while (endPos < lines.length && !lines[endPos].startsWith('## ')) endPos++;
      const visuals = visualInsertions.get(si);
      const insertLines = [];
      for (const v of visuals) {
        const heading = sourceTextQuality.sourceLabel(v.heading || v.visualTypeGuess || 'source visual', 'Source visual');
        const desc = inlineText(v.ocrText || v.nearbyText || v.evidence || '', 200);
        const imgRef = v.imagePath ? ` _(image: ${v.imagePath})_` : '';
        insertLines.push(`> **[Source visual: ${inlineText(heading, 100)}]**${desc ? ` ${desc}` : ''}${imgRef}`);
        insertLines.push('');
      }
      lines.splice(endPos, 0, ...insertLines);
      insertedSections.add(si);
    }
    if (unmatchedVisuals.length) {
      lines.push('## Additional Visuals From the Material');
      for (const v of unmatchedVisuals) {
        const heading = sourceTextQuality.sourceLabel(v.heading || v.visualTypeGuess || 'source visual', 'Source visual');
        const desc = inlineText(v.ocrText || v.nearbyText || v.evidence || '', 200);
        const imgRef = v.imagePath ? ` _(image: ${v.imagePath})_` : '';
        lines.push(`> **[Source visual: ${inlineText(heading, 100)}]**${desc ? ` ${desc}` : ''}${imgRef}`);
      }
      lines.push('');
    }
  }
  if (lesson.relatedTopics.length) {
    lines.push('## Related Topics');
    for (const item of lesson.relatedTopics) lines.push(`- ${item}`);
  }
  return cleanText(lines.join('\n'));
}

function sectionByType(lesson, type) {
  return (lesson.sections || []).find(s => s.type === type) || null;
}

function textSentences(text, minChars = 170) {
  const value = inlineText(text, 900);
  if (value.length >= minChars) return value;
  return `${value} Notice the reason behind the idea: the structure is useful because it gives the topic a predictable way to organize meaning, examples, and common mistakes.`;
}

function legacyLessonToVideoScript(lessonInput) {
  const lesson = normalizeLesson(lessonInput || {});
  const hook = sectionByType(lesson, 'hook');
  const def = sectionByType(lesson, 'definition');
  const deep = sectionByType(lesson, 'deep_explanation');
  const analogy = sectionByType(lesson, 'analogy');
  const diagram = sectionByType(lesson, 'diagram') || sectionByType(lesson, 'mindmap');
  const code = sectionByType(lesson, 'code_example');
  const walk = sectionByType(lesson, 'code_walkthrough');
  const complexity = sectionByType(lesson, 'complexity');
  const mistakes = sectionByType(lesson, 'common_mistakes');
  const checkpoint = sectionByType(lesson, 'checkpoint');
  const recap = sectionByType(lesson, 'recap');
  const next = sectionByType(lesson, 'next_steps');
  const hasCodeSection = !!(code && code.code && String(code.code.content || '').trim());

  const slide = (slideType, title, bullets, narration, extra = {}) => ({
    slideType,
    slide_type: slideType,
    title: inlineText(title, 100),
    visual_type: extra.visual_type || 'mindmap',
    bullets: uniqueList(bullets, 5),
    visual_nodes: uniqueList(extra.visual_nodes || bullets, 8),
    visual_edges: (extra.visual_edges || []).slice(0, 12),
    callouts: uniqueList(extra.callouts || [], 3),
    example_code: extra.example_code || '',
    narration: textSentences(narration, slideType === 'title' || slideType === 'quiz' ? 80 : 150),
  });

  const diagramVisual = diagram && diagram.diagram ? diagrams.toSlideVisual(diagram.diagram) : { type: 'mindmap', nodes: [lesson.topic, 'Definition', 'Example', 'Mistakes'], edges: [[lesson.topic, 'Definition']] };
  const codeObj = code && code.code;
  const walkBullets = codeObj && codeObj.explanation && codeObj.explanation.length
    ? codeObj.explanation.map(item => `${item.lineRange ? item.lineRange + ': ' : ''}${item.text}`)
    : [walk && walk.content, 'Trace inputs, state changes, and output'].filter(Boolean);
  const mistakeBullets = mistakes && mistakes.cards && mistakes.cards.length
    ? mistakes.cards.map(c => `${c.title}: ${c.text}`)
    : [mistakes && mistakes.content, 'Name the misconception and the correction'].filter(Boolean);
  const quiz = checkpoint && checkpoint.quiz && checkpoint.quiz[0];

  const slides = [
    slide('title', lesson.topic, [hook && hook.content, ...(lesson.learningObjectives || []).slice(0, 2)], hook && hook.content || `Today we will learn ${lesson.topic}.`, {
      visual_type: 'mindmap',
      visual_nodes: [lesson.topic, 'Why it matters', hasCodeSection ? 'Code' : 'Example', 'Diagram', 'Mistakes'],
      visual_edges: [[lesson.topic, 'Why it matters'], [lesson.topic, hasCodeSection ? 'Code' : 'Example'], [lesson.topic, 'Diagram']],
      callouts: lesson.sourceMaterial && lesson.sourceMaterial.grounding === 'weak' ? ['Uploaded material had limited detail; enhanced with standard CS knowledge.'] : [],
    }),
    slide('objectives', 'Learning Objectives', lesson.learningObjectives, `By the end, you should be able to ${lesson.learningObjectives.join(', ').replace(/, ([^,]*)$/, ', and $1')}.`, {
      visual_type: 'summary',
      visual_nodes: ['Objectives', ...lesson.learningObjectives.slice(0, 4)],
      visual_edges: lesson.learningObjectives.slice(0, 4).map(o => ['Objectives', o]),
    }),
    slide('concept', def ? def.title : 'Core Definition', [def && def.content, deep && deep.content].filter(Boolean), `${def ? def.content : ''} ${deep ? deep.content : ''}`, {
      visual_type: 'mindmap',
      visual_nodes: [lesson.topic, 'Core rule', 'Why it matters', 'Where used'],
      visual_edges: [[lesson.topic, 'Core rule'], [lesson.topic, 'Why it matters']],
    }),
    slide('analogy', analogy ? analogy.title : 'Mental Model', [analogy && analogy.content, deep && deep.content].filter(Boolean), analogy && analogy.content ? analogy.content : deep && deep.content || def && def.content || '', {
      visual_type: 'comparison',
      visual_nodes: ['Real-world idea', lesson.topic, 'Shared behavior', 'Limit'],
      visual_edges: [['Real-world idea', 'Shared behavior'], ['Shared behavior', lesson.topic]],
    }),
    slide('diagram', diagram ? diagram.title : 'Visual Model', [diagram && diagram.content, diagram && diagram.diagram && diagram.diagram.caption].filter(Boolean), `${diagram ? diagram.content : ''} ${diagram && diagram.diagram ? diagram.diagram.caption : ''}`, {
      visual_type: diagramVisual.type,
      visual_nodes: diagramVisual.nodes,
      visual_edges: diagramVisual.edges,
    }),
    slide('code', code ? code.title : 'Concrete Code Example', [code && code.content, 'Read the code through the concept, not just syntax'].filter(Boolean), `${code ? code.content : ''} The code example turns the idea into something you can trace. Read it line by line and ask what each line contributes to the concept.`, {
      visual_type: 'code',
      visual_nodes: ['Code', 'State', 'Rule', 'Output'],
      visual_edges: [['State', 'Rule'], ['Rule', 'Output']],
      example_code: codeObj && codeObj.content || '',
    }),
    slide('step_by_step', walk ? walk.title : 'Line-by-Line Walkthrough', walkBullets, `${walk ? walk.content : ''} ${walkBullets.join(' ')}`, {
      visual_type: 'flow',
      visual_nodes: walkBullets.slice(0, 5),
      visual_edges: walkBullets.slice(0, 4).map((b, i) => [b, walkBullets[i + 1]]).filter(e => e[1]),
    }),
    slide('mistakes', mistakes ? mistakes.title : 'Common Mistakes', mistakeBullets, `${mistakeBullets.join(' ')} These mistakes matter because they produce code that looks plausible but violates the actual concept.`, {
      visual_type: 'comparison',
      visual_nodes: ['Mistake', 'Why wrong', 'Correct idea', lesson.topic],
      visual_edges: [['Mistake', 'Why wrong'], ['Why wrong', 'Correct idea']],
      callouts: (mistakes && mistakes.callouts || []).map(c => c.text),
    }),
    slide('recap', 'Complexity and Recap', [complexity && complexity.content, recap && recap.content, next && next.content].filter(Boolean), `${complexity ? complexity.content : ''} ${recap ? recap.content : ''} ${next ? next.content : ''}`, {
      visual_type: complexity ? 'bigo_chart' : 'summary',
      visual_nodes: ['Definition', 'Diagram', hasCodeSection ? 'Code' : 'Example', 'Mistake', 'Practice'],
      visual_edges: [['Definition', 'Diagram'], ['Diagram', hasCodeSection ? 'Code' : 'Example'], [hasCodeSection ? 'Code' : 'Example', 'Practice']],
    }),
    slide('quiz', checkpoint ? checkpoint.title : 'Mini Checkpoint', [quiz && quiz.question, quiz && quiz.answer, checkpoint && checkpoint.content].filter(Boolean), `${checkpoint ? checkpoint.content : ''} ${quiz ? `The answer is ${quiz.answer}. ${quiz.explanation || ''}` : ''}`, {
      visual_type: 'summary',
      visual_nodes: ['Question', 'Think', 'Answer', 'Explain'],
      visual_edges: [['Question', 'Think'], ['Think', 'Answer'], ['Answer', 'Explain']],
    }),
  ];

  return {
    topic: lesson.topic,
    audienceLevel: lesson.audienceLevel,
    learningObjectives: lesson.learningObjectives,
    slides,
  };
}

function videoText(value, max = 120) {
  const text = String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\.{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.{3,}$/g, '');
  if (!max || text.length <= max) return text;
  const slice = text.slice(0, max).replace(/\s+\S*$/, '').trim();
  return (slice || text.slice(0, max).trim()).replace(/[,;:\-.]+$/g, '');
}

const HANGING_WORD_RE = /\b(?:a|an|and|as|at|because|before|but|by|for|from|if|in|into|is|of|on|or|that|the|then|through|to|with|while)$/i;

function videoList(values, max = 4, charMax = 96) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = focusLabel(value, charMax);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    if (/^(callout|source note)$/i.test(text)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function focusLabel(value, charMax = 38) {
  const text = videoText(value, 0);
  if (!text) return '';
  const semantic = semanticLabel(text);
  if (semantic) return semantic;
  const token = text.match(/\b[A-Z][A-Za-z0-9_]*\.[A-Za-z0-9_]+\(\)/);
  if (token) return token[0];
  const compact = text
    .replace(/[.!?]+$/g, '')
    .split(/\s+/)
    .filter(word => !/^(the|a|an|to|with|through|because|that|this|these|those|your|you)$/i.test(word))
    .slice(0, 5)
    .join(' ')
    .replace(/[,;:-]+$/g, '');
  if (!compact || compact.length > charMax || HANGING_WORD_RE.test(compact)) return '';
  return compact;
}

function semanticLabel(value) {
  const text = videoText(value, 0);
  const lower = text.toLowerCase();
  if (/\bwhat you will be able\b|\blearning objectives?\b/.test(lower)) return 'Objectives';
  if (/\brecap\b|\bnext step\b/.test(lower)) return 'Recap';
  if (/\bdefine\b|\bdefinition\b/.test(lower)) return 'Definition';
  if (/\btrace\b|\bworked example\b|\bconcrete example\b/.test(lower)) return 'Worked example';
  if (/\bavoid\b|\bcommon mistake\b|\bmistakes?\b/.test(lower)) return 'Common mistake';
  if (/\bsame method\b|\bmethod call\b/.test(lower)) return 'Same method call';
  if (/\bchild class\b/.test(lower)) return 'Child class';
  if (/\bparent class\b/.test(lower)) return 'Parent class';
  if (/\bshape\b/.test(lower) && /\breference\b/.test(lower)) return 'Shape reference';
  if (/\bsuperclass\b/.test(lower) && /\breference\b/.test(lower)) return 'Superclass reference';
  if (/\bruntime\b/.test(lower) && /\bobject\b/.test(lower)) return 'Runtime object';
  if (/\bdynamic dispatch\b|\bdispatch\b/.test(lower)) return 'Dynamic dispatch';
  if (/\bcircle\.area\(\)|circle area/.test(lower)) return 'Circle.area()';
  if (/\brectangle\.area\(\)|rectangle area/.test(lower)) return 'Rectangle.area()';
  if (/\bcircle\b/.test(lower) && /\bobject\b/.test(lower)) return 'Circle object';
  if (/\brectangle\b/.test(lower) && /\bobject\b/.test(lower)) return 'Rectangle object';
  if (/\boverload/.test(lower)) return 'Overloading contrast';
  if (/\boverrid/.test(lower)) return 'Overriding';
  if (/\bstatic\b|\bfinal\b/.test(lower)) return 'Static/final warning';
  if (/\bcomposition\b/.test(lower)) return 'Composition contrast';
  if (/\bnode\b/.test(lower) && /\bnext\b/.test(lower)) return 'Node.next';
  if (/\bhead\b/.test(lower)) return 'Head pointer';
  if (/\bnull\b/.test(lower)) return 'Null stop';
  if (/\bhash function\b|\bhash\(key\)|\bhashcode\b/.test(lower)) return 'Hash function';
  if (/\bbucket index\b|\bindex\b.*\bmod\b/.test(lower)) return 'Bucket index';
  if (/\bbucket\b/.test(lower)) return 'Bucket';
  if (/\bcollision\b|\bcollide\b/.test(lower)) return 'Collision';
  if (/\bload factor\b|\balpha\b/.test(lower)) return 'Load factor';
  if (/\bresize\b|\brehash\b/.test(lower)) return 'Resize';
  if (/\binsert/.test(lower)) return 'Insertion step';
  if (/\bdelete|deletion/.test(lower)) return 'Deletion step';
  if (/\bpush\b/.test(lower)) return 'Push';
  if (/\bpop\b/.test(lower)) return 'Pop';
  if (/\bpeek\b/.test(lower)) return 'Peek';
  if (/\blifo\b/.test(lower)) return 'LIFO';
  if (/\bnested\b/.test(lower) && /\bstack\b/.test(lower)) return 'Stack use case';
  if (/\btop\b/.test(lower) && /\bactive\b/.test(lower)) return 'Top item';
  if (/\benqueue\b/.test(lower)) return 'Enqueue';
  if (/\bdequeue\b/.test(lower)) return 'Dequeue';
  if (/\brear\b/.test(lower)) return 'Rear pointer';
  if (/\bfifo\b|\bfirst-in\b|\bfirst in\b|oldest item leaves/.test(lower)) return 'FIFO';
  if (/\bunderflow\b/.test(lower)) return 'Underflow';
  if (/\bbinary search tree\b|\bbst\b/.test(lower)) return 'BST rule';
  if (/\bcomparison\b/.test(lower) && /\bhalf\b/.test(lower)) return 'Halving search';
  if (/\bdeleting\b|\btwo children\b/.test(lower)) return 'Delete case';
  if (/\bo\(1\)/i.test(text)) return 'O(1)';
  if (/\bo\(n\)/i.test(text)) return 'O(n)';
  if (/\bdominant term\b|\bgrowth rate\b|\bbig-o\b/.test(lower)) return 'Growth rate';
  if (/\bcomplexity\b/.test(lower)) return 'Complexity';
  if (/\bprivate\b|\bbalance\b/.test(lower) && /\bfield|state|private\b/.test(lower)) return 'Private state';
  if (/\bpublic\b/.test(lower) && /\bmethod\b/.test(lower)) return 'Public methods';
  if (/\binvariant\b|\bvalid state\b/.test(lower)) return 'Invariant';
  if (/\babstraction\b|\bobject does\b|\bpublic contract\b|\bcontract\b/.test(lower)) return 'Public contract';
  if (/\bworking code\b|\bcode example\b/.test(lower)) return 'Code example';
  if (/\bread\b/.test(lower) && /\broles\b/.test(lower)) return 'Code roles';
  if (/\bpoint\b/.test(lower) && /\bpart\b/.test(lower)) return 'Diagram roles';
  if (/\banalogy\b/.test(lower) && /\bstops?\b/.test(lower)) return 'Analogy limit';
  if (/\bwhy\b/.test(lower) && /\bline\b/.test(lower)) return 'Line purpose';
  if (/\btie\b/.test(lower) && /\bcost\b/.test(lower)) return 'Operation cost';
  if (/\bsay why\b|\banswer is correct\b/.test(lower)) return 'Reason';
  if (/\bmental model\b/.test(lower)) return 'Mental model';
  if (/\bdefinition\b/.test(lower)) return 'Definition';
  if (/\bmistake\b/.test(lower)) return 'Common mistake';
  return '';
}

function displayTitle(value, fallback = 'Tutor scene') {
  const text = videoText(value, 0).replace(/[.!?]+$/g, '');
  if (!text) return fallback;
  if (text.length <= 64 && !HANGING_WORD_RE.test(text)) return text;
  return semanticLabel(text) || fallback;
}

function codeSceneTitle(lineRange, explanation, stepIndex = 0) {
  const label = lineRangeLabel(lineRange) || `Step ${stepIndex + 1}`;
  const semantic = semanticLabel(explanation) || 'Code reason';
  return `${label}: ${semantic}`;
}

function videoNarration(parts, opts = {}) {
  const minChars = opts.minChars || 220;
  const topic = opts.topic || 'this concept';
  const kind = opts.kind || 'concept';
  const seed = (Array.isArray(parts) ? parts : [parts])
    .map(part => videoText(part, 1200))
    .filter(Boolean)
    .join(' ');
  let text = seed;
  if (text.length < minChars) {
    if (kind === 'code') {
      text += ` Read the code as a chain of reasons. First ask what state the line creates, then ask what rule it enforces, and finally ask what would break if the line were removed. That is how ${topic} becomes understandable instead of memorized.`;
    } else if (kind === 'diagram') {
      text += ` Use the visual as a map: point to each part, name its role, then describe the relationship between the parts. The goal is to make ${topic} visible before you try to remember terminology.`;
    } else {
      text += ` The important move is to connect the definition to a concrete situation. A real lesson should show why the rule exists, how it changes the design, and where students usually confuse it with a neighboring idea.`;
    }
  }
  return videoText(text, 1400);
}

function parseLineRange(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d+)\s*(?:-\s*(\d+))?/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const out = [];
  for (let line = Math.min(start, end); line <= Math.max(start, end); line++) out.push(line);
  return out.slice(0, 12);
}

function cleanCodeExplanation(item, fallbackRange = '') {
  if (typeof item === 'string') return { lineRange: fallbackRange, text: videoText(item, 240) };
  return {
    lineRange: videoText(item && item.lineRange || fallbackRange, 24),
    text: videoText(item && item.text || '', 260),
  };
}

function defaultVisualForLesson(lesson) {
  const lower = String(lesson.topic || '').toLowerCase();
  if (lower.includes('inheritance') || lower.includes('polymorphism')) {
    return {
      type: 'class_diagram',
      nodes: [
        { id: 'Shape', label: 'Shape', fields: [], methods: ['area()'] },
        { id: 'Circle', label: 'Circle', fields: ['radius'], methods: ['area()'] },
        { id: 'Rectangle', label: 'Rectangle', fields: ['width', 'height'], methods: ['area()'] },
      ],
      edges: [['Circle', 'Shape', 'extends'], ['Rectangle', 'Shape', 'extends']],
      caption: 'A subclass points to the superclass it extends.',
    };
  }
  if (lower.includes('linked list')) {
    return { type: 'linkedlist', nodes: ['head', '10', '20', '30', 'null'], edges: [['head', '10'], ['10', '20'], ['20', '30'], ['30', 'null']], operations: ['insert', 'delete'], caption: 'Each node stores data and a next reference.' };
  }
  if (lower.includes('hash table') || lower.includes('hashmap') || lower.includes('hash map') || lower.includes('hash function')) {
    return {
      type: 'hash_table',
      nodes: ['key "cat"', 'hash(key)', 'index = hash mod buckets', 'bucket 2', '(cat, 41)', '(cot, 19)', 'collision chain', 'resize'],
      edges: [['key "cat"', 'hash(key)'], ['hash(key)', 'index = hash mod buckets'], ['index = hash mod buckets', 'bucket 2'], ['bucket 2', '(cat, 41)'], ['bucket 2', '(cot, 19)']],
      operations: ['hash', 'mod', 'lookup/insert', 'collision chain', 'resize'],
      caption: 'Hash, bucket index, collision handling, and load factor control lookup cost.',
    };
  }
  if (lower.includes('stack')) {
    return { type: 'stack_queue', nodes: ['top', '42', '17', '8'], operations: ['push', 'pop', 'peek'], caption: 'Only the top item is accessible.' };
  }
  if (lower.includes('queue')) {
    return { type: 'stack_queue', nodes: ['front', 'A', 'B', 'C', 'rear'], operations: ['enqueue', 'dequeue', 'peek'], caption: 'Items leave from the front and enter at the rear.' };
  }
  if (lower.includes('tree') || lower.includes('bst')) {
    return { type: 'tree', nodes: ['8', '3', '10', '1', '6', '14'], edges: [['8', '3'], ['8', '10'], ['3', '1'], ['3', '6'], ['10', '14']], caption: 'Left values are smaller; right values are larger.' };
  }
  const topicNodes = findTopicNodes(lesson.topic, 'definition');
  if (topicNodes) return { type: 'mindmap', nodes: topicNodes.nodes, edges: topicNodes.edges };
  return { type: 'mindmap', nodes: [lesson.topic, 'Definition', 'Example', 'Visual model', 'Mistakes'], edges: [[lesson.topic, 'Definition'], [lesson.topic, 'Example'], [lesson.topic, 'Visual model']] };
}

function diagramToVideoVisual(diagram) {
  const normalized = diagrams.normalizeDiagram(diagram || {});
  return {
    type: diagrams.diagramTypeToVisualType(normalized.type),
    nodes: normalized.nodes,
    edges: normalized.edges,
    operations: normalized.operations,
    caption: normalized.caption,
  };
}

function scene(sceneType, title, narration, onScreenText, extra = {}) {
  const rawVisual = extra.visual || {};
  const visual = {
    type: rawVisual.type || 'mindmap',
    description: videoText(rawVisual.description || rawVisual.caption || '', 180),
    nodes: rawVisual.nodes || [],
    edges: rawVisual.edges || [],
    operations: rawVisual.operations || [],
    caption: videoText(rawVisual.caption || '', 180),
  };
  return VideoSceneSchema.parse({
    sceneType,
    title: displayTitle(title),
    narration: videoNarration(narration, { minChars: extra.minChars, topic: extra.topic, kind: extra.kind }),
    onScreenText: videoList(onScreenText, extra.maxText || 2, extra.textMax || 38).concat([]).slice(0, extra.maxText || 2),
    visual,
    codeFocus: extra.codeFocus,
    focusTarget: focusLabel(extra.focusTarget || (Array.isArray(onScreenText) && onScreenText[0]) || title, 38),
    pointerLabel: focusLabel(extra.pointerLabel || (Array.isArray(onScreenText) && onScreenText[0]) || title, 34),
    animationType: videoText(extra.animationType || animationTypeForVisual(visual.type), 32),
    durationTargetSec: extra.durationTargetSec || (sceneType === 'code_walkthrough' ? 30 : 24),
  });
}

function animationTypeForVisual(type) {
  if (type === 'code') return 'line_highlight';
  if (type === 'class_diagram') return 'uml_pointer';
  if (type === 'linkedlist') return 'linked_list_pointer';
  if (type === 'hash_table') return 'hash_bucket_trace';
  if (type === 'stack_queue') return 'operation_arrow';
  if (type === 'tree') return 'tree_focus';
  if (type === 'cards') return 'card_reveal';
  if (type === 'table') return 'row_highlight';
  if (type === 'source_reference') return 'source_focus';
  if (type === 'none') return 'text_focus';
  return 'focus_pointer';
}

function lineRangeLabel(range) {
  const lines = parseLineRange(range);
  if (!lines.length) return '';
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines[0]}-${lines[lines.length - 1]}`;
}

function codeFocusScenes(lesson, codeSection) {
  const code = codeSection && codeSection.code && codeSection.code.content ? codeSection.code : null;
  if (!code) return [];
  const explanations = (code.explanation || [])
    .map((item, i) => cleanCodeExplanation(item, i === 0 ? '1-2' : ''))
    .filter(item => item.text)
    .slice(0, 4);
  const fallbackExplanations = explanations.length ? explanations : [
    { lineRange: '1-2', text: 'Identify the definition or setup lines before reading the operation.' },
    { lineRange: '3-5', text: 'Find the line where the concept changes state or specializes behavior.' },
    { lineRange: '6-8', text: 'Explain why the final line produces the expected result.' },
  ];
  return fallbackExplanations.map((item, i) => {
    const highlights = parseLineRange(item.lineRange);
    const label = lineRangeLabel(item.lineRange) || `Step ${i + 1}`;
    const title = codeSceneTitle(item.lineRange, item.text, i);
    const focus = semanticLabel(item.text) || label;
    const normalizedFocus = codeWindow.normalizeCodeWindow({
      language: code.language || 'text',
      content: code.content,
      lineRange: item.lineRange || (highlights[0] ? String(highlights[0]) : '1'),
      highlightLines: highlights.length ? highlights : [1],
      explanation: item.text,
      narrationFocus: item.text,
      pointers: [{
        from: 'explanation_card',
        to: highlights.length ? `code_line_${highlights[0]}` : 'highlighted_code_lines',
        style: 'arrow',
        label: focus,
      }],
    }, { maxVisibleLines: 12, contextBefore: 2 });
    return scene('code_walkthrough', title, [
      `${label}: ${item.text}`,
      `The reason this part matters is that it connects syntax to the rule behind ${lesson.topic}.`,
      'If you skip this line, the example either loses its state, breaks the relationship, or stops proving the concept.',
    ], [
      label,
      focus,
      'Why this line exists',
    ], {
      topic: lesson.topic,
      kind: 'code',
      visual: { type: 'code', nodes: ['Code', label, 'Reason', 'Result'], edges: [['Code', label], [label, 'Reason'], ['Reason', 'Result']] },
      codeFocus: normalizedFocus,
      durationTargetSec: 30,
      minChars: 260,
      textMax: 88,
      pointerLabel: focus,
      focusTarget: focus,
    });
  });
}

function sectionCards(sectionInput) {
  return (sectionInput && sectionInput.cards || [])
    .map(card => `${card.title || 'Mistake'}: ${card.text || ''}`)
    .filter(Boolean);
}

function lessonToVideoScenes(lessonInput) {
  const lesson = normalizeLesson(lessonInput || {});
  const hook = sectionByType(lesson, 'hook');
  const def = sectionByType(lesson, 'definition');
  const deep = sectionByType(lesson, 'deep_explanation');
  const analogy = sectionByType(lesson, 'analogy');
  const diagram = sectionByType(lesson, 'diagram') || sectionByType(lesson, 'mindmap');
  const code = sectionByType(lesson, 'code_example');
  const complexity = sectionByType(lesson, 'complexity');
  const mistakes = sectionByType(lesson, 'common_mistakes');
  const checkpoint = sectionByType(lesson, 'checkpoint');
  const recap = sectionByType(lesson, 'recap');
  const next = sectionByType(lesson, 'next_steps');
  const hasCodeSection = !!(code && code.code && String(code.code.content || '').trim());
  const requiresCsVisual = ['oop', 'data_structure', 'algorithm'].includes(lesson.lessonType);
  const sourceCardsForVideo = [
    ...(deep && Array.isArray(deep.cards) ? deep.cards : []),
    ...(lesson.sections || []).flatMap(s => Array.isArray(s.cards) ? s.cards : []),
  ].filter(card => card && (card.title || card.text)).slice(0, 6);
  const sourceNodesForVideo = sourceCardsForVideo.length
    ? sourceCardsForVideo.map(card => card.title || card.text).filter(Boolean).slice(0, 6)
    : (lesson.relatedTopics && lesson.relatedTopics.length
      ? [lesson.topic, ...lesson.relatedTopics.slice(0, 5)]
      : [lesson.topic, ...(lesson.learningObjectives || []).slice(0, 4)]);
  const sourceRowsForVideo = sourceCardsForVideo
    .map(card => `${card.title || 'Source point'}: ${card.text || ''}`)
    .slice(0, 5);
  let diagramVisual = diagram && diagram.diagram ? diagramToVideoVisual(diagram.diagram) : (requiresCsVisual ? defaultVisualForLesson(lesson) : null);
  if (lesson.lessonType === 'oop' && (!diagramVisual || diagramVisual.type !== 'class_diagram')) {
    diagramVisual = defaultVisualForLesson(lesson);
  }
  const mistakeText = sectionCards(mistakes);
  const quiz = checkpoint && checkpoint.quiz && checkpoint.quiz[0];

  const scenes = [
    scene('hook', lesson.topic, hook && hook.content || `Today we will learn ${lesson.topic} by connecting definition, visual model, ${hasCodeSection ? 'code' : 'examples'}, and common mistakes.`, [
      hook && hook.content,
      ...(lesson.learningObjectives || []).slice(0, 2),
    ], {
      topic: lesson.topic,
      visual: requiresCsVisual
        ? { type: 'mindmap', nodes: [lesson.topic, 'Why it matters', 'Visual model', hasCodeSection ? 'Code' : 'Example', 'Mistakes'], edges: [[lesson.topic, 'Why it matters'], [lesson.topic, 'Visual model'], [lesson.topic, hasCodeSection ? 'Code' : 'Example']] }
        : { type: 'none', nodes: [], edges: [], caption: 'Source-led opening; no forced diagram.' },
      minChars: 180,
      textMax: 94,
    }),
    scene('objectives', 'What You Will Be Able To Do', `By the end, you should be able to ${lesson.learningObjectives.join(', ').replace(/, ([^,]*)$/, ', and $1')}.`, lesson.learningObjectives, {
      topic: lesson.topic,
      visual: requiresCsVisual
        ? { type: 'summary', nodes: ['Objectives', ...lesson.learningObjectives.slice(0, 4)], edges: lesson.learningObjectives.slice(0, 4).map(o => ['Objectives', o]) }
        : { type: 'cards', nodes: lesson.learningObjectives.slice(0, 4), edges: [], operations: ['state objective', 'connect to source section'], caption: 'Objectives are source-backed study cards.' },
      minChars: 160,
      textMax: 88,
    }),
    scene('definition', def ? def.title : 'Core Definition', [def && def.content, deep && deep.content], [
      def && def.content,
      hasCodeSection ? 'Name the relationship before memorizing syntax' : 'Name the relationship before memorizing labels',
      'Check the rule against a concrete example',
    ], (() => {
      if (!requiresCsVisual) {
        return {
          topic: lesson.topic,
          visual: { type: 'cards', nodes: sourceNodesForVideo.slice(0, 5), edges: [], operations: ['define source concept', 'name supporting detail'], caption: 'Definition is grounded in uploaded source sections.' },
          minChars: 260,
          textMax: 96,
        };
      }
      const topicNodes = findTopicNodes(lesson.topic, 'definition');
      const visual = topicNodes
        ? { type: 'mindmap', nodes: topicNodes.nodes, edges: topicNodes.edges }
        : { type: 'mindmap', nodes: [lesson.topic, 'Definition', 'Rule', 'Example', 'Boundary'], edges: [[lesson.topic, 'Definition'], ['Definition', 'Rule'], ['Rule', 'Example']] };
      return { topic: lesson.topic, visual, minChars: 260, textMax: 96 };
    })()),
    scene('deep_explanation', analogy ? analogy.title : 'Mental Model', [analogy && analogy.content, deep && deep.content], [
      analogy && analogy.content || deep && deep.content,
      hasCodeSection ? 'Mental model first, syntax second' : 'Mental model first, labels second',
      'Know where the analogy stops',
    ], {
      topic: lesson.topic,
      visual: requiresCsVisual
        ? { type: 'comparison', nodes: ['Mental model', lesson.topic, 'What matches', 'Where it breaks'], edges: [['Mental model', 'What matches'], ['What matches', lesson.topic], [lesson.topic, 'Where it breaks']] }
        : { type: sourceRowsForVideo.length >= 3 ? 'table' : 'cards', nodes: sourceNodesForVideo.slice(0, 5), edges: [], operations: sourceRowsForVideo.length ? sourceRowsForVideo : ['source concept', 'supporting detail', 'review question'], caption: 'Source details are clearer as cards or a table.' },
      minChars: 260,
    }),
  ];

  if (diagram || requiresCsVisual) {
    scenes.push(scene('diagram', diagram ? diagram.title : 'Visual Model', [diagram && diagram.content, diagram && diagram.diagram && diagram.diagram.caption], [
      diagram && diagram.content,
      diagram && diagram.diagram && diagram.diagram.caption,
      'Point to each part and say its role',
    ], (() => {
      let visual = diagramVisual || defaultVisualForLesson(lesson);
      if (visual.type === 'mindmap' || !visual.nodes || !visual.nodes.length) {
        const topicDiagramNodes = findTopicNodes(lesson.topic, 'diagram');
        if (topicDiagramNodes) visual = { ...visual, type: visual.type || 'mindmap', nodes: topicDiagramNodes.nodes, edges: topicDiagramNodes.edges };
      }
      return { topic: lesson.topic, kind: 'diagram', visual, minChars: 250 };
    })()));
  } else {
    const sourceCards = deep && Array.isArray(deep.cards) ? deep.cards.slice(0, 4) : [];
    const caseNodes = sourceCards.length
      ? sourceCards.map(card => card.title || card.text).filter(Boolean)
      : [lesson.topic, 'Source detail', 'Example or case', 'Checkpoint'];
    scenes.push(scene('deep_explanation', 'Source-Based Example', [
      deep && deep.content,
      'Instead of forcing a diagram, use one concrete source detail as the worked example and explain how it proves the concept.',
    ], [
      caseNodes[0],
      caseNodes[1] || 'Source detail',
      'Apply it once',
    ], {
      topic: lesson.topic,
      visual: { type: 'cards', nodes: caseNodes, edges: [], operations: ['choose source detail', 'explain concept', 'answer checkpoint'], caption: 'Source-based example cards.' },
      minChars: 230,
      textMax: 88,
    }));
  }

  if (code && code.code && code.code.content) {
    scenes.push(scene('code_example', code.title || 'Concrete Code Example', [
      code.content,
      'Before the walkthrough, scan the code for the parent idea, the specialized behavior, and the line that proves the concept.',
    ], [
      'Working code example',
      'Read for roles, not memorization',
      'Next scenes explain exact lines',
    ], {
      topic: lesson.topic,
      kind: 'code',
      visual: { type: 'code', nodes: ['Code', 'State', 'Rule', 'Output'], edges: [['State', 'Rule'], ['Rule', 'Output']] },
      codeFocus: {
        language: code.code.language || 'text',
        content: code.code.content,
        lineRange: '1-3',
        highlightLines: [1, 2, 3],
        explanation: 'Start by locating the setup or contract.',
      },
      minChars: 230,
      durationTargetSec: 28,
    }));
    scenes.push(...codeFocusScenes(lesson, code).slice(0, 3));
  }

  scenes.push(scene('common_mistakes', mistakes ? mistakes.title : 'Common Mistakes', [
    mistakeText.join(' '),
    `The mistake section matters because students often know the vocabulary of ${lesson.topic} before they know when the idea should or should not be used.`,
  ], mistakeText.length ? mistakeText : [mistakes && mistakes.content, 'Explain the correction, not only the mistake'], {
    topic: lesson.topic,
    visual: requiresCsVisual
      ? { type: 'comparison', nodes: ['Mistake', 'Why it fails', 'Correct habit', lesson.topic], edges: [['Mistake', 'Why it fails'], ['Why it fails', 'Correct habit']] }
      : { type: 'table', nodes: ['Mistake', 'Correction'], edges: [], operations: mistakeText.slice(0, 4), caption: 'Compare the weak habit with the source-backed habit.' },
    minChars: 230,
    textMax: 96,
  }));

  if (complexity) {
    scenes.push(scene('complexity', complexity.title || 'Complexity', complexity.content, [
      complexity.content,
      'Tie the cost to the operation',
      'Separate best case from worst case',
    ], {
      topic: lesson.topic,
      visual: { type: 'bigo_chart', nodes: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'], edges: [] },
      minChars: 210,
    }));
  }

  scenes.push(scene('checkpoint', checkpoint ? checkpoint.title : 'Mini Checkpoint', [
    checkpoint && checkpoint.content,
    quiz ? `Question: ${quiz.question} Answer: ${quiz.answer}. ${quiz.explanation || ''}` : '',
  ], [
    quiz && quiz.question || checkpoint && checkpoint.content || `Explain ${lesson.topic} in your own words`,
    quiz && `Answer: ${quiz.answer}`,
    'Say why the answer is correct',
  ], {
    topic: lesson.topic,
    visual: requiresCsVisual
      ? { type: 'summary', nodes: ['Question', 'Think', 'Answer', 'Reason'], edges: [['Question', 'Think'], ['Think', 'Answer'], ['Answer', 'Reason']] }
      : { type: 'cards', nodes: [quiz && quiz.question || 'Review question', quiz && `Answer: ${quiz.answer}` || 'Source-backed answer', 'Reason'], edges: [], operations: ['answer from source', 'explain evidence'], caption: 'Checkpoint cards keep the review source-grounded.' },
    minChars: 190,
    textMax: 88,
  }));

  scenes.push(scene('recap', 'Recap and Next Step', [
    recap && recap.content,
    next && next.content,
    `A strong understanding of ${lesson.topic} means you can explain the definition, ${hasCodeSection ? 'read code' : 'apply an example'}, use the source evidence, and predict the common mistake before it happens.`,
  ], [
    recap && recap.content,
    next && next.content,
    `Definition, ${hasCodeSection ? 'code' : 'example'}, mistake, practice`,
  ], {
    topic: lesson.topic,
    visual: requiresCsVisual
      ? { type: 'summary', nodes: [lesson.topic, 'Definition', hasCodeSection ? 'Code' : 'Example', 'Mistake', 'Practice'], edges: [[lesson.topic, 'Definition'], [lesson.topic, hasCodeSection ? 'Code' : 'Example'], [lesson.topic, 'Mistake']] }
      : { type: 'cards', nodes: sourceNodesForVideo.slice(0, 5), edges: [], operations: ['review concepts', 'name one relationship', 'answer next question'], caption: 'Recap follows source concepts rather than a generic map.' },
    minChars: 180,
  }));

  return scenes.slice(0, 12);
}

function visualDetailsMap(visual) {
  const nodes = visual && Array.isArray(visual.nodes) ? visual.nodes : [];
  const details = {};
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const label = node.label || node.id || node.name;
    if (!label) continue;
    details[label] = {
      fields: Array.isArray(node.fields) ? node.fields : [],
      methods: Array.isArray(node.methods) ? node.methods : [],
      kind: node.kind || '',
    };
  }
  return details;
}

function visualNodes(visual) {
  return (visual && Array.isArray(visual.nodes) ? visual.nodes : [])
    .map(node => {
      if (node && typeof node === 'object') return node.label || node.id || node.name || '';
      return node;
    })
    .filter(Boolean);
}

function visualEdges(visual) {
  return (visual && Array.isArray(visual.edges) ? visual.edges : [])
    .map(edge => {
      if (Array.isArray(edge)) return [edge[0], edge[1], edge[2]].filter(Boolean);
      if (edge && typeof edge === 'object') return [edge.from || edge.source, edge.to || edge.target, edge.label].filter(Boolean);
      return null;
    })
    .filter(edge => edge && edge[0] && edge[1]);
}

function sceneTypeToSlideType(type) {
  const map = {
    hook: 'title',
    objectives: 'objectives',
    definition: 'concept',
    deep_explanation: 'analogy',
    diagram: 'diagram',
    code_example: 'code',
    code_walkthrough: 'step_by_step',
    common_mistakes: 'mistakes',
    complexity: 'recap',
    checkpoint: 'quiz',
    recap: 'recap',
  };
  return map[type] || 'concept';
}

function videoScenesToScript(lesson, scenes) {
  const slides = scenes.map((s) => {
    const slideType = sceneTypeToSlideType(s.sceneType);
    const nodes = visualNodes(s.visual);
    const edges = visualEdges(s.visual);
    const focusBullets = videoList(s.onScreenText, 2, 38);
    return {
      slideType,
      slide_type: slideType,
      sceneType: s.sceneType,
      title: s.title,
      visual_type: s.visual && s.visual.type || 'mindmap',
      bullets: focusBullets.length ? focusBullets : [focusLabel(s.title || lesson.topic) || 'Core idea'],
      visual_nodes: nodes,
      visual_edges: edges,
      visual_node_details: visualDetailsMap(s.visual),
      operations: s.visual && s.visual.operations || [],
      caption: s.visual && s.visual.caption || '',
      example_code: s.codeFocus && s.codeFocus.content || '',
      code_focus: s.codeFocus,
      focusTarget: s.focusTarget || '',
      pointerLabel: s.pointerLabel || '',
      animationType: s.animationType || animationTypeForVisual(s.visual && s.visual.type),
      narration: s.narration,
      durationTargetSec: s.durationTargetSec,
    };
  });
  return {
    topic: lesson.topic,
    audienceLevel: lesson.audienceLevel,
    learningObjectives: lesson.learningObjectives,
    scenes,
    slides,
  };
}

function lessonToVideoScript(lessonInput) {
  const lesson = normalizeLesson(lessonInput || {});
  const scenes = lessonToVideoScenes(lesson);
  return videoScenesToScript(lesson, scenes);
}

function collectSourceMap(lesson) {
  const ids = new Set((lesson.sourceMaterial && lesson.sourceMaterial.selectedChunkIds) || []);
  for (const s of lesson.sections || []) {
    for (const c of s.callouts || []) {
      for (const id of c.sourceChunkIds || []) ids.add(id);
    }
  }
  return { chunkIds: [...ids] };
}

function prepareStoredNote(row) {
  if (!row) return row;
  let lessonJson = row.lesson_json || null;
  let body = row.body_md || '';
  if (lessonJson) {
    try {
      const parsedStored = typeof lessonJson === 'string' ? JSON.parse(lessonJson) : lessonJson;
      const lesson = normalizeLesson(parsedStored && parsedStored.lesson || parsedStored, { title: row.title });
      lessonJson = JSON.stringify(lesson);
      body = lessonToMarkdown(lesson);
    } catch (_) {
      // Keep malformed legacy JSON and its markdown available rather than hiding the note.
    }
  }
  if (!lessonJson && body) {
    const candidate = extractJson(body);
    let parsed = null;
    if (candidate) {
      try { parsed = JSON.parse(candidate); } catch (_) { parsed = null; }
    }
    if (parsed && (parsed.sections || parsed.lesson)) {
      const lesson = normalizeLesson(parsed.lesson || parsed, { title: row.title });
      lessonJson = JSON.stringify(lesson);
      body = lessonToMarkdown(lesson);
    } else {
      const clean = extractMarkdownFromModelOutput(body);
      if (clean !== body) body = clean;
    }
  }
  return { ...row, lesson_json: lessonJson, body_md: body };
}

module.exports = {
  EducationalLessonSchema,
  VideoSceneSchema,
  SECTION_TYPES,
  DIAGRAM_TYPES,
  cleanText,
  extractMarkdownFromModelOutput,
  loadCuratedKnowledge,
  curatedAsPrompt,
  detectLessonType,
  fallbackLesson,
  generalMaterialLesson,
  normalizeLesson,
  generateEducationalLesson,
  lessonToMarkdown,
  lessonToVideoScenes,
  lessonToVideoScript,
  scoreLesson,
  collectSourceMap,
  prepareStoredNote,
};
