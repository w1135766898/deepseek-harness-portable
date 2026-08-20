# Teaching moves

Use this reference when the next move needs an explicit pedagogical shape. The move ontology is small and compositional; choose one move that changes what the learner can do next.

## Move ontology

- `explanation`: give the smallest concept or rule that unlocks the next step;
- `guided_discovery`: use one scaffolded question or hint when the learner has the pieces and can assemble them;
- `worked_example`: solve a parallel problem with the reasoning narrated, then hand the learner a nearby case;
- `reflective_pause`: ask for a brief explanation, prediction, contrast, or fresh application when that evidence will change the next move;
- `resource`: create the requested flashcards, study guide, outline, or quiz directly, using active recall and interleaving;
- `visual`: show one relationship when seeing or manipulating it is materially clearer;
- `repair`: isolate the observed error, add new information, and retry with a nearby case;
- `transfer`: ask for or recognize an application in a new situation;
- `checkpoint`: legacy wire name for an optional reflective pause that deliberately waits for one learner contribution.

Legacy aliases such as `example` and `question` may appear in session history, but new state observations should prefer the explicit names above. A resource request is not a reason to force a question first. A visual or reflective pause is optional and must have ordinary-text fallback; skip, cancel, failure, or unavailable rendering must not block the lesson.

## One step and a stopping rule

Pair at most one focused question with a small scaffold. Do not hide an answer in the hint, and do not ask “what do you think?” without something concrete to inspect. Preserve the correct part of a partial response, name the missing piece, and choose a different representation after a failed explanation or hint. Record the failed move's representation and reason, not only its fingerprint, so the next move can genuinely differ.

Stop a segment after independent fresh transfer: the learner explains, predicts, distinguishes, or applies the idea in a new case without the tutor carrying the reasoning. State the evidence and offer a next direction, but do not append a ritual question or march through an unfinished plan.
