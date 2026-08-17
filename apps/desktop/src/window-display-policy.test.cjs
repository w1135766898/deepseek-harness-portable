'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { shouldDisplayDesktopWindows } = require('./window-display-policy.cjs')

test('desktop windows remain visible by default', () => {
  assert.equal(shouldDisplayDesktopWindows({}), true)
  assert.equal(shouldDisplayDesktopWindows({ DSH_E2E_HIDDEN_WINDOWS: '0' }), true)
})

test('the isolated Electron lane can suppress every desktop window', () => {
  assert.equal(shouldDisplayDesktopWindows({ DSH_E2E_HIDDEN_WINDOWS: '1' }), false)
})
