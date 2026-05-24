PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  leaderboard_opt_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_xp (
  user_id INTEGER PRIMARY KEY,
  total_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  room_id INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_events_user_time ON xp_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_events_type ON xp_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_events_room ON xp_events(room_id, created_at);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Star',
  criteria_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_id INTEGER NOT NULL,
  unlocked_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, unlocked_at);

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id INTEGER PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_date TEXT NOT NULL,
  target_xp INTEGER NOT NULL DEFAULT 60,
  target_tasks INTEGER NOT NULL DEFAULT 3,
  completed_xp INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  tasks_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, goal_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_date ON daily_goals(user_id, goal_date);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (requester_id <> recipient_id),
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient ON friend_requests(recipient_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester_id, status, created_at);

CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

CREATE TABLE IF NOT EXISTS study_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  room_type TEXT NOT NULL DEFAULT 'public',
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (room_type IN ('public', 'private', 'invite-only'))
);
CREATE INDEX IF NOT EXISTS idx_study_rooms_owner ON study_rooms(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_study_rooms_type ON study_rooms(room_type, archived_at, updated_at);

CREATE TABLE IF NOT EXISTS study_room_members (
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  last_seen_at TEXT,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (role IN ('owner', 'moderator', 'member'))
);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON study_room_members(user_id, joined_at);

CREATE TABLE IF NOT EXISTS study_room_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  user_id INTEGER,
  activity_type TEXT NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_room_activity_room_time ON study_room_activity(room_id, created_at);

CREATE TABLE IF NOT EXISTS study_room_shared_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  note_id INTEGER NOT NULL,
  shared_by INTEGER NOT NULL,
  title_snapshot TEXT NOT NULL,
  body_md_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shared_notes_room ON study_room_shared_notes(room_id, created_at);

CREATE TABLE IF NOT EXISTS study_room_shared_quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  quiz_id INTEGER NOT NULL,
  shared_by INTEGER NOT NULL,
  title_snapshot TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shared_quizzes_room ON study_room_shared_quizzes(room_id, created_at);

CREATE TABLE IF NOT EXISTS study_room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_room_messages_room_time ON study_room_messages(room_id, created_at);

INSERT OR IGNORE INTO achievements (code, name, description, category, icon, criteria_json) VALUES
  ('first_upload', 'First Upload', 'Uploaded your first learning material.', 'learning', 'Upload', '{"event":"material_uploaded","count":1}'),
  ('quiz_starter', 'Quiz Starter', 'Finished your first quiz attempt.', 'practice', 'Target', '{"event":"quiz_finished","count":1}'),
  ('flashcard_grinder', 'Flashcard Grinder', 'Reviewed 10 flashcards.', 'practice', 'Cards', '{"reviews":10}'),
  ('comeback_learner', 'Comeback Learner', 'Recovered a weak topic through practice.', 'mastery', 'Bolt', '{"event":"weak_topic_improved","count":1}'),
  ('seven_day_streak', '7-Day Streak', 'Studied for seven days in a row.', 'streak', 'Flame', '{"streak":7}'),
  ('oop_explorer', 'OOP Explorer', 'Made progress on object-oriented programming topics.', 'topic', 'Cube', '{"topic":"oop"}'),
  ('data_structures_climber', 'Data Structures Climber', 'Made progress on data structures topics.', 'topic', 'Tree', '{"topic":"data_structures"}'),
  ('bug_hunter', 'Bug Hunter', 'Reviewed mistakes from quiz practice.', 'practice', 'Search', '{"wrong_answers":1}'),
  ('study_buddy', 'Study Buddy', 'Connected with another learner.', 'social', 'Users', '{"friends":1}'),
  ('room_leader', 'Room Leader', 'Created your first study room.', 'social', 'Globe', '{"rooms_owned":1}');

INSERT OR IGNORE INTO user_profiles (user_id, display_name, leaderboard_opt_out, created_at, updated_at)
SELECT id, COALESCE(NULLIF(TRIM(name), ''), 'Student ' || id), 0, created_at, created_at FROM users;

INSERT OR IGNORE INTO user_xp (user_id, total_xp, level, updated_at)
SELECT id, 0, 1, created_at FROM users;

INSERT OR IGNORE INTO user_streaks (user_id, current_streak, best_streak, last_activity_date, updated_at)
SELECT id, 0, 0, NULL, created_at FROM users;

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT user_id, 'material_uploaded', 10, 'material', id, NULL, 'backfill:material_uploaded:' || id, '{"backfill":true}', created_at
FROM materials
WHERE status='ready';

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT user_id, 'notes_generated', 10, 'note', id, NULL, 'backfill:notes_generated:' || id, '{"backfill":true}', created_at
FROM notes;

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT user_id, 'quiz_finished', 20, 'quiz_attempt', id, NULL, 'backfill:quiz_finished:' || id, '{"backfill":true}', finished_at
FROM quiz_attempts
WHERE finished_at IS NOT NULL;

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT user_id, 'quiz_high_score', 30, 'quiz_attempt', id, NULL, 'backfill:quiz_high_score:' || id, '{"backfill":true}', finished_at
FROM quiz_attempts
WHERE finished_at IS NOT NULL AND score >= 80;

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT user_id, 'ai_tutor_session_completed', 25, 'tutor_session', id, NULL, 'backfill:ai_tutor_session_completed:' || id, '{"backfill":true}', ended_at
FROM tutor_sessions
WHERE ended_at IS NOT NULL OR status='completed';

INSERT OR IGNORE INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
SELECT p.user_id, 'study_task_completed', 20, 'study_plan_task', t.id, NULL, 'backfill:study_task_completed:' || t.id, '{"backfill":true}', t.completed_at
FROM study_plan_tasks t
JOIN study_plans p ON p.id=t.plan_id
WHERE t.completed_at IS NOT NULL OR t.status='completed';

UPDATE user_xp
SET total_xp = COALESCE((SELECT SUM(points) FROM xp_events WHERE xp_events.user_id = user_xp.user_id), 0),
    updated_at = datetime('now');
