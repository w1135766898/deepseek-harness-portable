import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { logPath } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
import type { RuntimeModeTrace } from './mode-catalog.js'
import {
  appendPortableModeResolution,
  PORTABLE_MODE_RESOLUTION_EVENT_TYPE,
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
