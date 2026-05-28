'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function appWithNotes() {
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/notes', require('../routes/note.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedMaterial(db, userId, title, sections) {
  const now = new Date().toISOString();
  const materialId = db.prepare(`
    INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(userId, title, 'pdf', `${title}.pdf`, 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;

  sections.forEach((section, idx) => {
    const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
      .run(materialId, idx, section.title, idx * 100, (idx + 1) * 100).lastInsertRowid;
    db.prepare(`
      INSERT INTO chunks (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      materialId,
      chapterId,
      idx,
      section.text,
      80,
      section.title,
      section.heading || section.title,
      0,
      JSON.stringify(section.keywords || [])
    );
  });

  return materialId;
}

function driftedLinkedListLessonJson() {
  return JSON.stringify({
    topic: 'Linked List',
    audienceLevel: 'beginner',
    lessonType: 'data_structure',
    sourceMaterial: { title: 'Uploaded Material', grounding: 'strong', selectedChunkIds: [1] },
    learningObjectives: [
      'Explain linked list head and next pointers.',
      'Trace linked list insertion and deletion.',
    ],
    prerequisites: ['references'],
    sections: [
      { type: 'hook', title: 'Why Linked Lists Matter', content: 'A linked list stores nodes in a chain from the head pointer to null.' },
      { type: 'definition', title: 'Definition', content: 'A linked list is a node chain where each node.next points to the following node.' },
      { type: 'deep_explanation', title: 'Traversal', content: 'Traversal starts at the head pointer and follows next references until null.' },
      {
        type: 'diagram',
        title: 'Linked List Diagram',
        content: 'The diagram shows head, data, next, and null.',
        diagram: { type: 'linked_list', nodes: ['HEAD', 'node', 'null'], edges: [['HEAD', 'node'], ['node', 'null']] },
      },
      { type: 'code_example', title: 'Node Code', content: 'A node stores data and next.', code: { language: 'java', content: 'class Node { int data; Node next; }', explanation: [{ lineRange: '1', text: 'Node next links to the next node.' }] } },
      { type: 'code_walkthrough', title: 'Insert', content: 'Insert by updating newNode.next and then head.' },
      { type: 'common_mistakes', title: 'Mistakes', cards: [{ title: 'Losing next', text: 'Do not overwrite next before saving the rest of the chain.' }] },
      { type: 'checkpoint', title: 'Check', content: 'What does head store?', quiz: [{ question: 'What does head store?', answer: 'The first node.' }] },
      { type: 'recap', title: 'Recap', content: 'Linked lists are pointer chains.' },
      { type: 'next_steps', title: 'Next Steps', content: 'Practice insertion and deletion.' },
    ],
    relatedTopics: ['Stacks'],
  });
}

function driftedTreesLessonJson() {
  return JSON.stringify({
    topic: 'Trees',
    audienceLevel: 'beginner',
    lessonType: 'data_structure',
    sourceMaterial: { title: 'Uploaded Material', grounding: 'strong', selectedChunkIds: [1] },
    learningObjectives: [
      'Explain root and leaf nodes.',
      'Trace tree traversal.',
    ],
    prerequisites: ['nodes'],
    sections: [
      { type: 'hook', title: 'Why Trees Matter', content: 'Trees organize nodes under a root with parent and child relationships.' },
      { type: 'definition', title: 'Definition', content: 'A tree has a root, children, leaves, height, and depth.' },
      { type: 'deep_explanation', title: 'Traversal', content: 'Preorder, inorder, and postorder visit tree nodes in different orders.' },
      {
        type: 'diagram',
        title: 'Tree Diagram',
        content: 'The diagram shows a root with child nodes and leaves.',
        diagram: { type: 'tree', nodes: ['root', 'left child', 'right child', 'leaf'], edges: [['root', 'left child'], ['root', 'right child'], ['left child', 'leaf']] },
      },
      { type: 'common_mistakes', title: 'Mistakes', cards: [{ title: 'Ignoring hierarchy', text: 'Do not treat every node as a linear chain.' }] },
      { type: 'checkpoint', title: 'Check', content: 'Which node has no parent?', quiz: [{ question: 'Which node has no parent?', answer: 'The root.' }] },
      { type: 'recap', title: 'Recap', content: 'Trees are hierarchical structures with root, children, and leaves.' },
      { type: 'next_steps', title: 'Next Steps', content: 'Practice traversal orders.' },
    ],
    relatedTopics: ['Binary Search Tree'],
  });
}

describe('note generation material-grounding repair', () => {
  let app;
  let db;
  let user;
  let token;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(ai, 'embed').mockRejectedValue(new Error('embedding skipped'));
    vi.spyOn(ai, 'assertModelsAvailable').mockResolvedValue(undefined);
    vi.spyOn(ai, 'generate').mockResolvedValue(driftedLinkedListLessonJson());
    const setup = appWithNotes();
    app = setup.app;
    db = setup.db;
    const created = await createTestUser(app, request);
    user = created.user;
    token = created.token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupTestDb();
  });

  it('repairs drifted Linked List AI notes into Trees notes for a Trees upload', async () => {
    const materialId = seedMaterial(db, user.id, '210-Trees', [
      {
        title: 'Tree ADT',
        text: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children. Height and depth describe node positions.',
        keywords: ['tree adt', 'root', 'children', 'leaf', 'height', 'depth'],
      },
      {
        title: 'Tree Traversals',
        text: 'Preorder, inorder, and postorder are traversal orders for trees. A binary tree uses left and right child references.',
        keywords: ['preorder', 'inorder', 'postorder', 'binary tree'],
      },
      {
        title: 'Binary Search Tree',
        text: 'A BST stores smaller keys in the left subtree and larger keys in the right subtree. Search, insert, and delete follow that rule.',
        keywords: ['bst', 'left subtree', 'right subtree', 'search', 'insert', 'delete'],
      },
    ]);

    const res = await request(app)
      .post('/api/notes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, sourceScope: 'material' });

    expect(res.status).toBe(200);
    expect(res.body.verifier_repaired).toBe(true);
    expect(res.body.topic_mode).toBe('material_wide');
    expect(res.body.body_md).toMatch(/tree adt|root node|preorder|binary search tree|left subtree/i);
    expect(res.body.body_md).not.toMatch(/head pointer|node\.next|null-terminated chain/i);

    const sourceMap = JSON.parse(res.body.source_map_json);
    expect(sourceMap.verifier.repaired).toBe(true);
    expect(sourceMap.verifier.repair_path).toMatch(/repair/);
  });

  it('uses broad material notes for an entire multi-topic upload instead of saving one-topic drift', async () => {
    const materialId = seedMaterial(db, user.id, 'Data Structures Survey', [
      {
        title: 'Arrays',
        text: 'Arrays store elements in contiguous indexed positions. Random access by index is the main strength of arrays.',
        keywords: ['array', 'index', 'random access'],
      },
      {
        title: 'Stacks',
        text: 'Stacks use LIFO order with push, pop, and peek operations at the top of the stack.',
        keywords: ['stack', 'lifo', 'push', 'pop'],
      },
      {
        title: 'Queues',
        text: 'Queues use FIFO order with enqueue at the rear and dequeue at the front.',
        keywords: ['queue', 'fifo', 'enqueue', 'dequeue'],
      },
      {
        title: 'Linked Lists',
        text: 'Linked lists store nodes connected by references and support traversal through links.',
        keywords: ['linked list', 'node', 'reference'],
      },
    ]);

    const res = await request(app)
      .post('/api/notes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, sourceScope: 'material' });

    expect(res.status).toBe(200);
    expect(res.body.topic_mode).toBe('material_wide');
    expect(res.body.body_md).toMatch(/arrays|random access/i);
    expect(res.body.body_md).toMatch(/stacks|lifo|push|pop/i);
    expect(res.body.body_md).toMatch(/queues|fifo|enqueue|dequeue/i);
    expect(res.body.body_md).toMatch(/linked lists|nodes|references/i);
    expect(res.body.body_md).not.toMatch(/only linked lists|head pointer to null/i);
  });

  it('repairs noisy extracted Linked List material instead of failing on source-heading loops', async () => {
    ai.generate.mockResolvedValue(driftedTreesLessonJson());
    const materialId = seedMaterial(db, user.id, 'Chapter 6- Data Structures Linked Lists - NoGenerics', [
      {
        title: 'Introduction',
        heading: 'A Data Structureis Organizes Information So That It',
        text: 'A data structure organizes information so that it is efficient to access and process. An array is static. A vector is dynamic. In this chapter we study lists, queues, and stacks.',
        keywords: ['data structure', 'array', 'vector', 'lists', 'queues', 'stacks'],
      },
      {
        title: 'Self-Referential Classes: Definition',
        text: 'A self-referential class contains an instance variable that refers to another object of the same class type. That instance variable is called a link. A null reference means the link does not refer to another object.',
        keywords: ['self-referential class', 'link', 'null reference'],
      },
      {
        title: 'p.next = q;',
        text: 'p.next = q stores the address of node q in the link field of node p, thereby connecting node p to node q and forming a linked list with two nodes.',
        keywords: ['node.next', 'link field', 'linked list'],
      },
      {
        title: 'Linked Lists: Definition',
        text: 'A linked list is a linear collection of nodes. It is based on a self-referential object that refers to an object of the same class. Each node contains data and a reference to the next node.',
        keywords: ['linked list', 'linear collection', 'node', 'next reference'],
      },
      {
        title: 'List Implementation',
        text: 'A list implementation stores a head reference. insertAtFront and insertAtBack add nodes. removeFromFirst and removeFromLast remove nodes. Insertion into a linked list is fast because only references change.',
        keywords: ['head reference', 'insertAtFront', 'removeFromFirst', 'list implementation'],
      },
    ]);

    const res = await request(app)
      .post('/api/notes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, sourceScope: 'material' });

    expect(res.status).toBe(200);
    expect(res.body.title).toMatch(/linked list/i);
    expect(res.body.verifier_repaired).toBe(true);
    expect(res.body.body_md).toMatch(/linked list|self-referential|link field|head reference|insertatfront/i);
    expect(res.body.body_md).not.toMatch(/root node|preorder|postorder|binary search tree/i);

    const sourceMap = JSON.parse(res.body.source_map_json);
    expect(sourceMap.resolved_topic).toMatch(/linked list/i);
    expect(sourceMap.verifier.repaired).toBe(true);
    expect(sourceMap.verifier.repairs.some(item => item.stage === 'quality_repair' || item.stage === 'final_source_repair')).toBe(true);
  });

  it('repairs focused Trees chapter notes without requiring generated code', async () => {
    const materialId = seedMaterial(db, user.id, '210-Trees', [
      {
        title: 'Tree ADT',
        text: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children. The interface includes root, parent, children, size, isInternal, isExternal, and isRoot.',
        keywords: ['tree adt', 'root', 'children', 'parent', 'external'],
      },
      {
        title: 'Tree Traversals',
        text: 'Preorder visits parent before children. Postorder visits children before parent. Traversal systematically visits all nodes in the tree.',
        keywords: ['preorder', 'postorder', 'traversal'],
      },
    ]);
    const chapter = db.prepare('SELECT id FROM chapters WHERE material_id=? AND title=?').get(materialId, 'Tree ADT');

    const res = await request(app)
      .post('/api/notes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, sourceScope: 'chapter', chapter_id: chapter.id });

    expect(res.status).toBe(200);
    expect(res.body.verifier_repaired).toBe(true);
    expect(res.body.source_scope).toBe('chapter');
    expect(res.body.body_md).toMatch(/tree adt|root|parent|children|isexternal|isroot/i);
    expect(res.body.body_md).not.toMatch(/head pointer|node\.next|null-terminated chain/i);

    const sourceMap = JSON.parse(res.body.source_map_json);
    expect(sourceMap.verifier.repaired).toBe(true);
    expect(sourceMap.verifier.repairs.some(item => item.stage === 'final_source_repair' || item.stage === 'quality_repair')).toBe(true);
  });
});
