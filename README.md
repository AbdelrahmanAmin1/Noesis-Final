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
