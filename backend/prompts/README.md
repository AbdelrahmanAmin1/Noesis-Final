# Noesis Prompt Templates

Prompt templates live in `backend/prompts/templates`.

`backend/utils/prompts.js` loads these files at runtime, caches them in memory, and falls back to its inline template strings if a file is missing or unreadable. This keeps the app usable while making prompt edits visible and reviewable.

## Editing Templates

Use the existing `{{PLACEHOLDER}}` names in each file. The prompt loader replaces those placeholders with runtime values such as source excerpts, concept names, counts, or difficulty.

When adding a new template:

1. Add a `.txt` file in `templates`.
2. Add a fallback template and exported function in `backend/utils/prompts.js`.
3. Keep output contracts explicit, especially for JSON prompts.
4. Do not claim the model has been trained. These are prompt templates, not training artifacts.

