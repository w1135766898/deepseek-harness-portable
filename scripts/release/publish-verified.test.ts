import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeArtifactVerification } from '../build/artifact-verification.js'
import { getTargetSpec } from '../build/targets.js'
import { publishVerifiedTarget } from './publish-verified.js'

test('publishing fails closed for unsigned bytes unless the prerelease override is explicit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-publish-'))
  try {
    const artifact = join(root, 'app.AppImage')
    const manifest = join(root, 'release-manifest.json')
    await writeFile(artifact, 'immutable')
    await writeFile(manifest, JSON.stringify({
      schemaVersion: 3,
      target: { id: 'linux-x64' },
      distribution: { classification: 'non-official-unsigned' },
      files: [{}],
    }))
    const bundle = await writeArtifactVerification({
      target: getTargetSpec('linux-x64'),
      evidence: {
        schemaVersion: 1,
        capabilityReport: { target: { platform: 'linux', arch: 'x64' }, snapshotHash: 'a'.repeat(64) },
        modeCatalog: { target: { platform: 'linux', arch: 'x64' }, capabilitySnapshotHash: 'a'.repeat(64) },
        modeSupport: {},
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
