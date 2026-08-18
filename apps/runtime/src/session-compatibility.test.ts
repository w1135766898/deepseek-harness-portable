import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { KNOWN_SESSION_EVENT_TYPES, SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { logPath } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  LEARNER_STATE_EVENT_PROTOCOL,
  LEARNER_STATE_SESSION_EVENT_TYPE,
  createInitialLearnerState,
  createLearnerStateSnapshotEvent,
  foldLearnerStateSession,
  reduceLearnerState,
} from '@dsh-portable/interactive-learning'
import { MockAdapter } from '../../../vendor/deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts'
import type { RuntimeModeTrace } from './mode-catalog.js'
import {
  appendPortableModeResolution,
  PORTABLE_MODE_RESOLUTION_EVENT_TYPE,
  registerPackagedSessionCompatibility,
  registerPortableSessionCompatibility,
} from './session-compatibility.js'

const fixturePath = fileURLToPath(new URL('../test-fixtures/session-mode-resolution-unmarked.jsonl', import.meta.url))
const fixtureId = SessionId('session-portable-mode-resolution-v0')
const fixtureStoredCwd = 'C:\\Users\\Ryan\\Downloads'
const fixtureCwd = join(tmpdir(), 'dsh-portable-session-fixture-cwd')

async function writeFixture(root: string, id: SessionId, eventType: string): Promise<void> {
  const source = (await readFile(fixturePath, 'utf8'))
    .replaceAll(String(fixtureId), String(id))
    .replaceAll(PORTABLE_MODE_RESOLUTION_EVENT_TYPE, eventType)
    .replaceAll(JSON.stringify(fixtureStoredCwd), JSON.stringify(fixtureCwd))
  const target = logPath(root, fixtureCwd, id, 'none')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source)
}

async function writeLearningStateFixture(root: string, cwd: string, id: SessionId): Promise<void> {
  const state = reduceLearnerState(createInitialLearnerState(id), {
    type: 'goal_observed',
    goal: 'Resume learning safely',
    observation: {
      id: 'startup-goal-1',
      source: 'learner-message',
      summary: 'I want to resume learning safely.',
    },
  })
  const snapshot = createLearnerStateSnapshotEvent(state, 'update')
  assert.equal(snapshot.protocol, LEARNER_STATE_EVENT_PROTOCOL)
  assert.equal(snapshot.snapshot.revision, 1)

  const source = [
    JSON.stringify({
      type: 'session',
      version: 0,
      id,
      createdAt: 0,
      cwd,
      delegationDepth: 0,
    }),
    JSON.stringify({
      type: LEARNER_STATE_SESSION_EVENT_TYPE,
      seq: 0,
      time: 1,
      data: snapshot,
    }),
    '',
  ].join('\n')
  const target = logPath(root, cwd, id, 'none')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source)
}

async function waitFor<T>(read: () => T | undefined, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`timed out after ${timeoutMs}ms`)
}

test('portable reader accepts only its registered legacy unmarked event type', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-portable-session-compat-'))
  const ctx = new Context()
  try {
    registerPortableSessionCompatibility()
    await ctx.plugin(SessionStore)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })

    await writeFixture(root, fixtureId, PORTABLE_MODE_RESOLUTION_EVENT_TYPE)
    const loaded = await ctx.sessionPersistence.load(fixtureId)
    assert.equal(loaded.events[0]?.type, PORTABLE_MODE_RESOLUTION_EVENT_TYPE)
    assert.equal(loaded.events[0]?.ignorable, undefined)

    const unknownId = SessionId('session-other-unknown-v0')
    await writeFixture(root, unknownId, 'portable-runtime/future-required')
    await assert.rejects(ctx.sessionPersistence.load(unknownId), (error: unknown) => {
      assert.equal((error as Error).name, 'SessionFormatUnsupportedError')
      assert.match((error as Error).message, /portable-runtime\/future-required.*not marked ignorable/)
      return true
    })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('portable mode-resolution writes are explicitly ignorable', () => {
  const trace: RuntimeModeTrace = {
    modeId: 'code',
    variantId: 'native',
    supportLevel: 'native',
    presetHash: 'a'.repeat(64),
    upstreamCommit: 'b'.repeat(40),
    capabilitySnapshotHash: 'c'.repeat(64),
    limitations: [],
  }
  let captured: unknown
  appendPortableModeResolution({
    append(type: string, data: RuntimeModeTrace, opts: { ignorable: true }) {
      captured = { type, data, opts }
    },
  }, trace)
  assert.deepEqual(captured, {
    type: PORTABLE_MODE_RESOLUTION_EVENT_TYPE,
    data: trace,
    opts: { ignorable: true },
  })
})

test('packaged compatibility registers required Learning state before configured startup resume', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-learning-startup-compat-'))
  const cwd = join(root, 'workspace')
  const id = SessionId('session-learning-state-startup-v1')
  const known = KNOWN_SESSION_EVENT_TYPES as Set<string>
  const wasKnown = known.has(LEARNER_STATE_SESSION_EVENT_TYPE)
  const ctx = new Context()
  try {
    // Materialize the durable log first, as it would already exist before a
    // cold process starts. Its schema comes only from the package's public
    // creator so this runtime test does not freeze Learning's in-flight shape.
    await mkdir(cwd, { recursive: true })
    await writeLearningStateFixture(root, cwd, id)

    // Neutralize the Learning package import's idempotent top-level registration
    // so this test proves the packaged runtime's explicit earliest-load seam.
    known.delete(LEARNER_STATE_SESSION_EVENT_TYPE)
    assert.equal(known.has(LEARNER_STATE_SESSION_EVENT_TYPE), false)
    registerPackagedSessionCompatibility()
    assert.equal(known.has(LEARNER_STATE_SESSION_EVENT_TYPE), true)

    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    await ctx.plugin(AgentLoop, {
      agents: [{
        id: 'startup-resume',
        resumeSessionId: id,
        provider: 'mock',
        model: 'mock',
      }],
    })
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })

    const agent = await waitFor(() => ctx.agents.get(id))
    const event = agent.session.events.find(item => item.type === LEARNER_STATE_SESSION_EVENT_TYPE)
    assert.ok(event, 'configured startup resume must retain the required Learning state event')
    assert.equal(event.ignorable, undefined)
    const folded = foldLearnerStateSession(id, agent.session.events)
    assert.equal(folded.goal, 'Resume learning safely')
    assert.equal(folded.revision, 1)
  } finally {
    await ctx.fiber.dispose()
    if (wasKnown) known.add(LEARNER_STATE_SESSION_EVENT_TYPE)
    else known.delete(LEARNER_STATE_SESSION_EVENT_TYPE)
    await rm(root, { recursive: true, force: true })
  }
})
