import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { mkdtemp, readlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  INTERACTIVE_LEARNING_DISTRIBUTION_FILES,
  type InteractiveLearningReleaseEvidence,
} from '../../packages/release-manifest/src/index.js'
import { getTargetSpec } from './targets.js'
import {
  electronExecutable,
  RuntimeHandshake,
  runtimeRpc,
  STALE_MANAGED_FALLBACK_PACKAGES,
  stageStaleManagedFallback,
  validateInteractiveLearningPresetSurface,
} from './packaged-smoke.js'

const learningEvidence: InteractiveLearningReleaseEvidence = {
  schemaVersion: 1,
  publishedFiles: [...INTERACTIVE_LEARNING_DISTRIBUTION_FILES].sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
  host: {
    id: 'interactive-learning',
    module: '@dsh-portable/interactive-learning',
    runtimeBundle: 'lib/packaged-bin.js',
    bundle: 'lib/index.js',
    bootstrapBundle: 'lib/bootstrap.js',
  },
  preset: {
    id: 'learning',
    selectable: true,
    name: 'Learning',
    description: 'Understand concepts interactively.',
    bundle: 'lib/preset.js',
    descriptor: 'preset/learning/preset.yml',
    composition: 'preset/learning/agent.cordis.yml',
    compositionRows: [
      { id: 'persona', module: '@deepseek-ai/dsh-persona' },
      { id: 'learning-agent', module: '@dsh-portable/interactive-learning/agent' },
    ],
  },
  agent: { module: '@dsh-portable/interactive-learning/agent', bundle: 'lib/agent.js' },
  client: { module: '@dsh-portable/interactive-learning/client', bundle: 'lib/client.js' },
}

test('packaged smoke resolves the native Electron executable for each layout', () => {
  assert.equal(
    electronExecutable('C:\\release\\runtime\\DeepSeek Harness.exe', getTargetSpec('win32-x64')),
    'C:\\release\\runtime\\DeepSeek Harness.exe',
  )
  assert.equal(
    electronExecutable('/release/runtime/DeepSeek Harness', getTargetSpec('linux-x64')),
    '/release/runtime/DeepSeek Harness',
  )
  assert.equal(
    electronExecutable('/release/DeepSeek Harness.app', getTargetSpec('darwin-arm64')),
    join('/release/DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness'),
  )
})

test('packaged handshake requires matching hello before one listening event', () => {
  const handshake = new RuntimeHandshake()
  assert.equal(handshake.accept({ type: 'hello', pid: 42 }, 42), undefined)
  assert.equal(handshake.accept({ type: 'listening', url: 'http://127.0.0.1:1/' }, 42), 'http://127.0.0.1:1/')
  assert.throws(
    () => new RuntimeHandshake().accept({ type: 'listening', url: 'http://127.0.0.1:1/' }, 42),
    /before hello/,
  )
  assert.throws(() => new RuntimeHandshake().accept({ type: 'hello', pid: 41 }, 42), /does not match/)
  assert.throws(() => handshake.accept({ type: 'hello', pid: 42 }, 42), /duplicate hello/)
})

test('packaged smoke stages dangling managed UI fallbacks for the first process', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-stale-fallback-test-'))
  try {
    await stageStaleManagedFallback(home)
    for (const packageName of STALE_MANAGED_FALLBACK_PACKAGES) {
      assert.match(await readlink(join(home, 'profiles', 'node_modules', packageName)), /\.removed-previous-runtime/)
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('packaged smoke requires a healthy selectable Learning preset and exact agent composition', () => {
  const list = {
    presets: [{
      id: 'learning',
      trust: 'system',
      isDefault: false,
      name: learningEvidence.preset.name,
      description: learningEvidence.preset.description,
    }],
  }
  const read = {
    agentPreset: 'learning',
    trust: 'system',
    name: learningEvidence.preset.name,
    description: learningEvidence.preset.description,
    content: [
      '- id: persona',
      "  name: '@deepseek-ai/dsh-persona'",
      '- id: learning-agent',
      "  name: '@dsh-portable/interactive-learning/agent'",
      '',
    ].join('\n'),
  }
  assert.doesNotThrow(() => validateInteractiveLearningPresetSurface(list, read, learningEvidence))
  assert.throws(
    () => validateInteractiveLearningPresetSurface({ presets: [{ ...list.presets[0], description: undefined }] }, read, learningEvidence),
    /healthy system selector row/,
  )
  assert.throws(
    () => validateInteractiveLearningPresetSurface({ presets: [{ ...list.presets[0], broken: 'invalid YAML' }] }, read, learningEvidence),
    /healthy system selector row/,
  )
  assert.throws(
    () => validateInteractiveLearningPresetSurface(list, {
      ...read,
      content: "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n",
    }, learningEvidence),
    /exactly one learning-agent/,
  )
})

test('packaged smoke validates the live RPC response envelope and correlation id', async () => {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      rpcId: string
      method: string
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      type: 'server-response',
      rpcId: message.method === 'agentPreset.read' ? `${message.rpcId}-mismatch` : message.rpcId,
      result: { ok: true, value: { ready: true } },
    }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}/`
    assert.deepEqual(await runtimeRpc(baseUrl, 'agentPreset.list', {}, 2_000), { ready: true })
    await assert.rejects(
      runtimeRpc(baseUrl, 'agentPreset.read', { agentPreset: 'learning' }, 2_000),
      /invalid or mismatched RPC envelope/,
    )
  } finally {
    await new Promise<void>((resolvePromise, reject) => server.close(error => {
      if (error === undefined) resolvePromise()
      else reject(error)
    }))
  }
})
