import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { getTargetSpec } from './targets.js'
import { verifyArtifactBundle, writeArtifactVerification } from './artifact-verification.js'

test('verification is native-only and detects changed artifact bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verified-'))
  try {
    const source = join(root, 'app.zip')
    const manifest = join(root, 'release-manifest.json')
    await writeFile(source, 'final')
    await writeFile(manifest, JSON.stringify({ schemaVersion: 3, target: { id: 'linux-x64' }, distribution: { classification: 'non-official-unsigned' }, files: [{}] }))
    const result = await writeArtifactVerification({
      target: getTargetSpec('linux-x64'),
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
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
