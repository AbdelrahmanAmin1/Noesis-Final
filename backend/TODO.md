# TODO / Next steps

## Reliability
- Persist the job registry (SQLite `jobs` table) so polling survives restarts.
- Wrap the in-process video queue with a real job runner (BullMQ + Redis, or `agenda` on SQLite).
- Resumable material ingest: skip extract/chunk/embed steps that already produced rows.

## Vector search
- Switch to `sqlite-vss` or move to Postgres + pgvector once chunk count grows past ~10k.
- Approximate-NN index (HNSW) for sub-100 ms top-k.

## RAG quality
- Real tokenizer (`tiktoken-node` or `js-tiktoken`) for accurate chunk sizing.
- Heading-aware splitter (markdown / DOCX outline) instead of regex-only chapter detection.
- LLM-assisted concept extraction (`prompts.CONCEPT_EXTRACT` is wired but not auto-invoked) feeding the `concepts` mastery map.
- Scanned-PDF OCR via Tesseract.js.

## Auth & multi-user
- Real OAuth (Google, University SSO) — UI buttons in `Auth.jsx` already exist.
- Move JWT from `localStorage` to httpOnly cookie + CSRF token.
- Refresh tokens, password reset flow.

## Collaboration
- Replace static `Collab.jsx` mock with a small WebSocket service (e.g. `ws` + room rooms keyed by code).
- Operational-transform / CRDT for shared notes.
- Real voice via WebRTC SFU.

## Integrations
- Google Drive / Notion / Canvas LMS importers (UI tiles already in Settings).
- Calendar sync for "Upcoming" cards.

## Video
- Crossfade between slides instead of straight concat.
- Background music + subtle motion (Ken Burns) for slides.
- Voice library selector in Settings → Learning style.
- Captioning track baked from the script (WebVTT) for accessibility.

## Observability
- Structured logs (pino) + per-request id.
- Basic metrics (Prometheus exporter).

## Tests
- Vitest + supertest API smoke suite.
- Snapshot-test the JSON shapes the frontend depends on.
