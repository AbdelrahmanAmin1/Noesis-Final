# Noesis Fine-Tuning Roadmap

Noesis is not fine-tuned today. The current decision is to postpone fine-tuning because the demo quality improved through safer and more explainable work: curated OOP/Data Structures knowledge, RAG, prompt improvements, provider strategy, and evaluation reliability fixes.

## Current Decision

```text
Do not fine-tune for the graduation demo.
Use RAG + curated knowledge + Groq/Ollama provider strategy.
```

## Why Fine-Tuning Is Not Needed Yet

- The app already has a curated OOP/Data Structures knowledge base.
- Uploaded material RAG keeps course-specific grounding strong.
- Feature prompts now include explicit uploaded-first policy.
- Groq and Ollama can be compared through deterministic eval tooling.
- Recent evaluation failures were mostly prompt, schema, pacing, or coverage issues, not proven model-capability failures.
- Fine-tuning would add hardware, licensing, evaluation, and integration risk before the demo.

## What Must Exist Before Fine-Tuning

Fine-tuning should be revisited only when all of these are true:

- The eval suite is larger than the current 21 starter records.
- Failures repeat across providers after prompt/RAG fixes.
- Failures are successful-output quality failures, not provider/runtime failures.
- Training data is license-cleared and reviewed.
- At least 500 to 1000 high-quality examples exist.
- A held-out eval set exists and is not used for training.
- The app keeps a fallback to RAG and base providers.

## Candidate Model Strategy

Future experimentation should use LoRA or QLoRA adapters rather than full fine-tuning.

Realistic later candidates:

- Qwen2.5-Coder 7B or similar code-capable model
- Qwen2.5-Coder 14B if hardware is available
- Adapter-based training with evaluation before and after

The fine-tuned model should be compared against Groq + RAG and Ollama + RAG using the same eval JSONL files.

## Data Strategy

Use only:

- project-authored curated examples
- user-approved course material
- license-compatible open educational resources
- reviewed examples derived from approved sources

Avoid:

- unclear-license data
- private course material without permission
- large scraped datasets without provenance
- Stack Overflow-derived fine-tuning data unless licensing and attribution are fully reviewed

## Future Milestones

1. Expand the eval suite across more OOP, DS, Algorithms, Big-O, code walkthrough, and diagram tasks.
2. Convert repeated failed eval cases into reviewed pilot instruction examples.
3. Build a 50 to 100 example hand-reviewed pilot dataset.
4. Grow toward 500 to 1000 examples only after quality gates are stable.
5. Run a small LoRA/QLoRA experiment.
6. Compare against Groq + RAG and Ollama + RAG.
7. Integrate only if quality improves without losing general study support.

## Bottom Line

Fine-tuning is future work, not a demo requirement. The current evidence favors a grounded RAG system with curated educational knowledge and careful evaluation.
