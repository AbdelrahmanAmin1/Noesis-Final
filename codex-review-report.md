# Noesis Adversarial Review

## Phase 1 - Adversarial Review

### Security Findings

1. **Default JWT secret is usable in development and can leak into real deployments** - `backend/config/env.js:11`, `backend/middleware/auth.js:11`, `backend/middleware/auth.js:20`.
   Repro: start without `.env`, sign up, then forge a token with `noesis-dev-secret-change-me` and call any protected endpoint.

2. **JWT handling has no refresh/revocation strategy and uses a 7-day bearer token stored in `localStorage`** - `backend/config/env.js:12`, `project/api.js:1`, `project/api.js:8`, `project/api.js:19`, `backend/TODO.md:20`.
   Repro: steal `localStorage['noesis.token']` from the browser console and replay it for up to `JWT_EXPIRES_IN`.

3. **Signin has a user-enumeration timing side channel and password length is unbounded** - `backend/services/auth.service.js:12`, `backend/services/auth.service.js:28`, `backend/services/auth.service.js:30`.
   Repro: compare response time for a nonexistent email versus an existing email with a wrong very long password.

4. **Manual notes can reference another user's material because `material_id` is inserted without ownership validation** - `backend/routes/note.routes.js:30`, `backend/routes/note.routes.js:33`, `backend/routes/note.routes.js:35`.
   Repro: as user B, `POST /api/notes` with `{ "title":"x", "material_id": <user A material id> }`; the note is accepted.

5. **Generated notes can use a chapter title from another user's material** - `backend/routes/note.routes.js:76`, `backend/routes/note.routes.js:78`.
   Repro: as user B, call `/api/notes/generate` with your own `material_id` and user A's `chapter_id`; the title lookup is not scoped to the owned material.

6. **Material upload accepts MIME or extension instead of requiring both to match, and unsupported upload errors become 500 instead of 415** - `backend/middleware/upload.js:32`, `backend/middleware/upload.js:34`, `backend/middleware/upload.js:37`, `backend/middleware/error.js:18`.
   Repro: upload `evil.pdf` with `text/html`; it passes because `.pdf` is whitelisted. Upload `.exe`; `err.status=415` is ignored and the handler returns `500 internal_error`.

7. **Multipart body limits are incomplete** - `backend/middleware/upload.js:42`, `backend/middleware/upload.js:45`.
   Repro: send many form fields/parts with a small file; only `fileSize` is bounded, not `files`, `parts`, `fields`, or `headerPairs`.

8. **Video file streaming trusts `output_path` from SQLite without resolving it under the video upload directory** - `backend/routes/video.routes.js:36`, `backend/routes/video.routes.js:37`, `backend/routes/video.routes.js:39`, `backend/services/video.service.js:128`, `backend/services/video.service.js:131`.
   Repro: if local DB state is tampered so an owned `videos.output_path` points elsewhere, `/api/videos/:id/file` streams that path.

9. **Video playback is broken by auth/header mismatch** - `project/api.js:114`, `project/components/Materials.jsx:201`, `project/components/Materials.jsx:339`, `backend/routes/video.routes.js:34`.
   Repro: generate a video; `<video src="/api/videos/:id/file">` does not send `Authorization: Bearer ...`, so the protected route returns 401 and the MP4 will not play.

10. **AI JSON repair can amplify large malformed outputs into another expensive model call and still returns 500 on schema failure** - `backend/utils/jsonSafe.js:37`, `backend/utils/jsonSafe.js:40`, `backend/utils/jsonSafe.js:55`, `backend/utils/jsonSafe.js:60`, `backend/utils/prompts.js:74`.
    Repro: make Ollama return a code fence with no JSON or a large malformed JSON blob; the repair prompt receives the full raw text, then parse/schema failure bubbles as 500.

11. **CORS `*` reflects any origin when configured** - `backend/server.js:15`, `backend/config/env.js:14`.
    Repro: set `CORS_ORIGIN=*`; any browser origin can call the API with an explicit bearer token. This is not cookie-auth exploitable because `credentials:false`, but it broadens token replay surface.

12. **Rate limits cover listed AI endpoints but not material ingest, which can trigger many embeddings** - `backend/routes/note.routes.js:71`, `backend/routes/flashcard.routes.js:45`, `backend/routes/quiz.routes.js:27`, `backend/routes/tutor.routes.js:27`, `backend/routes/video.routes.js:14`, `backend/routes/material.routes.js:15`.
    Repro: repeatedly upload large PDFs; each accepted file can enqueue many embedding calls under only the global 300/15m limiter.

13. **SQL injection review: no direct SQL injection found in route inputs** - queries use `better-sqlite3` placeholders throughout, e.g. `backend/routes/quiz.routes.js:100`, `backend/services/material.service.js:31`. The only dynamic SQL field list in `backend/services/video.service.js:74` is built from internal keys, not request input.

14. **Process-spawn review: no shell injection found, but user/model text is passed to TTS processes and can still cause argument-length failures** - `backend/services/video.service.js:48`, `backend/services/tts.service.js:11`, `backend/services/tts.service.js:27`, `backend/services/tts.service.js:39`, `backend/services/video.service.js:110`.
    Repro: generate a slide with very long narration; `espeak-ng`/`say` receive narration as a process argument, not stdin, and may fail even though shell injection is avoided.

### Correctness / Functional Findings

1. **Fresh smoke flow with only Ollama + ffmpeg will fail at video TTS** - `backend/services/tts.service.js:51`, `backend/services/tts.service.js:61`, `backend/services/tts.service.js:62`, `backend/services/tts.service.js:63`, `backend/README.md:15`, `backend/README.md:16`.
   Repro: on Windows with Ollama + ffmpeg but no Piper voice and no `espeak-ng`, generate a video; the job fails with `tts_no_engine_available`.

2. **Material ingest marks empty extractions as `ready`** - `backend/services/extract.service.js:6`, `backend/services/extract.service.js:19`, `backend/services/material.service.js:79`, `backend/services/material.service.js:93`, `backend/services/material.service.js:107`.
   Repro: upload a scanned PDF that extracts to `""`; status becomes `ready`, chunks are empty, and generation proceeds from no source context.

3. **RAG does not fall back when query embedding succeeds but chunk embeddings are missing** - `backend/services/rag.service.js:47`, `backend/services/rag.service.js:50`, `backend/services/rag.service.js:51`, `backend/services/rag.service.js:64`.
   Repro: ingest while `nomic-embed-text` is unavailable so chunk embeddings stay null, then enable embeddings and generate notes; all chunk scores are 0 and the result context is empty.

4. **SRS intervals never truly progress because `reps` is not persisted or selected** - `backend/services/srs.service.js:13`, `backend/routes/flashcard.routes.js:77`, `backend/migrations/001_init.sql:102`.
   Repro: review the same card "Good" multiple times; `prev.reps` is always absent, so it schedules as a first review repeatedly.

5. **Quiz attempts allow duplicate answers and unchecked answer indices, which can distort scores** - `backend/routes/quiz.routes.js:96`, `backend/routes/quiz.routes.js:102`, `backend/routes/quiz.routes.js:103`, `backend/routes/quiz.routes.js:115`, `backend/migrations/001_init.sql:149`.
   Repro: submit the same correct `question_id` to one attempt multiple times, then finish; duplicate rows inflate `COUNT(*)` and `SUM(is_correct)`.

6. **Tutor sessions allow jumping to future steps and set `current_step` one past the plan length** - `backend/routes/tutor.routes.js:73`, `backend/routes/tutor.routes.js:85`, `backend/routes/tutor.routes.js:86`, `project/components/Tutor.jsx:195`.
   Repro: call `/api/tutor/sessions/:id/step/4/answer` immediately; `current_step` becomes 5 even if earlier steps are unanswered.

7. **Dashboard date math mixes local week buckets with UTC ISO day keys** - `backend/routes/dashboard.routes.js:11`, `backend/routes/dashboard.routes.js:19`, `backend/routes/dashboard.routes.js:23`, `backend/routes/dashboard.routes.js:37`, `backend/routes/dashboard.routes.js:48`.
   Repro: record a study event around local midnight in Africa/Cairo; streak and weekly bucket can disagree because one path uses UTC day strings and another uses local midnight.

8. **Dashboard resume cards navigate to `material` without setting `noesis.materialId`** - `project/components/Dashboard.jsx:78`, `project/components/Dashboard.jsx:79`, `project/components/Materials.jsx:161`.
   Repro: click "Pick up where you left" after login with no prior material in sessionStorage; the material page has id `0` and never loads.

9. **Direct navigation to material or quiz routes produces dead screens rather than redirecting to a valid list** - `project/components/App.jsx:6`, `project/components/App.jsx:7`, `project/components/Materials.jsx:161`, `project/components/Materials.jsx:164`, `project/components/Study.jsx:285`, `project/components/Study.jsx:286`.
   Repro: set `localStorage['noesis.route']='material'` and reload; no material id exists, so the page remains in a loading/no-op state.

10. **Video job failure is handled during pipeline errors, but in-memory jobs are lost on process restart while DB rows can remain `processing`** - `backend/services/video.service.js:133`, `backend/services/video.service.js:136`, `backend/services/jobs.service.js:5`, `backend/ASSUMPTIONS.md:4`, `backend/ASSUMPTIONS.md:5`.
    Repro: restart the server during a video job; `/api/jobs/:id` returns 404 and the `videos` row may still say `processing`.

11. **AI schema mismatches are mostly fatal instead of user-actionable** - `backend/routes/flashcard.routes.js:18`, `backend/routes/quiz.routes.js:17`, `backend/routes/tutor.routes.js:17`, `backend/services/video.service.js:18`, `backend/utils/jsonSafe.js:67`.
    Repro: make Ollama omit `correct_idx` or return 3 options; repair fails schema validation and the user sees a generic 500, not a 422 with retry guidance.

12. **Frontend still contains static/mock content that can misrepresent API-backed state** - `project/components/Dashboard.jsx:34`, `project/components/Dashboard.jsx:35`, `project/components/Study.jsx:91`, `project/components/Study.jsx:117`, `project/components/Tutor.jsx:246`.
    Repro: load a real note; mock sections like "Core intuition" and static tutor notebook entries remain visible around the generated content.

### API Surface / Status Codes

- `Dashboard.jsx` expects `greeting`, `weekly_hours`, `due_review_preview`, `resume_items`, `concept_map`, `upcoming`, and `insights`; `/api/dashboard` supplies those shapes (`backend/routes/dashboard.routes.js:81`, `project/components/Dashboard.jsx:14`).
- `Materials.jsx` expects `{ materials }`, material detail with `chapters`, and `{ chunks }`; the routes match those shapes (`backend/routes/material.routes.js:12`, `backend/services/material.service.js:34`, `backend/routes/material.routes.js:33`).
- `Quiz` expects `{ quiz, questions }`, then `{ attempt_id }`, then answer feedback; the quiz routes match those shapes (`backend/routes/quiz.routes.js:78`, `backend/routes/quiz.routes.js:89`, `backend/routes/quiz.routes.js:105`).
- Status code gaps: auth returns 401, ownership uses 403 in jobs only, not-found uses 404, duplicate email uses 409, file size uses 413, rate limits produce 429 through middleware, but 415 upload errors are currently converted to 500 and 422 is not used for validation/model schema failures (`backend/middleware/error.js:18`, `backend/middleware/upload.js:37`, `backend/utils/jsonSafe.js:67`).

## Phase 2 - Evaluation

1. **Is it production-ready?** No.
   - Default JWT secret and localStorage bearer tokens are not acceptable for production auth.
   - Upload validation is MIME/extension permissive and multipart limits are incomplete.
   - AI/JSON failure modes return generic 500s and can trigger expensive repair calls.
   - Jobs are in-memory, so material/video job state is not durable.
   - Several ownership and data-integrity checks are missing around related ids (`material_id`, `chapter_id`, `course_id`).

2. **Is it demo-ready?** Not reliably. The smoke flow is likely to fail at "confirm mp4 plays" because the `<video>` tag cannot send the JWT header to `/api/videos/:id/file`. On a fresh machine with only Ollama + ffmpeg, video generation can also fail earlier because no guaranteed TTS engine is installed. Also, `npm run dev` only exists in `backend/package.json`; from the repository root there is no `package.json`.

3. **What's missing relative to `CLAUDE.md`?**
   - Auth: present, but local password only; OAuth buttons are visual stubs, refresh/password-reset are absent.
   - Materials: present, but scanned PDFs/OCR and empty-extraction handling are missing.
   - Notes: present, but manual note ownership validation is incomplete and static mock note sections remain in the UI.
   - Flashcards: present, but SRS scheduling is functionally broken because review repetitions are not persisted.
   - Quizzes: present, but duplicate answer submissions can corrupt attempt scores.
   - Dashboard: present, but concept mastery is not populated automatically; TODO confirms concept extraction is not wired.
   - Video: pipeline exists, but demo prerequisites and playback auth make the end-to-end flow unreliable.

## Phase 3 - Prioritized Fix Plan

1. **Severity: critical** - `project/api.js:111-114`, `project/components/Materials.jsx:198-201`, `project/components/Materials.jsx:338-339`, `backend/routes/video.routes.js:34-39`.
   Fix sketch: make video playback work with auth. Minimal options: fetch the MP4 as a blob through `NoesisAPI` with the bearer header and set `<video src={URL.createObjectURL(blob)}>`, or add a short-lived signed playback token endpoint and validate that token in `/file`. Keep the current protected metadata route. Effort: `s`.

2. **Severity: critical** - `backend/services/tts.service.js:48-63`, `backend/services/video.service.js:110-120`, `backend/README.md:15-16`.
   Fix sketch: make the video smoke flow succeed with only ffmpeg by adding a deterministic fallback that creates a silent WAV of reasonable duration when no local TTS engine is available, or make TTS a hard documented prerequisite. For demo-readiness, the silent fallback is the smaller code fix. Effort: `s`.

3. **Severity: high** - `backend/middleware/upload.js:32-45`, `backend/middleware/error.js:18-26`.
   Fix sketch: require extension and MIME to agree for known types, keep randomized filenames, add `limits.files=1`, `limits.parts`, `limits.fields`, and `limits.headerPairs`, and teach `errorHandler` to honor `err.status`/`err.message` for multer validation so unsupported files return 415. Effort: `s`.

4. **Severity: high** - `backend/services/rag.service.js:43-65`.
   Fix sketch: if the query embedding succeeds but no chunk has a valid embedding or all cosine scores are below threshold, fall back to keyword overlap or the first `k` chunks. Do not let missing embeddings silently produce empty context for ready materials. Effort: `s`.

5. **Severity: high** - `backend/services/material.service.js:79-107`, `backend/services/extract.service.js:6-19`.
   Fix sketch: after extraction and cleaning, reject empty or near-empty text before chapter/chunk creation. Mark the material/job failed with a clear `no_extractable_text` error so scanned PDFs do not become hallucination-ready materials. Effort: `xs`.

6. **Severity: high** - `backend/services/srs.service.js:11-29`, `backend/routes/flashcard.routes.js:77-81`, `backend/migrations/001_init.sql:102-113`.
   Fix sketch: persist `reps` in `flashcard_reviews` or derive it from prior review count, select it with `ease` and `interval_days`, and align first-review intervals with UI labels or update the labels. Existing DBs need a safe additive migration. Effort: `m`.

7. **Severity: high** - `backend/routes/note.routes.js:30-36`, `backend/routes/note.routes.js:76-80`, `backend/services/material.service.js:57-64`, `backend/migrations/001_init.sql:35-48`.
   Fix sketch: validate `material_id`, `chapter_id`, and `course_id` against the current user before inserting or using them. For chapters, join through `materials` or query by `chapters.id` plus `materials.user_id`. Add a foreign key for `materials.course_id` if keeping course linkage. Effort: `s`.

8. **Severity: medium** - `backend/config/env.js:11-12`, `backend/middleware/auth.js:7-20`, `backend/services/auth.service.js:25-31`.
   Fix sketch: fail fast in production if `JWT_SECRET` is default/short, normalize bearer parsing, add a maximum password length, and run a dummy bcrypt compare for missing users to flatten signin timing. Refresh tokens can stay TODO for MVP but should be explicit. Effort: `s`.

9. **Severity: medium** - `backend/utils/jsonSafe.js:37-67`, `backend/routes/flashcard.routes.js:55`, `backend/routes/quiz.routes.js:38`, `backend/routes/tutor.routes.js:40`, `backend/services/video.service.js:86`.
   Fix sketch: cap raw model text passed into repair, map parse/schema failures to a 422 `ai_schema_invalid`, and include safe details such as the missing top-level field. Keep the single repair attempt; do not add more retries. Effort: `s`.

10. **Severity: medium** - `backend/routes/quiz.routes.js:93-123`, `backend/migrations/001_init.sql:149-157`.
    Fix sketch: validate `selected_idx` is 0-3, prevent duplicate answers per `(attempt_id, question_id)` with either an upsert/update or a unique index, and compute finish stats over the latest answer per question. Effort: `s`.

11. **Severity: medium** - `project/components/Dashboard.jsx:78-79`, `project/components/Materials.jsx:161-170`, `project/components/Study.jsx:284-291`.
    Fix sketch: when navigating from dashboard resume, store the selected material id first. If `MaterialDetail` or `Quiz` loads without a valid id, redirect to `materials` or show a clear empty state with a button back to the source list. Effort: `xs`.

12. **Severity: low** - `project/Noesis.html:7-23`, `backend/TODO.md:18-21`, `backend/ASSUMPTIONS.md:23-25`.
    Fix sketch: document that the static frontend requires internet for Google Fonts, React, Babel, and Three CDNs, or vendor those assets locally if "local-first" must include offline UI boot. This is not an API blocker but matters for demos without network. Effort: `m`.
