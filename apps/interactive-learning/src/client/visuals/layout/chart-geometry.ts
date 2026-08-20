/**
 * Cartesian frame shared by `plot` and `scene_2d`.
 *
 * The frame follows the viewport rather than a fixed 560px minimum, so a narrow
 * conversation column gets a chart it can actually contain instead of one it has
 * to scroll horizontally. Height follows width so the aspect ratio stays inside
 * a range that keeps curves readable.
 */
import type { ChartGeometry, PlotContent, Scene2DContent } from '../core/types.ts'
import { normalizedPosition } from '../core/format.ts'

/** Below this the axis labels and tick numbers stop fitting. */
export const CHART_MIN_WIDTH = 320

export function chartGeometry(containerWidth: number, minWidth = CHART_MIN_WIDTH): ChartGeometry {
  const width = Math.max(minWidth, Math.round(containerWidth))
  const height = Math.round(Math.max(260, Math.min(400, width * 0.56)))
  const left = width < 420 ? 46 : 56
  const right = 18
  const top = 20
  const bottom = width < 420 ? 46 : 52
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth: width - left - right,
    plotHeight: height - top - bottom,
  }
}

export function scaleX(
  value: number,
  axis: PlotContent['xAxis'] | Scene2DContent['xAxis'],
  geometry: ChartGeometry,
): number {
  return geometry.left + normalizedPosition(value, axis.min, axis.max) * geometry.plotWidth
}

export function scaleY(
  value: number,
  axis: PlotContent['yAxis'] | Scene2DContent['yAxis'],
  geometry: ChartGeometry,
): number {
  return geometry.top + (1 - normalizedPosition(value, axis.min, axis.max)) * geometry.plotHeight
}
