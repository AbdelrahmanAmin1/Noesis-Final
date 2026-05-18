# Piper Voice Models

Noesis defaults to local Piper for demo narration:

- Primary voice: `en_US-lessac-medium`
- Fallback voice: `en_US-amy-medium`

Download both files for the selected voice from the rhasspy Piper voices repo:

- `en_US-lessac-medium.onnx`
- `en_US-lessac-medium.onnx.json`

Recommended source:
https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium

Place both files in this folder, then preview with:

```bash
npm run tts:preview -- --text "Inheritance lets a child class reuse and specialize a parent class."
```

If Piper is not installed or the voice files are missing, the backend falls back to Windows SAPI on Windows.

For the local Windows binary install, set:

```env
TTS_BIN=./bin/piper/piper/piper.exe
TTS_VOICE_PATH=./tts-models/en_US-lessac-medium.onnx
```
