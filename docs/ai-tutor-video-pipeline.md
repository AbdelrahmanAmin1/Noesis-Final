# AI Tutor Video Grounding Pipeline

This document describes the button-based AI Tutor video flow after the grounding updates.

## Flow

1. The user uploads course material.
2. The backend extracts text from PDF, PPTX, DOCX, Markdown, TXT, or supported document formats.
3. The material is split into chunks with source metadata such as chapter, heading, slide number, page fallback, and chunk id.
4. Material diagnostics record extraction strength, chunk count, evidence count, retrieval scores, source file name, and weak-extraction flags.
5. Topic detection builds a material understanding object:
   - domain
   - topic
   - normalized topic
   - confidence
   - key concepts
   - source evidence
   - reason
   - alternatives
6. Storyboard generation uses the detected topic and uploaded material as the source of truth.
7. If the material is abstract or lacks beginner-friendly examples, enrichment can simplify the same detected topic only.
8. Every storyboard scene separates uploaded `sourceEvidence` from optional AI `enrichment`.
9. Storyboard quality gates reject weak topic detection, missing evidence, vague scenes, unsupported visual types, unrelated diagrams, narration/visual mismatch, abstract chip-only scenes, topic drift, and missing domain-specific visuals.
10. Approved storyboards render through concrete CS visuals instead of falling back silently to generic concept maps.
11. The frontend review screen shows the detected topic, domain, concepts, grounding score, enrichment use, topic drift risk, source file, scene count, per-scene evidence, visual purpose, selected visual reason, visual elements, visual operations, and visual validation warnings.

## Supported Visual Types

- `encapsulation_boundary`
- `class_object`
- `inheritance_uml`
- `polymorphism_dispatch`
- `linked_list_operation`
- `stack_operation`
- `queue_operation`
- `hash_table_operation`
- `tree_visual`
- `big_o_growth`
- `code_walkthrough`
- `process_flow`
- `comparison_contrast`
- `learning_objectives`
- `summary_path`
- explicit `concept_map`

Unknown visual types fail quality validation before render.

## Demo Checklist

1. Start the backend from `backend/`:

   ```bash
   npm start
   ```

2. Start the frontend from `project/`:

   ```bash
   node dev-server.js
   ```

3. Open `http://localhost:5173/Noesis`.
4. Upload an Encapsulation, Linked List, Hash Table, or Big-O material.
5. Open the material and click `Tutor video storyboard`.
6. On the storyboard review page, confirm:
   - detected domain and topic are specific
   - concepts match the uploaded material
   - source file and scene count are shown
   - enrichment use and reason are shown when applicable
   - uploaded material coverage and topic drift risk are visible
   - each scene has collapsed source evidence
   - each scene shows visual type, purpose, rationale, elements, operations, relationships, and visual validation status
   - visual warnings are separate from narration/content warnings
7. Approve only when the status is passed.
8. Render MP4.
9. Confirm the video uses concrete visuals tied to the detected topic.

## Encapsulation Expected Output

For Encapsulation material, the generated storyboard should include:

- class vs object
- private fields
- public methods
- blocked direct access
- valid method calls
- bad public field example vs corrected private field example
- Java code walkthrough
- controlled access through a public API

It should not render random glowing shapes, generic inspirational text, unsupported visual fallbacks, or scenes without source evidence.

## Verification Commands

Backend:

```bash
cd backend
npm test
```

Frontend bundle:

```bash
node project/build-bundle.js
```

Targeted video grounding checks:

```bash
cd backend
npm test -- extract-service.test.js material-understanding.test.js video-grounding-regression.test.js visual-quality-regression.test.js topic-visual-standards.test.js remotion-visual-smoke.test.js storyboard-service.test.js storyboard-gate-enforcement.test.js visual-registry.test.js grounded-enrichment.test.js material-diagnostics.test.js video-regression.test.js
```

Full serialized backend regression suite:

```bash
cd backend
npm test -- --sequence.concurrent false
```
