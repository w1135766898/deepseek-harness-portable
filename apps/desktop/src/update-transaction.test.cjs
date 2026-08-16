const assert = require('node:assert/strict')
const test = require('node:test')
const { join } = require('node:path')
const { evaluateUpdateLaunch } = require('./update-transaction.cjs')

function journal(value) {
  return {
    exists: () => true,
    readFile: () => JSON.stringify(value),
  }
}

test('allows launch without a transaction and after terminal phases', () => {
  assert.equal(evaluateUpdateLaunch('C:\\portable', [], { exists: () => false }).allowed, true)
  for (const phase of ['committed', 'rolled-back']) {
    assert.equal(evaluateUpdateLaunch('C:\\portable', [], journal({ phase })).allowed, true)
  }
})

test('blocks ordinary launch during every non-terminal transaction phase', () => {
  for (const phase of ['preparing', 'backed-up', 'layout-verified']) {
    const result = evaluateUpdateLaunch('C:\\portable', [], journal({ phase, transactionId: 'txn-1' }))
    assert.equal(result.allowed, false)
    assert.match(result.reason, new RegExp(phase))
  }
})

test('allows only a health probe whose transaction id matches the journal', () => {
  const state = journal({ phase: 'layout-verified', transactionId: 'txn-1' })
  const allowed = evaluateUpdateLaunch('C:\\portable', [
    '--update-probe-file', join('C:\\temp', 'probe.json'),
    '--update-transaction', 'txn-1',
  ], state)
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.healthProbe, true)

  const blocked = evaluateUpdateLaunch('C:\\portable', [
    '--update-probe-file', join('C:\\temp', 'probe.json'),
    '--update-transaction', 'txn-2',
  ], state)
  assert.equal(blocked.allowed, false)

  const tooEarly = evaluateUpdateLaunch('C:\\portable', [
    '--update-probe-file', join('C:\\temp', 'probe.json'),
    '--update-transaction', 'txn-1',
  ], journal({ phase: 'backed-up', transactionId: 'txn-1' }))
  assert.equal(tooEarly.allowed, false)
})

test('blocks launch when the transaction journal cannot be parsed', () => {
  const result = evaluateUpdateLaunch('C:\\portable', [], {
    exists: () => true,
    readFile: () => '{broken',
  })
  assert.equal(result.allowed, false)
  assert.match(result.reason, /journal is unreadable/)
})
