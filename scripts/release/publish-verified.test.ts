import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  INTERACTIVE_LEARNING_DISTRIBUTION_FILES,
  interactiveLearningInventoryPaths,
  type InteractiveLearningReleaseEvidence,
} from '../../packages/release-manifest/src/index.js'
import { writeArtifactVerification } from '../build/artifact-verification.js'
import { getTargetSpec } from '../build/targets.js'
import { publishVerifiedTarget } from './publish-verified.js'

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

test('publishing fails closed for unsigned bytes unless the prerelease override is explicit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-publish-'))
  try {
    const artifact = join(root, 'app.AppImage')
    const manifest = join(root, 'release-manifest.json')
    const target = getTargetSpec('linux-x64')
    await writeFile(artifact, 'immutable')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: 'linux-x64' },
      distribution: { classification: 'non-official-unsigned' },
      files: interactiveLearningInventoryPaths(target).map(path => ({ path })),
      experiencePacks: { interactiveLearning: learningEvidence },
    }))
    const bundle = await writeArtifactVerification({
      target,
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
        interactiveLearning: learningEvidence,
      },
      artifacts: [artifact],
      manifestPath: manifest,
      outputRoot: join(root, 'verified'),
      host: { platform: 'linux', arch: 'x64' },
    })
    const output = join(root, 'release')
    await assert.rejects(
      publishVerifiedTarget('linux-x64', ['--input', bundle.directory, '--output', output]),
      /official publishing fails closed/,
    )
    await publishVerifiedTarget('linux-x64', [
      '--input', bundle.directory, '--output', output, '--allow-non-official',
    ])
    assert.equal((await readFile(join(output, 'app.AppImage'), 'utf8')), 'immutable')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
