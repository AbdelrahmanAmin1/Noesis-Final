# Noesis Fine-Tuning Roadmap

No trained Noesis model exists yet. Fine-tuning is intentionally postponed until the lesson pipeline, curated corpus, and evaluation rubrics are stable.

The demo path is:

```text
local embeddings + uploaded-source RAG + curated OOP/DS corpus + Groq for notes/video
```

## Future Folder Shape

```text
training/
  raw/
  cleaned/
  generated/
  eval/
  scripts/
  README.md
```

This backend folder currently keeps the placeholder `data/` and `scripts/` directories for future conversion/evaluation code.

## Training Record Shape

```json
{
  "instruction": "Explain linked lists to a beginner with a diagram and code example.",
  "input": "Course context and approved source snippets...",
  "output": {
    "topic": "Linked List",
    "audienceLevel": "beginner",
    "lessonType": "data_structure",
    "sections": []
  }
}
```

## Practical Roadmap

1. Build 200-500 hand-reviewed gold examples for OOP/DS correctness and prompt calibration.
2. Generate 1,000-3,000 candidate examples only from approved OER or user-owned material.
3. Review examples for concept correctness, runnable code, valid diagrams, and misconception handling.
4. Train a LoRA/QLoRA adapter on a small open-weights instruct/code model only after evaluation passes.
5. Export/merge to GGUF and create an Ollama Modelfile for local deployment.

Do not fine-tune before the demo. RAG + Groq + curated corpus is lower risk and more demo-ready.
