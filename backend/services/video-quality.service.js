'use strict';

const codeWindow = require('../utils/code-window');

const REQUIRED_SLIDE_TYPES = ['title', 'objectives', 'concept', 'analogy', 'diagram', 'mistakes', 'recap', 'quiz'];
const PLACEHOLDER_RE = /(this is a document|definition goes here|example here|lorem ipsum|topic explanation|placeholder|todo\b|trace an example|define the idea|apply (?:the )?main rule|code sketch|avoid mistakes|useconcept|name the parts|follow one operation|identify its rules)/i;
const GENERIC_ONLY_NODES = new Set(['definition', 'rule', 'example', 'boundary', 'visual model', 'mistakes', 'concept', 'start', 'practice']);
const FORBIDDEN_VISIBLE_RE = /\b(callout|source note|trace an example|code sketch|define the idea|qualityWarnings|qualityChecks|sourceChunkIds|debugWarnings)\b|teaching\s*goal\s*:|\[chunk:\s*\d+\]/i;
const OOP_TERMS = ['class', 'object', 'method', 'private', 'public', 'field', 'interface', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction'];
const DS_TERMS = ['node', 'pointer', 'stack', 'queue', 'priority queue', 'deque', 'tree', 'linked list', 'binary search', 'complexity', 'big-o', 'o(n)', 'push', 'pop', 'hash table', 'hash', 'bucket', 'collision', 'load factor', 'resize', 'probe'];
const DS_TOPIC_TERMS = ['linked list', 'node.next', 'stack', 'queue', 'priority queue', 'deque', 'double ended queue', 'tree', 'binary search tree', 'bst', 'heap', 'graph', 'hash table', 'hash map', 'hashmap', 'bucket', 'collision', 'load factor', 'resize', 'rehash', 'probe', 'chaining', 'push', 'pop', 'enqueue', 'dequeue'];
const DS_OPERATION_VISUAL_TYPES = new Set(['linkedlist', 'linked_list_operation', 'hash_table', 'hash_table_operation', 'stack_queue', 'stack_operation', 'queue_operation', 'tree', 'tree_visual', 'bigo_chart', 'big_o_growth', 'flow', 'process_flow']);
const DS_TOPIC_VISUAL_TYPES = new Set(['linkedlist', 'linked_list_operation', 'hash_table', 'hash_table_operation', 'stack_queue', 'stack_operation', 'queue_operation', 'tree', 'tree_visual']);
const OOP_VISUAL_TYPES = new Set(['class_diagram', 'class_object', 'encapsulation_boundary', 'inheritance_uml', 'polymorphism_dispatch']);
const GENERAL_VISUAL_TYPES = new Set(['cards', 'concept_cards', 'table', 'classification_table', 'comparison_table', 'source_reference', 'source_page_reference', 'source_slide_reference', 'flow', 'process_flow', 'comparison', 'comparison_contrast', 'summary', 'summary_path', 'none', 'no_visual']);
const HANGING_WORD_RE = /\b(?:a|an|and|as|at|because|before|but|by|for|from|if|in|into|is|of|on|or|that|the|then|through|to|with|while)$/i;

function asList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function visualType(slide) {
  return (slide && slide.visual && slide.visual.type) || slide.visual_type || '';
}

function slideType(slide) {
  return slide && (slide.slideType || slide.slide_type || '');
}

function containsAny(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.some(t => lower.includes(t));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function scriptVisibleText(script) {
  const slides = asList(script && script.slides);
  const parts = [
    script && script.topic,
    ...asList(script && script.learningObjectives),
  ];
  for (const slide of slides) {
    parts.push(slide && slide.title);
    parts.push(...asList(slide && slide.bullets));
    parts.push(slide && slide.narration);
    parts.push(...asList(slide && slide.visual_nodes));
    parts.push(slide && slide.caption);
    if (slide && slide.visual) {
      parts.push(...asList(slide.visual.nodes));
      parts.push(slide.visual.caption);
    }
    if (slide && slide.code_focus) parts.push(slide.code_focus.explanation, slide.code_focus.lineRange);
  }
  return parts.filter(Boolean).join(' ');
}

function addCriterion(criteria, name, passed, reason, weight = 1) {
  criteria.push({ name, passed: !!passed, reason, weight });
}

function visibleItems(script) {
  const slides = asList(script && script.slides);
  return [
    ...(script && script.learningObjectives || []),
    ...slides.flatMap(s => [s.title, ...(s.bullets || []), ...(s.visual_nodes || []), s.caption, s.pointerLabel, s.focusTarget]),
  ].filter(Boolean).map(value => String(value).trim());
}

function isCompleteVisibleText(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/^[A-Za-z0-9]$/.test(text)) return true;
  if (text.endsWith('...') || text.endsWith('…')) return false;
  if (HANGING_WORD_RE.test(text)) return false;
  if (/[,;:-]\s*$/.test(text)) return false;
  return true;
}

function isCodeToken(value) {
  return /\b[A-Z][A-Za-z0-9_]*\.[A-Za-z0-9_]+\(\)$|^O\([^)]*\)$/.test(String(value || '').trim());
}

function stripInlineMarkup(value) {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function isShortFocusLabel(value) {
  const text = stripInlineMarkup(value);
  if (!text || !isCompleteVisibleText(text)) return false;
  if (isCodeToken(text)) return true;
  if (/^(explain|trace|point|read|know|check|name|apply)\b/i.test(text)) return false;
  return text.length <= 42 && wordCount(text) >= 1 && wordCount(text) <= 5 && !/[.!?]$/.test(text);
}

function isReadableGeneralFocusLabel(value) {
  const text = stripInlineMarkup(value);
  if (!text || !isCompleteVisibleText(text)) return false;
  if (isCodeToken(text)) return true;
  return text.length <= 72 && wordCount(text) >= 1 && wordCount(text) <= 8 && !text.endsWith('...');
}

function matchingTerms(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.filter(term => {
    const normalized = String(term || '').toLowerCase();
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(lower);
  });
}

function likelyDataStructureTopic(concept, allText, visualTypes) {
  const conceptLower = String(concept || '').toLowerCase();
  if (matchingTerms(conceptLower, DS_TOPIC_TERMS).length > 0) return true;
  if ((visualTypes || []).some(type => DS_TOPIC_VISUAL_TYPES.has(type))) return true;
  const signals = new Set(matchingTerms(allText, DS_TOPIC_TERMS));
  return signals.size >= 2;
}

function codeFocusDiagnostics(slide) {
  const focus = slide && (slide.code_focus || slide.codeFocus);
  if (!focus) {
    return { basic: false, visible: false, titleMatch: false, explanationFits: false, pointerTargets: false };
  }
  const normalized = codeWindow.normalizeCodeWindow({
    ...focus,
    content: focus.content || slide.example_code || '',
  }, { maxVisibleLines: 12, contextBefore: 2 });
  const visible = new Set();
  for (let n = normalized.visibleStartLine; n <= normalized.visibleEndLine; n += 1) visible.add(n);
  const titleLines = codeWindow.parseLineRange(slide && slide.title);
  const pointers = Array.isArray(focus.pointers) ? focus.pointers : [];
  const explicitTargetsOk = pointers.every(pointer => {
    const target = String(pointer && pointer.to || '');
    if (!target || target === 'highlighted_code_lines') return normalized.highlightLines.length > 0;
    const match = target.match(/code_line_(\d+)/i);
    return !match || visible.has(Number(match[1]));
  });
  return {
    basic: !!(String(normalized.content || '').trim() && String(normalized.lineRange || '').trim() && normalized.highlightLines.length),
    visible: normalized.highlightLines.length > 0 &&
      normalized.highlightLines.every(line => visible.has(line)) &&
      !normalized.warnings.includes('code_line_range_outside_source') &&
      !normalized.warnings.includes('highlight_lines_not_visible'),
    titleMatch: !titleLines.length || titleLines.every(line => normalized.highlightLines.includes(line)),
    explanationFits: String(focus.explanation || '').trim().length > 0 && String(focus.explanation || '').length <= 520,
    pointerTargets: explicitTargetsOk && (pointers.length > 0 || normalized.highlightLines.length > 0),
  };
}

function scoreVideoScript(script, opts = {}) {
  const concept = String(opts.concept || script && script.topic || '').trim();
  const domain = opts.domain || (opts.domainInfo && opts.domainInfo.domain) || '';
  const nonCsDomain = !!domain && domain !== 'cs';
  const chunks = asList(opts.chunks);
  const lowGrounding = !!opts.lowGrounding;
  const slides = asList(script && script.slides);
  const reasons = [];
  const criteria = [];
  const allText = JSON.stringify(script || {}).toLowerCase();
  const topicMapTopics = asList(
    (opts.topicMap && opts.topicMap.topics) ||
    (script && script.topicMap && script.topicMap.topics) ||
    (script && script.sourceTopicPlan && script.sourceTopicPlan.topicBundle)
  );
  const teachingTopicNames = unique(topicMapTopics.map(item => String(item && (item.name || item.topic) || '').trim()).filter(Boolean));
  const teachingTopicText = teachingTopicNames.join(' ').toLowerCase();
  const topicNameMatches = (pattern) => teachingTopicText
    ? pattern.test(teachingTopicText)
    : pattern.test(concept.toLowerCase());
  const sourceText = chunks.map(chunk => String(chunk && chunk.text || '')).join(' ').toLowerCase();
  const types = slides.map(slideType);
  const visualTypes = unique(slides.map(visualType));
  const requiredSlideTypes = nonCsDomain
    ? []
    : REQUIRED_SLIDE_TYPES;
  const generalSourceLedSequence = nonCsDomain && slides.length >= 5 &&
    (types.includes('title') || types.includes('concept') || types.includes('objectives')) &&
    types.some(t => ['concept', 'analogy', 'diagram', 'recap'].includes(t)) &&
    (types.includes('mistakes') || /mistake|misunderstanding|pitfall/i.test(allText)) &&
    (types.includes('quiz') || /checkpoint|review question|check yourself|question/i.test(allText)) &&
    (types.includes('recap') || /recap|summary|takeaway|next step/i.test(allText));
  const requiredTypesOk = nonCsDomain
    ? generalSourceLedSequence
    : requiredSlideTypes.every(t => types.includes(t)) && (types.includes('code') || types.includes('step_by_step'));
  const narrations = slides.map(s => String(s && s.narration || '').trim());
  const bulletLists = slides.map(s => asList(s && s.bullets));
  const conceptWords = concept.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const conceptCovered = !conceptWords.length || conceptWords.every(w => allText.includes(w));
  const likelyOop = containsAny(concept, OOP_TERMS) || containsAny(allText, ['encapsulation', 'inheritance', 'polymorphism', 'abstraction']);
  const likelyDs = likelyDataStructureTopic(concept, allText, visualTypes);
  const allVisualNodes = slides.flatMap(s => [
    ...asList(s && s.visual_nodes),
    ...(s && s.visual ? asList(s.visual.nodes) : []),
  ]).map(n => String(typeof n === 'string' ? n : n && (n.label || n.id) || '').toLowerCase().trim()).filter(Boolean);
  const conceptLower = concept.toLowerCase();
  const topicSpecificNodes = allVisualNodes.filter(n => !GENERIC_ONLY_NODES.has(n) && n !== conceptLower);
  const hasTopicSpecificNodes = topicSpecificNodes.length >= 5;
  const nonCsExamplePattern = /\b(example|scenario|case|apply|application|worked|source-based|real-world|decision|event|problem)\b/i;
  const hasCodeOrExample = slides.some(s => String(s.example_code || '').trim().length > 20)
    || nonCsExamplePattern.test(allText)
    || /for\s*\(|class\s+\w+|push|pop|insert|search/i.test(allText);
  const sourceTerms = unique(chunks.flatMap(chunk => [
    chunk && chunk.chapter_title,
    chunk && chunk.heading,
    chunk && chunk.slide_title,
    chunk && chunk.section_title,
    ...String(chunk && chunk.text || '').toLowerCase().split(/[^a-z0-9+#-]+/).filter(word => word.length >= 5),
  ]).filter(Boolean).map(term => String(term).toLowerCase()).filter(term => !GENERIC_ONLY_NODES.has(term))).slice(0, 16);
  const sourceTermsCovered = !sourceTerms.length || sourceTerms.some(term => allText.includes(term));
  const placeholders = PLACEHOLDER_RE.test(allText);
  const visibleText = scriptVisibleText(script);
  const visibleLower = visibleText.toLowerCase();
  const visibleForbidden = FORBIDDEN_VISIBLE_RE.test(visibleText);
  const noCallouts = slides.every(s => asList(s && s.callouts).length === 0) && !/\bcallout\b/i.test(visibleText);
  const noVisibleChunkRefs = !/\[chunk:\s*\d+\]/i.test(visibleText);
  const displayItems = visibleItems(script);
  const noVisibleTruncation = displayItems.every(isCompleteVisibleText);
  const shortFocusLabels = bulletLists.length > 0 && bulletLists.every(list => list.length >= 1 && list.length <= 2 && list.every(isShortFocusLabel));
  const generalFocusLabelsOk = !nonCsDomain || bulletLists.length === 0 || bulletLists.every(list => list.length >= 1 && list.length <= 3 && list.every(isReadableGeneralFocusLabel));
  const walkthroughSlides = slides.filter(s => (s && s.sceneType === 'code_walkthrough') || (slideType(s) === 'step_by_step' && (s.example_code || s.code_focus)));
  const walkthroughDiagnostics = walkthroughSlides.map(codeFocusDiagnostics);
  const walkthroughLineRanges = !walkthroughSlides.length || walkthroughDiagnostics.every(d => d.basic);
  const walkthroughVisibleLines = !walkthroughSlides.length || walkthroughDiagnostics.every(d => d.visible && d.titleMatch);
  const walkthroughExplanationFits = !walkthroughSlides.length || walkthroughDiagnostics.every(d => d.explanationFits);
  const walkthroughPointerTargets = !walkthroughSlides.length || walkthroughDiagnostics.every(d => d.pointerTargets);
  const hasOopVisual = !likelyOop || visualTypes.some(t => OOP_VISUAL_TYPES.has(t));
  const hasDsSourceOperationVisual = visualTypes.some(t => ['source_reference', 'source_page_reference', 'source_slide_reference'].includes(t)) &&
    slides.some(s => (s.image_path || s.imagePath || s.source_visual_id || s.sourceVisualId) &&
      /stack|queue|priority|deque|heap|push|pop|enqueue|dequeue|front|rear|root|node|operation|state/i.test(JSON.stringify(s)));
  const hasDsOperationVisual = !likelyDs || visualTypes.some(t => DS_OPERATION_VISUAL_TYPES.has(t)) || hasDsSourceOperationVisual;
  const topicRequiresComplexity = topicNameMatches(/complexity|big.?o|algorithm|linked\s+list|hash|binary\s+search\s+tree|\bbst\b|tree|graph|heap/);
  const hasDsComplexity = !likelyDs || !topicRequiresComplexity || /o\(\s*1\s*\)|o\(\s*n\s*\)|o\(\s*log\s*n\s*\)|complexity|constant time|linear time/i.test(visibleText);
  const forbiddenCsTerms = ['search algorithm', 'binary search', 'linear search', 'data structure', 'object-oriented', 'oop', 'java', 'class diagram', 'class', 'object', 'interface', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction', 'stack', 'queue', 'push', 'pop', 'enqueue', 'dequeue', 'lifo', 'fifo', 'hash function', 'hash table', 'hash map', 'bucket', 'bucket index', 'collision', 'collision handling', 'load factor', 'rehash', 'linked list', 'binary search tree', 'bst'];
  const forbiddenCsForNonCs = forbiddenCsTerms.some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    return re.test(visibleText) && !re.test(sourceText);
  });
  const lowerConcept = conceptLower;

  addCriterion(criteria, 'valid_shape', slides.length > 0 && slides.every(s => s && s.title && s.narration), 'Script has slides with title and narration.', 1.2);
  addCriterion(criteria, 'slide_count_8_to_12', slides.length >= 8 && slides.length <= 12, `Slide count is ${slides.length}; expected 8-12.`, 1);
  addCriterion(criteria, 'learning_objectives', asList(script && script.learningObjectives).length >= 2 || types.includes('objectives'), 'Has learning objectives or objectives slide.', 0.8);
  addCriterion(criteria, 'required_slide_types', requiredTypesOk, nonCsDomain ? 'Covers a source-led explanation, mistake/checkpoint, and recap sequence.' : 'Covers required teaching slide sequence.', 1.3);
  const teachingTypes = ['concept', 'analogy', 'code', 'step_by_step', 'diagram', 'mistakes'];
  const narrationDeep = narrations.length > 0 && slides.every((s, i) => {
    const minLen = teachingTypes.includes(slideType(s)) ? 150 : 60;
    return narrations[i].length >= minLen;
  });
  addCriterion(criteria, 'narration_depth', narrationDeep, 'Teaching slides have 150+ char narration; others have 60+.', 1.3);
  addCriterion(criteria, 'no_truncated_visible_text', noVisibleTruncation, 'No visible title, bullet, or label ends with "..." (truncated).', 0.9);
  addCriterion(criteria, 'meaningful_bullets', nonCsDomain ? generalFocusLabelsOk : shortFocusLabels, nonCsDomain ? 'Focus labels are complete, readable, and source-specific.' : 'Focus labels are short, complete, and meaningful.', 0.9);
  addCriterion(criteria, 'short_focus_labels', nonCsDomain ? generalFocusLabelsOk : shortFocusLabels, nonCsDomain ? 'General-material focus labels must be complete and readable.' : 'Focus labels must be 1-5 words or compact code tokens.', 1);
  addCriterion(criteria, 'visual_diversity', nonCsDomain
    ? (visualTypes.length === 0 || visualTypes.some(t => GENERAL_VISUAL_TYPES.has(t) || t !== 'mindmap'))
    : visualTypes.length >= 3 && !(visualTypes.length === 1 && visualTypes[0] === 'mindmap'),
    `Visual types: ${visualTypes.join(', ') || 'none'}.`, 0.9);
  addCriterion(criteria, 'concept_coverage', conceptCovered, `Mentions concept "${concept}".`, 0.8);
  addCriterion(criteria, 'source_terms', !nonCsDomain || sourceTermsCovered, 'Non-CS videos mention terms from the uploaded material.', 0.8);
  addCriterion(criteria, 'domain_keywords', (!likelyOop || containsAny(allText, OOP_TERMS)) && (!likelyDs || containsAny(allText, DS_TERMS)), 'Includes expected OOP/Data Structures vocabulary.', 0.8);
  addCriterion(criteria, 'examples_or_code', hasCodeOrExample, 'Includes a concrete example, case, scenario, or code-like sketch.', 0.8);
  addCriterion(criteria, 'no_video_callouts', noCallouts, 'Video scenes must not include callout panels or callout text.', 1.2);
  addCriterion(criteria, 'no_visible_chunk_refs', noVisibleChunkRefs, 'Visible video text must not expose chunk references.', 1);
  addCriterion(criteria, 'no_forbidden_visible_terms', !visibleForbidden, 'Visible video text must not contain callout/source-note or placeholder labels.', 1.1);
  addCriterion(criteria, 'no_unrelated_cs_terms', !nonCsDomain || !forbiddenCsForNonCs, 'Non-CS videos must not inject unrelated CS/OOP/Data Structures terms.', 1.2);
  addCriterion(criteria, 'code_walkthrough_line_ranges', walkthroughLineRanges, 'Code walkthrough scenes must include code_focus.lineRange and highlightLines.', 1.2);
  addCriterion(criteria, 'code_walkthrough_visible_lines', walkthroughVisibleLines, 'Code walkthrough highlighted/title lines must exist and be visible in the viewport.', 1.3);
  addCriterion(criteria, 'code_walkthrough_explanation_fit', walkthroughExplanationFits, 'Code walkthrough explanation panels need readable, bounded explanation text.', 1);
  addCriterion(criteria, 'code_walkthrough_pointer_targets', walkthroughPointerTargets, 'Code walkthrough visual pointers must target highlighted visible code lines.', 1);
  addCriterion(criteria, 'oop_class_visual', hasOopVisual, 'OOP videos need a UML/class relationship visual.', 1);
  addCriterion(criteria, 'ds_operation_visual', hasDsOperationVisual, 'Data-structure videos need an operation-state visual.', 1);
  addCriterion(criteria, 'ds_complexity', hasDsComplexity, 'Data-structure videos need complexity analysis.', 0.9);
  if (lowerConcept.includes('inheritance')) {
    addCriterion(criteria, 'inheritance_specifics',
      containsAny(allText, ['shape']) && containsAny(allText, ['circle']) && containsAny(allText, ['rectangle']) &&
      containsAny(allText, ['extends']) && containsAny(allText, ['override']) && containsAny(allText, ['composition']),
      'Inheritance scripts must include Shape/Circle/Rectangle, extends, overriding, and composition contrast.',
      1.4);
  }
  if (topicNameMatches(/\bstack\b|lifo/)) {
    addCriterion(criteria, 'stack_specifics',
      containsAny(visibleLower, ['lifo']) && containsAny(visibleLower, ['push']) && containsAny(visibleLower, ['pop']) &&
      containsAny(visibleLower, ['peek']) && containsAny(visibleLower, ['underflow']) && visualTypes.some(t => t === 'stack_queue' || t === 'stack_operation'),
      'Stack scripts must include LIFO, push/pop/peek, underflow, and a vertical stack visual.',
      1.4);
  }
  if (topicNameMatches(/\bqueue\b|fifo|deque/)) {
    addCriterion(criteria, 'queue_specifics',
      containsAny(visibleLower, ['fifo', 'first in', 'first-in']) && containsAny(visibleLower, ['enqueue']) &&
      containsAny(visibleLower, ['dequeue']) && containsAny(visibleLower, ['front']) &&
      containsAny(visibleLower, ['rear']) && visualTypes.some(t => t === 'stack_queue' || t === 'queue_operation'),
      'Queue scripts must include FIFO, enqueue/dequeue, front/rear pointers, and a horizontal queue visual.',
      1.4);
  }
  if (lowerConcept.includes('polymorphism')) {
    addCriterion(criteria, 'polymorphism_specifics',
      containsAny(allText, ['dynamic dispatch']) && containsAny(allText, ['superclass', 'shape reference']) &&
      containsAny(allText, ['subclass', 'circle object', 'rectangle object']) && containsAny(allText, ['overloading']) &&
      containsAny(allText, ['static', 'final']),
      'Polymorphism scripts must include dynamic dispatch, superclass reference, subclass object, overloading contrast, and static/final warning.',
      1.4);
  }
  if (topicNameMatches(/linked\s+list/)) {
    addCriterion(criteria, 'linked_list_specifics',
      containsAny(allText, ['node']) && containsAny(allText, ['head']) && containsAny(allText, ['next']) &&
      containsAny(allText, ['insert']) && containsAny(allText, ['delete', 'deletion']) && containsAny(allText, ['o(n)', 'o(1)']),
      'Linked-list scripts must include node/head/next, insertion/deletion, and complexity.',
      1.4);
  }
  if (topicNameMatches(/hash/)) {
    addCriterion(criteria, 'hash_table_specifics',
      containsAny(allText, ['hash function', 'hash(key)', 'hashcode']) &&
      containsAny(allText, ['bucket', 'bucket index']) &&
      containsAny(allText, ['collision', 'separate chaining', 'open addressing']) &&
      containsAny(allText, ['load factor', 'resize', 'rehash']) &&
      /o\(\s*1\s*\)/i.test(allText) &&
      /o\(\s*n\s*\)|worst/i.test(allText) &&
      visualTypes.some(t => t === 'hash_table' || t === 'hash_table_operation'),
      'Hash-table scripts must include hashing, bucket index, collisions, load factor/resize, expected O(1), worst O(n), and a hash_table visual.',
      1.4);
  }
  if (topicNameMatches(/binary\s+search\s+tree|\bbst\b/)) {
    addCriterion(criteria, 'bst_specifics',
      containsAny(allText, ['root']) && containsAny(allText, ['left']) && containsAny(allText, ['right']) &&
      containsAny(allText, ['search', 'insert']) && containsAny(allText, ['inorder', 'in-order']) &&
      visualTypes.some(t => t === 'tree' || t === 'tree_visual'),
      'BST scripts must include root, smaller-left/larger-right rule, search/insert path, inorder traversal, and a tree visual.',
      1.4);
  }
  if (topicNameMatches(/big.?o|complexity/)) {
    addCriterion(criteria, 'big_o_specifics',
      containsAny(allText, ['input size', 'input n', 'n grows', 'as n']) &&
      containsAny(allText, ['growth rate', 'growth curve', 'rate of growth']) &&
      /o\(\s*1\s*\)/i.test(allText) &&
      /o\(\s*log\s*n\s*\)/i.test(allText) &&
      /o\(\s*n\s*\)/i.test(allText) &&
      (/o\(\s*n\s*log\s*n\s*\)/i.test(allText) || /o\(\s*n\^?2\s*\)|quadratic/i.test(allText)) &&
      containsAny(allText, ['seconds', 'machine', 'wall clock', 'runtime seconds']) &&
      visualTypes.some(t => t === 'bigo_chart' || t === 'big_o_growth'),
      'Big-O scripts must include input size, growth rate, O(1), O(log n), O(n), O(n log n) or O(n^2), runtime-seconds misconception, and a growth chart.',
      1.4);
  }
  if (conceptLower.includes('encapsulation')) {
    addCriterion(criteria, 'encapsulation_specifics',
      containsAny(allText, ['private']) && containsAny(allText, ['public']) &&
      containsAny(allText, ['getter', 'getbalance', 'get_balance', 'accessor']) &&
      containsAny(allText, ['validation', 'guard', 'protect']) &&
      containsAny(allText, ['balance', 'bankaccount', 'bank_account', 'account']),
      'Encapsulation scripts must include private/public fields, getters, validation, and a concrete example like BankAccount.',
      1.4);
  }
  addCriterion(criteria, 'topic_specific_visual_nodes',
    !likelyOop && !likelyDs ? true : hasTopicSpecificNodes,
    `Visual nodes must include topic-specific terms, not only generic placeholders. Found ${topicSpecificNodes.length} specific nodes.`,
    1.1);
  addCriterion(criteria, 'no_placeholders', !placeholders, 'No placeholder/generic phrases.', 1);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  for (const c of criteria) {
    if (!c.passed) reasons.push(c.reason);
  }
  const score = totalWeight ? earned / totalWeight : 0;
  const hardGateNames = new Set([
    'valid_shape',
    'slide_count_8_to_12',
    'required_slide_types',
    'no_truncated_visible_text',
    'short_focus_labels',
    'no_video_callouts',
    'no_visible_chunk_refs',
    'no_forbidden_visible_terms',
    'no_unrelated_cs_terms',
    'code_walkthrough_line_ranges',
    'code_walkthrough_visible_lines',
    'code_walkthrough_explanation_fit',
    'code_walkthrough_pointer_targets',
    'no_placeholders',
    'inheritance_specifics',
    'polymorphism_specifics',
    'linked_list_specifics',
    'hash_table_specifics',
    'stack_specifics',
    'queue_specifics',
    'bst_specifics',
    'big_o_specifics',
    'oop_class_visual',
    'ds_operation_visual',
    'ds_complexity',
    'encapsulation_specifics',
    'topic_specific_visual_nodes',
  ]);
  if (nonCsDomain) {
    hardGateNames.delete('required_slide_types');
    hardGateNames.delete('short_focus_labels');
    hardGateNames.delete('topic_specific_visual_nodes');
    hardGateNames.delete('oop_class_visual');
    hardGateNames.delete('ds_operation_visual');
    hardGateNames.delete('ds_complexity');
  }
  const hardGatesPassed = criteria.every(c => !hardGateNames.has(c.name) || c.passed);
  return {
    score: Math.round(score * 1000) / 1000,
    passed: score >= (opts.threshold == null ? 0.75 : opts.threshold) && hardGatesPassed,
    reasons,
    criteria,
    visualTypes,
    slideTypes: types,
  };
}

module.exports = {
  scoreVideoScript,
  REQUIRED_SLIDE_TYPES,
  PLACEHOLDER_RE,
  FORBIDDEN_VISIBLE_RE,
};
