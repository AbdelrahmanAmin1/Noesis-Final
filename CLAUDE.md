# CLAUDE.md — Noēsis Backend + AI Rules

## 1. Project Identity

Noēsis is an AI learning assistant for students.

The first strong domain focus is:

- Object-Oriented Programming1
- Data Structures
- Algorithms
- Big-O / complexity analysis

The platform may support general study material, but OOP and Data Structures must be treated as the highest-accuracy domains.

The final goal is a demo-ready system where a user can:

1. Upload study material
2. Extract and understand content
3. Generate grounded notes
4. Generate flashcards
5. Generate quizzes
6. Track dashboard progress
7. Generate AI tutor video explanations with narration and visuals

---

## 2. Current Stack Rules

Use the current stack unless there is a strong reason to change it.

Current stack:

- Frontend: existing static React app in `project/`
- Backend: Node.js + Express, CommonJS
- Database: SQLite using `better-sqlite3`
- Auth: JWT with httpOnly cookies and bearer token compatibility
- Uploads: Multer
- File parsing:
  - PDF: `pdf-parse`
  - DOC/DOCX: `mammoth`
  - PPTX: `adm-zip`
  - TXT / Markdown: direct extraction
- Local AI runtime: Ollama
- Local embeddings: `nomic-embed-text`
- Video assembly: ffmpeg / ffprobe
- TTS: Piper preferred, Windows SAPI fallback allowed

Do not rewrite the whole application.

Do not introduce unnecessary complexity.

Do not convert the project to another framework unless explicitly requested.

---

## 3. Frontend Protection Rule

Do not redesign the UI.

Do not change the existing app flow.

Do not remove existing pages, animations, layout, or styling.

Allowed frontend changes:

- Replace mock data with real API calls
- Fix broken API integration
- Add loading states if missing
- Add error handling/toasts if already compatible with the current UI style
- Fix small integration bugs that block backend functionality

The frontend should remain visually the same unless the user explicitly asks for UI redesign.

---

## 4. AI Provider Strategy

The project is local-first.

Default AI provider:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_GEN_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
```

However, the system should be designed so generation can optionally use Groq if the user chooses.

Optional provider:

```env
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=
```

Rules:

- Do not remove Ollama.
- Do not force Groq.
- Do not send uploaded private material to Groq unless the user explicitly enables Groq.
- Keep embeddings local by default.
- Build a clean AI provider abstraction:
  - `generate()`
  - `generateJSON()`
  - `embed()`
  - `healthCheck()`
  - `listModels()` if supported
- Ollama should remain the default provider.
- Groq should be optional and configurable.
- If using Groq, fetch or document active models instead of hardcoding outdated model choices.
- Add clear `.env.example` entries.
- Add clear health checks showing which provider and model are active.

Model choice must be based on evaluation, not guessing.

Compare models using:

- JSON reliability
- Explanation quality
- OOP/Data Structures accuracy
- RAG faithfulness
- Speed
- Cost
- Privacy
- Offline availability
- Demo stability

---

## 5. Local AI Rules

Current local model `llama3.2:3b` may be kept for MVP, but it may be weak for:

- Strict JSON generation
- Deep explanations
- Long educational tutoring
- Advanced OOP/Data Structures reasoning

When improving the system, evaluate stronger local models through Ollama, especially models suitable for coding, reasoning, and education.

Do not assume a model is better without testing.

Create a simple evaluation script or test suite before switching the default model.

---

## 6. RAG Rules

RAG is mandatory.

Generated educational content must be grounded in uploaded material whenever material exists.

Current pipeline:

```text
uploaded file
→ extract text
→ detect chapters/headings
→ chunk text
→ embed chunks
→ store chunks and embeddings
→ retrieve relevant chunks
→ prompt AI with retrieved source excerpts
→ generate notes / flashcards / quizzes / video scripts
```

Improve RAG quality without over-engineering.

Recommended improvements:

- Better heading/chapter-aware chunking
- Preserve metadata:
  - material id
  - file name
  - page number if available
  - chapter/section title
  - chunk index
- Hybrid retrieval:
  - cosine similarity over embeddings
  - keyword/BM25-style fallback
  - title/heading boosts
- Minimum similarity threshold
- Top-k retrieval tuning per feature
- Optional reranking if simple and useful
- Prompt templates per feature
- Source-grounded output
- Refuse unsupported claims when retrieved context is weak

All generated outputs should prefer this priority order:

1. Uploaded course material
2. Curated Noēsis OOP/Data Structures knowledge base
3. General model knowledge only when clearly needed and clearly marked

Never hallucinate course-specific content.

If the source material does not contain enough information, say so and generate only safe general help.

---

## 7. OOP and Data Structures Accuracy Rules

OOP and Data Structures are core domains.

For these topics, explanations should be professional, clear, and technically correct.

Every strong explanation should include, when appropriate:

- Definition
- Why the concept matters
- Real-world analogy
- Code example
- Step-by-step walkthrough
- Common mistakes
- Complexity analysis if relevant
- Visual explanation plan
- Practice question or mini quiz

Important topics include:

### OOP

- Class
- Object
- Constructor
- Encapsulation
- Abstraction
- Inheritance
- Polymorphism
- Composition
- Association / aggregation / composition
- Interfaces
- Abstract classes
- Overloading vs overriding
- SOLID basics
- UML class relationships

### Data Structures

- Array
- Linked list
- Stack
- Queue
- Hash table
- Tree
- Binary tree
- BST
- Heap
- Graph
- Trie
- Sorting basics
- Searching basics
- Recursion
- Big-O analysis

Noēsis should avoid giving shallow generic explanations for these domains.

---

## 8. Fine-Tuning / Training Rule

Do not block the MVP on fine-tuning.

Fine-tuning is optional and future-facing.

The practical current approach should be:

1. Strong RAG
2. Better prompts
3. Curated OOP/Data Structures knowledge base
4. Evaluation tests
5. Optional provider/model upgrade
6. Optional future fine-tuning

If creating a training/fine-tuning plan, keep it realistic.

Recommended future approach:

- Create `training/` folder only if useful
- Add dataset research notes
- Add data cleaning scripts
- Add synthetic Q&A generation from user-approved course materials
- Add evaluation set for OOP/Data Structures
- Consider LoRA/QLoRA fine-tuning only if hardware/resources allow
- Do not pretend fine-tuning is already implemented if it is not

Dataset research must check:

- License
- Quality
- Relevance to OOP/Data Structures
- Format
- Size
- Whether it teaches concepts or only contains code
- Risk of incorrect/low-quality answers
- Suitability for fine-tuning vs RAG/evaluation

Possible dataset categories:

- User-uploaded OOP/Data Structures slides and notes
- Locally provided textbooks/lecture notes with permission
- CodeSearchNet-style code/comment pairs
- APPS-style programming problems
- CodeAlpaca / Evol-Instruct-Code style instruction datasets
- StackOverflow-style misconception Q&A
- Custom generated Q&A from course material

Course material and curated content are more important than random internet data.

---

## 9. Video Generation Rules

Video generation is mandatory and must be improved.

The video feature is not a diffusion/generative-video model.

It should be an AI tutor video pipeline:

```text
RAG retrieval
→ educational lesson plan
→ tutor script
→ visual storyboard
→ slide/mindmap generation
→ narration
→ ffmpeg assembly
→ saved MP4
```

The generated video must teach the concept, not just read generic text.

Each video should include:

- Title
- Learning objectives
- Short intro
- Concept explanation
- Visual analogy
- Step-by-step example
- Code example if relevant
- Diagram or mindmap if relevant
- Common mistakes
- Quick recap
- Mini quiz or reflection question

For OOP/Data Structures videos, prefer visuals such as:

- Class/object relationship diagrams
- Memory/linked-node diagrams
- Stack/queue operation animation plan
- Tree traversal diagrams
- Graph diagrams
- Big-O comparison visuals
- Mindmaps

Video scripts must use retrieved source chunks.

Do not generate video explanations from only the word “document” or file name.

The concept must be extracted from actual uploaded content or user-selected topic.

---

## 10. TTS / Voice Rules

Piper is preferred for local narration, but it must be properly configured.

If `TTS_ENGINE=piper`, then `TTS_VOICE_PATH` must point to a valid Piper voice model.

If Piper is not configured, fallback is allowed, but the system must clearly report it.

Improve narration quality by:

- Splitting text into natural sentences
- Adding pauses between sections
- Avoiding robotic long paragraphs
- Normalizing audio volume
- Using better voice configuration where available
- Making script conversational but still academic
- Avoiding repetitive phrases
- Adding pronunciation handling for technical terms if possible

Do not silently fail when TTS or ffmpeg is missing.

Add setup diagnostics for:

- ffmpeg
- ffprobe
- Piper executable
- Piper voice path
- fallback TTS engine

---

## 11. JSON Generation Rules

AI JSON output must be reliable.

For flashcards and quizzes:

- Use strict schemas
- Validate with Zod
- Repair JSON only when safe
- Retry with a stricter prompt if JSON is invalid
- Add fallback generation from source chunks
- Never store malformed AI output
- Log validation failures clearly

Prefer a dedicated `generateJSON()` helper that:

1. Prompts for JSON only
2. Parses response safely
3. Validates schema
4. Repairs if possible
5. Retries once if needed
6. Falls back gracefully

---

## 12. Backend Structure Rules

Keep the backend clean and maintainable.

Prefer clear separation:

```text
routes/
services/
middleware/
db/
utils/
schemas/
config/
```

Do not create huge route files if logic belongs in services.

Use centralized error handling.

Use consistent API response shapes.

Use environment validation at startup.

Add meaningful logs for:

- uploads
- extraction
- chunking
- embedding
- retrieval
- AI generation
- video generation
- TTS
- ffmpeg errors

---

## 13. Security Rules

Security is required.

Must protect against:

- SQL injection
- path traversal
- unsafe file uploads
- unsupported file types
- oversized uploads
- invalid JWT
- weak password storage
- leaking sensitive env values
- sending private files to external providers without explicit opt-in

Rules:

- Hash passwords with bcrypt
- Validate request bodies
- Sanitize file names
- Store uploads safely
- Never trust user file paths
- Use parameterized database queries
- Keep JWT in httpOnly cookies where applicable
- Keep bearer token compatibility if already implemented

---

## 14. API Requirements

The backend must support:

- Auth
- Materials
- Notes
- Flashcards
- Quizzes
- Dashboard
- Video generation
- AI health/status
- RAG retrieval checks if useful for debugging

The API should be demo-ready and stable.

---

## 15. Testing Rules

Add or improve tests where practical.

Minimum important tests:

- Auth flow
- Upload flow
- Text extraction
- Chunk creation
- Embedding fallback
- RAG retrieval
- Notes generation
- Flashcards JSON validation
- Quiz JSON validation
- Video generation failure handling
- Missing ffmpeg/TTS diagnostics
- API error responses

If full testing is too large for now, create a prioritized testing plan and implement the highest-value tests first.

---

## 16. Demo Readiness Rules

The app should be reliable for a graduation project demo.

Demo-critical flows:

1. Register/login
2. Upload material
3. View uploaded material
4. Generate notes
5. Generate flashcards
6. Generate quiz
7. Answer quiz and track score/progress
8. Generate tutor video
9. Play/download generated video
10. Show AI health/status clearly

Every demo-critical flow should have:

- Loading state
- Error message
- Backend validation
- No blank white screen
- No silent failure

---

## 17. Codex Review Requirement

After major implementation work, prepare a Codex review prompt.

The Codex review must include:

### Phase 1 — Adversarial Review

Ask Codex to find:

- Bugs
- Security issues
- Broken flows
- Weak error handling
- Bad AI parsing
- RAG grounding issues
- Upload problems
- Auth problems
- Video generation failures
- TTS/ffmpeg setup issues

### Phase 2 — Evaluation

Ask Codex:

- Is the system demo-ready?
- Is the system production-ready?
- What is missing?
- What can break during the demo?
- What should be fixed first?

### Phase 3 — Fix Plan

Ask Codex for:

- Prioritized fixes
- File-level changes
- Risk level per issue
- Minimal implementation steps

Then apply only the fixes that improve stability and demo readiness.

---

## 18. Final Engineering Principles

Do:

- Keep MVP simple
- Improve reliability
- Improve RAG quality
- Improve AI output quality
- Improve video explanation quality
- Keep local-first design
- Make Groq optional, not forced
- Add clear diagnostics
- Make the system demo-ready

Do not:

- Over-engineer
- Rewrite the entire app
- Break the frontend design
- Add paid APIs without explicit user choice
- Pretend fine-tuning is complete
- Store malformed AI output
- Generate unsupported educational claims
- Ignore ffmpeg/TTS failures
- Make changes without checking existing files first