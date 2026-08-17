const assert = require('node:assert/strict')
const test = require('node:test')
const {
  RUNTIME_PROTOCOL_ENV,
  RUNTIME_PROTOCOL_VERSION,
  createRuntimeEventDecoder,
  encodeRuntimeEvent,
  protocolEnvironment,
  runtimeLaunchArguments,
} = require('./index.cjs')

test('launch contract uses an isolated loopback port and versioned environment', () => {
  assert.deepEqual(runtimeLaunchArguments(), ['--host', '127.0.0.1', '--port', '0', '--no-open'])
  assert.equal(protocolEnvironment({ SAMPLE: 'ok' })[RUNTIME_PROTOCOL_ENV], String(RUNTIME_PROTOCOL_VERSION))
})

test('runtime event decoder handles split records and ignores ordinary output', () => {
  const events = []
  const decoder = createRuntimeEventDecoder(event => events.push(event))
  const hello = encodeRuntimeEvent({ protocolVersion: 1, type: 'hello', pid: 42 })
  const diagnostic = encodeRuntimeEvent({
    protocolVersion: 1,
    type: 'diagnostic',
    code: 'MARKETPLACE_UNAVAILABLE',
    component: 'marketplace',
    severity: 'warning',
    message: 'Marketplace unavailable: no valid seed',
    recoverable: true,
  })
  const listening = encodeRuntimeEvent({ protocolVersion: 1, type: 'listening', url: 'http://127.0.0.1:31337/' })
  decoder.push(`ordinary log\n${hello.slice(0, 12)}`)
  decoder.push(`${hello.slice(12)}\r\n${diagnostic}\n${listening}\n`)
  decoder.end()
  assert.deepEqual(events, [
    { protocolVersion: 1, type: 'hello', pid: 42 },
    {
      protocolVersion: 1,
      type: 'diagnostic',
      code: 'MARKETPLACE_UNAVAILABLE',
      component: 'marketplace',
      severity: 'warning',
      message: 'Marketplace unavailable: no valid seed',
      recoverable: true,
    },
    { protocolVersion: 1, type: 'listening', url: 'http://127.0.0.1:31337/' },
  ])
})

test('protocol rejects non-loopback readiness and mismatched versions', () => {
  assert.throws(
    () => encodeRuntimeEvent({ protocolVersion: 1, type: 'listening', url: 'https://example.com/' }),
    /loopback/,
  )
  assert.throws(
    () => encodeRuntimeEvent({
      protocolVersion: 1,
      type: 'diagnostic',
      code: 'not-stable',
      component: 'marketplace',
      severity: 'warning',
      message: 'bad code',
      recoverable: true,
    }),
    /uppercase code/,
  )
  assert.throws(
    () => encodeRuntimeEvent({ protocolVersion: 2, type: 'hello', pid: 1 }),
    /unsupported runtime protocol version/,
  )
})
