import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MeasuredModeSupport } from '../../platform-contract/src/index.js'
import { getTargetSpec } from '../../../scripts/build/targets.js'
import {
  createReleaseManifest,
  INTERACTIVE_LEARNING_DISTRIBUTION_FILES,
  interactiveLearningInventoryPaths,
  serializeReleaseManifest,
  type InteractiveLearningReleaseEvidence,
  type ReleaseManifestInput,
} from './index.js'

const hash = 'a'.repeat(64)
const comparePaths = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const windowsSupport: Record<string, MeasuredModeSupport> = {
  standard: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  code: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  cordis: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  minimal: { level: 'compatible', variant: 'win32-wsl', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
}

function learningEvidence(): InteractiveLearningReleaseEvidence {
  return {
    schemaVersion: 1,
    publishedFiles: [...INTERACTIVE_LEARNING_DISTRIBUTION_FILES].sort(comparePaths),
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
      name: '学习模式',
      description: 'A selectable learning experience.',
      bundle: 'lib/preset.js',
      descriptor: 'preset/learning/preset.yml',
      composition: 'preset/learning/agent.cordis.yml',
      compositionRows: [
        { id: 'persona', module: '@deepseek-ai/dsh-persona' },
        { id: 'learning-agent', module: '@dsh-portable/interactive-learning/agent' },
        { id: 'tool-skill', module: '@deepseek-ai/dsh-tool-skill' },
      ],
    },
    agent: {
      module: '@dsh-portable/interactive-learning/agent',
      bundle: 'lib/agent.js',
    },
    client: {
      module: '@dsh-portable/interactive-learning/client',
      bundle: 'lib/client.js',
    },
  }
}

function releaseFiles(): ReleaseManifestInput['files'] {
  return ['app.exe', ...interactiveLearningInventoryPaths(getTargetSpec('win32-x64'))]
    .sort((left, right) => left.localeCompare(right))
    .map(path => ({ path, type: 'file' as const, size: 1, sha256: hash }))
}

function input(overrides: Partial<ReleaseManifestInput> = {}): ReleaseManifestInput {
  return {
    distributionVersion: '1.2.3',
    shellVersion: '0.2.0',
    kernelVersion: '0.1.0',
    source: { portableCommit: '1111111', upstreamCommit: '2222222' },
    target: getTargetSpec('win32-x64'),
    formats: ['portable-zip'],
    electronVersion: '43.4.0',
    nodeVersion: '24.0.0',
    runtimeClosureHash: 'runtime-hash',
    modeCatalogHash: 'mode-hash',
    measuredModeSupport: windowsSupport,
    experiencePacks: { interactiveLearning: learningEvidence() },
    files: releaseFiles(),
    patches: [{ id: 'one', status: 'applied', files: [{ path: 'x', inputSha256: hash, outputSha256: hash }] }],
    ...overrides,
  }
}

test('release manifest publishes measured support, files, patch hashes, and unsigned classification', () => {
  const manifest = createReleaseManifest(input())
  assert.equal(manifest.schemaVersion, 3)
  assert.equal(manifest.desktopVersion, '0.2.0')
  assert.equal(manifest.kernelCommit, '2222222')
  assert.deepEqual(manifest.modeCatalog.support.minimal, windowsSupport.minimal)
  assert.equal(manifest.files[0]?.sha256, hash)
  assert.equal(manifest.patches[0]?.files[0]?.inputSha256, hash)
  assert.equal(manifest.distribution.classification, 'non-official-unsigned')
  assert.equal(manifest.experiencePacks.interactiveLearning.host.id, 'interactive-learning')
  assert.deepEqual(
    manifest.experiencePacks.interactiveLearning.publishedFiles,
    [...INTERACTIVE_LEARNING_DISTRIBUTION_FILES].sort(comparePaths),
  )
  assert.equal(manifest.experiencePacks.interactiveLearning.preset.compositionRows[1]?.id, 'learning-agent')
})

test('Interactive Learning inventory paths follow each packaged target layout', () => {
  assert.equal(
    interactiveLearningInventoryPaths(getTargetSpec('win32-x64'))[0],
    'runtime/resources/app/lib/packaged-bin.js',
  )
  assert.equal(
    interactiveLearningInventoryPaths(getTargetSpec('darwin-arm64'))[0],
    'Contents/Resources/app/lib/packaged-bin.js',
  )
  assert.ok(interactiveLearningInventoryPaths(getTargetSpec('linux-x64')).includes(
    'runtime/resources/app/node_modules/@dsh-portable/interactive-learning/lib/client.js',
  ))
})

test('manifest rejects every missing Interactive Learning inventory member', () => {
  for (const requiredPath of interactiveLearningInventoryPaths(getTargetSpec('win32-x64'))) {
    assert.throws(
      () => createReleaseManifest(input({ files: releaseFiles().filter(file => file.path !== requiredPath) })),
      error => error instanceof Error
        && error.message === `release manifest is missing required Interactive Learning file: ${requiredPath}`,
      requiredPath,
    )
  }
})

test('manifest rejects any file outside the exact Interactive Learning published inventory', () => {
  const packageRoot = 'runtime/resources/app/node_modules/@dsh-portable/interactive-learning'
  const files = [
    ...releaseFiles(),
    { path: `${packageRoot}/output/stale.tgz`, type: 'file' as const, size: 1, sha256: hash },
  ].sort((left, right) => left.path.localeCompare(right.path))
  assert.throws(
    () => createReleaseManifest(input({ files })),
    /Interactive Learning package inventory is not exact;.*unexpected=.*output\/stale\.tgz/,
  )
})

test('manifest rejects incomplete Interactive Learning semantic evidence', () => {
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: undefined as unknown as ReleaseManifestInput['experiencePacks'],
  })), /evidence root must be an object/)

  const emptyDescription = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...emptyDescription,
        preset: { ...emptyDescription.preset, description: '  ' },
      },
    },
  })), /preset\.description must be a non-empty string/)

  const missingAgentRow = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...missingAgentRow,
        preset: {
          ...missingAgentRow.preset,
          compositionRows: missingAgentRow.preset.compositionRows.filter(row => row.id !== 'learning-agent'),
        },
      },
    },
  })), /exactly one learning-agent composition row/)

  const wrongHost = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...wrongHost,
        host: { ...wrongHost.host, module: '@dsh-portable/not-learning' },
      } as unknown as InteractiveLearningReleaseEvidence,
    },
  })), /host\.module/)

  const wrongAgentBundle = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...wrongAgentBundle,
        agent: { ...wrongAgentBundle.agent, bundle: 'lib/missing-agent.js' },
      } as unknown as InteractiveLearningReleaseEvidence,
    },
  })), /agent\.bundle/)

  const wrongClientBundle = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...wrongClientBundle,
        client: { ...wrongClientBundle.client, bundle: 'lib/missing-client.js' },
      } as unknown as InteractiveLearningReleaseEvidence,
    },
  })), /client\.bundle/)

  const unsortedInventory = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...unsortedInventory,
        publishedFiles: [...unsortedInventory.publishedFiles].reverse(),
      },
    },
  })), /publishedFiles must be strictly sorted/)

  const archivedInventory = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...archivedInventory,
        publishedFiles: [...archivedInventory.publishedFiles, 'output/stale.tgz'].sort(comparePaths),
      },
    },
  })), /publishedFiles contains a forbidden archive/)

  const duplicateInventory = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...duplicateInventory,
        publishedFiles: [...duplicateInventory.publishedFiles, duplicateInventory.publishedFiles[0]!].sort(comparePaths),
      },
    },
  })), /publishedFiles duplicates/)

  const unsafeInventory = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...unsafeInventory,
        publishedFiles: [...unsafeInventory.publishedFiles, '../escape.js'].sort(comparePaths),
      },
    },
  })), /publishedFiles contains an unsafe path/)

  const missingPublishedFile = learningEvidence()
  assert.throws(() => createReleaseManifest(input({
    experiencePacks: {
      interactiveLearning: {
        ...missingPublishedFile,
        publishedFiles: missingPublishedFile.publishedFiles.filter(path => path !== 'lib/client.js'),
      },
    },
  })), /publishedFiles is missing required file: lib\/client\.js/)

  for (const disallowed of ['src/authorized.ts', 'tests/authorized.txt', 'lib/types/private.d.ts', 'lib/types/private.js', 'lib/nested/private.js']) {
    const broadened = learningEvidence()
    assert.throws(() => createReleaseManifest(input({
      experiencePacks: {
        interactiveLearning: {
          ...broadened,
          publishedFiles: [...broadened.publishedFiles, disallowed].sort(comparePaths),
        },
      },
    })), /fixed distribution policy/, disallowed)
  }
})

test('manifest rejects target claims not proven by the packaged runtime', () => {
  assert.throws(() => createReleaseManifest(input({
    measuredModeSupport: { ...windowsSupport, minimal: { level: 'unavailable', reason: 'No WSL', remediation: ['Install WSL'] } },
  })), /requires compatible/)
})

test('manifest rejects unavailable modes without actionable evidence', () => {
  assert.throws(() => createReleaseManifest(input({
    measuredModeSupport: { ...windowsSupport, optional: { level: 'unavailable' } },
  })), /requires reason and remediation/)
})

test('manifest serialization is deterministic ASCII JSON', () => {
  const serialized = serializeReleaseManifest(createReleaseManifest(input({ releaseNotes: { name: '版本' } })))
  assert.match(serialized, /\\u7248\\u672c/)
  assert.equal(serialized.endsWith('\n'), true)
})
