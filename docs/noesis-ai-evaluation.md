# Noesis AI Evaluation

Noesis has a small evaluation framework to measure generation quality before any fine-tuning decision. The goal is to detect prompt, retrieval, schema, provider, and model-quality issues separately.

## Evaluation Dataset

The committed eval suite lives in `training/eval/` and currently contains 7 JSONL files with 21 starter records:

- `big_o_eval.jsonl`
- `data_structures_eval.jsonl`
- `notes_eval.jsonl`
- `oop_eval.jsonl`
- `quiz_flashcard_eval.jsonl`
- `tutor_response_eval.jsonl`
- `video_storyboard_eval.jsonl`

Each record describes a feature, topic, prompt, expected concepts, banned phrases, expected output type, and scoring rubric.

## Evaluation Tooling

The unified evaluator is:

```bash
cd backend
npm run eval:noesis
```

Useful modes:

```bash
npm run eval:noesis:dry-run -- --feature=all
npm run eval:noesis -- --feature=all --provider=groq --run --retries=2 --eval-json-mode=auto
npm run eval:noesis -- --feature=all --provider=ollama --run --ollama-compact-json
npm run eval:noesis:compare -- --feature=all --providers=groq,ollama
```

Groq on-demand tiers can require long pacing between records. The evaluator supports safe Groq pacing defaults and a `--fast-groq` option for intentionally faster runs.

## Deterministic Scoring

The scoring utility checks:

- required concept coverage
- optional concept coverage
- banned placeholders and internal leaks
- JSON validity for structured outputs
- feature-specific shape checks
- provider/runtime failure categories
- pass rates, averages, weakest topics, and future review candidates

Provider failures, token limits, timeouts, and schema reliability failures are separated from model-content quality so they do not become false fine-tuning evidence.

## Current Evidence Snapshot

A completed Groq full-suite run on May 24, 2026 evaluated all 21 starter records with:

- 21 of 21 records completed
- error rate: 0
- average score: 2.52 out of 3
- JSON validity rate: 1.0
- strongest feature area: video/storyboard generation
- weakest areas: tutor depth and Queue notes

This is useful demo evidence, but it is still a starter eval suite rather than a full benchmark.

## Report Policy

Generated eval reports and comparisons under `training/reports/` stay ignored by Git. Demo docs should cite compact manual summaries only, not full generated JSON reports.

## Interpretation

The current evidence supports this decision:

```text
Do not fine-tune now.
Keep improving curated knowledge, prompts, RAG context, and evaluation coverage first.
```

Fine-tuning should be considered only after larger stable evaluations show repeated successful-output model capability failures that prompt/RAG fixes cannot solve.
