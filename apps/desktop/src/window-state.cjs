const DEFAULT_WINDOW_BOUNDS = Object.freeze({
  width: 1440,
  height: 900,
})

const MIN_WINDOW_BOUNDS = Object.freeze({
  width: 900,
  height: 600,
})

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function positiveInteger(value) {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 ? Math.round(number) : undefined
}

function normalizeWindowBounds(value, defaults = DEFAULT_WINDOW_BOUNDS) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const width = Math.max(MIN_WINDOW_BOUNDS.width, positiveInteger(source.width) || defaults.width)
  const height = Math.max(MIN_WINDOW_BOUNDS.height, positiveInteger(source.height) || defaults.height)
  return {
    x: finiteNumber(source.x),
    y: finiteNumber(source.y),
    width,
    height,
    isMaximized: source.isMaximized === true,
  }
}

function workAreaRect(value) {
  if (!value || typeof value !== 'object') return undefined
  const x = finiteNumber(value.x)
  const y = finiteNumber(value.y)
  const width = positiveInteger(value.width)
  const height = positiveInteger(value.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined
  return { x, y, width, height }
}

function intersection(bounds, area) {
  const left = Math.max(bounds.x, area.x)
  const top = Math.max(bounds.y, area.y)
  const right = Math.min(bounds.x + bounds.width, area.x + area.width)
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function isWindowBoundsVisible(bounds, workAreas, minimumVisible = 80) {
  if (!Number.isFinite(bounds?.x) || !Number.isFinite(bounds?.y)) return false
  return workAreas
    .map(workAreaRect)
    .filter(Boolean)
    .some(area => {
      const visible = intersection(bounds, area)
      return visible.width >= Math.min(minimumVisible, bounds.width)
        && visible.height >= Math.min(minimumVisible, bounds.height)
    })
}

function centerInWorkArea(bounds, area) {
  return {
    ...bounds,
    x: Math.round(area.x + (area.width - bounds.width) / 2),
    y: Math.round(area.y + (area.height - bounds.height) / 2),
  }
}

function restoreWindowBounds(saved, displays = [], defaults = DEFAULT_WINDOW_BOUNDS) {
  const bounds = normalizeWindowBounds(saved, defaults)
  const workAreas = displays.map(display => workAreaRect(display?.workArea || display)).filter(Boolean)
  if (workAreas.length === 0) {
    return centerInWorkArea({ ...bounds, x: 0, y: 0 }, {
      x: 0,
      y: 0,
      width: defaults.width,
      height: defaults.height,
    })
  }

  if (isWindowBoundsVisible(bounds, workAreas)) return bounds
  return centerInWorkArea(bounds, workAreas[0])
}

module.exports = {
  DEFAULT_WINDOW_BOUNDS,
  MIN_WINDOW_BOUNDS,
  isWindowBoundsVisible,
  normalizeWindowBounds,
  restoreWindowBounds,
}
