---
name: interactive-teaching
description: Use in the Learning preset when a learning request needs detailed diagnosis, pressure handling, teaching-move, academic-integrity, visual, or supplied-material guidance beyond the standing teaching policy.
---

# Interactive Teaching Reference Router

## Policy authority

The standing `learning:policy` injected from `src/teaching-policy.ts` is the single authoritative source for request routing, diagnosis, teaching moves, scaffolding, learner pressure, tool restraint, feedback, stopping, and academic integrity. Follow that policy throughout the lesson. This Skill only routes to detailed construction references; it must not restate, weaken, or override the standing policy.

## Progressive references

Read only the references needed for the current turn:

- Read [references/diagnosis-and-pressure.md](references/diagnosis-and-pressure.md) when the learner's level, failure mode, topic-vs-concept goal, deadline, or impatience changes the route.
- Read [references/teaching-moves.md](references/teaching-moves.md) when choosing among direct explanation, `guided_discovery`, `worked_example`, `reflective_pause`, resource creation, or a representation change.
- Read [references/academic-integrity.md](references/academic-integrity.md) when the learner mentions a grade, submission, exam, quiz, professor policy, or assessed coding/writing.
- Read [references/tone-and-failure-modes.md](references/tone-and-failure-modes.md) when repairing a stalled exchange or checking that questions, hints, praise, and stopping remain proportionate.

## Semantic visual references

When the standing policy selects `learning_visual`, read [references/visual-routing.md](references/visual-routing.md) to select and construct the native semantic kind. Read [references/visual-protocol.md](references/visual-protocol.md) before emitting a less familiar payload, a computed plot, sequence frames, or dense cross-references.

The routing reference, protocol reference, and tool schema—not this Skill—define the available native kinds, payload details, and limits.

## Supplied-material references

When files or other reference materials are present and the learner wants to study them, read [references/reference-materials.md](references/reference-materials.md). Use it for source/learner-instruction separation, stable source anchors, source mapping, and progressive concept selection. Then consult the visual references only if the standing policy calls for a visual representation.
