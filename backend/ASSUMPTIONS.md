# Assumptions & MVP Boundaries

## Architecture
- **Single-process Node app** — no separate worker; the video and material-ingest queues run in-memory inside the API server. A restart drops in-flight jobs.
- **In-memory job registry** — `services/jobs.service.js` does not persist. Polling `GET /api/jobs/:id` after a server restart returns 404.
- **In-memory vector search** — embeddings are stored as Float32 BLOBs in SQLite, but cosine similarity is computed in JS by loading the material's vectors per query. Fine for MVP (a textbook ≈ a few hundred chunks); not suitable for many-thousands of chunks.

## AI / RAG
- **Token estimator** — `chars / 4` heuristic. Good enough for chunk sizing; not a true tokenizer.
- **Concept extraction** — heuristic (no extractor wired). The `concepts` table is populated only when explicit study events update mastery; cold-start dashboards show empty concept maps.
- **Ollama JSON mode** — we request `format: 'json'` but always fall back to `utils/jsonSafe.js` which extracts the first balanced object/array, schema-validates with zod, and retries once with a "fix this JSON" repair prompt before erroring.
- **Prompt language** — English only. Non-English documents may still be embedded but generation quality is uneven.

## Materials
- **Supported types** — PDF, DOCX, DOC, TXT, MD. Images / scanned PDFs are not OCR'd.
- **Chapter detection** — regex on heading lines (`Chapter`, `Ch.`, `Section`, numbered headings, `# / ##`). When no headings match, the document is treated as a single chapter.
- **Per-user scoping** — every query that returns or modifies user-owned data is filtered by `user_id`. There is no admin / cross-user view.

## Auth
- **Local password auth only** — Google + University SSO buttons in the UI are visual stubs (no OAuth backend in MVP).
- **JWT in localStorage** — frontend stores `noesis.token`. Acceptable for local-first; not ideal for production (XSS exposure).

## Frontend
- **Static, build-less React** — Babel-standalone in the browser. We did NOT redesign or refactor the markup; only mock arrays were swapped for `useEffect` fetches.
- **Study Rooms (`Collab.jsx`)** — kept entirely static. No realtime backend, websockets, or shared whiteboard in MVP.
- **Onboarding course catalog** — sourced from the original `Auth.jsx` mock list; selected courses are persisted to `courses` for the user.

## Video
- **Sequential queue** — only one video job runs at a time per process.
- **Slide rendering** — uses `node-canvas` if it builds successfully on the host. If not, the pipeline falls back to flat-color placeholder slides via `ffmpeg lavfi` so the run still completes.
- **TTS** — Piper preferred. `espeak-ng` and macOS `say` are fallbacks. macOS `say` outputs AIFF; ffmpeg transcodes it transparently.
- **Concat method** — `ffmpeg -f concat`, codec copy. All segments use the same encode settings to make this safe.
