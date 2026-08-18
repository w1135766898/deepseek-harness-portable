# Visual routing

Start with the relationship the learner needs to see. Choose the representation from that structure, not from topic keywords.

## Native kinds

### `plot`

Use for a quantitative relationship on axes: functions, measurements, distributions, rates, secants/tangents, and parameter sensitivity. Curves, points, polylines, and bars are available. Parameters are optional; add a slider only when changing the value is the lesson. Do not turn formula recall into an arbitrary exponent slider.

### `node_link`

Use when the question is “what connects to what?”: neural layers, trees, dependencies, causes, state transitions, processes, and concept topology. Use `layered` groups for neural networks and declare every actual edge. A 3→4→2 fully connected network has 12 + 8 = 20 edges.

### `scene_2d`

Use for spatial construction: geometry, vectors, forces, rays, fields, coordinate proofs, and annotated scientific schematics. Use explicit points, segments, arrows, circles, rectangles, polygons, and labels. Prefer a `plot` when the axes and sampled values are the main meaning.

### `relation`

Use for side-by-side comparison, row/column mappings, classification, or set membership. Pick `comparison` for shared dimensions, `matrix` for pairwise relations, and `sets` for two- or three-way membership.

### `timeline`

Use when chronology itself explains the topic: history, discoveries, life events, phases, or an evolution over time. Preserve event order and labels. Use normalized positions only when real temporal spacing matters; otherwise let events be evenly spaced. Use eras for meaningful periods, not decoration.

### `formula_steps`

Use for a derivation, proof chain, symbolic simplification, or algebraic transformation where the rule between expressions matters. Each step must be valid and the named rule must explain the transition from the preceding step. Do not use it to display one formula or to disguise a complete graded solution.

### `study_map`

Use for a supplied multi-section document, chapter, slide deck, or collection. Preserve human-readable anchors such as chapter, heading, slide, or page. Show concepts within sections, prerequisite links, and roles (`foundation`, `core`, `extension`, `practice`). It is a navigable overview, not a substitute for teaching each concept.

### `recall_deck`

Use when the learner explicitly asks for flashcards/active recall or agrees to a review phase after the material is known. Prompts should require retrieval, answers should be concise, and hints should cue without revealing. Mix conceptual contrasts and applications rather than copying headings into cards.

## Sequence frames

Any kind may include two to twelve frames that focus ids already declared in the content. Use them for a mechanism, proof focus, or staged comparison. Do not add frames merely to produce another control, and do not hide essential context in later frames.

## Selection checks

Before calling the tool, verify:

1. The visual answers the learner's actual gap.
2. Its native kind matches the relationship, not merely the subject area.
3. Interaction changes what the learner can notice.
4. Labels carry meaning without relying on color.
5. The prose remains useful if rendering fails.
6. The payload is one coherent visual, not a dashboard of unrelated facts.
