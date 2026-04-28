# Noēsis Backend

Local-first learning backend for the Noēsis frontend. Express + SQLite + Ollama.
**No paid AI APIs — all generation runs against a local Ollama instance.**

---

## 1. Prerequisites

| Tool      | Why                              | Install |
|-----------|----------------------------------|---------|
| Node ≥ 18.17 | Server runtime                | https://nodejs.org |
| Ollama    | Local LLM + embeddings           | https://ollama.com/download |
| ffmpeg    | Video assembly                   | https://ffmpeg.org/download.html (Windows: scoop/choco; macOS: `brew install ffmpeg`; Linux: `apt install ffmpeg`) |
| Piper *(optional, recommended)* | Offline TTS for narration | https://github.com/rhasspy/piper/releases — also download a voice (e.g. `en_US-amy-low.onnx`) |
| espeak-ng *(fallback)* | Backup TTS if Piper isn't installed | `apt install espeak-ng` / `brew install espeak` |

After installing Ollama:

```bash
ollama serve                  # leave running
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

---

## 2. Setup

```bash
cd backend
npm install
cp .env.example .env          # then edit JWT_SECRET, TTS_VOICE_PATH, FFMPEG_PATH if needed
npm run seed                  # one-time: ingest the built-in DS + OOP curriculum
npm run dev                   # http://localhost:3001
```

The seed step ingests `backend/seed/{oop,ds}/*.md` as system materials owned by `user_id=0` (a reserved, non-loginable account). The first `npm run dev` will also auto-seed if no system materials exist. Use `npm run seed:force` to re-ingest after editing the markdown files.

### Authentication

Auth uses an **httpOnly session cookie** (`noesis_session`, `SameSite=Lax`, 7-day expiry). The frontend automatically sends it via `credentials: 'include'`. For curl/test use, the same JWT is also returned in the JSON body and accepted as `Authorization: Bearer <token>`.

The SQLite database and `uploads/` folders are auto-created on first run.

### Frontend

The frontend is a static React 18 app in `../project/`. Serve it on any static origin matching `CORS_ORIGIN`:

```bash
cd ../project
npx serve -l 5173
# open http://localhost:5173/Noesis.html
```

You can override the API base URL by setting `window.NOESIS_API_BASE` before `api.js` loads (defaults to `http://localhost:3001`).

---

## 3. Endpoints

> All `/api/*` endpoints (except `/api/health`, `/api/auth/signin`, `/api/auth/signup`) require `Authorization: Bearer <jwt>`.

### Auth & user
- `POST /api/auth/signup` — `{ email, password, name }` → `{ token, user }` (sets cookie)
- `POST /api/auth/signin` — `{ email, password }` → `{ token, user }` (sets cookie)
- `POST /api/auth/signout` — clears cookie
- `POST /api/auth/onboarding` — `{ subject, courses[], goal, daily_minutes }`
- `GET  /api/auth/me`
- `DELETE /api/auth/me` — delete account + all user-scoped data
- `GET  /api/auth/export` — JSON dump of all your data
- `GET/PUT /api/user/prefs`
- `GET/POST /api/courses` · `DELETE /api/courses/:id`

### Materials (RAG ingest)
- `GET  /api/materials`
- `POST /api/materials` — multipart upload, field `file` (PDF/DOCX/DOC/TXT/MD ≤ 25 MB) → `{ material_id, job_id }` (202 Accepted)
- `GET  /api/materials/:id`
- `GET  /api/materials/:id/chunks?chapter=<chapter_id>`
- `DELETE /api/materials/:id`

### Notes
- `GET/POST /api/notes` · `GET/PUT/DELETE /api/notes/:id`
- `POST /api/notes/generate` — `{ material_id, chapter_id?, query? }` (RAG → Ollama → markdown note)

### Flashcards
- `GET  /api/flashcards/due`
- `POST /api/flashcards/generate` — `{ material_id, count }`
- `POST /api/flashcards/:id/review` — `{ rating: 1|2|3|4 }` (SM-2)

### Quizzes
- `GET  /api/quizzes` — list user quizzes
- `POST /api/quizzes/generate` — `{ material_id, count, difficulty }`
- `GET  /api/quizzes/:id`
- `POST /api/quizzes/:id/attempt` → `{ attempt_id }`
- `POST /api/quizzes/attempts/:id/answer` — `{ question_id, selected_idx }`
- `POST /api/quizzes/attempts/:id/finish` → `{ score, correct, total, wrong[] }`
- `GET  /api/quizzes/wrong-answers`

### Tutor (Socratic / Explain / Example)
- `GET  /api/tutor/sessions` — list user sessions
- `POST /api/tutor/sessions` — `{ material_id?, concept, mode }` → 5-step plan with MCQ. If no `material_id` (or RAG returns 0 chunks), the tutor falls back to the seeded DS+OOP curriculum.
- `GET  /api/tutor/sessions/:id`
- `POST /api/tutor/sessions/:id/step/:idx/answer` — `{ choice | text }`
- `POST /api/tutor/sessions/:id/notes` — `{ body, flashcard_worthy }`
- `POST /api/tutor/sessions/:id/finish`

### Dashboard / progress
- `GET /api/dashboard`
- `GET /api/dashboard/progress`

### Video (mandatory pipeline)
- `POST /api/videos` — `{ material_id, concept }` → `{ video_id, job_id }` (queued)
- `GET  /api/videos/:id`
- `GET  /api/videos/:id/file` (mp4 stream)

### Jobs / health
- `GET /api/jobs` — list current user's jobs
- `GET /api/jobs/:id`
- `GET /api/health` — `{ ok, ollama, env }` (5s in-process cache)

---

## 4. Video Pipeline

`POST /api/videos` enqueues a sequential job:

1. **Script** — RAG retrieves top chunks for the concept; Ollama generates a JSON script (`{ slides:[{ title, bullets, narration }] }`) which is schema-validated.
2. **Audio** — Per-slide narration → `tts.service`. Engines tried in order based on `TTS_ENGINE`: Piper → espeak-ng → `say` (macOS).
3. **Slides** — `node-canvas` renders 1280×720 PNGs (Fraunces title, Geist body, dark background, accent purple). If `canvas` isn't installed, a colored placeholder PNG is generated by ffmpeg's `lavfi`.
4. **Combine** — Per slide: ffmpeg encodes `image + audio` → `seg_N.mp4`. All segments concatenated → `uploads/videos/<id>.mp4`.

Artifacts are persisted between steps; failed jobs surface via `/api/jobs/:id`.

---

## 5. Troubleshooting

- **`ollama_404 / model not found`** — run `ollama pull llama3.2:3b` and `ollama pull nomic-embed-text`.
- **`tts_no_engine_available`** — install Piper (recommended) or `espeak-ng`. Set `TTS_VOICE_PATH` to a downloaded Piper voice file.
- **`ffmpeg_*` errors** — make sure `ffmpeg` is on PATH or set `FFMPEG_PATH` in `.env`.
- **Slides render as a flat color** — the `canvas` package failed to build. On Windows install windows-build-tools, on Linux `apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev`.
- **`better-sqlite3` build errors** — `npm rebuild better-sqlite3` after installing Visual Studio Build Tools (Windows) or `xcode-select --install` (macOS).

---

## 6. Layout

```
backend/
├── server.js              # express bootstrap
├── config/                # env + db (auto-migrate)
├── middleware/            # auth, error, upload, rateLimit
├── routes/                # one file per resource
├── controllers/           # (thin — handlers live inline in routes for MVP)
├── services/              # auth, material, extract, chunk, rag, ai, srs, tts, slides, video, jobs
├── utils/                 # logger, jsonSafe, prompts
├── migrations/001_init.sql
├── data/noesis.sqlite     # gitignored
└── uploads/{materials,audio,slides,videos}/
```

See `ASSUMPTIONS.md` and `TODO.md` for known gaps and next steps.
