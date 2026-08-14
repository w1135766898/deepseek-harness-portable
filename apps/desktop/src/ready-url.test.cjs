const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readyUrl } = require('./ready-url.cjs')

test('extracts only the loopback readiness URL', () => {
  assert.equal(readyUrl('dsh web: http://127.0.0.1:43127\n'), 'http://127.0.0.1:43127')
  assert.equal(readyUrl('dsh web: http://0.0.0.0:43127\n'), undefined)
  assert.equal(readyUrl('starting...\n'), undefined)
})
