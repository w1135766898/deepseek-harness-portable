# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` adds an explicit `learning` Agent preset to
DeepSeek Harness. Standard, Code, Minimal, and Cordis keep their original tool
schemas and prompts.

## Architecture

- The package root keeps the legacy `learningActivities` Host broker so old V1/V2
  conversations can replay safely. It registers no model-visible tools.
- `./agent` is mounted only by the Learning preset. It registers one preferred
  tool, `learning_visual`, and a compact teaching policy.
- `./client` renders the visual inline and keeps the ordinary conversation
  composer active. It also retains read-only replay support for old
  `learning_activity`, `learning_question`, and `learning_reveal` calls.
- `./protocol` owns the closed, versioned declarative contracts.
- `preset/learning/skills/interactive-teaching` provides detailed teaching
  judgment on demand.

The current design separates explanation from interaction. A visual is an
illustration inside a normal assistant response, not a form that owns the user
turn.

## Non-blocking learning flow

1. The assistant explains the missing idea in ordinary prose.
2. When manipulation is genuinely useful, it calls `learning_visual` once with
   a safe declarative chart.
3. Validation returns `visual-result@4 { status: "ready" }` immediately. No
   lesson token, pending question, submit button, reveal call, or five-minute
   user wait is created.
4. The chart renders in the tool call's place and remains interactive after the
   completed call is replayed.
5. The assistant continues with the interpretation and, if useful, one natural
   question. The learner answers through the normal composer on the next turn.

This removes the old Question → Reveal split that duplicated rounds and left a
model turn running while it waited for the learner. The surrounding prose must
still make sense if a Client cannot render the enhancement.

## Semantic visual protocol v4

`dsh-learning/visual@4` selects a trusted native renderer by concept semantics:

- `plot` for functions, data, probability, bars, and quantitative relationships;
- `node_link` for neural-network layers, trees, processes, causality, and topology;
- `scene_2d` for geometry, vectors, forces, and annotated spatial schematics;
- `relation` for comparisons, matrices, classifications, and set membership;
- `timeline` for historical events, discoveries, phases, and eras;
- `formula_steps` for derivations, algebraic transformations, and proof chains;
- `study_map` for anchored sections, prerequisites, and concept roles in reference material;
- `recall_deck` for hinted active-recall cards with local review state.

Any kind can add local sequence frames that progressively focus declared ids.
The controls remain exploratory and never replace the ordinary conversation
composer. Renderers provide a visible title, keyboard-accessible inspection,
responsive layouts, structured text alternatives, and a local error boundary.

Plot content supports optional bounded sliders, static points, polylines, bars,
computed curves, stable axes, and parameter-derived metrics. A slider is omitted
when manipulation is not the lesson. In particular, formula recall is answered
directly; a requested network structure is rendered as nodes and explicit edges
instead of being substituted with a curve or Markdown art.

When the learner supplies a document, PDF, slide deck, or several sources, the
system preserves observed section and page/title anchors, uses `study_map` for a
navigable overview when useful, and then routes each concept to its more specific
renderer. It does not flatten a whole source into one mega-graph or mechanically
turn every attachment into flashcards.

Curves use a closed recursive mathematical AST. Supported leaves are
`constant` and `variable`; binary operators are `add`, `sub`, `mul`, `div`, and
`pow`; unary operators are `neg`, `abs`, `sqrt`, `sin`, `cos`, `exp`, `log`, and
the numerically stable `sigmoid`. Curve variables are `x` plus declared
parameter ids. Metrics may use declared parameters but not `x`.

The model schema and runtime parser share the same expression-depth limit.
Unknown fields, undeclared variables, non-finite values, excessive payloads,
invalid references, and invalid ranges are rejected. Model-provided HTML,
Markdown diagrams, SVG markup, and JavaScript are never executed.

V3 parameter charts and V1/V2 activities remain parseable only for historical
replay. Their model tools are no
longer exposed by the Learning preset. A failed historical result is shown as
an explicit error/fallback instead of a disabled “completed” activity.

## Development and verification

The real desktop/web runtime reads package exports from `lib`, so rebuild and
fully restart after source changes:

```powershell
pnpm --filter @dsh-portable/interactive-learning run build
pnpm --filter @dsh-portable/interactive-learning test
pnpm run desktop:dev
```

The browser fixture imports source components directly and is useful for rapid
visual inspection:

```powershell
& 'vendor/deepseek-harness/apps/web/node_modules/.bin/vite.cmd' `
  --config 'apps/interactive-learning/tests/browser/vite.config.mjs'
```

Open `http://127.0.0.1:41739/`. This is a component harness, not a substitute
for the packaged desktop smoke.

The credential-free teaching evaluation is deterministic and does not claim to
be a remote-model quality score:

```powershell
node apps/interactive-learning/lib/eval-cli.js
```

Release verification should also run the repository test suite and the normal
Windows package pipeline (without `--skip-build`).

## External activation

From a clean package install:

1. Add the package root to the Host composition:

   ```yaml
   - id: interactive-learning
     name: '@dsh-portable/interactive-learning'
   ```

2. Let the Web module loader discover the package's `dsh.client` manifest.
3. Install the preset and restart Host/Web:

   ```powershell
   dsh-learning-preset install --home <DSH_HOME>
   ```

4. Explicitly select Learning for a new conversation.

The installer records ownership in
`.agent-presets/learning/.dsh-managed.json`, updates only unmodified owned files,
stages new versions beside user-modified files, and removes only owned hashes.

```powershell
dsh-learning-preset uninstall --home <DSH_HOME>
```

The clean-tarball lifecycle test verifies Host/Agent/protocol exports, Client
activation metadata, and safe install/upgrade/uninstall behavior:

```powershell
node apps/interactive-learning/tests/package-lifecycle.mjs <package.tgz>
```

Deferred by design: arbitrary executable widgets, cross-session mastery,
spaced repetition, knowledge graphs, LMS adapters, and silent collection of
slider state. If exact parameter values matter, the learner should describe or
quote them in the normal reply.
