import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MeasuredModeSupport } from '../../platform-contract/src/index.js'
import { getTargetSpec } from '../../../scripts/build/targets.js'
import { createReleaseManifest, serializeReleaseManifest, type ReleaseManifestInput } from './index.js'

const hash = 'a'.repeat(64)
const windowsSupport: Record<string, MeasuredModeSupport> = {
  standard: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  code: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  cordis: { level: 'native', variant: 'win32-powershell', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
  minimal: { level: 'compatible', variant: 'win32-wsl', presetHash: hash, upstreamCommit: '2222222', capabilitySnapshotHash: hash },
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
    files: [{ path: 'app.exe', type: 'file', size: 1, sha256: hash }],
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
