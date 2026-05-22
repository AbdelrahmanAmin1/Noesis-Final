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
    type: 'hash_table',
    nodes: ['key "cat"', 'hash(key)', 'index = hash mod m', 'bucket 2', '(cat, 41)', 'collision chain'],
    edges: [['key "cat"', 'hash(key)'], ['hash(key)', 'index = hash mod m'], ['index = hash mod m', 'bucket 2'], ['bucket 2', '(cat, 41)']],
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
  'doubly linked list': {
    type: 'linkedlist',
    nodes: ['NULL', 'Node A', 'Node B', 'Node C', 'NULL'],
    edges: [['NULL', 'Node A'], ['Node A', 'Node B'], ['Node B', 'Node C'], ['Node C', 'NULL']],
  },
  'circular queue': {
    type: 'flow',
    nodes: ['Front', 'Slot 0', 'Slot 1', 'Slot 2', 'Slot 3', 'Rear'],
    edges: [['Front', 'Slot 0'], ['Slot 0', 'Slot 1'], ['Slot 1', 'Slot 2'], ['Slot 2', 'Slot 3'], ['Slot 3', 'Front']],
  },
  'priority queue': {
    type: 'tree',
    nodes: ['1 (highest)', '3', '5', '7', '9', '11', '13'],
    edges: [['1 (highest)', '3'], ['1 (highest)', '5'], ['3', '7'], ['3', '9'], ['5', '11'], ['5', '13']],
  },
  'factory pattern': {
    type: 'class_diagram',
    nodes: ['ShapeFactory', '<<interface>> Shape', 'Circle', 'Rectangle', 'createShape()'],
    edges: [['ShapeFactory', '<<interface>> Shape'], ['<<interface>> Shape', 'Circle'], ['<<interface>> Shape', 'Rectangle'], ['ShapeFactory', 'createShape()']],
  },
  'observer pattern': {
    type: 'class_diagram',
    nodes: ['Subject', 'Observer (interface)', 'ConcreteObserver A', 'ConcreteObserver B', 'notify()'],
    edges: [['Subject', 'Observer (interface)'], ['Observer (interface)', 'ConcreteObserver A'], ['Observer (interface)', 'ConcreteObserver B'], ['Subject', 'notify()']],
  },
  'decorator pattern': {
    type: 'class_diagram',
    nodes: ['Component (interface)', 'ConcreteComponent', 'Decorator (abstract)', 'BorderDecorator', 'ScrollDecorator'],
    edges: [['Component (interface)', 'ConcreteComponent'], ['Component (interface)', 'Decorator (abstract)'], ['Decorator (abstract)', 'BorderDecorator'], ['Decorator (abstract)', 'ScrollDecorator']],
  },
  'dynamic programming': {
    type: 'flow',
    nodes: ['Original problem', 'Subproblem 1', 'Subproblem 2', 'Memo table', 'Optimal solution'],
    edges: [['Original problem', 'Subproblem 1'], ['Original problem', 'Subproblem 2'], ['Subproblem 1', 'Memo table'], ['Subproblem 2', 'Memo table'], ['Memo table', 'Optimal solution']],
  },
  'greedy algorithm': {
    type: 'flow',
    nodes: ['Problem', 'Local best choice', 'Reduce problem', 'Repeat', 'Global solution'],
    edges: [['Problem', 'Local best choice'], ['Local best choice', 'Reduce problem'], ['Reduce problem', 'Repeat'], ['Repeat', 'Global solution']],
  },
};

const TOPIC_VISUAL_NODES = {
  'encapsulation': {
    definition: {
      nodes: ['Encapsulation', 'Private data', 'Public methods', 'Controlled access', 'Validation', 'Bad public fields', 'Safe object state'],
      edges: [['Encapsulation', 'Private data'], ['Encapsulation', 'Public methods'], ['Public methods', 'Controlled access'], ['Controlled access', 'Validation'], ['Bad public fields', 'Safe object state']],
    },
    diagram: {
      nodes: ['BankAccount', '- balance: double', '+ deposit()', '+ withdraw()', '+ getBalance()', 'Validation guard'],
      edges: [['BankAccount', '- balance: double'], ['BankAccount', '+ deposit()'], ['BankAccount', '+ withdraw()'], ['BankAccount', '+ getBalance()'], ['+ deposit()', 'Validation guard']],
    },
  },
  'inheritance': {
    definition: {
      nodes: ['Inheritance', 'Superclass (parent)', 'Subclass (child)', 'extends keyword', 'Method reuse', 'Overriding', 'IS-A relationship'],
      edges: [['Inheritance', 'Superclass (parent)'], ['Superclass (parent)', 'Subclass (child)'], ['Subclass (child)', 'extends keyword'], ['Subclass (child)', 'Overriding'], ['Inheritance', 'IS-A relationship']],
    },
  },
  'polymorphism': {
    definition: {
      nodes: ['Polymorphism', 'Same method call', 'Different behavior', 'Dynamic dispatch', 'Runtime binding', 'Superclass reference', 'Subclass object'],
      edges: [['Polymorphism', 'Same method call'], ['Same method call', 'Different behavior'], ['Different behavior', 'Dynamic dispatch'], ['Dynamic dispatch', 'Runtime binding']],
    },
  },
  'abstraction': {
    definition: {
      nodes: ['Abstraction', 'Hide complexity', 'Public interface', 'Implementation hidden', 'Contract', 'Client code', 'Simplification'],
      edges: [['Abstraction', 'Public interface'], ['Public interface', 'Contract'], ['Abstraction', 'Hide complexity'], ['Hide complexity', 'Implementation hidden']],
    },
  },
  'linked list': {
    definition: {
      nodes: ['Linked List', 'Node', 'Data field', 'Next pointer', 'Head reference', 'Traversal', 'Dynamic size'],
      edges: [['Linked List', 'Head reference'], ['Head reference', 'Node'], ['Node', 'Data field'], ['Node', 'Next pointer'], ['Next pointer', 'Traversal']],
    },
  },
  'stack': {
    definition: {
      nodes: ['Stack', 'LIFO order', 'push()', 'pop()', 'peek()', 'Top pointer', 'Underflow check'],
      edges: [['Stack', 'LIFO order'], ['Stack', 'push()'], ['Stack', 'pop()'], ['Stack', 'peek()'], ['push()', 'Top pointer']],
    },
  },
  'queue': {
    definition: {
      nodes: ['Queue', 'FIFO order', 'enqueue()', 'dequeue()', 'Front pointer', 'Rear pointer', 'Wraparound'],
      edges: [['Queue', 'FIFO order'], ['Queue', 'enqueue()'], ['Queue', 'dequeue()'], ['enqueue()', 'Rear pointer'], ['dequeue()', 'Front pointer']],
    },
  },
  'hash table': {
    definition: {
      nodes: ['Hash Table', 'Hash function', 'Bucket array', 'Key-value pair', 'Collision handling', 'Load factor', 'O(1) average lookup'],
      edges: [['Hash Table', 'Hash function'], ['Hash function', 'Bucket array'], ['Bucket array', 'Key-value pair'], ['Bucket array', 'Collision handling'], ['Hash Table', 'Load factor']],
    },
  },
  'binary search tree': {
    definition: {
      nodes: ['BST', 'Root node', 'Left < parent', 'Right > parent', 'In-order traversal', 'Search O(log n)', 'Balanced vs skewed'],
      edges: [['BST', 'Root node'], ['Root node', 'Left < parent'], ['Root node', 'Right > parent'], ['BST', 'In-order traversal'], ['BST', 'Search O(log n)']],
    },
  },
  'recursion': {
    definition: {
      nodes: ['Recursion', 'Base case', 'Recursive case', 'Call stack', 'Subproblem', 'Stack overflow risk', 'Unwinding'],
      edges: [['Recursion', 'Base case'], ['Recursion', 'Recursive case'], ['Recursive case', 'Call stack'], ['Recursive case', 'Subproblem']],
    },
  },
};

function findTopicNodes(topic, sceneType) {
  const key = String(topic || '').toLowerCase().trim();
  const type = sceneType || 'definition';
  for (const [k, v] of Object.entries(TOPIC_VISUAL_NODES)) {
    if (key.includes(k) || k.includes(key)) {
      return v[type] || v.definition || null;
    }
  }
  return null;
}

function findTemplate(concept) {
  const key = String(concept || '').toLowerCase().trim();
  if (TEMPLATES[key]) return TEMPLATES[key];
  for (const [k, v] of Object.entries(TEMPLATES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

module.exports = { TEMPLATES, TOPIC_VISUAL_NODES, findTemplate, findTopicNodes };
