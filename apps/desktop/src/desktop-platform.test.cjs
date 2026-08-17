const test = require('node:test')
const assert = require('node:assert/strict')
const {
  browserCommand,
  nativeShellState,
  releaseAssetName,
} = require('./desktop-platform.cjs')

test('Linux uses native POSIX shell state', () => {
  assert.deepEqual(nativeShellState('linux', path => path === '/bin/bash'), {
    platform: 'linux',
    native: true,
    available: true,
    probed: true,
    distros: ['POSIX Bash'],
    executable: '/bin/bash',
  })
})

test('native POSIX shell state reports a missing bash executable', () => {
  assert.deepEqual(nativeShellState('linux', () => false), {
    platform: 'linux',
    native: true,
    available: false,
    probed: true,
    distros: [],
    executable: '/bin/bash',
  })
})

test('browser commands are platform-native', () => {
  assert.deepEqual(browserCommand('https://example.test', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.test'],
    options: {},
  })
  assert.deepEqual(browserCommand('https://example.test', 'darwin'), {
    command: 'open',
    args: ['https://example.test'],
    options: {},
  })
  assert.deepEqual(browserCommand('https://example.test', 'win32'), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'start', '', 'https://example.test'],
    options: { windowsHide: true },
  })
})

test('release assets are platform-specific', () => {
  assert.equal(releaseAssetName('1.2.3', 'linux', 'x64'), 'DeepSeek-Harness-1.2.3-linux-x64.AppImage')
  assert.equal(releaseAssetName('1.2.3', 'linux', 'arm64'), 'DeepSeek-Harness-1.2.3-linux-arm64.AppImage')
  assert.equal(releaseAssetName('1.2.3', 'darwin', 'arm64'), 'DeepSeek-Harness-1.2.3-darwin-arm64.dmg')
  assert.equal(releaseAssetName('1.2.3', 'win32', 'x64'), 'DeepSeek-Harness-1.2.3-win32-x64.zip')
  assert.equal(releaseAssetName('0.0.0', 'linux', 'x64'), undefined)
})
