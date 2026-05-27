# Noesis Dataset Research Plan

This document is a planning inventory only. Do not download large datasets or train models until licenses, attribution requirements, and demo needs are reviewed.

Current recommendation for the graduation demo:

```text
RAG + curated OOP/DS corpus + Groq/Ollama provider strategy
```

Fine-tuning remains postponed. The next implementation work here is source tracking, license verification from primary sources, cleaning policy, and evaluation design.

Milestone 6 status:

- Noesis now has curated OOP/Data Structures knowledge, RAG integration, and evaluation tooling.
- Fine-tuning is still postponed for the graduation demo.
- See `docs/noesis-fine-tuning-roadmap.md` for the current fine-tuning decision and readiness gates.

Milestone 1 status:

- Root `training/` now owns the offline dataset workspace.
- `training/sources/sources.json` tracks source metadata and default classification.
- `training/sources/licenses.md` is the human-readable license ledger.
- `training/samples/noesis_training_format.sample.jsonl` documents the Noesis JSONL shape.
- Large raw, cleaned, generated, archive, parquet, arrow, and JSONL outputs are ignored by Git, with exceptions for safe samples, eval, and source metadata.

| Name | URL | License | Format | Size | OOP relevance | Data Structures relevance | Best use | Risks | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| OpenDSA | https://github.com/OpenDSA/OpenDSA | MIT | ReStructuredText, JS exercises, configs | Large open textbook/exercise repo | Medium | High | RAG, examples, diagrams, quizzes, evaluation | Content structure requires conversion; exercise assets need filtering | Strong first curated-corpus source for DS/algorithms; metadata only for Milestone 1 |
| Open Data Structures | https://opendatastructures.org/ | CC BY per official site | Book/PDF/HTML/source | Full textbook | Low | High | RAG reference, examples, evaluation rubrics | Attribution must be preserved; re-verify per artifact before use | Use for RAG/reference with attribution; do not turn longform text directly into fine-tuning data |
| Java, Java, Java | https://open.umn.edu/opentextbooks/textbooks/218 | CC BY | Book/PDF | Full textbook | High | Medium | OOP curated corpus, examples, explanations | Older Java style in places; needs modernization review | Good OOP seed source with attribution |
| CodeSearchNet | https://github.com/github/CodeSearchNet | Dataset with source licenses | Code/docstring pairs | Millions of functions | Low | Medium | Code retrieval, example mining, evaluation snippets | Not pedagogical; mixed source licenses | Postpone; use only after per-record license screening |
| APPS | https://github.com/hendrycks/apps | MIT | Programming problems/tests | 10K problems | Low | High | Algorithm evaluation | Problem difficulty may exceed beginner lessons | Useful for later algorithm eval, not MVP notes/video |
| CodeAlpaca | https://github.com/sahil280114/codealpaca | Apache-2.0 repo | JSON instruction data | About 20K examples | Medium | Medium | Format inspiration, synthetic instruction baseline | Quality varies; may teach shallow or incorrect code | Metadata only; use only after sampling and filtering |
| Magicoder Evol-Instruct | https://huggingface.co/datasets/ise-uiuc/Magicoder-Evol-Instruct-110K | Apache-2.0 | JSON/JSONL instruction data | 110K examples | Medium | Medium | Synthetic code instruction patterns | Synthetic data can amplify mistakes | Metadata only; later fine-tuning candidate after strong validation |
| TACO | https://github.com/FlagOpen/TACO | Apache-2.0 plus upstream licenses | Problems, solutions, tests | Large benchmark | Low | High | Algorithmic evaluation | Mixed upstream license review required; some source rights unclear | Use for eval only after provenance screening |
| CoNaLa | https://conala-corpus.github.io/ | Stack Overflow-derived CC BY-SA by contribution date | JSON/JSONL intent-snippet pairs | Thousands curated, hundreds of thousands mined | Low | Medium | Code intent/snippet examples | Stack Overflow attribution and share-alike complexity | Avoid fine-tuning; possible eval/reference only after review |
| Stack Overflow-style Q&A | https://stackoverflow.com/help/licensing | CC BY-SA by contribution date | Q&A dumps | Very large | Medium | Medium | Misconception discovery, question style | Attribution/share-alike/legal complexity | Avoid for training; use hand-authored equivalents |
| User-uploaded course material | Local uploads | User-owned/permission-dependent | PDF, PPTX, DOCX, text | Varies | High when course is OOP | High when course is DS | Grounding and course-specific definitions | Privacy and permission constraints | Use only selected chunks; keep embeddings local |
| Custom approved Q&A | Generated from approved OER/user material | Match source license plus internal review | JSONL | 200-3000 records | High | High | Fine-tuning, eval, flashcards, quizzes | Risk of model-generated errors | Best long-term training path after human review |

## MVP Research Tasks

1. Verify license terms from primary sources before using any dataset beyond RAG reference.
2. Create a small reviewed sample set for four demo topics: inheritance, polymorphism, linked list, and stack.
3. Convert selected OER snippets into the `EducationalLesson` schema instead of markdown blobs.
4. Build evaluation records that check correctness, code compilability, diagram validity, and misconception handling.
5. Keep fine-tuning data separate from source corpora under `training/`.
6. Run `node training/scripts/validate_licenses.js` before any source collection.

## Recommended Demo Choice

Use curated local OOP/DS topic files plus selected uploaded chunks and Groq generation for notes/video. Fine-tuning is not needed for the demo and would add risk before the lesson pipeline is stable.

## Future Training Workspace

The intended root-level layout is:

```text
training/
  sources/
  raw/
  cleaned/
  generated/
  samples/
  eval/
  scripts/
  reports/
  README.md
```

No dataset should enter `training/raw/` until the source license, attribution rules, redistribution limits, and allowed ML use are recorded in this document.

## Source Classification Policy

Every source and derived record must be classified as:

- `RAG_ONLY`: longform educational content, textbook chapters, lecture notes, visual explanations, or approved course material.
- `FINE_TUNE_CANDIDATE`: reviewed instruction-style examples with compatible license or explicit permission.
- `EVAL_ONLY`: benchmark questions, correctness probes, exam-like prompts, code reasoning tests.
- `REJECTED`: unclear license, noisy, wrong, duplicate, private without permission, too long, irrelevant, or low quality.

Fine-tuning exports may include only reviewed `FINE_TUNE_CANDIDATE` records.
