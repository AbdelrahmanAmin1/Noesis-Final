# Noesis Core Features Report

## Project Overview

Noesis is an intelligent learning workspace for computer science students, focused on Object-Oriented Programming, Data Structures, algorithms, and uploaded course material. The system combines a static React frontend, a Node.js/Express backend, SQLite persistence, retrieval-augmented generation, local model support through Ollama, optional Groq model routing, spaced repetition, quiz feedback, tutor sessions, study planning, and AI-generated learning videos.

The application is designed as a learning loop:

1. The user signs up and completes onboarding.
2. The user uploads learning material.
3. The backend extracts, chunks, embeds, and indexes the content.
4. AI features use retrieved chunks plus seeded CS curriculum knowledge.
5. Notes, flashcards, quizzes, tutor sessions, videos, dashboards, and study plans update the learner's progress.
6. Assessment results and study events update mastery and future recommendations.

## Technology Stack and AI Models

Frontend:

- Static React 18 application served from `project/Noesis/index.html`.
- React and ReactDOM are loaded from local vendor files.
- Three.js powers ambient and hero 3D visuals.
- Marked and DOMPurify render and sanitize Markdown content.
- A custom `project/build-bundle.js` bundles JSX components into `project/dist/app.bundle.js`.
- `project/api.js` centralizes all frontend API calls and sends `credentials: include` for cookie-based sessions.
- The custom frontend dev server runs from `project/dev-server.js` on `http://localhost:5173/Noesis`.

Backend:

- Node.js with Express.
- SQLite through `better-sqlite3`.
- `cookie-parser` for session cookies.
- `cors` with credential support.
- `express-rate-limit` for global, auth, upload, and AI rate limiting.
- `multer` for file uploads.
- `pdf-parse`, `mammoth`, and Office XML parsing utilities for document extraction.
- `zod` for AI output schema validation.
- `vitest` and `supertest` for backend tests.
- `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`, `fluent-ffmpeg`, Remotion, and optional Canvas for video rendering.

AI and media stack:

- Default AI provider: Ollama.
- Current local generation model: `qwen2.5-coder:7b`.
- Current embedding model: `nomic-embed-text`.
- Other installed Ollama models visible in health status: `phi3`, `llama3.2`, and `minimax-m2.5:cloud`.
- Feature-level providers are configurable through environment variables.
- In the current running demo configuration, notes, summaries, video scripts, and tutor features are configured to use Groq with model `openai/gpt-oss-120b`.
- Embeddings remain local through Ollama.
- TTS uses Piper with `en_US-lessac-medium.onnx`.
- Video rendering currently uses Remotion with Chrome available, with Canvas also ready.
- FFmpeg/FFprobe are used to combine slide visuals, narration audio, and final MP4 output.

Key backend mechanisms:

- Retrieval-Augmented Generation uses uploaded chunks plus seeded system curriculum chunks.
- Embeddings are stored on chunks as binary Float32 vectors.
- Retrieval combines cosine similarity, keyword fallback, title boosts, exact topic boosts, and sibling-topic penalties.
- Topic resolution prevents generic requests like a file title or number from producing weak AI output.
- Jobs are used for long-running workflows such as material ingestion, tutor startup, and video rendering.
- Quality gates validate generated lessons, quiz JSON, flashcards, storyboards, and video scripts before saving or rendering.

## 1. User Auth

The user authentication feature controls account creation, login, onboarding, profile management, preferences, export, and account deletion.

Mechanism:

- Signup accepts `email`, `password`, and `name`.
- Passwords are hashed with `bcryptjs` using 12 salt rounds.
- The backend rejects short passwords, overly long passwords, duplicate emails, and the reserved system email.
- Login uses a timing-safe fallback bcrypt hash so invalid emails do not expose timing differences.
- Successful signup and signin return a JWT and also set an HTTP-only session cookie.
- The frontend stores the token in `localStorage` for compatibility, but the real session check is `/api/auth/me`.
- Protected routes use `requireAuth`, which accepts the cookie session and bearer token.
- Onboarding saves subject, goal, daily minutes, course list, weak topics, confidence, preferred language, learning style, deadline, days per week, and minutes per session.

Flow:

1. The user opens the app and `App.jsx` checks `/api/auth/me`.
2. If unauthenticated, the user sees landing/auth screens.
3. Signup creates the user, preferences row, and seed concept mastery rows.
4. Signin verifies the password and issues a JWT.
5. The backend sets `noesis_session` as an HTTP-only cookie.
6. The frontend moves the user to onboarding or dashboard.
7. Onboarding writes study preferences and optional courses.
8. Later requests include the cookie and optional bearer token automatically.

Main data:

- `users`
- `user_prefs`
- `courses`
- Seed concepts such as Encapsulation, Inheritance, Polymorphism, Arrays, Linked Lists, Stacks, Queues, Trees, Heaps, and Graphs.

Main endpoints:

- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `POST /api/auth/signout`
- `POST /api/auth/onboarding`
- `GET /api/auth/me`
- `DELETE /api/auth/me`
- `GET /api/auth/export`
- `GET/PUT /api/user/prefs`
- `PUT /api/user/profile`
- `PUT /api/user/password`

## 2. Assessment Feedback

Assessment feedback includes quizzes, wrong-answer review, flashcards, spaced repetition, study events, and concept mastery updates.

Mechanism:

- Quizzes are generated from retrieved material chunks using AI.
- Quiz output is validated with a strict Zod schema.
- If AI generation fails, the backend falls back to source-grounded questions built from extracted chunk sentences.
- Each question stores four options, the correct index, explanation, difficulty, and concept/topic.
- Quiz attempts store submitted answers and calculate final score.
- Wrong answers are saved and later exposed as a review list.
- Correct and incorrect quiz outcomes update concept mastery through `mastery.service.js`.
- Flashcards are AI-generated from retrieved chunks.
- Flashcard output is validated and sanitized.
- If AI card generation fails, the system creates fallback cards directly from source sentences.
- Flashcard review uses a lightweight SM-2 spaced repetition scheduler.
- Ratings from 1 to 4 update ease, interval, repetition count, and due date.

Flow for quizzes:

1. The user selects material and asks for a quiz.
2. Backend verifies material ownership.
3. RAG retrieves relevant chunks.
4. AI generates multiple-choice questions.
5. JSON is repaired and validated if needed.
6. Questions are stored in `quizzes` and `quiz_questions`.
7. The user starts an attempt.
8. Each answer is checked immediately against `correct_idx`.
9. Finish calculates score and returns wrong-answer explanations.
10. Study event and concept mastery records are updated.

Flow for flashcards:

1. The user generates cards for a material.
2. Backend retrieves source chunks.
3. AI generates question-answer cards with topic and difficulty.
4. Cards are stored with optional source chunk references.
5. `/flashcards/due` returns cards whose due date has arrived or cards never reviewed.
6. User review rating is converted into the next due date using SM-2 logic.
7. Review events are logged as study activity.

Main data:

- `quizzes`
- `quiz_questions`
- `quiz_attempts`
- `quiz_answers`
- `flashcards`
- `flashcard_reviews`
- `concepts`
- `study_events`

Main endpoints:

- `POST /api/quizzes/generate`
- `GET /api/quizzes`
- `GET /api/quizzes/:id`
- `POST /api/quizzes/:id/attempt`
- `POST /api/quizzes/attempts/:id/answer`
- `POST /api/quizzes/attempts/:id/finish`
- `GET /api/quizzes/wrong-answers`
- `GET /api/flashcards`
- `GET /api/flashcards/due`
- `POST /api/flashcards/generate`
- `POST /api/flashcards/:id/review`

## 3. Dashboard Progress

The dashboard progress feature summarizes the learner's current state, recent activity, weak concepts, due work, study streaks, and recommended next action.

Mechanism:

- The backend reads recent `study_events` to calculate weekly study hours.
- A UTC week bucket creates seven daily hour values.
- A streak function checks consecutive study days.
- Due flashcards are calculated by comparing latest review due dates to the current time.
- Dashboard counts materials, notes, flashcards, quizzes, and completed quiz attempts.
- Average quiz score comes from completed quiz attempts.
- Weak topics are concepts below 60 percent mastery.
- Insights are generated from the learner's actual data, such as missing uploads, missing notes, due reviews, or low mastery topics.
- The dashboard merges study plan and learning map data to recommend the next action.
- The progress endpoint generates curves, concept breakdowns, heatmap activity, monthly focus time, retention, and weekly review text.

Flow:

1. The frontend loads `/api/dashboard`.
2. Backend gathers user preferences, events, cards, materials, concepts, courses, quizzes, and active plan.
3. It computes weekly hours, streak, due cards, weak topics, recent activity, and summary counts.
4. It builds or reads a learning map.
5. It returns a dashboard object for cards, charts, resume items, insights, and next recommended action.
6. The progress page calls `/api/dashboard/progress`.
7. Backend builds mastery and retention curves plus a 12-week heatmap.

Main calculations:

- Weekly hours from `study_events.duration_s`.
- Goal hours from `user_prefs.daily_minutes * 7 / 60`.
- Retention from flashcard reviews rated 3 or 4.
- Mastery from `concepts.mastery_pct`.
- Weak topics from concepts under threshold.

Main endpoints:

- `GET /api/dashboard`
- `GET /api/dashboard/progress`

## 4. Learning Content

Learning content covers uploaded materials, extracted chapters, chunking, embeddings, notes, source maps, and the learning material detail view.

Mechanism:

- Users upload PDF, DOCX/DOC, TXT/MD, PPTX/PPT, and similar learning files.
- Files are stored under backend uploads.
- A material starts in `queued` state.
- A background job processes the file asynchronously.
- Text extraction is performed based on file type.
- Chapters and headings are detected from extracted text.
- Text is split into searchable chunks.
- Each chunk stores metadata such as chapter title, heading, slide number, section title, code presence, keywords, and token count.
- Chunks are embedded with Ollama embeddings and stored for retrieval.
- The system extracts candidate concepts from the material and stores them in the learner's concept map.
- Notes generation resolves the real topic, retrieves relevant uploaded and system chunks, generates a structured educational lesson, validates quality, converts it to Markdown, and saves the note with a source map.

Flow for upload:

1. User uploads a file from the Materials page.
2. Frontend sends multipart form data to `/api/materials`.
3. Backend creates a pending material row.
4. Backend creates a `material_ingest` job.
5. Text is extracted from the file.
6. Chapters are detected.
7. Chunks are created and inserted.
8. Embeddings are generated and stored.
9. Concepts are extracted and inserted.
10. Material status changes to `ready`.
11. A reading event is logged.

Flow for AI notes:

1. User requests notes for material, chapter, or query.
2. Backend resolves the actual CS topic.
3. RAG retrieves relevant chunks from uploaded content and seeded system content.
4. The lesson service generates structured sections: hook, definition, deep explanation, diagram, code, mistakes, checkpoint, and recap.
5. Quality scoring rejects generic or weak output.
6. Lesson Markdown is saved as a note.
7. The response includes the note, resolved topic, topic confidence, source map, and learning map.

Main data:

- `materials`
- `chapters`
- `chunks`
- `notes`
- `concepts`
- `learning_maps`
- `study_events`

Main endpoints:

- `GET /api/materials`
- `POST /api/materials`
- `GET /api/materials/:id`
- `GET /api/materials/:id/chunks`
- `DELETE /api/materials/:id`
- `GET /api/notes`
- `POST /api/notes`
- `POST /api/notes/generate`
- `GET/PUT/DELETE /api/notes/:id`

## 5. AI Learning Assistant

The AI learning assistant includes the structured tutor, RAG-powered explanations, source tracing, tutor notes, and AI-generated storyboard/video learning flows.

Mechanism:

- Tutor sessions can be started from a selected material or a concept.
- The system creates a skeleton tutor session immediately.
- Tutor startup can run asynchronously as a job.
- Topic resolver converts vague input into a specific CS topic.
- RAG retrieves material context and seeded system curriculum context.
- The tutor builds a five-step learning path: Warm-up, Intuition, The Trick, Formalize, and Apply.
- Each step includes content, question, hint, example, visual type, optional code, and source references.
- Tutor responses give feedback and move the learner forward or keep them on the same step.
- Concept mastery is updated from tutor answers.
- Tutor sources and trace data show where the session came from and how it was generated.
- Users can save tutor notes and mark them flashcard-worthy.

Tutor flow:

1. User starts a tutor session with material, concept, and mode.
2. Backend creates a skeleton session and job.
3. Job resolves topic.
4. Job retrieves context.
5. Job creates a structured five-step plan.
6. Job stores session, steps, source chunks, trace data, and learning map.
7. Frontend polls status until ready.
8. User answers the active step.
9. Backend returns feedback, next step, updated step states, and mastery outcome.
10. User can finish the session, which logs a study event.

Storyboard/video assistant mechanism:

- Storyboard generation starts from a material and concept.
- The backend resolves topic and retrieves RAG context.
- A structured educational lesson is generated.
- Lesson sections are converted into video scenes.
- Each scene has a teaching goal, narration, visual template, visual data, optional code focus, and quality warnings.
- In demo/strict mode, users must approve the storyboard before rendering.
- Approval blocks generic or weak storyboard scenes.
- Rendering creates narration audio using Piper.
- Visuals are rendered through Remotion or Canvas.
- FFmpeg combines visual segments and audio into final MP4.
- Final media is verified for video and audio streams.

AI assistant models and routing:

- Embeddings use Ollama `nomic-embed-text`.
- Default local generation uses Ollama `qwen2.5-coder:7b` in the current environment.
- Tutor provider is currently configured as Groq.
- Groq model is currently `openai/gpt-oss-120b`.
- Local fallback can be used for video scripts when Groq fails, depending on environment settings.
- Tutor startup cache uses a configurable TTL of 900000 ms.

Main data:

- `tutor_sessions`
- `tutor_steps`
- `tutor_notes`
- `video_storyboards`
- `video_storyboard_scenes`
- `videos`
- `jobs`
- `chunks`
- `learning_maps`

Main endpoints:

- `POST /api/tutor/sessions`
- `GET /api/tutor/sessions/:id/status`
- `GET /api/tutor/sessions/:id`
- `GET /api/tutor/sessions/:id/sources`
- `GET /api/tutor/sessions/:id/trace`
- `PATCH /api/tutor/sessions/:id/mode`
- `POST /api/tutor/sessions/:id/continue`
- `POST /api/tutor/sessions/:id/step/:idx/answer`
- `POST /api/tutor/sessions/:id/notes`
- `POST /api/tutor/sessions/:id/finish`
- `POST /api/videos/storyboard`
- `PATCH /api/videos/storyboard/:id/scene/:sceneId`
- `POST /api/videos/storyboard/:id/approve`
- `POST /api/videos/storyboard/:id/render`
- `GET /api/videos/:id/file`

## 6. Study Plan

The study plan feature turns user preferences, weak topics, learning map data, and available time into a practical day-by-day plan.

Mechanism:

- A learning map is built from subject preference, concept mastery, quiz misses, and optional material context.
- Built-in paths exist for OOP, Data Structures, and Algorithms.
- Concepts are classified as prerequisite, core, weak, or recommended.
- Each concept receives a status: not started, weak, in progress, or mastered.
- The recommended path starts with the weakest or first unfinished topic.
- A plan uses the learner's days per week, minutes per session, deadline, weak topics, preferred language, and learning style.
- The generated plan contains daily focus topics, estimated minutes, and tasks.
- Tasks can include watching a video, reading notes, taking a quiz, reviewing flashcards, or completing a tutor session.
- A plan starts as draft, then must be approved to become active.
- Approving a new plan archives the previous active plan.
- Completing a task updates its status and completion timestamp.

Flow:

1. User requests a learning map or study plan.
2. Backend reads preferences, concepts, quiz misses, and optional material.
3. Learning map selects `startHere` and recommended path.
4. Study plan builder calculates time budget and duration.
5. Daily tasks are generated around focus topics.
6. Plan is stored as draft with individual task rows.
7. User reviews and approves the plan.
8. Approved plan becomes active.
9. Completing a task updates the plan and returns the latest plan state.

Main data:

- `learning_maps`
- `study_plans`
- `study_plan_tasks`
- `user_prefs`
- `concepts`
- `quiz_answers`

Main endpoints:

- `GET /api/study/learning-map`
- `POST /api/study/plans`
- `GET /api/study/plans/active`
- `GET /api/study/plans/:id`
- `POST /api/study/plans/:id/approve`
- `POST /api/study/tasks/:id/complete`

## 7. Backend Foundation

The backend foundation provides the API, database, migrations, jobs, file storage, AI provider abstraction, retrieval, quality gates, media services, security middleware, and error handling used by all features.

Mechanism:

- `server.js` initializes Express, runs migration, seeds the tutor corpus when needed, configures CORS, parses cookies and JSON, applies rate limiting, mounts routes, and exposes health checks.
- `config/db.js` opens SQLite, enables WAL mode, enables foreign keys, creates upload directories, runs initial migration, and performs compatibility column/table additions.
- `config/env.js` centralizes all runtime configuration.
- `ai.service.js` abstracts generation providers and feature-specific provider routing.
- Ollama provider supplies local generation and embeddings.
- Groq provider supplies OpenAI-compatible remote generation when configured.
- `rag.service.js` handles embeddings, vector similarity, keyword fallback, retrieval metadata, and grounding tier.
- `jobs.service.js` stores async job status for ingestion, tutor startup, and video generation.
- Middleware handles authentication, upload validation, rate limits, not-found errors, and structured error responses.
- Services isolate business logic from routes.
- Tests cover auth, RAG, schemas, notes prompts, lesson quality, tutor routes, study plans, TTS, video quality, storyboard service, and regression behavior.

Backend flow:

1. Server starts.
2. SQLite migrations run automatically.
3. Upload directories are created.
4. System curriculum seed runs if needed.
5. Routes are mounted under `/api`.
6. Frontend calls the API through `window.NoesisAPI`.
7. Protected requests pass through auth middleware.
8. Long-running tasks are created as jobs.
9. Services update database rows and job progress.
10. Health endpoint reports AI, TTS, renderer, demo readiness, and environment state.

Important backend modules:

- `routes/auth.routes.js`
- `routes/material.routes.js`
- `routes/note.routes.js`
- `routes/flashcard.routes.js`
- `routes/quiz.routes.js`
- `routes/tutor.routes.js`
- `routes/dashboard.routes.js`
- `routes/study.routes.js`
- `routes/video.routes.js`
- `routes/jobs.routes.js`
- `services/ai.service.js`
- `services/rag.service.js`
- `services/material.service.js`
- `services/lesson.service.js`
- `services/tutor.service.js`
- `services/study-plan.service.js`
- `services/learning-map.service.js`
- `services/video.service.js`
- `services/storyboard.service.js`
- `services/tts.service.js`
- `services/renderer.service.js`
- `services/mastery.service.js`
- `services/srs.service.js`

Security and reliability:

- Passwords are hashed, never stored as plaintext.
- Auth uses HTTP-only cookies and JWT support.
- CORS is restricted by `CORS_ORIGIN`.
- User-owned resources are checked before access.
- File upload size and type are controlled by middleware.
- Rate limits protect auth, upload, and AI routes.
- AI JSON is schema-validated and repaired when possible.
- Generic AI outputs can be rejected by quality gates.
- Video output is verified with media probing.
- SQLite foreign keys and cascade deletion keep user data consistent.

## End-to-End System Flow

1. User signs in.
2. User uploads course material.
3. Backend extracts text, detects chapters, chunks content, embeds chunks, and stores concepts.
4. User generates notes, flashcards, quizzes, tutor sessions, or videos.
5. Each AI feature resolves the topic, retrieves relevant chunks, and validates output.
6. User completes quizzes, flashcard reviews, tutor steps, and study plan tasks.
7. Mastery and study events are updated.
8. Dashboard and progress pages reflect the latest state.
9. Study plan uses weak topics and available time to recommend what to do next.
10. Video/storyboard flow can turn a topic into an approved narrated MP4 lesson.

## Current Running Services

- Frontend: `http://localhost:5173/Noesis`
- Backend: `http://localhost:3001`
- Health endpoint: `http://localhost:3001/api/health`
- Ollama: `http://localhost:11434`
- Current backend health: OK
- Current demo readiness: OK
