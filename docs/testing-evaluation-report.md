# Testing and Evaluation Report

Generated on 2026-06-19T23:58:23.969Z from repository evidence.


## Evidence Run

- Run directory: `docs/test-evidence/runs/2026-06-19T23-37-22-521Z`
- Evidence summary: `docs/test-evidence/runs/2026-06-19T23-37-22-521Z/results/evidence-summary.json`
- Screenshot index: `docs/testing-evaluation-screenshot-index.md`
- Live Ollama: `http://localhost:11434`
- Generation model: `qwen2.5-coder:7b`
- Embedding model: `nomic-embed-text`
- Live Groq: `https://api.groq.com/openai/v1`
- Groq model: `openai/gpt-oss-120b`
- Groq configured: yes
- Provider evaluation scores: ollama: 2.78/3 (21/21 passed, model qwen2.5-coder:7b); groq: 1.1/3 (8/21 passed, model openai/gpt-oss-120b)
- Overall evidence score: 80.3/100

| Screenshot | Image | HTML evidence | Status |
| --- | --- | --- | --- |
| Command Summary | ![Command Summary](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/01-command-summary.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/01-command-summary.html | captured |
| Backend Test Results | ![Backend Test Results](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/02-backend-tests.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/02-backend-tests.html | captured |
| API Health and Ollama Readiness | ![API Health and Ollama Readiness](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/03-api-health.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/03-api-health.html | captured |
| Authentication and Protected Routes | ![Authentication and Protected Routes](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/04-auth-protected.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/04-auth-protected.html | captured |
| Material Upload and Job Polling | ![Material Upload and Job Polling](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/05-upload-job.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/05-upload-job.html | captured |
| Notes Tests | ![Notes Tests](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/06-notes.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/06-notes.html | captured |
| Flashcard Tests | ![Flashcard Tests](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/07-flashcards.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/07-flashcards.html | captured |
| Quiz Tests | ![Quiz Tests](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/08-quiz.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/08-quiz.html | captured |
| Guided Tutor Tests | ![Guided Tutor Tests](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/09-tutor.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/09-tutor.html | captured |
| Dashboard and Progress Tests | ![Dashboard and Progress Tests](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/10-dashboard-progress.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/10-dashboard-progress.html | captured |
| Video and Storyboard Result | ![Video and Storyboard Result](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/11-video.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/11-video.html | captured |
| AI Evaluation Results | ![AI Evaluation Results](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/12-evals.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/12-evals.html | captured |
| Frontend Bundle Verification | ![Frontend Bundle Verification](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/13-frontend.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/13-frontend.html | captured |
| Knowledge Validation | ![Knowledge Validation](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/14-knowledge.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/14-knowledge.html | captured |
| License and Source Validation | ![License and Source Validation](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/15-licenses.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/15-licenses.html | captured |
| Word Document Claim Comparison | ![Word Document Claim Comparison](docs/test-evidence/runs/2026-06-19T23-37-22-521Z/screenshots/16-word-claims.png) | docs/test-evidence/runs/2026-06-19T23-37-22-521Z/html/16-word-claims.html | captured |


## 1. Executive Summary

Noesis has a functioning implementation surface for authentication, material ingestion, notes, flashcards, quizzes, tutor sessions, dashboard analytics, RAG, JSON repair/schema validation, and video generation. This report includes a newly generated runnable evidence suite with backend tests, live API smoke workflows, live Ollama and Groq JSONL evaluations, static frontend verification, seed-corpus validation, license/source validation, and screenshots.

The Word document is treated as a historical baseline. Claims that are not represented by current repo files or the new evidence run are explicitly marked as unsupported rather than copied as facts.

## 2. Test Environment

- Operating system: Windows_NT 10.0.26200 (win32 x64)
- Node.js: not verified
- npm: not verified
- Backend: Express + SQLite + Ollama, located in `backend/`.
- Frontend: static React/Babel app, located in `project/`; no npm build script is present.
- Database/storage: SQLite and upload directories are runtime-generated under `backend/data/` and `backend/uploads/`; these are excluded from report discovery.
- AI/evaluation files: 15 JSONL file(s) found.
- Local backend health at report-generation moment: reachable, HTTP 200.
- Environment variables discovered from `backend/.env.example`: `NODE_ENV`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `DATA_DIR`, `UPLOAD_DIR`, `DB_PATH`, `MAX_UPLOAD_MB`, `RATE_LIMITS_ENABLED`, `GLOBAL_RATE_LIMIT_PER_15_MIN`, `AI_RATE_LIMIT_PER_MIN`, `VIDEO_RATE_LIMIT_PER_MIN`, `UPLOAD_RATE_LIMIT_PER_MIN`, `TTS_RATE_LIMIT_PER_MIN`, `TUTOR_TURN_RATE_LIMIT_PER_MIN`, `AUTH_RATE_LIMIT_PER_15_MIN`, `NOESIS_DEMO_MODE`, `AI_PROVIDER`, `EMBEDDING_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_GEN_MODEL`, `OLLAMA_EMBED_MODEL`, `OLLAMA_TIMEOUT_MS`, `GROQ_BASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VIDEO_MAX_OUTPUT_TOKENS`, `GROQ_NOTES_MAX_OUTPUT_TOKENS`, `NOTES_PROVIDER`, `SUMMARY_PROVIDER`, `VIDEO_SCRIPT_PROVIDER`, `TUTOR_PROVIDER`, `TUTOR_FALLBACK_PROVIDER`, `FLASHCARD_PROVIDER`, `FLASHCARD_FALLBACK_PROVIDER`, `FLASHCARD_MIN_CARDS`, `FLASHCARD_MAX_CARDS`, `FLASHCARD_DEFAULT_CARDS`, `FLASHCARD_TOP_K_CHUNKS`, `FLASHCARD_MAX_CONTEXT_CHARS`, `FLASHCARD_TIMEOUT_MS`, `VIDEO_RENDERER`, `STORYBOARD_REVIEW_REQUIRED`, `STRICT_QUALITY_GATES`, `OCR_ENABLED`, `OCR_PROVIDER`, `OCR_MIN_TEXT_CHARS_PER_PAGE`, `OCR_TIMEOUT_MS`, `OCR_MAX_PAGES`, `OCR_TESSERACT_LANG`, `SOURCE_VISUALS_MAX_PER_MATERIAL`, `SOURCE_GROUNDING_JUDGE_ENABLED`, `SOURCE_GROUNDING_JUDGE_MODE`, `SOURCE_GROUNDING_JUDGE_RETRY_LIMIT`, `SOURCE_GROUNDING_JUDGE_BLOCK_ON_TOPIC_DRIFT`, `SOURCE_REPAIR_SAVE_SAFE_FALLBACK`, `TTS_ENGINE`, `TTS_BIN`, `TTS_VOICE_PATH`, `TTS_PAUSE_MS_SENTENCE`, `TTS_PAUSE_MS_SECTION`.
- Installed test runners: `vitest`, `supertest`.

## 3. Commands Used

The generator executed only safe, non-mutating discovery and verification checks.

| Command/check | Working directory | Status | Evidence |
| --- | --- | --- | --- |
| node -v | . | failed | spawnSync node EPERM |
| npm -v | . | failed | spawnSync C:\WINDOWS\system32\cmd.exe EPERM |
| npm run | backend | failed | spawnSync C:\WINDOWS\system32\cmd.exe EPERM |
| npm ls --depth=0 | backend | failed | spawnSync C:\WINDOWS\system32\cmd.exe EPERM |
| static check project/Noesis.html local asset references | . | failed | Missing: dist/app.bundle.js?v=source-visuals-20260529 |
| passive GET http://localhost:3001/api/health | . | reachable | {"ok":false,"provider":"ollama","ai":{"provider":"ollama","defaultProvider":"ollama","generation":{"ok":true,"provider":"ollama","model":"qwen2.5-coder:7b","embed_model":"nomic-embed-text","details":{"reachable":true,"ready":true,"base_url":"http://localhost:11434","generation":{"model":"qwen2.5-coder:7b","available":true},"embedding":{"model":"nomic-embed-text","available":true},"installed":["nomic-embed-text:latest","qwen2.5-coder:7b","phi3:latest","llama3.2:latest","minimax-m2.5:cloud"],"missing":[]}},"embedding":{"ok":true,"provider":"ollama","model":"nomic-embed-text"},"embeddings":{"ok":true,"provider":"ollama","model":"nomic-embed-text"},"notes":{"provider":"groq","groqConfigured":true,"maxOutputTokens":2000},"summary":{"provider":"groq","groqConfigured":true},"videoScript":{"provider":"groq","groqFallbackOnWeak":false,"minQualityScore":0.75,"groqConfigured":true,"groqModel":"openai/gpt-oss-120b","privacyMode":"direct-groq-for-video-scripts-only","useLocalIfGroqFails":true},"... |
| powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression; $p="C:\\Users\\belal\\Documents\\Word.docx"; $out="C:\\Users\\belal\\Documents\\Grad\\Noesis-Final\\docs\\test-evidence\\runs\\2026-06-19T23-37-22-521Z\\results\\word-extracted.txt"; $fs=[System.IO.File]::Open($p,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite); try {;   $zip=New-Object System.IO.Compression.ZipArchive($fs,[System.IO.Compression.ZipArchiveMode]::Read,$false);   try {;     $entry=$zip.GetEntry('word/document.xml');     $sr=New-Object System.IO.StreamReader($entry.Open());     $xml=$sr.ReadToEnd(); $sr.Close();     $text=$xml -replace '</w:p>',"`n" -replace '<w:tab/>',' ' -replace '<[^>]+>','' -replace '&amp;','&' -replace '&lt;','<' -replace '&gt;','>' -replace '&quot;','"' -replace '&#39;',"'";     Set-Content -LiteralPath $out -Value $text -Encoding UTF8;   } finally { $zip.Dispose() }; } finally { $fs.Dispose() }" | . | passed | Extract Word testing section (1364 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/word-extract.log) |
| node scripts/verify-frontend-bundle.js --json | . | failed | Frontend bundle verification (49 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/frontend-verify.log) |
| node scripts/validate-knowledge.js --json | . | passed | Knowledge validation (49 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/knowledge-validate.log) |
| node scripts/validate-licenses.js --json | . | failed | License/source validation (48 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/license-validate.log) |
| npm test | backend | passed | Backend unit/integration tests (29985 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/backend-tests.log) |
| node scripts/run-noesis-evals.js --provider ollama --json | . | passed | Live Ollama JSONL evaluations (975648 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/noesis-evals-ollama.log) |
| node scripts/run-noesis-evals.js --provider groq --json | . | failed | Live Groq JSONL evaluations (12745 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/noesis-evals-groq.log) |
| node scripts/run-api-smoke.js --json --out C:\Users\belal\Documents\Grad\Noesis-Final\docs\test-evidence\runs\2026-06-19T23-37-22-521Z\results\api-smoke.json | . | passed | Live API smoke workflow (98106 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/api-smoke.log) |
| node scripts/generate-testing-evaluation-report.js C:\Users\belal\Documents\Grad\Noesis-Final\docs\test-evidence\runs\2026-06-19T23-37-22-521Z\results\word-extracted.txt | . | passed | Generate final testing report (30515 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/report-generator.log) |
| node scripts/generate-testing-evaluation-docx.js C:\Users\belal\Documents\Grad\Noesis-Final\docs\testing-evaluation-report.docx C:\Users\belal\Documents\Grad\Noesis-Final\docs\test-evidence\runs\2026-06-19T23-37-22-521Z\results\evidence-summary.json | . | passed | Generate Word document with screenshots (452 ms, log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/docx-generator.log) |

Available package scripts:

| Package | Script | Definition | Category |
| --- | --- | --- | --- |
| backend/package.json | dev | node server.js | operational |
| backend/package.json | start | node server.js | operational |
| backend/package.json | migrate | node -e "require('./config/db').migrate()" | operational |
| backend/package.json | seed | node scripts/seed-tutor-corpus.js | operational |
| backend/package.json | seed:force | node scripts/seed-tutor-corpus.js --force | operational |
| backend/package.json | knowledge:validate | node scripts/validate-knowledge.js | test/evaluation candidate |
| backend/package.json | knowledge:seed | node scripts/seed-knowledge-corpus.js | operational |
| backend/package.json | knowledge:seed:dry-run | node scripts/seed-knowledge-corpus.js --dry-run | operational |
| backend/package.json | eval:noesis | node scripts/eval-noesis-generation.js | test/evaluation candidate |
| backend/package.json | eval:noesis:dry-run | node scripts/eval-noesis-generation.js --dry-run | test/evaluation candidate |
| backend/package.json | eval:noesis:compare | node scripts/eval-noesis-compare.js | test/evaluation candidate |
| backend/package.json | demo:check | node scripts/demo-readiness-check.js | operational |
| backend/package.json | eval:video | node scripts/eval-video.js | test/evaluation candidate |
| backend/package.json | tts:check | node scripts/tts-check.js | operational |
| backend/package.json | tts:preview | node scripts/tts-preview.js | operational |
| backend/package.json | test | vitest run | test/evaluation candidate |
| backend/package.json | test:watch | vitest | test/evaluation candidate |
| backend/package.json | test:legacy | node --test --test-concurrency=1 tests/unit.test.js tests/integration.test.js | test/evaluation candidate |
| backend/package.json | eval:noesis:evidence | node ../scripts/run-noesis-evals.js | test/evaluation candidate |
| backend/package.json | knowledge:validate:evidence | node ../scripts/validate-knowledge.js | test/evaluation candidate |
| backend/package.json | license:validate | node ../scripts/validate-licenses.js | test/evaluation candidate |
| backend/package.json | frontend:verify | node ../scripts/verify-frontend-bundle.js | operational |
| backend/package.json | test:evidence | node ../scripts/run-testing-evaluation-suite.js | test/evaluation candidate |

## 4. Automated Testing Results

| Test category | Command | Number of test files | Number of tests/checks | Passed | Failed | Skipped | Pass rate | Notes/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Backend automated tests | npm test | 56 | 457 | 457 | 0 | 0 | 100% | log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/backend-tests.log |
| Frontend build or bundle verification | node scripts/verify-frontend-bundle.js --json | 1 | 18 | partial | 1 | 0 | partial | log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/frontend-verify.log |
| Static JavaScript syntax checks | node --check <backend JS files, project/api.js, scripts/generate-testing-evaluation-report.js> | 150 | 150 | 0 | 150 | 0 | 0% | Failures: backend/__tests__/auth.test.js, backend/__tests__/captions-service.test.js, backend/__tests__/chunk-metadata.test.js, backend/__tests__/educational-context.service.test.js, backend/__tests__/eval-comparison.test.js, backend/__tests__/eval-generation-controls.test.js, backend/__tests__/eval-scoring.test.js, backend/__tests__/extract-service.test.js, backend/__tests__/extraction-quality.test.js, backend/__tests__/gamification-social-routes.test.js, backend/__tests__/gamification-social.test.js, backend/__tests__/generation-scope-domain.test.js, backend/__tests__/grounded-enrichment.test.js, backend/__tests__/helpers/setup.js, backend/__tests__/json-safe.test.js, backend/__tests__/knowledge-service.test.js, backend/__tests__/learning-map-layout.test.js, backend/__tests__/lesson-service.test.js, backend/__tests__/material-diagnostics.test.js, backend/__tests__/material-topic-map.test.js, backend/__tests__/material-understanding.test.js, backend/__tests__/note-generation-repair.test.js, backend/__tests__/notes-audio.test.js, backend/__tests__/notes-prompt.test.js, backend/__tests__/ocr-service.test.js, backend/__tests__/practice-generation-routes.test.js, backend/__tests__/practice-prompts.test.js, backend/__tests__/rag-tiers.test.js, backend/__tests__/rag.test.js, backend/__tests__/remotion-visual-smoke.test.js, backend/__tests__/render-visual-assets.test.js, backend/__tests__/schema-validation.test.js, backend/__tests__/seed-knowledge-corpus.test.js, backend/__tests__/slides-visual-mapping.test.js, backend/__tests__/source-grounding-judge.test.js, backend/__tests__/source-topic-plan.test.js, backend/__tests__/source-visual-candidates.test.js, backend/__tests__/storyboard-gate-enforcement.test.js, backend/__tests__/storyboard-repair.test.js, backend/__tests__/storyboard-review-ui-safety.test.js, backend/__tests__/storyboard-service.test.js, backend/__tests__/study-plan-service.test.js, backend/__tests__/topic-resolver.test.js, backend/__tests__/topic-visual-standards.test.js, backend/__tests__/tts-detection.test.js, backend/__tests__/tts-splitting.test.js, backend/__tests__/tutor-chat.test.js, backend/__tests__/tutor-context-prompt.test.js, backend/__tests__/tutor-quality.test.js, backend/__tests__/tutor-routes.test.js, backend/__tests__/video-captions-route.test.js, backend/__tests__/video-grounding-regression.test.js, backend/__tests__/video-quality.test.js, backend/__tests__/video-regression.test.js, backend/__tests__/visual-composition.test.js, backend/__tests__/visual-quality-regression.test.js, backend/__tests__/visual-registry.test.js, backend/config/db.js, backend/config/env.js, backend/middleware/auth.js, backend/middleware/error.js, backend/middleware/rateLimit.js, backend/middleware/upload.js, backend/routes/auth.routes.js, backend/routes/courses.routes.js, backend/routes/dashboard.routes.js, backend/routes/flashcard.routes.js, backend/routes/friend.routes.js, backend/routes/gamification.routes.js, backend/routes/jobs.routes.js, backend/routes/leaderboard.routes.js, backend/routes/material.routes.js, backend/routes/note.routes.js, backend/routes/quiz.routes.js, backend/routes/room.routes.js, backend/routes/study.routes.js, backend/routes/tutor.routes.js, backend/routes/user-search.routes.js, backend/routes/user.routes.js, backend/routes/video.routes.js, backend/scripts/demo-readiness-check.js, backend/scripts/eval-model.js, backend/scripts/eval-noesis-compare.js, backend/scripts/eval-noesis-generation.js, backend/scripts/eval-video.js, backend/scripts/seed-knowledge-corpus.js, backend/scripts/seed-tutor-corpus.js, backend/scripts/tts-check.js, backend/scripts/tts-preview.js, backend/scripts/validate-knowledge.js, backend/server.js, backend/services/activity.service.js, backend/services/ai.service.js, backend/services/auth.service.js, backend/services/captions.service.js, backend/services/chunk.service.js, backend/services/diagram.service.js, backend/services/domain-detection.service.js, backend/services/educational-context.service.js, backend/services/extract.service.js, backend/services/extraction-quality.service.js, backend/services/friend.service.js, backend/services/gamification.service.js, backend/services/grounded-enrichment.service.js, backend/services/jobs.service.js, backend/services/knowledge.service.js, backend/services/leaderboard.service.js, backend/services/learning-map.service.js, backend/services/lesson.service.js, backend/services/mastery.service.js, backend/services/material-diagnostics.service.js, backend/services/material-topic-map.service.js, backend/services/material-understanding.service.js, backend/services/material.service.js, backend/services/notes-audio.service.js, backend/services/ocr.service.js, backend/services/providers/groq.provider.js, backend/services/providers/ollama.provider.js, backend/services/rag.service.js, backend/services/render-visual-assets.service.js, backend/services/renderer.service.js, backend/services/room.service.js, backend/services/slides.service.js, backend/services/source-grounding-judge.service.js, backend/services/source-topic-plan.service.js, backend/services/source-visual-candidates.service.js, backend/services/srs.service.js, backend/services/storyboard-repair.service.js, backend/services/storyboard.service.js, backend/services/study-plan.service.js, backend/services/topic-resolver.service.js, backend/services/tts.service.js, backend/services/tutor-chat.service.js, backend/services/tutor.service.js, backend/services/video-quality.service.js, backend/services/video.service.js, backend/tests/integration.test.js, backend/tests/unit.test.js, backend/utils/code-window.js, backend/utils/concept-synonyms.js, backend/utils/eval-scoring.js, backend/utils/jsonSafe.js, backend/utils/logger.js, backend/utils/mediaBinaries.js, backend/utils/prompts.js, backend/utils/visual-composition.js, backend/utils/visual-registry.js, backend/utils/visual-templates.js, project/api.js, scripts/generate-testing-evaluation-report.js |
| AI evaluation datasets | ollama: node scripts/run-noesis-evals.js --provider ollama --json<br>groq: node scripts/run-noesis-evals.js --provider groq --json | 7<br>7 | 21<br>21 | 21<br>8 | 0<br>13 | 0 | 100%<br>38.1% | ollama average 2.78/3; log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/noesis-evals-ollama.log<br>groq average 1.1/3; log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/noesis-evals-groq.log |
| Manual/API workflow smoke evidence | node scripts/run-api-smoke.js --json --out C:\Users\belal\Documents\Grad\Noesis-Final\docs\test-evidence\runs\2026-06-19T23-37-22-521Z\results\api-smoke.json | 1 | 12 | 10 | 0 | 0 | 95.8% | environment-dependent: 2; log: docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/api-smoke.log |

Automated test pass rate: 100%.

## 5. Functional Coverage

| Feature | What was tested | How it was tested | Related test files | Result | Coverage |
| --- | --- | --- | --- | --- | --- |
| Authentication | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/auth.test.js<br>backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/helpers/setup.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-audio.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/seed-knowledge-corpus.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/tts-splitting.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-captions-route.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Materials upload and processing | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/chunk-metadata.test.js<br>backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/extract-service.test.js<br>backend/__tests__/extraction-quality.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/json-safe.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/ocr-service.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/rag-tiers.test.js<br>backend/__tests__/remotion-visual-smoke.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/seed-knowledge-corpus.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-review-ui-safety.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/topic-resolver.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-captions-route.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Notes | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/extract-service.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/knowledge-service.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-audio.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/tests/integration.test.js | tested but not documented unless source document confirms it | partially covered |
| Flashcards | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/educational-context.service.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/json-safe.test.js<br>backend/__tests__/knowledge-service.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-review-ui-safety.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/video-quality.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Quizzes | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/auth.test.js<br>backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-comparison.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/json-safe.test.js<br>backend/__tests__/knowledge-service.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/rag-tiers.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-visual-candidates.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Tutor chat | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-comparison.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/remotion-visual-smoke.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-quality.test.js<br>backend/tests/integration.test.js | tested but not documented unless source document confirms it | partially covered |
| Guided tutor | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-comparison.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-audio.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/remotion-visual-smoke.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/seed-knowledge-corpus.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/tests/integration.test.js | tested but not documented unless source document confirms it | partially covered |
| Dashboard/progress | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/tests/integration.test.js | tested but not documented unless source document confirms it | partially covered |
| Learning map | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/gamification-social.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/learning-map-layout.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/rag.test.js<br>backend/__tests__/remotion-visual-smoke.test.js<br>backend/__tests__/slides-visual-mapping.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/__tests__/visual-registry.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Study plan | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/extraction-quality.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-review-ui-safety.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/video-quality.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Storyboard/video | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/extract-service.test.js<br>backend/__tests__/extraction-quality.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/helpers/setup.js<br>backend/__tests__/knowledge-service.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/ocr-service.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/slides-visual-mapping.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-visual-candidates.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-review-ui-safety.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tts-detection.test.js<br>backend/__tests__/tts-splitting.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/video-captions-route.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/__tests__/visual-registry.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Study rooms/social features | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/study-plan-service.test.js | tested but not documented unless source document confirms it | partially covered |
| OCR | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/extraction-quality.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/ocr-service.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/tests/integration.test.js | tested but not documented unless source document confirms it | partially covered |
| RAG/grounding | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/chunk-metadata.test.js<br>backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-comparison.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/extract-service.test.js<br>backend/__tests__/extraction-quality.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/learning-map-layout.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/material-topic-map.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/ocr-service.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/rag-tiers.test.js<br>backend/__tests__/rag.test.js<br>backend/__tests__/remotion-visual-smoke.test.js<br>backend/__tests__/render-visual-assets.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/seed-knowledge-corpus.test.js<br>backend/__tests__/slides-visual-mapping.test.js<br>backend/__tests__/source-grounding-judge.test.js<br>backend/__tests__/source-topic-plan.test.js<br>backend/__tests__/source-visual-candidates.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-review-ui-safety.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/topic-resolver.test.js<br>backend/__tests__/topic-visual-standards.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-context-prompt.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-quality.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/__tests__/visual-quality-regression.test.js<br>backend/__tests__/visual-registry.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| JSON/schema validation | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/eval-comparison.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/extract-service.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/helpers/setup.js<br>backend/__tests__/json-safe.test.js<br>backend/__tests__/knowledge-service.test.js<br>backend/__tests__/lesson-service.test.js<br>backend/__tests__/material-diagnostics.test.js<br>backend/__tests__/material-understanding.test.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-audio.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/practice-prompts.test.js<br>backend/__tests__/schema-validation.test.js<br>backend/__tests__/storyboard-gate-enforcement.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/storyboard-service.test.js<br>backend/__tests__/study-plan-service.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-captions-route.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/__tests__/video-regression.test.js<br>backend/__tests__/visual-composition.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |
| Security/protected routes | Automated test files were discovered for this feature. | Repository test files matching feature keywords. | backend/__tests__/educational-context.service.test.js<br>backend/__tests__/eval-generation-controls.test.js<br>backend/__tests__/eval-scoring.test.js<br>backend/__tests__/gamification-social-routes.test.js<br>backend/__tests__/gamification-social.test.js<br>backend/__tests__/generation-scope-domain.test.js<br>backend/__tests__/grounded-enrichment.test.js<br>backend/__tests__/helpers/setup.js<br>backend/__tests__/note-generation-repair.test.js<br>backend/__tests__/notes-audio.test.js<br>backend/__tests__/notes-prompt.test.js<br>backend/__tests__/practice-generation-routes.test.js<br>backend/__tests__/storyboard-repair.test.js<br>backend/__tests__/tts-splitting.test.js<br>backend/__tests__/tutor-chat.test.js<br>backend/__tests__/tutor-quality.test.js<br>backend/__tests__/tutor-routes.test.js<br>backend/__tests__/video-captions-route.test.js<br>backend/__tests__/video-grounding-regression.test.js<br>backend/tests/integration.test.js<br>backend/tests/unit.test.js | tested but not documented unless source document confirms it | partially covered |

Implementation evidence by feature is present in the JSON summary. Implementation files are useful traceability evidence, but they are not counted as tests.

## 6. AI Evaluation Framework

| Provider | Evaluation file | Feature | Records | Scoring method | Average score | JSON validity rate | Strongest area | Weakest area | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ollama | eval/noesis/big_o_eval.jsonl | big_o | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.84 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/data_structures_eval.jsonl | data_structures | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 3 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/notes_eval.jsonl | notes | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.84 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/oop_eval.jsonl | oop | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.84 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/quiz_flashcard_eval.jsonl | quiz_flashcard | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.69 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/tutor_response_eval.jsonl | tutor_response | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.69 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| ollama | eval/noesis/video_storyboard_eval.jsonl | video_storyboard | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.53 | 100% | data_structures | video_storyboard | Starter dataset; not a complete academic benchmark. |
| groq | eval/noesis/big_o_eval.jsonl | big_o | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 2.69 | 100% | data_structures | quiz_flashcard | Starter dataset; not a complete academic benchmark. |
| groq | eval/noesis/data_structures_eval.jsonl | data_structures | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 3 | 100% | data_structures | quiz_flashcard | Starter dataset; not a complete academic benchmark. |
| groq | eval/noesis/notes_eval.jsonl | notes | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 1 | 100% | data_structures | quiz_flashcard | 2 case(s) below threshold or failed live generation. |
| groq | eval/noesis/oop_eval.jsonl | oop | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 1 | 100% | data_structures | quiz_flashcard | 2 case(s) below threshold or failed live generation. |
| groq | eval/noesis/quiz_flashcard_eval.jsonl | quiz_flashcard | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 0 | 100% | data_structures | quiz_flashcard | 3 case(s) below threshold or failed live generation. |
| groq | eval/noesis/tutor_response_eval.jsonl | tutor_response | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 0 | 100% | data_structures | quiz_flashcard | 3 case(s) below threshold or failed live generation. |
| groq | eval/noesis/video_storyboard_eval.jsonl | video_storyboard | 3 | Live provider keyword/JSON/relevance scoring, 0-3 scale | 0 | 100% | data_structures | quiz_flashcard | 3 case(s) below threshold or failed live generation. |

The evidence run executed the JSONL benchmark runner for Ollama and Groq, plus the seed-corpus validator and license/source reporter. Source grounding is still scored heuristically; there is no independent judge that verifies citations against retrieved chunks.

## 7. Manual Workflow Testing

The evidence suite executed a live API smoke workflow against an isolated backend, temporary SQLite database, temporary upload directory, live Ollama, and silence TTS for video generation. The screenshots linked in this report are generated from reproducible HTML evidence pages, while browser UI and Network-tab screenshots remain recommended future manual evidence.

- API health and live Ollama readiness: passed
- Protected route rejects missing token: passed
- Signup, invalid login, valid login, and onboarding: passed
- Supported material upload, ingest job, and chunks: passed
- Unsupported upload rejection: passed
- Manual note CRUD and live AI note generation: passed
- Live flashcard generation and SRS review: passed
- Live quiz generation, attempt scoring, and wrong answers: passed
- Live guided tutor session, feedback, notes, and finish: environment-dependent (tutor_followup_failed)
- Dashboard and progress after learning activity: passed
- Video/storyboard job and MP4 readiness with silence TTS: environment-dependent (video_start_failed_409: {"error":"storyboard_review_required","message":"Generate and approve a storyboard before rendering MP4."})
- Cross-user ownership, export, and delete: passed

Documentation evidence scanned:

| File | Line | Evidence |
| --- | --- | --- |
| README.md | 64 | Dataset/evaluation summary: |
| README.md | 72 | - `docs/noesis-demo-readiness.md` - final demo startup, smoke checklist, and fallback plan. |
| README.md | 76 | - `docs/noesis-ai-evaluation.md` - evaluation framework and evidence. |
| README.md | 83 | ## Testing and Evaluation Report |
| README.md | 88 | node scripts/run-testing-evaluation-suite.js |
| README.md | 91 | This runs backend unit/integration tests, live API smoke workflows, live Ollama JSONL evaluations, frontend static verification, knowledge validation, license/source reporting, Word-document claim comparison, and headless Chrome screenshot capture. It writes a timestamped evidence run under `docs/test-evidence/runs/<timestamp>/`. |
| README.md | 93 | The full suite expects Ollama to be available at `http://localhost:11434` with the default models `llama3.2:latest` and `nomic-embed-text:latest`. It uses isolated test storage under the evidence run directory and `TTS_ENGINE=silence` for automated video evidence. |
| README.md | 97 | - `docs/testing-evaluation-report.md` |
| README.md | 98 | - `docs/testing-evaluation-summary.json` |
| README.md | 99 | - `docs/testing-evaluation-screenshot-index.md` |
| README.md | 100 | - `docs/test-evidence/runs/<timestamp>/logs/` |
| README.md | 101 | - `docs/test-evidence/runs/<timestamp>/results/` |
| CLAUDE.md | 108 | - `generateJSON()` |
| CLAUDE.md | 118 | Model choice must be based on evaluation, not guessing. |
| CLAUDE.md | 122 | - JSON reliability |
| CLAUDE.md | 138 | - Strict JSON generation |
| CLAUDE.md | 143 | When improving the system, evaluate stronger local models through Ollama, especially models suitable for coding, reasoning, and education. |
| CLAUDE.md | 145 | Do not assume a model is better without testing. |
| CLAUDE.md | 147 | Create a simple evaluation script or test suite before switching the default model. |
| CLAUDE.md | 182 | - Hybrid retrieval: |
| CLAUDE.md | 187 | - Top-k retrieval tuning per feature |
| CLAUDE.md | 275 | 4. Evaluation tests |
| CLAUDE.md | 287 | - Add evaluation set for OOP/Data Structures |
| CLAUDE.md | 300 | - Suitability for fine-tuning vs RAG/evaluation |
| codex-review-report.md | 1 | # Noesis Adversarial Review |
| codex-review-report.md | 3 | ## Phase 1 - Adversarial Review |
| codex-review-report.md | 16 | 4. **Manual notes can reference another user's material because `material_id` is inserted without ownership validation** - `backend/routes/note.routes.js:30`, `backend/routes/note.routes.js:33`, `backend/routes/note.routes.js:35`. |
| codex-review-report.md | 34 | 10. **AI JSON repair can amplify large malformed outputs into another expensive model call and still returns 500 on schema failure** - `backend/utils/jsonSafe.js:37`, `backend/utils/jsonSafe.js:40`, `backend/utils/jsonSafe.js:55`, `backend/utils/jsonSafe.js:60`, `backend/utils/prompts.js:74`. |
| codex-review-report.md | 35 | Repro: make Ollama return a code fence with no JSON or a large malformed JSON blob; the repair prompt receives the full raw text, then parse/schema failure bubbles as 500. |
| codex-review-report.md | 43 | 13. **SQL injection review: no direct SQL injection found in route inputs** - queries use `better-sqlite3` placeholders throughout, e.g. `backend/routes/quiz.routes.js:100`, `backend/services/material.service.js:31`. The only dynamic SQL field list in `backend/services/video.service.js:74` is built from internal keys, not request input. |
| codex-review-report.md | 45 | 14. **Process-spawn review: no shell injection found, but user/model text is passed to TTS processes and can still cause argument-length failures** - `backend/services/video.service.js:48`, `backend/services/tts.service.js:11`, `backend/services/tts.service.js:27`, `backend/services/tts.service.js:39`, `backend/services/video.service.js:110`. |
| codex-review-report.md | 50 | 1. **Fresh smoke flow with only Ollama + ffmpeg will fail at video TTS** - `backend/services/tts.service.js:51`, `backend/services/tts.service.js:61`, `backend/services/tts.service.js:62`, `backend/services/tts.service.js:63`, `backend/README.md:15`, `backend/README.md:16`. |
| codex-review-report.md | 60 | Repro: review the same card "Good" multiple times; `prev.reps` is always absent, so it schedules as a first review repeatedly. |
| codex-review-report.md | 80 | 11. **AI schema mismatches are mostly fatal instead of user-actionable** - `backend/routes/flashcard.routes.js:18`, `backend/routes/quiz.routes.js:17`, `backend/routes/tutor.routes.js:17`, `backend/services/video.service.js:18`, `backend/utils/jsonSafe.js:67`. |
| codex-review-report.md | 81 | Repro: make Ollama omit `correct_idx` or return 3 options; repair fails schema validation and the user sees a generic 500, not a 422 with retry guidance. |
| codex-review-report.md | 88 | - `Dashboard.jsx` expects `greeting`, `weekly_hours`, `due_review_preview`, `resume_items`, `concept_map`, `upcoming`, and `insights`; `/api/dashboard` supplies those shapes (`backend/routes/dashboard.routes.js:81`, `project/components/Dashboard.jsx:14`). |
| backend/README.md | 42 | Auth uses an **httpOnly session cookie** (`noesis_session`, `SameSite=Lax`, 7-day expiry). The frontend automatically sends it via `credentials: 'include'`. For curl/test use, the same JWT is also returned in the JSON body and accepted as `Authorization: Bearer <token>`. |
| backend/README.md | 71 | - `GET  /api/auth/export` — JSON dump of all your data |
| backend/README.md | 89 | - `POST /api/flashcards/:id/review` — `{ rating: 1\|2\|3\|4 }` (SM-2) |
| backend/README.md | 100 | ### Tutor (Socratic / Explain / Example) |
| backend/README.md | 128 | 1. **Script** — RAG retrieves top chunks for the concept; Ollama generates a JSON script (`{ slides:[{ title, bullets, narration }] }`) which is schema-validated. |
| backend/README.md | 146 | - **PowerPoint uploads** — `.pptx` decks are indexed by extracting slide text and speaker-note text from the Office XML package. Legacy `.ppt` uploads are accepted by validation but ingestion fails with a clear message asking you to save as `.pptx`. |
| backend/README.md | 162 | ├── utils/                 # logger, jsonSafe, prompts |
| backend/ASSUMPTIONS.md | 11 | - **Ollama JSON mode** — we request `format: 'json'` but always fall back to `utils/jsonSafe.js` which extracts the first balanced object/array, schema-validates with zod, and retries once with a "fix this JSON" repair prompt before erroring. |
| backend/ASSUMPTIONS.md | 15 | - **Supported types** — PDF, DOCX, DOC, TXT, MD. Images / scanned PDFs are not OCR'd. |
| backend/TODO.md | 16 | - Scanned-PDF OCR via Tesseract.js. |
| backend/TODO.md | 42 | ## Tests |
| backend/TODO.md | 43 | - Vitest + supertest API smoke suite. |
| backend/TODO.md | 44 | - Snapshot-test the JSON shapes the frontend depends on. |
| backend/codex-review.md | 1 | # Codex Adversarial Review — Noēsis Backend |
| backend/codex-review.md | 3 | > Hand this prompt to Codex (or a second reviewer) once the backend boots cleanly. |
| backend/codex-review.md | 10 | You are an adversarial reviewer for **Noēsis**, a local-first learning app. The backend lives in `backend/` (Node 18 + Express + better-sqlite3 + Ollama). The frontend in `project/` is a static Babel-standalone React 18 app whose components were edited to call the new `project/api.js` (do **not** redesign the UI; the brief mandates "DO NOT change UI"). |
| backend/codex-review.md | 21 | - `backend/utils/{jsonSafe,prompts,logger}.js` |
| backend/codex-review.md | 27 | ### Phase 1 — Adversarial review (find concrete defects) |
| backend/codex-review.md | 33 | - Password storage: bcrypt cost, timing attacks, password length validation. |
| backend/codex-review.md | 38 | - AI JSON parser failure modes (`utils/jsonSafe.js`): what happens with code-fence-only output, malformed nested strings, or a 1 MB blob? |
| backend/codex-review.md | 44 | - AI JSON schema mismatches when Ollama returns lowercase booleans, trailing commas, or omits required fields. |
| backend/codex-review.md | 47 | - SRS edge cases (rating boundaries, first-review cards, time-zone correctness on `due_at`). |
| backend/codex-review.md | 58 | ### Phase 2 — Evaluation |
| backend/codex-review.md | 62 | 2. **Is it demo-ready?** Will the smoke flow in `README.md` §Verification complete on a fresh machine with Ollama + ffmpeg installed? |
| backend/codex-review.md | 73 | Stop after Phase 3. I will apply fixes top-down and re-run the smoke flow. |

## 8. Tests Already Mentioned in the Document

Source document status: parsed.

| Item | Documented testing/evaluation line |
| --- | --- |
| 1 | 4.21 Testing Strategy |
| 2 | Testing was performed to verify that Noēsis works correctly and meets its main functional requirements. The testing strategy included automated testing, manual functional testing, AI-output evaluation, frontend build verification, and environment readiness checks. |
| 3 | The testing objectives were: |
| 4 | Verify that quiz attempts calculate scores correctly. |
| 5 | 4.22 Test Environment |
| 6 | The test environment included the local backend, local frontend build, SQLite database, test scripts, and validation commands. |
| 7 | The main test commands included: |
| 8 | npx vitest run --fileParallelism=false --maxWorkers=1 --sequence.concurrent false |
| 9 | npm run eval:noesis:dry-run -- --feature=all |
| 10 | Additional checks included license validation and dataset reporting scripts. |
| 11 | The serialized backend test command was used because running all backend tests in parallel can cause local resource contention or timeouts. Running tests serially provided a more stable and repeatable validation process. |
| 12 | 4.23 Automated Testing Results |
| 13 | The recorded automated testing evidence showed the following results: |
| 14 | 56 test files passed. |
| 15 | Serialized backend test count |
| 16 | 457 tests passed. |
| 17 | 10 markers passed. |
| 18 | Curated knowledge validation |
| 19 | Evaluation dry run |
| 20 | 21 committed cases discovered across 7 JSONL files. |
| 21 | License validation |
| 22 | These results show that the implemented backend services, frontend bundle, curated knowledge files, and evaluation dataset structure passed the recorded verification checks. |
| 23 | 4.24 Test Coverage Areas |
| 24 | The backend test suite covered a wide range of system areas, including: |
| 25 | Evaluation controls and scoring. |
| 26 | Schema validation. |
| 27 | Source-grounding judge. |
| 28 | This coverage is important because Noēsis is not a single-feature system. It contains many connected workflows, and testing needed to cover both normal application behavior and AI-specific quality controls. |
| 29 | 4.25 AI Evaluation Framework |
| 30 | The AI evaluation framework was implemented under the training and evaluation folders. It contains JSONL evaluation files for important learning features. |
| 31 | The evaluation suite includes: |
| 32 | Evaluation File |
| 33 | big_o_eval.jsonl |
| 34 | data_structures_eval.jsonl |
| 35 | notes_eval.jsonl |
| 36 | oop_eval.jsonl |
| 37 | quiz_flashcard_eval.jsonl |
| 38 | tutor_response_eval.jsonl |
| 39 | video_storyboard_eval.jsonl |
| 40 | The evaluation framework separates the evaluation process into feature groups. This allows the team to check whether AI outputs are valid, relevant, and suitable for the intended learning feature. |
| 41 | A previously recorded full-suite evaluation run completed all 21 records with no errors. The recorded average score was 2.52 out of 3, and the JSON validity rate was 1.0. The strongest area was video/storyboard generation, while weaker areas identified for future improvement included tutor depth and queue notes. |
| 42 | This evaluation suite is considered a starter evaluation set, not a complete academic benchmark. It provides useful evidence for the current graduation project, but future work should expand the number of evaluation cases, add more topics, include more student feedback, and compare results across different AI providers. |
| 43 | 4.26 Functional Test Cases |
| 44 | The following table summarizes the main functional test cases used to validate the system. |
| 45 | Test Case ID |
| 46 | Test Case |
| 47 | Passed |
| 48 | Passed |
| 49 | Passed |
| 50 | Passed |
| 51 | Passed |
| 52 | Passed |
| 53 | Passed |
| 54 | Passed |
| 55 | Passed |
| 56 | Passed |
| 57 | Score, feedback, and wrong answers are saved. |
| 58 | Passed |
| 59 | Passed |
| 60 | Passed |
| 61 | Passed |
| 62 | Passed |
| 63 | Passed |
| 64 | Passed |
| 65 | Passed |
| 66 | Passed with environment dependency |
| 67 | Passed |
| 68 | Passed |
| 69 | Passed |
| 70 | 4.27 Manual Workflow Testing |
| 71 | Manual testing was used to validate complete user workflows from the student’s perspective. These tests were important because automated tests cannot fully measure usability and learning flow. |
| 72 | The main manual workflows included: |
| 73 | Testing video rendering when local tools are available. |
| 74 | The manual workflow tests helped identify areas where the user interface, AI output, or environment setup needed improvement. |


### Word Document Claim Comparison

| Word claim | Expected/documented | Current evidence | Status |
| --- | --- | --- | --- |
| 56 backend test files passed | 56 | 56 | supported |
| 457 backend tests passed | 457 | 457 | supported |
| 23 frontend source files built | 23 | 1 | not supported by current repo evidence |
| 10 chat bundle markers passed | 10 | 11 | not supported by current repo evidence |
| 10 curated knowledge files validated | 10 | 20 | not supported by current repo evidence |
| 21 eval records across 7 JSONL files | 21 | 21 | supported |
| 7 JSONL eval files | 7 | 7 | supported |
| 10 tracked sources validated for licenses | 10 | 28 | not supported by current repo evidence |
| OCR tests exist | present | 0 | not supported by current repo evidence |
| Study room tests exist | present | 0 | not supported by current repo evidence |
| Caption/Remotion tests exist | present | 0 | not supported by current repo evidence |


## 9. Tests Found in the Codebase but Not Mentioned in the Document

| Kind | Path/command | Why it should be added |
| --- | --- | --- |
| test file | backend/__tests__/auth.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/captions-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/chunk-metadata.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/educational-context.service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/eval-comparison.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/eval-generation-controls.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/eval-scoring.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/extract-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/extraction-quality.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/gamification-social-routes.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/gamification-social.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/generation-scope-domain.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/grounded-enrichment.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/helpers/setup.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/json-safe.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/knowledge-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/learning-map-layout.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/lesson-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/material-diagnostics.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/material-topic-map.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/material-understanding.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/note-generation-repair.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/notes-audio.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/notes-prompt.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/ocr-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/practice-generation-routes.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/practice-prompts.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/rag-tiers.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/rag.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/remotion-visual-smoke.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/render-visual-assets.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/schema-validation.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/seed-knowledge-corpus.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/slides-visual-mapping.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/source-grounding-judge.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/source-topic-plan.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/source-visual-candidates.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/storyboard-gate-enforcement.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/storyboard-repair.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/storyboard-review-ui-safety.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/storyboard-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/study-plan-service.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/topic-resolver.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/topic-visual-standards.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tts-detection.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tts-splitting.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tutor-chat.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tutor-context-prompt.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tutor-quality.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/tutor-routes.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/video-captions-route.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/video-grounding-regression.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/video-quality.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/video-regression.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/visual-composition.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/visual-quality-regression.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/__tests__/visual-registry.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/tests/integration.test.js | Automated test evidence should be listed in the testing chapter. |
| test file | backend/tests/unit.test.js | Automated test evidence should be listed in the testing chapter. |
| evaluation file | backend/__tests__/eval-comparison.test.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/__tests__/eval-generation-controls.test.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/__tests__/eval-scoring.test.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/__tests__/source-grounding-judge.test.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/eval/eval-ollama-llama3.2-3b-1778873159187.json | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/eval/eval-ollama-qwen2.5-coder-7b-1778952567432.json | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/eval/eval-video-ollama-qwen2.5-coder-7b-2026-05-16T20-02-57-558Z.json | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/eval/eval-video-ollama-qwen2.5-coder-7b-2026-05-16T20-10-00-396Z.json | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/scripts/eval-model.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/scripts/eval-noesis-compare.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/scripts/eval-noesis-generation.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/scripts/eval-video.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/services/source-grounding-judge.service.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | backend/utils/eval-scoring.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | docs/noesis-ai-evaluation.md | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | docs/testing-evaluation-report.docx | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | docs/testing-evaluation-screenshot-index.md | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/big_o_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/data_structures_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/notes_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/oop_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/quiz_flashcard_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/tutor_response_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | eval/noesis/video_storyboard_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | scripts/generate-testing-evaluation-docx.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | scripts/run-testing-evaluation-suite.js | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/README.md | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/big_o_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/data_structures_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/notes_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/oop_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/quiz_flashcard_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/tutor_response_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/eval/video_storyboard_eval.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| evaluation file | training/samples/noesis_training_format.sample.jsonl | AI evaluation evidence should be listed in the evaluation framework section. |
| validation/source file | backend/__tests__/schema-validation.test.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/__tests__/source-grounding-judge.test.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/__tests__/source-topic-plan.test.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/__tests__/source-visual-candidates.test.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/scripts/validate-knowledge.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/services/source-grounding-judge.service.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/services/source-topic-plan.service.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | backend/services/source-visual-candidates.service.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | scripts/validate-knowledge.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | scripts/validate-licenses.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | training/scripts/collect_sources.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | training/scripts/validate_licenses.js | Validation evidence should be documented if it supports testing claims. |
| validation/source file | training/sources/licenses.md | Validation evidence should be documented if it supports testing claims. |
| validation/source file | training/sources/sources.json | Validation evidence should be documented if it supports testing claims. |
| test/evaluation command | cd backend && npm run knowledge:validate | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run eval:noesis | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run eval:noesis:dry-run | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run eval:noesis:compare | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run eval:video | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run test | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run test:watch | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run test:legacy | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run eval:noesis:evidence | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run knowledge:validate:evidence | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run license:validate | Runnable verification commands should be listed in the commands section. |
| test/evaluation command | cd backend && npm run test:evidence | Runnable verification commands should be listed in the commands section. |

## 10. Documented Claims That Need More Evidence

- The Word document's historical claim of 56 test files and 457 tests is compared against the generated evidence, which currently verifies 457 backend tests across 56 test files.
- OCR, study rooms/social features, and caption/Remotion-specific tests remain unsupported by current repository evidence.
- AI grounding is evaluated through keyword, JSON-shape, and relevance heuristics; no independent source-grounding judge is present.
- License/source validation now exists, but the latest run reported warnings or unknown license metadata; review `docs/test-evidence/runs/2026-06-19T23-37-22-521Z/logs/license-validate.log`.
- Browser UI screenshots and Network-tab mechanism screenshots are not automated yet; the captured PNGs are reproducible evidence-page screenshots.
- Load, stress, cross-browser, accessibility, penetration, and real-student usability evidence were not found.

## 11. Scoring and Evaluation Summary

| Component | Weight | Score awarded | Reason |
| --- | --- | --- | --- |
| automatedTests | 40 | 40 | Computed from backend Vitest/Node test pass rate. |
| aiEvaluation | 25 | 16.2 | Computed from live Ollama and Groq JSONL average scores. |
| manualWorkflowTesting | 20 | 19.2 | Computed from API smoke workflow steps; environment-dependent steps count partially. |
| buildEnvironmentValidation | 15 | 5 | Computed from frontend, knowledge, and license validation commands. |

- Overall testing confidence score: 80.3/100.
- Automated test pass rate: 100%.
- Frontend build status: failed or partial.
- Evaluation dataset count: ollama: 7; groq: 7.
- AI average score: ollama: 2.78/3 (21/21 passed, model qwen2.5-coder:7b); groq: 1.1/3 (8/21 passed, model openai/gpt-oss-120b).
- JSON validity rate: ollama: 42.9%; groq: 23.8%.
- Coverage summary: 10 workflow steps passed, 2 environment-dependent, 0 failed.

The score is intentionally conservative. It rewards verified repository artifacts and does not infer passing behavior from implementation files alone.

## 12. Limitations

- AI evaluation scores depend on the live Ollama/Groq models, local runtime performance, API availability, and generation variance.
- The evidence screenshots are rendered from generated HTML evidence pages; they do not replace live frontend UI screenshots or Network-tab captures.
- Video evidence used `TTS_ENGINE=silence`; real TTS quality remains environment-dependent.
- OCR for scanned PDFs, study rooms/social features, and caption/Remotion-specific coverage are still not implemented or not evidenced in the current repo.
- License/source validation reports package metadata warnings that need human review.
- No load, stress, cross-browser, accessibility, penetration, or real-student usability-study evidence was found.

## 13. Recommendations

- Expand the Node test suite if the dissertation must support the historical 56-file/457-test claim.
- Add Playwright browser tests that capture real frontend states and Network-tab/API mechanism evidence.
- Add an independent source-grounding judge that checks generated answers against retrieved chunks.
- Resolve license/source warnings and document acceptable third-party package licenses.
- Add or remove claims for OCR, study rooms, captions, and Remotion depending on the final supported product scope.
- Add accessibility, cross-browser, security, load, and usability testing before production use.

## 14. Final Conclusion

The current Noesis repository now includes a reproducible testing and evaluation evidence suite for the main graduation-project workflows: backend unit checks, live API smoke workflows, live Ollama and Groq JSONL evaluations, frontend static verification, knowledge validation, license/source reporting, Word-claim comparison, and screenshot evidence. It supports the implemented core product much more strongly than before, while still clearly separating new verified evidence from unsupported historical claims in the Word document.

## Screenshot Evidence Guide

Create `docs/screenshots/` when collecting manual evidence. Do not capture secrets from `.env`, JWTs, cookies, authorization headers, private files, or personal data.

- `01-report-command.png` - Terminal output after running node scripts/generate-testing-evaluation-report.js.
- `02-summary-json.png` - Opened docs/testing-evaluation-summary.json.
- `03-api-health.png` - GET /api/health response after the backend is started.
- `04-signup-onboarding.png` - Registration and onboarding flow.
- `05-material-upload-job.png` - Material upload and job progress/polling.
- `06-notes-generation.png` - Generated notes view.
- `07-flashcards-review.png` - Flashcard generation and review.
- `08-quiz-score.png` - Quiz attempt and final score.
- `09-tutor-session.png` - Tutor or guided tutor session.
- `10-dashboard-progress.png` - Dashboard/progress update after study activity.
- `11-video-job-playback.png` - Video/storyboard generation job and playback when Ollama, TTS, and ffmpeg are available.
- `12-network-mechanisms.png` - Browser Network tab showing authenticated API requests and job polling.

Recommended mechanism screenshots:

- Browser Network tab showing `/api/jobs/:id` polling during upload/video jobs.
- Browser Network tab showing authenticated API calls without exposing token/cookie values.
- Terminal showing backend startup, Ollama availability, and report generation command output.
- UI screenshots after each workflow completes, especially quiz score, dashboard update, and generated video playback.
