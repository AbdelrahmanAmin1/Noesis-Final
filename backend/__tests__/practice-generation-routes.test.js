'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const materials = require('../services/material.service');
const env = require('../config/env');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function getPracticeApp() {
  setupTestEnv();
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/quizzes', require('../routes/quiz.routes'));
  app.use('/api/flashcards', require('../routes/flashcard.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedMaterial(db, userId, title = 'Encapsulation Notes') {
  const now = new Date().toISOString();
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, title, 'pdf', 'encapsulation.pdf', 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, 'OOP Basics', 0, 1000).lastInsertRowid;
  db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(materialId, chapterId, 0, [
      'Encapsulation keeps fields private and exposes validated public methods.',
      'The instructor uses a BankAccount example with private balance and deposit or withdraw methods.',
      'A common mistake is making balance public or using setters without validation.',
    ].join('\n'), 80, 'OOP Basics', 'Encapsulation', 1, '["encapsulation","data hiding","BankAccount"]');
  db.prepare('UPDATE materials SET extraction_diagnostics_json=? WHERE id=?')
    .run(JSON.stringify({ extractionPipelineVersion: 2 }), materialId);
  return materialId;
}

function seedPracticeMaterial(db, userId, { title, filePath = 'material.pdf', chapterTitle = 'Uploaded Material', chunks }) {
  const now = new Date().toISOString();
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, title, 'pdf', filePath, 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, chapterTitle, 0, 2000).lastInsertRowid;
  for (const [idx, chunk] of chunks.entries()) {
    db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(
        materialId,
        chapterId,
        idx,
        chunk.text,
        100,
        chapterTitle,
        chunk.heading || chapterTitle,
        chunk.hasCode ? 1 : 0,
        JSON.stringify(chunk.keywords || [])
      );
  }
  db.prepare('UPDATE materials SET extraction_diagnostics_json=? WHERE id=?')
    .run(JSON.stringify({ extractionPipelineVersion: 2 }), materialId);
  return materialId;
}

function seedTreesMaterial(db, userId) {
  return seedPracticeMaterial(db, userId, {
    title: '210-Trees',
    filePath: '210-trees.pdf',
    chapterTitle: 'Trees',
    chunks: [
      {
        heading: 'Tree ADT',
        text: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children. Height and depth describe node positions in the tree.',
        keywords: ['tree', 'root', 'children', 'height', 'depth'],
      },
      {
        heading: 'Tree Traversals',
        text: 'Preorder, inorder, and postorder are tree traversal orders. A binary tree uses left and right child references.',
        keywords: ['preorder', 'inorder', 'postorder', 'binary tree'],
      },
      {
        heading: 'Binary Search Tree',
        text: 'A BST is an ordered tree example. Search, insert, and delete follow the left subtree and right subtree rule.',
        keywords: ['bst', 'binary search tree', 'subtree'],
      },
    ],
  });
}

function linkedListQuizJson() {
  return JSON.stringify({
    questions: [
      {
        question: 'In a linked list, what does the head pointer store?',
        options: [
          'The first node in a null-terminated chain',
          'The root node of a hierarchy',
          'The height of a subtree',
          'The inorder traversal output',
        ],
        correct_idx: 0,
        explanation: 'A linked list follows node.next references from the head pointer until null.',
        difficulty: 'medium',
        topic: 'Linked List',
        question_type: 'concept',
        source_chunk_ids: [2],
      },
      {
        question: 'What changes during linked list insertion?',
        options: [
          'The next pointer links between nodes',
          'The root and child relationship',
          'The depth of every tree node',
          'The left subtree ordering rule',
        ],
        correct_idx: 0,
        explanation: 'Insertion in a linked list rewires node.next pointers.',
        difficulty: 'medium',
        topic: 'Linked List',
        question_type: 'code_design',
        source_chunk_ids: [4],
      },
    ],
  });
}

function treesQuizJson() {
  return JSON.stringify({
    questions: [
      {
        question: 'What role does the root play in a tree ADT?',
        options: [
          'It is the top node from which child relationships begin',
          'It is the final null pointer in a chain',
          'It is the bucket index for a key',
          'It is a Java class interface',
        ],
        correct_idx: 0,
        explanation: 'A tree hierarchy begins at the root, from which child relationships descend.',
        difficulty: 'medium',
        topic: 'Trees',
        question_type: 'concept',
        source_chunk_ids: [2],
      },
      {
        question: 'Which traversal belongs to the standard tree traversal set?',
        options: [
          'Preorder traversal',
          'Linear probing',
          'Setter validation',
          'Pointer reversal in a list',
        ],
        correct_idx: 0,
        explanation: 'Preorder, inorder, and postorder are traversal orders used to visit tree nodes.',
        difficulty: 'medium',
        topic: 'Trees',
        question_type: 'scenario',
        source_chunk_ids: [3],
      },
    ],
  });
}

function linkedListCardsJson() {
  return JSON.stringify({
    cards: [
      {
        question: 'What does the head pointer do in a linked list?',
        answer: 'It references the first node, and each node.next points to the next node until null.',
        difficulty: 'easy',
        topic: 'Linked List',
        source_chunk_id: 1,
      },
      {
        question: 'How does linked list insertion work?',
        answer: 'It rewires next pointer links between neighboring nodes.',
        difficulty: 'medium',
        topic: 'Linked List',
        source_chunk_id: 1,
      },
    ],
  });
}

function treesCardsJson() {
  return JSON.stringify({
    cards: [
      {
        question: 'What is the root in a tree ADT?',
        answer: 'The root is the top node in the hierarchy, and child nodes descend from it.',
        difficulty: 'easy',
        topic: 'Trees',
        source_chunk_id: 1,
      },
      {
        question: 'Which traversals are named in the Trees material?',
        answer: 'The source names preorder, inorder, and postorder as tree traversal orders.',
        difficulty: 'medium',
        topic: 'Trees',
        source_chunk_id: 2,
      },
    ],
  });
}

describe('quiz and flashcard generation routes with educational context', () => {
  let app, db, token, user, materialId;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(ai, 'embed').mockRejectedValue(new Error('embedding skipped in practice route tests'));
    vi.spyOn(ai, 'assertModelsAvailable').mockResolvedValue(undefined);
    vi.spyOn(ai, 'generate').mockResolvedValue('{}');
    env.QUIZ_PROVIDER = 'ollama';
    env.QUIZ_FALLBACK_PROVIDER = 'ollama';
    env.FLASHCARD_PROVIDER = 'ollama';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.FLASHCARD_MIN_CARDS = 6;
    env.FLASHCARD_MAX_CARDS = 8;
    env.FLASHCARD_DEFAULT_CARDS = 8;
    env.FLASHCARD_TOP_K_CHUNKS = 3;
    env.FLASHCARD_MAX_CONTEXT_CHARS = 4000;
    env.FLASHCARD_TIMEOUT_MS = 60000;
    env.GROQ_API_KEY = '';

    const setup = getPracticeApp();
    app = setup.app;
    db = setup.db;
    const created = await createTestUser(app, request);
    user = created.user;
    token = created.token;
    materialId = seedMaterial(db, user.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupTestDb();
  });

  it('passes curated context to quiz generation while preserving stored quiz fields', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [
        {
          question: 'Why should BankAccount.balance be private?',
          options: [
            'So updates can be validated through public methods',
            'So any class can change it directly',
            'So inheritance is disabled',
            'So dynamic dispatch chooses deposit',
          ],
          correct_idx: 0,
          explanation: 'Private balance protects the account from invalid changes and forces controlled access.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'concept',
          source_chunk_ids: [1],
        },
        {
          question: 'A deposit request contains an invalid amount; where should validation occur?',
          options: [
            'Inside the public method before private state changes',
            'In unrelated caller code after balance changes',
            'By exposing balance for direct assignment',
            'By disabling methods on the account object',
          ],
          correct_idx: 0,
          explanation: 'Validated public methods protect private account state before applying a requested change.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'scenario',
          source_chunk_ids: [1],
        },
      ],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const promptSeen = ai.generate.mock.calls[0][0];
    expect(promptSeen).toContain('Educational context');
    expect(promptSeen).toContain('Topic lock');
    expect(promptSeen).toContain('BankAccount');
    expect(promptSeen).toContain('Uploaded excerpts are the course-specific source of truth');
    expect(promptSeen).toContain('correct_idx');

    const stored = db.prepare('SELECT question, options_json, correct_idx, explanation, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(res.body.quiz_id);
    expect(stored.length).toBe(2);
    expect(stored[0].question).toMatch(/BankAccount\.balance/i);
    expect(JSON.parse(stored[0].options_json)).toHaveLength(4);
    expect(stored[0].correct_idx).toBe(0);
    expect(stored[0].concept).toBe('Encapsulation');
  });

  it('passes curated context to flashcard generation and strips visible chunk ids', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: [{
        question: 'Why should balance be private in BankAccount?',
        answer: 'Because validated public methods prevent invalid account changes. [chunk:1]',
        difficulty: 'easy',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      }],
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1 });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(6);
    const promptSeen = ai.generate.mock.calls[0][0];
    expect(promptSeen).toContain('Educational context');
    expect(promptSeen).toContain('Topic lock');
    expect(promptSeen).toContain('BankAccount');
    expect(promptSeen).toContain('Do not put raw chunk IDs');

    const stored = db.prepare('SELECT question, answer, topic, source_chunk_id FROM flashcards WHERE id=?').get(res.body.ids[0]);
    expect(stored.question).toMatch(/balance/i);
    expect(stored.answer).not.toMatch(/\[chunk:/i);
    expect(stored.topic).toBe('Encapsulation');
    expect(stored.source_chunk_id === null || Number.isInteger(stored.source_chunk_id)).toBe(true);
  });

  it('sanitizes page and lecture labels from generated flashcards before saving', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: Array.from({ length: 6 }, (_, idx) => ({
        question: idx === 0
          ? 'Page 1 CS 2110 Lecture 8: Why should balance be private in BankAccount?'
          : `Why does encapsulation protect account state ${idx + 1}?`,
        answer: idx === 0
          ? 'Lecture 8 explains that validated public methods prevent invalid account changes.'
          : 'Validated public methods protect private account state from invalid changes.',
        difficulty: 'medium',
        topic: idx === 0 ? 'Lecture 8: Encapsulation' : 'Encapsulation',
        source_chunk_id: 1,
      })),
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 6 });

    expect(res.status).toBe(200);
    const stored = db.prepare('SELECT question, answer, topic FROM flashcards WHERE id=?').get(res.body.ids[0]);
    const visible = `${stored.question} ${stored.answer} ${stored.topic}`;
    expect(visible).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(visible).not.toMatch(/\bCS\s*2110\b/i);
    expect(stored.question).toMatch(/balance.*private/i);
    expect(stored.topic).toBe('Encapsulation');
  });

  it('uses Groq first for flashcards when configured', async () => {
    env.FLASHCARD_PROVIDER = 'groq';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = 'test-groq-key';
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: Array.from({ length: 6 }, (_, idx) => ({
        question: `What does encapsulation protect in card ${idx + 1}?`,
        answer: 'It protects object state by keeping fields private and using validated public methods.',
        difficulty: idx < 2 ? 'easy' : 'medium',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      })),
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1 });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(false);
    expect(res.body.created).toBe(6);
    expect(ai.generate.mock.calls[0][1].provider).toBe('groq');
    expect(ai.generate.mock.calls[0][1].feature).toBe('flashcards');
  });

  it('uses Groq first for quizzes when configured', async () => {
    env.QUIZ_PROVIDER = 'groq';
    env.QUIZ_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = 'test-groq-key';
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [
        {
          question: 'Why should BankAccount.balance stay private?',
          options: [
            'So deposits and withdrawals can validate state changes',
            'So every class can assign balance directly',
            'So dynamic dispatch is disabled',
            'So object methods are no longer needed',
          ],
          correct_idx: 0,
          explanation: 'Private balance supports controlled updates through validated public methods.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'concept',
          source_chunk_ids: [1],
        },
        {
          question: 'Which mistake does encapsulation help prevent?',
          options: [
            'Public code changing internal state without validation',
            'Methods checking inputs before changing fields',
            'Objects keeping data and behavior together',
            'Calling deposit through a public method',
          ],
          correct_idx: 0,
          explanation: 'The source warns against public fields or setters that skip validation.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'misconception',
          source_chunk_ids: [1],
        },
      ],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(false);
    expect(res.body.provider).toBe('groq');
    expect(ai.generate.mock.calls[0][1].provider).toBe('groq');
    expect(ai.generate.mock.calls[0][1].feature).toBe('quiz');
  });

  it('uses Ollama fallback for quizzes when Groq is not configured', async () => {
    env.QUIZ_PROVIDER = 'groq';
    env.QUIZ_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = '';
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [
        {
          question: 'Why does encapsulation use public methods around private state?',
          options: [
            'To validate changes before the object updates its data',
            'To let outside code assign every field directly',
            'To remove all behavior from the object',
            'To make inheritance mandatory for every class',
          ],
          correct_idx: 0,
          explanation: 'Encapsulation keeps state private and uses public methods for controlled updates.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'concept',
          source_chunk_ids: [1],
        },
        {
          question: 'What does the BankAccount example illustrate?',
          options: [
            'Private balance with deposit or withdraw methods',
            'A public balance field edited by any caller',
            'A tree traversal over account nodes',
            'A sorting algorithm for transactions',
          ],
          correct_idx: 0,
          explanation: 'The account keeps balance private and exposes deposit or withdraw methods for controlled changes.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'scenario',
          source_chunk_ids: [1],
        },
      ],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('ollama');
    expect(res.body.provider_fallback).toBe(true);
    expect(ai.generate.mock.calls[0][1].provider).toBe('ollama');
    expect(ai.generate.mock.calls[0][1].feature).toBe('quiz');
  });

  it('moves from Groq to Ollama after Groq exhausts its quality retry', async () => {
    env.QUIZ_PROVIDER = 'groq';
    env.QUIZ_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = 'test-groq-key';
    const valid = JSON.stringify({
      questions: [
        {
          question: 'Why should an account expose deposit instead of a public balance field?',
          options: [
            'The method can validate changes before updating private state',
            'The field becomes globally writable by every caller',
            'The object no longer needs to own its behavior',
            'The class must use inheritance for every update',
          ],
          correct_idx: 0,
          explanation: 'A public method provides controlled access and validates changes before private account state is updated.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'code_design',
          source_chunk_ids: [1],
        },
        {
          question: 'Which design mistake breaks the protection around private account state?',
          options: [
            'Providing a setter that changes balance without validation',
            'Checking a deposit amount before changing balance',
            'Keeping balance private inside the account object',
            'Calling a validated withdraw method from client code',
          ],
          correct_idx: 0,
          explanation: 'A setter without validation exposes state changes without preserving the object invariant.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'misconception',
          source_chunk_ids: [1],
        },
      ],
    });
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(linkedListQuizJson())
      .mockResolvedValueOnce(linkedListQuizJson())
      .mockResolvedValueOnce(valid);

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('ollama');
    expect(res.body.provider_fallback).toBe(true);
    expect(ai.generate).toHaveBeenCalledTimes(3);
    expect(ai.generate.mock.calls[0][1].provider).toBe('groq');
    expect(ai.generate.mock.calls[2][1].provider).toBe('ollama');
  });

  it('accepts concise grounded Stack options such as Pop, LIFO, and O(1)', async () => {
    const stackId = seedPracticeMaterial(db, user.id, {
      title: 'Stack Operations',
      chapterTitle: 'Stacks',
      chunks: [{
        heading: 'LIFO Stack Operations',
        text: 'A stack follows LIFO order. Push adds an item to the top, Pop removes the most recently pushed item, and Peek reads the top item. Push and Pop are O(1) operations.',
        keywords: ['stack', 'LIFO', 'push', 'pop', 'peek', 'O(1)'],
      }],
    });
    const chunkId = db.prepare('SELECT id FROM chunks WHERE material_id=?').get(stackId).id;
    ai.generate.mockReset();
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [
        {
          question: 'Which operation removes the most recently pushed stack item?',
          options: ['Pop', 'Push', 'Peek', 'Size'],
          correct_idx: 0,
          explanation: 'Pop removes the most recently pushed item because a stack follows LIFO order.',
          difficulty: 'medium',
          topic: 'Stack Operations',
          question_type: 'concept',
          source_chunk_ids: [chunkId],
        },
        {
          question: 'What is the stated running time of a stack Push operation?',
          options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
          correct_idx: 0,
          explanation: 'The source identifies Push and Pop as constant-time O(1) stack operations.',
          difficulty: 'medium',
          topic: 'Stack Complexity',
          question_type: 'scenario',
          source_chunk_ids: [chunkId],
        },
      ],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: stackId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 2, requested_count: 2, partial: false });
    const stored = db.prepare('SELECT options_json FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(res.body.quiz_id);
    expect(JSON.parse(stored[0].options_json)).toContain('Pop');
    expect(JSON.parse(stored[1].options_json)).toContain('O(1)');
  });

  it('sanitizes page and lecture labels from generated quiz content before saving', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [
        {
          question: 'Page 1 CS 2110 Lecture 8: Why should BankAccount balance stay private?',
          options: [
            'Validated public methods control changes',
            'Every caller directly changes balance',
            'The lecture number controls object state',
            'A course header validates deposits',
          ],
          correct_idx: 0,
          explanation: 'Lecture 8 says private balance supports validated public methods before account state changes.',
          difficulty: 'medium',
          topic: 'Lecture 8: Encapsulation',
          question_type: 'concept',
          source_chunk_ids: [1],
        },
        {
          question: 'Slide 4: Where should invalid deposit amounts be rejected?',
          options: [
            'Inside the deposit method before balance changes',
            'Inside a page header',
            'After exposing balance publicly',
            'By removing validation from methods',
          ],
          correct_idx: 0,
          explanation: 'Validated public methods protect private account state before applying invalid changes.',
          difficulty: 'medium',
          topic: 'Encapsulation',
          question_type: 'scenario',
          source_chunk_ids: [1],
        },
      ],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    const stored = db.prepare('SELECT question, options_json, explanation, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(res.body.quiz_id);
    const visible = stored.map(row => `${row.question} ${row.options_json} ${row.explanation} ${row.concept}`).join(' ');
    expect(visible).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(visible).not.toMatch(/\bCS\s*2110\b/i);
    expect(stored[0].question).toMatch(/BankAccount balance stay private/i);
    expect(stored[0].concept).toBe('Encapsulation');
  });

  it('persists a grounded partial quiz when retries cannot fill the requested count', async () => {
    const validQuestions = [
      {
        question: 'Why does a BankAccount keep its balance private?',
        options: ['To validate updates through public methods', 'To permit direct changes by every caller', 'To disable every account method', 'To require inheritance for deposits'],
        correct_idx: 0,
        explanation: 'Private balance supports validated updates through the account public methods.',
        difficulty: 'medium', topic: 'Encapsulation', question_type: 'concept', source_chunk_ids: [1],
      },
      {
        question: 'Where should an invalid deposit amount be rejected?',
        options: ['Inside the deposit method before balance changes', 'After exposing balance to caller code', 'Inside an unrelated subclass constructor', 'After removing all account validation'],
        correct_idx: 0,
        explanation: 'The validated deposit method protects private balance before applying an invalid change.',
        difficulty: 'medium', topic: 'Validated Methods', question_type: 'scenario', source_chunk_ids: [1],
      },
      {
        question: 'Which choice is a common encapsulation mistake?',
        options: ['Making balance public without validation', 'Keeping balance private', 'Validating a withdrawal request', 'Using public methods for controlled access'],
        correct_idx: 0,
        explanation: 'A public balance allows uncontrolled state changes and bypasses method validation.',
        difficulty: 'medium', topic: 'Encapsulation Mistakes', question_type: 'misconception', source_chunk_ids: [1],
      },
      {
        question: 'What does a validated setter trade for controlled account state?',
        options: ['Some direct access for safer balance updates', 'All methods for unrestricted public fields', 'Private state for mandatory inheritance', 'Validation for arbitrary caller assignments'],
        correct_idx: 0,
        explanation: 'Controlled methods restrict direct balance access so the object can validate each update.',
        difficulty: 'medium', topic: 'Controlled Access', question_type: 'tradeoff', source_chunk_ids: [1],
      },
    ];
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(JSON.stringify({
        questions: [
          ...validQuestions,
          { question: 'What is this topic?', options: ['A', 'B', 'C', 'D'], correct_idx: 0, explanation: 'Placeholder explanation', question_type: 'concept', source_chunk_ids: [1] },
          { question: 'Which unrelated claim is correct?', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct_idx: 0, explanation: 'This explanation has no source support at all.', topic: 'Unrelated', question_type: 'concept', source_chunk_ids: [] },
        ],
      }))
      .mockRejectedValue(Object.assign(new Error('timed out'), { code: 'ai_timeout', status: 503 }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 6, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 4, requested_count: 6, partial: true });
    expect(res.body.quality_warnings).toContain('requested_6_generated_4');
    expect(ai.generate).toHaveBeenCalledTimes(2);
    expect(ai.generate.mock.calls[0][1].timeoutMs).toBeLessThanOrEqual(45000);
    expect(db.prepare('SELECT COUNT(*) AS count FROM quiz_questions WHERE quiz_id=?').get(res.body.quiz_id).count).toBe(4);
  });

  it('falls back to deterministic flashcards when Ollama times out', async () => {
    env.FLASHCARD_PROVIDER = 'groq';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = '';
    env.FLASHCARD_TIMEOUT_MS = 1;
    ai.generate.mockImplementationOnce(() => new Promise(() => {}));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 3, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.fallback_reason).toBe('ai_timeout');
    expect(res.body.created).toBeGreaterThan(0);
    expect(res.body.created).toBeGreaterThanOrEqual(6);
    expect(res.body.created).toBeLessThanOrEqual(8);

    const stored = db.prepare('SELECT question, answer FROM flashcards WHERE user_id=? ORDER BY id').all(user.id);
    expect(stored.length).toBe(res.body.created);
    for (const card of stored) {
      expect(card.question).not.toMatch(/\[chunk:/i);
      expect(card.answer).not.toMatch(/\[chunk:|sourceChunkIds|debug|trace/i);
    }
  });

  it('limits flashcard count to eight', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: Array.from({ length: 12 }, (_, idx) => ({
        question: `What is encapsulation card ${idx + 1}?`,
        answer: `Encapsulation card ${idx + 1} keeps state controlled through validated methods.`,
        difficulty: 'easy',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      })),
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 99, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(8);
  });

  it('reuses existing flashcards unless regeneration is requested', async () => {
    const existingIds = [];
    const insertExisting = db.prepare(`INSERT INTO flashcards
      (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (let idx = 0; idx < 6; idx += 1) {
      existingIds.push(insertExisting
        .run(user.id, materialId, 'Encapsulation Notes', `Why private fields ${idx + 1}?`, 'They prevent invalid direct state changes.', 'easy', 'Encapsulation Notes', null, new Date().toISOString()).lastInsertRowid);
    }

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 6 });

    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(res.body.created).toBe(0);
    const expectedIds = db.prepare(`SELECT id FROM flashcards WHERE user_id=? AND material_id=? ORDER BY created_at DESC LIMIT 6`)
      .all(user.id, materialId)
      .map(row => row.id);
    expect(res.body.ids).toEqual(expectedIds);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('retries wrong-topic Trees quiz output before saving', async () => {
    const treesId = seedTreesMaterial(db, user.id);
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(linkedListQuizJson())
      .mockResolvedValueOnce(treesQuizJson());

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: treesId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(ai.generate).toHaveBeenCalledTimes(2);
    expect(ai.generate.mock.calls[0][0]).toContain('Topic lock');
    expect(ai.generate.mock.calls[1][0]).toContain('failed quality validation');
    const stored = db.prepare('SELECT question, explanation, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(res.body.quiz_id);
    const text = stored.map(row => `${row.question} ${row.explanation} ${row.concept}`).join('\n');
    expect(text).toMatch(/root|tree|traversal/i);
    expect(text).not.toMatch(/head pointer|node\.next|null-terminated|Linked List/i);
  });

  it('rejects the quiz without saving when both quality attempts stay on the wrong topic', async () => {
    const treesId = seedTreesMaterial(db, user.id);
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(linkedListQuizJson())
      .mockResolvedValueOnce(linkedListQuizJson());

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: treesId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('quiz_quality_failed');
    expect(ai.generate).toHaveBeenCalledTimes(2);
    expect(db.prepare('SELECT COUNT(*) AS count FROM quizzes WHERE material_id=?').get(treesId).count).toBe(0);
  });

  it('does not save a deterministic metadata quiz when model generation fails', async () => {
    const badHandoutId = seedPracticeMaterial(db, user.id, {
      title: '09OOPEncapsulation',
      filePath: '09OOPEncapsulation.pdf',
      chapterTitle: 'CS108 Stanford Handout',
      chunks: [
        {
          heading: 'CS108 Stanford Handout #9',
          text: [
            'CS108, Stanford Handout #9',
            'Thanks to Nick Parlante for much of this handout.',
            'Fall, 2008-09 Osvaldo Jimenez',
            'OOP Design #1 -- Encapsulation',
            'The most basic idea in OOP is that each object encapsulates some data and code.',
            'The object takes requests and uses private state plus methods to respond safely.',
          ].join('\n'),
          keywords: ['encapsulation', 'object', 'private state', 'methods'],
          hasCode: false,
        },
      ],
    });
    ai.generate.mockReset();
    ai.generate.mockRejectedValue(Object.assign(new Error('model failed'), { code: 'ai_unavailable' }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: badHandoutId, count: 2, difficulty: 'medium' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('quiz_generation_failed');
    expect(db.prepare('SELECT COUNT(*) AS count FROM quizzes WHERE material_id=?').get(badHandoutId).count).toBe(0);
  });

  it('returns a reusable reindex job before generating from stale extraction', async () => {
    db.prepare('UPDATE materials SET extraction_diagnostics_json=? WHERE id=?')
      .run(JSON.stringify({ extractionPipelineVersion: 1 }), materialId);
    vi.spyOn(materials, 'queueReindex').mockReturnValue({ needed: true, job: { id: 'reindex-job-1' } });

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 6, difficulty: 'medium' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'reindexing', job_id: 'reindex-job-1', material_id: Number(materialId) });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('hides old quizzes that contain document metadata and requires regeneration', async () => {
    const now = new Date().toISOString();
    const quizId = db.prepare(`
      INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at)
      VALUES (?,?,?,?,?)
    `).run(user.id, materialId, '09OOPEncapsulation Quiz', 'medium', now).lastInsertRowid;
    const insert = db.prepare(`
      INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept)
      VALUES (?,?,?,?,?,?,?)
    `);
    const options = JSON.stringify([
      'CS108, Stanford Handout #9',
      'Thanks to the handout author',
      'OOP Design #1 -- Encapsulation',
      'Objects combine state with behavior',
    ]);
    insert.run(quizId, 0, 'According to the uploaded material, which statement best describes CS108?', options, 3, 'The source material identifies the handout.', 'CS108 Stanford Handout');
    insert.run(quizId, 1, 'What is the title of this document?', options, 0, 'The document title appears in the heading.', 'Document title');

    const list = await request(app)
      .get('/api/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.quizzes).toEqual([]);

    const get = await request(app)
      .get(`/api/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(409);
    expect(get.body.error).toBe('quiz_requires_regeneration');

    const attempt = await request(app)
      .post(`/api/quizzes/${quizId}/attempt`)
      .set('Authorization', `Bearer ${token}`);
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('quiz_requires_regeneration');
  });

  it('retries wrong-topic Trees flashcards before saving', async () => {
    const treesId = seedTreesMaterial(db, user.id);
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(linkedListCardsJson())
      .mockResolvedValueOnce(treesCardsJson());

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: treesId, count: 2, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(false);
    expect(ai.generate).toHaveBeenCalledTimes(2);
    expect(ai.generate.mock.calls[0][0]).toContain('Topic lock');
    expect(ai.generate.mock.calls[1][0]).toContain('Strict topic lock');
    const stored = db.prepare('SELECT question, answer, topic FROM flashcards WHERE material_id=? ORDER BY id').all(treesId);
    const text = stored.map(row => `${row.question} ${row.answer} ${row.topic}`).join('\n');
    expect(text).toMatch(/root|tree|traversal/i);
    expect(text).not.toMatch(/head pointer|node\.next|Linked List/i);
  });

  it('falls back to source-fact flashcards when wrong-topic Trees flashcard retry still fails', async () => {
    const treesId = seedTreesMaterial(db, user.id);
    ai.generate.mockReset();
    ai.generate
      .mockResolvedValueOnce(linkedListCardsJson())
      .mockResolvedValueOnce(linkedListCardsJson());

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: treesId, count: 2, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.fallback_reason).toBe('verifier_failed');
    expect(ai.generate).toHaveBeenCalledTimes(2);
    const stored = db.prepare('SELECT question, answer, topic FROM flashcards WHERE material_id=? ORDER BY id').all(treesId);
    const text = stored.map(row => `${row.question} ${row.answer} ${row.topic}`).join('\n');
    expect(text).toMatch(/tree|root|children|traversal/i);
    expect(text).not.toMatch(/head pointer|node\.next|Linked List/i);
  });
});
