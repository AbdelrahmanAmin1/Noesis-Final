'use strict';

const registry = require('../utils/visual-registry');

describe('visual-registry', () => {
  it('normalizes known aliases to concrete visual types', () => {
    expect(registry.normalizeVisualType('class_diagram')).toBe('class_object');
    expect(registry.normalizeVisualType('linkedlist')).toBe('linked_list_operation');
    expect(registry.normalizeVisualType('bigo_chart')).toBe('big_o_growth');
    expect(registry.normalizeVisualType('hash_table')).toBe('hash_table_operation');
  });

  it('routes stack_queue aliases using scene context', () => {
    expect(registry.normalizeVisualType('stack_queue', { text: 'push pop LIFO top' })).toBe('stack_operation');
    expect(registry.normalizeVisualType('stack_queue', { text: 'enqueue dequeue FIFO front rear' })).toBe('queue_operation');
  });

  it('keeps concept maps explicit and rejects unknown visual types', () => {
    const concept = registry.resolveVisualType('learning_map');
    expect(concept.supported).toBe(true);
    expect(concept.canonical).toBe('concept_map');

    const unknown = registry.resolveVisualType('cinematic_glow_shapes');
    expect(unknown.supported).toBe(false);
    expect(unknown.reason).toBe('unsupported_visual_type');
  });

  it('lists the concrete CS render targets required by the video pipeline', () => {
    expect(registry.supportedVisualTypes()).toEqual(expect.arrayContaining([
      'encapsulation_boundary',
      'class_object',
      'inheritance_uml',
      'polymorphism_dispatch',
      'linked_list_operation',
      'stack_operation',
      'queue_operation',
      'hash_table_operation',
      'tree_visual',
      'big_o_growth',
      'code_walkthrough',
    ]));
    expect(registry.supportedVisualTypes().every(type => type === registry.normalizeVisualType(type))).toBe(true);
  });

  it('bridges canonical visual types to legacy canvas slide types at render edges', () => {
    expect(registry.legacyVisualTypeFor('encapsulation_boundary')).toBe('class_diagram');
    expect(registry.legacyVisualTypeFor('linked_list_operation')).toBe('linkedlist');
    expect(registry.legacyVisualTypeFor('stack_operation')).toBe('stack_queue');
    expect(registry.legacyVisualTypeFor('queue_operation')).toBe('stack_queue');
    expect(registry.legacyVisualTypeFor('big_o_growth')).toBe('bigo_chart');
    expect(registry.legacyVisualTypeFor('learning_objectives')).toBe('summary');
  });

  it('is exposed through renderer service for render-time checks', () => {
    const renderer = require('../services/renderer.service');
    expect(renderer.resolveVisualType('class_diagram').canonical).toBe('class_object');
    expect(renderer.supportedVisualTypes()).toContain('encapsulation_boundary');
  });
});
