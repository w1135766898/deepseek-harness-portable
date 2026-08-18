# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` is an independently installable DeepSeek
Harness experience pack. It adds one explicit `learning` Agent preset without
adding model-visible tools or prompt sections to Standard, Code, Minimal, or
Cordis.

## Boundaries

- The package root is the Host capability. It registers only the
  `learningActivities` broker service.
- `./agent` is mounted only by the Learning preset. It registers the two narrow
  `learning_question` and `learning_reveal` tools plus the compact standing policy.
- The Learning preset also mounts rc.7's native `ask_user_question` tool for
  user-owned choices about direction, depth, or pace. Reasonable defaults do
  not open a choice; teaching evidence stays in the Question/Reveal gates.
- `./client` supplies the composer takeover, completed-call renderer, and the
  native activity registry.
- `./protocol` is the versioned, declarative Activity/Response contract.
- `preset/learning/skills/interactive-teaching` is the detailed teaching
  resource loaded on demand; it is not the product shell.

The Client bundle may be present globally, but it claims the composer only for
a pending question carrying the exact Host-generated Learning envelope and the
matching session id. An ordinary question, including one from another preset,
is ignored. A fork therefore cannot revive an ancestor session's pending
activity.

## Pinned rc.7 gated transport

The pinned kernel already exposes stable pending `ToolCallBlock.callId` values,
keyed `tool.call.toolview` slots, and durable question `PendingWait` replay. The
MVP reuses that question wait instead of patching the wire protocol:

1. The Agent calls `learning_question` with one `activity@2` current frame. The
   Host validates it, issues lesson/round tokens, and opens one durable wait.
2. The learner response resolves that Question call. Only then does the model
   construct `learning_reveal` for the same token and sequence.
3. Reveal remains pending while the keyed inline renderer animates. Continue is
   disabled until animation completion (reduced motion commits the final frame),
   and the wait resolves only after an explicit learner continue.
4. Only after that canonical `response@2` is saved may the model produce the
   next Question. New waits use opaque ids and correlate by session, stable
   `ToolRunContext.callId`, activity, phase, and sequence rather than serialized
   activity equality.

If no live Client is connected when the call begins, the broker returns
`action: "skip"` immediately with the fallback Markdown in
`interactionState`. A disconnect after presentation remains recoverable by the
kernel wait until the Client reconnects or the bounded wait expires. The
default five-minute timeout, session abort, or plugin disposal always resolves
the tool with a canonical `skip`/`cancel` response, so a headless or stale
Client cannot leave the model waiting forever.

This transport is intentionally isolated behind `LearningActivityBroker` so it
can later move to a first-class Learning `PendingWait`/Conversation Node without
changing the model tool or activity renderers.

## Protocol v2

Current-frame visuals support:

- `parameter`: one or two bounded parameters and one to three curves;
- `process`: exactly one current frame for Question, or one before/after pair for Reveal;
- `structure`: one current aligned comparison.

Question schemas contain no answer/reveal/future-step fields. Reveal schemas
contain no next question or input control. Both reject unknown fields, invalid
references, non-finite values, and oversized or excessively deep data. Curves
use a closed mathematical AST. `activity@1` remains available only for legacy
session replay; it is not exposed as a live model tool.

## Development

```powershell
pnpm --filter @dsh-portable/interactive-learning run build
pnpm --filter @dsh-portable/interactive-learning test
```

The credential-free teaching gate is deterministic and does not claim to be a
remote-model quality score:

```powershell
pnpm --filter @dsh-portable/interactive-learning run build
node apps/interactive-learning/lib/eval-cli.js
```

It covers visual restraint, continuation from evidence, stopping after transfer,
one gate per model step, Question/Reveal temporal order, and configured answer
or future-round leakage markers. Scoring a live remote model remains an
explicit external authorization gate and is never run with user credentials by
these tests.

The package exports a safe user-preset installer as
`dsh-learning-preset`. It writes
`$DSH_HOME/.agent-presets/learning/.dsh-managed.json`, upgrades only files whose
hash still matches package ownership, stages new versions beside user-modified
files, and removes only unmodified owned files.

```powershell
dsh-learning-preset install
dsh-learning-preset uninstall
```

## External package activation

From a clean tarball or registry install:

1. Add the package root to the Host composition so
   `@dsh-portable/interactive-learning` provides the broker. Do not mount
   `./agent` globally.

   ```yaml
   - id: interactive-learning
     name: '@dsh-portable/interactive-learning'
   ```

2. Let the DSH Web module loader discover the package's `dsh.client` manifest;
   it loads `./client` and its declared inject dependencies.
3. Run `dsh-learning-preset install --home <DSH_HOME>`, restart the Host/Web
   runtime, and explicitly select the `learning` preset.
4. For removal, first stop selecting Learning, remove the Host package row,
   restart, then run `dsh-learning-preset uninstall --home <DSH_HOME>`.

Upgrades may rerun `install`. Files that still match the owned hash are
replaced; modified files remain in place and the package version is staged
beside them. `uninstall` removes only hashes still owned by the package.

The package-local clean-tarball acceptance test imports the Host, Agent,
protocol, preset and eval exports, observes the Client module-loader handoff,
and executes install, content upgrade and safe uninstall from the extracted
artifact:

```powershell
node apps/interactive-learning/tests/package-lifecycle.mjs <package.tgz>
```

Portable distributions can instead merge `interactiveLearningPresetRoot` into
their immutable shipped preset catalog, as this repository does.

## Phase 0 compatibility result

The implementation is based on the pinned kernel `0.1.0-rc.7` checkout rather
than unreleased upstream contracts. Focused composition tests boot the actual pinned
Web layers and prove that Standard, Code, Minimal and Cordis retain byte-for-byte
equivalent model-visible tool schemas and assembled standing prompts before and
after the Host broker is mounted. The pinned keyed tool renderer, pending wait,
cancellation/duplicate-response guard, stable session/call identity, and
replayable canonical tool result path support the two-gate flow. Tool execution
already exposes stable `callId`/`rootCallId`; `tools/pre-execute`, `tools/execute`,
`tools/post-execute`, `tools/result`, and `agent/pre-step` provide observation
points without adding a private telemetry dependency.

The real-browser fixture uses the production components and native DOM events.
It verifies conversational prediction, range-key interaction, all three renderers,
submit/cancel, evidence-based continuation, completed replay after refresh,
non-revival after fork, Standard-mode UI isolation, and zero Learning network
requests. The clean tarball gate additionally verifies external Host/Client
activation metadata and install/upgrade/uninstall ownership behavior.

Deferred by design: cross-session mastery, spaced repetition, knowledge graphs,
Obsidian/LMS adapters, arbitrary widget code, third-party activity kinds, and
Electron-specific Learning behavior.
