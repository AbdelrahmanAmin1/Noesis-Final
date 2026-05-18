'use strict';

const TYPE_TO_VISUAL = {
  uml_class: 'class_diagram',
  inheritance_tree: 'class_diagram',
  linked_list: 'linkedlist',
  stack: 'stack_queue',
  queue: 'stack_queue',
  tree: 'tree',
  big_o_chart: 'bigo_chart',
  mindmap: 'mindmap',
  flow: 'flow',
};

function cleanText(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function normalizeEdges(edges) {
  return (Array.isArray(edges) ? edges : [])
    .filter(edge => Array.isArray(edge) && edge.length >= 2)
    .map(edge => [cleanText(edge[0], 80), cleanText(edge[1], 80), cleanText(edge[2] || '', 60)])
    .filter(edge => edge[0] && edge[1]);
}

function normalizeNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .map(node => {
      if (typeof node === 'string') return { id: cleanText(node, 80), label: cleanText(node, 80) };
      const id = cleanText(node && (node.id || node.label || node.name), 80);
      if (!id) return null;
      return {
        id,
        label: cleanText(node.label || node.name || id, 80),
        kind: cleanText(node.kind || node.type || '', 40),
        fields: (Array.isArray(node.fields) ? node.fields : []).map(v => cleanText(v, 80)).filter(Boolean),
        methods: (Array.isArray(node.methods) ? node.methods : []).map(v => cleanText(v, 80)).filter(Boolean),
        value: cleanText(node.value || '', 80),
      };
    })
    .filter(Boolean);
}

function normalizeDiagram(diagram, fallbackType = 'mindmap') {
  const src = diagram && typeof diagram === 'object' ? diagram : {};
  const type = TYPE_TO_VISUAL[src.type] ? src.type : fallbackType;
  return {
    type,
    nodes: normalizeNodes(src.nodes),
    edges: normalizeEdges(src.edges),
    operations: (Array.isArray(src.operations) ? src.operations : []).map(v => cleanText(v, 120)).filter(Boolean),
    caption: cleanText(src.caption || '', 180),
  };
}

function diagramTypeToVisualType(type) {
  return TYPE_TO_VISUAL[type] || 'mindmap';
}

function toSlideVisual(diagram) {
  const normalized = normalizeDiagram(diagram);
  return {
    type: diagramTypeToVisualType(normalized.type),
    nodes: normalized.nodes.map(n => n.label || n.id),
    edges: normalized.edges.map(edge => [edge[0], edge[1]]),
  };
}

module.exports = {
  TYPE_TO_VISUAL,
  normalizeDiagram,
  diagramTypeToVisualType,
  toSlideVisual,
};
