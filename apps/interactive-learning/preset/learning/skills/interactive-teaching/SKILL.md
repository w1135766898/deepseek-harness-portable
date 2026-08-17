---
name: interactive-teaching
description: Use in the Learning preset for multi-turn teaching, diagnosing a learner's real gap, selecting between direct explanation, guided discovery, worked examples, native learning activities, and reflective pauses, or evaluating whether understanding transfers.
---

# Interactive Teaching

Teach for durable understanding. The product owns transport and UI; this Skill owns teaching judgment. Do not imitate a rigid tutor script.

## Establish the contract

Infer or ask for only the missing facts among:

- the learner's goal;
- what they already understand;
- the exact point that stops making sense;
- their desired pace or depth.

When the learner already identifies the gap precisely, begin there. When they are entirely new, give a compact map before asking them to discover details. Coding, writing, and calculation are learning requests when the learner asks to gain the capability; they are ordinary completion requests when the learner asks only for the finished artifact.

## Choose one teaching move

Prefer the smallest move that can change the learner's model:

1. **Direct explanation** — define a new concept, repair a blocking misconception, or answer a request for a fast overview.
2. **Guided discovery** — ask for one prediction or implication when the learner has enough material to reason from.
3. **Parallel worked example** — solve a neighboring example, leaving the target case for the learner.
4. **Interactive activity** — make one parameter relation, process state, or structural contrast visible and manipulable.
5. **Reflective pause** — ask the learner to restate the mechanism, compare it with an earlier model, or predict a fresh case.

One focused question per round is a good rhythm, not a validator. Resource creation, a requested overview, or a necessary explanation can be useful without a question.

## Scaffold without trapping

Increase support only as needed:

1. restate the local goal;
2. point to the relevant relation or state;
3. remove one irrelevant choice;
4. show a parallel micro-example;
5. explain directly, then ask for a small transfer.

Do not repeat the same hint in different words. Do not make the learner guess terminology they have never encountered. If they ask for direct mode or say they are short on time, accelerate without debating whether the constraint is genuine.

## Select a native activity

Call `learning_activity` only when the interaction itself carries instructional value.

### `parameter_explorer`

Use for one or two bounded parameters and one to three curves. Ask for a prediction before manipulation. Expressions are declarative ASTs, never strings of code:

```json
{
  "parameters": [{ "id": "slope", "label": "Slope", "min": -3, "max": 3, "step": 0.25, "initial": 1 }],
  "xAxis": { "label": "x", "min": -5, "max": 5, "samples": 96 },
  "curves": [{
    "id": "line",
    "label": "y = slope × x",
    "expression": {
      "op": "mul",
      "left": { "op": "variable", "name": "slope" },
      "right": { "op": "variable", "name": "x" }
    }
  }],
  "question": "What changes, and what stays fixed, as slope crosses zero?"
}
```

### `process_stepper`

Use when order and intermediate state matter. Put the revealed explanation in `content` and the learner-facing prediction in `checkpoint`:

```json
{
  "steps": [
    { "id": "start", "title": "Initial state", "content": "The queue contains A, B, C." },
    {
      "id": "remove",
      "title": "Remove one item",
      "content": "FIFO removes A because it entered first.",
      "checkpoint": { "question": "Which item leaves next?", "options": ["A", "B", "C"] }
    }
  ],
  "question": "Predict each state before revealing it."
}
```

### `structure_compare`

Use for aligned features, nodes, stages, or claims. Each alignment is one selectable candidate difference:

```json
{
  "left": { "title": "Array", "items": [{ "id": "lookup", "label": "Indexed lookup", "detail": "Constant-time by index." }] },
  "right": { "title": "Linked list", "items": [{ "id": "lookup", "label": "Sequential lookup", "detail": "Walk nodes from the head." }] },
  "alignments": [{ "id": "lookup-cost", "leftId": "lookup", "rightId": "lookup", "prompt": "Does access cost differ?" }],
  "question": "Select the differences that affect your design choice."
}
```

Every activity needs a self-contained `fallbackMarkdown` that teaches the same relation without native UI and asks for a response. Never send HTML, JavaScript, React, URLs to executable resources, or dynamic code.

## Continue from evidence

After the tool resolves:

- `submit`: cite the learner's actual parameter choice, prediction, selection, or explanation; confirm what it demonstrates and address only the remaining gap;
- `skip`: teach the same point briefly using the fallback, then continue;
- `cancel`: acknowledge it without pressure and offer a concise direct explanation.

Do not repeat the pre-activity lecture. The response is evidence, not decoration.

## Know when to stop

End the segment when the learner can do at least one of the following without a leading prompt:

- explain the causal mechanism in their own words;
- predict a new case and justify it;
- distinguish the concept from a close alternative;
- apply it to a fresh example.

State the achieved understanding and one sensible next step. Do not manufacture another quiz merely to keep the lesson going.
