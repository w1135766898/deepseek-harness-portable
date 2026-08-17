const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const test = require('node:test')
const { resolve } = require('node:path')
const { encodeRuntimeEvent } = require('../../../packages/desktop-protocol/src/index.cjs')
const { RuntimeSupervisor } = require('./runtime-supervisor.cjs')

function fakeChild(pid = 42) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

test('supervisor launches through protocol and waits for Harness readiness', async () => {
  const child = fakeChild()
  let spawnCall
  let readinessUrl
  const supervisor = new RuntimeSupervisor({
    spawnProcess(executable, args, options) {
      spawnCall = { executable, args, options }
      return child
    },
    waitUntilReady: async url => { readinessUrl = url },
  })
  const entry = resolve(__filename)
  const started = supervisor.start({
    executable: process.execPath,
    entry,
    cwd: process.cwd(),
    env: { SAMPLE: 'yes' },
  })
  const hello = encodeRuntimeEvent({ protocolVersion: 1, type: 'hello', pid: child.pid })
  const listening = encodeRuntimeEvent({ protocolVersion: 1, type: 'listening', url: 'http://127.0.0.1:4567/' })
  child.stdout.write(`${hello}\n${listening.slice(0, 15)}`)
  child.stdout.write(`${listening.slice(15)}\n`)
  assert.equal(await started, 'http://127.0.0.1:4567/')
  assert.equal(readinessUrl, 'http://127.0.0.1:4567/')
  assert.deepEqual(spawnCall.args.slice(1), ['--host', '127.0.0.1', '--port', '0', '--no-open'])
  assert.equal(spawnCall.options.env.DSH_RUNTIME_PROTOCOL_VERSION, '1')
})

test('supervisor keeps stderr diagnostics out of the stdout protocol stream', async () => {
  const child = fakeChild(84)
  const supervisor = new RuntimeSupervisor({
    spawnProcess: () => child,
    waitUntilReady: async () => {},
  })
  const started = supervisor.start({ executable: process.execPath, entry: resolve(__filename), cwd: process.cwd() })
  const hello = encodeRuntimeEvent({ protocolVersion: 1, type: 'hello', pid: child.pid })
  const listening = encodeRuntimeEvent({ protocolVersion: 1, type: 'listening', url: 'http://127.0.0.1:9876/' })
  child.stdout.write(`${hello}\n${listening.slice(0, 20)}`)
  child.stderr.write('unrelated diagnostic\n')
  child.stdout.write(`${listening.slice(20)}\n`)
  assert.equal(await started, 'http://127.0.0.1:9876/')
})

test('supervisor records structured recoverable diagnostics without blocking readiness', async () => {
  const child = fakeChild(85)
  const observed = []
  const supervisor = new RuntimeSupervisor({
    spawnProcess: () => child,
    waitUntilReady: async () => {},
  })
  const started = supervisor.start({
    executable: process.execPath,
    entry: resolve(__filename),
    cwd: process.cwd(),
    onDiagnostic: diagnostic => observed.push(diagnostic),
  })
  const hello = encodeRuntimeEvent({ protocolVersion: 1, type: 'hello', pid: child.pid })
  const diagnostic = {
    protocolVersion: 1,
    type: 'diagnostic',
    code: 'MARKETPLACE_UNAVAILABLE',
    component: 'marketplace',
    severity: 'warning',
    message: 'Marketplace unavailable: no valid seed',
    recoverable: true,
  }
  const listening = encodeRuntimeEvent({ protocolVersion: 1, type: 'listening', url: 'http://127.0.0.1:9877/' })
  child.stdout.write(`${hello}\n${encodeRuntimeEvent(diagnostic)}\n${listening}\n`)
  assert.equal(await started, 'http://127.0.0.1:9877/')
  assert.deepEqual(observed, [diagnostic])
  assert.deepEqual(supervisor.diagnostics, [diagnostic])
})

test('supervisor fails closed when protocol PID does not match the child', async () => {
  const child = fakeChild(42)
  let terminatedPid
  const supervisor = new RuntimeSupervisor({
    spawnProcess: () => child,
    terminate: async pid => { terminatedPid = pid; return true },
  })
  const started = supervisor.start({ executable: process.execPath, entry: resolve(__filename), cwd: process.cwd() })
  child.stdout.write(`${encodeRuntimeEvent({ protocolVersion: 1, type: 'hello', pid: 43 })}\n`)
  await assert.rejects(started, error => error.code === 'PROTOCOL_PID')
  assert.equal(terminatedPid, 42)
  assert.equal(supervisor.running, false)
})

test('supervisor delegates process-tree shutdown and retains failed ownership', async () => {
  const child = fakeChild(99)
  const supervisor = new RuntimeSupervisor({ spawnProcess: () => child, terminate: async () => false })
  const started = supervisor.start({ executable: process.execPath, entry: resolve(__filename), cwd: process.cwd() })
  assert.equal(await supervisor.stop(), false)
  assert.equal(supervisor.pid, 99)
  child.emit('exit', 1)
  await assert.rejects(started, /exited before it was ready/)
})
