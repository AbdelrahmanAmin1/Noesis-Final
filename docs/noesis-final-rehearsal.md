# Noesis Final Demo Rehearsal

Use this document as the final graduation-day rehearsal and submission checklist. It consolidates the demo path, screenshots, presentation structure, report mapping, fallback plan, and freeze list.

## Final Rehearsal Schedule

Run one full rehearsal the day before the presentation and one short rehearsal on presentation day.

### Full rehearsal

1. Start from a clean browser session.
2. Run the pre-flight commands.
3. Start backend and frontend.
4. Complete the live demo flow with a timer.
5. Capture screenshots for the report and slides.
6. Record any slow step and choose the fallback for it.
7. Do not change prompts, providers, or UI after this rehearsal unless a critical bug blocks the demo.

### Presentation-day rehearsal

1. Start services.
2. Open `/api/health`.
3. Upload one demo material.
4. Generate one tutor answer and one notes page.
5. Confirm storyboard review opens.
6. Keep docs and fallback tabs open.

## Pre-Flight Commands

Backend readiness:

```bash
cd backend
npm run demo:check
```

Knowledge and dataset checks:

```bash
node backend/scripts/validate-knowledge.js --strict
node training/scripts/dataset_report.js
```

Frontend bundle:

```bash
cd project
node build-bundle.js
```

## Start Services

Backend:

```bash
cd backend
npm start
```

Frontend:

```bash
cd project
node dev-server.js
```

Open:

```text
http://localhost:5173/Noesis
```

Health:

```text
http://localhost:3001/api/health
```

## Exact Demo Steps

1. Sign in or create a demo account.
2. Upload `demo-materials/oop-encapsulation-demo.md`.
3. Confirm the material appears in the Materials view.
4. Generate notes for the uploaded OOP material.
5. Ask the tutor: `Give me an example of encapsulation`.
6. Generate a quiz.
7. Generate flashcards.
8. Upload `demo-materials/linked-list-demo.md`.
9. Open the learning map or study plan.
10. Generate a storyboard and review scenes.
11. Show `docs/noesis-ai-evaluation.md`.
12. Show `docs/noesis-fine-tuning-roadmap.md`.

## Rehearsal Success Criteria

- All core screens load.
- Uploaded demo materials extract correctly.
- Generated outputs are learner-facing and clean.
- Notes do not show raw JSON or internal chunk IDs.
- Tutor gives a concrete example with code or a clear analogy.
- Quiz and flashcard outputs are usable.
- Storyboard review remains presentable even if MP4 rendering is skipped.
- No stack traces, provider secrets, or raw eval reports appear on screen.

## Screenshots To Capture

Use ordered filenames so they can drop into slides or the final report.

- `01-health.png` - `/api/health` response with no secrets visible.
- `02-dashboard.png` - Noesis dashboard after login.
- `03-materials-upload.png` - Materials page with uploaded OOP demo material.
- `04-material-detail.png` - Material detail or generated learning workspace.
- `05-tutor-encapsulation.png` - AI Tutor answer with a concrete encapsulation example.
- `06-notes-generated.png` - Generated notes with code/example/quiz sections.
- `07-quiz-question.png` - Quiz question with options and explanation.
- `08-flashcards.png` - Flashcard review screen.
- `09-learning-map.png` - Learning map screen.
- `10-study-plan.png` - Study plan screen.
- `11-storyboard-review.png` - Storyboard review with concrete scenes or visuals.
- `12-evaluation-doc.png` - Evaluation documentation with 21-record starter eval summary.
- `13-fine-tuning-roadmap.png` - Fine-tuning roadmap showing the current "do not fine-tune now" decision.

## Presentation Slide Outline

1. Title and problem statement: students need grounded, interactive AI study support.
2. Project overview: Noesis features and target users.
3. System architecture: frontend, backend, SQLite, RAG, providers.
4. RAG pipeline: upload, extraction, chunking, retrieval, educational context.
5. Curated OOP/DS knowledge base: 10 structured topics and why it improves quality.
6. AI learning features: tutor, notes, quizzes, flashcards, learning map, video/storyboard.
7. Evaluation framework: 7 JSONL sets, 21 starter records, deterministic scoring.
8. Results and interpretation: Groq full run summary, strengths, weaknesses, no fine-tuning yet.
9. Demo workflow: exact live path using safe demo materials.
10. Limitations and future work: larger evals, more curated topics, pilot dataset, future LoRA/QLoRA.

## Written Report Section Mapping

| Report section | Source docs and talking points |
|---|---|
| Introduction | `README.md`, `docs/noesis-demo-script.md`; explain learner problem and project goal. |
| System architecture | `docs/noesis-ai-architecture.md`; include frontend, backend, SQLite, RAG, providers. |
| RAG pipeline | `docs/noesis-rag-and-knowledge-base.md`; describe uploaded-first grounding. |
| Curated knowledge base | Mention 10 OOP/DS topics and `validate-knowledge.js`. |
| Feature implementation | AI Tutor, notes, quizzes, flashcards, learning map, study plan, storyboard/video. |
| Evaluation | `docs/noesis-ai-evaluation.md`; cite 7 eval files, 21 records, Groq average 2.52/3, 0 errors. |
| Fine-tuning discussion | `docs/noesis-fine-tuning-roadmap.md`; state fine-tuning is future work. |
| Demo procedure | `docs/noesis-demo-readiness.md` and this rehearsal doc. |
| Limitations | Small eval suite, limited curated topic count, provider availability, video render time. |
| Future work | More eval coverage, more topics, reviewed pilot dataset, optional LoRA/QLoRA later. |

## Demo Fallback Plan

| Risk | Fallback |
|---|---|
| Groq rate limit or outage | Use Ollama/local paths where available, shorten prompts, and show evaluation docs. |
| Ollama unavailable | Use Groq-backed configured features if available; otherwise demonstrate UI, uploaded material, docs, and eval evidence. |
| `demo.ok` is false | Inspect detailed health fields; continue with core ready flows if backend and AI generation work. |
| Upload extraction issue | Use the authored Markdown demo materials. |
| Video render delay | Stop at storyboard review and explain MP4 rendering as asynchronous/optional. |
| TTS failure | Continue with text notes, tutor chat, and storyboard review. |
| Slow provider response | Use one short tutor answer, one notes generation, one quiz, and storyboard review only. |
| Live demo timing pressure | Skip MP4 render and detailed flashcard review; show screenshots and docs. |

## Final QA Checklist

- `docs/noesis-demo-readiness.md` exists.
- `docs/noesis-demo-script.md` exists.
- `docs/noesis-ai-architecture.md` exists.
- `docs/noesis-rag-and-knowledge-base.md` exists.
- `docs/noesis-ai-evaluation.md` exists.
- `docs/noesis-fine-tuning-roadmap.md` exists.
- `docs/noesis-final-rehearsal.md` exists.
- `demo-materials/oop-encapsulation-demo.md` exists.
- `demo-materials/linked-list-demo.md` exists.
- Generated eval reports are still ignored.
- Demo docs do not include API keys, raw generated report JSON, private course content, or internal chunk IDs.
- Screenshots are captured and named in order.
- Backup path is ready if video rendering is slow.

## Final Submission Checks

Run:

```bash
rg -n "GROQ[_]API[_]KEY|sourceChunk[I]ds|eval-report-all-.*[.]json" docs demo-materials
node training/scripts/dataset_report.js
node backend/scripts/validate-knowledge.js --strict
cd backend
npm run demo:check
```

Expected:

- Safety grep returns no matches.
- Dataset report shows 7 eval files and 21 eval records.
- Knowledge validation passes.
- Demo check prints local config and either reachable health status or an actionable backend-offline message.

## Freeze List

After the final rehearsal, do not change:

- provider routing
- prompts
- UI layout
- database schema
- dependencies
- demo materials
- curated knowledge structure
- eval scorer logic
- generated report policy

Also do not:

- fine-tune a model
- download datasets
- commit generated eval reports
- use private or copyrighted course material in the live demo without permission
