import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserCommand } from './open-browser.js'

test('runtime browser launching is owned by the runtime capsule', () => {
  assert.deepEqual(browserCommand('http://127.0.0.1:1/', 'win32'), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'start', '', 'http://127.0.0.1:1/'],
    options: { windowsHide: true },
  })
  assert.equal(browserCommand('http://127.0.0.1:1/', 'darwin').command, 'open')
  assert.equal(browserCommand('http://127.0.0.1:1/', 'linux').command, 'xdg-open')
})
