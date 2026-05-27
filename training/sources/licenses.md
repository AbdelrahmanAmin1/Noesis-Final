# Source And License Ledger

This ledger is the human-readable companion to `sources.json`. It tracks what can be collected now, what must remain postponed, and what can never enter fine-tuning without review.

## Rules

- Unknown or unclear license means `REJECTED`.
- Private course material requires explicit user permission per file.
- Long textbook/course content is `RAG_ONLY` by default.
- Stack Overflow-derived content is not used for fine-tuning.
- Fine-tuning data must be reviewed, instruction-style, source-compatible, and marked `FINE_TUNE_CANDIDATE`.

## Current Sources

| Source | License/status | Default classification | Include now | Notes |
|---|---|---:|---:|---|
| OpenDSA | MIT | `RAG_ONLY` | yes | Metadata and tiny curated samples only. |
| Open Data Structures | CC BY per official site | `RAG_ONLY` | yes | Preserve attribution; re-verify per artifact before use. |
| User-approved course materials | permission required per item | `RAG_ONLY` | yes | Local/private only; do not commit originals. |
| CodeSearchNet | mixed source licenses | `REJECTED` | no | Later per-record license screening required. |
| APPS | MIT | `EVAL_ONLY` | no | Later algorithm eval source; do not download now. |
| TACO | Apache-2.0 plus upstream licenses | `EVAL_ONLY` | no | Mixed upstream and unclear source rights require screening. |
| CoNaLa | Stack Overflow-derived CC BY-SA by date | `REJECTED` | no | Avoid fine-tuning; use hand-authored equivalents. |
| CodeAlpaca | Apache-2.0 repo | `REJECTED` | no | Format reference only until sampled and reviewed. |
| Magicoder Evol-Instruct | Apache-2.0 | `REJECTED` | no | Later candidate only after strict quality filtering. |
| Custom Noesis examples | user-approved/source-compatible | `FINE_TUNE_CANDIDATE` | yes | Reviewed records only. |

## Verification Notes

- Open Data Structures should be tracked from `https://opendatastructures.org/`, which states the book and source code are released under a Creative Commons Attribution License and can be copied, distributed, used, and adapted.
- CodeSearchNet ships source-code license metadata separately in `_licenses.pkl`; the repository license alone is not enough to approve training use.
- TACO includes its own Apache-2.0 content and upstream sources with mixed or unclear rights; use it only after provenance is retained.
- CoNaLa is Stack Overflow-derived, so attribution/share-alike rules make it unsuitable for Noesis fine-tuning.
