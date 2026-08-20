# Visual routing

Start with the relationship the learner needs to see. Choose the representation from that structure, not from topic keywords.

## Native kinds

### `plot`

Use for a quantitative relationship on axes: functions, measurements, distributions, rates, secants/tangents, and parameter sensitivity. Curves, points, polylines, and bars are available. Parameters are optional; add a slider only when changing the value is the lesson. Do not turn formula recall into an arbitrary exponent slider.

### `node_link`

Use when the question is “what connects to what?”: neural layers, trees, dependencies, causes, state transitions, processes, and concept topology. Use `layered` groups for neural networks and declare every actual edge. A 3→4→2 fully connected network has 12 + 8 = 20 edges.

Pick the layout from the shape of the relation: `layered` for a left-to-right pipeline or a decision tree read as a flow (it requires declared groups, and every node must name one), `hierarchy` for a top-down tree with no natural grouping, `radial` for one hub with peers around it. Give groups real names — “根节点 / 内部节点 / 叶节点”, “输入层 / 隐藏层 / 输出层” — because they are drawn as the diagram's headings. Label the edges that represent a choice or a condition; a branch whose meaning lives only in its colour cannot be read. Keep that label to a few words — “取概率最高的词”, not “把新序列再喂回去猜下一个词” — because it is drawn on a chip in the gap between two columns; the sentence that explains the step belongs in the edge's `detail` or in the prose. Declare the edge that closes a loop like any other edge: an edge that runs back to an earlier group is drawn as a return arc around the diagram, so a generation loop or a state machine reads as a cycle instead of a line.

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

Frames are optional. A structure the learner should take in at once — a single comparison, one finished diagram, a short set map — is clearer without them, and frames added merely to produce another control make the figure worse.

Use two to twelve frames only when the idea genuinely has stages: a mechanism that runs, a proof that focuses different lines in turn, a path through a tree, a staged comparison. Every focused id must already be declared in the content.

Each frame carries its own context:

- The **first** frame establishes the whole structure. Focus the layer, group, or branch the rest hangs from, not one isolated element.
- A **graph** step focuses the target node together with the edge that reaches it and the node that edge comes from. A leaf on its own, with no parent and no incoming edge, is not a readable step.
- A **matrix** cell focuses its row and column; a **derivation** step focuses the step before it; a **timeline** event focuses the era it belongs to.
- Frame labels and descriptions say what changed at that step in the learner's own terms. "步骤 2" is not a label.

The renderer keeps unfocused content readable rather than hiding it, so a frame never has to strip the diagram down to make its subject visible — but it also cannot supply structure the payload never declared.

## Selection checks

Before calling the tool, verify:

1. The visual answers the learner's actual gap.
2. Its native kind matches the relationship, not merely the subject area.
3. Interaction changes what the learner can notice.
4. Labels carry meaning without relying on color.
5. The prose remains useful if rendering fails.
6. The payload is one coherent visual, not a dashboard of unrelated facts.
