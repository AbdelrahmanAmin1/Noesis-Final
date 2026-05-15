'use strict';

const TEMPLATES = {
  'inheritance': {
    type: 'class_diagram',
    nodes: ['Animal (parent)', 'Dog (child)', 'Cat (child)', 'Bird (child)'],
    edges: [['Animal (parent)', 'Dog (child)'], ['Animal (parent)', 'Cat (child)'], ['Animal (parent)', 'Bird (child)']],
  },
  'polymorphism': {
    type: 'class_diagram',
    nodes: ['Shape (base)', 'Circle', 'Rectangle', 'draw() overridden'],
    edges: [['Shape (base)', 'Circle'], ['Shape (base)', 'Rectangle'], ['Shape (base)', 'draw() overridden']],
  },
  'encapsulation': {
    type: 'mindmap',
    nodes: ['Encapsulation', 'Private fields', 'Public methods', 'Invariant protection', 'Getter/Setter'],
    edges: [['Encapsulation', 'Private fields'], ['Encapsulation', 'Public methods'], ['Encapsulation', 'Invariant protection'], ['Public methods', 'Getter/Setter']],
  },
  'abstraction': {
    type: 'mindmap',
    nodes: ['Abstraction', 'Hide complexity', 'Simple interface', 'Implementation detail', 'Client code'],
    edges: [['Abstraction', 'Hide complexity'], ['Abstraction', 'Simple interface'], ['Hide complexity', 'Implementation detail'], ['Simple interface', 'Client code']],
  },
  'composition': {
    type: 'class_diagram',
    nodes: ['Car (whole)', 'Engine (part)', 'Wheel (part)', 'GPS (part)'],
    edges: [['Car (whole)', 'Engine (part)'], ['Car (whole)', 'Wheel (part)'], ['Car (whole)', 'GPS (part)']],
  },
  'interface': {
    type: 'class_diagram',
    nodes: ['<<interface>> List', 'ArrayList', 'LinkedList', 'add() / remove()'],
    edges: [['<<interface>> List', 'ArrayList'], ['<<interface>> List', 'LinkedList'], ['<<interface>> List', 'add() / remove()']],
  },
  'solid': {
    type: 'mindmap',
    nodes: ['SOLID', 'Single Responsibility', 'Open/Closed', 'Liskov Substitution', 'Interface Segregation', 'Dependency Inversion'],
    edges: [['SOLID', 'Single Responsibility'], ['SOLID', 'Open/Closed'], ['SOLID', 'Liskov Substitution'], ['SOLID', 'Interface Segregation'], ['SOLID', 'Dependency Inversion']],
  },
  'overloading vs overriding': {
    type: 'comparison',
    nodes: ['Overloading', 'Overriding', 'Compile-time', 'Runtime'],
    edges: [['Overloading', 'Compile-time'], ['Overriding', 'Runtime']],
  },
  'stack': {
    type: 'stack_queue',
    nodes: ['push()', 'pop()', 'peek()', 'LIFO', 'Top'],
    edges: [['push()', 'Top'], ['pop()', 'Top']],
    orientation: 'vertical',
  },
  'queue': {
    type: 'stack_queue',
    nodes: ['enqueue()', 'dequeue()', 'front()', 'FIFO', 'Front', 'Rear'],
    edges: [['enqueue()', 'Rear'], ['dequeue()', 'Front']],
    orientation: 'horizontal',
  },
  'linked list': {
    type: 'linkedlist',
    nodes: ['Head', 'Node A', 'Node B', 'Node C', 'NULL'],
    edges: [['Head', 'Node A'], ['Node A', 'Node B'], ['Node B', 'Node C'], ['Node C', 'NULL']],
  },
  'array': {
    type: 'flow',
    nodes: ['Index 0', 'Index 1', 'Index 2', 'Index n-1'],
    edges: [['Index 0', 'Index 1'], ['Index 1', 'Index 2'], ['Index 2', 'Index n-1']],
  },
  'hash table': {
    type: 'flow',
    nodes: ['Key', 'Hash function', 'Bucket index', 'Value'],
    edges: [['Key', 'Hash function'], ['Hash function', 'Bucket index'], ['Bucket index', 'Value']],
  },
  'binary search tree': {
    type: 'tree',
    nodes: ['50', '30', '70', '20', '40', '60', '80'],
    edges: [['50', '30'], ['50', '70'], ['30', '20'], ['30', '40'], ['70', '60'], ['70', '80']],
  },
  'avl tree': {
    type: 'tree',
    nodes: ['30 (root)', '20', '40', '10', '25', '35', '50'],
    edges: [['30 (root)', '20'], ['30 (root)', '40'], ['20', '10'], ['20', '25'], ['40', '35'], ['40', '50']],
  },
  'heap': {
    type: 'tree',
    nodes: ['90 (max)', '80', '70', '50', '60', '40', '30'],
    edges: [['90 (max)', '80'], ['90 (max)', '70'], ['80', '50'], ['80', '60'], ['70', '40'], ['70', '30']],
  },
  'graph': {
    type: 'mindmap',
    nodes: ['Graph', 'Vertex', 'Edge', 'Directed', 'Undirected', 'Weighted'],
    edges: [['Graph', 'Vertex'], ['Graph', 'Edge'], ['Edge', 'Directed'], ['Edge', 'Undirected'], ['Edge', 'Weighted']],
  },
  'bfs': {
    type: 'flow',
    nodes: ['Start node', 'Visit neighbors', 'Enqueue unvisited', 'Dequeue next', 'All visited?'],
    edges: [['Start node', 'Visit neighbors'], ['Visit neighbors', 'Enqueue unvisited'], ['Enqueue unvisited', 'Dequeue next'], ['Dequeue next', 'All visited?']],
  },
  'dfs': {
    type: 'flow',
    nodes: ['Start node', 'Visit neighbor', 'Push to stack', 'Backtrack', 'All visited?'],
    edges: [['Start node', 'Visit neighbor'], ['Visit neighbor', 'Push to stack'], ['Push to stack', 'Backtrack'], ['Backtrack', 'All visited?']],
  },
  'trie': {
    type: 'tree',
    nodes: ['(root)', 'c', 'a', 'o', 'a', 'r', 'd', 't'],
    edges: [['(root)', 'c'], ['c', 'a'], ['a', 'r'], ['a', 't'], ['(root)', 'o'], ['c', 'o'], ['o', 'd']],
  },
  'recursion': {
    type: 'flow',
    nodes: ['Problem(n)', 'Base case?', 'Return result', 'Solve sub(n-1)', 'Combine'],
    edges: [['Problem(n)', 'Base case?'], ['Base case?', 'Return result'], ['Base case?', 'Solve sub(n-1)'], ['Solve sub(n-1)', 'Combine']],
  },
  'sorting': {
    type: 'comparison',
    nodes: ['O(n^2) sorts', 'O(n log n) sorts', 'Bubble/Selection/Insertion', 'Merge/Quick/Heap'],
    edges: [['O(n^2) sorts', 'Bubble/Selection/Insertion'], ['O(n log n) sorts', 'Merge/Quick/Heap']],
  },
  'big-o': {
    type: 'bigo_chart',
    nodes: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)', 'O(2^n)'],
    edges: [['O(1)', 'O(log n)'], ['O(log n)', 'O(n)'], ['O(n)', 'O(n log n)'], ['O(n log n)', 'O(n^2)'], ['O(n^2)', 'O(2^n)']],
  },
};

function findTemplate(concept) {
  const key = String(concept || '').toLowerCase().trim();
  if (TEMPLATES[key]) return TEMPLATES[key];
  for (const [k, v] of Object.entries(TEMPLATES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

module.exports = { TEMPLATES, findTemplate };
