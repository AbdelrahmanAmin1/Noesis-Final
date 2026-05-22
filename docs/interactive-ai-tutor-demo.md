# Noesis Interactive AI Tutor

## What Changed

The original guided Socratic tutor remains available as **Guided Session**. A new **Free Chat** mode adds grounded question-answering over uploaded materials, source citations, voice input, voice output, an animated avatar, study action chips, and recent chat continuation.

## Demo Checklist

1. Start the backend from `backend/` with `node server.js`.
2. Start the frontend from `project/` with `node dev-server.js`.
3. Open `http://localhost:5173/Noesis`.
4. Go to **AI Tutor**.
5. Choose **Free Chat**.
6. Select a ready uploaded material from the grounded source dropdown.
7. Ask a question such as `What is the main idea in this material?`.
8. Verify the answer shows a grounding badge and clickable `[Source N]` citations.
9. Click a citation and confirm the source rail opens/highlights the matching source.
10. Click the speaker button on a tutor reply and confirm the avatar enters speaking state.
11. Try the microphone button in Chrome or Edge and confirm transcript text appears in the input.
12. Try action chips: **Quiz me**, **Give example**, and **Make flashcards**.
13. Return to **AI Tutor** and confirm **Continue last chat** appears when chat history exists.
14. Choose **Guided Session** and confirm the original structured tutor still works.

## Verification Commands

```bash
cd project
node build-bundle.js
node verify-chat-bundle.js
```

```bash
cd backend
npm test -- tutor-chat tutor-routes
npm test
```

## Notes

- Free Chat uses `/api/tutor/chat` and stores messages in `tutor_conversations` and `tutor_chat_messages`.
- TTS uses `/api/tutor/tts` and streams `audio/wav`; temporary `tts-*` files are cleaned up after the response finishes.
- Voice input uses the browser Web Speech API, so support is browser-dependent.
- Grounding badges show whether an answer is strongly, moderately, or weakly supported by retrieved material.
