'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

setupTestEnv();

const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/dashboard', require('../routes/dashboard.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('dashboard goal-aware recommendations', () => {
  let app;
  let db;

  beforeAll(() => {
    cleanupTestDb();
    migrate();
    db = getDb();
    app = buildApp();
  });

  afterAll(() => cleanupTestDb());

  async function dashboardFor(goal) {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: `dash-${goal}-${Date.now()}-${Math.random()}@test.com`, password: 'TestPass123!', name: 'Dashboard Student' });
    expect(signup.status).toBe(200);
    const userId = signup.body.user.id;
    db.prepare('UPDATE user_prefs SET goal=?, daily_minutes=? WHERE user_id=?').run(goal, 45, userId);
    db.prepare('UPDATE concepts SET mastery_pct=? WHERE user_id=? AND name=?').run(20, userId, 'Encapsulation');

    const now = new Date().toISOString();
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, 'Encapsulation Material', 'pdf', '/tmp/encapsulation.pdf', 'application/pdf', 1200, 'ready', 100, now)
      .lastInsertRowid;
    db.prepare('INSERT INTO notes (user_id, material_id, folder, title, body_md, tags_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(userId, materialId, 'General', 'Encapsulation Notes', 'Encapsulation protects object state.', '[]', now, now);
    db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(userId, materialId, 'OOP', 'What does encapsulation protect?', 'Object state', 'easy', 'Encapsulation', null, now);

    const res = await request(app).get('/api/dashboard').set(auth(signup.body.token));
    expect(res.status).toBe(200);
    return res.body;
  }

  async function signupWithGoal(goal) {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: `dash-empty-${goal}-${Date.now()}-${Math.random()}@test.com`, password: 'TestPass123!', name: 'Dashboard Student' });
    expect(signup.status).toBe(200);
    db.prepare('UPDATE user_prefs SET goal=?, daily_minutes=? WHERE user_id=?').run(goal, 45, signup.body.user.id);
    return signup;
  }

  it('returns goal-specific profiles, top actions, and insights', async () => {
    const expected = {
      exams: { route: 'material', action: 'generate_quiz', firstInsight: /quiz/i },
      understand: { route: 'tutor', action: 'start_tutor', firstInsight: /tutor/i },
      retain: { route: 'flashcards', action: 'review_flashcards', firstInsight: /review|card/i },
      practice: { route: 'material', action: 'generate_quiz', firstInsight: /practice|quiz/i },
    };

    for (const [goal, rule] of Object.entries(expected)) {
      const body = await dashboardFor(goal);
      expect(body.goal_profile.id).toBe(goal);
      expect(body.next_recommended_action.route).toBe(rule.route);
      expect(body.next_recommended_action.action).toBe(rule.action);
      expect(body.goal_recommendations[0].action).toBe(rule.action);
      expect(body.insights[0].t).toMatch(rule.firstInsight);
      expect(body.dashboard_copy.subtitle).toContain(body.goal_profile.dashboard_bias);
    }
  });

  it('keeps the goal recommendation first when an active plan exists', async () => {
    const signup = await signupWithGoal('exams');
    const userId = signup.body.user.id;
    const now = new Date().toISOString();
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, 'Exam Material', 'pdf', '/tmp/exam.pdf', 'application/pdf', 1200, 'ready', 100, now)
      .lastInsertRowid;
    db.prepare('INSERT INTO study_plans (user_id, title, goal, status, plan_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(userId, 'Old Plan', 'Understand deeply', 'active', JSON.stringify({ goalId: 'understand', dailyPlan: [{ day: 1, focusTopic: 'Old Topic', tasks: [] }] }), now, now);

    const res = await request(app).get('/api/dashboard').set(auth(signup.body.token));

    expect(materialId).toBeGreaterThan(0);
    expect(res.status).toBe(200);
    expect(res.body.goal_recommendations[0].action).toBe('generate_quiz');
    expect(res.body.next_recommended_action.action).toBe('generate_quiz');
    expect(res.body.goal_recommendations[1].action).toBe('continue_plan');
  });

  it('recommends upload first when there is no material', async () => {
    const signup = await signupWithGoal('understand');

    const res = await request(app).get('/api/dashboard').set(auth(signup.body.token));

    expect(res.status).toBe(200);
    expect(res.body.goal_recommendations[0].action).toBe('upload_material');
    expect(res.body.next_recommended_action.route).toBe('materials');
  });

  it('defaults missing goals to exam-prep recommendations', async () => {
    const body = await dashboardFor(null);

    expect(body.goal_profile.id).toBe('exams');
    expect(body.goal_recommendations[0].action).toBe('generate_quiz');
  });
});
