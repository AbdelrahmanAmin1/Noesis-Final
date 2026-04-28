# Codex Adversarial Review — Noēsis Backend

> Hand this prompt to Codex (or a second reviewer) once the backend boots cleanly.
> Run from `J:\Noesis final\noesis\` (so paths in the report stay short).

---

## Prompt to Codex

You are an adversarial reviewer for **Noēsis**, a local-first learning app. The backend lives in `backend/` (Node 18 + Express + better-sqlite3 + Ollama). The frontend in `project/` is a static Babel-standalone React 18 app whose components were edited to call the new `project/api.js` (do **not** redesign the UI; the brief mandates "DO NOT change UI").

Constraints I want you to assume:
- **No paid AI APIs** — Ollama only (`llama3.2:3b` + `nomic-embed-text`).
- **MVP scope** — keep changes minimal; do not introduce new abstractions unless they fix a real bug.
- **Local development** — single-process Node, in-memory job queue, SQLite WAL.

Files of interest:
- `backend/server.js`, `backend/config/{env,db}.js`, `backend/middleware/{auth,error,upload,rateLimit}.js`
- `backend/routes/*.routes.js` (auth, user, material, note, flashcard, quiz, tutor, dashboard, video, jobs)
- `backend/services/{auth,material,extract,chunk,rag,ai,srs,tts,slides,video,jobs}.service.js`
- `backend/utils/{jsonSafe,prompts,logger}.js`
- `backend/migrations/001_init.sql`
- `project/api.js` and the edits in `project/components/{Auth,Dashboard,Materials,Tutor,Study,Other,App}.jsx`

Please do all three phases below.

### Phase 1 — Adversarial review (find concrete defects)

Hunt — and report each finding with `file:line` references plus a 1-line repro:

**Security**
- JWT handling: secret default, expiry, header parsing, refresh strategy.
- Password storage: bcrypt cost, timing attacks, password length validation.
- Per-user data scoping: every query returning/mutating user data MUST be filtered by `user_id`. Walk every route file.
- Multer: mime+ext whitelist correctness, randomized filenames, path-traversal guards in `upload.js`, max size enforced (25 MB), multi-part body bombs.
- Path traversal in static file serving (`/api/videos/:id/file`): is `output_path` ever user-influenced? Could the `concept` body field bleed into a filesystem path?
- ffmpeg / Piper / espeak / `say` argument injection — every `spawn(...)` call uses an array (no shell), but any user-controlled string passed as an argument? Especially `slide.title`, `slide.narration`, `slide.bullets`.
- AI JSON parser failure modes (`utils/jsonSafe.js`): what happens with code-fence-only output, malformed nested strings, or a 1 MB blob?
- CORS: `CORS_ORIGIN` defaults to a single origin; check `*` fallback semantics.
- Rate limits applied to all expensive endpoints (`/notes/generate`, `/flashcards/generate`, `/quizzes/generate`, `/tutor/sessions`, `/videos`).
- SQL injection: confirm every query uses prepared statements (no string concat).

**Correctness / functional bugs**
- AI JSON schema mismatches when Ollama returns lowercase booleans, trailing commas, or omits required fields.
- Material ingest: what if extraction returns empty text? Or a single 5 MB chunk with no paragraph breaks?
- RAG fallback when embeddings are missing.
- SRS edge cases (rating boundaries, first-review cards, time-zone correctness on `due_at`).
- Quiz attempt flow: can a user submit answers to questions that don't belong to the attempt's quiz?
- Tutor session: can step `idx` exceed plan length?
- Video pipeline: race when ffmpeg fails mid-run — does the job stay `running` forever?
- Dashboard aggregations: streak calculation, weekly bucket boundary handling, empty-data behavior.
- Frontend: components that read `sessionStorage.getItem('noesis.materialId')` — what if the user navigates directly?

**API surface**
- Are response shapes consistent with what each frontend component expects? (Spot-check `Dashboard.jsx` ↔ `/api/dashboard`, `Materials.jsx` ↔ `/api/materials`, `Quiz` ↔ `/api/quizzes/:id`.)
- Status codes for 401/403/404/409/413/415/422/429.

### Phase 2 — Evaluation

Answer briefly:
1. **Is it production-ready?** Bullet the top 5 reasons it isn't (if applicable).
2. **Is it demo-ready?** Will the smoke flow in `README.md` §Verification complete on a fresh machine with Ollama + ffmpeg installed?
3. **What's missing relative to the brief in `CLAUDE.md`?** Cross-check: Auth ✓ Materials ✓ Notes ✓ Flashcards ✓ Quizzes ✓ Dashboard ✓ Video ✓.

### Phase 3 — Prioritized fix plan

Output a numbered list (max 12 items) ordered by severity. Each item must include:
- Severity: `critical | high | medium | low`
- File path + line range
- One-paragraph fix sketch (no full diff yet)
- Estimated effort: `xs | s | m | l`

Stop after Phase 3. I will apply fixes top-down and re-run the smoke flow.

---

## Definition of done

A `codex-review-report.md` is generated in this directory containing the three phases above. Then I (the implementer) will:

1. Apply critical + high fixes immediately.
2. Apply medium fixes if they touch <3 files each.
3. Defer low fixes to `TODO.md`.
4. Re-run the smoke flow:
   - `npm run dev`
   - sign up → upload sample PDF → generate notes/flashcards/quiz → take quiz → tutor session → generate video → poll job → confirm mp4 plays.
5. Tag the result.

---

## Round 2 — additional surface to review

After the cookie/session migration and the seed-corpus addition, please also check:

- **Cookie flags.** `noesis_session` is `httpOnly`, `sameSite=lax`, `secure` only in production. Confirm CSRF posture is acceptable for the threat model (lax mitigates cross-site POST CSRF in modern browsers; if you disagree, propose CSRF tokens or `sameSite=strict`).
- **Reserved system account.** `users.id=0`, `email='system@noesis.local'`, `password_hash='!'`. Verify:
  - bcrypt cannot validate `'!'` as a password hash (i.e. login is impossible).
  - No code path lets a user create or update a row with `id=0`.
  - `signup` rejects `system@noesis.local`.
  - No route returns chunks/materials with `user_id=0` to non-system callers other than via the tutor RAG fallback (which is intended).
- **Seed pipeline idempotency.** `scripts/seed-tutor-corpus.js` should never duplicate materials when re-run. `runIfNeeded` must do nothing when `materials WHERE user_id=0` already exists.
- **CORS + credentials.** With `credentials: true`, `CORS_ORIGIN` must NOT be `*`. Server should reject if env is misconfigured.
- **Account delete.** `DELETE /api/auth/me` cascades to all user-scoped tables via SQLite FKs. Verify no orphans and that the cookie is cleared on the response.
- **Export endpoint.** `GET /api/auth/export` should not leak data from other users (every query is `WHERE user_id=?`).
- **Rate limiter coverage.** `/auth/signout`, `/courses`, `/jobs` (list), `DELETE /auth/me`, `/auth/export` — confirm globalLimiter is sufficient or recommend tighter ones.
- **Tutor fallback honesty.** When the system corpus is used, the response should make it discoverable (today the chunk citations carry chunk IDs but not provenance). Suggest a small `source: 'system' | 'user-material'` field if you want users to know.
