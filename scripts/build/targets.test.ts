import assert from 'node:assert/strict'
import { test } from 'node:test'
import { satisfiesModeSupport } from '../../packages/platform-contract/src/index.js'
import { getTargetSpec, getTargetSpecFor, TARGET_SPECS } from './targets.js'

test('registered target ids are canonical and unique', () => {
  assert.equal(new Set(TARGET_SPECS.map(target => target.id)).size, TARGET_SPECS.length)
  for (const target of TARGET_SPECS) {
    assert.equal(target.id, `${target.platform}-${target.arch}`)
    assert.deepEqual(target.electron, { platform: target.platform, arch: target.arch })
  }
})

test('target specs own native assets, release formats, updater, and mode expectations', () => {
  const windows = getTargetSpec('win32-x64')
  assert.ok(windows.nativeAssets.some(asset => asset.package === 'node-pty'))
  assert.deepEqual(windows.formats, ['portable-zip', 'inno-setup'])
  assert.equal(windows.updaterAdapter, 'portable-directory-win32')
  assert.equal(windows.signing.adapter, 'authenticode')
  assert.equal(windows.signing.officialReleaseRequiresEvidence, true)
  assert.deepEqual(
    windows.requiredModeSupport.find(expectation => expectation.mode === 'minimal'),
    {
      mode: 'minimal',
      minimum: 'compatible',
      variant: 'win32-wsl',
      runtimeRequirements: ['WSL distribution', 'Bash inside WSL'],
      limitations: ['process-tree-unobservable', 'process-group-signals-emulated'],
    },
  )
})

test('legacy platform/arch resolution goes through the target registry', () => {
  assert.equal(getTargetSpecFor('darwin', 'arm64').id, 'darwin-arm64')
  assert.throws(() => getTargetSpecFor('darwin', 'x64'), /unsupported build target/)
})

test('mode support levels are ordered by contract fidelity', () => {
  assert.equal(satisfiesModeSupport('native', 'compatible'), true)
  assert.equal(satisfiesModeSupport('compatible', 'native'), false)
  assert.equal(satisfiesModeSupport('alternative', 'compatible'), false)
})
