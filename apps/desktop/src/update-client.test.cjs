const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')
const {
  compareVersions,
  fetchJson,
  mirrorUrls,
  normalizeSha256,
  parseSha256Sums,
} = require('./update-client.cjs')

test('compares stable and prerelease versions according to SemVer precedence', () => {
  assert.equal(compareVersions('0.3.0', '0.3.0-rc1'), 1)
  assert.equal(compareVersions('v1.0.0-rc.2', '1.0.0-rc.10'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0)
})

test('rejects invalid versions instead of falling back to lexical ordering', () => {
  assert.throws(() => compareVersions('1.0.0-01', '1.0.0'), /Invalid SemVer/)
  assert.throws(() => compareVersions('1.0.0', 'bad'), /Invalid SemVer/)
})

test('builds unique direct and mirror URLs', () => {
  assert.deepEqual(mirrorUrls('https://example.test/release.zip', ['', 'https://mirror.test/']), [
    'https://example.test/release.zip',
    'https://mirror.test/https://example.test/release.zip',
  ])
})

test('parses GitHub asset and checksum values', () => {
  const digest = 'a'.repeat(64)
  assert.equal(normalizeSha256(`sha256:${digest}`), digest.toUpperCase())
  assert.equal(parseSha256Sums(`deadbeef\n${digest} *DeepSeek-Harness-1.0.0-win32-x64.zip\n`, 'DeepSeek-Harness-1.0.0-win32-x64.zip'), digest.toUpperCase())
})

test('follows HTTP redirects when fetching update metadata', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/release' })
      response.end()
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ tag_name: 'v1.2.3' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    const result = await fetchJson(`http://127.0.0.1:${address.port}/redirect`)
    assert.equal(result.tag_name, 'v1.2.3')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
