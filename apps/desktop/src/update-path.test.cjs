const assert = require('node:assert/strict')
const test = require('node:test')
const { win32 } = require('node:path')
const { findPortableRoot } = require('./update-path.cjs')

test('finds the portable root from a packaged Electron app directory', () => {
  const appDir = 'C:\\portable\\runtime\\resources\\app\\src'
  const root = 'C:\\portable'
  const files = new Set([
    win32.join(root, 'update.ps1'),
    win32.join(root, 'runtime', 'DeepSeek Harness.exe'),
  ])

  assert.equal(findPortableRoot(appDir, path => files.has(path)), root)
})

test('does not treat an incomplete app directory as a portable root', () => {
  const appDir = 'C:\\portable\\runtime\\resources\\app\\src'
  assert.equal(findPortableRoot(appDir, () => false), undefined)
})
