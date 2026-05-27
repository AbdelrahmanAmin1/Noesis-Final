# Noesis RAG And Knowledge Base

Noesis uses a hybrid grounding strategy: uploaded course material for course-specific truth, curated OOP/Data Structures knowledge for teaching depth, and the model's general knowledge only for simple analogies or examples when needed.

## Grounding Priority

```text
1. Uploaded material
   course terminology, teacher-specific definitions, file-specific facts

2. Curated OOP/Data Structures knowledge
   deeper explanations, code examples, diagrams, common mistakes, quizzes

3. General model knowledge
   simple analogies or examples only when grounding is weak
```

## Uploaded Material RAG

Uploaded materials are extracted, split into chunks, stored locally, and retrieved by material. These chunks are the first source used by tutor, notes, video/storyboard, quiz, and flashcard generation.

This means a student can upload course slides or notes and Noesis will answer using that material first instead of drifting into unrelated textbook wording.

## System Corpus

The backend also has a system corpus seeded into SQLite under the system user. It is used as secondary educational support for common OOP/Data Structures topics.

The system corpus is useful when uploaded material is short, shallow, or missing a beginner-friendly example. It should not be treated as proof that a specific uploaded course said something.

## Structured Knowledge Base

The structured knowledge files live under `backend/knowledge/`. They are small JSON topic files, committed with the app, and validated by the knowledge validation script.

Current curated topics:

- Encapsulation
- Inheritance
- Polymorphism
- Abstraction
- Class and Object
- Linked List
- Stack
- Queue
- Binary Search Tree
- Big-O Notation

Each upgraded topic can include definitions, deeper explanations, code examples, walkthroughs, diagram specs, common mistakes, best practices, mini quizzes, flashcards, and related topics.

## Knowledge Services

- `knowledge.service.js` loads topic JSON recursively, matches topics and aliases, and formats topic context.
- `educational-context.service.js` builds compact feature-specific context for tutor, notes, video/storyboard, quiz, and flashcards.
- `seed-knowledge-corpus.js` can seed curated topic content into the system RAG corpus.
- `validate-knowledge.js` checks that curated topics have required educational fields.

## How Features Use Knowledge

- Tutor uses curated examples, mistakes, and checkpoints when the topic matches.
- Notes use curated code, diagrams, mistakes, mini quiz, and related topics.
- Video/storyboard generation uses compact visual and code context to produce concrete scenes.
- Quiz and flashcard generation use curated mistakes, complexity, and concept checks.

## Why This Matters For The Demo

The curated knowledge base gives Noesis reliable DS/OOP teaching assets without training a new model. It makes outputs more specific while keeping the uploaded material as the source of truth.
