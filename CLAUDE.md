# Noēsis Backend Rules (CLAUDE.md)

## 🧠 Core Idea
Noēsis is an AI learning assistant focused on:
- Object-Oriented Programming
- Data Structures

---

## ⚙️ Tech Rules

- Node.js + Express
- SQLite (MVP)
- Multer (uploads)
- pdf-parse + mammoth
- JWT + bcrypt
- Ollama (local AI ONLY)

❌ No OpenAI / Claude API / paid services

---

## 🤖 AI Integration

Use Ollama:
http://localhost:11434

Default model:
llama3.2:3b

---

## 🔍 RAG (Simple)

- Extract text
- Chunk it
- Store in DB
- Retrieve relevant chunks
- Send to Ollama

---

## 🎥 Video Feature (MANDATORY)

Pipeline:

1. Script generation (Ollama)
2. Audio generation (TTS)
3. Slides/images
4. Video creation (ffmpeg/moviepy)

Store in:
/uploads/videos

---

## 🔐 Security

- Hash passwords
- Validate inputs
- Sanitize file uploads
- Protect against:
  - SQL injection
  - Path traversal

---

## 🔌 API

Must include:
- Auth
- Materials
- Notes
- Flashcards
- Quizzes
- Dashboard
- Video generation

---

## ⚠️ Frontend Rule

- DO NOT change UI
- Replace mock data only

---

## 🧪 FINAL STEP (CRITICAL — DO NOT SKIP)

After finishing implementation:

You MUST prepare a Codex review.

---

## 🤖 Codex Review Instructions

Create a prompt for Codex to:

### Phase 1 — Adversarial Review
- Find bugs
- Find security issues
- Find broken flows
- Check AI parsing
- Check file uploads
- Check auth

### Phase 2 — Evaluation
- Is it production-ready?
- Is it demo-ready?
- What’s missing?

### Phase 3 — Fix Plan
- Prioritized fixes
- File-level changes

---

## 🔁 After Codex Review

Then:
- Apply fixes
- Improve stability
- Keep MVP simple

---

## 🎯 Final Goal

A working system where user can:

1. Upload CS material
2. Generate notes
3. Generate quizzes
4. Track progress
5. Generate AI video explanations

---

## 🚨 Final Rule

Do NOT:
- Over-engineer
- Add unnecessary complexity

Focus on:
✔ Clean backend  
✔ Working features  
✔ Local AI  
✔ Demo-ready system  