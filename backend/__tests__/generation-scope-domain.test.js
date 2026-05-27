'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');
const rag = require('../services/rag.service');
const domainDetection = require('../services/domain-detection.service');
const notesAudio = require('../services/notes-audio.service');
const materialUnderstanding = require('../services/material-understanding.service');

function appWithRoutes() {
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/flashcards', require('../routes/flashcard.routes'));
  app.use('/api/quizzes', require('../routes/quiz.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedMaterial(db, userId, title, chapters) {
  const now = new Date().toISOString();
  const materialId = db.prepare(`
    INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(userId, title, 'pdf', `${title}.pdf`, 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  chapters.forEach((chapter, idx) => {
    const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
      .run(materialId, idx, chapter.title, idx * 100, (idx + 1) * 100).lastInsertRowid;
    db.prepare(`
      INSERT INTO chunks (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(materialId, chapterId, idx, chapter.text, 60, chapter.title, chapter.heading || chapter.title, 0, JSON.stringify(chapter.keywords || []));
  });
  return materialId;
}

describe('generation scope and general-subject domain gating', () => {
  let app, db, user, token;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(ai, 'embed').mockRejectedValue(new Error('embedding skipped'));
    vi.spyOn(ai, 'generate').mockResolvedValue('{}');
    vi.spyOn(ai, 'assertModelsAvailable').mockResolvedValue(undefined);
    const setup = appWithRoutes();
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

  it('defaults RAG generation scope to the entire material', async () => {
    const materialId = seedMaterial(db, user.id, 'Management Planning', [
      { title: 'Planning', text: 'Planning defines goals, resources, priorities, and timelines for a team.' },
      { title: 'Organizing', text: 'Organizing assigns responsibilities and coordinates work across roles.' },
    ]);

    const all = await rag.retrieveLessonContext(materialId, 'management', { feature: 'quiz', includeSystem: false, k: 6 });
    const chapter = await rag.retrieveLessonContext(materialId, 'management', {
      feature: 'quiz',
      includeSystem: false,
      sourceScope: 'chapter',
      chapterId: db.prepare('SELECT id FROM chapters WHERE material_id=? AND title=?').get(materialId, 'Planning').id,
      k: 6,
    });

    expect(all.sourceScope).toBe('material');
    expect(all.uploaded.chunks.length).toBe(2);
    expect(chapter.sourceScope).toBe('chapter');
    expect(chapter.uploaded.chunks.length).toBe(1);
    expect(chapter.uploaded.chunks[0].chapter_title).toBe('Planning');
  });

  it('does not treat business interface language as CS curated context', async () => {
    const materialId = seedMaterial(db, user.id, 'Customer Experience Lecture', [
      { title: 'Brand Interface', text: 'The customer interface includes packaging, service, channel access, pricing, and support.' },
      { title: 'Campaign Goals', text: 'Campaigns communicate value to target customers through business channels and sales teams.' },
    ]);
    const domain = domainDetection.detectMaterialDomain(user.id, materialId, { hint: 'interface and customer' });

    expect(domain.domain).toBe('business');
    expect(domainDetection.shouldUseCuratedCs(domain)).toBe(false);

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 2, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.domain.domain).toBe('business');
    const prompt = ai.generate.mock.calls[0][0];
    expect(prompt).not.toMatch(/curatedKnowledge[\s\S]*Class and Object/i);
    expect(prompt).not.toMatch(/Stack|Queue|LIFO|FIFO/);
  });

  it('does not classify ambiguous marketing words as CS by themselves', () => {
    const materialId = seedMaterial(db, user.id, 'Marketing Operations', [
      { title: 'Customer Search', text: 'Customers search for products, join a support queue, and compare a stack of promotions before purchase.' },
      { title: 'Brand Interface', text: 'The brand interface includes packaging, price, product, place, promotion, and customer service.' },
    ]);
    const domain = domainDetection.detectMaterialDomain(user.id, materialId, { hint: 'search queue stack interface' });

    expect(domain.domain).toBe('business');
    expect(domainDetection.shouldUseCuratedCs(domain)).toBe(false);
  });

  it('prioritizes focus-topic chunks in a multi-topic material', async () => {
    const materialId = seedMaterial(db, user.id, 'Trees and Hashing Unit', [
      { title: 'Trees', heading: 'Tree Introduction', text: 'Trees have a root node, edges, parent child relationships, and leaves.' },
      { title: 'Binary Trees', heading: 'Tree Traversal', text: 'Binary tree traversal can be preorder, inorder, and postorder.' },
      { title: 'Binary Search Tree', heading: 'BST Operations', text: 'A BST stores smaller keys in the left subtree and supports search, insert, and delete.' },
      { title: 'Hashing', heading: 'Hash Table', text: 'A hash function maps keys to buckets in a hash table.' },
      { title: 'Collision Resolution', heading: 'Open Addressing', text: 'Collisions use separate chaining, linear probing, quadratic probing, or double hashing.' },
    ]);
    const sourceInfo = materialUnderstanding.understandGeneralFromDb(user.id, materialId, {
      title: 'Trees and Hashing Unit',
      limit: 16,
    });
    const focusTerms = materialUnderstanding.focusTermsForTopic('Trees', sourceInfo.sourceOutline);
    const avoidTerms = materialUnderstanding.competingTermsForTopic('Trees', sourceInfo.sourceOutline);

    const res = await rag.retrieveLessonContext(materialId, 'Trees', {
      feature: 'notes',
      includeSystem: false,
      focusTopic: 'Trees',
      focusTerms,
      avoidTerms,
      k: 3,
    });
    const text = res.uploaded.chunks.map(chunk => `${chunk.chapter_title} ${chunk.heading} ${chunk.text}`).join(' ').toLowerCase();

    expect(text).toMatch(/tree|bst|traversal|root|leaf/);
    expect(text).not.toMatch(/hash function|collision|probing|chaining/);
  });

  it('uses broad non-CS domain labels for varied uploaded subjects', () => {
    const biologyId = seedMaterial(db, user.id, 'Cell Biology Lecture', [
      { title: 'Photosynthesis', text: 'Biology explains how chloroplast cells use sunlight energy, carbon dioxide, and water to produce glucose and oxygen.' },
    ]);
    const historyId = seedMaterial(db, user.id, 'History Theory Lecture', [
      { title: 'Revolution Causes', text: 'Historical analysis connects revolution, empire, social conflict, treaty negotiations, and political change.' },
    ]);
    const economicsId = seedMaterial(db, user.id, 'Economics Lecture', [
      { title: 'Supply and Demand', text: 'Economics studies market demand, supply, price, costs, revenue, and business decisions.' },
    ]);

    expect(domainDetection.detectMaterialDomain(user.id, biologyId).domain).toBe('science');
    expect(domainDetection.detectMaterialDomain(user.id, historyId).domain).toBe('humanities');
    expect(domainDetection.detectMaterialDomain(user.id, economicsId).domain).toBe('business');
  });

  it('still detects real Stack lectures as curated CS material', () => {
    const materialId = seedMaterial(db, user.id, 'Stack Data Structure Lecture', [
      { title: 'Stack Operations', text: 'A stack data structure uses LIFO order with push, pop, and peek operations at the top.' },
      { title: 'Underflow', text: 'Stack underflow happens when pop is called on an empty stack.' },
    ]);
    const domain = domainDetection.detectMaterialDomain(user.id, materialId, { hint: 'stack push pop lifo' });

    expect(domain.domain).toBe('cs');
    expect(domainDetection.shouldUseCuratedCs(domain)).toBe(true);
  });

  it('still allows curated CS context for supported OOP material', () => {
    const materialId = seedMaterial(db, user.id, 'OOP Encapsulation Lecture', [
      { title: 'Encapsulation', text: 'Encapsulation uses a class with private fields and public methods to protect object state.' },
      { title: 'Methods', text: 'Java getters and setters validate changes before an object updates its attributes.' },
    ]);
    const domain = domainDetection.detectMaterialDomain(user.id, materialId, { hint: 'encapsulation class object' });

    expect(domain.domain).toBe('cs');
    expect(domainDetection.shouldUseCuratedCs(domain)).toBe(true);
  });

  it('normalizes markdown before note audio TTS', () => {
    const spoken = notesAudio._internals.markdownToSpeechText('## Topic\n- **Encapsulation** protects state\n- [Read more](https://example.com)\n```js\nconst x = 1;\n```', { mode: 'brief' });

    expect(spoken).not.toMatch(/asterisk|\*\*|\*|```|https?:/i);
    expect(spoken).toMatch(/Encapsulation protects state/);
    expect(spoken).toMatch(/Code example omitted/);
  });
});
