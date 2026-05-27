# Dataset Quality Report

No full dataset has been collected yet.

## Current Checks

- Source metadata can be validated with `node training/scripts/validate_licenses.js`.
- Dataset inventory can be summarized with `node training/scripts/dataset_report.js`.
- The sample JSONL is format-oriented and marked `sample_only`; it is not a reviewed pilot dataset.

## Required Future Gates

- Source license is known and compatible with intended use.
- Classification is one of `RAG_ONLY`, `FINE_TUNE_CANDIDATE`, `EVAL_ONLY`, or `REJECTED`.
- Fine-tune candidates have human review.
- Structured outputs parse as JSON where required.
- Code examples are syntactically reasonable.
- Diagram examples include valid nodes and edges.
- Records do not contain placeholders or unsupported course claims.
