# Noesis Demo Readiness Checklist

Use this checklist before the final graduation demo. It is intentionally practical: start services, confirm health, upload safe demo material, and verify the main learning flows.

## Startup Commands

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd project
node build-bundle.js
node dev-server.js
```

Open the app:

```text
http://localhost:5173/Noesis
```

Health endpoint:

```text
http://localhost:3001/api/health
```

Optional local readiness helper:

```bash
cd backend
npm run demo:check
```

## Health Check Guide

`/api/health` reports several layers:

- `ok`: overall backend and configured generation status.
- `ai`: current generation and embedding provider status.
- `tts`: text-to-speech engine detection.
- `renderer`: video renderer readiness.
- `demo`: stricter demo-mode readiness.

Important: `demo.ok` can be false even when core app flows still work. Demo mode checks stricter conditions such as cloud generation readiness for notes/video and Piper-style TTS readiness. If the backend, uploads, notes, tutor, quizzes, and flashcards work, the app may still be demo-usable with a fallback plan.

## Recommended Demo Setup

- Use the small project-authored files in `demo-materials/`.
- Avoid huge PDFs during the live demo.
- Prefer these topics: Encapsulation, Polymorphism, Linked List, Stack, Queue, and Big-O.
- Build the frontend bundle before the demo.
- Keep a browser tab open to `/api/health`.
- Keep the evaluation docs open instead of raw generated reports.

## End-To-End Smoke Checklist

- Backend starts without crashing.
- Frontend loads at `http://localhost:5173/Noesis`.
- `/api/health` responds.
- User can sign in or create a demo account.
- User can upload `demo-materials/oop-encapsulation-demo.md`.
- Uploaded material appears in Materials.
- Notes generation works.
- Notes render cleanly with no raw JSON or internal chunk IDs.
- AI Tutor starts with the selected material.
- AI Tutor gives a useful "Give me an example" response with concrete code.
- Quiz generation works.
- Flashcard generation works.
- Learning map opens for a material.
- Study plan opens or can be created.
- Storyboard generation works for an OOP or Data Structures topic.
- Video rendering is optional; storyboard review is the safer live demo path.
- Errors show helpful messages instead of blocking the whole app.

## Fallback Plan

| Risk | Demo fallback |
|---|---|
| Groq is unavailable or rate-limited | Switch to local Ollama-backed flows where possible; show evaluation docs and pre-generated storyboard evidence. |
| Ollama is not running | Use configured cloud-backed features if available; otherwise demonstrate uploaded material, UI flows, docs, and evaluation package. |
| TTS fails | Continue with text notes, tutor chat, and storyboard review. Audio is not required to prove the learning workflow. |
| Video render takes too long | Stop at storyboard review and explain that approved storyboards render asynchronously. |
| Upload extraction fails for a large file | Use the small Markdown demo materials. |
| Health demo flag is false | Inspect the `demo` object; continue with core flows that report ready and explain stricter demo-mode checks. |
| Provider output is slow | Use shorter requests: tutor example, notes for one topic, 3-question quiz, or storyboard-only demo. |

## Presenter Known Issues

- Generated eval reports are ignored and should not be committed or opened as raw JSON during the presentation.
- The eval suite is a starter quality check, not a full academic benchmark.
- The curated knowledge base focuses on selected OOP/Data Structures topics.
- Fine-tuning has not been performed.
- Uploaded material quality still affects grounding.
- Groq on-demand tiers may require long delays for full eval runs.

## Final Demo Order

1. Open `/api/health` and confirm the backend is responsive.
2. Open `http://localhost:5173/Noesis`.
3. Upload `oop-encapsulation-demo.md`.
4. Ask the tutor for an encapsulation example.
5. Generate notes from the material.
6. Generate quiz and flashcards.
7. Upload `linked-list-demo.md`.
8. Show learning map or study plan.
9. Generate a storyboard and review scenes.
10. Show `docs/noesis-ai-evaluation.md` for evidence and `docs/noesis-fine-tuning-roadmap.md` for future work.
