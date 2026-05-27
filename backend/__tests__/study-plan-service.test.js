'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

setupTestEnv();

const { migrate, getDb } = require('../config/db');
const studyPlans = require('../services/study-plan.service');
const learningMaps = require('../services/learning-map.service');

describe('study-plan.service', () => {
  let db;
  let userId;

  beforeAll(() => {
    cleanupTestDb();
    migrate();
    db = getDb();
  });

  beforeEach(() => {
    db.exec('DELETE FROM study_plan_tasks; DELETE FROM study_plans; DELETE FROM learning_maps; DELETE FROM chunks; DELETE FROM chapters; DELETE FROM materials; DELETE FROM concepts; DELETE FROM user_prefs; DELETE FROM users;');
    userId = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`plan-${Date.now()}@test.com`, 'hash', 'Plan User', new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO user_prefs (user_id, subject, goal, daily_minutes, study_profile_json) VALUES (?,?,?,?,?)')
      .run(userId, 'data-structures', 'exams', 45, JSON.stringify({
        deadline: '',
        daysPerWeek: 4,
        minutesPerSession: 50,
        learningStyle: 'mixed',
        preferredLanguage: 'java',
      }));
    db.prepare('INSERT INTO concepts (user_id, name, mastery_pct) VALUES (?,?,?)').run(userId, 'Linked List', 25);
    db.prepare('INSERT INTO concepts (user_id, name, mastery_pct) VALUES (?,?,?)').run(userId, 'Stack', 85);
  });

  afterAll(() => cleanupTestDb());

  it('puts weak topics near the start of the learning map', () => {
    const map = learningMaps.buildLearningMap(userId);
    expect(map.startHere).toBe('Linked List');
    expect(map.nodes.find(n => n.label === 'Linked List').type).toBe('weak');
  });

  it('grounds and prunes a material-specific learning map from uploaded chunks', () => {
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, 'Encapsulation Lecture', 'pdf', '/tmp/encapsulation.pdf', 'application/pdf', 1200, 'ready', 100, new Date().toISOString())
      .lastInsertRowid;
    db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(
        materialId,
        null,
        0,
        'Encapsulation hides object state inside a class. Private fields should not be changed directly; public methods such as getters and setters control access to the object.',
        34,
        'Object-Oriented Programming',
        'Encapsulation',
        0,
        JSON.stringify(['encapsulation', 'class', 'object', 'private fields', 'public methods'])
      );

    const map = learningMaps.buildLearningMap(userId, { materialId });
    const branchLabels = (map.tree.children || []).map(n => n.label);

    expect(map.rootTopic).toBe('Encapsulation Lecture');
    expect(map.materialGrounding.used).toBe(true);
    expect(map.materialGrounding.specificEnough).toBe(true);
    expect(map.materialGrounding.groundedConcepts).toContain('Encapsulation');
    expect(branchLabels).toContain('Encapsulation');
    expect(branchLabels).not.toContain('Polymorphism');
    expect(map.nodes.find(n => n.label === 'Encapsulation').grounded).toBe(true);
    expect(map.recommendedPath).toContain('Encapsulation');
  });

  it('creates, approves, and completes a personalized plan', () => {
    const draft = studyPlans.createPlan(userId);
    expect(draft.status).toBe('draft');
    expect(draft.plan.dailyPlan.length).toBeGreaterThan(0);
    expect(draft.plan.dailyPlan[0].focusTopic).toBe('Linked List');

    const active = studyPlans.approvePlan(userId, draft.id);
    expect(active.status).toBe('active');

    const firstTaskId = active.tasks[0].id;
    const updated = studyPlans.completeTask(userId, firstTaskId);
    expect(updated.tasks.find(t => t.id === firstTaskId).status).toBe('completed');
  });

  it('builds global plans from uploaded non-CS materials instead of defaulting to CS paths', () => {
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, 'French Revolution Lecture', 'pdf', '/tmp/history.pdf', 'application/pdf', 1200, 'ready', 100, new Date().toISOString())
      .lastInsertRowid;
    db.prepare(`
      INSERT INTO chunks (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      materialId,
      null,
      0,
      'The French Revolution was shaped by social inequality, financial crisis, Enlightenment ideas, and conflict between the estates.',
      34,
      'French Revolution',
      'Causes and Estates',
      0,
      JSON.stringify(['French Revolution', 'social inequality', 'financial crisis', 'Enlightenment', 'estates'])
    );

    const draft = studyPlans.createPlan(userId);
    const focuses = draft.plan.dailyPlan.map(day => day.focusTopic).join(' ');

    expect(draft.plan.learningMap.materialGrounding.combined).toBe(true);
    expect(focuses).toMatch(/French Revolution|Causes|Estates|Inequality|Enlightenment/i);
    expect(focuses).not.toMatch(/Encapsulation|Polymorphism|Stack Applications/i);
  });
});
