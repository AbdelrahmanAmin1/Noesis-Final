'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');

const BACKEND_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(BACKEND_DIR, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-integration-'));
const port = 3101 + Math.floor(Math.random() * 400);
const base = `http://localhost:${port}`;
const dataDir = path.join(tempRoot, 'data');
const uploadDir = path.join(tempRoot, 'uploads');
const dbPath = path.join(dataDir, 'integration.sqlite');
let server;
let serverOutput = '';

function preseedSystemMaterial() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(BACKEND_DIR, 'migrations', '001_init.sql'), 'utf8'));
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, major, created_at)
              VALUES (0, 'system@noesis.local', '!', 'Noesis', 'system', ?)`).run(new Date().toISOString());
  db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
              VALUES (0, 'System Smoke Seed', 'note', '', 'text/markdown', 0, 'ready', 100, ?)`).run(new Date().toISOString());
  db.close();
}

function startServer() {
  preseedSystemMaterial();
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATA_DIR: dataDir,
    UPLOAD_DIR: uploadDir,
    DB_PATH: dbPath,
    JWT_SECRET: 'integration-test-secret-integration-test-secret',
    JWT_EXPIRES_IN: '1h',
    CORS_ORIGIN: 'http://localhost:5173',
    NOESIS_DEMO_MODE: 'false',
    AI_PROVIDER: 'ollama',
    NOTES_PROVIDER: 'ollama',
    SUMMARY_PROVIDER: 'ollama',
    VIDEO_SCRIPT_PROVIDER: 'ollama',
    TUTOR_PROVIDER: 'ollama',
    TUTOR_FALLBACK_PROVIDER: 'ollama',
    FLASHCARD_PROVIDER: 'ollama',
    FLASHCARD_FALLBACK_PROVIDER: 'ollama',
    TUTOR_ASYNC_START: 'false',
    TUTOR_STRICT_QUALITY: 'false',
    STRICT_QUALITY_GATES: 'false',
    STORYBOARD_REVIEW_REQUIRED: 'false',
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    OLLAMA_GEN_MODEL: process.env.OLLAMA_GEN_MODEL || 'llama3.2:latest',
    OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest',
    OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS || '300000',
    TTS_ENGINE: 'silence',
    NOESIS_ALLOW_SILENT_TTS: 'true',
  };
  server = spawn(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => { serverOutput += d.toString(); });
  server.stderr.on('data', d => { serverOutput += d.toString(); });
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 45000) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return res.json();
    } catch (_) {
      // keep waiting
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`server did not become healthy: ${serverOutput.slice(-1000)}`);
}

async function request(method, urlPath, { token, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, data };
}

async function pollJob(token, jobId, timeoutMs = 180000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    const res = await request('GET', `/api/jobs/${jobId}`, { token });
    last = res.data;
    if (last && last.status === 'completed') return last;
    if (last && last.status === 'failed') throw new Error(last.error || 'job_failed');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`job_timeout: ${JSON.stringify(last)}`);
}

test.before(async () => {
  startServer();
  await waitForHealth();
});

test.after(() => {
  if (server) server.kill();
});

test('live backend API workflow with isolated storage and live Ollama', async (t) => {
  const email = `integration-${Date.now()}@example.com`;
  const password = 'Password123';
  let token;
  let materialId;
  let chapterId;
  let noteId;
  let flashcardId;
  let quizId;
  let attemptId;
  let sessionId;

  await t.test('health reports API readiness', async () => {
    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
  });

  await t.test('protected route rejects missing token', async () => {
    const res = await request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  await t.test('signup creates account and token', async () => {
    const res = await request('POST', '/api/auth/signup', { body: { email, password, name: 'Integration User' } });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
    token = res.data.token;
  });

  await t.test('invalid login is rejected', async () => {
    const res = await request('POST', '/api/auth/signin', { body: { email, password: 'wrong-password' } });
    assert.equal(res.status, 401);
  });

  await t.test('valid login succeeds', async () => {
    const res = await request('POST', '/api/auth/signin', { body: { email, password } });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
    token = res.data.token;
  });

  await t.test('onboarding stores courses and preferences', async () => {
    const res = await request('POST', '/api/auth/onboarding', {
      token,
      body: {
        subject: 'Computer Science',
        goal: 'Exam preparation',
        daily_minutes: 30,
        courses: [{ code: 'CS201', title: 'Data Structures', professor: 'Noesis' }],
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.prefs.subject, 'Computer Science');
  });

  await t.test('course CRUD works for current user', async () => {
    const create = await request('POST', '/api/courses', { token, body: { code: 'CS301', title: 'OOP', professor: 'Noesis' } });
    assert.equal(create.status, 200);
    const list = await request('GET', '/api/courses', { token });
    assert.equal(list.status, 200);
    assert.ok(list.data.courses.some(c => c.code === 'CS301'));
  });

  await t.test('supported text material uploads and processes', async () => {
    const text = [
      '# Arrays and Complexity',
      'Arrays store elements in contiguous memory and provide constant-time indexed access.',
      'Stacks use last-in first-out behavior, while queues use first-in first-out behavior.',
      'Hash tables use hashing to map keys to buckets and usually provide average constant-time lookup.',
    ].join('\n\n');
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), 'arrays.txt');
    const upload = await request('POST', '/api/materials', { token, form });
    assert.equal(upload.status, 202);
    materialId = upload.data.material_id;
    await pollJob(token, upload.data.job_id);
    const material = await request('GET', `/api/materials/${materialId}`, { token });
    assert.equal(material.status, 200);
    assert.equal(material.data.status, 'ready');
    chapterId = material.data.chapters[0] && material.data.chapters[0].id;
  });

  await t.test('unsupported file upload is rejected', async () => {
    const form = new FormData();
    form.append('file', new Blob(['bad'], { type: 'application/x-msdownload' }), 'malware.exe');
    const res = await request('POST', '/api/materials', { token, form });
    assert.equal(res.status, 415);
  });

  await t.test('material chunks are readable', async () => {
    const res = await request('GET', `/api/materials/${materialId}/chunks`, { token });
    assert.equal(res.status, 200);
    assert.ok(res.data.chunks.length >= 1);
  });

  await t.test('manual note CRUD works', async () => {
    const create = await request('POST', '/api/notes', { token, body: { title: 'Manual Note', body_md: 'Manual body', folder: 'Manual', tags: ['test'], material_id: materialId } });
    assert.equal(create.status, 200);
    noteId = create.data.id;
    const update = await request('PUT', `/api/notes/${noteId}`, { token, body: { body_md: 'Updated body' } });
    assert.equal(update.status, 200);
    const get = await request('GET', `/api/notes/${noteId}`, { token });
    assert.equal(get.status, 200);
    assert.equal(get.data.body_md, 'Updated body');
  });

  await t.test('AI note generation returns a stored note', async () => {
    const res = await request('POST', '/api/notes/generate', { token, body: { material_id: materialId, chapter_id: chapterId } });
    assert.equal(res.status, 200);
    assert.ok(res.data.id);
    assert.ok(String(res.data.body_md || '').length > 20);
  });

  await t.test('flashcards generate and review scheduling updates', async () => {
    const generated = await request('POST', '/api/flashcards/generate', { token, body: { material_id: materialId, count: 2 } });
    assert.equal(generated.status, 200);
    assert.ok(generated.data.created >= 1);
    flashcardId = generated.data.ids[0];
    const due = await request('GET', '/api/flashcards/due', { token });
    assert.equal(due.status, 200);
    assert.ok(due.data.total_due >= 1);
    const review = await request('POST', `/api/flashcards/${flashcardId}/review`, { token, body: { rating: 3 } });
    assert.equal(review.status, 200);
    assert.equal(review.data.reps, 1);
  });

  await t.test('invalid flashcard rating is rejected', async () => {
    const res = await request('POST', `/api/flashcards/${flashcardId}/review`, { token, body: { rating: 9 } });
    assert.equal(res.status, 400);
  });

  await t.test('quiz generation, attempt, duplicate answer update, and finish work', async () => {
    const generated = await request('POST', '/api/quizzes/generate', { token, body: { material_id: materialId, count: 2, difficulty: 'medium' } });
    assert.equal(generated.status, 200);
    quizId = generated.data.quiz_id;
    const quiz = await request('GET', `/api/quizzes/${quizId}`, { token });
    assert.equal(quiz.status, 200);
    assert.ok(quiz.data.questions.length >= 2);
    attemptId = (await request('POST', `/api/quizzes/${quizId}/attempt`, { token })).data.attempt_id;
    const first = quiz.data.questions[0];
    const second = quiz.data.questions[1];
    const firstAnswer = await request('POST', `/api/quizzes/attempts/${attemptId}/answer`, { token, body: { question_id: first.id, selected_idx: 0 } });
    assert.equal(firstAnswer.status, 200);
    const duplicate = await request('POST', `/api/quizzes/attempts/${attemptId}/answer`, { token, body: { question_id: first.id, selected_idx: 1 } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error, 'answer_already_submitted');
    const secondAnswer = await request('POST', `/api/quizzes/attempts/${attemptId}/answer`, { token, body: { question_id: second.id, selected_idx: 0 } });
    assert.equal(secondAnswer.status, 200);
    const finish = await request('POST', `/api/quizzes/attempts/${attemptId}/finish`, { token });
    assert.equal(finish.status, 200);
    assert.equal(finish.data.total, 2);
    assert.ok(finish.data.score >= 0 && finish.data.score <= 100);
  });

  await t.test('tutor guided session answers, notes, and finish work', async () => {
    const start = await request('POST', '/api/tutor/sessions', { token, body: { material_id: materialId, concept: 'arrays', mode: 'socratic' } });
    assert.equal(start.status, 200);
    sessionId = start.data.session_id;
    assert.equal(start.data.plan.steps.length, 5);
    const answer = await request('POST', `/api/tutor/sessions/${sessionId}/step/0/answer`, { token, body: { choice: 0 } });
    assert.equal(answer.status, 200);
    assert.ok(answer.data.feedback);
    const note = await request('POST', `/api/tutor/sessions/${sessionId}/notes`, { token, body: { body: 'Remember indexed access.', flashcard_worthy: true } });
    assert.equal(note.status, 200);
    const finish = await request('POST', `/api/tutor/sessions/${sessionId}/finish`, { token });
    assert.equal(finish.status, 200);
  });

  await t.test('dashboard and progress reflect activity', async () => {
    const dashboard = await request('GET', '/api/dashboard', { token });
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.data.summary.materials >= 1);
    assert.ok(dashboard.data.summary.notes >= 1);
    const progress = await request('GET', '/api/dashboard/progress', { token });
    assert.equal(progress.status, 200);
    assert.ok(Array.isArray(progress.data.stats));
  });

  await t.test('cross-user material ownership is enforced', async () => {
    const other = await request('POST', '/api/auth/signup', { body: { email: `other-${Date.now()}@example.com`, password, name: 'Other User' } });
    assert.equal(other.status, 200);
    const denied = await request('GET', `/api/materials/${materialId}`, { token: other.data.token });
    assert.equal(denied.status, 404);
  });

  await t.test('account export contains user-owned records', async () => {
    const exported = await request('GET', '/api/auth/export', { token });
    assert.equal(exported.status, 200);
    assert.ok(exported.data.materials.some(m => m.id === materialId));
  });

  await t.test('account deletion clears current user', async () => {
    const deleted = await request('DELETE', '/api/auth/me', { token });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.ok, true);
    const me = await request('GET', '/api/auth/me', { token });
    assert.equal(me.status, 404);
  });
});
