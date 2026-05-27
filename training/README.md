# Noesis Training Workspace

This workspace prepares Noesis for future dataset work and possible LoRA/QLoRA fine-tuning. It is not a training run, and it should not contain large raw datasets in Git.

Current recommendation for the graduation demo:

```text
RAG + curated OOP/DS corpus + Groq/Ollama provider strategy
```

Fine-tuning remains postponed until the curated corpus, evaluation sets, and reviewed pilot data are stable.

## Folder Ownership

```text
training/
  sources/      Source metadata, license ledger, and permission notes.
  raw/          Local-only downloaded or user-approved originals.
  cleaned/      Local-only normalized and topic-filtered source text.
  generated/    Local-only generated candidate examples.
  samples/      Tiny committed examples of the Noesis JSONL format.
  eval/         Committed evaluation sets and eval documentation.
  scripts/      Dataset inspection, validation, and reporting tools.
  reports/      Human-readable dataset status and quality reports.
```

Runtime app knowledge belongs outside this folder:

- `backend/knowledge/` stores small structured topic JSON used directly by lesson generation.
- `backend/seed/` stores small markdown/JSON material seeded into SQLite as the system RAG corpus.

## Data Classification

Every source and derived record must be classified as one of:

- `RAG_ONLY`: approved longform educational content, textbook chapters, slides, notes, visual explanations.
- `FINE_TUNE_CANDIDATE`: reviewed instruction-style examples with compatible license or explicit permission.
- `EVAL_ONLY`: benchmark questions, correctness probes, exam-like prompts, code reasoning tests.
- `REJECTED`: unclear license, private without permission, noisy, wrong, duplicate, too long, irrelevant, or low quality.

Fine-tuning exports may include only reviewed `FINE_TUNE_CANDIDATE` records.

## Safe Commands

Run these from the repository root:

```bash
node training/scripts/validate_licenses.js
node training/scripts/collect_sources.js --dry-run
node training/scripts/dataset_report.js
```

These scripts are intentionally conservative. They do not download large datasets, train models, change app settings, or touch `.env`.

## Immediate Milestone

Milestone 1 is complete when the source tracker, license ledger, folder structure, sample format, and large-file Git safety rules are in place. Later milestones can add curated RAG files, real eval JSONL, cleaning/conversion scripts, and pilot data only after review.
