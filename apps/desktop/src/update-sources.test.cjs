const assert = require('node:assert/strict')
const test = require('node:test')
const {
  evaluateUpdateChannels,
  parseOfficialKernelTag,
  queryLatestOfficialKernelRelease,
} = require('./update-sources.cjs')

test('parses only official dsh-v SemVer tags', () => {
  assert.equal(parseOfficialKernelTag('dsh-v0.1.0-rc.7'), '0.1.0-rc.7')
  assert.equal(parseOfficialKernelTag('v1.3.0'), undefined)
  assert.equal(parseOfficialKernelTag('dsh-v0.1.0-01'), undefined)
})

test('compares portable shell and official kernel versions only within their channels', () => {
  const result = evaluateUpdateChannels({
    localDistributionVersion: '1.3.0',
    localKernelVersion: '0.1.0-rc.5',
    portableRelease: { version: '1.3.0' },
    kernelRelease: { version: '0.1.0-rc.7' },
  })
  assert.equal(result.portable.updateAvailable, false)
  assert.equal(result.kernel.updateAvailable, true)
})

test('one failed official mirror does not hide a valid release from another source', async () => {
  const release = await queryLatestOfficialKernelRelease({
    urls: ['https://failed.test/releases', 'https://working.test/releases'],
    fetchJson: async url => {
      if (url.includes('failed')) throw new Error('source unavailable')
      return [
        { tag_name: 'v9.0.0', draft: false },
        { tag_name: 'dsh-v0.1.0-rc.5', draft: false, prerelease: true },
        { tag_name: 'dsh-v0.1.0-rc.7', draft: false, prerelease: true },
      ]
    },
  })
  assert.equal(release.version, '0.1.0-rc.7')
  assert.equal(release.channel, 'kernel')
})

test('portable source failure remains independent from a successful kernel result', async () => {
  const [portable, kernel] = await Promise.allSettled([
    Promise.reject(new Error('portable unavailable')),
    queryLatestOfficialKernelRelease({
      urls: ['https://working.test/releases'],
      fetchJson: async () => [{ tag_name: 'dsh-v0.1.0-rc.7', draft: false, prerelease: true }],
    }),
  ])
  assert.equal(portable.status, 'rejected')
  assert.equal(kernel.status, 'fulfilled')
  assert.equal(kernel.value.version, '0.1.0-rc.7')
})
