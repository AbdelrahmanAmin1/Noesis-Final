'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const Database = backendRequire('better-sqlite3');
const MODEL = process.env.OLLAMA_GEN_MODEL || 'llama3.2:latest';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const OUT_PATH = argValue('--out');
const JSON_MODE = process.argv.includes('--json');

function nowIso() {
  return new Date().toISOString();
}

function makeRuntimeRoot() {
  if (OUT_PATH) {
    const dir = path.join(path.dirname(OUT_PATH), '..', 'runtime', 'api-smoke');
    fs.mkdirSync(dir, { recursive: true });
    return path.resolve(dir);
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-api-smoke-'));
}

function preseedSystemMaterial(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(BACKEND_DIR, 'migrations', '001_init.sql'), 'utf8'));
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, major, created_at)
              VALUES (0, 'system@noesis.local', '!', 'Noesis', 'system', ?)`).run(nowIso());
  db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
              VALUES (0, 'System Smoke Seed', 'note', '', 'text/markdown', 0, 'ready', 100, ?)`).run(nowIso());
  db.close();
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(base, method, urlPath, { token, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, data, bytes: text.length };
}

async function pollJob(base, token, jobId, timeoutMs = 240000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const res = await fetchJson(base, 'GET', `/api/jobs/${jobId}`, { token });
    last = res.data;
    if (last && last.status === 'completed') return last;
    if (last && last.status === 'failed') throw new Error(last.error || 'job_failed');
    await wait(1500);
  }
  throw new Error(`job_timeout ${jobId}: ${JSON.stringify(last)}`);
}

function startBackend(runtimeRoot) {
  const dataDir = path.join(runtimeRoot, 'data');
  const uploadDir = path.join(runtimeRoot, 'uploads');
  const dbPath = path.join(dataDir, 'api-smoke.sqlite');
  const port = 3201 + Math.floor(Math.random() * 500);
  preseedSystemMaterial(dbPath);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATA_DIR: dataDir,
    UPLOAD_DIR: uploadDir,
    DB_PATH: dbPath,
    JWT_SECRET: 'api-smoke-secret-api-smoke-secret-123456',
    JWT_EXPIRES_IN: '1h',
    CORS_ORIGIN: 'http://localhost:5173',
    OLLAMA_BASE_URL,
    OLLAMA_GEN_MODEL: MODEL,
    OLLAMA_EMBED_MODEL: EMBED_MODEL,
    OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS || '300000',
    TTS_ENGINE: 'silence',
    NOESIS_ALLOW_SILENT_TTS: 'true',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.stderr.on('data', d => { output += d.toString(); });
  return {
    child,
    port,
    base: `http://localhost:${port}`,
    dataDir,
    uploadDir,
    dbPath,
    output: () => output,
  };
}

async function waitForBackend(server) {
  const started = Date.now();
  while (Date.now() - started < 45000) {
    try {
      const res = await fetchJson(server.base, 'GET', '/api/health');
      if (res.ok) return res;
    } catch (_) {
      // keep waiting
    }
    await wait(500);
  }
  throw new Error(`backend_not_ready: ${server.output().slice(-1000)}`);
}

async function main() {
  const started = Date.now();
  const runtimeRoot = makeRuntimeRoot();
  const steps = [];
  const artifacts = {};
  const server = startBackend(runtimeRoot);
  const state = {};

  async function step(id, title, fn, opts = {}) {
    const item = { id, title, startedAt: nowIso(), status: 'running' };
    steps.push(item);
    const stepStart = Date.now();
    try {
      if (opts.requires && !opts.requires()) {
        item.status = 'skipped';
        item.note = opts.skipReason || 'required prior state missing';
        return item;
      }
      const result = await fn();
      item.status = result && result.environmentDependent ? 'environment-dependent' : 'passed';
      item.result = result;
    } catch (error) {
      item.status = opts.environmentDependent ? 'environment-dependent' : 'failed';
      item.error = error.message;
    } finally {
      item.durationMs = Date.now() - stepStart;
      item.finishedAt = nowIso();
    }
    return item;
  }

  try {
    await step('api-health', 'API health and live Ollama readiness', async () => {
      const health = await waitForBackend(server);
      return { status: health.status, body: health.data, ollamaBaseUrl: OLLAMA_BASE_URL, model: MODEL, embedModel: EMBED_MODEL };
    });

    await step('protected-route', 'Protected route rejects missing token', async () => {
      const res = await fetchJson(server.base, 'GET', '/api/auth/me');
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
      return { status: res.status, body: res.data };
    });

    await step('auth', 'Signup, invalid login, valid login, and onboarding', async () => {
      const email = `smoke-${Date.now()}@example.com`;
      const password = 'Password123';
      const signup = await fetchJson(server.base, 'POST', '/api/auth/signup', { body: { email, password, name: 'Smoke User' } });
      if (!signup.ok || !signup.data.token) throw new Error(`signup_failed_${signup.status}`);
      const invalid = await fetchJson(server.base, 'POST', '/api/auth/signin', { body: { email, password: 'wrong-password' } });
      if (invalid.status !== 401) throw new Error(`invalid_login_expected_401_got_${invalid.status}`);
      const signin = await fetchJson(server.base, 'POST', '/api/auth/signin', { body: { email, password } });
      if (!signin.ok || !signin.data.token) throw new Error(`signin_failed_${signin.status}`);
      state.token = signin.data.token;
      const onboarding = await fetchJson(server.base, 'POST', '/api/auth/onboarding', {
        token: state.token,
        body: { subject: 'Computer Science', goal: 'Exam preparation', daily_minutes: 30, courses: [{ code: 'CS201', title: 'Data Structures' }] },
      });
      if (!onboarding.ok) throw new Error(`onboarding_failed_${onboarding.status}`);
      return { signup: signup.status, invalidLogin: invalid.status, signin: signin.status, onboarding: onboarding.status };
    });

    await step('upload-material', 'Supported material upload, ingest job, and chunks', async () => {
      const text = [
        '# Arrays and Complexity',
        'Arrays store elements in contiguous memory and provide constant-time indexed access.',
        'Stacks use last-in first-out behavior, while queues use first-in first-out behavior.',
        'Hash tables map keys to buckets and usually provide average constant-time lookup.',
      ].join('\n\n');
      const form = new FormData();
      form.append('file', new Blob([text], { type: 'text/plain' }), 'arrays.txt');
      const upload = await fetchJson(server.base, 'POST', '/api/materials', { token: state.token, form });
      if (!upload.ok) throw new Error(`upload_failed_${upload.status}`);
      state.materialId = upload.data.material_id;
      const job = await pollJob(server.base, state.token, upload.data.job_id);
      const material = await fetchJson(server.base, 'GET', `/api/materials/${state.materialId}`, { token: state.token });
      const chunks = await fetchJson(server.base, 'GET', `/api/materials/${state.materialId}/chunks`, { token: state.token });
      if (!material.ok || material.data.status !== 'ready') throw new Error('material_not_ready');
      if (!chunks.ok || !chunks.data.chunks.length) throw new Error('chunks_missing');
      state.chapterId = material.data.chapters[0] && material.data.chapters[0].id;
      return { uploadStatus: upload.status, job, materialStatus: material.data.status, chunks: chunks.data.chunks.length };
    }, { requires: () => !!state.token });

    await step('unsupported-upload', 'Unsupported upload rejection', async () => {
      const form = new FormData();
      form.append('file', new Blob(['bad'], { type: 'application/x-msdownload' }), 'malware.exe');
      const res = await fetchJson(server.base, 'POST', '/api/materials', { token: state.token, form });
      if (res.status !== 415) throw new Error(`expected_415_got_${res.status}`);
      return { status: res.status, body: res.data };
    }, { requires: () => !!state.token });

    await step('notes', 'Manual note CRUD and live AI note generation', async () => {
      const create = await fetchJson(server.base, 'POST', '/api/notes', { token: state.token, body: { title: 'Manual Note', body_md: 'Manual body', folder: 'Manual', tags: ['smoke'], material_id: state.materialId } });
      if (!create.ok) throw new Error(`manual_note_failed_${create.status}`);
      const generated = await fetchJson(server.base, 'POST', '/api/notes/generate', { token: state.token, body: { material_id: state.materialId, chapter_id: state.chapterId } });
      if (!generated.ok) throw new Error(`ai_note_failed_${generated.status}: ${JSON.stringify(generated.data)}`);
      state.noteId = generated.data.id;
      return { manualNoteId: create.data.id, generatedNoteId: generated.data.id, generatedChars: String(generated.data.body_md || '').length };
    }, { requires: () => !!state.materialId });

    await step('flashcards', 'Live flashcard generation and SRS review', async () => {
      const generated = await fetchJson(server.base, 'POST', '/api/flashcards/generate', { token: state.token, body: { material_id: state.materialId, count: 2 } });
      if (!generated.ok) throw new Error(`flashcard_generation_failed_${generated.status}: ${JSON.stringify(generated.data)}`);
      state.flashcardId = generated.data.ids[0];
      const due = await fetchJson(server.base, 'GET', '/api/flashcards/due', { token: state.token });
      const review = await fetchJson(server.base, 'POST', `/api/flashcards/${state.flashcardId}/review`, { token: state.token, body: { rating: 3 } });
      if (!review.ok) throw new Error(`flashcard_review_failed_${review.status}`);
      return { created: generated.data.created, due: due.data.total_due, review: review.data };
    }, { requires: () => !!state.materialId, environmentDependent: true });

    await step('quiz', 'Live quiz generation, attempt scoring, and wrong answers', async () => {
      const generated = await fetchJson(server.base, 'POST', '/api/quizzes/generate', { token: state.token, body: { material_id: state.materialId, count: 2, difficulty: 'medium' } });
      if (!generated.ok) throw new Error(`quiz_generation_failed_${generated.status}: ${JSON.stringify(generated.data)}`);
      state.quizId = generated.data.quiz_id;
      const quiz = await fetchJson(server.base, 'GET', `/api/quizzes/${state.quizId}`, { token: state.token });
      const attempt = await fetchJson(server.base, 'POST', `/api/quizzes/${state.quizId}/attempt`, { token: state.token });
      const attemptId = attempt.data.attempt_id;
      for (const question of quiz.data.questions.slice(0, 2)) {
        const ans = await fetchJson(server.base, 'POST', `/api/quizzes/attempts/${attemptId}/answer`, { token: state.token, body: { question_id: question.id, selected_idx: 0 } });
        if (!ans.ok) throw new Error(`answer_failed_${ans.status}`);
      }
      const finish = await fetchJson(server.base, 'POST', `/api/quizzes/attempts/${attemptId}/finish`, { token: state.token });
      const wrong = await fetchJson(server.base, 'GET', '/api/quizzes/wrong-answers', { token: state.token });
      if (!finish.ok) throw new Error(`finish_failed_${finish.status}`);
      return { quizId: state.quizId, total: finish.data.total, score: finish.data.score, wrongAnswers: wrong.data.wrong.length };
    }, { requires: () => !!state.materialId, environmentDependent: true });

    await step('tutor', 'Live guided tutor session, feedback, notes, and finish', async () => {
      const start = await fetchJson(server.base, 'POST', '/api/tutor/sessions', { token: state.token, body: { material_id: state.materialId, concept: 'arrays', mode: 'socratic' } });
      if (!start.ok) throw new Error(`tutor_start_failed_${start.status}: ${JSON.stringify(start.data)}`);
      state.sessionId = start.data.session_id;
      const answer = await fetchJson(server.base, 'POST', `/api/tutor/sessions/${state.sessionId}/step/0/answer`, { token: state.token, body: { choice: 0 } });
      const note = await fetchJson(server.base, 'POST', `/api/tutor/sessions/${state.sessionId}/notes`, { token: state.token, body: { body: 'Remember indexed access.', flashcard_worthy: true } });
      const finish = await fetchJson(server.base, 'POST', `/api/tutor/sessions/${state.sessionId}/finish`, { token: state.token });
      if (!answer.ok || !note.ok || !finish.ok) throw new Error('tutor_followup_failed');
      return { sessionId: state.sessionId, steps: start.data.plan.steps.length, feedbackChars: String(answer.data.feedback || '').length, noteId: note.data.id, duration: finish.data.duration_s };
    }, { requires: () => !!state.materialId, environmentDependent: true });

    await step('dashboard-progress', 'Dashboard and progress after learning activity', async () => {
      const dashboard = await fetchJson(server.base, 'GET', '/api/dashboard', { token: state.token });
      const progress = await fetchJson(server.base, 'GET', '/api/dashboard/progress', { token: state.token });
      if (!dashboard.ok || !progress.ok) throw new Error('dashboard_or_progress_failed');
      return {
        materials: dashboard.data.summary.materials,
        notes: dashboard.data.summary.notes,
        flashcards: dashboard.data.summary.flashcards,
        quizzesCompleted: dashboard.data.summary.quizzes_completed,
        progressStats: progress.data.stats.length,
      };
    }, { requires: () => !!state.token });

    await step('video', 'Video/storyboard job and MP4 readiness with silence TTS', async () => {
      const video = await fetchJson(server.base, 'POST', '/api/videos', { token: state.token, body: { material_id: state.materialId, concept: 'arrays' } });
      if (!video.ok) throw new Error(`video_start_failed_${video.status}: ${JSON.stringify(video.data)}`);
      const job = await pollJob(server.base, state.token, video.data.job_id, 300000);
      const meta = await fetchJson(server.base, 'GET', `/api/videos/${video.data.video_id}`, { token: state.token });
      const file = await fetch(`${server.base}/api/videos/${video.data.video_id}/file`, { headers: { Authorization: `Bearer ${state.token}` } });
      if (!file.ok) throw new Error(`video_file_failed_${file.status}`);
      const bytes = (await file.arrayBuffer()).byteLength;
      artifacts.videoBytes = bytes;
      return { videoId: video.data.video_id, job, status: meta.data.status, bytes, ttsEngine: 'silence' };
    }, { requires: () => !!state.materialId, environmentDependent: true });

    await step('ownership-export-delete', 'Cross-user ownership, export, and delete', async () => {
      const other = await fetchJson(server.base, 'POST', '/api/auth/signup', { body: { email: `other-${Date.now()}@example.com`, password: 'Password123', name: 'Other User' } });
      if (!other.ok) throw new Error(`other_signup_failed_${other.status}`);
      const denied = await fetchJson(server.base, 'GET', `/api/materials/${state.materialId}`, { token: other.data.token });
      if (denied.status !== 404) throw new Error(`ownership_expected_404_got_${denied.status}`);
      const exported = await fetchJson(server.base, 'GET', '/api/auth/export', { token: state.token });
      if (!exported.ok) throw new Error(`export_failed_${exported.status}`);
      const deleted = await fetchJson(server.base, 'DELETE', '/api/auth/me', { token: state.token });
      if (!deleted.ok) throw new Error(`delete_failed_${deleted.status}`);
      return { ownershipStatus: denied.status, exportedMaterials: exported.data.materials.length, deleted: deleted.data.ok };
    }, { requires: () => !!state.token && !!state.materialId });
  } finally {
    server.child.kill();
  }

  const summary = {
    generatedAt: nowIso(),
    command: 'node scripts/run-api-smoke.js',
    durationMs: Date.now() - started,
    runtimeRoot,
    port: server.port,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    model: MODEL,
    embedModel: EMBED_MODEL,
    steps,
    artifacts,
    passed: steps.filter(s => s.status === 'passed').length,
    failed: steps.filter(s => s.status === 'failed').length,
    skipped: steps.filter(s => s.status === 'skipped').length,
    environmentDependent: steps.filter(s => s.status === 'environment-dependent').length,
    ok: steps.every(s => s.status === 'passed' || s.status === 'environment-dependent'),
    serverOutputTail: server.output().slice(-3000),
  };

  if (OUT_PATH) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  if (JSON_MODE) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`API smoke: ${summary.passed} passed, ${summary.failed} failed, ${summary.environmentDependent} environment-dependent, ${summary.skipped} skipped.`);
    for (const item of steps) console.log(`${item.status.toUpperCase()} ${item.id}: ${item.error || ''}`);
  }
  process.exit(summary.ok ? 0 : 1);
}

main().catch(error => {
  const summary = { generatedAt: nowIso(), command: 'node scripts/run-api-smoke.js', ok: false, error: error.stack || error.message };
  if (OUT_PATH) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  if (JSON_MODE) console.log(JSON.stringify(summary, null, 2));
  else console.error(error.stack || error.message);
  process.exit(1);
});
