# Visual protocol construction

The `learning_visual` protocol is closed and declarative. Never send HTML, SVG markup, Mermaid, Markdown diagrams, JavaScript, or executable code. Every id must be unique within the content. Edges, cells, memberships, prerequisites, eras, and sequence focus ids must reference declared ids.

Keep titles concise, descriptions action-oriented, and fallback Markdown equivalent in meaning. Stay inside the schema bounds exposed by the tool; the runtime parser rejects unknown keys and broken references.

## Computed plots

Plots accept static points, polylines, bars, and computed curves. They may contain one to three bounded parameters and parameter-derived metrics.

Expressions are JSON math ASTs. Leaves are `constant` and `variable`; binary operations are `add`, `sub`, `mul`, `div`, and `pow`; unary operations are `neg`, `abs`, `sqrt`, `sin`, `cos`, `exp`, `log`, and `sigmoid`. Curve expressions may use `x` and declared parameter ids. Metric expressions may use declared parameters but not `x`.

The logistic curve σ(β₀ + β₁x):

```json
{
  "op": "sigmoid",
  "value": {
    "op": "add",
    "left": { "op": "variable", "name": "b0" },
    "right": {
      "op": "mul",
      "left": { "op": "variable", "name": "b1" },
      "right": { "op": "variable", "name": "x" }
    }
  }
}
```

The P = 0.5 decision boundary −β₀/β₁ as a parameter-only metric:

```json
{
  "op": "div",
  "left": { "op": "neg", "value": { "op": "variable", "name": "b0" } },
  "right": { "op": "variable", "name": "b1" }
}
```

Use explicit, stable axis ranges. Use dashed or dotted strokes as well as labels for comparisons; do not communicate only through color.

## Content integrity

- `node_link`: every `from` and `to` references a node; layered nodes reference declared groups.
- `scene_2d`: every coordinate and dimension is finite; shapes remain inside an intelligible axis range.
- `relation`: cells reference declared subjects/axes; set membership references declared sets.
- `timeline`: events are ordered; era endpoints reference declared events; positions are either present for all events or omitted for all.
- `formula_steps`: expressions are LaTeX display math without dollar delimiters, not executable code; every transition remains pedagogically and algebraically valid.
- `study_map`: concepts reference a section and declared prerequisite concepts; anchors mirror the source.
- `recall_deck`: answers and hints are source-grounded; tags are short and useful for interleaving.
