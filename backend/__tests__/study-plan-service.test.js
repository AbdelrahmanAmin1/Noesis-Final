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
    db.exec('DELETE FROM study_plan_tasks; DELETE FROM study_plans; DELETE FROM learning_maps; DELETE FROM concepts; DELETE FROM user_prefs; DELETE FROM users;');
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
});
