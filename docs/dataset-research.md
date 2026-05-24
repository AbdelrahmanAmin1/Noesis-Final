# Noesis Dataset Research Plan

This document is a planning inventory only. Do not download large datasets or train models until licenses, attribution requirements, and demo needs are reviewed.

Current recommendation for the graduation demo:

```text
RAG + curated OOP/DS corpus + Groq/Ollama provider strategy
```

Fine-tuning remains postponed. The next implementation work here is research, license verification from primary sources, cleaning policy, and evaluation design.

| Name | URL | License | Format | Size | OOP relevance | Data Structures relevance | Best use | Risks | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| OpenDSA | https://github.com/OpenDSA/OpenDSA | MIT | ReStructuredText, JS exercises, configs | Large open textbook/exercise repo | Medium | High | RAG, examples, diagrams, quizzes, evaluation | Content structure requires conversion; exercise assets need filtering | Strong first curated-corpus source for DS/algorithms |
| Open Data Structures | https://open.umn.edu/opentextbooks/textbooks/171 | CC BY-NC-ND | Book/PDF/HTML/source | Full textbook | Low | High | RAG reference, evaluation rubrics | NC/ND limits derivative training use | Use for reference/RAG with attribution; avoid fine-tuning derivatives |
| Java, Java, Java | https://open.umn.edu/opentextbooks/textbooks/218 | CC BY | Book/PDF | Full textbook | High | Medium | OOP curated corpus, examples, explanations | Older Java style in places; needs modernization review | Good OOP seed source with attribution |
| CodeSearchNet | https://github.com/github/CodeSearchNet | Dataset with source licenses | Code/docstring pairs | Millions of functions | Low | Medium | Code retrieval, example mining, evaluation snippets | Not pedagogical; mixed source licenses | Use cautiously for examples, not as primary tutor data |
| APPS | https://github.com/hendrycks/apps | MIT | Programming problems/tests | 10K problems | Low | High | Algorithm evaluation | Problem difficulty may exceed beginner lessons | Useful for later algorithm eval, not MVP notes/video |
| CodeAlpaca | https://github.com/sahil280114/codealpaca | Apache-2.0 repo | JSON instruction data | About 20K examples | Medium | Medium | Format inspiration, synthetic instruction baseline | Quality varies; may teach shallow or incorrect code | Use only after sampling and filtering |
| Magicoder Evol-Instruct | https://huggingface.co/datasets/ise-uiuc/Magicoder-Evol-Instruct-110K | Apache-2.0 | JSON/JSONL instruction data | 110K examples | Medium | Medium | Synthetic code instruction patterns | Synthetic data can amplify mistakes | Later fine-tuning candidate after strong validation |
| TACO | https://github.com/FlagOpen/TACO | Apache-2.0 plus upstream licenses | Problems, solutions, tests | Large benchmark | Low | High | Algorithmic evaluation | Mixed upstream license review required | Use for eval only after license screening |
| CoNaLa | https://conala-corpus.github.io/ | Research dataset from Stack Overflow | JSON/JSONL intent-snippet pairs | Thousands curated, hundreds of thousands mined | Low | Medium | Code intent/snippet examples | Stack Overflow attribution and license caution | Avoid fine-tuning for demo; possible eval/reference only |
| Stack Overflow-style Q&A | https://stackoverflow.com/help/licensing | CC BY-SA by contribution date | Q&A dumps | Very large | Medium | Medium | Misconception discovery, question style | Attribution/share-alike/legal complexity | Avoid for training; use hand-authored equivalents |
| User-uploaded course material | Local uploads | User-owned/permission-dependent | PDF, PPTX, DOCX, text | Varies | High when course is OOP | High when course is DS | Grounding and course-specific definitions | Privacy and permission constraints | Use only selected chunks; keep embeddings local |
| Custom approved Q&A | Generated from approved OER/user material | Match source license plus internal review | JSONL | 200-3000 records | High | High | Fine-tuning, eval, flashcards, quizzes | Risk of model-generated errors | Best long-term training path after human review |

## MVP Research Tasks

1. Verify license terms from primary sources before using any dataset beyond RAG reference.
2. Create a small reviewed sample set for four demo topics: inheritance, polymorphism, linked list, and stack.
3. Convert selected OER snippets into the `EducationalLesson` schema instead of markdown blobs.
4. Build evaluation records that check correctness, code compilability, diagram validity, and misconception handling.
5. Keep fine-tuning data separate from source corpora under `training/`.

## Recommended Demo Choice

Use curated local OOP/DS topic files plus selected uploaded chunks and Groq generation for notes/video. Fine-tuning is not needed for the demo and would add risk before the lesson pipeline is stable.

## Future Training Workspace

The intended root-level layout is:

```text
training/
  raw/
  cleaned/
  generated/
  eval/
  scripts/
  README.md
```

No dataset should enter `training/raw/` until the source license, attribution rules, redistribution limits, and allowed ML use are recorded in this document.
