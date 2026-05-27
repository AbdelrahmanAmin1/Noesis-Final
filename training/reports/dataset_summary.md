# Dataset Summary

Generated workspace status for Milestone 1.

## Current State

- Root `training/` now owns offline data preparation.
- `backend/knowledge/` and `backend/seed/` remain runtime app corpus locations.
- No large datasets have been downloaded.
- No model has been fine-tuned.
- No private course material has been committed.

## Implemented In Milestone 1

- Source tracker: `training/sources/sources.json`.
- License ledger: `training/sources/licenses.md`.
- Sample Noesis instruction JSONL: `training/samples/noesis_training_format.sample.jsonl`.
- Evaluation folder documentation: `training/eval/README.md`.
- Dry-run scripts for source listing, license validation, and dataset reporting.
- Git ignore rules for raw, cleaned, generated, archive, parquet, arrow, and JSONL data, with exceptions for safe samples/eval/sources.

## Postponed

- Downloading CodeSearchNet, APPS, TACO, CoNaLa, or other large datasets.
- Any Stack Overflow-derived fine-tuning.
- LoRA/QLoRA execution.
- Runtime app behavior changes.
- Seed corpus stability fix.

## Next Recommended Milestone

Build the curated OOP/DS knowledge base and fix system corpus seeding so markdown seed files are not skipped after misconception seeding.
