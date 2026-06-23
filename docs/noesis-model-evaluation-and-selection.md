# Noesis Model Evaluation and Selection

Generated: 2026-06-22

## Executive Summary

Noesis uses two generation roles rather than one universal model.

- Cloud-enhanced generation uses Groq `openai/gpt-oss-120b` for notes, tutor planning, tutor responses, summaries, and video script/storyboard generation when cloud use is acceptable.
- Local-first generation and fallback use Ollama `qwen2.5-coder:7b`.
- Embeddings stay local through Ollama `nomic-embed-text`, so retrieval and chunk indexing do not depend on a cloud provider.

The decision is not based on a claim that any model cannot hallucinate. Noesis reduces hallucination risk by grounding generation in uploaded material, curated OOP/Data Structures knowledge, source maps, deterministic source-grounding checks, JSON schema validation, quality gates, and fallback behavior. The safest statement is: Noesis reduces and tests hallucination risk; it does not mathematically guarantee zero hallucination.

The fresh 2026-06-22 rerun supports `openai/gpt-oss-120b` as the best Groq model for quality across Noesis tasks. It had the highest content average score, highest strict pass rate, full JSON validity, and zero runtime errors across the 21-record suite.

For local models, the fresh strict suite was closer: `phi3:latest` slightly led content average, `llama3.2:latest` led latency and strict pass rate, and `qwen2.5-coder:7b` stayed competitive while being the only explicitly code-specialized local model in the tested set. We keep Qwen as the local default because Noesis is a CS education system with code explanation, algorithm reasoning, and programming examples; prior legacy evidence also showed Qwen passing 7/7 model checks while Llama 3.2 passed 5/7.

## System Context

Noesis is an AI learning workspace for computer science education. It generates notes, flashcards, quizzes, tutor sessions, learning guidance, and video storyboards from uploaded course material and curated CS knowledge.

Current provider split:

| Role | Selected model/provider | Reason |
| --- | --- | --- |
| Embeddings | Ollama `nomic-embed-text` | Local retrieval index, no cloud dependency for chunk search. |
| Local generation | Ollama `qwen2.5-coder:7b` | Code-specialized local model suitable for CS education and offline fallback. |
| Cloud generation | Groq `openai/gpt-oss-120b` | Strongest fresh Noesis eval result among Groq candidates, long context, reasoning, JSON mode support, and good price/performance. |

## How Evaluation Happened

The primary rerun used the richer backend evaluator:

```bash
cd backend
node scripts/eval-noesis-generation.js --feature=all --provider=ollama --model=qwen2.5-coder:7b --ollama-compact-json --retries=1 --timeout-ms=300000
node scripts/eval-noesis-generation.js --feature=all --provider=ollama --model=llama3.2:latest --ollama-compact-json --retries=1 --timeout-ms=300000
node scripts/eval-noesis-generation.js --feature=all --provider=ollama --model=phi3:latest --ollama-compact-json --retries=1 --timeout-ms=300000
node scripts/eval-noesis-generation.js --feature=all --provider=groq --model=openai/gpt-oss-120b --retries=2 --retry-delay-ms=15000 --eval-json-mode=auto --timeout-ms=90000 --fast-groq
node scripts/eval-noesis-generation.js --feature=all --provider=groq --model=openai/gpt-oss-20b --retries=2 --retry-delay-ms=15000 --eval-json-mode=auto --timeout-ms=90000 --fast-groq
node scripts/eval-noesis-generation.js --feature=all --provider=groq --model=llama-3.3-70b-versatile --retries=2 --retry-delay-ms=15000 --eval-json-mode=auto --timeout-ms=90000 --fast-groq
node scripts/eval-noesis-generation.js --feature=all --provider=groq --model=llama-3.1-8b-instant --retries=2 --retry-delay-ms=15000 --eval-json-mode=auto --timeout-ms=90000 --fast-groq
```

The evaluator loaded 21 records from `training/eval/`:

| Eval file | Records | Covered features/topics |
| --- | ---: | --- |
| `big_o_eval.jsonl` | 3 | Big-O tutor, quiz, flashcards |
| `data_structures_eval.jsonl` | 3 | Linked List tutor, Stack quiz, BST video |
| `notes_eval.jsonl` | 3 | Class/Object, Polymorphism, Queue notes |
| `oop_eval.jsonl` | 3 | Encapsulation, Polymorphism, Inheritance |
| `quiz_flashcard_eval.jsonl` | 3 | Encapsulation quiz, Linked List flashcards, BST quiz |
| `tutor_response_eval.jsonl` | 3 | Encapsulation, Linked List, Abstraction tutor responses |
| `video_storyboard_eval.jsonl` | 3 | Encapsulation, Stack, Big-O video/storyboard |

Each record includes a feature, topic, prompt, expected required concepts, optional concepts, banned phrases, expected output type, and rubric. The scoring utility measures:

- required concept coverage
- optional concept coverage
- banned placeholder/internal text
- JSON validity for structured outputs
- feature-specific output shape
- response length and teaching clarity
- code and diagram quality where relevant
- provider/runtime failures separately from content quality

The strict pass threshold is intentionally conservative. A model can have a good average score but a low strict pass rate if it misses one required concept, leaks a placeholder, or fails a shape check.

## Fresh Evaluation Results

Run directory:

`training/reports/model-selection-logs-20260622-212809/`

Full JSON reports:

| Provider | Model | Report |
| --- | --- | --- |
| Ollama | `qwen2.5-coder:7b` | `training/reports/eval-report-all-ollama-qwen2.5-coder-7b-2026-06-22T18-36-43-901Z.json` |
| Ollama | `llama3.2:latest` | `training/reports/eval-report-all-ollama-llama3.2-latest-2026-06-22T18-39-47-974Z.json` |
| Ollama | `phi3:latest` | `training/reports/eval-report-all-ollama-phi3-latest-2026-06-22T18-45-01-462Z.json` |
| Groq | `openai/gpt-oss-120b` | `training/reports/eval-report-all-groq-openai-gpt-oss-120b-2026-06-22T18-54-20-161Z.json` |
| Groq | `openai/gpt-oss-20b` | `training/reports/eval-report-all-groq-openai-gpt-oss-20b-2026-06-22T19-04-54-567Z.json` |
| Groq | `llama-3.3-70b-versatile` | `training/reports/eval-report-all-groq-llama-3.3-70b-versatile-2026-06-22T19-12-01-639Z.json` |
| Groq | `llama-3.1-8b-instant` | `training/reports/eval-report-all-groq-llama-3.1-8b-instant-2026-06-22T19-21-20-656Z.json` |

### Overall Scores

| Provider | Model | Content avg / 3 | Strict pass rate | JSON validity | Error rate | Avg response ms | Main failure type |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Groq | `openai/gpt-oss-120b` | 2.587 | 0.619 | 1.000 | 0.000 | 8705 | Prompt/concept misses |
| Groq | `llama-3.3-70b-versatile` | 2.507 | 0.524 | 1.000 | 0.000 | 2446 | Prompt/concept misses |
| Groq | `llama-3.1-8b-instant` | 2.350 | 0.381 | 1.000 | 0.000 | 8721 | Prompt/concept misses |
| Groq | `openai/gpt-oss-20b` | 2.270 | 0.381 | 0.786 | 0.000 | 12306 | Parsing + prompt failures |
| Ollama | `phi3:latest` | 2.330 | 0.143 | 1.000 | 0.000 | 14916 | Prompt/concept misses |
| Ollama | `qwen2.5-coder:7b` | 2.315 | 0.143 | 1.000 | 0.000 | 24468 | Prompt/concept misses |
| Ollama | `llama3.2:latest` | 2.296 | 0.286 | 1.000 | 0.000 | 8753 | Prompt/concept misses |

### Feature-Level Results

| Model | Notes | Quiz | Tutor | Video | Flashcards |
| --- | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-oss-120b` | 2.678 | 2.600 | 2.490 | 2.643 | 2.600 |
| `llama-3.3-70b-versatile` | 2.571 | 2.550 | 2.399 | 2.643 | 2.400 |
| `llama-3.1-8b-instant` | 2.214 | 2.550 | 2.214 | 2.500 | 2.400 |
| `openai/gpt-oss-20b` | 2.607 | 1.100 | 2.481 | 2.571 | 2.600 |
| `phi3:latest` | 2.250 | 2.600 | 2.169 | 2.286 | 2.600 |
| `qwen2.5-coder:7b` | 2.143 | 2.450 | 2.246 | 2.429 | 2.400 |
| `llama3.2:latest` | 2.215 | 2.700 | 2.198 | 2.393 | 1.800 |

Interpretation:

- `openai/gpt-oss-120b` is the strongest cloud model for the complete Noesis workload. It led the overall content average and strict pass rate, had full JSON validity, and had no runtime errors in the paced run.
- `llama-3.3-70b-versatile` is a strong speed alternative. It was much faster in this run, but slightly lower in quality and strict pass rate.
- `openai/gpt-oss-20b` is attractive for cost, but the quiz JSON/parsing weakness makes it less safe for structured assessment generation.
- `llama-3.1-8b-instant` is useful for low-latency fallback, but it was weaker on code/tutor depth.
- Local models were all usable, but none matched the best Groq quality. They remain important for privacy, offline use, cost control, and fallback.

## Legacy Evidence

Older legacy evaluator reports under `backend/eval/` are smaller but still useful historical evidence:

| Provider/model | Legacy result |
| --- | --- |
| Ollama `qwen2.5-coder:7b` | 7/7 passed, average response 25136 ms |
| Ollama `llama3.2:3b` | 5/7 passed, average response 110123 ms |
| Ollama `qwen2.5-coder:7b` video eval | 6/6 passed in the later video run |

This earlier evidence is why Qwen was already selected over Llama 3.2 for the local default. The fresh 2026-06-22 suite is stricter and shows local tradeoffs more clearly, but it does not remove Qwen's code-specialized advantage for CS education.

## Anti-Hallucination Design

Noesis uses layered controls. The model is only one layer.

| Hallucination risk | Noesis control | Evidence or implementation |
| --- | --- | --- |
| Model invents course-specific facts | Uploaded-material-first RAG | Uploaded documents are extracted, chunked, embedded, and retrieved before generation. |
| Weak uploaded source causes generic output | Curated OOP/Data Structures knowledge | `backend/knowledge/` and `educational-context.service.js` provide verified CS context. |
| Model answers the wrong topic | Topic resolver and source-grounding judge | Tests cover topic mismatch and topic drift, including Trees vs Linked List cases. |
| Model cites unsupported chunks | Source maps and grounding metadata | Notes, tutor sessions, and storyboards keep source references and trace data. |
| Model produces malformed JSON | Zod schemas, JSON repair, evaluator JSON checks | Quiz, flashcards, notes, tutor, and video structures are schema-validated. |
| Model leaks placeholders or prompt internals | Banned phrase checks and quality gates | Eval scoring rejects phrases like placeholder text and internal chunk syntax. |
| Video scenes become generic | Storyboard quality gates and review | Scene evidence, visual purpose, visual template, and review approval are part of the pipeline. |
| Provider outage or quota issue | Local fallback providers | Tutor, quiz, flashcards, and video scripts can fall back to Ollama depending on feature config. |

Important limitation: these controls reduce and detect hallucination risk, but they do not prove that hallucination is impossible. For academic wording, the correct claim is "source-grounded generation with validation and regression tests," not "hallucination-free AI."

## Evaluation Matrix

Scale: 1 = weak, 3 = acceptable, 5 = strongest for Noesis. Weighted score is out of 5.

Weights:

| Criterion | Weight | Why it matters |
| --- | ---: | --- |
| Correctness/content score | 20% | Generated teaching content must cover required concepts. |
| Groundedness and hallucination resistance | 15% | Outputs must stay tied to uploaded and curated sources. |
| Schema/JSON reliability | 15% | Quizzes, flashcards, tutor plans, and storyboards require structured output. |
| CS/code reasoning fit | 15% | Noesis focuses on OOP, Data Structures, algorithms, and code examples. |
| Teaching depth | 10% | The system must explain, tutor, and scaffold, not only answer. |
| Latency | 8% | Student workflows should feel responsive. |
| Cost/quota | 7% | Demo and production use must avoid unnecessary spend and rate-limit fragility. |
| Privacy/locality | 5% | Uploaded materials may be private; local fallback matters. |
| Operational reliability | 5% | Provider availability and zero-error eval runs matter. |

### Cloud Model Matrix

| Model | Correct | Grounded | Schema | Code | Teaching | Latency | Cost/quota | Privacy | Ops | Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-oss-120b` | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 4.0 | 4.0 | 3.0 | 4.0 | 4.75 |
| `llama-3.3-70b-versatile` | 4.5 | 4.5 | 5.0 | 4.0 | 4.5 | 5.0 | 3.0 | 3.0 | 4.5 | 4.38 |
| `llama-3.1-8b-instant` | 3.8 | 3.8 | 5.0 | 3.0 | 3.5 | 4.0 | 5.0 | 3.0 | 4.0 | 3.92 |
| `openai/gpt-oss-20b` | 3.6 | 4.0 | 3.0 | 4.0 | 4.0 | 3.5 | 5.0 | 3.0 | 4.0 | 3.78 |

Cloud decision:

- Choose `openai/gpt-oss-120b`.
- Use `llama-3.3-70b-versatile` as a strong alternative when latency is more important than peak quality.
- Avoid making `openai/gpt-oss-20b` the default for Noesis because the fresh run exposed weaker structured quiz reliability.
- Use `llama-3.1-8b-instant` only for fast/simple fallback scenarios.

### Local Model Matrix

| Model | Correct | Grounded | Schema | Code | Teaching | Latency | Cost/quota | Privacy | Ops | Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen2.5-coder:7b` | 3.8 | 3.8 | 5.0 | 5.0 | 3.8 | 2.5 | 5.0 | 5.0 | 4.0 | 4.13 |
| `llama3.2:latest` | 3.7 | 3.8 | 5.0 | 3.0 | 3.7 | 4.5 | 5.0 | 5.0 | 4.0 | 3.93 |
| `phi3:latest` | 3.8 | 3.7 | 5.0 | 3.5 | 3.6 | 3.5 | 5.0 | 5.0 | 3.8 | 3.92 |

Local decision:

- Choose `qwen2.5-coder:7b` as the local default because Noesis is code-heavy and Qwen2.5-Coder is explicitly code-specific.
- Keep `llama3.2:latest` as a fast local alternative for simpler explanations.
- Keep `phi3:latest` as a lightweight fallback, but not the main model for mixed CS tutoring and storyboard generation.

## Why Groq `openai/gpt-oss-120b`

We selected Groq `openai/gpt-oss-120b` because it best matches Noesis' cloud-enhanced generation role:

- It produced the best fresh Noesis result: 2.587/3 content average, 0.619 strict pass rate, 1.000 JSON validity, and 0 runtime errors.
- It was strongest across the complete workload, not only one feature: notes 2.678, quiz 2.600, tutor 2.490, video 2.643, flashcards 2.600.
- Groq lists `openai/gpt-oss-120b` as a production model with about 500 tokens/sec, 131072 context window, 65536 max output tokens, JSON object/schema capabilities, reasoning, tool use, browser search, and code execution support.
- OpenAI describes GPT-OSS 120B as a 117B total-parameter MoE model with 5.1B active parameters per token and 128k context, trained with focus on STEM, coding, and general knowledge.
- GPT-OSS 120B has a better Noesis quality/price balance than Llama 3.3 70B in this project: 120B had higher Noesis quality while Groq lists lower input and output pricing than Llama 3.3 70B.

Why not the other Groq models:

| Model | Why not default |
| --- | --- |
| `openai/gpt-oss-20b` | Cheaper, but lower Noesis score and weaker JSON/parsing reliability in quiz generation. |
| `llama-3.3-70b-versatile` | Very strong and fast, but lower overall Noesis quality and higher listed Groq pricing than GPT-OSS 120B. |
| `llama-3.1-8b-instant` | Fast and cheap, but weaker for deep tutoring, code-heavy explanations, and complex lesson/storyboard generation. |

## Why Ollama `qwen2.5-coder:7b`

We selected `qwen2.5-coder:7b` for the local role because Noesis is a CS education system, not a general chat bot.

Qwen-specific reasons:

- Qwen2.5-Coder is explicitly code-specific. The Ollama and Hugging Face model pages describe improvements in code generation, code reasoning, and code fixing.
- The local Ollama install reports `qwen2.5-coder:7b` as a 7.6B Qwen2-family model with Q4_K_M quantization, making it practical on the current machine.
- Hugging Face lists the 7B model with 7.61B parameters and long-context support, and the model is available for local-compatible runtimes.
- The legacy Noesis evaluator showed Qwen passing 7/7 checks while Llama 3.2 passed 5/7, and the later video-specific run showed Qwen passing 6/6.
- The fresh strict run showed Qwen has no runtime errors and full JSON validity. Its weak spots were mostly strict concept/placeholder checks, which are handled by Noesis quality gates and prompt/RAG iteration.

Why not the other local models:

| Model | Why not default |
| --- | --- |
| `llama3.2:latest` | Faster and had a higher strict pass rate in the fresh run, but it is a general model and weaker for code-specialized selection criteria. |
| `phi3:latest` | Slightly higher fresh content average than Qwen, but less code-specialized and showed weaker notes/video cases plus placeholder failures. |
| `minimax-m2.5:cloud` | Not treated as a local candidate because it is cloud-routed through Ollama, so it does not satisfy the local privacy/offline fallback role. |

## How We Made Sure Hallucination Is Controlled

Noesis controls hallucination before, during, and after generation.

Before generation:

- Uploaded files are extracted into chunks.
- Chunks are embedded locally.
- Retrieval selects relevant material chunks.
- Topic resolution prevents vague titles like "210-Trees" from becoming unrelated CS topics.
- Curated knowledge provides safe OOP/DS enrichment only when relevant.

During generation:

- Prompts instruct the model to use uploaded material first.
- Educational context is compact and feature-specific.
- Structured features request strict JSON.
- Feature routing can use Groq for quality or Ollama for local fallback.

After generation:

- Zod schemas validate structured outputs.
- JSON repair has limited retries.
- Quality gates reject generic, malformed, placeholder-heavy, or off-topic outputs.
- Source-grounding judge checks topic drift and weak source coverage.
- Storyboard review blocks weak/generic scenes before video rendering.
- Eval scoring detects missing required concepts, placeholder leaks, JSON failures, and runtime failures.

What this proves:

- The architecture is designed to reduce hallucination.
- The tests and evals can catch many hallucination-like failures, such as unsupported topic drift or missing required concepts.
- Provider failures and rate limits are not confused with model hallucinations.

What this does not prove:

- It does not prove every generated sentence is always source-supported.
- It does not replace human review for high-stakes educational claims.
- The current 21-record eval suite is a starter benchmark and should grow.

## Final Decision

Use:

- Groq `openai/gpt-oss-120b` for high-quality cloud-backed generation when the user/demo accepts cloud processing.
- Ollama `qwen2.5-coder:7b` as the local default and fallback because Noesis is code-heavy and Qwen is the best local fit for CS tutoring, code reasoning, and programming examples.
- Ollama `nomic-embed-text` for embeddings so retrieval remains local.

Do not fine-tune now. The current evidence says most failures are prompt, rubric, schema, or grounding issues rather than proof that a custom fine-tuned model is required. The next quality improvements should be:

- grow the eval suite beyond 21 records
- add more source-grounding checks against retrieved chunks
- improve prompts where required concepts were missed
- expand curated OOP/Data Structures knowledge
- only consider fine-tuning after repeated successful-output model failures remain after RAG and prompt fixes

## Official Model Sources

- Groq supported models: https://console.groq.com/docs/models
- Groq `openai/gpt-oss-120b`: https://console.groq.com/docs/model/openai/gpt-oss-120b
- OpenAI GPT-OSS announcement: https://openai.com/index/introducing-gpt-oss/
- OpenAI GPT-OSS help center: https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss
- Ollama `qwen2.5-coder:7b`: https://ollama.com/library/qwen2.5-coder%3A7b
- Hugging Face `Qwen/Qwen2.5-Coder-7B`: https://huggingface.co/Qwen/Qwen2.5-Coder-7B
