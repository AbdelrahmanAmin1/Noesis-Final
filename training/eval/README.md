# Evaluation Sets

This folder is reserved for committed Noesis evaluation JSONL files.

Planned files:

- `oop_eval.jsonl`
- `ds_eval.jsonl`
- `big_o_eval.jsonl`
- `code_walkthrough_eval.jsonl`
- `tutor_response_eval.jsonl`
- `video_storyboard_eval.jsonl`

Each record should include:

```json
{
  "id": "oop_eval_001",
  "domain": "oop",
  "topic": "Encapsulation",
  "prompt": "Explain encapsulation with a Java example.",
  "expectedCriteria": ["correct definition", "private state", "validation", "common mistake"],
  "rubric": {
    "0": "wrong",
    "1": "shallow/partial",
    "2": "acceptable",
    "3": "strong"
  },
  "mustInclude": ["encapsulation", "private", "method"],
  "mustAvoid": ["inheritance-only explanation", "placeholder text"],
  "expectedOutputType": "markdown",
  "source": { "name": "custom", "license": "user-approved" }
}
```

Evaluation data must be separate from training data.
