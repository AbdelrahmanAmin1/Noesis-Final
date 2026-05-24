'use strict';

const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'gamification-social.test.sqlite');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'test-secret-key-for-vitest';
process.env.DB_PATH = TEST_DB_PATH;
process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
process.env.TTS_ENGINE = 'silence';
process.env.NOESIS_ALLOW_SILENT_TTS = 'true';

function cleanupSocialTestDb() {
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch (_) {}
}

const { migrate, getDb } = require('../config/db');
const gamification = require('../services/gamification.service');
const friends = require('../services/friend.service');
const rooms = require('../services/room.service');
const leaderboards = require('../services/leaderboard.service');

describe('gamification and social services', () => {
  let db;

  beforeAll(() => {
    cleanupSocialTestDb();
    migrate();
    db = getDb();
  });

  beforeEach(() => {
    db.exec(`
      DELETE FROM study_room_messages;
      DELETE FROM study_room_shared_quizzes;
      DELETE FROM study_room_shared_notes;
      DELETE FROM study_room_activity;
      DELETE FROM study_room_members;
      DELETE FROM study_rooms;
      DELETE FROM friendships;
      DELETE FROM friend_requests;
      DELETE FROM user_achievements;
      DELETE FROM xp_events;
      DELETE FROM daily_goals;
      DELETE FROM user_streaks;
      DELETE FROM user_xp;
      DELETE FROM user_profiles;
      DELETE FROM quiz_answers;
      DELETE FROM quiz_questions;
      DELETE FROM quiz_attempts;
      DELETE FROM quizzes;
      DELETE FROM notes;
      DELETE FROM flashcard_reviews;
      DELETE FROM flashcards;
      DELETE FROM study_plan_tasks;
      DELETE FROM study_plans;
      DELETE FROM concepts;
      DELETE FROM user_prefs;
      DELETE FROM users;
    `);
  });

  afterAll(() => cleanupSocialTestDb());

  function createUser(name) {
    const id = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random()}@test.com`, 'hash', name, new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO user_prefs (user_id, subject, daily_minutes) VALUES (?,?,?)').run(id, 'data-structures', 45);
    gamification.ensureUser(id);
    return id;
  }

  it('awards XP once per idempotency key and unlocks achievements', () => {
    const userId = createUser('Ada');
    const first = gamification.award(userId, 'material_uploaded', 'material', 101);
    const duplicate = gamification.award(userId, 'material_uploaded', 'material', 101);
    const boost = gamification.award(userId, 'room_help', 'manual', 1, { points: 390 });
    const summary = gamification.getSummary(userId);

    expect(first.awarded).toBe(true);
    expect(duplicate.awarded).toBe(false);
    expect(boost.awarded).toBe(true);
    expect(summary.xp.total_xp).toBe(400);
    expect(summary.xp.level).toBe(3);
    expect(summary.achievements.all.find(a => a.code === 'first_upload').unlocked).toBe(true);
  });

  it('handles friend requests without exposing private email data', () => {
    const ada = createUser('Ada Lovelace');
    const grace = createUser('Grace Hopper');

    const results = friends.searchUsers(ada, 'grace');
    expect(results[0].display_name).toBe('Grace Hopper');
    expect(results[0].email).toBeUndefined();

    const req = friends.sendRequest(ada, grace);
    expect(() => friends.acceptRequest(ada, req.id)).toThrow(/not_request_recipient/);
    expect(friends.acceptRequest(grace, req.id).ok).toBe(true);
    expect(friends.listFriends(ada)).toHaveLength(1);
    expect(leaderboards.friends(ada).leaderboard.map(r => r.user_id)).toContain(grace);
  });

  it('creates rooms, shares learning assets, and starts shared quiz challenges', () => {
    const owner = createUser('Owner Student');
    const member = createUser('Member Student');
    const noteId = db.prepare('INSERT INTO notes (user_id, material_id, folder, title, body_md, tags_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(owner, null, 'General', 'Stack Notes', 'Stacks are LIFO.', '[]', new Date().toISOString(), new Date().toISOString()).lastInsertRowid;
    const quizId = db.prepare('INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)')
      .run(owner, null, 'Stack Quiz', 'medium', new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)')
      .run(quizId, 0, 'What does LIFO mean?', JSON.stringify(['Last in first out', 'First in first out', 'Sorted', 'Random']), 0, 'Stacks pop the newest item.', 'Stack');

    const created = rooms.createRoom(owner, { name: 'DS Sprint', subject: 'Data Structures', room_type: 'invite-only' });
    const joined = rooms.joinByCode(member, created.room.invite_code);
    const sharedNote = rooms.shareNote(owner, created.room.id, noteId);
    const sharedQuiz = rooms.shareQuiz(owner, created.room.id, quizId);
    const cloned = rooms.startSharedQuiz(member, created.room.id, sharedQuiz.id);
    const roomBoard = leaderboards.room(owner, created.room.id).leaderboard;
    const detail = rooms.getRoom(owner, created.room.id);

    expect(joined.room.user_role).toBe('member');
    expect(sharedNote.id).toBeGreaterThan(0);
    expect(cloned.quiz_id).toBeGreaterThan(0);
    expect(roomBoard[0].display_name).toBe('Owner Student');
    expect(detail.activity.some(a => a.activity_type === 'note_shared')).toBe(true);
    expect(detail.shared_quizzes[0].title_snapshot).toBe('Stack Quiz');
  });
});
