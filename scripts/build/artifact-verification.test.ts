import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  INTERACTIVE_LEARNING_DISTRIBUTION_FILES,
  interactiveLearningInventoryPaths,
  type InteractiveLearningReleaseEvidence,
} from '../../packages/release-manifest/src/index.js'
import { getTargetSpec } from './targets.js'
import { verifyArtifactBundle, writeArtifactVerification } from './artifact-verification.js'

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
    description: 'Interactive learning preset',
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

test('verification is native-only and detects changed artifact bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verified-'))
  try {
    const source = join(root, 'app.zip')
    const manifest = join(root, 'release-manifest.json')
    const target = getTargetSpec('linux-x64')
    await writeFile(source, 'final')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: 'linux-x64' },
      distribution: { classification: 'non-official-unsigned' },
      files: interactiveLearningInventoryPaths(target).map(path => ({ path })),
      experiencePacks: { interactiveLearning: learningEvidence },
    }))
    const result = await writeArtifactVerification({
      target,
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
        interactiveLearning: learningEvidence,
      },
      artifacts: [source],
      manifestPath: manifest,
      outputRoot: join(root, 'verified'),
      host: { platform: 'linux', arch: 'x64' },
    })
    assert.equal((await verifyArtifactBundle(result.directory, 'linux-x64')).artifacts.length, 1)
    await writeFile(join(result.directory, 'app.zip'), 'changed')
    await assert.rejects(verifyArtifactBundle(result.directory, 'linux-x64'), /bytes changed/)
    await mkdir(join(root, 'unused'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verification rejects a manifest without complete Interactive Learning evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verified-learning-'))
  try {
    const source = join(root, 'app.zip')
    const manifest = join(root, 'release-manifest.json')
    const target = getTargetSpec('linux-x64')
    await writeFile(source, 'final')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: target.id },
      distribution: { classification: 'non-official-unsigned' },
      files: interactiveLearningInventoryPaths(target)
        .filter(path => !path.endsWith('/lib/client.js'))
        .map(path => ({ path })),
      experiencePacks: { interactiveLearning: learningEvidence },
    }))
    await assert.rejects(writeArtifactVerification({
      target,
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
        interactiveLearning: learningEvidence,
      },
      artifacts: [source],
      manifestPath: manifest,
      outputRoot: join(root, 'verified'),
      host: { platform: 'linux', arch: 'x64' },
    }), /missing required Interactive Learning file.*lib\/client\.js/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verification rejects an extra file outside the exact Interactive Learning published inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verified-learning-extra-'))
  try {
    const source = join(root, 'app.zip')
    const manifest = join(root, 'release-manifest.json')
    const target = getTargetSpec('linux-x64')
    const packageRoot = 'runtime/resources/app/node_modules/@dsh-portable/interactive-learning'
    await writeFile(source, 'final')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: target.id },
      distribution: { classification: 'non-official-unsigned' },
      files: [
        ...interactiveLearningInventoryPaths(target).map(path => ({ path })),
        { path: `${packageRoot}/output/stale.tgz` },
      ],
      experiencePacks: { interactiveLearning: learningEvidence },
    }))
    await assert.rejects(writeArtifactVerification({
      target,
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
        interactiveLearning: learningEvidence,
      },
      artifacts: [source],
      manifestPath: manifest,
      outputRoot: join(root, 'verified'),
      host: { platform: 'linux', arch: 'x64' },
    }), /Interactive Learning package inventory is not exact;.*unexpected=.*output\/stale\.tgz/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verification rejects manifest evidence that differs from final-byte smoke evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verified-learning-evidence-'))
  try {
    const source = join(root, 'app.zip')
    const manifest = join(root, 'release-manifest.json')
    const target = getTargetSpec('linux-x64')
    await writeFile(source, 'final')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: target.id },
      distribution: { classification: 'non-official-unsigned' },
      files: interactiveLearningInventoryPaths(target).map(path => ({ path })),
      experiencePacks: { interactiveLearning: learningEvidence },
    }))
    const finalByteEvidence: InteractiveLearningReleaseEvidence = {
      ...learningEvidence,
      preset: { ...learningEvidence.preset, description: 'Different final-byte evidence' },
    }
    await assert.rejects(writeArtifactVerification({
      target,
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
        interactiveLearning: finalByteEvidence,
      },
      artifacts: [source],
      manifestPath: manifest,
      outputRoot: join(root, 'verified'),
      host: { platform: 'linux', arch: 'x64' },
    }), /evidence differs from final-byte smoke evidence/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
