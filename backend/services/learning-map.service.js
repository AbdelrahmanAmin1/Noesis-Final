'use strict';

const { getDb } = require('../config/db');
const domainDetection = require('./domain-detection.service');

function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------
// Hierarchical curriculum trees — encode real pedagogical parent-child structure
// ---------------------------------------------------------------------------
const TOPIC_TREE = {
  oop: {
    label: 'Object-Oriented Programming',
    children: [
      { label: 'Class & Object', children: [
        { label: 'Constructor', children: [] },
        { label: 'Instance vs Class', children: [] },
      ]},
      { label: 'Encapsulation', children: [
        { label: 'Private Fields', children: [] },
        { label: 'Getters & Setters', children: [] },
        { label: 'Access Modifiers', children: [] },
      ]},
      { label: 'Inheritance', children: [
        { label: 'extends Keyword', children: [] },
        { label: 'super()', children: [] },
        { label: 'Method Overriding', children: [] },
      ]},
      { label: 'Polymorphism', children: [
        { label: 'Overloading', children: [] },
        { label: 'Dynamic Dispatch', children: [] },
      ]},
      { label: 'Abstraction', children: [
        { label: 'Interfaces', children: [] },
        { label: 'Abstract Classes', children: [] },
      ]},
      { label: 'SOLID Principles', children: [] },
    ],
  },
  ds: {
    label: 'Data Structures',
    children: [
      { label: 'Arrays', children: [
        { label: 'Dynamic Arrays', children: [] },
        { label: 'Array Operations', children: [] },
      ]},
      { label: 'Linked List', children: [
        { label: 'Singly Linked', children: [] },
        { label: 'Doubly Linked', children: [] },
      ]},
      { label: 'Stack', children: [
        { label: 'Push & Pop', children: [] },
        { label: 'Stack Applications', children: [] },
      ]},
      { label: 'Queue', children: [
        { label: 'Enqueue & Dequeue', children: [] },
        { label: 'Priority Queue', children: [] },
      ]},
      { label: 'Binary Search Tree', children: [
        { label: 'BST Insertion', children: [] },
        { label: 'BST Traversal', children: [] },
      ]},
      { label: 'Hash Table', children: [
        { label: 'Hash Function', children: [] },
        { label: 'Collision Handling', children: [] },
      ]},
      { label: 'Graph', children: [] },
      { label: 'Big-O Complexity', children: [] },
    ],
  },
  algorithms: {
    label: 'Algorithms',
    children: [
      { label: 'Big-O', children: [
        { label: 'Time Complexity', children: [] },
        { label: 'Space Complexity', children: [] },
      ]},
      { label: 'Searching', children: [
        { label: 'Linear Search', children: [] },
        { label: 'Binary Search', children: [] },
      ]},
      { label: 'Sorting', children: [
        { label: 'Bubble Sort', children: [] },
        { label: 'Merge Sort', children: [] },
        { label: 'Quick Sort', children: [] },
      ]},
      { label: 'Recursion', children: [
        { label: 'Base Case & Stack', children: [] },
        { label: 'Recursive Patterns', children: [] },
      ]},
      { label: 'Tree Traversal', children: [
        { label: 'BFS', children: [] },
        { label: 'DFS', children: [] },
      ]},
      { label: 'Graph Traversal', children: [] },
    ],
  },
};

// Backward-compatible flat PATHS derived from TOPIC_TREE
const PATHS = {
  oop: TOPIC_TREE.oop.children.map(c => c.label),
  ds: TOPIC_TREE.ds.children.map(c => c.label),
  algorithms: TOPIC_TREE.algorithms.children.map(c => c.label),
};

const MATERIAL_ALIASES = {
  'class & object': ['class', 'object', 'blueprint', 'instance', 'state', 'behavior'],
  'constructor': ['constructor', 'new object', 'initialization', 'initialize'],
  'instance vs class': ['instance', 'class variable', 'instance variable', 'object instance'],
  'encapsulation': ['encapsulation', 'encapsulate', 'data hiding', 'hide state', 'controlled access'],
  'private fields': ['private field', 'private fields', 'private variable', 'private data', 'hidden state'],
  'getters & setters': ['getter', 'getters', 'setter', 'setters', 'accessor', 'mutator', 'public method', 'public methods'],
  'access modifiers': ['access modifier', 'public', 'private', 'protected', 'package private'],
  'inheritance': ['inheritance', 'inherits', 'subclass', 'superclass', 'parent class', 'child class'],
  'extends keyword': ['extends', 'extends keyword'],
  'super()': ['super()', 'super constructor', 'super keyword'],
  'method overriding': ['override', 'overriding', 'method overriding'],
  'polymorphism': ['polymorphism', 'polymorphic', 'runtime type', 'same interface'],
  'overloading': ['overload', 'overloading', 'method overloading'],
  'dynamic dispatch': ['dynamic dispatch', 'runtime dispatch', 'late binding'],
  'abstraction': ['abstraction', 'abstract', 'hide implementation'],
  'interfaces': ['interface', 'interfaces', 'implements'],
  'abstract classes': ['abstract class', 'abstract classes'],
  'solid principles': ['solid', 'single responsibility', 'open closed', 'liskov', 'interface segregation', 'dependency inversion'],
  'arrays': ['array', 'arrays', 'index', 'contiguous'],
  'dynamic arrays': ['dynamic array', 'arraylist', 'resize array', 'resizing'],
  'array operations': ['array operation', 'insert at index', 'delete at index', 'random access'],
  'linked list': ['linked list', 'linkedlist', 'node pointer', 'next pointer'],
  'singly linked': ['singly linked', 'next pointer'],
  'doubly linked': ['doubly linked', 'prev pointer', 'previous pointer'],
  'stack': ['stack', 'lifo', 'push', 'pop', 'top'],
  'push & pop': ['push', 'pop', 'peek', 'top of stack'],
  'stack applications': ['call stack', 'undo stack', 'balanced parentheses'],
  'queue': ['queue', 'fifo', 'enqueue', 'dequeue', 'front', 'rear'],
  'enqueue & dequeue': ['enqueue', 'dequeue', 'front', 'rear'],
  'priority queue': ['priority queue', 'heap priority'],
  'binary search tree': ['binary search tree', 'bst', 'root', 'left child', 'right child'],
  'bst insertion': ['bst insertion', 'insert into bst', 'tree insert'],
  'bst traversal': ['bst traversal', 'inorder', 'preorder', 'postorder'],
  'hash table': ['hash table', 'hashtable', 'hash map', 'hashmap', 'bucket', 'collision'],
  'hash function': ['hash function', 'hash code', 'hash index'],
  'collision handling': ['collision', 'separate chaining', 'linear probing', 'open addressing'],
  'graph': ['graph', 'vertex', 'vertices', 'edge', 'adjacency'],
  'big-o complexity': ['big-o', 'big o', 'time complexity', 'space complexity', 'o(n)', 'o(1)', 'o(n^2)'],
  'big-o': ['big-o', 'big o', 'asymptotic', 'complexity', 'o(n)', 'o(1)', 'o(n^2)'],
  'time complexity': ['time complexity', 'runtime complexity', 'running time'],
  'space complexity': ['space complexity', 'memory complexity'],
  'searching': ['searching', 'search algorithm', 'find element'],
  'linear search': ['linear search', 'sequential search'],
  'binary search': ['binary search', 'half interval', 'sorted array search'],
  'sorting': ['sorting', 'sort algorithm', 'ordering elements'],
  'bubble sort': ['bubble sort'],
  'merge sort': ['merge sort'],
  'quick sort': ['quick sort', 'quicksort'],
  'recursion': ['recursion', 'recursive', 'base case', 'call stack'],
  'base case & stack': ['base case', 'recursive stack', 'call stack'],
  'recursive patterns': ['recursive pattern', 'divide and conquer recursion'],
  'tree traversal': ['tree traversal', 'traverse tree'],
  'bfs': ['bfs', 'breadth first search', 'breadth-first search'],
  'dfs': ['dfs', 'depth first search', 'depth-first search'],
  'graph traversal': ['graph traversal', 'bfs', 'dfs'],
};

function normalizeTopic(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toId(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9#+().]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasesFor(label) {
  const lower = normalizeSearchText(label);
  const explicit = MATERIAL_ALIASES[lower] || MATERIAL_ALIASES[String(label || '').toLowerCase()] || [];
  return [...new Set([label, lower, ...explicit].map(normalizeSearchText).filter(Boolean))];
}

function textHasPhrase(text, phrase) {
  const haystack = ` ${normalizeSearchText(text)} `;
  const needle = normalizeSearchText(phrase);
  if (!needle) return false;
  if (needle.length <= 3) return haystack.includes(` ${needle} `);
  return haystack.includes(` ${needle} `) || haystack.includes(needle);
}

function subjectKey(subject) {
  const s = String(subject || '').toLowerCase();
  if (/data.?struct|ds\b/.test(s)) return 'ds';
  if (/algorithm/.test(s)) return 'algorithms';
  if (/oop|object|java/.test(s)) return 'oop';
  return null;
}

function subjectPath(subject) {
  const key = subjectKey(subject);
  if (key) return PATHS[key];
  return [...PATHS.oop.slice(0, 5), ...PATHS.ds.slice(0, 6)];
}

function pathForKeyOrSubject(key, subject) {
  if (key && PATHS[key]) return PATHS[key];
  return subjectPath(subject);
}

function statusFor(topic, conceptMap) {
  const row = conceptMap.get(topic.toLowerCase());
  const mastery = row ? Number(row.mastery_pct || 0) : 0;
  if (mastery >= 80) return 'mastered';
  if (mastery >= 45) return 'in_progress';
  if (row) return 'weak';
  return 'not_started';
}

function typeFor(topic, index, weakSet) {
  if (weakSet.has(topic.toLowerCase())) return 'weak';
  if (index === 0) return 'prerequisite';
  if (index <= 4) return 'core';
  return 'recommended';
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function cloneTree(node) {
  return {
    label: node.label,
    children: (node.children || []).map(c => cloneTree(c)),
  };
}

function annotateTree(node, depth, flatIndex, conceptMap, weakSet, wrongMap) {
  const key = node.label.toLowerCase();
  const row = conceptMap.get(key);
  const mastery = row ? Number(row.mastery_pct || 0) : 0;
  const status = statusFor(node.label, conceptMap);
  const misses = wrongMap.get(key);

  node.id = toId(node.label);
  node.depth = depth;
  node.status = status;
  node.mastery = mastery;
  node.type = weakSet.has(key) ? 'weak' : (depth === 0 ? 'root' : (depth === 1 ? 'core' : 'detail'));
  node.reason = misses
    ? `You missed ${misses} question${misses === 1 ? '' : 's'} about ${node.label}.`
    : (status === 'mastered' ? 'You are currently strong here.' : 'Recommended by the course path.');

  let idx = flatIndex;
  for (const child of node.children) {
    idx = annotateTree(child, depth + 1, idx + 1, conceptMap, weakSet, wrongMap);
  }
  return idx;
}

function flattenToNodes(node, result, flatIndex, weakSet) {
  const entry = {
    id: node.id,
    label: node.label,
    type: typeFor(node.label, flatIndex, weakSet),
    status: node.status,
    mastery: node.mastery,
    reason: node.reason,
    grounded: !!node.grounded,
    sourceEvidence: node.sourceEvidence || [],
    children: [],
  };
  result.push(entry);
  let idx = flatIndex;
  for (const child of node.children) {
    idx = flattenToNodes(child, result, idx + 1, weakSet);
  }
  return idx;
}

function findBestBranch(tree, topicLabel) {
  const lower = topicLabel.toLowerCase();
  const words = lower.split(/\s+/);
  let bestChild = null;
  let bestScore = 0;
  for (const branch of tree.children) {
    const bWords = branch.label.toLowerCase().split(/\s+/);
    let score = 0;
    for (const w of words) {
      if (bWords.some(bw => bw.includes(w) || w.includes(bw))) score++;
    }
    for (const leaf of branch.children) {
      const lWords = leaf.label.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (lWords.some(lw => lw.includes(w) || w.includes(lw))) score += 0.5;
      }
    }
    if (score > bestScore) { bestScore = score; bestChild = branch; }
  }
  return bestChild;
}

function treeContains(node, label) {
  const lower = label.toLowerCase();
  if (node.label.toLowerCase() === lower) return true;
  return node.children.some(c => treeContains(c, lower));
}

function collectTreeNodes(node, out = []) {
  out.push(node);
  for (const child of node.children || []) collectTreeNodes(child, out);
  return out;
}

function getMaterialChunks(db, userId, materialId) {
  if (!materialId) return [];
  const owned = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!owned) return [];
  return db.prepare(`
    SELECT id, idx, text, chapter_title, heading, slide_number, slide_title, section_title, keywords_json
    FROM chunks
    WHERE material_id=?
    ORDER BY idx
  `).all(materialId);
}

function parseKeywords(row) {
  try {
    const parsed = JSON.parse(row.keywords_json || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).join(' ') : '';
  } catch (_) {
    return '';
  }
}

function matchNodeToMaterial(node, chunks) {
  const aliases = aliasesFor(node.label);
  const matches = [];
  for (const chunk of chunks) {
    const searchable = [
      chunk.text,
      chunk.chapter_title,
      chunk.heading,
      chunk.slide_title,
      chunk.section_title,
      parseKeywords(chunk),
    ].filter(Boolean).join(' ');
    const alias = aliases.find(a => textHasPhrase(searchable, a));
    if (alias) {
      matches.push({
        chunkId: chunk.id,
        chunkIndex: chunk.idx,
        label: node.label,
        matched: alias,
        heading: chunk.heading || chunk.slide_title || chunk.section_title || chunk.chapter_title || '',
        slideNumber: chunk.slide_number || null,
      });
      if (matches.length >= 2) break;
    }
  }
  return matches;
}

function annotateMaterialGrounding(tree, chunks) {
  const allNodes = collectTreeNodes(tree, []);
  const groundedIds = new Set();
  const groundedConcepts = [];
  for (const node of allNodes) {
    const matches = matchNodeToMaterial(node, chunks);
    node.grounded = matches.length > 0;
    node.sourceEvidence = matches;
    if (matches.length) {
      groundedIds.add(toId(node.label));
      groundedConcepts.push(node.label);
    }
  }
  function bubble(node) {
    const childGrounded = (node.children || []).map(bubble).some(Boolean);
    if (childGrounded && !node.grounded) node.grounded = true;
    return !!node.grounded;
  }
  bubble(tree);
  const groundedBranches = (tree.children || []).filter(child => child.grounded);
  return {
    chunkCount: chunks.length,
    groundedConcepts: [...new Set(groundedConcepts)],
    groundedBranchCount: groundedBranches.length,
    groundedBranches: groundedBranches.map(b => b.label),
    specificEnough: chunks.length > 0 && groundedBranches.length > 0 && groundedBranches.length <= 2 && groundedIds.size >= 2,
  };
}

function pruneUngroundedBranches(tree) {
  tree.children = (tree.children || []).filter(child => child.grounded);
  for (const branch of tree.children) {
    branch.children = (branch.children || []).filter(child => child.grounded);
  }
  return tree;
}

function scoreTreeAgainstText(tree, text) {
  const nodes = collectTreeNodes(tree, []).filter(n => n.label !== tree.label);
  let score = 0;
  const matched = new Set();
  for (const node of nodes) {
    for (const alias of aliasesFor(node.label)) {
      if (matched.has(alias)) continue;
      if (textHasPhrase(text, alias)) {
        matched.add(alias);
        score += node.children && node.children.length ? 2 : 1;
        break;
      }
    }
  }
  return score;
}

function inferSubjectKeyFromMaterial(material, chunks) {
  if (!material || !chunks.length) return null;
  const sampleText = [
    material.title,
    ...chunks.slice(0, 12).map(c => [
      c.text,
      c.chapter_title,
      c.heading,
      c.slide_title,
      c.section_title,
      parseKeywords(c),
    ].filter(Boolean).join(' ')),
  ].join(' ');
  const scored = Object.entries(TOPIC_TREE)
    .map(([key, tree]) => ({ key, score: scoreTreeAgainstText(tree, sampleText) }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 2) return null;
  if (scored[1] && scored[0].score === scored[1].score) return null;
  return scored[0].key;
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function generalTreeFromMaterial(material, chunks) {
  const seen = new Set();
  const children = [];
  const add = (label) => {
    const clean = titleCase(label);
    if (!clean || clean.length < 3) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    children.push({ label: clean.slice(0, 80), children: [] });
  };
  for (const chunk of chunks || []) {
    add(chunk.chapter_title || chunk.slide_title || chunk.section_title || chunk.heading);
    if (children.length >= 8) break;
  }
  if (children.length < 4) {
    for (const chunk of chunks || []) {
      const keywords = parseKeywords(chunk).split(/\s+/).filter(w => w.length > 4).slice(0, 4);
      keywords.forEach(add);
      if (children.length >= 8) break;
    }
  }
  if (!children.length) {
    add(material && material.title || 'Uploaded Material');
    add('Core Ideas');
    add('Examples');
    add('Practice Review');
  }
  return {
    label: material && material.title || 'Learning Path',
    children: children.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function buildLearningMap(userId, opts = {}) {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  const concepts = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? ORDER BY mastery_pct ASC, name ASC').all(userId);
  const wrong = db.prepare(`
    SELECT qq.concept, COUNT(*) AS misses
    FROM quiz_answers qa
    JOIN quiz_questions qq ON qq.id=qa.question_id
    JOIN quiz_attempts at ON at.id=qa.attempt_id
    WHERE at.user_id=? AND qa.is_correct=0 AND COALESCE(qq.concept, '') <> ''
    GROUP BY qq.concept
    ORDER BY misses DESC, qq.concept ASC
    LIMIT 8
  `).all(userId);
  const material = opts.materialId
    ? db.prepare('SELECT title FROM materials WHERE id=? AND user_id=?').get(opts.materialId, userId)
    : null;
  const materialChunks = getMaterialChunks(db, userId, opts.materialId);

  const conceptMap = new Map(concepts.map(c => [String(c.name || '').toLowerCase(), c]));
  const weakSet = new Set([
    ...concepts.filter(c => Number(c.mastery_pct || 0) < 45).map(c => String(c.name || '').toLowerCase()),
    ...wrong.map(w => String(w.concept || '').toLowerCase()),
  ]);
  const wrongMap = new Map(wrong.map(w => [String(w.concept || '').toLowerCase(), w.misses]));

  // Build hierarchical tree
  const domainInfo = opts.materialId
    ? domainDetection.detectMaterialDomain(userId, opts.materialId, { hint: opts.rootTopic || (material && material.title) })
    : null;
  const useCuratedCs = opts.materialId ? domainDetection.shouldUseCuratedCs(domainInfo) : true;
  const key = opts.materialId
    ? (useCuratedCs ? (inferSubjectKeyFromMaterial(material, materialChunks) || subjectKey(prefs.subject)) : null)
    : subjectKey(prefs.subject);
  let sourceTree;
  if (opts.materialId && !useCuratedCs) {
    sourceTree = generalTreeFromMaterial(material, materialChunks);
  } else if (key && TOPIC_TREE[key]) {
    sourceTree = cloneTree(TOPIC_TREE[key]);
  } else {
    // Mixed: combine OOP + DS branches under a generic root
    sourceTree = {
      label: 'Learning Path',
      children: [
        ...TOPIC_TREE.oop.children.slice(0, 4).map(c => cloneTree(c)),
        ...TOPIC_TREE.ds.children.slice(0, 4).map(c => cloneTree(c)),
      ],
    };
  }

  let materialGrounding = annotateMaterialGrounding(sourceTree, materialChunks);
  if (materialGrounding.specificEnough) {
    pruneUngroundedBranches(sourceTree);
  }

  // Attach orphan weak topics (from quiz misses) that aren't already in the tree
  const extraWeak = wrong.map(w => normalizeTopic(w.concept)).filter(Boolean);
  for (const topic of extraWeak) {
    if (treeContains(sourceTree, topic)) continue;
    const evidence = materialChunks.length ? matchNodeToMaterial({ label: topic, children: [] }, materialChunks) : [];
    if (materialGrounding.specificEnough && !evidence.length) continue;
    const branch = findBestBranch(sourceTree, topic);
    const newLeaf = { label: topic, children: [], grounded: evidence.length > 0, sourceEvidence: evidence };
    if (evidence.length) {
      materialGrounding.groundedConcepts = [...new Set([...materialGrounding.groundedConcepts, topic])];
      materialGrounding.groundedBranches = [...new Set([...materialGrounding.groundedBranches, branch ? branch.label : topic])];
    }
    if (branch) {
      branch.children.push(newLeaf);
    } else {
      sourceTree.children.push(newLeaf);
    }
  }

  // Annotate tree with user mastery/status data
  annotateTree(sourceTree, 0, 0, conceptMap, weakSet, wrongMap);

  // Flatten for backward compat
  const nodes = [];
  flattenToNodes(sourceTree, nodes, 0, weakSet);
  const flatTopics = nodes.map(n => n.label);

  // Determine start point and recommended path (same logic as before)
  const usingGeneralMaterialTree = opts.materialId && !useCuratedCs;
  const basePath = usingGeneralMaterialTree && sourceTree.children.length
    ? sourceTree.children.map(c => c.label)
    : materialGrounding.specificEnough && sourceTree.children.length
    ? sourceTree.children.map(c => c.label)
    : pathForKeyOrSubject(key, prefs.subject);
  const allTopics = [...new Set([...basePath, ...extraWeak])].slice(0, 14);
  const visibleTopicSet = new Set(flatTopics.map(t => t.toLowerCase()));
  const visibleTopics = allTopics.filter(t => visibleTopicSet.has(t.toLowerCase()));
  const pathTopics = visibleTopics.length ? visibleTopics : flatTopics.filter(t => t !== sourceTree.label);
  const weakFirst = pathTopics.find(t => weakSet.has(t.toLowerCase()));
  const startHere = weakFirst || pathTopics.find(t => statusFor(t, conceptMap) !== 'mastered') || pathTopics[0] || 'Upload material';
  const remainingPath = pathTopics.filter(t => statusFor(t, conceptMap) !== 'mastered' && t !== startHere);

  const map = {
    rootTopic: opts.rootTopic || (material && material.title) || prefs.subject || sourceTree.label,
    startHere,
    tree: sourceTree,
    nodes: nodes.slice(0, 14),
    recommendedPath: [startHere, ...remainingPath].filter(Boolean).slice(0, 7),
    materialGrounding: {
      materialId: opts.materialId || null,
      domain: domainInfo,
      used: materialChunks.length > 0,
      chunkCount: materialGrounding.chunkCount,
      groundedConcepts: materialGrounding.groundedConcepts.slice(0, 16),
      groundedBranches: materialGrounding.groundedBranches,
      specificEnough: materialGrounding.specificEnough,
      prunedUngroundedBranches: materialGrounding.specificEnough,
    },
    generatedAt: nowIso(),
  };

  if (opts.persist) {
    const existing = opts.materialId
      ? db.prepare('SELECT id FROM learning_maps WHERE user_id=? AND material_id=? ORDER BY id DESC LIMIT 1').get(userId, opts.materialId)
      : null;
    if (existing) {
      db.prepare('UPDATE learning_maps SET root_topic=?, map_json=?, updated_at=? WHERE id=?')
        .run(map.rootTopic, JSON.stringify(map), nowIso(), existing.id);
      return { id: existing.id, ...map };
    }
    const r = db.prepare('INSERT INTO learning_maps (user_id, material_id, root_topic, map_json, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(userId, opts.materialId || null, map.rootTopic, JSON.stringify(map), nowIso(), nowIso());
    return { id: r.lastInsertRowid, ...map };
  }
  return map;
}

module.exports = { buildLearningMap };
