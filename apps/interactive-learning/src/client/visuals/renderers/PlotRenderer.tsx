/** `plot`: quantitative relationships on axes, with optional live parameters. */
import { useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { evaluateMathExpression } from '../../../math-expression.ts'
import { useVisualLabels } from '../core/labels.ts'
import { FigureViewport } from '../core/shell-parts.tsx'
import { formatNumber, interpolate, normalizedPosition, ticks, toneAt } from '../core/format.ts'
import type { ChartGeometry, PlotContent, Point, RendererProps } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import { useContainerWidth } from '../state/hooks.ts'
import { chartGeometry, scaleX, scaleY } from '../layout/chart-geometry.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/plot.module.css'

function initialParameterValues(content: PlotContent, storageKey: string | undefined): Record<string, number> {
  const parameters = content.parameters ?? []
  const values = Object.fromEntries(parameters.map(parameter => [parameter.id, parameter.initial]))
  if (storageKey === undefined || typeof sessionStorage === 'undefined') return values
  try {
    const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@4:${storageKey}`) ?? '{}') as Record<string, unknown>
    for (const parameter of parameters) {
      const candidate = stored[parameter.id]
      if (typeof candidate === 'number' && Number.isFinite(candidate)
        && candidate >= parameter.min && candidate <= parameter.max) values[parameter.id] = candidate
    }
  } catch {
    // Invalid optional UI state must not prevent replaying the canonical visual.
  }
  return values
}

/**
 * Sample one curve into a path, and report whether any sample is actually
 * visible inside the declared axes.
 *
 * A schema-valid curve can still produce nothing to look at: `log` or `sqrt`
 * over a negative domain yields no finite value, and a curve whose outputs sit
 * far outside the declared y range is drawn entirely outside the clip. Both
 * would otherwise leave the learner staring at an empty frame.
 */
function plotCurveRender(
  series: Extract<PlotContent['series'][number], { type: 'curve' }>,
  content: PlotContent,
  values: Readonly<Record<string, number>>,
  geometry: ChartGeometry,
): { path: string; visible: boolean } {
  const samples = content.xAxis.samples ?? 160
  const commands: string[] = []
  let drawing = false
  let previousY: number | undefined
  let visible = false
  for (let index = 0; index < samples; index += 1) {
    const x = interpolate(content.xAxis.min, content.xAxis.max, index / Math.max(1, samples - 1))
    const y = evaluateMathExpression(series.expression, { ...values, x })
    if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
      drawing = false
      previousY = undefined
      continue
    }
    if (y >= content.yAxis.min && y <= content.yAxis.max) visible = true
    const px = scaleX(x, content.xAxis, geometry)
    const py = scaleY(y, content.yAxis, geometry)
    if (previousY !== undefined && Math.abs(previousY - py) > geometry.plotHeight * 2) drawing = false
    commands.push(`${drawing ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`)
    drawing = true
    previousY = py
  }
  return { path: commands.join(' '), visible }
}

/** Whether any declared point of a plotted series falls inside both axes. */
function pointsVisible(points: readonly Point[], content: PlotContent): boolean {
  return points.some(point => Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= content.xAxis.min && point.x <= content.xAxis.max
    && point.y >= content.yAxis.min && point.y <= content.yAxis.max)
}

function pointsPath(points: readonly Point[], content: PlotContent, geometry: ChartGeometry): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(point.x, content.xAxis, geometry).toFixed(2)},${scaleY(point.y, content.yAxis, geometry).toFixed(2)}`).join(' ')
}

function nearestPointValue(points: readonly Point[], x: number): number | undefined {
  let nearest: Point | undefined
  for (const point of points) {
    if (nearest === undefined || Math.abs(point.x - x) < Math.abs(nearest.x - x)) nearest = point
  }
  return nearest?.y
}

function interpolatedLineValue(points: readonly Point[], x: number): number | undefined {
  const sorted = [...points].sort((left, right) => left.x - right.x)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) return undefined
  if (x <= first.x) return first.y
  if (x >= last.x) return last.y
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (previous === undefined || current === undefined) continue
    if (x <= current.x) {
      const span = current.x - previous.x
      return span === 0 ? current.y : previous.y + (current.y - previous.y) * ((x - previous.x) / span)
    }
  }
  return last.y
}

export function PlotRenderer({ content, focus, storageKey }: RendererProps<PlotContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [viewportRef, containerWidth] = useContainerWidth()
  const geometry = useMemo(() => chartGeometry(containerWidth), [containerWidth])
  const [values, setValues] = useState<Record<string, number>>(() => initialParameterValues(content, storageKey))
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(() => new Set())
  const [probeX, setProbeX] = useState<number | undefined>()
  const xTicks = useMemo(() => ticks(content.xAxis.min, content.xAxis.max), [content.xAxis.max, content.xAxis.min])
  const yTicks = useMemo(() => ticks(content.yAxis.min, content.yAxis.max), [content.yAxis.max, content.yAxis.min])
  const parameters = content.parameters ?? []

  useEffect(() => {
    if (storageKey === undefined || typeof sessionStorage === 'undefined') return
    try {
      sessionStorage.setItem(`dsh-learning/visual@4:${storageKey}`, JSON.stringify(values))
    } catch {
      // Persistence is an enhancement; interaction remains local without it.
    }
  }, [storageKey, values])

  const renders = useMemo(() => new Map(content.series.map(series => [
    series.id,
    series.type === 'curve'
      ? plotCurveRender(series, content, values, geometry)
      : { path: undefined, visible: pointsVisible(series.points, content) },
  ])), [content, geometry, values])
  const visibleSeries = content.series.filter(series => !hiddenSeries.has(series.id))
  // A series the learner enabled but which has nothing inside the axes is the
  // silent failure this reports; every shown series being empty is worse still.
  const emptySeriesIds = new Set(content.series
    .filter(series => renders.get(series.id)?.visible !== true)
    .map(series => series.id))
  const nothingToSee = visibleSeries.length > 0
    && visibleSeries.every(series => emptySeriesIds.has(series.id))
  const probeValues = probeX === undefined ? [] : visibleSeries.flatMap(series => {
    let y: number | undefined
    if (series.type === 'curve') y = evaluateMathExpression(series.expression, { ...values, x: probeX })
    else if (series.type === 'line') y = interpolatedLineValue(series.points, probeX)
    else y = nearestPointValue(series.points, probeX)
    return y === undefined || !Number.isFinite(y) ? [] : [{ id: series.id, label: series.label, y, tone: series.tone }]
  })
  const chartDescription = `${content.xAxis.label ?? 'x'} ${formatNumber(content.xAxis.min)}–${formatNumber(content.xAxis.max)}; ${content.yAxis.label ?? 'y'} ${formatNumber(content.yAxis.min)}–${formatNumber(content.yAxis.max)}; ${content.series.map(series => series.label).join(', ')}${nothingToSee ? `. ${labels.noValuesInRange}` : ''}`
  const probeDescription = probeX === undefined ? `${labels.chartProbeHint}. ${chartDescription}`
    : `x ${formatNumber(probeX)}。${probeValues.map(item => `${item.label} ${formatNumber(item.y)}`).join('，')}`

  const updateProbeFromPointer = (event: PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const viewX = (event.clientX - rect.left) / rect.width * geometry.width
    const ratio = (viewX - geometry.left) / geometry.plotWidth
    setProbeX(interpolate(content.xAxis.min, content.xAxis.max, ratio))
  }
  const moveProbe = (event: KeyboardEvent<SVGSVGElement>): void => {
    const step = (content.xAxis.max - content.xAxis.min) / 50
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const current = probeX ?? (content.xAxis.min + content.xAxis.max) / 2
      setProbeX(Math.max(content.xAxis.min, Math.min(content.xAxis.max, current + (event.key === 'ArrowLeft' ? -step : step))))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setProbeX(content.xAxis.min)
    } else if (event.key === 'End') {
      event.preventDefault()
      setProbeX(content.xAxis.max)
    } else if (event.key === 'Escape') setProbeX(undefined)
  }
  const toggleSeries = (seriesId: string): void => {
    setHiddenSeries(current => {
      const next = new Set(current)
      if (next.has(seriesId)) next.delete(seriesId)
      else next.add(seriesId)
      return next
    })
  }

  return (
    <div className={shell.rendererStack}>
      {parameters.length === 0 ? null : (
        <div className={css.parameterGrid}>
          {parameters.map(parameter => {
            const value = values[parameter.id] ?? parameter.initial
            const inputId = `${id}-${parameter.id}`
            const progress = normalizedPosition(value, parameter.min, parameter.max) * 100
            return (
              <label className={css.parameter} key={parameter.id} htmlFor={inputId} data-visual-id={parameter.id} data-visual-state={elementState(parameter.id, focus)}>
                <span className={css.parameterHeader}>
                  <span>{parameter.label}</span>
                  <output htmlFor={inputId}>{formatNumber(value)}</output>
                </span>
                <input
                  id={inputId}
                  type="range"
                  min={parameter.min}
                  max={parameter.max}
                  step={parameter.step}
                  value={value}
                  style={{ '--range-progress': `${progress}%` } as CSSProperties}
                  onChange={event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) }))}
                />
                <span className={css.parameterEnds} aria-hidden="true">
                  <span>{formatNumber(parameter.min)}</span><span>{formatNumber(parameter.max)}</span>
                </span>
              </label>
            )
          })}
        </div>
      )}

      {content.metrics === undefined || content.metrics.length === 0 ? null : (
        <dl className={css.metrics} aria-label={labels.metricsLabel}>
          {content.metrics.map(metric => (
            <div key={metric.id} data-visual-id={metric.id} data-visual-state={elementState(metric.id, focus)}>
              <dt>{metric.label}</dt>
              <dd>{formatNumber(evaluateMathExpression(metric.expression, values), metric.digits)}{metric.suffix ?? ''}</dd>
            </div>
          ))}
        </dl>
      )}

      <FigureViewport viewportRef={viewportRef}>
        <svg
          className={css.plotSvg}
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          role="img"
          tabIndex={0}
          aria-label={probeDescription}
          onPointerMove={updateProbeFromPointer}
          onPointerLeave={() => setProbeX(undefined)}
          onKeyDown={moveProbe}
        >
          <defs>
            <clipPath id={`${id}-plot-clip`}>
              <rect x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
            </clipPath>
          </defs>
          <rect className={css.plotFrame} x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
          {yTicks.map(value => {
            const y = scaleY(value, content.yAxis, geometry)
            return <g key={`y-${String(value)}`}><line className={css.gridLine} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={y} y2={y} /><text className={css.tickLabel} x={geometry.left - 9} y={y} textAnchor="end" dominantBaseline="middle">{formatNumber(value)}</text></g>
          })}
          {xTicks.map(value => {
            const x = scaleX(value, content.xAxis, geometry)
            return <g key={`x-${String(value)}`}><line className={css.gridLine} x1={x} x2={x} y1={geometry.top} y2={geometry.top + geometry.plotHeight} /><text className={css.tickLabel} x={x} y={geometry.top + geometry.plotHeight + 19} textAnchor="middle">{formatNumber(value)}</text></g>
          })}
          <g clipPath={`url(#${id}-plot-clip)`}>
            {content.series.map((series, seriesIndex) => {
              if (hiddenSeries.has(series.id)) return null
              const tone = toneAt(series.tone, seriesIndex)
              const state = elementState(series.id, focus)
              if (series.type === 'curve') return (
                <path key={series.id} className={css.seriesLine} data-tone={tone} data-visual-state={state} data-visual-id={series.id} data-stroke={series.stroke ?? 'solid'} d={renders.get(series.id)?.path} />
              )
              if (series.type === 'line') return (
                <path key={series.id} className={css.seriesLine} data-tone={tone} data-visual-state={state} data-visual-id={series.id} data-stroke={series.stroke ?? 'solid'} d={pointsPath(series.points, content, geometry)} />
              )
              if (series.type === 'bars') {
                const sortedXs = series.points.map(point => scaleX(point.x, content.xAxis, geometry)).sort((a, b) => a - b)
                const smallestGap = sortedXs.slice(1).reduce((gap, x, index) => Math.min(gap, x - (sortedXs[index] ?? x)), geometry.plotWidth / Math.max(1, sortedXs.length))
                const barWidth = Math.max(6, Math.min(44, smallestGap * 0.68))
                const zeroY = scaleY(Math.max(content.yAxis.min, Math.min(content.yAxis.max, 0)), content.yAxis, geometry)
                return <g key={series.id} data-visual-id={series.id} data-visual-state={state}>{series.points.map((point, pointIndex) => {
                  const x = scaleX(point.x, content.xAxis, geometry)
                  const y = scaleY(point.y, content.yAxis, geometry)
                  return <rect key={`${series.id}-${String(pointIndex)}`} className={css.seriesBar} data-tone={tone} x={x - barWidth / 2} y={Math.min(y, zeroY)} width={barWidth} height={Math.max(1, Math.abs(zeroY - y))}><title>{point.label ?? `${series.label}: ${formatNumber(point.y)}`}</title></rect>
                })}</g>
              }
              return (
                <g key={series.id} data-visual-id={series.id} data-visual-state={state}>{series.points.map((point, pointIndex) => <circle key={`${series.id}-${String(pointIndex)}`} className={css.seriesPoint} data-tone={tone} cx={scaleX(point.x, content.xAxis, geometry)} cy={scaleY(point.y, content.yAxis, geometry)} r="5"><title>{point.label ?? `${series.label}: (${formatNumber(point.x)}, ${formatNumber(point.y)})`}</title></circle>)}</g>
              )
            })}
            {probeX === undefined ? null : <line className={css.probeLine} x1={scaleX(probeX, content.xAxis, geometry)} x2={scaleX(probeX, content.xAxis, geometry)} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />}
            {probeX === undefined ? null : probeValues.map((item, index) => <circle key={item.id} className={css.probePoint} data-tone={toneAt(item.tone, index)} cx={scaleX(probeX, content.xAxis, geometry)} cy={scaleY(item.y, content.yAxis, geometry)} r="5" />)}
          </g>
          <text className={css.axisLabel} x={geometry.left + geometry.plotWidth / 2} y={geometry.height - 6} textAnchor="middle">{content.xAxis.label ?? 'x'}</text>
          <text className={css.axisLabel} x="14" y={geometry.top + geometry.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${geometry.top + geometry.plotHeight / 2})`}>{content.yAxis.label ?? 'y'}</text>
        </svg>
        {!nothingToSee ? null : (
          <p className={css.emptyPlotNotice} role="note">{labels.noValuesInRange}</p>
        )}
        {probeX === undefined ? null : (
          <div className={css.probeCard} style={{ '--probe-x': `${normalizedPosition(probeX, content.xAxis.min, content.xAxis.max) * 100}%` } as CSSProperties} aria-hidden="true">
            <strong>x = {formatNumber(probeX)}</strong>
            {probeValues.map((item, index) => <span key={item.id} data-tone={toneAt(item.tone, index)}>{item.label}: {formatNumber(item.y)}</span>)}
          </div>
        )}
      </FigureViewport>
      <p className={shell.srOnly} role="status" aria-live="polite">
        {probeX === undefined ? '' : probeDescription}
      </p>
      <div className={css.seriesToggles} role="group" aria-label={labels.legendLabel}>
        {content.series.map((series, index) => (
          <button
            key={series.id}
            type="button"
            className={`${shell.control} ${css.seriesToggle}`}
            aria-pressed={!hiddenSeries.has(series.id)}
            data-tone={toneAt(series.tone, index)}
            data-series-type={series.type}
            data-stroke={'stroke' in series ? series.stroke ?? 'solid' : undefined}
            data-empty={emptySeriesIds.has(series.id) || undefined}
            title={emptySeriesIds.has(series.id) ? labels.seriesOutOfRange : undefined}
            onClick={() => toggleSeries(series.id)}
          >
            <span aria-hidden="true" />{series.label}
            {!emptySeriesIds.has(series.id) ? null : <small>{labels.seriesOutOfRange}</small>}
          </button>
        ))}
      </div>
      <div className={shell.selectionSlot}>
        <p className={shell.interactionHint}>{labels.plotInteractionHint}</p>
      </div>
    </div>
  )
}
