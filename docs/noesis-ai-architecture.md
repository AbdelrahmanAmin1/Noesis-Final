# Noesis AI Architecture

This document summarizes the current Noesis AI architecture for the graduation demo. Noesis does not use a fine-tuned model today. The demo-ready AI behavior comes from uploaded-material grounding, curated OOP/Data Structures knowledge, feature-specific prompts, and configurable Groq/Ollama providers.

## Architecture Overview

```text
Frontend learning flows
  upload, tutor, notes, video, quiz, flashcards
        |
        v
Express backend routes
        |
        +--> upload extraction and chunking
        |       PDF, PPTX, DOCX, text, markdown
        |
        +--> retrieval and educational context
        |       uploaded chunks first
        |       curated system corpus second
        |       structured topic knowledge when matched
        |
        +--> generation services
        |       tutor, notes, storyboard/video, quiz, flashcards
        |
        +--> provider layer
                Groq for demo-quality cloud generation when configured
                Ollama for local/private generation and fallback
```

## Main AI Components

- Uploaded material processing turns user files into searchable chunks with metadata.
- RAG retrieval supplies course-specific grounding from the uploaded material.
- The system corpus supplies curated OOP/Data Structures support when uploaded material is thin.
- `backend/knowledge/` stores structured topic files for OOP, Data Structures, and Big-O.
- `knowledge.service.js` loads, searches, and formats curated topic files.
- `educational-context.service.js` combines uploaded chunks, system chunks, curated topic knowledge, and generation policy.
- Feature prompts use the policy: uploaded material is course truth, curated knowledge adds teaching depth, and general model knowledge is only a last-mile source for simple examples or analogies.

## Provider Strategy

Noesis is provider-configurable. The current project supports:

- Ollama: local-first generation and embeddings, useful when privacy or offline operation matters.
- Groq: optional cloud generation for faster and stronger demo outputs when an API key is available.
- Fallback routing: feature providers can fall back to local models without replacing the app architecture.

The app currently improves quality through retrieval, curated knowledge, and prompt design. It does not replace the base model with a fine-tuned model.

## Feature Routing

- AI Tutor: uses uploaded context and curated topic knowledge for examples, common mistakes, and checkpoints.
- Notes: generates structured lessons plus Markdown fallback.
- Video/storyboard: generates scene sequences with visual standards and quality gates before rendering.
- Quizzes and flashcards: use uploaded excerpts plus curated concept depth, mistakes, and complexity guidance.
- Evaluation: runs prompt-level checks against committed eval JSONL files without changing runtime behavior.

## Safety Constraints

- Uploaded material stays the primary source for course-specific facts.
- Curated knowledge never replaces user material; it expands explanations when relevant.
- Raw internal JSON, chunk identifiers, and debug traces should not appear in learner-facing output.
- Generated eval reports remain ignored and should not be committed.
- Fine-tuning remains future work until evaluation evidence justifies it.
