'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const lessons = require('./lesson.service');
const materialDiagnostics = require('./material-diagnostics.service');
const materialUnderstanding = require('./material-understanding.service');
const groundedEnrichment = require('./grounded-enrichment.service');
const { retrieveLessonContext, groundingTier: computeGroundingTier } = require('./rag.service');
const { scoreVideoScript } = require('./video-quality.service');
const renderer = require('./renderer.service');
const visualRegistry = require('../utils/visual-registry');
const { HttpError } = require('../middleware/error');

function nowIso() { return new Date().toISOString(); }

const SUPPORTED_DOMAINS = new Set([
  'Object-Oriented Programming',
  'Data Structures',
  'Algorithms',
]);
const MIN_TOPIC_CONFIDENCE = 0.65;
const MIN_SOURCE_EVIDENCE_CHUNKS = 2;
const MIN_KEY_CONCEPTS = 3;

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function cleanId(value, fallback) {
  return String(value || fallback || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
}

function goalFor(scene, topic) {
  const type = scene.sceneType || scene.type || 'concept';
  const title = scene.title || topic;
  const map = {
    hook: `Understand why ${topic} matters before memorizing terms.`,
    objectives: `Know the learning targets for this ${topic} lesson.`,
    definition: `State the definition of ${topic} in your own words.`,
    deep_explanation: `Connect the rule of ${topic} to a mental model.`,
    diagram: `Use the visual model to explain ${topic}.`,
    code_example: `Recognize where ${topic} appears in real code.`,
    code_walkthrough: `Explain why the highlighted code lines exist.`,
    common_mistakes: `Avoid a common incorrect interpretation of ${topic}.`,
    complexity: `Connect ${topic} to its cost or trade-offs.`,
    checkpoint: `Check whether you can apply ${topic}.`,
    recap: `Leave with the core path for reviewing ${topic}.`,
  };
  return map[type] || `Learn the purpose of ${title}.`;
}

function studentGoalFor(scene, topic) {
  const type = scene.sceneType || scene.type || 'concept';
  const title = scene.title || topic;
  const map = {
    hook: `Why ${topic} matters`,
    objectives: `What you will learn about ${topic}`,
    definition: `What ${topic} means`,
    deep_explanation: `How to think about ${topic}`,
    diagram: `Visual model of ${topic}`,
    code_example: `${topic} in real code`,
    code_walkthrough: `Line-by-line code focus`,
    common_mistakes: `Common mistakes with ${topic}`,
    complexity: `Cost and trade-offs of ${topic}`,
    checkpoint: `Check your understanding`,
    recap: `Key takeaways for ${topic}`,
  };
  return map[type] || title;
}

function readableVisual(value) {
  return String(value || 'visual').replace(/_/g, ' ');
}

function sceneIntentFor(scene, topic) {
  const type = scene.sceneType || scene.type || 'concept';
  const visualType = scene.visualType || scene.visualTemplate || '';
  const title = scene.sceneTitle || scene.title || topic;
  if (visualType === 'encapsulation_boundary') return 'show controlled access to hidden state';
  if (visualType === 'class_object') return 'separate the class blueprint from object instances';
  if (visualType === 'inheritance_uml') return 'show parent-child class relationships';
  if (visualType === 'polymorphism_dispatch') return 'show runtime method dispatch';
  if (visualType === 'linked_list_operation') return 'show nodes connected by next pointers';
  if (visualType === 'stack_operation') return 'show push, pop, and top state changes';
  if (visualType === 'queue_operation') return 'show enqueue, dequeue, front, and rear state changes';
  if (visualType === 'hash_table_operation') return 'show key hashing into buckets';
  if (visualType === 'tree_visual') return 'show hierarchical parent-child structure';
  if (visualType === 'big_o_growth') return 'show growth-rate comparison';
  if (visualType === 'code_walkthrough') return 'highlight the exact code lines that teach the idea';
  if (visualType === 'process_flow') return 'show the ordered steps in the operation';
  if (visualType === 'comparison_contrast') return 'compare the mistaken version with the correct version';
  if (type === 'objectives') return 'preview the visual learning targets';
  if (type === 'recap' || type === 'checkpoint') return 'summarize the source-backed takeaways';
  return `make ${title} visible as a concrete diagram`;
}

function requiredVisualEvidenceFor(visualType, topic = '') {
  const lowerTopic = String(topic || '').toLowerCase();
  const base = {
    encapsulation_boundary: ['class boundary', 'private field', 'public method'],
    class_object: ['class blueprint', 'object instance', 'state or behavior'],
    inheritance_uml: ['superclass', 'subclass', 'inheritance arrow'],
    polymorphism_dispatch: ['base reference', 'runtime object', 'overridden method'],
    linked_list_operation: ['head pointer', 'node', 'next pointer'],
    stack_operation: ['top item', 'push operation', 'pop operation'],
    queue_operation: ['front pointer', 'rear pointer', 'enqueue or dequeue'],
    hash_table_operation: ['key', 'hash function', 'bucket'],
    tree_visual: ['root', 'child node', 'edge'],
    big_o_growth: ['input size', 'growth curve', 'complexity label'],
    code_walkthrough: ['code line', 'highlight', 'reason'],
    process_flow: ['ordered step', 'state change', 'result'],
    comparison_contrast: ['before or mistake', 'after or correction', 'relationship'],
    learning_objectives: ['learning target', 'topic term'],
    summary_path: ['takeaway', 'topic term'],
    concept_map: ['topic term', 'source-backed node'],
  };
  const required = base[visualType] || ['topic term', 'concrete label'];
  if (lowerTopic.includes('encapsulation') && visualType !== 'encapsulation_boundary') {
    return [...new Set([...required, 'private field', 'public method'])];
  }
  if (lowerTopic.includes('linked') && visualType !== 'linked_list_operation') {
    return [...new Set([...required, 'node', 'next pointer'])];
  }
  return required;
}

function visualPurposeFor(scene, topic) {
  const visualType = scene.visualType || scene.visualTemplate || '';
  const learningPoint = scene.learningPoint || scene.teachingGoal || scene.studentFacingGoal || scene.title || topic;
  return `Use a ${readableVisual(visualType)} visual to show ${learningPoint}`;
}

function visualRationaleFor(scene, topic) {
  const visualType = scene.visualType || scene.visualTemplate || '';
  const required = requiredVisualEvidenceFor(visualType, topic).slice(0, 3).join(', ');
  return `${readableVisual(visualType)} is relevant because this scene needs visible evidence of ${required}.`;
}

function viewerTakeawayFor(scene, topic) {
  const intent = sceneIntentFor(scene, topic);
  return `After seeing the visual, the viewer should be able to ${intent}.`;
}

function visualGroundingFor(scene, topic) {
  const visualType = scene.visualType || scene.visualTemplate || '';
  const sourceBacked = Array.isArray(scene.sourceEvidence) && scene.sourceEvidence.length > 0;
  return {
    topic,
    sceneIntent: sceneIntentFor(scene, topic),
    requiredVisualEvidence: requiredVisualEvidenceFor(visualType, topic),
    selectedVisualReason: `${readableVisual(visualType)} was selected to ${sceneIntentFor(scene, topic)}.`,
    sourceBacked,
  };
}

function withVisualGrounding(scene, topic) {
  const computed = visualGroundingFor(scene, topic);
  return {
    ...scene,
    visualPurpose: scene.visualPurpose || visualPurposeFor(scene, topic),
    visualRationale: scene.visualRationale || visualRationaleFor(scene, topic),
    viewerTakeaway: scene.viewerTakeaway || viewerTakeawayFor(scene, topic),
    visualGrounding: {
      ...(scene.visualGrounding || {}),
      ...computed,
      requiredVisualEvidence: (scene.visualGrounding && Array.isArray(scene.visualGrounding.requiredVisualEvidence) && scene.visualGrounding.requiredVisualEvidence.length)
        ? scene.visualGrounding.requiredVisualEvidence
        : computed.requiredVisualEvidence,
      sourceBacked: computed.sourceBacked,
    },
  };
}

const CONCEPT_MAP_SCENE_TYPES = new Set(['objectives', 'recap', 'checkpoint', 'summary', 'mindmap']);

function sceneTypeOf(scene) {
  return String(scene.sceneType || scene.type || '').toLowerCase();
}

function visualContextFor(scene, topic, visualData = null) {
  return [
    topic,
    scene.title,
    scene.sceneTitle,
    scene.learningPoint,
    scene.teachingGoal,
    scene.studentFacingGoal,
    scene.narration,
    visualLabel(visualData || scene.visualData || scene.visual || scene.visualElements || {}),
  ].filter(Boolean).join(' ');
}

function conceptMapAllowedForScene(scene, canonicalType = '') {
  const type = sceneTypeOf(scene);
  if (canonicalType === 'learning_objectives') return type === 'objectives';
  if (canonicalType === 'summary_path') return type === 'recap' || type === 'checkpoint' || type === 'summary';
  if (canonicalType === 'concept_map') return type === 'mindmap' || type === 'objectives' || type === 'recap' || type === 'summary';
  return true;
}

function conceptMapNodeLabels(scene) {
  const data = scene.visualElements || scene.visualData || {};
  return (Array.isArray(data.nodes) ? data.nodes : [])
    .map(node => String(typeof node === 'string' ? node : node && (node.label || node.id || node.name) || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sourceEvidenceText(scene, topic) {
  const evidence = Array.isArray(scene.sourceEvidence) ? scene.sourceEvidence : [];
  return [
    topic,
    scene.sceneTitle,
    scene.title,
    scene.learningPoint,
    scene.narration,
    ...evidence.map(item => item && (item.quote || item.text || item.heading || item.chapterTitle) || ''),
  ].filter(Boolean).join(' ').toLowerCase();
}

function conceptMapNodesAreSourceBacked(scene, topic) {
  const labels = conceptMapNodeLabels(scene);
  if (labels.length < 2) return false;
  if (!Array.isArray(scene.sourceEvidence) || !scene.sourceEvidence.length) return false;
  const evidenceText = sourceEvidenceText(scene, topic);
  let matched = 0;
  for (const label of labels) {
    const words = significantTopicWords(label);
    if (!words.length) continue;
    if (words.some(word => evidenceText.includes(word))) matched += 1;
  }
  return matched >= Math.min(2, labels.length);
}

function visualTypeFromIntent(scene, topic, rawType = '', visualData = null) {
  const type = sceneTypeOf(scene);
  const lower = visualContextFor(scene, topic, visualData).toLowerCase();
  const raw = visualRegistry._internals.key(rawType);

  if (type === 'objectives') return 'learning_objectives';
  if (type === 'recap' || type === 'checkpoint' || type === 'summary') return 'summary_path';
  if (type === 'code_example' || type === 'code_walkthrough' || raw === 'code' || raw === 'code_example' || scene.codeFocus || scene.code_focus || scene.codeSnippet || scene.code && scene.code.content) {
    return 'code_walkthrough';
  }
  if (type === 'common_mistakes' || raw === 'comparison' || raw === 'before_after') {
    return 'comparison_contrast';
  }
  if (type === 'complexity') return 'big_o_growth';
  if (type === 'step_by_step' || raw === 'flow' || raw === 'operation_flow' || raw === 'algorithm_flow') return 'process_flow';

  if (/\b(encapsulation|private field|private fields|public method|public methods|getter|setter|invariant|validation|data hiding|controlled access|blocked direct access)\b/.test(lower)) return 'encapsulation_boundary';
  if (/\b(polymorphism|dispatch|runtime|overridden|override|dynamic binding)\b/.test(lower)) return 'polymorphism_dispatch';
  if (/\b(inheritance|extends|superclass|subclass|parent class|child class)\b/.test(lower)) return 'inheritance_uml';
  if (/\b(linked list|linkedlist|head pointer|next pointer|node.next|next|null pointer)\b/.test(lower)) return 'linked_list_operation';
  if (/\b(hash table|hashmap|hash map|hash function|bucket|collision|load factor|rehash|open addressing|separate chaining)\b/.test(lower)) return 'hash_table_operation';
  if (/\b(queue|fifo|enqueue|dequeue|front|rear)\b/.test(lower)) return 'queue_operation';
  if (/\b(stack|lifo|push|pop|top item)\b/.test(lower)) return 'stack_operation';
  if (/\b(binary search tree|bst|in-order|inorder|tree|root|leaf|child node)\b/.test(lower)) return 'tree_visual';
  if (/\b(big.?o|complexity|o\(|constant time|linear time|quadratic|growth rate)\b/.test(lower)) return 'big_o_growth';
  if (/\b(class|object|constructor|state|behavior|abstraction|interface|contract|implementation detail|blueprint|instance)\b/.test(lower)) return 'class_object';
  if (type === 'deep_explanation' || type === 'analogy') return 'process_flow';

  return '';
}

function visualTemplateFor(scene, topic) {
  const visualData = scene.visual || {};
  const type = visualData.type || scene.visual_type || scene.visualType || scene.visualTemplate || '';
  const contextText = visualContextFor(scene, topic, visualData);
  const matrixType = visualTypeFromIntent(scene, topic, type, visualData);
  if (matrixType) return matrixType;

  const explicit = visualRegistry.resolveVisualType(type || 'concept_map', { topic, text: contextText });
  if (explicit.supported) {
    if (explicit.config && explicit.config.conceptMap && !conceptMapAllowedForScene(scene, explicit.canonical)) {
      return visualRegistry.normalizeVisualType(type, { topic, text: contextText });
    }
    return explicit.canonical;
  }
  return visualRegistry.normalizeVisualType(type || 'concept_map', { topic, text: contextText });
}

function visualLabel(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(visualLabel).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return [
      value.id,
      value.label,
      value.name,
      value.kind,
      value.from,
      value.source,
      value.to,
      value.target,
      value.type,
      visualLabel(value.fields),
      visualLabel(value.methods),
    ].filter(Boolean).join(' ');
  }
  return String(value);
}

function significantTopicWords(topic) {
  return String(topic || '')
    .toLowerCase()
    .split(/[^a-z0-9()]+/)
    .filter(word => word.length >= 4 && !/^(with|from|this|that|what|will|able|learn|code|rule)$/.test(word));
}

function hasConcreteVisualData(scene, topic) {
  const data = scene.visualElements || scene.visualData || scene.visual || {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const operations = Array.isArray(data.operations) ? data.operations : [];
  const labels = [
    data.caption,
    visualLabel(nodes),
    visualLabel(edges),
    visualLabel(operations),
    visualLabel(data.details),
  ].filter(Boolean).join(' ');
  const lower = labels.toLowerCase();
  const concreteRe = /\b(shape|circle|rectangle|class|object|private|public|field|method|getter|setter|invariant|validation|boundary|interface|contract|implementation|state|behavior|dispatch|runtime|superclass|subclass|extends|head|next|null|stack|queue|root|push|pop|enqueue|dequeue|hash|bucket|collision|load factor|resize|rehash|probe|chaining|o\(|definition|diagram|example|mistake|objective|rule|reason)\b/i;
  if (concreteRe.test(labels)) return true;
  const topicWords = significantTopicWords(topic);
  return nodes.length >= 3 && topicWords.some(word => lower.includes(word));
}

const VAGUE_SCENE_RE = /\b(visual journey|dynamic learning experience|explore the concept|power of programming|unlock your potential|deep dive)\b/i;
const DECORATIVE_VISUAL_RE = /\b(cinematic|glow|glowing|orb|particle|sparkle|abstract|aesthetic|decorative|ambient|random|vibe|journey)\b/i;

const VISUAL_EXPECTED_TERMS = {
  encapsulation_boundary: ['encapsulation', 'private', 'public', 'field', 'method', 'state', 'boundary', 'access', 'invariant', 'validation'],
  class_object: ['class', 'object', 'instance', 'blueprint', 'field', 'method', 'state', 'behavior'],
  inheritance_uml: ['inheritance', 'superclass', 'subclass', 'parent', 'child', 'extends', 'arrow', 'override'],
  polymorphism_dispatch: ['polymorphism', 'dispatch', 'runtime', 'reference', 'object', 'override', 'method', 'implementation', 'interface'],
  linked_list_operation: ['linked', 'list', 'node', 'head', 'next', 'pointer', 'null', 'insert', 'traverse'],
  stack_operation: ['stack', 'push', 'pop', 'top', 'lifo', 'state'],
  queue_operation: ['queue', 'enqueue', 'dequeue', 'front', 'rear', 'fifo', 'state'],
  hash_table_operation: ['hash', 'key', 'bucket', 'collision', 'index', 'load', 'rehash', 'probe', 'chain'],
  tree_visual: ['tree', 'root', 'child', 'parent', 'leaf', 'edge', 'traversal'],
  big_o_growth: ['big', 'growth', 'complexity', 'input', 'size', 'constant', 'linear', 'quadratic', 'o(n)', 'o(1)'],
  code_walkthrough: ['code', 'line', 'class', 'method', 'private', 'public', 'loop', 'return', 'highlight'],
  process_flow: ['step', 'flow', 'state', 'operation', 'input', 'output', 'result'],
  comparison_contrast: ['before', 'after', 'bad', 'correct', 'mistake', 'fix', 'compare', 'valid', 'invalid', 'access'],
  learning_objectives: ['objective', 'goal', 'learn', 'topic', 'target'],
  summary_path: ['summary', 'takeaway', 'recap', 'topic', 'rule'],
  concept_map: ['concept', 'topic', 'source', 'term'],
};

const GENERIC_VISUAL_WORDS = new Set([
  'system',
  'component',
  'module',
  'data',
  'process',
  'concept',
  'idea',
  'thing',
  'item',
  'node',
  'edge',
  'label',
  'visual',
  'diagram',
  'example',
  'part',
  'step',
]);

const VISUAL_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'this',
  'that',
  'these',
  'those',
  'show',
  'shows',
  'using',
  'use',
  'scene',
  'source',
  'backed',
  'concrete',
  'visual',
  'diagram',
  'viewer',
  'learner',
  'explain',
  'explains',
  'learn',
  'idea',
]);

function visualPayloadFor(scene) {
  return scene.visualElements || scene.visualData || scene.visual || {};
}

function visualLabelsFor(scene) {
  const data = visualPayloadFor(scene);
  const labels = [
    data.caption,
    visualLabel(data.nodes),
    visualLabel(data.edges),
    visualLabel(data.operations),
    visualLabel(data.details),
    codeSnippetFor(scene, {}),
  ];
  return labels
    .filter(Boolean)
    .map(label => String(label).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function evidenceTextForScene(scene) {
  return (Array.isArray(scene.sourceEvidence) ? scene.sourceEvidence : [])
    .map(item => item && (item.quote || item.text || item.heading || item.chapterTitle) || '')
    .filter(Boolean)
    .join(' ');
}

function visualWords(value) {
  const text = String(value || '').toLowerCase();
  const words = new Set();
  for (const match of text.matchAll(/[a-z][a-z0-9]*(?:\([^)]+\))?/g)) {
    const word = match[0];
    if (word.length < 3 || VISUAL_STOP_WORDS.has(word)) continue;
    words.add(word);
  }
  return words;
}

function wordOverlapCount(words, text) {
  const lower = String(text || '').toLowerCase();
  let count = 0;
  for (const word of words) {
    if (lower.includes(word)) count += 1;
  }
  return count;
}

function hasExpectedVisualTerms(canonicalType, text) {
  const terms = VISUAL_EXPECTED_TERMS[canonicalType] || [];
  const lower = String(text || '').toLowerCase();
  return terms.some(term => lower.includes(term));
}

function meaningfulLabelCount(labels) {
  let count = 0;
  for (const label of labels) {
    const words = [...visualWords(label)];
    if (!words.length) continue;
    if (words.every(word => GENERIC_VISUAL_WORDS.has(word))) continue;
    count += 1;
  }
  return count;
}

function visualResolutionForScene(scene, topic) {
  const data = visualPayloadFor(scene);
  const requested = scene.visualType || scene.visualTemplate || data.type || '';
  const text = [
    topic,
    scene.sceneTitle,
    scene.title,
    scene.learningPoint,
    scene.narration,
    visualLabel(data),
  ].filter(Boolean).join(' ');
  return visualRegistry.resolveVisualType(requested, { topic, text });
}

const GENERIC_VISUAL_LABEL_RE = /^(mental model|what matches|where it breaks|question|think|answer|reason|start|core idea|example|practice|concept|topic|summary|takeaway|step|rule)$/i;

function visualNodeLabelsFrom(data = {}) {
  return (Array.isArray(data.nodes) ? data.nodes : [])
    .map(node => String(typeof node === 'string' ? node : node && (node.label || node.name || node.id) || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function visualPayloadIsGeneric(data = {}) {
  const labels = visualNodeLabelsFrom(data);
  if (labels.length < 2) return true;
  return labels.every(label => GENERIC_VISUAL_LABEL_RE.test(label) || significantTopicWords(label).length === 0);
}

function visualPayloadHasGenericScaffold(data = {}) {
  return visualNodeLabelsFrom(data).some(label => GENERIC_VISUAL_LABEL_RE.test(label));
}

function topicSpecificVisualNodes(scene, topic, canonicalType) {
  const text = sourceEvidenceText(scene, topic);
  const lower = text.toLowerCase();
  if (canonicalType === 'encapsulation_boundary' || /\b(encapsulation|private|public|controlled access|internal state)\b/.test(lower)) {
    return ['class boundary', 'private fields', 'public methods', 'blocked direct access', 'valid object state'];
  }
  if (canonicalType === 'class_object' || /\b(class|object|instance|blueprint)\b/.test(lower)) {
    return ['class blueprint', 'object instance', 'fields store state', 'methods define behavior'];
  }
  if (canonicalType === 'inheritance_uml' || /\b(inheritance|superclass|subclass|extends)\b/.test(lower)) {
    return ['superclass', 'subclass', 'extends arrow', 'inherited method'];
  }
  if (canonicalType === 'polymorphism_dispatch' || /\b(polymorphism|dispatch|override|runtime)\b/.test(lower)) {
    return ['base reference', 'runtime object', 'overridden method', 'dynamic dispatch'];
  }
  if (canonicalType === 'linked_list_operation' || /\b(linked list|node\.next|next pointer|head pointer)\b/.test(lower)) {
    return ['head pointer', 'node', 'next pointer', 'null stop'];
  }
  if (canonicalType === 'stack_operation' || /\b(stack|push|pop|top)\b/.test(lower)) {
    return ['stack', 'push operation', 'pop operation', 'top item'];
  }
  if (canonicalType === 'queue_operation' || /\b(queue|enqueue|dequeue|front|rear)\b/.test(lower)) {
    return ['queue', 'enqueue operation', 'dequeue operation', 'front pointer', 'rear pointer'];
  }
  if (canonicalType === 'hash_table_operation' || /\b(hash|bucket|collision|key)\b/.test(lower)) {
    return ['key', 'hash function', 'bucket index', 'collision handling'];
  }
  if (canonicalType === 'tree_visual' || /\b(tree|root|child|leaf|traversal)\b/.test(lower)) {
    return ['root node', 'child node', 'edge', 'traversal path'];
  }
  if (canonicalType === 'big_o_growth' || /\b(big.?o|complexity|growth|o\()\b/.test(lower)) {
    return ['input size n', 'growth rate', 'operation count', 'complexity label'];
  }
  const topicWords = String(topic || 'Topic')
    .replace(/\s+in\s+\w+$/i, '')
    .split(/\s+and\s+|\s*,\s*|\s+/)
    .map(word => word.replace(/[^A-Za-z0-9()+#]/g, '').trim())
    .filter(word => word.length >= 4)
    .slice(0, 3);
  const evidenceWords = [...new Set(significantTopicWords(text))]
    .filter(word => !/^(document|handout|chunk|source|material|should|would|could)$/.test(word))
    .slice(0, 4);
  return [...new Set([...topicWords, ...evidenceWords])].slice(0, 5);
}

function topicSpecificVisualOperations(canonicalType) {
  const operations = {
    encapsulation_boundary: ['highlight private state', 'block direct field access', 'trace public method call'],
    class_object: ['show class blueprint', 'instantiate object', 'connect state and behavior'],
    inheritance_uml: ['show superclass', 'connect subclass', 'trace inherited method'],
    polymorphism_dispatch: ['show base reference', 'select runtime object', 'dispatch overridden method'],
    linked_list_operation: ['start at head', 'follow next pointer', 'stop at null'],
    stack_operation: ['push item', 'mark top', 'pop item'],
    queue_operation: ['enqueue at rear', 'mark front', 'dequeue from front'],
    hash_table_operation: ['hash key', 'choose bucket', 'handle collision'],
    tree_visual: ['start at root', 'visit child', 'trace traversal path'],
    big_o_growth: ['increase input size', 'compare growth rate', 'label complexity'],
    code_walkthrough: ['highlight line', 'explain role', 'connect to diagram'],
    process_flow: ['show step 1', 'advance state', 'show result'],
    comparison_contrast: ['show incorrect case', 'show corrected case', 'highlight difference'],
    learning_objectives: ['reveal source-backed goal', 'connect goal to topic'],
    summary_path: ['ask checkpoint question', 'connect answer to source', 'show key takeaway'],
    concept_map: ['link source-backed concept', 'show relationship'],
  };
  return operations[canonicalType] || ['show source-backed label', 'connect to topic'];
}

function topicSpecificEdges(nodes = []) {
  const labels = nodes.filter(Boolean);
  const edges = [];
  for (let i = 0; i < labels.length - 1; i += 1) {
    edges.push([labels[i], labels[i + 1]]);
  }
  return edges;
}

function repairSceneVisualPayload(scene, topic) {
  const data = { ...visualPayloadFor(scene) };
  const current = visualResolutionForScene(scene, topic);
  if (!current.supported) return scene;

  const type = sceneTypeOf(scene);
  const inferred = visualTypeFromIntent({ ...scene, visualType: '', visualTemplate: '' }, topic, '', data);
  let canonicalType = current.canonical;
  if ((type === 'deep_explanation' || type === 'analogy') && inferred && inferred !== canonicalType) {
    canonicalType = inferred;
  }

  const nextData = { ...data, type: canonicalType };
  const checkScene = {
    ...scene,
    visualType: canonicalType,
    visualTemplate: canonicalType,
    visualData: nextData,
    visualElements: nextData,
  };
  const canonicalChanged = canonicalType !== current.canonical;
  const shouldRepairCheckpoint = type === 'checkpoint' && visualPayloadIsGeneric(nextData);
  const shouldRepairDeepExplanation = (type === 'deep_explanation' || type === 'analogy')
    && (canonicalChanged || visualPayloadIsGeneric(nextData) || visualPayloadHasGenericScaffold(nextData) || validateVisualRelevance(checkScene, topic).warnings.includes('narration_visual_mismatch'));
  if (shouldRepairCheckpoint || shouldRepairDeepExplanation) {
    const nodes = topicSpecificVisualNodes(scene, topic, canonicalType);
    nextData.nodes = nodes.length ? nodes : [topic, 'source-backed concept'];
    nextData.edges = topicSpecificEdges(nextData.nodes);
    nextData.operations = topicSpecificVisualOperations(canonicalType);
    nextData.caption = nextData.caption || `${scene.sceneTitle || scene.title || topic} uses source-backed ${canonicalType.replace(/_/g, ' ')} labels.`;
  }

  return {
    ...scene,
    visualType: canonicalType,
    visualTemplate: canonicalType,
    visualData: { ...(scene.visualData || {}), ...nextData, type: canonicalType },
    visualElements: { ...(scene.visualElements || {}), ...nextData, type: canonicalType },
  };
}

function addWarning(warnings, warning) {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function validateVisualRelevance(scene, topic = '') {
  const warnings = [];
  const resolution = visualResolutionForScene(scene, topic);
  const canonicalType = resolution.supported ? resolution.canonical : visualRegistry._internals.key(resolution.input || scene.visualType || scene.visualTemplate || 'missing');
  const labels = visualLabelsFor(scene);
  const visualText = labels.join(' ');
  const learningText = [
    topic,
    scene.sceneTitle,
    scene.title,
    scene.learningPoint,
    scene.teachingGoal,
    scene.studentFacingGoal,
    Array.isArray(scene.onScreenText) ? scene.onScreenText.join(' ') : '',
    evidenceTextForScene(scene),
  ].filter(Boolean).join(' ');
  const narrationText = String(scene.narration || '');
  const purposeText = [
    scene.visualPurpose,
    scene.visualRationale,
    scene.viewerTakeaway,
    scene.visualGrounding && scene.visualGrounding.sceneIntent,
    scene.visualGrounding && scene.visualGrounding.selectedVisualReason,
  ].filter(Boolean).join(' ');
  const visualWordSet = visualWords(visualText);
  const meaningfulLabels = meaningfulLabelCount(labels);
  const hasCode = !!codeSnippetFor(scene, {});
  const concreteElements = hasConcreteScenePayload(scene, topic);
  const expectedInVisual = resolution.supported ? hasExpectedVisualTerms(canonicalType, visualText) : false;
  const learningOverlap = wordOverlapCount(visualWordSet, learningText);
  const narrationOverlap = wordOverlapCount(visualWordSet, narrationText);
  const expectedInNarration = resolution.supported ? hasExpectedVisualTerms(canonicalType, narrationText) : false;
  const conceptMap = !!(resolution.supported && resolution.config && resolution.config.conceptMap);

  if (!resolution.supported) addWarning(warnings, `unsupported_visual_type:${canonicalType || 'missing'}`);
  if (!concreteElements) addWarning(warnings, 'missing_visual_elements');
  if (!meaningfulLabels && !hasCode) addWarning(warnings, 'vague_visual');
  if (!concreteElements && !expectedInVisual && !hasCode) addWarning(warnings, 'vague_visual');
  if (DECORATIVE_VISUAL_RE.test(`${visualText} ${purposeText}`) && (!concreteElements || (!expectedInVisual && learningOverlap < 1))) {
    addWarning(warnings, 'decorative_only_visual');
  }

  if (resolution.supported && conceptMap) {
    if (!conceptMapAllowedForScene(scene, canonicalType)) addWarning(warnings, 'generic_fallback_not_allowed');
    if (!conceptMapNodesAreSourceBacked(scene, topic)) addWarning(warnings, 'concept_map_nodes_not_source_backed');
  }

  if (resolution.supported && !conceptMap) {
    if (!expectedInVisual && learningOverlap < 1 && !hasCode) addWarning(warnings, 'unrelated_diagram');
    if (expectedInVisual && learningOverlap < 1) addWarning(warnings, 'unrelated_diagram');
    if (narrationText && !expectedInNarration && narrationOverlap < 1 && !hasCode) {
      addWarning(warnings, 'narration_visual_mismatch');
    }
    if (hasCode && canonicalType === 'code_walkthrough' && !/code|line|highlight|method|class|private|public|loop|return/i.test(`${narrationText} ${learningText}`)) {
      addWarning(warnings, 'narration_visual_mismatch');
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
    visualType: canonicalType || null,
    supported: !!resolution.supported,
    topicMatch: resolution.supported ? expectedInVisual || learningOverlap > 0 || conceptMap : false,
    learningPointMatch: learningOverlap > 0 || conceptMap,
    narrationMatch: !narrationText || expectedInNarration || narrationOverlap > 0 || conceptMap || hasCode,
    meaningfulLabels: meaningfulLabels > 0 || hasCode,
    concreteElements,
    nonDecorative: !DECORATIVE_VISUAL_RE.test(`${visualText} ${purposeText}`) || (concreteElements && (expectedInVisual || learningOverlap > 0)),
    metrics: {
      labelCount: labels.length,
      meaningfulLabelCount: meaningfulLabels,
      learningOverlap,
      narrationOverlap,
      expectedTermsMatched: resolution.supported && expectedInVisual ? 1 : 0,
    },
  };
}

function listText(value, limit = 4, max = 90) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(item => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(item => item.length > max ? `${item.slice(0, Math.max(0, max - 1)).trim()}...` : item)
    .slice(0, limit);
}

function stripInlineMarkup(value) {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactRenderLabel(value) {
  const text = stripInlineMarkup(value);
  const lower = text.toLowerCase();
  if (!text) return '';
  if (/\b[A-Z][A-Za-z0-9_]*\.[A-Za-z0-9_]+\(\)/.test(text) || /^O\([^)]*\)$/i.test(text)) return text;
  if (/^explain how\b/.test(lower)) {
    if (lower.includes('encapsulation')) return 'Encapsulation goal';
    if (lower.includes('class') || lower.includes('object')) return 'Class/object goal';
    if (lower.includes('inheritance')) return 'Inheritance goal';
    if (lower.includes('polymorphism')) return 'Dispatch goal';
    if (lower.includes('linked')) return 'Linked-list goal';
    if (lower.includes('hash')) return 'Hash-table goal';
    return 'Learning goal';
  }
  if (/^trace\b/.test(lower)) return 'Worked trace';
  if (/^apply\b/.test(lower)) return 'Apply rule';
  if (/^read\b/.test(lower)) return 'Code roles';
  if (/^check\b/.test(lower)) return 'Checkpoint';
  const words = text
    .split(/\s+/)
    .filter(word => !/^(the|a|an|to|with|through|because|that|this|these|those|your|you)$/i.test(word));
  if (!words.length || words.length > 5) return '';
  const label = words.join(' ');
  return label.length <= 42 ? label : '';
}

function renderBulletLabels(scene, slide, topic) {
  const source = scene.onScreenText && scene.onScreenText.length
    ? scene.onScreenText
    : slide.bullets && slide.bullets.length
      ? slide.bullets
      : [scene.studentFacingGoal || scene.title || topic, ...(focusLabelsForScene(scene) || [])];
  const labels = listText(source, 4, 96)
    .map(compactRenderLabel)
    .filter(Boolean)
    .slice(0, 2);
  if (labels.length) return labels;
  const fallback = focusLabelsForScene(scene).map(compactRenderLabel).filter(Boolean).slice(0, 2);
  if (fallback.length) return fallback;
  return [compactRenderLabel(scene.sceneTitle || scene.title || topic) || 'Core idea'];
}

function learningPointFor(scene, topic) {
  const explicit = scene.learningPoint || scene.teachingGoal || scene.studentFacingGoal;
  if (explicit) return String(explicit).trim();
  return goalFor(scene, topic);
}

function visualElementsFor(scene, slide, topic) {
  const visualData = scene.visualData || {};
  const requestedType = scene.visualType || scene.visualTemplate || visualData.type || slide.visual_type || '';
  const contextText = visualContextFor(scene, topic, visualData);
  const resolved = visualRegistry.resolveVisualType(requestedType, { topic, text: contextText });
  const canonicalType = resolved.supported ? resolved.canonical : visualRegistry.normalizeVisualType(requestedType, { topic, text: contextText });
  return {
    type: canonicalType,
    nodes: Array.isArray(visualData.nodes) ? visualData.nodes : [],
    edges: Array.isArray(visualData.edges) ? visualData.edges : [],
    details: visualData.details || {},
    operations: Array.isArray(visualData.operations) ? visualData.operations : [],
    caption: visualData.caption || slide.caption || '',
  };
}

function codeSnippetFor(scene, slide) {
  return String(scene.codeSnippet || scene.code && scene.code.content || slide.example_code || '').trim();
}

function onScreenTextFor(scene, slide, topic) {
  return listText(
    scene.onScreenText && scene.onScreenText.length
      ? scene.onScreenText
      : slide.bullets && slide.bullets.length
        ? slide.bullets
        : [scene.studentFacingGoal || scene.title || topic, ...(focusLabelsForScene(scene) || [])],
    4,
    96
  );
}

function motionInstructionsFor(scene) {
  const instructions = [];
  const labels = focusLabelsForScene(scene);
  if (scene.code && scene.code.highlightLines && scene.code.highlightLines.length) {
    instructions.push(`Highlight ${labels[0] || 'the focused code line'}`);
  }
  if (scene.visualTemplate) instructions.push(`Animate ${scene.visualTemplate.replace(/_/g, ' ')}`);
  for (const label of labels) instructions.push(`Focus on ${label}`);
  if (scene.visualData && scene.visualData.operations && scene.visualData.operations.length) {
    instructions.push(`Step through ${scene.visualData.operations.slice(0, 3).join(', ')}`);
  }
  return listText(instructions.length ? instructions : ['Reveal the source-backed visual step by step'], 5, 100);
}

function hasConcreteScenePayload(scene, topic) {
  return hasConcreteVisualData(scene, topic) || !!codeSnippetFor(scene, {});
}

function sceneUsesOnlyAbstractChips(scene) {
  const template = String(scene.visualType || scene.visualTemplate || '').toLowerCase();
  if (template !== 'learning_map' && template !== 'concept_map') return false;
  const data = scene.visualElements || scene.visualData || {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const operations = Array.isArray(data.operations) ? data.operations : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  if (operations.length || edges.length || scene.codeSnippet || scene.code && scene.code.content) return false;
  const labels = nodes.map(n => String(typeof n === 'string' ? n : n && (n.label || n.id || n.name) || '')).join(' ');
  return nodes.length > 0 && !/\b(class|object|private|public|field|method|node|head|next|null|push|pop|queue|hash|bucket|root|o\(|line|code|state|invariant|collision|traversal|operation)\b/i.test(labels);
}

function sceneWarnings(scene, topic = '') {
  const warnings = [];
  const title = scene.sceneTitle || scene.title;
  const learningPoint = scene.learningPoint || scene.teachingGoal;
  const onScreenText = scene.onScreenText || [];
  const sourceEvidence = scene.sourceEvidence || [];
  const visualPurpose = scene.visualPurpose || '';
  const visualRationale = scene.visualRationale || '';
  const viewerTakeaway = scene.viewerTakeaway || '';
  const grounding = scene.visualGrounding || {};
  const template = String(scene.visualType || scene.visualTemplate || '').toLowerCase();
  const payloadType = scene.visualElements && scene.visualElements.type || scene.visualData && scene.visualData.type || '';
  const visualText = [
    scene.sceneTitle,
    scene.title,
    scene.learningPoint,
    visualPurpose,
    visualRationale,
    viewerTakeaway,
    scene.narration,
    visualLabel(scene.visualElements || scene.visualData || {}),
  ].filter(Boolean).join(' ');
  const visualResolution = visualRegistry.resolveVisualType(template, { topic, text: visualText });
  const payloadResolution = payloadType
    ? visualRegistry.resolveVisualType(payloadType, { topic, text: visualText })
    : null;
  const visualValidation = validateVisualRelevance(scene, topic);

  if (!title) addWarning(warnings, 'missing_scene_title');
  if (!learningPoint || String(learningPoint).length < 18) addWarning(warnings, 'missing_learning_point');
  if (!visualPurpose || String(visualPurpose).trim().length < 24) addWarning(warnings, 'missing_visual_purpose');
  if (!grounding.sceneIntent || !grounding.selectedVisualReason || !Array.isArray(grounding.requiredVisualEvidence) || !grounding.requiredVisualEvidence.length) {
    addWarning(warnings, 'missing_visual_grounding');
  }
  if (!Array.isArray(onScreenText) || !onScreenText.filter(Boolean).length) addWarning(warnings, 'missing_on_screen_text');
  if (!Array.isArray(sourceEvidence) || !sourceEvidence.length) addWarning(warnings, 'missing_source_evidence');
  if (!visualResolution.supported) addWarning(warnings, `unsupported_visual_type:${template || 'missing'}`);
  if (payloadResolution && !payloadResolution.supported) addWarning(warnings, `unsupported_visual_type:${payloadType}`);
  if (visualResolution.supported && payloadResolution && payloadResolution.supported && visualResolution.canonical !== payloadResolution.canonical) {
    addWarning(warnings, 'visual_type_payload_mismatch');
  }
  if (visualResolution.supported && visualResolution.config && visualResolution.config.conceptMap) {
    if (!conceptMapAllowedForScene(scene, visualResolution.canonical)) {
      addWarning(warnings, 'generic_fallback_not_allowed');
    }
    if (!conceptMapNodesAreSourceBacked(scene, topic)) {
      addWarning(warnings, 'concept_map_nodes_not_source_backed');
    }
  }
  if (!template || template === 'learning_map' || template === 'generic') {
    if (!hasConcreteVisualData(scene, topic)) addWarning(warnings, 'generic_visual_template');
  }
  if (sceneUsesOnlyAbstractChips(scene)) addWarning(warnings, 'abstract_chip_only_visual');
  if (!hasConcreteScenePayload(scene, topic)) addWarning(warnings, 'missing_concrete_visual_payload');
  if (DECORATIVE_VISUAL_RE.test(visualText) && !hasConcreteScenePayload(scene, topic)) addWarning(warnings, 'decorative_only_visual');
  for (const warning of visualValidation.warnings) addWarning(warnings, warning);
  if (scene.type === 'code_walkthrough' && (!scene.code || !scene.code.highlightLines || !scene.code.highlightLines.length)) {
    addWarning(warnings, 'missing_code_line_focus');
  }
  if (!scene.narration || scene.narration.length < 120) addWarning(warnings, 'thin_narration');
  const vagueText = [title, learningPoint, visualPurpose, visualRationale, viewerTakeaway, onScreenText.join(' '), scene.narration].filter(Boolean).join(' ');
  if (VAGUE_SCENE_RE.test(vagueText) && !hasConcreteScenePayload(scene, topic)) {
    addWarning(warnings, 'vague_scene_without_concrete_grounding');
    addWarning(warnings, 'vague_visual');
  }
  return warnings;
}

function materialUnderstandingFor(storyboard) {
  return storyboard.materialUnderstanding || storyboard.topicDetection || storyboard.understanding || null;
}

function sourceEvidenceChunkCount(understanding) {
  const evidence = Array.isArray(understanding && understanding.sourceEvidence) ? understanding.sourceEvidence : [];
  const chunkIds = evidence
    .map(item => item && item.chunkId)
    .filter(id => id != null && id !== '');
  return chunkIds.length ? new Set(chunkIds.map(String)).size : evidence.length;
}

function sceneCanonicalVisual(scene, topic) {
  const visualText = [
    scene.sceneTitle,
    scene.title,
    scene.learningPoint,
    scene.narration,
    visualLabel(scene.visualElements || scene.visualData || {}),
  ].filter(Boolean).join(' ');
  const resolved = visualRegistry.resolveVisualType(scene.visualType || scene.visualTemplate || scene.visualElements && scene.visualElements.type || scene.visualData && scene.visualData.type, {
    topic,
    text: visualText,
  });
  return resolved.supported ? resolved.canonical : null;
}

function storyboardVisualTypes(storyboard) {
  return (storyboard.scenes || [])
    .map(scene => sceneCanonicalVisual(scene, storyboard.topic))
    .filter(Boolean);
}

function requiredVisualCoverage(storyboard) {
  const understanding = materialUnderstandingFor(storyboard) || {};
  const domain = understanding.domain;
  const topic = String(understanding.normalizedTopic || understanding.topic || storyboard.topic || '').toLowerCase();
  if (domain === 'Object-Oriented Programming') {
    const required = ['class_object', 'code_walkthrough'];
    if (topic.includes('encapsulation')) required.unshift('encapsulation_boundary');
    if (topic.includes('inheritance')) required.unshift('inheritance_uml');
    if (topic.includes('polymorphism')) required.unshift('polymorphism_dispatch');
    return [...new Set(required)];
  }
  if (domain === 'Data Structures') {
    if (topic.includes('linked')) return ['linked_list_operation', 'code_walkthrough'];
    if (topic.includes('stack')) return ['stack_operation', 'code_walkthrough'];
    if (topic.includes('queue')) return ['queue_operation', 'code_walkthrough'];
    if (topic.includes('hash')) return ['hash_table_operation', 'code_walkthrough'];
    if (topic.includes('tree')) return ['tree_visual', 'code_walkthrough'];
    return ['process_flow', 'code_walkthrough'];
  }
  if (domain === 'Algorithms') {
    if (topic.includes('big') || topic.includes('complexity')) return ['big_o_growth', 'code_walkthrough'];
    return ['process_flow', 'code_walkthrough'];
  }
  return [];
}

function storyboardTopicText(storyboard) {
  const parts = [
    storyboard.topic,
    storyboard.materialUnderstanding && storyboard.materialUnderstanding.topic,
    storyboard.materialUnderstanding && storyboard.materialUnderstanding.normalizedTopic,
    storyboard.materialUnderstanding && Array.isArray(storyboard.materialUnderstanding.keyConcepts)
      ? storyboard.materialUnderstanding.keyConcepts.join(' ')
      : '',
  ];
  for (const scene of storyboard.scenes || []) {
    parts.push(
      scene.sceneTitle,
      scene.title,
      scene.learningPoint,
      scene.visualPurpose,
      scene.visualRationale,
      scene.viewerTakeaway,
      scene.narration,
      Array.isArray(scene.onScreenText) ? scene.onScreenText.join(' ') : '',
      Array.isArray(scene.motionInstructions) ? scene.motionInstructions.join(' ') : '',
      visualLabelsFor(scene).join(' '),
      codeSnippetFor(scene, {}),
      evidenceTextForScene(scene)
    );
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function visualTextForTypes(storyboard, types) {
  const wanted = new Set(types);
  const parts = [];
  for (const scene of storyboard.scenes || []) {
    const canonical = sceneCanonicalVisual(scene, storyboard.topic);
    if (!wanted.has(canonical)) continue;
    parts.push(
      scene.sceneTitle,
      scene.title,
      scene.learningPoint,
      scene.narration,
      Array.isArray(scene.onScreenText) ? scene.onScreenText.join(' ') : '',
      Array.isArray(scene.motionInstructions) ? scene.motionInstructions.join(' ') : '',
      visualLabelsFor(scene).join(' '),
      codeSnippetFor(scene, {})
    );
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function containsAll(text, groups) {
  return groups.every(group => group.some(term => text.includes(term)));
}

function topicVisualStandardWarnings(storyboard, visualTypes) {
  const warnings = [];
  const understanding = materialUnderstandingFor(storyboard) || {};
  const domain = understanding.domain;
  const topic = String(understanding.normalizedTopic || understanding.topic || storyboard.topic || '').toLowerCase();
  const visualSet = new Set(visualTypes);
  const required = requiredVisualCoverage(storyboard);
  const allText = storyboardTopicText(storyboard);

  for (const type of required) {
    if (!visualSet.has(type)) addWarning(warnings, `domain:missing_required_visual:${type}`);
  }

  if (domain === 'Object-Oriented Programming') {
    const oopText = visualTextForTypes(storyboard, ['class_object', 'encapsulation_boundary', 'inheritance_uml', 'polymorphism_dispatch', 'code_walkthrough']);
    if (!containsAll(oopText, [['class'], ['object', 'instance'], ['field', 'state', 'attribute'], ['method', 'behavior', 'function']])) {
      addWarning(warnings, 'domain:oop_missing_fields_methods_labels');
    }
    if (topic.includes('encapsulation')) {
      const encText = visualTextForTypes(storyboard, ['encapsulation_boundary', 'comparison_contrast', 'process_flow', 'code_walkthrough']);
      if (!containsAll(encText, [['private'], ['public'], ['blocked', 'invalid', 'direct access'], ['allowed', 'valid', 'controlled', 'api']])) {
        addWarning(warnings, 'domain:encapsulation_missing_controlled_access_visual');
      }
    }
    if (topic.includes('class') || topic.includes('object')) {
      const classText = visualTextForTypes(storyboard, ['class_object', 'code_walkthrough']);
      if (!containsAll(classText, [['class', 'blueprint'], ['object', 'instance'], ['field', 'state'], ['method', 'behavior']])) {
        addWarning(warnings, 'domain:class_object_missing_blueprint_instance_visual');
      }
    }
    if (topic.includes('inheritance')) {
      const inheritanceText = visualTextForTypes(storyboard, ['inheritance_uml', 'code_walkthrough']);
      if (!containsAll(inheritanceText, [['superclass', 'parent', 'base'], ['subclass', 'child', 'derived'], ['extends', 'inherits', 'inheritance', 'arrow']])) {
        addWarning(warnings, 'domain:inheritance_missing_relationship_visual');
      }
    }
    if (topic.includes('polymorphism')) {
      const polymorphismText = visualTextForTypes(storyboard, ['polymorphism_dispatch', 'code_walkthrough']);
      if (!containsAll(polymorphismText, [['interface', 'base', 'reference'], ['runtime', 'dispatch', 'dynamic'], ['override', 'implementation', 'method']])) {
        addWarning(warnings, 'domain:polymorphism_missing_dispatch_visual');
      }
    }
  }

  if (domain === 'Data Structures') {
    const operationTypes = ['linked_list_operation', 'stack_operation', 'queue_operation', 'hash_table_operation', 'tree_visual', 'process_flow'];
    const dsText = visualTextForTypes(storyboard, operationTypes);
    if (!containsAll(dsText, [['operation', 'insert', 'remove', 'push', 'pop', 'enqueue', 'dequeue', 'traverse', 'lookup'], ['state', 'pointer', 'index', 'top', 'front', 'rear', 'root', 'head', 'bucket']])) {
      addWarning(warnings, 'domain:data_structure_missing_state_change_visual');
    }
    if (topic.includes('linked')) {
      const linkedText = visualTextForTypes(storyboard, ['linked_list_operation', 'code_walkthrough']);
      if (!containsAll(linkedText, [['node'], ['head'], ['next', 'pointer'], ['insert', 'remove', 'traverse', 'operation']])) {
        addWarning(warnings, 'domain:linked_list_missing_pointer_operation_visual');
      }
    }
    if (topic.includes('stack')) {
      const stackText = visualTextForTypes(storyboard, ['stack_operation', 'code_walkthrough']);
      if (!containsAll(stackText, [['stack'], ['push'], ['pop'], ['top']])) {
        addWarning(warnings, 'domain:stack_missing_push_pop_visual');
      }
    }
    if (topic.includes('queue')) {
      const queueText = visualTextForTypes(storyboard, ['queue_operation', 'code_walkthrough']);
      if (!containsAll(queueText, [['queue'], ['enqueue'], ['dequeue'], ['front'], ['rear']])) {
        addWarning(warnings, 'domain:queue_missing_enqueue_dequeue_visual');
      }
    }
    if (topic.includes('hash')) {
      const hashText = visualTextForTypes(storyboard, ['hash_table_operation', 'code_walkthrough']);
      if (!containsAll(hashText, [['key'], ['hash'], ['bucket', 'index'], ['collision', 'probe', 'chain', 'rehash']])) {
        addWarning(warnings, 'domain:hash_table_missing_bucket_collision_visual');
      }
    }
    if (topic.includes('tree')) {
      const treeText = visualTextForTypes(storyboard, ['tree_visual', 'code_walkthrough']);
      if (!containsAll(treeText, [['root'], ['child', 'parent'], ['edge', 'branch'], ['traversal', 'leaf', 'visit']])) {
        addWarning(warnings, 'domain:tree_missing_hierarchy_traversal_visual');
      }
    }
  }

  if (domain === 'Algorithms') {
    const algorithmText = visualTextForTypes(storyboard, ['process_flow', 'big_o_growth', 'comparison_contrast', 'code_walkthrough']);
    if (!containsAll(algorithmText, [['step', 'sequence', 'phase', 'iteration'], ['state', 'input', 'output', 'operation']])) {
      addWarning(warnings, 'domain:algorithm_missing_step_state_visual');
    }
    if (topic.includes('big') || topic.includes('complexity') || allText.includes('o(')) {
      const bigOText = visualTextForTypes(storyboard, ['big_o_growth', 'comparison_contrast', 'code_walkthrough']);
      if (!containsAll(bigOText, [['input', 'size', 'n'], ['growth', 'complexity', 'cost'], ['o(', 'constant', 'linear', 'quadratic']])) {
        addWarning(warnings, 'domain:big_o_missing_growth_complexity_visual');
      }
    }
  }

  return warnings;
}

function storyboardVisualValidation(storyboard) {
  const scenes = storyboard.scenes || [];
  const sceneResults = scenes.map((scene, index) => {
    const result = validateVisualRelevance(scene, storyboard.topic);
    return {
      sceneId: scene.id || `scene-${index + 1}`,
      visualType: result.visualType,
      passed: result.passed,
      warnings: result.warnings,
      supported: result.supported,
      topicMatch: result.topicMatch,
      learningPointMatch: result.learningPointMatch,
      narrationMatch: result.narrationMatch,
      meaningfulLabels: result.meaningfulLabels,
      concreteElements: result.concreteElements,
      nonDecorative: result.nonDecorative,
      metrics: result.metrics,
    };
  });
  const warnings = [];
  for (const result of sceneResults) {
    for (const warning of result.warnings) addWarning(warnings, `${result.sceneId}:${warning}`);
  }
  const present = [...new Set(sceneResults.map(result => result.visualType).filter(Boolean))];
  const required = requiredVisualCoverage(storyboard);
  return {
    passed: warnings.length === 0,
    warnings,
    scenes: sceneResults,
    coverage: {
      required,
      present,
      missing: required.filter(type => !present.includes(type)),
    },
  };
}

function hasCodeScene(storyboard) {
  return (storyboard.scenes || []).some(scene => !!codeSnippetFor(scene, {}));
}

function topicDetectionWarnings(storyboard) {
  const warnings = [];
  const understanding = materialUnderstandingFor(storyboard);
  const topic = String((understanding && (understanding.topic || understanding.normalizedTopic)) || storyboard.topic || '').trim();
  if (!understanding) return ['topic:missing_detection'];
  if (!topic || /^unresolved|unknown|cs topic|computer science$/i.test(topic)) warnings.push('topic:generic_or_missing_topic');
  if (!SUPPORTED_DOMAINS.has(understanding.domain)) warnings.push('topic:unsupported_domain');
  if (Number(understanding.confidence || 0) < MIN_TOPIC_CONFIDENCE) warnings.push('topic:low_confidence');
  const keyConcepts = Array.isArray(understanding.keyConcepts) ? understanding.keyConcepts.filter(Boolean) : [];
  if (keyConcepts.length < MIN_KEY_CONCEPTS) warnings.push('topic:insufficient_key_concepts');
  if (sourceEvidenceChunkCount(understanding) < MIN_SOURCE_EVIDENCE_CHUNKS) warnings.push('topic:insufficient_source_evidence');
  return warnings;
}

function groundingWarnings(storyboard) {
  const warnings = [];
  const grounding = storyboard.grounding;
  if (!grounding) return ['grounding:missing_metadata'];
  const risk = String(grounding.topicDriftRisk || '').toLowerCase();
  if (!risk) warnings.push('grounding:missing_topic_drift_risk');
  else if (risk !== 'low') warnings.push(`grounding:topic_drift_risk_${risk}`);
  return warnings;
}

function enrichmentWarnings(storyboard) {
  const warnings = [];
  const understanding = materialUnderstandingFor(storyboard) || {};
  const grounding = storyboard.grounding || {};
  const validation = grounding.enrichmentValidation || groundedEnrichment.validateEnrichment(storyboard, { understanding });
  if (validation && validation.passed === false) warnings.push('enrichment:validation_failed');
  for (const issue of validation && validation.issues || []) warnings.push(`enrichment:${issue}`);
  return warnings;
}

function domainSpecificWarnings(storyboard, visualTypes) {
  const warnings = [];
  const understanding = materialUnderstandingFor(storyboard) || {};
  const domain = understanding.domain;
  const visualSet = new Set(visualTypes);
  if (domain === 'Object-Oriented Programming') {
    const hasOopVisual = ['class_object', 'encapsulation_boundary', 'inheritance_uml', 'polymorphism_dispatch']
      .some(type => visualSet.has(type));
    if (!hasOopVisual) warnings.push('domain:oop_missing_class_object_visual');
  }
  if (domain === 'Data Structures') {
    const hasStructureVisual = [
      'linked_list_operation',
      'stack_operation',
      'queue_operation',
      'hash_table_operation',
      'tree_visual',
      'process_flow',
    ].some(type => visualSet.has(type));
    if (!hasStructureVisual) warnings.push('domain:data_structure_missing_operation_visual');
  }
  if (domain === 'Algorithms') {
    const hasAlgorithmVisual = ['process_flow', 'big_o_growth']
      .some(type => visualSet.has(type));
    if (!hasAlgorithmVisual) warnings.push('domain:algorithm_missing_flow_or_complexity_visual');
  }
  if (SUPPORTED_DOMAINS.has(domain) && !hasCodeScene(storyboard)) warnings.push('domain:missing_code_scene');
  for (const warning of topicVisualStandardWarnings(storyboard, visualTypes)) addWarning(warnings, warning);
  return warnings;
}

function toStoryboardScene(scene, index, topic, slide) {
  const visual = scene.visual || {};
  const codeFocus = scene.codeFocus || scene.code_focus || null;
  const out = {
    id: cleanId(`${index + 1}-${scene.sceneType || scene.type}-${scene.title}`, `scene-${index + 1}`),
    type: scene.sceneType || scene.type || 'concept',
    title: scene.title || `${topic} scene ${index + 1}`,
    teachingGoal: goalFor(scene, topic),
    studentFacingGoal: studentGoalFor(scene, topic),
    narration: scene.narration || '',
    visualTemplate: visualTemplateFor(scene, topic),
    visualData: {
      type: visual.type || slide.visual_type || 'mindmap',
      nodes: visual.nodes || slide.visual_nodes || [],
      edges: visual.edges || slide.visual_edges || [],
      details: visual.node_details || slide.visual_node_details || {},
      operations: visual.operations || slide.operations || [],
      caption: visual.caption || slide.caption || '',
    },
    code: codeFocus ? {
      language: codeFocus.language || 'text',
      content: codeFocus.content || slide.example_code || '',
      highlightLines: codeFocus.highlightLines || [],
      lineRange: codeFocus.lineRange || '',
      walkthrough: codeFocus.explanation ? [{ lineRange: codeFocus.lineRange || '', text: codeFocus.explanation }] : [],
    } : null,
    durationSec: scene.durationTargetSec || slide.durationTargetSec || 24,
    renderSlide: slide,
    qualityWarnings: [],
  };
  const visualResolution = visualRegistry.resolveVisualType(out.visualTemplate, {
    topic,
    title: out.title,
    text: `${out.narration} ${visualLabel(out.visualData)}`,
  });
  if (visualResolution.supported) out.visualTemplate = visualResolution.canonical;
  out.sceneTitle = out.title;
  out.learningPoint = learningPointFor(out, topic);
  out.onScreenText = onScreenTextFor(out, slide, topic);
  out.visualType = out.visualTemplate;
  out.visualData.type = out.visualType;
  out.visualElements = visualElementsFor(out, slide, topic);
  out.codeSnippet = codeSnippetFor(out, slide);
  out.motionInstructions = motionInstructionsFor(out);
  out.durationSeconds = out.durationSec;
  out.sourceEvidence = Array.isArray(scene.sourceEvidence) ? scene.sourceEvidence : [];
  out.enrichment = scene.enrichment || { used: false, type: 'none', content: '' };
  const grounded = prepareSceneForQuality(out, topic);
  grounded.visualValidation = validateVisualRelevance(grounded, topic);
  grounded.qualityWarnings = sceneWarnings(grounded, topic);
  return grounded;
}

function storyboardQuality(storyboard) {
  const sceneWarningsFlat = [];
  const qualityStoryboard = {
    ...storyboard,
    scenes: (storyboard.scenes || []).map(scene => prepareSceneForQuality(scene, storyboard.topic, { fillGrounding: false })),
  };
  const scenes = qualityStoryboard.scenes || [];
  const visual = storyboardVisualValidation(qualityStoryboard);
  if (scenes.length < 5) sceneWarningsFlat.push('storyboard:too_few_scenes');
  for (const scene of scenes) {
    const warnings = sceneWarnings(scene, qualityStoryboard.topic);
    for (const warning of warnings) sceneWarningsFlat.push(`${scene.id}:${warning}`);
  }
  const visualTypes = storyboardVisualTypes(qualityStoryboard);
  const requiredTemplates = new Set(visualTypes);
  const globalWarnings = [
    ...topicDetectionWarnings(qualityStoryboard),
    ...groundingWarnings(qualityStoryboard),
    ...enrichmentWarnings(qualityStoryboard),
    ...domainSpecificWarnings(qualityStoryboard, visualTypes),
    ...visual.warnings,
  ];
  const warnings = [...new Set([...sceneWarningsFlat, ...globalWarnings])];
  if (requiredTemplates.size < 4) warnings.push('storyboard:insufficient_visual_variety');
  const understanding = materialUnderstandingFor(qualityStoryboard) || {};
  const passed = warnings.length === 0;
  return {
    score: Math.max(0, Math.min(1, 1 - warnings.length * 0.08 + Math.min(0.2, requiredTemplates.size * 0.03))),
    passed,
    warnings,
    visualTemplates: [...requiredTemplates],
    visual,
    hardGate: true,
    detectedDomain: understanding.domain || null,
    detectedTopic: understanding.topic || understanding.normalizedTopic || storyboard.topic || null,
    confidence: understanding.confidence || null,
    sourceEvidenceCount: sourceEvidenceChunkCount(understanding),
    keyConceptCount: Array.isArray(understanding.keyConcepts) ? understanding.keyConcepts.filter(Boolean).length : 0,
    topicDriftRisk: storyboard.grounding && storyboard.grounding.topicDriftRisk || null,
    minSceneCount: 5,
    targetSceneCount: 8,
  };
}

function prepareSceneForQuality(scene, topic, opts = {}) {
  const { fillGrounding = true } = opts;
  const repaired = repairSceneVisualPayload(scene, topic);
  if (fillGrounding) return withVisualGrounding(repaired, topic);
  const hasCompleteGrounding =
    repaired.visualPurpose &&
    repaired.visualRationale &&
    repaired.viewerTakeaway &&
    repaired.visualGrounding &&
    repaired.visualGrounding.sceneIntent &&
    repaired.visualGrounding.selectedVisualReason &&
    Array.isArray(repaired.visualGrounding.requiredVisualEvidence) &&
    repaired.visualGrounding.requiredVisualEvidence.length;
  return hasCompleteGrounding ? withVisualGrounding(repaired, topic) : repaired;
}

function withFreshSceneQuality(scene, topic) {
  const grounded = prepareSceneForQuality(scene, topic);
  return {
    ...grounded,
    visualValidation: validateVisualRelevance(grounded, topic),
    qualityWarnings: sceneWarnings(grounded, topic),
  };
}

const BANNED_VISIBLE_RE = new RegExp(
  'teaching\\s*goal\\s*:|\\bqualityWarnings\\b|\\bqualityChecks\\b|\\bdebugWarnings\\b|\\bsourceChunkIds\\b|\\[chunk:\\s*\\d+\\]',
  'i'
);

function sanitizeSceneForRender(scene) {
  const { teachingGoal, qualityWarnings, renderSlide, ...rest } = scene;
  return rest;
}

function sanitizeForRender(storyboard) {
  return {
    ...storyboard,
    scenes: (storyboard.scenes || []).map(sanitizeSceneForRender),
  };
}

function scanVisibleText(storyboard) {
  const parts = [];
  for (const scene of storyboard.scenes || []) {
    parts.push(scene.title, scene.narration, scene.studentFacingGoal);
    if (scene.visualData) {
      parts.push(scene.visualData.caption);
      if (Array.isArray(scene.visualData.nodes)) {
        for (const n of scene.visualData.nodes) parts.push(typeof n === 'string' ? n : n && (n.label || n.id));
      }
    }
    if (scene.code) parts.push(scene.code.content, scene.code.lineRange);
    if (scene.code && Array.isArray(scene.code.walkthrough)) {
      for (const w of scene.code.walkthrough) parts.push(w.text);
    }
  }
  const text = parts.filter(Boolean).join(' ');
  const match = BANNED_VISIBLE_RE.exec(text);
  return match ? { clean: false, term: match[0] } : { clean: true };
}

function focusLabelsForScene(scene) {
  if (scene.code && Array.isArray(scene.code.highlightLines) && scene.code.highlightLines.length) {
    return scene.code.highlightLines.slice(0, 2).map(line => `Line ${line}`);
  }
  const nodes = scene.visualData && Array.isArray(scene.visualData.nodes) ? scene.visualData.nodes : [];
  return nodes.map(n => String(typeof n === 'string' ? n : n.label || n.id || '').trim())
    .filter(Boolean)
    .map(label => label.split(/\s+/).slice(0, 4).join(' '))
    .slice(0, 2);
}

function scriptFromStoryboard(storyboard) {
  const slides = (storyboard.scenes || []).map(scene => {
    const slide = scene.renderSlide || {};
    const requestedVisualType = scene.visualElements && scene.visualElements.type || scene.visualData && scene.visualData.type || scene.visualType || scene.visualTemplate || slide.visual_type;
    const visualText = [
      scene.sceneTitle,
      scene.title,
      scene.learningPoint,
      scene.narration,
      visualLabel(scene.visualElements || scene.visualData || {}),
    ].filter(Boolean).join(' ');
    return {
      ...slide,
      title: scene.sceneTitle || scene.title || slide.title,
      narration: scene.narration || slide.narration,
      bullets: renderBulletLabels(scene, slide, storyboard.topic),
      visual_type: visualRegistry.legacyVisualTypeFor(requestedVisualType, { topic: storyboard.topic, text: visualText }),
      visual_nodes: scene.visualElements && scene.visualElements.nodes || scene.visualData && scene.visualData.nodes || slide.visual_nodes || [],
      visual_edges: scene.visualElements && scene.visualElements.edges || scene.visualData && scene.visualData.edges || slide.visual_edges || [],
      visual_node_details: scene.visualElements && scene.visualElements.details || scene.visualData && scene.visualData.details || slide.visual_node_details || {},
      operations: scene.visualElements && scene.visualElements.operations || scene.visualData && scene.visualData.operations || slide.operations || [],
      caption: scene.visualElements && scene.visualElements.caption || scene.visualData && scene.visualData.caption || slide.caption || '',
      example_code: scene.codeSnippet || scene.code && scene.code.content || slide.example_code || '',
      code_focus: scene.code ? {
        language: scene.code.language || 'text',
        content: scene.code.content || '',
        lineRange: scene.code.lineRange || '',
        highlightLines: scene.code.highlightLines || [],
        explanation: (scene.code.walkthrough && scene.code.walkthrough[0] && scene.code.walkthrough[0].text) || slide.code_focus && slide.code_focus.explanation || '',
      } : slide.code_focus || null,
      callouts: [],
    };
  });
  return {
    topic: storyboard.topic,
    audienceLevel: storyboard.audienceLevel || 'beginner',
    learningObjectives: storyboard.learningObjectives || [],
    slides,
  };
}

async function generateStoryboard({ userId, materialId, concept }) {
  await ai.assertModelsAvailable({ generation: true, embedding: true, feature: 'notes' });
  const db = getDb();
  const material = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!material) throw new HttpError(404, 'material_not_found');
  let diagnostics = await materialDiagnostics.buildMaterialDiagnostics(materialId, { userId });
  const understanding = await materialUnderstanding.resolveMaterialUnderstanding({ materialId, hint: concept || material.title, feature: 'video' });
  const generationTopic = understanding.topic || understanding.normalizedTopic || 'Unresolved CS Topic';
  const retrievalTopic = understanding.normalizedTopic || generationTopic;
  const rag = await retrieveLessonContext(materialId, retrievalTopic, { feature: 'video', k: 10, minScore: 0.08, maxMerged: 14 });
  diagnostics = materialDiagnostics.attachRetrievalDiagnostics(diagnostics, rag.uploaded || rag);
  const groundingTier = computeGroundingTier(rag.uploaded || rag);
  const enrichmentPolicy = groundedEnrichment.decideEnrichment({
    diagnostics,
    understanding,
    groundingTier,
    chunks: rag.uploaded && rag.uploaded.chunks || rag.chunks || [],
  });
  const lesson = await lessons.generateEducationalLesson({
    topic: generationTopic,
    title: generationTopic,
    materialTitle: material.title || generationTopic,
    chunks: rag.chunks || [],
    groundingTier,
    lessonType: lessons.detectLessonType(generationTopic),
    enrichmentPolicyPrompt: groundedEnrichment.promptForPolicy(enrichmentPolicy, understanding),
  });
  const video = lessons.lessonToVideoScript(lesson);
  const scenes = lessons.lessonToVideoScenes(lesson);
  const storyboardScenes = groundedEnrichment.annotateScenes(
    (video.slides || []).map((slide, index) => toStoryboardScene(scenes[index] || slide, index, generationTopic, slide)),
    { understanding, enrichmentPolicy }
  ).map(scene => withFreshSceneQuality(scene, generationTopic));
  const storyboard = {
    topic: generationTopic,
    materialUnderstanding: understanding,
    audienceLevel: lesson.audienceLevel || 'beginner',
    learningObjectives: lesson.learningObjectives || [],
    learningPath: {
      startHere: lesson.prerequisites && lesson.prerequisites.length ? `Review ${lesson.prerequisites[0]} first` : `Start with ${generationTopic}`,
      prerequisites: lesson.prerequisites || [],
      nextTopics: nextTopicsFor(generationTopic),
    },
    scenes: storyboardScenes,
    materialDiagnostics: diagnostics,
    renderer: env.VIDEO_RENDERER_EXPLICIT && env.VIDEO_RENDERER === 'canvas' ? 'canvas' : 'remotion',
    generatedAt: nowIso(),
  };
  storyboard.grounding = groundedEnrichment.buildGroundingMetadata(storyboard, { understanding, enrichmentPolicy });
  const scriptQuality = scoreVideoScript(scriptFromStoryboard(storyboard), {
    concept: generationTopic,
    chunks: rag.uploaded && rag.uploaded.chunks || [],
    lowGrounding: groundingTier === 'weak',
    threshold: env.STRICT_QUALITY_GATES ? 0.88 : env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
  });
  const boardQuality = storyboardQuality(storyboard);
  const quality = {
    storyboard: boardQuality,
    script: scriptQuality,
    lesson: lesson.quality || lessons.scoreLesson(lesson),
    materialUnderstanding: understanding,
    topicDetection: understanding,
    grounding: storyboard.grounding,
    enrichment: storyboard.grounding.enrichmentValidation,
    resolved_topic: understanding.topic || understanding.normalizedTopic || null,
    normalized_topic: understanding.normalizedTopic || null,
    detected_domain: understanding.domain || null,
    topic_confidence: understanding.confidence || null,
    topic_source: understanding.source || null,
    candidates: understanding.alternatives || [],
    materialDiagnostics: diagnostics,
  };
  const status = understanding.readyForGeneration && boardQuality.passed
    ? (env.STORYBOARD_REVIEW_REQUIRED || env.NOESIS_DEMO_MODE ? 'draft' : 'approved')
    : 'needs_review';
  const r = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, materialId, generationTopic, status, JSON.stringify(lesson), JSON.stringify(storyboard), JSON.stringify(quality), storyboard.renderer, nowIso(), nowIso(), status === 'approved' ? nowIso() : null);
  insertScenes(db, r.lastInsertRowid, storyboard.scenes);
  return getStoryboard(userId, r.lastInsertRowid);
}

function nextTopicsFor(topic) {
  const lower = String(topic || '').toLowerCase();
  if (lower.includes('polymorphism')) return ['Interfaces', 'Abstract Classes', 'SOLID'];
  if (lower.includes('inheritance')) return ['Polymorphism', 'Composition', 'Interfaces'];
  if (lower.includes('linked')) return ['Stack', 'Queue', 'Trees'];
  if (lower.includes('hash')) return ['Hash Functions', 'Collision Resolution', 'Maps'];
  if (lower.includes('stack')) return ['Queue', 'Recursion', 'Expression Parsing'];
  if (lower.includes('queue')) return ['Deque', 'BFS', 'Priority Queue'];
  return ['Practice', 'Quiz Review', 'Next Course Topic'];
}

function insertScenes(db, storyboardId, scenes) {
  const ins = db.prepare(`INSERT INTO video_storyboard_scenes
    (storyboard_id, scene_id, scene_order, scene_json, quality_json, approved, updated_at)
    VALUES (?,?,?,?,?,?,?)`);
  db.transaction(() => {
    scenes.forEach((scene, index) => ins.run(storyboardId, scene.id, index, JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings || [] }), 0, nowIso()));
  })();
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    lesson: parseJson(row.lesson_json, null),
    storyboard: parseJson(row.storyboard_json, null),
    quality: parseJson(row.quality_json, {}),
  };
}

function getStoryboard(userId, id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM video_storyboards WHERE id=? AND user_id=?').get(id, userId);
  if (!row) return null;
  const out = hydrate(row);
  if (out.storyboard) {
    out.storyboard = {
      ...out.storyboard,
      scenes: (out.storyboard.scenes || []).map(scene => withFreshSceneQuality(scene, out.storyboard.topic)),
    };
    out.quality = { ...out.quality, storyboard: storyboardQuality(out.storyboard) };
  }
  out.scenes = db.prepare('SELECT * FROM video_storyboard_scenes WHERE storyboard_id=? ORDER BY scene_order').all(id)
    .map(scene => ({ ...scene, scene: withFreshSceneQuality(parseJson(scene.scene_json, {}), out.storyboard && out.storyboard.topic) }));
  return out;
}

function listStoryboards(userId, materialId) {
  const db = getDb();
  const rows = materialId
    ? db.prepare('SELECT * FROM video_storyboards WHERE user_id=? AND material_id=? ORDER BY updated_at DESC LIMIT 20').all(userId, materialId)
    : db.prepare('SELECT * FROM video_storyboards WHERE user_id=? ORDER BY updated_at DESC LIMIT 20').all(userId);
  return rows.map(hydrate);
}

function updateScene(userId, id, sceneId, patch) {
  const db = getDb();
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const sceneRow = board.scenes.find(s => s.scene_id === sceneId);
  if (!sceneRow) throw new HttpError(404, 'scene_not_found');
  const scene = { ...sceneRow.scene };
  for (const key of ['title', 'teachingGoal', 'narration', 'visualTemplate', 'durationSec']) {
    if (patch[key] != null) scene[key] = patch[key];
  }
  if (patch.visualData && typeof patch.visualData === 'object') scene.visualData = { ...(scene.visualData || {}), ...patch.visualData };
  if (patch.code && typeof patch.code === 'object') scene.code = { ...(scene.code || {}), ...patch.code };
  const storyboard = board.storyboard;
  scene.qualityWarnings = sceneWarnings(scene, storyboard.topic);
  storyboard.scenes = storyboard.scenes.map(s => s.id === sceneId ? scene : s);
  const quality = { ...board.quality, storyboard: storyboardQuality(storyboard) };
  const nextStatus = quality.storyboard.passed ? 'draft' : 'needs_review';
  db.prepare('UPDATE video_storyboard_scenes SET scene_json=?, quality_json=?, approved=0, updated_at=? WHERE storyboard_id=? AND scene_id=?')
    .run(JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings }), nowIso(), id, sceneId);
  db.prepare('UPDATE video_storyboards SET storyboard_json=?, quality_json=?, status=?, updated_at=? WHERE id=? AND user_id=?')
    .run(JSON.stringify(storyboard), JSON.stringify(quality), nextStatus, nowIso(), id, userId);
  return getStoryboard(userId, id);
}

function approveStoryboard(userId, id) {
  const db = getDb();
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const storyboard = {
    ...board.storyboard,
    scenes: (board.storyboard.scenes || []).map(scene => withFreshSceneQuality(scene, board.storyboard.topic)),
  };
  const quality = { ...board.quality, storyboard: storyboardQuality(storyboard) };
  if (!quality.storyboard || quality.storyboard.passed !== true) {
    throw new HttpError(422, 'storyboard_quality_failed', 'Fix storyboard quality issues before approval.', quality.storyboard);
  }
  const updateSceneRow = db.prepare('UPDATE video_storyboard_scenes SET scene_json=?, quality_json=?, approved=1, updated_at=? WHERE storyboard_id=? AND scene_id=?');
  db.transaction(() => {
    db.prepare("UPDATE video_storyboards SET status='approved', approved_at=?, updated_at=?, quality_json=?, storyboard_json=? WHERE id=? AND user_id=?")
      .run(nowIso(), nowIso(), JSON.stringify(quality), JSON.stringify(storyboard), id, userId);
    for (const scene of storyboard.scenes) {
      updateSceneRow.run(JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings || [] }), nowIso(), id, scene.id);
    }
  })();
  return getStoryboard(userId, id);
}

async function renderScenePreview(userId, id, sceneId) {
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const sceneRow = board.scenes.find(s => s.scene_id === sceneId);
  if (!sceneRow) throw new HttpError(404, 'scene_not_found');
  const outPath = path.join(env.UPLOAD_DIR, 'storyboards', String(id), `${sceneId}.png`);
  const script = scriptFromStoryboard({ ...board.storyboard, scenes: [sceneRow.scene] });
  const rendered = await renderer.renderScenePreview(script.slides[0], outPath);
  return fs.existsSync(rendered) ? rendered : null;
}

function scriptForRender(userId, id) {
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const sanitized = sanitizeForRender(board.storyboard);
  const visibleCheck = scanVisibleText(sanitized);
  return {
    board,
    script: scriptFromStoryboard(board.storyboard),
    sanitizedStoryboard: sanitized,
    lesson: board.lesson,
    quality: board.quality,
    visibleTextClean: visibleCheck.clean,
    visibleTextBanned: visibleCheck.term || null,
  };
}

module.exports = {
  generateStoryboard,
  getStoryboard,
  listStoryboards,
  updateScene,
  approveStoryboard,
  renderScenePreview,
  scriptForRender,
  scriptFromStoryboard,
  storyboardQuality,
  sanitizeForRender,
  sanitizeSceneForRender,
  scanVisibleText,
  _internals: {
    visualTemplateFor,
    visualElementsFor,
    validateVisualRelevance,
    storyboardVisualValidation,
    conceptMapAllowedForScene,
    conceptMapNodesAreSourceBacked,
  },
};
