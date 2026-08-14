const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readyUrl, waitForOnboardingReady } = require('./ready-url.cjs')

test('extracts only the loopback readiness URL', () => {
  assert.equal(readyUrl('dsh web: http://127.0.0.1:43127\n'), 'http://127.0.0.1:43127')
  assert.equal(readyUrl('dsh web: http://127.0.0.1:3080 (LAN: http://192.168.1.100:3080)\r\n'), 'http://127.0.0.1:3080')
  assert.equal(readyUrl('\x1b[32mdsh web: http://127.0.0.1:8080\x1b[0m\n'), 'http://127.0.0.1:8080')
  assert.equal(readyUrl('dsh web: http://0.0.0.0:43127\n'), undefined)
  assert.equal(readyUrl('starting...\n'), undefined)
  assert.equal(readyUrl(''), undefined)
  assert.equal(readyUrl(null), undefined)
})

test('waits for the onboarding namespace instead of trusting the first HTTP 200', async () => {
  let attempts = 0
  const server = createServer((request, response) => {
    if (request.url !== '/api/settings.describe') {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('loading')
      return
    }
    attempts += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(attempts < 3
      ? { result: { ok: true, value: { namespaces: [] } } }
      : { result: { ok: true, value: { namespaces: [{ ns: 'ui-onboarding' }] } } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await waitForOnboardingReady(`http://127.0.0.1:${address.port}`, { timeoutMs: 2_000, intervalMs: 1 })
    assert.equal(attempts, 3)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
