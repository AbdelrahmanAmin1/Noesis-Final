# Noesis AI Learning Assistant

Noesis is a graduation project that turns uploaded course material into an interactive learning workspace. It supports AI tutor chat, generated notes, quizzes, flashcards, study planning, learning maps, and storyboard/video explanations for OOP and Data Structures topics.

The current demo architecture is not fine-tuned. Quality comes from uploaded-material RAG, a curated OOP/Data Structures knowledge base, feature-specific prompts, and configurable Groq/Ollama providers.

## Quick Start

Start the backend:

```bash
cd backend
npm install
npm start
```

Start the frontend:

```bash
cd project
node build-bundle.js
node dev-server.js
```

Open:

```text
http://localhost:5173/Noesis
```

Health check:

```text
http://localhost:3001/api/health
```

## Demo Provider Strategy

- Ollama is the local-first provider and does not require a cloud key.
- Groq is optional for stronger demo-quality generation when configured.
- Uploaded material remains the source of course-specific truth.
- Curated OOP/Data Structures knowledge expands explanations, examples, diagrams, mistakes, quizzes, and flashcards.
- Fine-tuning is future work, not part of the current demo.

## Useful Commands

Backend:

```bash
cd backend
npm start
npm run knowledge:validate
npm run demo:check
```

Frontend:

```bash
cd project
node build-bundle.js
node dev-server.js
```

Dataset/evaluation summary:

```bash
node training/scripts/dataset_report.js
```

## Documentation

- `docs/noesis-demo-readiness.md` - final demo startup, smoke checklist, and fallback plan.
- `docs/noesis-demo-script.md` - presenter walkthrough.
- `docs/noesis-ai-architecture.md` - current AI architecture.
- `docs/noesis-rag-and-knowledge-base.md` - RAG and curated knowledge design.
- `docs/noesis-ai-evaluation.md` - evaluation framework and evidence.
- `docs/noesis-fine-tuning-roadmap.md` - why fine-tuning is future work.

## Safe Demo Materials

Project-authored demo materials live in `demo-materials/` and are safe for local upload during the presentation.

## Testing and Evaluation Report

Run the full repeatable evidence suite from the project root:

```bash
node scripts/run-testing-evaluation-suite.js
```

This runs backend unit/integration tests, live API smoke workflows, live Ollama JSONL evaluations, frontend static verification, knowledge validation, license/source reporting, Word-document claim comparison, and headless Chrome screenshot capture. It writes a timestamped evidence run under `docs/test-evidence/runs/<timestamp>/`.

The full suite expects Ollama to be available at `http://localhost:11434` with the default models `llama3.2:latest` and `nomic-embed-text:latest`. It uses isolated test storage under the evidence run directory and `TTS_ENGINE=silence` for automated video evidence.

Final outputs:

- `docs/testing-evaluation-report.md`
- `docs/testing-evaluation-summary.json`
- `docs/testing-evaluation-screenshot-index.md`
- `docs/test-evidence/runs/<timestamp>/logs/`
- `docs/test-evidence/runs/<timestamp>/results/`
- `docs/test-evidence/runs/<timestamp>/screenshots/`

For a lighter static report refresh using the latest evidence summary, run:

```bash
node scripts/generate-testing-evaluation-report.js
```

If a Testing and Evaluation baseline is supplied as `.txt`, `.md`, or `.docx`, pass it as an optional comparison document:

```bash
node scripts/generate-testing-evaluation-report.js path/to/testing-section.docx
```

Backend package aliases are also available from `backend/`:

```bash
npm test
npm run eval:noesis
npm run knowledge:validate
npm run license:validate
npm run frontend:verify
npm run test:evidence
```

The suite records failures honestly. Environment-dependent video, TTS, ffmpeg, or Ollama failures are written to logs and summarized in the report instead of being converted into passing results.

### Screenshot Evidence

The evidence suite captures PNGs automatically from generated HTML evidence pages and indexes them in `docs/testing-evaluation-screenshot-index.md`.

For additional manual UI evidence, create `docs/screenshots/` and capture:

- Terminal output from `node scripts/run-testing-evaluation-suite.js`.
- Opened `docs/testing-evaluation-report.md`.
- Opened `docs/testing-evaluation-summary.json`.
- `GET /api/health` after the backend is running.
- Signup/onboarding, upload/job polling, notes, flashcards, quiz score, tutor session, dashboard/progress, and video playback.
- Browser Network tab showing `/api/jobs/:id` polling and authenticated API calls.

Do not capture `.env` secrets, JWTs, cookies, authorization headers, or private files.
