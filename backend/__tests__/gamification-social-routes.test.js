'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'gamification-social-routes.test.sqlite');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'test-secret-key-for-vitest';
process.env.DB_PATH = TEST_DB_PATH;
process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
process.env.TTS_ENGINE = 'silence';
process.env.NOESIS_ALLOW_SILENT_TTS = 'true';

function cleanupDb() {
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch (_) {}
}

const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/gamification', require('../routes/gamification.routes'));
  app.use('/api/leaderboards', require('../routes/leaderboard.routes'));
  app.use('/api/users', require('../routes/user-search.routes'));
  app.use('/api/friends', require('../routes/friend.routes'));
  app.use('/api/rooms', require('../routes/room.routes'));
  app.use('/api/quizzes', require('../routes/quiz.routes'));
  app.use('/api/flashcards', require('../routes/flashcard.routes'));
  app.use('/api/study', require('../routes/study.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('gamification and social API routes', () => {
  let app;
  let db;

  beforeAll(() => {
    cleanupDb();
    migrate();
    db = getDb();
    app = buildApp();
  });

  afterAll(() => cleanupDb());

  async function signup(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: `${slug}-${Date.now()}-${Math.random()}@test.com`, password: 'TestPass123!', name });
    expect(res.status).toBe(200);
    return { user: res.body.user, token: res.body.token };
  }

  function auth(token) {
    return { Authorization: `Bearer ${token}` };
  }

  function createQuiz(userId, title = 'Stacks Quiz', correctIdx = 0) {
    const now = new Date().toISOString();
    const quizId = db.prepare('INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)')
      .run(userId, null, title, 'medium', now).lastInsertRowid;
    const questionIds = [];
    for (let i = 0; i < 5; i++) {
      const id = db.prepare('INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)')
        .run(
          quizId,
          i,
          `Question ${i + 1}`,
          JSON.stringify(['Correct', 'Wrong A', 'Wrong B', 'Wrong C']),
          correctIdx,
          'Because this is the correct option.',
          i % 2 ? 'Stack' : 'Big O'
        ).lastInsertRowid;
      questionIds.push(id);
    }
    return { quizId, questionIds };
  }

  function createFlashcards(userId, count = 6) {
    const ids = [];
    const now = new Date().toISOString();
    for (let i = 0; i < count; i++) {
      ids.push(db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(userId, null, 'Practice', `Card ${i + 1}?`, `Answer ${i + 1}`, 'easy', 'Stacks', null, now).lastInsertRowid);
    }
    return ids;
  }

  function createStudyTask(userId) {
    const now = new Date().toISOString();
    const planId = db.prepare('INSERT INTO study_plans (user_id, title, goal, status, plan_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(userId, 'Route Test Plan', 'Practice', 'active', JSON.stringify({ dailyPlan: [] }), now, now).lastInsertRowid;
    return db.prepare('INSERT INTO study_plan_tasks (plan_id, day, task_order, task_json, status) VALUES (?,?,?,?,?)')
      .run(planId, 1, 0, JSON.stringify({ type: 'quiz', title: 'Finish checkpoint' }), 'pending').lastInsertRowid;
  }

  function createNote(userId) {
    const now = new Date().toISOString();
    return db.prepare('INSERT INTO notes (user_id, material_id, folder, title, body_md, tags_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(userId, null, 'General', 'Shared Stack Notes', 'Stacks use last-in-first-out behavior.', '[]', now, now).lastInsertRowid;
  }

  it('protects all new API route groups instead of falling through to not_found', async () => {
    for (const pathToCheck of ['/api/gamification/summary', '/api/leaderboards/weekly', '/api/friends', '/api/rooms']) {
      const res = await request(app).get(pathToCheck);
      expect(res.status).toBe(401);
      expect(res.body.error).not.toBe('not_found');
    }
  });

  it('awards quiz XP, high-score XP, and blocks duplicate finish XP', async () => {
    const { user, token } = await signup('Quiz Route Student');
    const { quizId, questionIds } = createQuiz(user.id);

    const attempt = await request(app).post(`/api/quizzes/${quizId}/attempt`).set(auth(token));
    expect(attempt.status).toBe(200);

    for (const questionId of questionIds) {
      const answer = await request(app)
        .post(`/api/quizzes/attempts/${attempt.body.attempt_id}/answer`)
        .set(auth(token))
        .send({ question_id: questionId, selected_idx: 0 });
      expect(answer.status).toBe(200);
      expect(answer.body.is_correct).toBe(true);
    }

    const finish = await request(app).post(`/api/quizzes/attempts/${attempt.body.attempt_id}/finish`).set(auth(token));
    expect(finish.status).toBe(200);
    expect(finish.body.score).toBe(100);
    expect(finish.body.reward.points).toBe(50);
    expect(finish.body.reward.events).toEqual(['quiz_finished', 'quiz_high_score']);

    const duplicate = await request(app).post(`/api/quizzes/attempts/${attempt.body.attempt_id}/finish`).set(auth(token));
    expect(duplicate.status).toBe(409);

    const summary = await request(app).get('/api/gamification/summary').set(auth(token));
    expect(summary.status).toBe(200);
    expect(summary.body.xp.total_xp).toBe(50);
    expect(summary.body.xp.level).toBe(1);
    expect(summary.body.achievements.all.find(a => a.code === 'quiz_starter').unlocked).toBe(true);

    const weekly = await request(app).get('/api/leaderboards/weekly').set(auth(token));
    expect(weekly.status).toBe(200);
    expect(weekly.body.leaderboard.find(r => r.user_id === user.id).xp).toBe(50);
  });

  it('caps flashcard review XP at 15 per day and records daily goal progress', async () => {
    const { token } = await signup('Flashcard Route Student');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    const cardIds = createFlashcards(me.body.user.id, 6);

    const rewards = [];
    for (const cardId of cardIds) {
      const res = await request(app).post(`/api/flashcards/${cardId}/review`).set(auth(token)).send({ rating: 4 });
      expect(res.status).toBe(200);
      rewards.push(res.body.reward && res.body.reward.points);
    }

    expect(rewards).toEqual([3, 3, 3, 3, 3, null]);
    const summary = await request(app).get('/api/gamification/summary').set(auth(token));
    expect(summary.body.xp.total_xp).toBe(15);
    expect(summary.body.daily_goal.completed_xp).toBe(15);
    expect(summary.body.recent_events.filter(e => e.event_type === 'flashcard_reviewed')).toHaveLength(5);
  });

  it('awards study task XP once through the study route', async () => {
    const { token } = await signup('Study Plan Route Student');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    const taskId = createStudyTask(me.body.user.id);

    const first = await request(app).post(`/api/study/tasks/${taskId}/complete`).set(auth(token));
    expect(first.status).toBe(200);
    expect(first.body.study_plan.reward.points).toBe(20);
    expect(first.body.study_plan.gamification.xp.total_xp).toBe(20);

    const duplicate = await request(app).post(`/api/study/tasks/${taskId}/complete`).set(auth(token));
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.study_plan.reward).toBeNull();
    expect(duplicate.body.study_plan.gamification.xp.total_xp).toBe(20);
  });

  it('handles friends, rooms, sharing, messages, activity, room leaderboard, and share XP', async () => {
    const owner = await signup('Owner Route Student');
    const member = await signup('Member Route Student');

    const search = await request(app).get(`/api/users/search?q=${encodeURIComponent(member.user.email)}`).set(auth(owner.token));
    expect(search.status).toBe(200);
    expect(search.body.users[0].display_name).toBe('Member Route Student');
    expect(search.body.users[0].email).toBeUndefined();

    const req = await request(app).post('/api/friends/request').set(auth(owner.token)).send({ recipient_id: member.user.id });
    expect(req.status).toBe(201);

    const duplicateRequest = await request(app).post('/api/friends/request').set(auth(owner.token)).send({ recipient_id: member.user.id });
    expect(duplicateRequest.status).toBe(409);

    const accepted = await request(app).post(`/api/friends/requests/${req.body.id}/accept`).set(auth(member.token));
    expect(accepted.status).toBe(200);

    const friends = await request(app).get('/api/friends').set(auth(owner.token));
    expect(friends.status).toBe(200);
    expect(friends.body.friends.map(f => f.user_id)).toContain(member.user.id);

    const friendsBoard = await request(app).get('/api/leaderboards/friends').set(auth(owner.token));
    expect(friendsBoard.status).toBe(200);
    expect(friendsBoard.body.leaderboard.map(r => r.user_id)).toContain(member.user.id);

    const createdRoom = await request(app)
      .post('/api/rooms')
      .set(auth(owner.token))
      .send({ name: 'DS Route Room', subject: 'Data Structures', room_type: 'invite-only' });
    expect(createdRoom.status).toBe(201);
    expect(createdRoom.body.room.invite_code).toBeTruthy();

    const joined = await request(app).post('/api/rooms/join-by-code').set(auth(member.token)).send({ code: createdRoom.body.room.invite_code });
    expect(joined.status).toBe(200);
    expect(joined.body.room.user_role).toBe('member');

    const message = await request(app)
      .post(`/api/rooms/${createdRoom.body.room.id}/messages`)
      .set(auth(member.token))
      .send({ body: 'Ready to review stacks.' });
    expect(message.status).toBe(201);

    const noteId = createNote(owner.user.id);
    const { quizId } = createQuiz(owner.user.id, 'Shared Route Quiz');

    const sharedNote = await request(app).post(`/api/rooms/${createdRoom.body.room.id}/share-note`).set(auth(owner.token)).send({ note_id: noteId });
    expect(sharedNote.status).toBe(201);

    const sharedQuiz = await request(app).post(`/api/rooms/${createdRoom.body.room.id}/share-quiz`).set(auth(owner.token)).send({ quiz_id: quizId });
    expect(sharedQuiz.status).toBe(201);

    const cloned = await request(app).post(`/api/rooms/${createdRoom.body.room.id}/shared-quizzes/${sharedQuiz.body.id}/start`).set(auth(member.token));
    expect(cloned.status).toBe(201);
    expect(cloned.body.quiz_id).toBeGreaterThan(0);

    const detail = await request(app).get(`/api/rooms/${createdRoom.body.room.id}`).set(auth(owner.token));
    expect(detail.status).toBe(200);
    expect(detail.body.members.map(m => m.user_id)).toEqual(expect.arrayContaining([owner.user.id, member.user.id]));
    expect(detail.body.activity.map(a => a.activity_type)).toEqual(expect.arrayContaining(['room_created', 'member_joined', 'note_shared', 'quiz_shared']));

    const messages = await request(app).get(`/api/rooms/${createdRoom.body.room.id}/messages`).set(auth(owner.token));
    expect(messages.status).toBe(200);
    expect(messages.body.messages[0].body).toBe('Ready to review stacks.');

    const roomBoard = await request(app).get(`/api/rooms/${createdRoom.body.room.id}/leaderboard`).set(auth(owner.token));
    expect(roomBoard.status).toBe(200);
    expect(roomBoard.body.leaderboard.map(r => r.user_id)).toEqual(expect.arrayContaining([owner.user.id, member.user.id]));

    const summary = await request(app).get('/api/gamification/summary').set(auth(owner.token));
    expect(summary.body.xp.total_xp).toBe(20);
    expect(summary.body.recent_events.map(e => e.event_type)).toEqual(expect.arrayContaining(['note_shared', 'quiz_shared']));
    expect(summary.body.achievements.all.find(a => a.code === 'room_leader').unlocked).toBe(true);
    expect(summary.body.achievements.all.find(a => a.code === 'study_buddy').unlocked).toBe(true);
  });
});
