import { useMemo, useState } from 'react'
import { evaluateMathExpression } from '../math-expression.ts'
import type { LearningJson, ParameterExplorerPayloadV1 } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import css from './LearningActivity.module.css'

type ParameterActivity = Extract<ActivityRendererProps['activity'], { kind: 'parameter_explorer' }>

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
}

function pathsFor(payload: ParameterExplorerPayloadV1, values: Record<string, number>): string[] {
  const samples = payload.xAxis.samples ?? 96
  const series = payload.curves.map(() => [] as Array<{ x: number; y: number }>)
  const finiteY: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1)
    for (const [curveIndex, curve] of payload.curves.entries()) {
      const y = evaluateMathExpression(curve.expression, { ...values, x })
      series[curveIndex]?.push({ x, y })
      if (Number.isFinite(y) && Math.abs(y) <= 1e12) finiteY.push(y)
    }
  }
  if (finiteY.length === 0) return series.map(() => '')
  let minY = Math.min(...finiteY)
  let maxY = Math.max(...finiteY)
  if (minY === maxY) {
    minY -= 1
    maxY += 1
  }
  const width = 640
  const height = 220
  return series.map(points => {
    let open = false
    return points.map(point => {
      if (!Number.isFinite(point.y) || Math.abs(point.y) > 1e12) {
        open = false
        return ''
      }
      const px = (point.x - payload.xAxis.min) / (payload.xAxis.max - payload.xAxis.min) * width
      const py = height - (point.y - minY) / (maxY - minY) * height
      const command = open ? 'L' : 'M'
      open = true
      return `${command}${px.toFixed(2)},${py.toFixed(2)}`
    }).filter(Boolean).join(' ')
  })
}

export function ParameterExplorer({ activity, busy, onSubmit, t }: ActivityRendererProps<ParameterActivity>) {
  const payload = activity.payload
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(
    payload.parameters.map(parameter => [parameter.id, parameter.initial]),
  ))
  const [answer, setAnswer] = useState('')
  const [prediction, setPrediction] = useState('')
  const [predictionCommitted, setPredictionCommitted] = useState(false)
  const paths = useMemo(() => pathsFor(payload, values), [payload, values])
  const submit = (): void => {
    const parameters = { ...values } as LearningJson
    onSubmit({
      answer: { prediction: prediction.trim(), parameters, explanation: answer.trim() },
      interactionState: { prediction: prediction.trim(), predictionCommitted, parameters },
    })
  }

  return (
    <div className={css.activityContent}>
      <p className={css.prompt}>{payload.question ?? activity.prompt}</p>
      <section className={css.predictionGate} aria-labelledby="parameter-prediction-title">
        <label className={css.answerField}>
          <strong id="parameter-prediction-title">{t('predict')}</strong>
          <span>{t('parameterPredictionPrompt')}</span>
          <textarea
            value={prediction}
            disabled={busy || predictionCommitted}
            placeholder={t('parameterPredictionPlaceholder')}
            onChange={event => setPrediction(event.target.value)}
          />
        </label>
        {predictionCommitted ? (
          <p className={css.predictionStatus} role="status">{t('predictionCommitted')}</p>
        ) : (
          <div className={css.primaryRow}>
            <button
              className={css.primaryButton}
              type="button"
              disabled={busy || prediction.trim() === ''}
              onClick={() => setPredictionCommitted(true)}
            >
              {t('commitPrediction')}
            </button>
          </div>
        )}
      </section>
      <div className={css.explorerGrid} aria-disabled={!predictionCommitted}>
        <div className={css.controls}>
          {payload.parameters.map(parameter => (
            <label className={css.rangeField} key={parameter.id}>
              <span>{t('rangeValue', { label: parameter.label, value: formatNumber(values[parameter.id] ?? parameter.initial) })}</span>
              <input
                type="range"
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={values[parameter.id] ?? parameter.initial}
                disabled={busy || !predictionCommitted}
                aria-valuetext={formatNumber(values[parameter.id] ?? parameter.initial)}
                onChange={event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) }))}
              />
              <span className={css.rangeEnds}><span>{formatNumber(parameter.min)}</span><span>{formatNumber(parameter.max)}</span></span>
            </label>
          ))}
          <ul className={css.legend}>
            {payload.curves.map((curve, index) => <li key={curve.id} data-curve={index}>{curve.label}</li>)}
          </ul>
        </div>
        <svg className={css.chart} viewBox="0 0 640 220" role="img" aria-label={t('chartLabel')} aria-hidden={!predictionCommitted}>
          <line className={css.axis} x1="0" x2="640" y1="110" y2="110" />
          <line className={css.axis} x1="320" x2="320" y1="0" y2="220" />
          {paths.map((path, index) => <path className={css.curve} data-curve={index} key={payload.curves[index]?.id} d={path} />)}
        </svg>
      </div>
      <label className={css.answerField}>
        <span>{t('answer')}</span>
        <textarea
          value={answer}
          disabled={busy || !predictionCommitted}
          placeholder={t('answerPlaceholder')}
          onChange={event => setAnswer(event.target.value)}
        />
      </label>
      <div className={css.primaryRow}>
        <button className={css.primaryButton} type="button" disabled={busy || !predictionCommitted || answer.trim() === ''} onClick={submit}>
          {busy ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  )
}
