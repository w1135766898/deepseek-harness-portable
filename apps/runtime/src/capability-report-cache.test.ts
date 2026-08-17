import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CAPABILITY_PROBE_REVISION,
  currentCapabilityCacheIdentity,
  readCapabilityReportCache,
  writeCapabilityReportCache,
} from './capability-report-cache.js'
import type { CapabilityReport } from './mode-resolver.js'

function report(platform: NodeJS.Platform, arch: NodeJS.Architecture): CapabilityReport {
  const base = {
    target: { platform, arch },
    capabilities: {},
    generatedAt: '2026-08-17T00:00:00.000Z',
  }
  return {
    ...base,
    snapshotHash: createHash('sha256').update(JSON.stringify({
      target: base.target,
      capabilities: base.capabilities,
    })).digest('hex'),
  }
}

test('capability cache round-trips only for the same runtime identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-capability-cache-'))
  const path = join(root, 'nested', 'cache.json')
  const identity = currentCapabilityCacheIdentity('win32', 'x64', 'upstream-a', 'probe-a')
  try {
    const expected = report('win32', 'x64')
    await writeCapabilityReportCache(path, identity, expected)
    assert.deepEqual(await readCapabilityReportCache(path, identity), expected)
    assert.equal(await readCapabilityReportCache(path, { ...identity, arch: 'arm64' }), undefined)
    assert.equal(await readCapabilityReportCache(path, { ...identity, upstreamVersion: 'upstream-b' }), undefined)
    assert.equal(await readCapabilityReportCache(path, { ...identity, probeImplementationHash: 'probe-b' }), undefined)
    assert.equal(await readCapabilityReportCache(path, identity, -1), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('capability cache ignores corrupt and obsolete entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-capability-cache-'))
  const path = join(root, 'cache.json')
  const identity = currentCapabilityCacheIdentity()
  try {
    await writeFile(path, '{broken', 'utf8')
    assert.equal(await readCapabilityReportCache(path, identity), undefined)

    await writeCapabilityReportCache(path, identity, report(identity.platform, identity.arch))
    const value = JSON.parse(await readFile(path, 'utf8')) as { probeRevision: number }
    value.probeRevision = CAPABILITY_PROBE_REVISION + 1
    await writeFile(path, JSON.stringify(value), 'utf8')
    assert.equal(await readCapabilityReportCache(path, identity), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
