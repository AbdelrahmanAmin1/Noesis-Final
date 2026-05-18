'use strict';

const SYNONYMS = {
  'polymorphism': ['overriding', 'dynamic dispatch', 'virtual methods', 'method overloading', 'late binding', 'runtime polymorphism'],
  'encapsulation': ['information hiding', 'access modifiers', 'private fields', 'getters setters', 'data hiding'],
  'inheritance': ['extends', 'subclass', 'superclass', 'parent class', 'child class', 'is-a relationship', 'base class', 'derived class'],
  'abstraction': ['abstract class', 'interface', 'abstract method', 'contract', 'api design'],
  'composition': ['has-a relationship', 'object composition', 'aggregation', 'delegation', 'favor composition over inheritance'],
  'solid': ['single responsibility', 'open closed', 'liskov substitution', 'interface segregation', 'dependency inversion'],
  'interface': ['implements', 'contract', 'abstract type', 'multiple inheritance', 'interface segregation'],
  'abstract class': ['abstract method', 'partial implementation', 'template method', 'cannot instantiate'],
  'overloading': ['method overloading', 'compile-time polymorphism', 'same name different parameters', 'static polymorphism'],
  'overriding': ['method overriding', 'runtime polymorphism', 'virtual method', 'dynamic dispatch', 'super call'],
  'constructor': ['initialization', 'new keyword', 'default constructor', 'parameterized constructor', 'constructor overloading'],
  'class': ['blueprint', 'template', 'type definition', 'fields and methods', 'instance'],
  'object': ['instance', 'instantiation', 'new keyword', 'reference', 'heap allocation'],

  'array': ['indexing', 'contiguous memory', 'random access', 'fixed size', 'dynamic array', 'arraylist', 'cache locality'],
  'linked list': ['singly linked', 'doubly linked', 'node pointer', 'head tail', 'next pointer', 'node chain'],
  'stack': ['lifo', 'last in first out', 'push pop', 'call stack', 'depth first'],
  'queue': ['fifo', 'first in first out', 'enqueue dequeue', 'breadth first', 'circular queue', 'priority queue'],
  'hash table': ['hash map', 'hashing', 'collision', 'chaining', 'open addressing', 'load factor', 'hash function'],
  'tree': ['root node', 'leaf node', 'parent child', 'subtree', 'height depth', 'traversal'],
  'binary tree': ['left child', 'right child', 'complete tree', 'full tree', 'inorder preorder postorder'],
  'binary search tree': ['bst', 'inorder traversal', 'tree insertion', 'tree deletion', 'sorted order', 'balanced tree'],
  'bst': ['binary search tree', 'inorder traversal', 'tree insertion', 'tree deletion'],
  'heap': ['min heap', 'max heap', 'priority queue', 'heapify', 'binary heap', 'heap sort', 'complete binary tree'],
  'graph': ['vertex', 'edge', 'adjacency list', 'adjacency matrix', 'directed', 'undirected', 'weighted', 'bfs', 'dfs'],
  'trie': ['prefix tree', 'autocomplete', 'string search', 'character nodes'],
  'sorting': ['bubble sort', 'insertion sort', 'merge sort', 'quick sort', 'selection sort', 'comparison sort', 'stable sort'],
  'searching': ['linear search', 'binary search', 'sequential scan', 'divide and conquer'],
  'recursion': ['base case', 'recursive case', 'call stack', 'stack overflow', 'divide and conquer', 'memoization'],
  'big-o': ['time complexity', 'space complexity', 'asymptotic analysis', 'upper bound', 'growth rate', 'worst case'],
  'big o': ['time complexity', 'space complexity', 'asymptotic analysis', 'upper bound', 'growth rate'],
  'complexity': ['big-o', 'time complexity', 'space complexity', 'asymptotic', 'best case', 'worst case', 'average case'],
  'generics': ['type parameter', 'generic type', 'bounded type', 'type erasure', 'wildcard', 'parameterized type', 'type safety'],
  'exception handling': ['try catch', 'throw', 'checked exception', 'unchecked exception', 'finally block', 'error propagation'],
  'design patterns': ['creational', 'structural', 'behavioral', 'factory', 'singleton', 'observer', 'strategy', 'decorator'],
  'factory pattern': ['factory method', 'abstract factory', 'creational pattern', 'object creation', 'decoupling instantiation'],
  'observer pattern': ['event listener', 'publish subscribe', 'callback', 'notification', 'behavioral pattern'],
  'decorator pattern': ['wrapper', 'structural pattern', 'dynamic behavior', 'composition over inheritance'],
  'dynamic programming': ['memoization', 'tabulation', 'overlapping subproblems', 'optimal substructure', 'dp table', 'bottom-up'],
  'greedy algorithm': ['greedy choice', 'local optimum', 'activity selection', 'huffman coding', 'knapsack'],
  'doubly linked list': ['prev pointer', 'next pointer', 'bidirectional traversal', 'double ended'],
  'circular queue': ['ring buffer', 'circular buffer', 'wrap around', 'modulo indexing'],
  'priority queue': ['min heap', 'max heap', 'priority scheduling', 'heapify', 'binary heap'],
  'balanced bst': ['avl tree', 'red-black tree', 'self-balancing', 'rotation', 'height-balanced'],
};

function expandQuery(query) {
  const lower = (query || '').toLowerCase().trim();
  if (!lower) return lower;

  const extra = [];
  for (const [concept, synonyms] of Object.entries(SYNONYMS)) {
    if (lower.includes(concept)) {
      for (const syn of synonyms) {
        if (!lower.includes(syn)) extra.push(syn);
      }
    }
  }

  if (extra.length === 0) return lower;
  return lower + ' ' + extra.slice(0, 8).join(' ');
}

module.exports = { SYNONYMS, expandQuery };
