const assert = require('node:assert/strict')
const test = require('node:test')
const { evaluateReleaseUpdate } = require('./update-sources.cjs')

test('compares only the portable distribution release version', () => {
  const result = evaluateReleaseUpdate({
    localDistributionVersion: '1.3.0',
    release: { version: '1.3.1' },
    // Extra kernel-shaped input is deliberately irrelevant. Official kernel
    // changes are delivered inside a later portable release package.
    localKernelVersion: '0.1.0-rc.5',
    kernelRelease: { version: '0.1.0-rc.7' },
  })
  assert.equal(result.currentVersion, '1.3.0')
  assert.equal(result.latestVersion, '1.3.1')
  assert.equal(result.updateAvailable, true)
  assert.equal('kernel' in result, false)
})

test('does not report an update for the same or an invalid release version', () => {
  assert.equal(evaluateReleaseUpdate({
    localDistributionVersion: '1.3.0',
    release: { version: 'v1.3.0' },
  }).updateAvailable, false)
  assert.deepEqual(evaluateReleaseUpdate({
    localDistributionVersion: '1.3.0',
    release: { version: 'dsh-v0.1.0-rc.7' },
  }), {
    currentVersion: '1.3.0',
    latestVersion: undefined,
    updateAvailable: false,
    release: { version: 'dsh-v0.1.0-rc.7' },
  })
})

test('rejects an invalid installed distribution version', () => {
  assert.throws(() => evaluateReleaseUpdate({
    localDistributionVersion: 'rc.7',
    release: { version: '1.3.1' },
  }), /Invalid local distribution version/)
})
