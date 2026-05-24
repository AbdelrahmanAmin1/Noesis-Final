# Noesis Training Roadmap

This folder is a placeholder for future research artifacts only. Do not download datasets or run fine-tuning for the demo.

Recommended demo path:

```text
RAG + curated OOP/DS corpus + Groq/Ollama provider strategy
```

Future layout:

```text
training/
  raw/
  cleaned/
  generated/
  eval/
  scripts/
```

Rules before any data is added:

- Verify license and attribution terms from the primary source.
- Record dataset metadata in `docs/dataset-research.md`.
- Keep user-uploaded course material private and local unless explicit permission exists.
- Build reviewed evaluation sets before any LoRA/QLoRA experiment.
- Treat generated Q&A as candidate data until human-reviewed for correctness.

Fine-tuning target areas, later only:

- Object-Oriented Programming
- Data Structures
- Algorithms
- Big-O analysis
