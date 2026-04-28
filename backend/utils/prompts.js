'use strict';

const SYSTEM_BASE = `You are Noesis, a focused academic tutor. Be precise, concise, and pedagogically clear. Never invent facts; if context is insufficient, say so.`;

const NOTES_SUMMARY = (chunks, title) => `${SYSTEM_BASE}

Task: Write a study-quality markdown note titled "${title}". Use the source excerpts below. Cite chunk ids inline as [chunk:ID] when grounding a claim. Use h2/h3 headings, short paragraphs, and bullet lists where helpful. End with a "Don't forget" section of 3 short bullets.

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}

Output: ONLY the markdown body. No preamble.`;

const FLASHCARDS = (chunks, count) => `${SYSTEM_BASE}

Task: Generate ${count} high-quality flashcards from the source excerpts. Prefer atomic facts, definitions, and contrasts. Avoid trivia.

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}

Output STRICT JSON only, no commentary:
{"cards":[{"question":"...","answer":"...","source_chunk_id": <id>}]}`;

const QUIZ_MCQ = (chunks, count, difficulty) => `${SYSTEM_BASE}

Task: Generate ${count} multiple-choice quiz questions at ${difficulty} difficulty. Each question must have exactly 4 options with ONE correct answer (correct_idx 0-3). Each must include a short, helpful explanation that justifies the correct answer and addresses common misconceptions.

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}

Output STRICT JSON only:
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","concept":"..."}]}`;

const TUTOR_PLAN = (concept, mode, chunks) => `${SYSTEM_BASE}

Build a 5-step Socratic-style learning plan for the concept: "${concept}". Mode: ${mode}. The 5 steps should follow: (1) Warm-up, (2) Intuition, (3) The trick / core idea, (4) Formalize, (5) Apply.

For each step, provide a short title (1-3 words) and a concise probing question OR explanation (depending on mode).

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}

Output STRICT JSON only:
{"steps":[{"t":"Warm-up","q":"...","options":["A","B","C","D"],"correct_idx":1,"explanation":"..."}]}
Each step MUST include 4 options and a correct_idx with explanation.`;

const TUTOR_FEEDBACK = (concept, step, userAnswerText, correct) => `${SYSTEM_BASE}

The student is learning: "${concept}". Step: "${step.t} — ${step.q}".
The student answered: "${userAnswerText}". The answer is ${correct ? 'CORRECT' : 'INCORRECT'}.

Write a 2-3 sentence feedback in markdown. If correct, deepen the insight. If incorrect, gently redirect with a hint without revealing the full answer.

Output: only the markdown text.`;

const VIDEO_SCRIPT = (concept, chunks) => `${SYSTEM_BASE}

Task: Write a short narrated explainer video script (3-6 slides) on: "${concept}". Each slide must have: a short title, 2-4 bullet points (under 10 words each), and a narration paragraph (40-80 words) that a TTS engine will read.

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}

Output STRICT JSON only:
{"slides":[{"title":"...","bullets":["...","..."],"narration":"..."}]}`;

const CONCEPT_EXTRACT = (chunks) => `${SYSTEM_BASE}

Identify the 3-8 most important named concepts in these excerpts. Output STRICT JSON only:
{"concepts":["...","..."]}

Source excerpts:
${chunks.map(c => `[chunk:${c.id}] ${c.text}`).join('\n\n')}`;

const REPAIR_JSON = (raw) => `Fix the JSON below. Output ONLY valid JSON with no commentary. If structure is unclear, choose the most sensible interpretation.

INPUT:
${raw}

OUTPUT:`;

module.exports = {
  SYSTEM_BASE,
  NOTES_SUMMARY,
  FLASHCARDS,
  QUIZ_MCQ,
  TUTOR_PLAN,
  TUTOR_FEEDBACK,
  VIDEO_SCRIPT,
  CONCEPT_EXTRACT,
  REPAIR_JSON,
};
