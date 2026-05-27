'use strict';

const SUPPORTED_VISUALS = {
  encapsulation_boundary: {
    name: 'EncapsulationBoundaryVisual',
    aliases: ['encapsulation', 'data_hiding', 'private_fields', 'getter_setter'],
    concrete: true,
  },
  class_object: {
    name: 'ClassObjectVisual',
    aliases: ['class_object_visual', 'classes_objects', 'classes_and_objects', 'oop_class_diagram', 'class_diagram', 'uml_class', 'abstraction_contract', 'interface_contract'],
    concrete: true,
  },
  inheritance_uml: {
    name: 'InheritanceVisual',
    aliases: ['inheritance', 'inheritance_visual', 'inheritance_tree', 'extends_uml'],
    concrete: true,
  },
  polymorphism_dispatch: {
    name: 'PolymorphismVisual',
    aliases: ['polymorphism', 'polymorphism_visual', 'runtime_dispatch', 'dynamic_dispatch'],
    concrete: true,
  },
  linked_list_operation: {
    name: 'LinkedListVisual',
    aliases: ['linked_list', 'linkedlist', 'linked_list_visual', 'linked_list_operation_visual'],
    concrete: true,
  },
  stack_operation: {
    name: 'StackQueueVisual',
    aliases: ['stack', 'stack_visual', 'stack_queue_stack'],
    concrete: true,
  },
  queue_operation: {
    name: 'StackQueueVisual',
    aliases: ['queue', 'queue_visual', 'stack_queue_queue'],
    concrete: true,
  },
  hash_table_operation: {
    name: 'HashTableVisual',
    aliases: ['hash_table', 'hashmap', 'hash_map', 'hashing', 'hash_table_visual'],
    concrete: true,
  },
  tree_visual: {
    name: 'TreeVisual',
    aliases: ['tree', 'tree_path', 'bst_operation', 'bst_visual', 'binary_search_tree', 'binary_search_tree_visual'],
    concrete: true,
  },
  big_o_growth: {
    name: 'BigOVisual',
    aliases: ['big_o', 'big_o_visual', 'bigo_chart', 'complexity_chart', 'time_complexity', 'space_complexity'],
    concrete: true,
  },
  code_walkthrough: {
    name: 'CodeWalkthroughVisual',
    aliases: ['code', 'code_visual', 'line_highlight', 'code_example'],
    concrete: true,
  },
  process_flow: {
    name: 'ProcessFlowVisual',
    aliases: ['flow', 'step_by_step', 'operation_flow', 'algorithm_flow'],
    concrete: true,
  },
  comparison_contrast: {
    name: 'ComparisonVisual',
    aliases: ['comparison', 'compare', 'before_after', 'mistake_correction'],
    concrete: true,
  },
  concept_cards: {
    name: 'ConceptCardsVisual',
    aliases: ['cards', 'study_cards', 'source_cards', 'concept_cards_visual'],
    concrete: true,
    general: true,
  },
  classification_table: {
    name: 'TableVisual',
    aliases: ['table', 'classification', 'classification_table_visual', 'source_table'],
    concrete: true,
    general: true,
  },
  comparison_table: {
    name: 'TableVisual',
    aliases: ['compare_table', 'comparison_table_visual'],
    concrete: true,
    general: true,
  },
  source_page_reference: {
    name: 'SourceReferenceVisual',
    aliases: ['source_page', 'page_reference', 'source_page_image', 'source_diagram'],
    concrete: true,
    general: true,
    sourceReference: true,
  },
  source_slide_reference: {
    name: 'SourceReferenceVisual',
    aliases: ['source_slide', 'slide_reference', 'source_slide_image'],
    concrete: true,
    general: true,
    sourceReference: true,
  },
  no_visual: {
    name: 'NoVisual',
    aliases: ['none', 'no_visual', 'text_only', 'source_text'],
    concrete: true,
    general: true,
    optional: true,
  },
  learning_objectives: {
    name: 'ConceptMapVisual',
    aliases: ['objectives'],
    concrete: true,
    conceptMap: true,
  },
  summary_path: {
    name: 'ConceptMapVisual',
    aliases: ['summary', 'recap', 'summary_visual'],
    concrete: true,
    conceptMap: true,
  },
  concept_map: {
    name: 'ConceptMapVisual',
    aliases: ['mindmap', 'mind_map', 'learning_map'],
    concrete: false,
    conceptMap: true,
  },
};

const ALIASES = new Map();
for (const [canonical, config] of Object.entries(SUPPORTED_VISUALS)) {
  ALIASES.set(canonical, canonical);
  for (const alias of config.aliases || []) ALIASES.set(alias, canonical);
}

const CANONICAL_VISUAL_TYPES = Object.keys(SUPPORTED_VISUALS);

const LEGACY_SLIDE_VISUAL_TYPES = {
  encapsulation_boundary: 'class_diagram',
  class_object: 'class_diagram',
  inheritance_uml: 'class_diagram',
  polymorphism_dispatch: 'class_diagram',
  linked_list_operation: 'linkedlist',
  stack_operation: 'stack_queue',
  queue_operation: 'stack_queue',
  hash_table_operation: 'hash_table',
  tree_visual: 'tree',
  big_o_growth: 'bigo_chart',
  code_walkthrough: 'code',
  process_flow: 'flow',
  comparison_contrast: 'comparison',
  concept_cards: 'cards',
  classification_table: 'table',
  comparison_table: 'table',
  source_page_reference: 'source_reference',
  source_slide_reference: 'source_reference',
  no_visual: 'none',
  learning_objectives: 'summary',
  summary_path: 'summary',
  concept_map: 'mindmap',
};

function key(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveStackQueue(contextText) {
  const lower = String(contextText || '').toLowerCase();
  if (/\b(queue|fifo|enqueue|dequeue|front|rear)\b/.test(lower)) return 'queue_operation';
  return 'stack_operation';
}

function resolveVisualType(value, opts = {}) {
  const raw = key(value || opts.visualType || opts.template || '');
  const contextText = [
    opts.topic,
    opts.title,
    opts.text,
    opts.visualText,
  ].filter(Boolean).join(' ');

  if (!raw) {
    return { input: value || '', canonical: '', supported: false, reason: 'missing_visual_type' };
  }
  if (raw === 'stack_queue') {
    const canonical = resolveStackQueue(contextText);
    return { input: value, canonical, supported: true, config: SUPPORTED_VISUALS[canonical], aliasOf: canonical };
  }
  const canonical = ALIASES.get(raw) || raw;
  const config = SUPPORTED_VISUALS[canonical] || null;
  return {
    input: value,
    canonical,
    supported: !!config,
    config,
    aliasOf: config && canonical !== raw ? canonical : null,
    reason: config ? '' : 'unsupported_visual_type',
  };
}

function normalizeVisualType(value, opts = {}) {
  const resolved = resolveVisualType(value, opts);
  return resolved.supported ? resolved.canonical : key(value);
}

function isSupportedVisualType(value, opts = {}) {
  return resolveVisualType(value, opts).supported;
}

function supportedVisualTypes() {
  return [...CANONICAL_VISUAL_TYPES];
}

function legacyVisualTypeFor(value, opts = {}) {
  const resolved = resolveVisualType(value, opts);
  const canonical = resolved.supported ? resolved.canonical : key(value || opts.visualType || opts.template || '');
  return LEGACY_SLIDE_VISUAL_TYPES[canonical] || canonical;
}

function isConceptMapVisualType(value, opts = {}) {
  const resolved = resolveVisualType(value, opts);
  return !!(resolved.supported && resolved.config && resolved.config.conceptMap);
}

module.exports = {
  SUPPORTED_VISUALS,
  CANONICAL_VISUAL_TYPES,
  LEGACY_SLIDE_VISUAL_TYPES,
  resolveVisualType,
  normalizeVisualType,
  isSupportedVisualType,
  isConceptMapVisualType,
  supportedVisualTypes,
  legacyVisualTypeFor,
  _internals: { key, resolveStackQueue },
};
