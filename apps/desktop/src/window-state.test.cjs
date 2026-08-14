const assert = require('node:assert/strict')
const test = require('node:test')
const {
  isWindowBoundsVisible,
  normalizeWindowBounds,
  restoreWindowBounds,
} = require('./window-state.cjs')

const displays = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { workArea: { x: -1280, y: 0, width: 1280, height: 1024 } },
]

test('normalizes incomplete bounds while preserving maximize state', () => {
  assert.deepEqual(normalizeWindowBounds({ width: 400, height: 300, isMaximized: true }), {
    x: undefined,
    y: undefined,
    width: 900,
    height: 600,
    isMaximized: true,
  })
})

test('keeps a window that is still visible on any connected display', () => {
  const bounds = { x: -1200, y: 100, width: 900, height: 600, isMaximized: false }
  assert.equal(isWindowBoundsVisible(bounds, displays.map(display => display.workArea)), true)
  assert.deepEqual(restoreWindowBounds(bounds, displays), bounds)
})

test('recenters an off-screen window after a display is disconnected', () => {
  const restored = restoreWindowBounds({
    x: 2400,
    y: 120,
    width: 1200,
    height: 800,
    isMaximized: true,
  }, [displays[0]])
  assert.equal(restored.isMaximized, true)
  assert.equal(restored.x, 360)
  assert.equal(restored.y, 120)
})
