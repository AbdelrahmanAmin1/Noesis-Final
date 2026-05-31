'use strict';

const slides = require('../services/slides.service');

const { inferVisualType } = slides._internals;

describe('slides.inferVisualType — canonical mapping and no meaningless concept maps', () => {
  it('maps canonical storyboard visual types to canvas drawers', () => {
    expect(inferVisualType({ visual_type: 'source_page_reference', title: 'Tree figure' })).toBe('source_reference');
    expect(inferVisualType({ visual_type: 'source_slide_reference', title: 'Slide 4 diagram' })).toBe('source_reference');
    expect(inferVisualType({ visual_type: 'no_visual', title: 'Source-led recap' })).toBe('none');
    expect(inferVisualType({ visual_type: 'code_walkthrough', title: 'Walkthrough' })).toBe('code');
    expect(inferVisualType({ visual_type: 'big_o_growth', title: 'Growth rates' })).toBe('bigo_chart');
    expect(inferVisualType({ visual_type: 'linked_list_operation', title: 'Insert node' })).toBe('linkedlist');
    expect(inferVisualType({ visual_type: 'hash_table_operation', title: 'Hashing' })).toBe('hash_table');
    expect(inferVisualType({ visual_type: 'tree_visual', title: 'BST' })).toBe('tree');
    expect(inferVisualType({ visual_type: 'class_object', title: 'Class vs object' })).toBe('class_diagram');
  });

  it('routes stack vs queue operations from scene context', () => {
    expect(inferVisualType({ visual_type: 'stack_operation', title: 'Push and pop', bullets: ['LIFO top'] })).toBe('stack_queue');
    expect(inferVisualType({ visual_type: 'queue_operation', title: 'Enqueue dequeue', bullets: ['FIFO front rear'] })).toBe('stack_queue');
  });

  it('preserves legacy slide visual types', () => {
    expect(inferVisualType({ visual_type: 'class_diagram' })).toBe('class_diagram');
    expect(inferVisualType({ visual_type: 'hash_table' })).toBe('hash_table');
    expect(inferVisualType({ visual_type: 'cards' })).toBe('cards');
    expect(inferVisualType({ visual_type: 'table' })).toBe('table');
    expect(inferVisualType({ visual_type: 'source_reference' })).toBe('source_reference');
  });

  it('never falls back to a meaningless mindmap for unknown/unsignalled scenes', () => {
    expect(inferVisualType({ title: 'Some heading', bullets: ['a takeaway'] })).toBe('none');
    expect(inferVisualType({ visual_type: 'cinematic_glow_shapes', title: 'Random' })).toBe('none');
  });

  it('downgrades a concept map whose nodes just restate the outline to a clean board', () => {
    const generic = {
      visual_type: 'mindmap',
      title: 'Pop operation in stack',
      bullets: ['Pop removes the top'],
      visual_nodes: ['Data Structure', 'Pop operation in stack', 'Data Structures', 'Definition'],
    };
    expect(inferVisualType(generic)).toBe('none');
  });

  it('keeps a concept map when its nodes name real, distinct sub-ideas', () => {
    const meaningful = {
      visual_type: 'mindmap',
      title: 'Stack overview',
      bullets: ['A stack is LIFO'],
      visual_nodes: ['LIFO ordering', 'push adds on top', 'pop removes top', 'used for call stacks'],
    };
    expect(inferVisualType(meaningful)).toBe('mindmap');
  });
});
