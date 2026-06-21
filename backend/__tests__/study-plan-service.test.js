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

  it('produces distinct curriculum trees for OOP, Data Structures, and both tracks', () => {
    const mapFor = (subject) => {
      db.prepare('UPDATE user_prefs SET subject=? WHERE user_id=?').run(subject, userId);
      return learningMaps.buildLearningMap(userId);
    };

    const oop = mapFor('oop');
    const ds = mapFor('data-structures');
    const both = mapFor('computer-science');

    expect(oop.track).toBe('oop');
    expect(oop.tree.label).toBe('Object-Oriented Programming');
    expect((oop.tree.children || []).map(node => node.label)).toContain('Encapsulation');
    expect((oop.tree.children || []).map(node => node.label)).not.toContain('Linked List');

    expect(ds.track).toBe('ds');
    expect(ds.tree.label).toBe('Data Structures');
    expect((ds.tree.children || []).map(node => node.label)).toContain('Linked List');
    expect((ds.tree.children || []).map(node => node.label)).not.toContain('Encapsulation');

    expect(both.track).toBe('both');
    expect(both.tree.label).toBe('OOP + Data Structures');
    expect((both.tree.children || []).map(node => node.label)).toEqual(['Object-Oriented Programming', 'Data Structures']);
  });

  it('colors matching weak concepts but does not insert unrelated quiz misses into curriculum maps', () => {
    const now = new Date().toISOString();
    const quizId = db.prepare('INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)')
      .run(userId, null, 'History Quiz', 'medium', now).lastInsertRowid;
    const questionId = db.prepare('INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)')
      .run(quizId, 0, 'What started the French Revolution?', '["A","B","C","D"]', 0, 'History concept.', 'French Revolution').lastInsertRowid;
    const attemptId = db.prepare('INSERT INTO quiz_attempts (quiz_id, user_id, started_at, finished_at, score) VALUES (?,?,?,?,?)')
      .run(quizId, userId, now, now, 0).lastInsertRowid;
    db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, selected_idx, is_correct) VALUES (?,?,?,?)')
      .run(attemptId, questionId, 1, 0);

    const map = learningMaps.buildLearningMap(userId);
    const labels = map.nodes.map(node => node.label);
    const visibleTree = JSON.stringify(map.tree);

    expect(labels).toContain('Linked List');
    expect(map.nodes.find(node => node.label === 'Linked List').type).toBe('weak');
    expect(visibleTree).not.toMatch(/French Revolution/i);
    expect(map.recommendedPath.join(' ')).not.toMatch(/French Revolution/i);
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

    expect(map.rootTopic).toBe('Encapsulation');
    expect(map.rootTopic).not.toMatch(/page|slide|lecture\s*\d*/i);
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
    expect(draft.plan.goalId).toBe('exams');

    const active = studyPlans.approvePlan(userId, draft.id);
    expect(active.status).toBe('active');

    const firstTaskId = active.tasks[0].id;
    const updated = studyPlans.completeTask(userId, firstTaskId);
    expect(updated.tasks.find(t => t.id === firstTaskId).status).toBe('completed');
  });

  it('changes task mix based on the onboarding goal', () => {
    const taskTypesFor = (goal) => {
      db.prepare('UPDATE user_prefs SET goal=?, study_profile_json=? WHERE user_id=?')
        .run(goal, JSON.stringify({ daysPerWeek: 4, minutesPerSession: 50, learningStyle: 'mixed' }), userId);
      return studyPlans.buildPlan(userId).dailyPlan.flatMap(day => day.tasks.map(t => t.type));
    };

    const examTypes = taskTypesFor('exams');
    const understandTypes = taskTypesFor('understand');
    const retainTypes = taskTypesFor('retain');
    const practiceTypes = taskTypesFor('practice');

    expect(examTypes.filter(t => t === 'quiz').length).toBeGreaterThan(examTypes.filter(t => t === 'tutor_session').length);
    expect(understandTypes.filter(t => t === 'tutor_session').length).toBeGreaterThan(understandTypes.filter(t => t === 'quiz').length);
    expect(retainTypes.filter(t => t === 'flashcards').length).toBeGreaterThan(retainTypes.filter(t => t === 'quiz').length);
    expect(practiceTypes.filter(t => t === 'quiz').length).toBeGreaterThan(practiceTypes.filter(t => t === 'flashcards').length);
  });

  it('defaults missing goals to exam-prep behavior', () => {
    db.prepare('UPDATE user_prefs SET goal=NULL, study_profile_json=? WHERE user_id=?').run('{}', userId);

    const plan = studyPlans.buildPlan(userId);
    const taskTypes = plan.dailyPlan.flatMap(day => day.tasks.map(t => t.type));

    expect(plan.goalId).toBe('exams');
    expect(plan.goalProfile.label).toBe('Ace my exams');
    expect(taskTypes.filter(t => t === 'quiz').length).toBeGreaterThan(0);
  });

  it('keeps study plans on the selected curriculum track regardless of uploaded materials', () => {
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

    const draft = studyPlans.createPlan(userId, { materialId });
    const focuses = draft.plan.dailyPlan.map(day => day.focusTopic).join(' ');

    expect(draft.plan.trackId).toBe('ds');
    expect(draft.plan.learningMap.tree.label).toBe('Data Structures');
    expect(draft.plan.learningMap.materialGrounding.curriculum).toBe(true);
    expect(JSON.stringify(draft.plan.learningMap.tree)).not.toMatch(/French Revolution|Causes|Estates|Inequality|Enlightenment/i);
    expect(focuses).toMatch(/Linked List|Array|Stack|Queue|Tree|Graph|Hash|Complexity/i);
    expect(focuses).not.toMatch(/French Revolution|Causes|Estates|Inequality|Enlightenment/i);
  });
});
