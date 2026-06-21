'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { z } = require('zod');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-unit-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(tempRoot, 'data');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.DB_PATH = path.join(tempRoot, 'data', 'unit.sqlite');
process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-123456';
process.env.JWT_EXPIRES_IN = '1h';
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
process.env.OLLAMA_GEN_MODEL = process.env.OLLAMA_GEN_MODEL || 'llama3.2:latest';
process.env.OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';

const { extractJson, parseJsonSafe, JsonSafeError } = require('../utils/jsonSafe');
const { chunkText, chunkByChapter, estimateTokens } = require('../services/chunk.service');
const { detectChapters, extractText, _internals: extractInternals } = require('../services/extract.service');
const srs = require('../services/srs.service');
const rag = require('../services/rag.service');
const media = require('../utils/mediaBinaries');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const authSvc = require('../services/auth.service');
const { getDb } = require('../config/db');

test('jsonSafe extracts fenced JSON objects', () => {
  assert.equal(extractJson('```json\n{"ok":true}\n```'), '{"ok":true}');
});

test('jsonSafe extracts arrays after prose', () => {
  assert.equal(extractJson('Answer:\n[{"a":1}]'), '[{"a":1}]');
});

test('jsonSafe returns the largest balanced candidate when earlier brackets are citations', () => {
  assert.equal(extractJson('see [chunk:1] then {"value":3}'), '{"value":3}');
});

test('jsonSafe validates a matching schema', async () => {
  const schema = z.object({ cards: z.array(z.object({ q: z.string() })).length(1) });
  const parsed = await parseJsonSafe('{"cards":[{"q":"What is Big-O?"}]}', schema);
  assert.equal(parsed.cards[0].q, 'What is Big-O?');
});

test('jsonSafe uses repair function for malformed JSON', async () => {
  const schema = z.object({ ok: z.boolean() });
  const parsed = await parseJsonSafe('{ok:true}', schema, async () => '{"ok":true}');
  assert.equal(parsed.ok, true);
});

test('jsonSafe reports no_json_found with 422 status', async () => {
  await assert.rejects(
    () => parseJsonSafe('plain text only'),
    err => err instanceof JsonSafeError && err.status === 422 && err.code === 'no_json_found',
  );
});

test('estimateTokens uses a stable character heuristic', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
});

test('chunkText creates overlapping chunks for long input', () => {
  const text = Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(text, { targetTokens: 35, overlapTokens: 8 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].idx, 0);
  assert.ok(chunks.every(c => c.token_count > 0));
});

test('chunkByChapter preserves chapter indexes', () => {
  const text = '# One\nAlpha paragraph about arrays.\n# Two\nBeta paragraph about stacks.';
  const chapters = detectChapters(text);
  const chunks = chunkByChapter(text, chapters);
  assert.deepEqual([...new Set(chunks.map(c => c.chapter_idx))], [0, 1]);
});

test('detectChapters falls back to a single document chapter', () => {
  const chapters = detectChapters('plain material without headings');
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, 'Document');
});

test('detectChapters detects markdown and numbered headings', () => {
  const chapters = detectChapters('# Intro\nText\n1. Arrays\nMore text');
  assert.equal(chapters.length, 2);
  assert.equal(chapters[1].title, '1. Arrays');
});

test('xmlTextRuns decodes XML text and collapses duplicates', () => {
  const runs = extractInternals.xmlTextRuns('<a:t>A&amp;B</a:t><a:t>A&amp;B</a:t><a:t>C</a:t>');
  assert.deepEqual(runs, ['A&B', 'C']);
});

test('extractText reads plain text files', async () => {
  const file = path.join(tempRoot, 'sample.txt');
  fs.writeFileSync(file, 'Hello\r\n\r\n\r\nNoesis', 'utf8');
  assert.equal(await extractText(file, 'text/plain'), 'Hello\n\nNoesis');
});

test('SRS schedules first good review for one day', () => {
  const next = srs.nextSchedule(null, 3);
  assert.equal(next.reps, 1);
  assert.equal(next.interval_days, 1);
});

test('SRS lowers ease and resets reps for again rating', () => {
  const next = srs.nextSchedule({ ease: 2.5, reps: 4, interval_days: 10 }, 1);
  assert.equal(next.reps, 0);
  assert.ok(next.ease < 2.5);
});

test('SRS increases ease for easy rating', () => {
  const next = srs.nextSchedule({ ease: 2.5, reps: 2, interval_days: 3 }, 4);
  assert.ok(next.ease > 2.5);
  assert.ok(next.interval_days > 3);
});

test('RAG cosine handles identical, orthogonal, and mismatched vectors', () => {
  assert.equal(rag.cosine([1, 0], [1, 0]), 1);
  assert.equal(rag.cosine([1, 0], [0, 1]), 0);
  assert.equal(rag.cosine([1], [1, 2]), 0);
});

test('RAG Float32 buffer round-trip preserves values', () => {
  const original = Float32Array.from([0.25, 0.5, 1]);
  const restored = rag.bufToFloat32(rag.float32ToBuf(original));
  assert.deepEqual(Array.from(restored), Array.from(original));
});

test('media binary resolver keeps explicit paths', () => {
  assert.equal(media.resolveBinary('C:/tools/ffmpeg.exe', 'ffmpeg', 'missing-package'), 'C:/tools/ffmpeg.exe');
});

test('media concat list paths normalize Windows separators and quotes', () => {
  const normalized = media.concatListPath("C:\\tmp\\a'b.mp4");
  assert.ok(normalized.includes('/'));
  assert.ok(normalized.includes("'\\''"));
});

test('upload whitelist includes required document formats', () => {
  for (const ext of ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md']) {
    assert.equal(upload.ALLOWED_EXT.has(ext), true);
  }
});

test('auth signToken and requireAuth accept bearer tokens', () => {
  const token = auth.signToken({ id: 123, email: 'unit@example.com' });
  const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
  let called = false;
  auth.requireAuth(req, {}, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.id, 123);
});

test('auth requireAuth rejects missing tokens', () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  auth.requireAuth({ headers: {}, cookies: {} }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'missing_token');
});

test('auth service rejects reserved system email', async () => {
  await assert.rejects(
    () => authSvc.signup({ email: 'system@noesis.local', password: 'Password123', name: 'System' }),
    err => err.status === 400 && err.message === 'reserved_email',
  );
});

test('auth service creates users, prefs, and seeded concepts', async () => {
  const result = await authSvc.signup({ email: 'unit@example.com', password: 'Password123', name: 'Unit User' });
  assert.ok(result.token);
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(result.user.id);
  const conceptCount = db.prepare('SELECT COUNT(*) AS c FROM concepts WHERE user_id=?').get(result.user.id).c;
  assert.ok(prefs);
  assert.ok(conceptCount >= authSvc.SEED_CONCEPTS.length);
});

test('auth service rejects duplicate emails', async () => {
  await assert.rejects(
    () => authSvc.signup({ email: 'unit@example.com', password: 'Password123', name: 'Again' }),
    err => err.status === 409 && err.message === 'email_exists',
  );
});

test('auth service rejects invalid credentials', async () => {
  await assert.rejects(
    () => authSvc.signin({ email: 'unit@example.com', password: 'wrong-password' }),
    err => err.status === 401 && err.message === 'invalid_credentials',
  );
});

test('auth service updates preferences and exports user-scoped data', async () => {
  const signed = await authSvc.signin({ email: 'unit@example.com', password: 'Password123' });
  const prefs = authSvc.updatePrefs(signed.user.id, { subject: 'Data Structures', daily_minutes: 30 });
  assert.equal(prefs.subject, 'Data Structures');
  const exported = authSvc.exportData(signed.user.id);
  assert.equal(exported.user.email, 'unit@example.com');
  assert.ok(Array.isArray(exported.materials));
});
