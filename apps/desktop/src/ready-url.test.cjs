const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readyUrl } = require('./ready-url.cjs')

test('extracts only the loopback readiness URL', () => {
  assert.equal(readyUrl('dsh web: http://127.0.0.1:43127\n'), 'http://127.0.0.1:43127')
  assert.equal(readyUrl('dsh web: http://127.0.0.1:3080 (LAN: http://192.168.1.100:3080)\r\n'), 'http://127.0.0.1:3080')
  assert.equal(readyUrl('\x1b[32mdsh web: http://127.0.0.1:8080\x1b[0m\n'), 'http://127.0.0.1:8080')
  assert.equal(readyUrl('dsh web: http://0.0.0.0:43127\n'), undefined)
  assert.equal(readyUrl('starting...\n'), undefined)
  assert.equal(readyUrl(''), undefined)
  assert.equal(readyUrl(null), undefined)
})
