# Noesis Demo Script

This script is for presenting Noesis as a graduation project. It focuses on what the system does, why the architecture is safe, and how the evaluation evidence supports the current design.

## Demo Goal

Show that Noesis can turn uploaded course material into an interactive learning experience with tutor help, notes, quizzes, flashcards, and video/storyboard explanations.

Before presenting, run through `docs/noesis-demo-readiness.md`. Use the small project-authored files in `demo-materials/` instead of large PDFs for the live demo.

For the final rehearsal, screenshot plan, slide outline, and report mapping, use `docs/noesis-final-rehearsal.md`.

## Suggested Opening

"Noesis is an AI learning assistant focused on OOP and Data Structures. It does not rely on blind generation. It grounds answers in uploaded course material first, then uses a curated OOP/Data Structures knowledge base for deeper examples and explanations."

## Walkthrough

### 1. Health Check And Startup

Open:

```text
http://localhost:3001/api/health
```

Talking points:

- The health endpoint reports AI provider, TTS, renderer, and demo readiness.
- Some strict demo flags can be false while core learning flows still work.
- The fallback plan is documented in the readiness checklist.

Expected outcome:

- The backend responds and the presenter knows which providers are ready.

### 2. Upload Learning Material

Show uploading an OOP or Data Structures file.

Talking points:

- The backend extracts text and splits it into retrievable chunks.
- Uploaded material is treated as course-specific truth.
- Curated knowledge is support material, not a replacement for the upload.

Expected outcome:

- The material appears in the learning workspace.
- Noesis can generate learning tools from it.

Recommended first upload:

```text
demo-materials/oop-encapsulation-demo.md
```

### 3. AI Tutor

Ask a concrete question such as:

```text
Give me an example of encapsulation.
```

Talking points:

- The tutor uses uploaded context first.
- For OOP/DS topics, it can add curated examples, code, mistakes, and checkpoint questions.
- Groq can be used for demo-quality generation, with Ollama available locally.

Expected outcome:

- The response should include a clear explanation, concrete code or example, a common mistake, and a check-your-understanding question.

### 4. Generated Notes

Generate notes for a topic such as Queue, Encapsulation, or Polymorphism.

Talking points:

- Notes are structured lessons, not plain summaries.
- The notes can include objectives, deep explanation, code walkthrough, diagram, common mistakes, mini quiz, and recap.
- Raw internal chunk data is not shown to the learner.

Expected outcome:

- A polished lesson appears with sections and learning aids.

### 5. Quiz And Flashcards

Generate a quiz and flashcards from the same material.

Talking points:

- Quiz and flashcard prompts use uploaded material plus curated concept coverage.
- Questions should test understanding, not just definitions.
- Common mistakes and complexity can become practice items.

Expected outcome:

- The quiz has valid options and explanations.
- Flashcards have useful front/back recall prompts.

### 6. Learning Map And Study Plan

Open the learning map or study plan for the uploaded material.

Talking points:

- Noesis can organize topics into a learning path.
- Curated prerequisites and next-topic relationships help support OOP/DS navigation.

Expected outcome:

- The learner sees a structured path or study tasks related to the material.

### 7. Storyboard Or Video Explanation

Generate a storyboard for a topic such as Linked List, Stack, Big-O, or Encapsulation.

Talking points:

- Storyboards are reviewed before rendering.
- Visual quality gates check for concrete CS visuals, code scenes, common mistakes, and checkpoints.
- Approved storyboards can render into video.

Expected outcome:

- A scene-by-scene explanation with concrete visuals and narration.

Recommended second upload:

```text
demo-materials/linked-list-demo.md
```

### 8. Evaluation Evidence

Show the evaluation documentation rather than raw generated reports.

Talking points:

- The eval suite has 7 JSONL files and 21 starter records.
- A completed Groq full run evaluated 21 of 21 records with 0 errors and average score 2.52 out of 3.
- Evaluation tracks JSON validity, placeholders, weak topics, provider failures, and fine-tuning readiness.

Expected conclusion:

- The current architecture is demo-ready without fine-tuning.
- Remaining work is better eval coverage and future reviewed training data.

## Known Limitations

- The eval suite is still small and should grow beyond 21 records.
- Groq on-demand tiers may require long delays between eval items.
- Fine-tuning has not been performed.
- The curated knowledge base currently focuses on selected OOP/Data Structures topics.
- Uploaded material quality still matters; weak or tiny uploads can limit grounding.

## Closing

"The important design choice is that Noesis improves AI learning quality through grounding and curated educational knowledge first. Fine-tuning is treated as a future research step, not a shortcut for the demo."
