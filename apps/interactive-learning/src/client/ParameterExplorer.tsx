import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { evaluateMathExpression } from '../math-expression.ts'
import type { LearningJson, ParameterExplorerPayloadV1 } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import css from './LearningActivity.module.css'

type ParameterActivity = Extract<ActivityRendererProps['activity'], { kind: 'parameter_explorer' }>
type Parameter = ParameterExplorerPayloadV1['parameters'][number]

interface Domain {
  min: number
  max: number
}

interface ChartGeometry {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  plotWidth: number
  plotHeight: number
}

const MAX_RENDERABLE_VALUE = 1e12
const MAX_PARAMETER_DOMAIN_SAMPLES = 33

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map(value => Number(value.toPrecision(12))))]
}

function parameterCandidates(parameter: Parameter): number[] {
  const discreteSteps = Math.max(1, Math.ceil((parameter.max - parameter.min) / parameter.step))
  const sampleCount = Math.min(discreteSteps + 1, MAX_PARAMETER_DOMAIN_SAMPLES)
  const candidates = Array.from({ length: sampleCount }, (_, index) => {
    const stepIndex = sampleCount === 1 ? 0 : Math.round(index * discreteSteps / (sampleCount - 1))
    return Math.min(parameter.max, parameter.min + stepIndex * parameter.step)
  })
  return uniqueNumbers([
    ...candidates,
    parameter.min,
    parameter.max,
    parameter.initial,
    ...(parameter.min <= 0 && parameter.max >= 0 ? [0] : []),
  ])
}

function parameterStates(payload: ParameterExplorerPayloadV1): Array<Record<string, number>> {
  return payload.parameters.reduce<Array<Record<string, number>>>((states, parameter) => {
    const candidates = parameterCandidates(parameter)
    return states.flatMap(state => candidates.map(value => ({ ...state, [parameter.id]: value })))
  }, [{}])
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / power
  const multiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return multiple * power
}

function paddedYDomain(min: number, max: number): Domain {
  if (min === max) {
    const radius = Math.max(Math.abs(min) * 0.2, 1)
    return { min: min - radius, max: max + radius }
  }
  const span = max - min
  const padding = span * 0.08
  const step = niceStep((span + padding * 2) / 5)
  let domainMin = Math.floor((min - padding) / step) * step
  let domainMax = Math.ceil((max + padding) / step) * step
  if (domainMin === domainMax) {
    domainMin -= step
    domainMax += step
  }
  return { min: domainMin, max: domainMax }
}

function stableYDomain(payload: ParameterExplorerPayloadV1): Domain {
  const samples = Math.min(payload.xAxis.samples ?? 96, 96)
  let min = 0
  let max = 0
  let found = false

  for (const values of parameterStates(payload)) {
    for (let index = 0; index < samples; index += 1) {
      const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1)
      for (const curve of payload.curves) {
        const y = evaluateMathExpression(curve.expression, { ...values, x })
        if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE) continue
        min = found ? Math.min(min, y) : Math.min(0, y)
        max = found ? Math.max(max, y) : Math.max(0, y)
        found = true
      }
    }
  }

  if (!found) return { min: -1, max: 1 }
  return paddedYDomain(min, max)
}

function yDomainForState(
  payload: ParameterExplorerPayloadV1,
  values: Record<string, number>,
  stable: Domain,
): Domain {
  const samples = payload.xAxis.samples ?? 96
  let min = stable.min
  let max = stable.max
  let expanded = false
  for (let index = 0; index < samples; index += 1) {
    const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1)
    for (const curve of payload.curves) {
      const y = evaluateMathExpression(curve.expression, { ...values, x })
      if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE) continue
      if (y < min) {
        min = y
        expanded = true
      }
      if (y > max) {
        max = y
        expanded = true
      }
    }
  }
  return expanded ? paddedYDomain(min, max) : stable
}

function ticksFor(domain: Domain, targetCount = 5): number[] {
  const step = niceStep((domain.max - domain.min) / targetCount)
  const first = Math.ceil(domain.min / step) * step
  const ticks: number[] = []
  for (let value = first; value <= domain.max + step * 1e-8; value += step) {
    ticks.push(Number(value.toPrecision(12)))
  }
  return ticks
}

function chartGeometry(width: number): ChartGeometry {
  const safeWidth = Math.max(280, Math.round(width))
  const height = safeWidth < 480 ? 260 : 300
  const left = safeWidth < 360 ? 56 : 64
  const right = 18
  const top = 18
  const bottom = 40
  return {
    width: safeWidth,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth: safeWidth - left - right,
    plotHeight: height - top - bottom,
  }
}

function scaleX(value: number, domain: Domain, geometry: ChartGeometry): number {
  return geometry.left + (value - domain.min) / (domain.max - domain.min) * geometry.plotWidth
}

function scaleY(value: number, domain: Domain, geometry: ChartGeometry): number {
  return geometry.top + (domain.max - value) / (domain.max - domain.min) * geometry.plotHeight
}

function pathsFor(
  payload: ParameterExplorerPayloadV1,
  values: Record<string, number>,
  yDomain: Domain,
  geometry: ChartGeometry,
): string[] {
  const samples = payload.xAxis.samples ?? 96
  const xDomain = { min: payload.xAxis.min, max: payload.xAxis.max }
  const series = payload.curves.map(() => [] as Array<{ x: number; y: number }>)
  for (let index = 0; index < samples; index += 1) {
    const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1)
    for (const [curveIndex, curve] of payload.curves.entries()) {
      series[curveIndex]?.push({ x, y: evaluateMathExpression(curve.expression, { ...values, x }) })
    }
  }

  return series.map(points => {
    let open = false
    let previousY: number | null = null
    return points.map(point => {
      if (!Number.isFinite(point.y) || Math.abs(point.y) > MAX_RENDERABLE_VALUE) {
        open = false
        previousY = null
        return ''
      }
      const px = scaleX(point.x, xDomain, geometry)
      const py = scaleY(point.y, yDomain, geometry)
      if (previousY !== null && Math.abs(py - previousY) > geometry.plotHeight * 1.5) open = false
      const command = open ? 'L' : 'M'
      open = true
      previousY = py
      return `${command}${px.toFixed(2)},${py.toFixed(2)}`
    }).filter(Boolean).join(' ')
  })
}

function rangeStyle(parameter: Parameter, value: number): CSSProperties {
  const span = parameter.max - parameter.min
  const valuePercent = (value - parameter.min) / span * 100
  const anchorValue = parameter.min <= 0 && parameter.max >= 0 ? 0 : parameter.min
  const anchorPercent = (anchorValue - parameter.min) / span * 100
  return {
    '--range-low': `${Math.min(valuePercent, anchorPercent)}%`,
    '--range-high': `${Math.max(valuePercent, anchorPercent)}%`,
  } as CSSProperties
}

function shiftedValue(parameter: Parameter, current: number, direction: -1 | 1): number {
  const shifted = current + parameter.step * direction
  const clamped = Math.min(parameter.max, Math.max(parameter.min, shifted))
  return Number(clamped.toPrecision(12))
}

/** V2 current-frame parameter visual. It deliberately owns no teaching prompt or answer. */
export function ParameterRoundVisual({
  payload, disabled, t,
}: {
  payload: Pick<ParameterExplorerPayloadV1, 'parameters' | 'xAxis' | 'curves'>
  disabled: boolean
  t: ActivityRendererProps['t']
}) {
  const chartId = useId()
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(
    payload.parameters.map(parameter => [parameter.id, parameter.initial]),
  ))
  const fullPayload: ParameterExplorerPayloadV1 = payload
  const stableDomain = useMemo(() => stableYDomain(fullPayload), [fullPayload])
  const yDomain = useMemo(() => yDomainForState(fullPayload, values, stableDomain), [fullPayload, stableDomain, values])
  const geometry = useMemo(() => chartGeometry(640), [])
  const paths = useMemo(() => pathsFor(fullPayload, values, yDomain, geometry), [fullPayload, geometry, values, yDomain])
  const description = t('chartDescription', {
    parameters: payload.parameters.map(parameter => `${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)}`).join('; '),
    xAxis: `${payload.xAxis.label ?? 'x'} ${formatNumber(payload.xAxis.min)}–${formatNumber(payload.xAxis.max)}`,
    yAxis: `y ${formatNumber(yDomain.min)}–${formatNumber(yDomain.max)}`,
    curves: payload.curves.map(curve => curve.label).join('; '),
  })
  return (
    <div className={css.explorer}>
      <div className={css.controls}>
        {payload.parameters.map(parameter => {
          const value = values[parameter.id] ?? parameter.initial
          const inputId = `${chartId}-${parameter.id}`
          return (
            <div className={css.rangeField} key={parameter.id}>
              <div className={css.rangeHeader}>
                <label htmlFor={inputId}>{parameter.label}</label>
                <output htmlFor={inputId} aria-live="polite">{formatNumber(value)}</output>
              </div>
              <input
                id={inputId}
                className={css.rangeInput}
                style={rangeStyle(parameter, value)}
                type="range"
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={value}
                disabled={disabled}
                onChange={event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) }))}
              />
            </div>
          )
        })}
      </div>
      <div className={css.chartRegion}>
        <ul className={css.legend}>{payload.curves.map((curve, index) => <li key={curve.id} data-curve={index}>{curve.label}</li>)}</ul>
        <svg className={css.chart} viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
          <title id={`${chartId}-title`}>{t('chartLabel')}</title>
          <desc id={`${chartId}-description`}>{description}</desc>
          <rect className={css.plotFrame} x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} rx="6" />
          {paths.map((path, index) => <path className={css.curve} data-curve={index} key={payload.curves[index]?.id} d={path} />)}
        </svg>
      </div>
    </div>
  )
}

export function ParameterExplorer({ activity, busy, onSubmit, t }: ActivityRendererProps<ParameterActivity>) {
  const payload = activity.payload
  const chartId = useId()
  const chartContainer = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(640)
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(
    payload.parameters.map(parameter => [parameter.id, parameter.initial]),
  ))
  const [answer, setAnswer] = useState('')
  const stableDomain = useMemo(() => stableYDomain(payload), [payload])
  const yDomain = useMemo(() => yDomainForState(payload, values, stableDomain), [payload, stableDomain, values])
  const geometry = useMemo(() => chartGeometry(chartWidth), [chartWidth])
  const xDomain = useMemo(() => ({ min: payload.xAxis.min, max: payload.xAxis.max }), [payload.xAxis.max, payload.xAxis.min])
  const xTicks = useMemo(() => ticksFor(xDomain), [xDomain])
  const yTicks = useMemo(() => ticksFor(yDomain), [yDomain])
  const paths = useMemo(() => pathsFor(payload, values, yDomain, geometry), [geometry, payload, values, yDomain])
  const chartDescription = t('chartDescription', {
    parameters: payload.parameters.map(parameter => (
      `${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)} (${formatNumber(parameter.min)}–${formatNumber(parameter.max)})`
    )).join('; '),
    xAxis: `${payload.xAxis.label ?? 'x'} ${formatNumber(xDomain.min)}–${formatNumber(xDomain.max)}`,
    yAxis: `y ${formatNumber(yDomain.min)}–${formatNumber(yDomain.max)}`,
    curves: payload.curves.map(curve => curve.label).join('; '),
  })

  useEffect(() => {
    const container = chartContainer.current
    if (!container) return
    const updateWidth = (width: number): void => {
      if (width >= 280) setChartWidth(current => Math.abs(current - width) < 1 ? current : width)
    }
    updateWidth(container.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) updateWidth(entry.contentRect.width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const setParameter = (parameter: Parameter, value: number): void => {
    setValues(current => ({ ...current, [parameter.id]: value }))
  }
  const submit = (): void => {
    const parameters = { ...values } as LearningJson
    onSubmit({
      answer: { parameters, explanation: answer.trim() },
      interactionState: { parameters },
    })
  }

  return (
    <div className={css.activityContent}>
      <p className={css.prompt}>{payload.question ?? activity.prompt}</p>
      <div className={css.explorer}>
        <div className={css.controls}>
          {payload.parameters.map(parameter => {
            const value = values[parameter.id] ?? parameter.initial
            const inputId = `${chartId}-${parameter.id}`
            const zeroPercent = (0 - parameter.min) / (parameter.max - parameter.min) * 100
            return (
              <div className={css.rangeField} key={parameter.id}>
                <div className={css.rangeHeader}>
                  <label htmlFor={inputId}>{parameter.label}</label>
                  <output htmlFor={inputId} aria-live="polite">{formatNumber(value)}</output>
                </div>
                <div className={css.rangeControl}>
                  <button
                    className={css.stepButton}
                    type="button"
                    disabled={busy || value <= parameter.min}
                    aria-label={t('decreaseParameter', { label: parameter.label })}
                    onClick={() => setParameter(parameter, shiftedValue(parameter, value, -1))}
                  >−</button>
                  <input
                    id={inputId}
                    className={css.rangeInput}
                    style={rangeStyle(parameter, value)}
                    type="range"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={value}
                    disabled={busy}
                    aria-valuetext={formatNumber(value)}
                    onChange={event => setParameter(parameter, Number(event.target.value))}
                  />
                  <button
                    className={css.stepButton}
                    type="button"
                    disabled={busy || value >= parameter.max}
                    aria-label={t('increaseParameter', { label: parameter.label })}
                    onClick={() => setParameter(parameter, shiftedValue(parameter, value, 1))}
                  >+</button>
                  <div className={css.rangeEnds} aria-hidden="true">
                    <span>{formatNumber(parameter.min)}</span>
                    {parameter.min < 0 && parameter.max > 0 ? (
                      <span className={css.rangeZero} style={{ left: `${zeroPercent}%` }}>0</span>
                    ) : null}
                    <span>{formatNumber(parameter.max)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className={css.chartRegion} ref={chartContainer}>
          <ul className={css.legend}>
            {payload.curves.map((curve, index) => <li key={curve.id} data-curve={index}>{curve.label}</li>)}
          </ul>
          <svg
            className={css.chart}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            role="img"
            aria-labelledby={`${chartId}-title ${chartId}-description`}
          >
            <title id={`${chartId}-title`}>{t('chartLabel')}</title>
            <desc id={`${chartId}-description`}>{chartDescription}</desc>
            <defs>
              <clipPath id={`${chartId}-clip`}>
                <rect x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
              </clipPath>
            </defs>
            <rect
              className={css.plotFrame}
              x={geometry.left}
              y={geometry.top}
              width={geometry.plotWidth}
              height={geometry.plotHeight}
              rx="6"
            />
            {yTicks.map(tick => {
              const y = scaleY(tick, yDomain, geometry)
              return (
                <g key={`y-${tick}`}>
                  <line
                    className={tick === 0 ? `${css.gridLine} ${css.zeroAxis}` : css.gridLine}
                    x1={geometry.left}
                    x2={geometry.left + geometry.plotWidth}
                    y1={y}
                    y2={y}
                  />
                  <text className={css.tickLabel} x={geometry.left - 9} y={y} textAnchor="end" dominantBaseline="middle">
                    {formatNumber(tick)}
                  </text>
                </g>
              )
            })}
            {xTicks.map(tick => {
              const x = scaleX(tick, xDomain, geometry)
              return (
                <g key={`x-${tick}`}>
                  <line
                    className={tick === 0 ? `${css.gridLine} ${css.zeroAxis}` : css.gridLine}
                    x1={x}
                    x2={x}
                    y1={geometry.top}
                    y2={geometry.top + geometry.plotHeight}
                  />
                  <text className={css.tickLabel} x={x} y={geometry.top + geometry.plotHeight + 20} textAnchor="middle">
                    {formatNumber(tick)}
                  </text>
                </g>
              )
            })}
            <text
              className={css.axisLabel}
              data-axis="y"
              x={geometry.left}
              y={geometry.top - 7}
              textAnchor="start"
            >y</text>
            <text
              className={css.axisLabel}
              data-axis="x"
              x={geometry.left + geometry.plotWidth}
              y={geometry.height - 5}
              textAnchor="end"
            >{payload.xAxis.label ?? 'x'}</text>
            <g clipPath={`url(#${chartId}-clip)`}>
              {paths.map((path, index) => (
                <path className={css.curve} data-curve={index} key={payload.curves[index]?.id} d={path} />
              ))}
            </g>
          </svg>
        </div>
      </div>
      <label className={css.answerField}>
        <span>{t('answer')}</span>
        <textarea
          value={answer}
          disabled={busy}
          placeholder={t('answerPlaceholder')}
          onChange={event => setAnswer(event.target.value)}
        />
      </label>
      <div className={css.primaryRow}>
        <button className={css.primaryButton} type="button" disabled={busy || answer.trim() === ''} onClick={submit}>
          {busy ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  )
}
