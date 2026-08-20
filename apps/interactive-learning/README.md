# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` adds an explicit `learning` Agent preset to
DeepSeek Harness. Standard, Code, Minimal, and Cordis keep their original tool
schemas and prompts.

## Architecture

- The package root provides the `learningActivities` Host broker and registers
  the required `learning/state` session-event discriminator before persisted
  Learning sessions can be loaded. It registers no model-visible tools.
- `./agent` is mounted only by the Learning preset. Its initial model-facing
  catalog contains the compact `learning_visual_select`, silent
  `learning_state_update`, and optional `learning_checkpoint_select` tools.
  A selector exposes only the chosen visual/checkpoint payload schema for the
  next model step. Its standing policy comes from one canonical TypeScript
  source rather than being duplicated in the Skill.
- `./client` renders visuals and optional checkpoints inline. State updates have
  an explicitly empty tool view. V1/V2 activity calls and V3 visuals retain
  read-only replay support.
- `./protocol` owns the closed, versioned declarative contracts.
- `preset/learning/skills/interactive-teaching` provides detailed teaching
  judgment on demand.

The ordinary conversation remains the default. A visual is an illustration
inside a normal assistant response, not a form that owns the user turn. A
reflective pause is the sole deliberate wait: the wire-compatible checkpoint
tool is used only when the learner's response will change the next move, then
terminates after one result.

## Learn intent and first-turn route

The Learning preset classifies the request before choosing a teaching route.
Definitions, bare concept names, persistent confusion or memory failure,
prerequisites and learning paths, conceptual why/how questions, and requested
flashcards or study guides are learn intent. Coding or debugging, translation,
news updates, resource recommendations, and opinion requests stay on their
ordinary task route. Current or contested topics remain learn intent when the
user asks for structured understanding. Bare concepts get one route-changing
calibration question; definitions, clear confusions, and clear goals start the
minimum useful explanation.

## Non-blocking learning flow

1. A short, underspecified `learn X`/`teach me X` request gets one calibration
   question whose answer changes the route. An explicit beginner/from-zero
   request starts with one minimum concept immediately; an explicit complete
   overview or current/contested survey can go directly to exposition.
2. The assistant explains the missing idea in ordinary prose. When manipulation
   is genuinely useful, it first calls `learning_visual_select` with one native
   kind and purpose.
3. The selected kind-specific `learning_visual` schema is exposed for the next
   model step; no eight-kind visual catalog is injected into the initial
   context. While arguments are streaming, the tool call's place names the
   visual being prepared instead of showing a generic wait.
4. Validation returns `visual-result@4` immediately. No lesson token, pending
   question, submit button, reveal call, or five-minute user wait is created.
   The result distinguishes `ready` from `unavailable`: a composition without
   the Learning Client renders nothing, so the assistant carries the same
   explanation in prose and never points at a figure the learner cannot see.
   An unrendered visual is also not recorded as a teaching move that happened.
5. The chart renders in the tool call's place and remains interactive after the
   completed call is replayed.
6. The assistant continues with the interpretation and, if useful, one natural
   question. The learner answers through the normal composer on the next turn.

This removes the old Question → Reveal split that duplicated rounds and left a
model turn running while it waited for the learner. The surrounding prose must
still make sense if a Client cannot render the enhancement.

## Session-scoped learner state

Learning keeps a small, tentative teaching state for the current session only:
the learner's immediate goal, demonstrated prior knowledge, current gap or
misconception, phase, last explanation/question, learner-response assessment,
next move, move fingerprint, learner-evidence-derived support need, urgency or
stuck evidence, assessment context, bounded failed-move history with its
representation and reason, and independently demonstrated evidence including
fresh transfer.

The production path is explicit and auditable:

1. The ordinary learner message remains in the normal conversation transcript.
   When a concrete observation materially changes teaching, the model may call
   the internal `learning_state_update`; it must not call it mechanically.
2. A completed visual and a checkpoint terminal result contribute only facts the
   Host can observe deterministically. Submission alone records an unevaluated
   learner action; it never implies correctness, independence, progress, or
   mastery.
3. Every accepted update appends a strict, identity-free full snapshot as the
   required `learning/state` session event. Unknown required events fail closed.
4. Before every subsequent model step, the dynamic prompt context folds the
   durable events and renders a bounded 100–300-token tentative summary.

Persisted snapshots do not contain a session id. Refresh and resume fold the
same event log; a fork rebinds inherited snapshots to its new identity and then
diverges independently. Reset appends a cleared snapshot and advances the
revision, so a late asynchronous update cannot resurrect prior state. Disposal
drops only the process-local fold cache. This is not a cross-session learner
profile, personality model, learning-style classifier, or long-term mastery
record. A learner correction is supplied in ordinary conversation and is
accepted only as a correction—not as self-certified mastery.

## Session-scoped learning route

Most learning segments need no route at all: a single concept, a direct answer,
or a short correction is complete without one. A route is recorded only when the
goal genuinely spans several dependent moves — a multi-section source, a
procedure with real prerequisites, or a multi-part objective the learner stated.

The route lives in the learner state for the current session and is a revisable
hypothesis rather than a contract:

- At most 6 steps, with `pending`, `active`, and `evidenced` as the only
  statuses, and never more than one `active`.
- A step advances only on evidence the learner produced, never because the
  material was covered.
- Revising a route preserves whatever was already `evidenced` under the same
  step id, so demonstrated progress is never erased.
- The model context carries the objective and the current step only, never the
  whole list, so the route cannot be read back as a checklist to march through.
- Demonstrated transfer ends the segment however many steps remain; an
  unfinished route is never a reason to continue.
- A learning-boundary reset clears the route with the rest of the state.

## Optional reflective pause (wire-compatible checkpoint protocol v1)

`dsh-learning/checkpoint@1` is reserved for a prediction, explanation, contrast,
design choice, debugging diagnosis, boundary case, or transfer application that
will materially change the next teaching move. It is not the default input path
and must never become a per-turn Continue ceremony.

- At most one checkpoint may be pending in a session and at most one distinct
  checkpoint may be emitted in a model step.
- Its five closed kinds are `free_text`, `single_choice`, `numeric`,
  `prediction`, and `code_slot`. Single-choice results carry the stable option
  id; labels are presentation only.
- The card header names the cognitive move being requested — predict, explain,
  contrast, transfer, or attempt — rather than an internal label such as
  "checkpoint", which the standing policy forbids for ordinary turns.
- The pending payload may contain only the current prompt, context, expected
  evidence, answer-free options, and a self-sufficient fallback. Correct
  answers, grading rubrics, solutions, and future steps are rejected.
- The only terminal statuses are `submitted`, `skipped`, and `cancelled`.
  Refresh recovers the same wait and draft; call and receipt replays are
  idempotent, while conflicting reuse fails closed.
- Skip, cancel, timeout, renderer failure, or an unavailable rich Client restores
  ordinary conversation without a Reveal, animation, Continue, or second wait.

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

A payload the schema accepts always reaches its renderer; it never degrades
into Markdown, the description text, or an error box. When a series has no value
inside the declared axes — `log` or `sqrt` over a negative domain, or a curve
that sits entirely outside the y range — the chart still draws, states that no
values fall inside the current axes, and marks that series in the legend, rather
than leaving the learner with a frame that looks broken.

V3 parameter charts and V1/V2 activities remain parseable only for historical
replay. Their model tools are no
longer exposed by the Learning preset. A failed historical result is shown as
an explicit error/fallback instead of a disabled “completed” activity.

## Design system and accessibility

Every learning surface shares one set of design tokens, declared on
`[data-learning-scope]` in `src/client/tokens.module.css`. The two CSS Modules
compile into separate `<style>` tags and cannot share styles through classes, so
the shared values are inherited as custom properties instead; a root component
opts its subtree in by spreading `learningScope`.

The tokens cover the type ramp, spacing scale, radii, elevation, control metrics
and motion durations, plus the single accent, semantic palette and focus ring.
Neither stylesheet now contains a raw font size, a raw radius, or a directly
referenced Host alias. Every Host alias carries a fallback, so a theme that omits
one degrades to a usable colour rather than an invalid declaration.

The renderers are built for keyboards and assistive technology:

- One figure is one tab stop. A `node_link` visual may declare 48 nodes and 160
  edges and a `scene_2d` up to 64 elements; once inside a figure, the arrow keys
  move between items, Home and End jump to the ends, and Enter or Space selects.
- Plot probe readings are written to an `aria-live` region, so keyboard probing
  is announced; Escape clears it.
- A figure's accessible name is a short summary. The full structured text
  alternative lives in readable content, so it can be browsed item by item
  instead of spoken as one long name.
- The focus ring, motion durations and reduced-motion behaviour all come from
  the token layer.

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

Open `http://127.0.0.1:41739/`. It covers visual replay plus checkpoint submit,
skip, cancel, refresh-draft, and session-isolation states. This is a component
harness, not a substitute for the packaged desktop smoke; its separate fixture
input does not prove the real Host composer lifecycle.

The credential-free teaching evaluation contains hand-written rubric fixtures.
It checks the grader and protocol invariants; it is not evidence that a model
actually teaches well:

```powershell
pnpm --filter @dsh-portable/interactive-learning eval
```

The retired V2 Question → Reveal → animation → Continue sequence is available
only through the explicitly named `gradeLegacyV2ReplayTranscript` read-only
replay audit. It is not called by the default V4.1 eval and is not a current
teaching success criterion.

`tests/model-canary.mts` is a separately labelled, optional two-turn real-model
canary. It checks calibration for an underspecified learning request, immediate
minimum teaching after the learner gives level and goal, and the lazy
selector → kind-specific visual schema → ordinary-text continuation path. It
is still not a statistical teaching-quality benchmark and requires
`DSH_CANARY_API_KEY`. Any real-model report must retain its provenance and must
not be merged with fixture results.

Package-level verification builds the package, scans published JS/maps for
checkout or drive-letter paths, creates a real tarball, installs it into a clean
temporary consumer, resolves Host/Agent/Client exports, and exercises the
managed preset lifecycle:

```powershell
pnpm --filter @dsh-portable/interactive-learning run test:package:purity
pnpm --filter @dsh-portable/interactive-learning run test:package
```

Release verification should also run the repository test suite and the normal
Windows package pipeline (without `--skip-build`).

## External activation

From a clean package install:

1. Before constructing the Loader, agent loop, or any configured session
   resume, import the side-effect bootstrap (calling its exported function
   again is safe):

   ```ts
   import '@dsh-portable/interactive-learning/bootstrap'
   ```

   A Host may instead place the package's compatibility bootstrap composition
   row explicitly before `agent-loop`, but a late ordinary plugin row is not an
   equivalent load-order guarantee. The portable runtime obtains this ordering
   from its pre-boot static `./preset` import.

2. Add the package root to the Host composition:

   ```yaml
   - id: interactive-learning
     name: '@dsh-portable/interactive-learning'
   ```

3. Let the Web module loader discover the package's `dsh.client` manifest.
4. Install the preset and restart Host/Web:

   ```powershell
   dsh-learning-preset install --home <DSH_HOME>
   ```

5. Explicitly select Learning for a new conversation.

The installer records ownership in
`.agent-presets/learning/.dsh-managed.json`, updates only unmodified owned files,
stages new versions beside user-modified files, and removes only owned hashes.

```powershell
dsh-learning-preset uninstall --home <DSH_HOME>
```

Deferred by design: arbitrary executable widgets, cross-session mastery,
spaced repetition, knowledge graphs, LMS adapters, and silent collection of
slider state. If exact parameter values matter, the learner should describe or
quote them in the normal reply.
