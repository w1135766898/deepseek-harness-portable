const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { hasRequiredClientGraph, readyUrl, settingsDescribeUrl, waitForOnboardingReady } = require('./ready-url.cjs')

test('extracts only the loopback readiness URL', () => {
  assert.equal(readyUrl('dsh web: http://127.0.0.1:43127\n'), 'http://127.0.0.1:43127')
  assert.equal(readyUrl('dsh web: http://127.0.0.1:3080 (LAN: http://192.168.1.100:3080)\r\n'), 'http://127.0.0.1:3080')
  assert.equal(readyUrl('\x1b[32mdsh web: http://127.0.0.1:8080\x1b[0m\n'), 'http://127.0.0.1:8080')
  assert.equal(readyUrl('dsh web: http://0.0.0.0:43127\n'), undefined)
  assert.equal(readyUrl('starting...\n'), undefined)
  assert.equal(readyUrl(''), undefined)
  assert.equal(readyUrl(null), undefined)
})

test('normalizes a trailing listening slash to the exact settings RPC route', () => {
  assert.equal(
    settingsDescribeUrl('http://127.0.0.1:43127/'),
    'http://127.0.0.1:43127/api/settings.describe',
  )
  assert.equal(
    settingsDescribeUrl('http://127.0.0.1:43127'),
    'http://127.0.0.1:43127/api/settings.describe',
  )
})

test('client readiness requires the Interactive Learning Client row', () => {
  const shellOnly = {
    entries: [
      { id: '@deepseek-ai/dsh-client-runtime', inject: [] },
      { id: '@deepseek-ai/dsh-client-ui-layout', inject: ['@deepseek-ai/dsh-client-runtime'] },
    ],
  }
  assert.equal(hasRequiredClientGraph(shellOnly), false)
  assert.equal(hasRequiredClientGraph({
    entries: [
      ...shellOnly.entries,
      { id: '@dsh-portable/interactive-learning', inject: ['@deepseek-ai/dsh-client-runtime'] },
    ],
  }), true)
})

test('waits for onboarding and the complete client graph instead of trusting the first HTTP 200', async () => {
  let settingsAttempts = 0
  let indexAttempts = 0
  const server = createServer((request, response) => {
    if (request.url !== '/api/settings.describe') {
      indexAttempts += 1
      const entries = indexAttempts < 3
        ? []
        : [
            { id: '@deepseek-ai/dsh-client-runtime', inject: ['@deepseek-ai/dsh-client-connection'] },
            { id: '@deepseek-ai/dsh-client-connection', inject: [] },
            { id: '@deepseek-ai/dsh-client-ui-layout', inject: ['@deepseek-ai/dsh-client-runtime'] },
            { id: '@dsh-portable/interactive-learning', inject: ['@deepseek-ai/dsh-client-runtime'] },
          ]
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<html><head><script>window.__DSH_BOOT__ = ${JSON.stringify({ entries })}</script></head></html>`)
      return
    }
    settingsAttempts += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(settingsAttempts < 3
      ? { result: { ok: true, value: { namespaces: [] } } }
      : { result: { ok: true, value: { namespaces: [{ ns: 'ui-onboarding' }] } } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await waitForOnboardingReady(`http://127.0.0.1:${address.port}/`, { timeoutMs: 2_000, intervalMs: 1 })
    assert.equal(settingsAttempts, 3)
    assert.equal(indexAttempts, 3)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
