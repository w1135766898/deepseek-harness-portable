import {
  Component,
  createContext,
  useEffect,
  useId,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ErrorInfo,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { evaluateMathExpression } from '../math-expression.ts'
import type { LearningVisualV4 as LearningVisualV4Definition } from '../protocol.ts'
import css from './LearningVisualV4.module.css'

type VisualContent = LearningVisualV4Definition['content']
type PlotContent = Extract<VisualContent, { kind: 'plot' }>
type NodeLinkContent = Extract<VisualContent, { kind: 'node_link' }>
type Scene2DContent = Extract<VisualContent, { kind: 'scene_2d' }>
type RelationContent = Extract<VisualContent, { kind: 'relation' }>
type TimelineContent = Extract<VisualContent, { kind: 'timeline' }>
type FormulaStepsContent = Extract<VisualContent, { kind: 'formula_steps' }>
type StudyMapContent = Extract<VisualContent, { kind: 'study_map' }>
type RecallDeckContent = Extract<VisualContent, { kind: 'recall_deck' }>
type VisualTone = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray'

export interface LearningVisualV4Labels {
  eyebrow: string
  errorTitle: string
  errorContinue: string
  sequenceLabel: string
  previousStep: string
  nextStep: string
  reset: string
  chartProbeHint: string
  metricsLabel: string
  legendLabel: string
  plotInteractionHint: string
  nodeLinkSummary: string
  connection: string
  layerLabel: string
  edgeLabel: string
  nodeLinkInteractionHint: string
  nodeKind: string
  edgeKind: string
  noDetail: string
  closeDetail: string
  elementFallback: string
  sceneSummary: string
  sceneInteractionHint: string
  elementKind: string
  comparisonCaption: string
  comparisonDimension: string
  comparisonSubject: string
  comparisonInteractionHint: string
  matrixCaption: string
  matrixAxes: string
  noRelation: string
  matrixInteractionHint: string
  setsLabel: string
  noExclusiveItems: string
  intersections: string
  uncategorized: string
  setsInteractionHint: string
  timelineLabel: string
  timelineEventKind: string
  timelineEraKind: string
  timelineInteractionHint: string
  formulaLabel: string
  formulaProgress: string
  formulaRule: string
  formulaConclusion: string
  revealNextFormulaStep: string
  formulaComplete: string
  formulaInteractionHint: string
  studySource: string
  studyGoal: string
  studySections: string
  studyConcepts: string
  studyAnchor: string
  studySummary: string
  prerequisite: string
  noPrerequisite: string
  roleFoundation: string
  roleCore: string
  roleExtension: string
  rolePractice: string
  studyInteractionHint: string
  recallDeckLabel: string
  recallProgress: string
  recallPrompt: string
  recallHint: string
  recallAnswer: string
  showHint: string
  showAnswer: string
  previousCard: string
  nextCard: string
  resetDeck: string
  mastered: string
  reviewAgain: string
  unrated: string
  recallStatus: string
  recallInteractionHint: string
}

const DEFAULT_LABELS: LearningVisualV4Labels = {
  eyebrow: '交互可视化',
  errorTitle: '视觉组件暂时无法显示',
  errorContinue: '你仍可继续阅读上下文。',
  sequenceLabel: '视觉讲解步骤',
  previousStep: '上一步',
  nextStep: '下一步',
  reset: '重置',
  chartProbeHint: '图表，按左右方向键开始探查数值',
  metricsLabel: '当前指标',
  legendLabel: '图例与系列显示',
  plotInteractionHint: '鼠标移入图表可探查数值；键盘聚焦图表后可用 ← → 移动。',
  nodeLinkSummary: '{nodes} 个节点，{edges} 条连线。',
  connection: '{from} 到 {to}',
  layerLabel: '第 {index} 层',
  edgeLabel: '连线',
  nodeLinkInteractionHint: '选择节点或连线查看解释；键盘可用 Tab 与 Enter 操作。',
  nodeKind: '节点',
  edgeKind: '连线',
  noDetail: '暂无补充说明。',
  closeDetail: '关闭详细说明',
  elementFallback: '图元 {id}',
  sceneSummary: '二维场景，{elements} 个图元。{labels}',
  sceneInteractionHint: '选择图中的点、线或形状查看说明。',
  elementKind: '图元',
  comparisonCaption: '特征对比表',
  comparisonDimension: '对比维度',
  comparisonSubject: '对比对象',
  comparisonInteractionHint: '按行阅读可对比同一维度；选择表头可查看补充说明。',
  matrixCaption: '关系矩阵',
  matrixAxes: '行 ↓ / 列 →',
  noRelation: '无关系',
  matrixInteractionHint: '从行与列的交点读取关系；选择单元格可查看细节。',
  setsLabel: '集合关系图',
  noExclusiveItems: '无独有项',
  intersections: '交集 / 共有',
  uncategorized: '未归类',
  setsInteractionHint: '单一归属项在各集合内，多重归属项在交集区。',
  timelineLabel: '时间线',
  timelineEventKind: '事件',
  timelineEraKind: '时期',
  timelineInteractionHint: '选择事件或时期可查看补充说明。',
  formulaLabel: '公式推导',
  formulaProgress: '第 {current} / {total} 步',
  formulaRule: '规则',
  formulaConclusion: '结论',
  revealNextFormulaStep: '显示下一步',
  formulaComplete: '推导已完成',
  formulaInteractionHint: '先预测下一步，再逐步揭示变形规则。',
  studySource: '学习来源',
  studyGoal: '学习目标',
  studySections: '来源章节',
  studyConcepts: '本节概念',
  studyAnchor: '位置',
  studySummary: '摘要',
  prerequisite: '前置概念',
  noPrerequisite: '无',
  roleFoundation: '基础',
  roleCore: '核心',
  roleExtension: '拓展',
  rolePractice: '练习',
  studyInteractionHint: '按来源章节导览，选择概念查看作用、前置关系与详细说明。',
  recallDeckLabel: '回忆卡组',
  recallProgress: '第 {current} / {total} 张',
  recallPrompt: '问题',
  recallHint: '提示',
  recallAnswer: '答案',
  showHint: '查看提示',
  showAnswer: '显示答案',
  previousCard: '上一张',
  nextCard: '下一张',
  resetDeck: '重置卡组',
  mastered: '已掌握',
  reviewAgain: '待复习',
  unrated: '未标记',
  recallStatus: '掌握 {mastered} · 待复习 {review}',
  recallInteractionHint: '先在心中回答，再查看提示和答案，最后标记掌握状态。',
}

const VisualLabelsContext = createContext<LearningVisualV4Labels>(DEFAULT_LABELS)

function useVisualLabels(): LearningVisualV4Labels {
  return useContext(VisualLabelsContext)
}

function labelTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-z]+)\}/gi, (match, key: string) => values[key] === undefined ? match : String(values[key]))
}

function displayMath(expression: string): string {
  const value = expression.trim()
    .replaceAll('′', "'")
    .replaceAll('−', '-')
    .replaceAll('²', '^{2}')
    .replaceAll('³', '^{3}')
    .replaceAll('→', '\\to ')
    .replaceAll('≤', '\\le ')
    .replaceAll('≥', '\\ge ')
    .replaceAll('≠', '\\ne ')
    .replaceAll('×', '\\times ')
    .replaceAll('÷', '\\div ')
    .replaceAll('∞', '\\infty ')
    .replace(/\blim\s*\[([^\]]+)\]/g, '\\lim_{$1}')
  if ((value.startsWith('$$') && value.endsWith('$$')) || (value.startsWith('\\[') && value.endsWith('\\]'))) return value
  return `$$\n${value}\n$$`
}

interface RendererProps<T extends VisualContent = VisualContent> {
  content: T
  focusedIds: ReadonlySet<string>
  storageKey?: string
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

interface Point {
  x: number
  y: number
}

interface NodePosition extends Point {
  id: string
}

interface SelectedItem {
  id: string
  label: string
  detail?: string
  kind: 'node' | 'edge' | 'element'
}

const DEFAULT_TONES: readonly VisualTone[] = ['blue', 'red', 'green', 'orange', 'purple', 'gray']
const SVG_MIN_WIDTH = 560

function formatNumber(value: number, digits?: number): string {
  if (!Number.isFinite(value)) return '—'
  if (digits !== undefined) return value.toFixed(digits)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toPrecision(6)))
}

function normalizedPosition(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

function interpolate(min: number, max: number, ratio: number): number {
  return min + (max - min) * Math.max(0, Math.min(1, ratio))
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / power
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power
}

function ticks(min: number, max: number, target = 6): number[] {
  const step = niceStep((max - min) / target)
  const first = Math.ceil(min / step) * step
  const values: number[] = []
  for (let value = first, index = 0; value <= max && index < target * 4; value += step, index += 1) {
    values.push(Number(value.toPrecision(12)))
  }
  return values.length > 0 ? values : [min, max]
}

function toneAt(tone: string | undefined, index = 0): VisualTone {
  if (tone === 'blue' || tone === 'green' || tone === 'red' || tone === 'orange'
    || tone === 'purple' || tone === 'gray') return tone
  return DEFAULT_TONES[index % DEFAULT_TONES.length] ?? 'blue'
}

function strokeDash(stroke: string | undefined): string | undefined {
  if (stroke === 'dashed') return '9 6'
  if (stroke === 'dotted') return '2 6'
  return undefined
}

function focusState(id: string, focusedIds: ReadonlySet<string>): 'focus' | 'dim' | undefined {
  if (focusedIds.size === 0) return undefined
  return focusedIds.has(id) ? 'focus' : 'dim'
}

function relatedFocusState(id: string, relatedIds: readonly (string | undefined)[], focusedIds: ReadonlySet<string>): 'focus' | 'dim' | undefined {
  if (focusedIds.size === 0) return undefined
  return focusedIds.has(id) || relatedIds.some(relatedId => relatedId !== undefined && focusedIds.has(relatedId)) ? 'focus' : 'dim'
}

function activateWithKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

function useContainerWidth(minimum = 280): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(760)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const update = (next: number): void => {
      if (next >= minimum) setWidth(current => Math.abs(current - next) < 1 ? current : next)
    }
    update(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry !== undefined) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [minimum])
  return [ref, width]
}

function chartGeometry(containerWidth: number, minWidth = SVG_MIN_WIDTH): ChartGeometry {
  const width = Math.max(minWidth, Math.round(containerWidth))
  const height = width < 700 ? 350 : 390
  const left = 62
  const right = 22
  const top = 24
  const bottom = 58
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

function scaleX(value: number, axis: PlotContent['xAxis'] | Scene2DContent['xAxis'], geometry: ChartGeometry): number {
  return geometry.left + normalizedPosition(value, axis.min, axis.max) * geometry.plotWidth
}

function scaleY(value: number, axis: PlotContent['yAxis'] | Scene2DContent['yAxis'], geometry: ChartGeometry): number {
  return geometry.top + (1 - normalizedPosition(value, axis.min, axis.max)) * geometry.plotHeight
}

class VisualErrorBoundary extends Component<{
  children: ReactNode
  fallbackMarkdown?: string
  labels: LearningVisualV4Labels
}, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Learning visual renderer failed', error, info)
  }

  render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <div className={css.errorFallback} role="alert">
        <strong>{this.props.labels.errorTitle}</strong>
        {this.props.fallbackMarkdown === undefined
          ? <span>{this.props.labels.errorContinue}</span>
          : <pre>{this.props.fallbackMarkdown}</pre>}
      </div>
    )
  }
}

function SequenceController({
  sequence,
  frameIndex,
  onFrameChange,
}: {
  sequence: NonNullable<LearningVisualV4Definition['sequence']>
  frameIndex: number
  onFrameChange: (index: number) => void
}) {
  const labels = useVisualLabels()
  const frame = sequence.frames[frameIndex]
  const initialIndex = Math.max(0, sequence.frames.findIndex(item => item.id === sequence.initialFrameId))
  const move = (delta: number): void => {
    onFrameChange(Math.max(0, Math.min(sequence.frames.length - 1, frameIndex + delta)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      onFrameChange(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onFrameChange(sequence.frames.length - 1)
    }
  }
  return (
    <div className={css.sequence} onKeyDown={onKeyDown} aria-label={labels.sequenceLabel}>
      <div className={css.sequenceText} aria-live="polite" aria-atomic="true">
        <span>{frameIndex + 1} / {sequence.frames.length}</span>
        <strong>{frame?.label}</strong>
        {frame?.description === undefined ? null : <p>{frame.description}</p>}
      </div>
      <div className={css.sequenceActions}>
        <button type="button" onClick={() => move(-1)} disabled={frameIndex === 0} aria-label={labels.previousStep}>
          <span aria-hidden="true">←</span><span>{labels.previousStep}</span>
        </button>
        <button type="button" onClick={() => move(1)} disabled={frameIndex >= sequence.frames.length - 1} aria-label={labels.nextStep}>
          <span>{labels.nextStep}</span><span aria-hidden="true">→</span>
        </button>
        <button type="button" onClick={() => onFrameChange(initialIndex)} disabled={frameIndex === initialIndex}>
          {labels.reset}
        </button>
      </div>
    </div>
  )
}

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

function plotCurvePath(
  series: Extract<PlotContent['series'][number], { type: 'curve' }>,
  content: PlotContent,
  values: Readonly<Record<string, number>>,
  geometry: ChartGeometry,
): string {
  const samples = content.xAxis.samples ?? 160
  const commands: string[] = []
  let drawing = false
  let previousY: number | undefined
  for (let index = 0; index < samples; index += 1) {
    const x = interpolate(content.xAxis.min, content.xAxis.max, index / Math.max(1, samples - 1))
    const y = evaluateMathExpression(series.expression, { ...values, x })
    if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
      drawing = false
      previousY = undefined
      continue
    }
    const px = scaleX(x, content.xAxis, geometry)
    const py = scaleY(y, content.yAxis, geometry)
    if (previousY !== undefined && Math.abs(previousY - py) > geometry.plotHeight * 2) drawing = false
    commands.push(`${drawing ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`)
    drawing = true
    previousY = py
  }
  return commands.join(' ')
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
  const ordered = [...points].sort((a, b) => a.x - b.x)
  if (ordered.length === 0) return undefined
  if (x <= (ordered[0]?.x ?? x)) return ordered[0]?.y
  if (x >= (ordered.at(-1)?.x ?? x)) return ordered.at(-1)?.y
  for (let index = 1; index < ordered.length; index += 1) {
    const right = ordered[index]
    const left = ordered[index - 1]
    if (left !== undefined && right !== undefined && x <= right.x) {
      return interpolate(left.y, right.y, normalizedPosition(x, left.x, right.x))
    }
  }
  return undefined
}

function PlotRenderer({ content, focusedIds, storageKey }: RendererProps<PlotContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [regionRef, containerWidth] = useContainerWidth()
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

  const curvePaths = useMemo(() => content.series.flatMap(series => series.type === 'curve'
    ? [{ id: series.id, path: plotCurvePath(series, content, values, geometry) }]
    : []), [content, geometry, values])
  const visibleSeries = content.series.filter(series => !hiddenSeries.has(series.id))
  const probeValues = probeX === undefined ? [] : visibleSeries.flatMap(series => {
    let y: number | undefined
    if (series.type === 'curve') y = evaluateMathExpression(series.expression, { ...values, x: probeX })
    else if (series.type === 'line') y = interpolatedLineValue(series.points, probeX)
    else y = nearestPointValue(series.points, probeX)
    return y === undefined || !Number.isFinite(y) ? [] : [{ id: series.id, label: series.label, y, tone: series.tone }]
  })
  const chartDescription = `${content.xAxis.label ?? 'x'} ${formatNumber(content.xAxis.min)}–${formatNumber(content.xAxis.max)}; ${content.yAxis.label ?? 'y'} ${formatNumber(content.yAxis.min)}–${formatNumber(content.yAxis.max)}; ${content.series.map(series => series.label).join(', ')}`
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
    <div className={css.plotRenderer}>
      {parameters.length === 0 ? null : (
        <div className={css.parameterGrid}>
          {parameters.map(parameter => {
            const value = values[parameter.id] ?? parameter.initial
            const inputId = `${id}-${parameter.id}`
            const progress = normalizedPosition(value, parameter.min, parameter.max) * 100
            return (
              <label className={css.parameter} key={parameter.id} htmlFor={inputId} data-visual-id={parameter.id} data-focus-state={focusState(parameter.id, focusedIds)}>
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
            <div key={metric.id} data-visual-id={metric.id} data-focus-state={focusState(metric.id, focusedIds)}>
              <dt>{metric.label}</dt>
              <dd>{formatNumber(evaluateMathExpression(metric.expression, values), metric.digits)}{metric.suffix ?? ''}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className={css.chartViewport} ref={regionRef}>
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
            return <g key={`y-${String(value)}`}><line className={css.gridLine} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={y} y2={y} /><text className={css.tickLabel} x={geometry.left - 10} y={y} textAnchor="end" dominantBaseline="middle">{formatNumber(value)}</text></g>
          })}
          {xTicks.map(value => {
            const x = scaleX(value, content.xAxis, geometry)
            return <g key={`x-${String(value)}`}><line className={css.gridLine} x1={x} x2={x} y1={geometry.top} y2={geometry.top + geometry.plotHeight} /><text className={css.tickLabel} x={x} y={geometry.top + geometry.plotHeight + 22} textAnchor="middle">{formatNumber(value)}</text></g>
          })}
          <g clipPath={`url(#${id}-plot-clip)`}>
            {content.series.map((series, seriesIndex) => {
              if (hiddenSeries.has(series.id)) return null
              const tone = toneAt(series.tone, seriesIndex)
              const state = focusState(series.id, focusedIds)
              if (series.type === 'curve') return (
                <path key={series.id} className={css.seriesLine} data-tone={tone} data-focus-state={state} data-visual-id={series.id} data-stroke={series.stroke ?? 'solid'} d={curvePaths.find(item => item.id === series.id)?.path} />
              )
              if (series.type === 'line') return (
                <path key={series.id} className={css.seriesLine} data-tone={tone} data-focus-state={state} data-visual-id={series.id} data-stroke={series.stroke ?? 'solid'} d={pointsPath(series.points, content, geometry)} />
              )
              if (series.type === 'bars') {
                const sortedXs = series.points.map(point => scaleX(point.x, content.xAxis, geometry)).sort((a, b) => a - b)
                const smallestGap = sortedXs.slice(1).reduce((gap, x, index) => Math.min(gap, x - (sortedXs[index] ?? x)), geometry.plotWidth / Math.max(1, sortedXs.length))
                const barWidth = Math.max(6, Math.min(44, smallestGap * 0.68))
                const zeroY = scaleY(Math.max(content.yAxis.min, Math.min(content.yAxis.max, 0)), content.yAxis, geometry)
                return <g key={series.id} data-visual-id={series.id} data-focus-state={state}>{series.points.map((point, pointIndex) => {
                  const x = scaleX(point.x, content.xAxis, geometry)
                  const y = scaleY(point.y, content.yAxis, geometry)
                  return <rect key={`${series.id}-${String(pointIndex)}`} className={css.seriesBar} data-tone={tone} x={x - barWidth / 2} y={Math.min(y, zeroY)} width={barWidth} height={Math.max(1, Math.abs(zeroY - y))}><title>{point.label ?? `${series.label}: ${formatNumber(point.y)}`}</title></rect>
                })}</g>
              }
              return (
                <g key={series.id} data-visual-id={series.id} data-focus-state={state}>{series.points.map((point, pointIndex) => <circle key={`${series.id}-${String(pointIndex)}`} className={css.seriesPoint} data-tone={tone} cx={scaleX(point.x, content.xAxis, geometry)} cy={scaleY(point.y, content.yAxis, geometry)} r="5.5"><title>{point.label ?? `${series.label}: (${formatNumber(point.x)}, ${formatNumber(point.y)})`}</title></circle>)}</g>
              )
            })}
            {probeX === undefined ? null : <line className={css.probeLine} x1={scaleX(probeX, content.xAxis, geometry)} x2={scaleX(probeX, content.xAxis, geometry)} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />}
            {probeX === undefined ? null : probeValues.map((item, index) => <circle key={item.id} className={css.probePoint} data-tone={toneAt(item.tone, index)} cx={scaleX(probeX, content.xAxis, geometry)} cy={scaleY(item.y, content.yAxis, geometry)} r="5" />)}
          </g>
          <text className={css.axisLabel} x={geometry.left + geometry.plotWidth / 2} y={geometry.height - 7} textAnchor="middle">{content.xAxis.label ?? 'x'}</text>
          <text className={css.axisLabel} x="16" y={geometry.top + geometry.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 16 ${geometry.top + geometry.plotHeight / 2})`}>{content.yAxis.label ?? 'y'}</text>
        </svg>
        {probeX === undefined ? null : (
          <div className={css.probeCard} style={{ '--probe-x': `${normalizedPosition(probeX, content.xAxis.min, content.xAxis.max) * 100}%` } as CSSProperties} aria-hidden="true">
            <strong>x = {formatNumber(probeX)}</strong>
            {probeValues.map((item, index) => <span key={item.id} data-tone={toneAt(item.tone, index)}>{item.label}: {formatNumber(item.y)}</span>)}
          </div>
        )}
      </div>
      <div className={css.seriesToggles} aria-label={labels.legendLabel}>
        {content.series.map((series, index) => (
          <button key={series.id} type="button" aria-pressed={!hiddenSeries.has(series.id)} data-tone={toneAt(series.tone, index)} data-series-type={series.type} data-stroke={'stroke' in series ? series.stroke ?? 'solid' : undefined} onClick={() => toggleSeries(series.id)}>
            <span aria-hidden="true" />{series.label}
          </button>
        ))}
      </div>
      <p className={css.interactionHint}>{labels.plotInteractionHint}</p>
    </div>
  )
}

function graphLayers(content: NodeLinkContent): Array<{ id: string; label?: string; nodes: NodeLinkContent['nodes'] }> {
  if (content.groups !== undefined && content.groups.length > 0) {
    const grouped: Array<{ id: string; label?: string; nodes: NodeLinkContent['nodes'] }> = content.groups.map(group => ({
      id: group.id,
      label: group.label,
      nodes: content.nodes.filter(node => node.group === group.id),
    })).filter(layer => layer.nodes.length > 0)
    const knownGroups = new Set(content.groups.map(group => group.id))
    const ungrouped = content.nodes.filter(node => node.group === undefined || !knownGroups.has(node.group))
    if (ungrouped.length > 0) grouped.push({ id: 'ungrouped', nodes: ungrouped })
    return grouped
  }

  const incoming = new Map(content.nodes.map(node => [node.id, 0]))
  const outgoing = new Map(content.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of content.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge.to)
  }
  const levels = new Map(content.nodes.map(node => [node.id, 0]))
  const queue = content.nodes.filter(node => (incoming.get(node.id) ?? 0) === 0).map(node => node.id)
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    visited.add(current)
    for (const target of outgoing.get(current) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(current) ?? 0) + 1))
      incoming.set(target, (incoming.get(target) ?? 1) - 1)
      if (incoming.get(target) === 0) queue.push(target)
    }
  }
  const fallbackLevel = Math.max(0, ...levels.values())
  for (const node of content.nodes) if (!visited.has(node.id)) levels.set(node.id, fallbackLevel)
  const levelCount = Math.max(0, ...levels.values()) + 1
  return Array.from({ length: levelCount }, (_, index) => ({
    id: `layer-${String(index)}`,
    nodes: content.nodes.filter(node => levels.get(node.id) === index),
  })).filter(layer => layer.nodes.length > 0)
}

function graphLayout(content: NodeLinkContent, containerWidth: number): {
  width: number
  height: number
  positions: Map<string, NodePosition>
  layers: ReturnType<typeof graphLayers>
} {
  const layers = graphLayers(content)
  const positions = new Map<string, NodePosition>()
  if (content.layout === 'radial') {
    const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth))
    const height = Math.max(430, Math.min(600, width * 0.68))
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.max(120, Math.min(width, height) / 2 - 68)
    content.nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + index / Math.max(1, content.nodes.length) * Math.PI * 2
      positions.set(node.id, { id: node.id, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius })
    })
    return { width, height, positions, layers }
  }

  if (content.layout === 'hierarchy') {
    const widestLayer = Math.max(1, ...layers.map(layer => layer.nodes.length))
    const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth), widestLayer * 142 + 72)
    const height = Math.max(390, layers.length * 128 + 74)
    layers.forEach((layer, layerIndex) => layer.nodes.forEach((node, nodeIndex) => {
      positions.set(node.id, {
        id: node.id,
        x: width * (nodeIndex + 1) / (layer.nodes.length + 1),
        y: 56 + layerIndex * ((height - 104) / Math.max(1, layers.length - 1)),
      })
    }))
    return { width, height, positions, layers }
  }

  const tallestLayer = Math.max(1, ...layers.map(layer => layer.nodes.length))
  const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth), layers.length * 182 + 78)
  const height = Math.max(390, tallestLayer * 82 + 92)
  layers.forEach((layer, layerIndex) => layer.nodes.forEach((node, nodeIndex) => {
    positions.set(node.id, {
      id: node.id,
      x: 58 + layerIndex * ((width - 116) / Math.max(1, layers.length - 1)),
      y: 62 + (nodeIndex + 1) * ((height - 92) / (layer.nodes.length + 1)),
    })
  }))
  return { width, height, positions, layers }
}

function shortenedEdge(from: Point, to: Point, radius = 30): { start: Point; end: Point } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  return {
    start: { x: from.x + ux * radius, y: from.y + uy * radius },
    end: { x: to.x - ux * (radius + 3), y: to.y - uy * (radius + 3) },
  }
}

function edgePath(from: Point, to: Point, layout: NodeLinkContent['layout']): string {
  const { start, end } = shortenedEdge(from, to)
  if (layout === 'layered') {
    const middle = (start.x + end.x) / 2
    return `M${start.x},${start.y} C${middle},${start.y} ${middle},${end.y} ${end.x},${end.y}`
  }
  if (layout === 'hierarchy') {
    const middle = (start.y + end.y) / 2
    return `M${start.x},${start.y} C${start.x},${middle} ${end.x},${middle} ${end.x},${end.y}`
  }
  return `M${start.x},${start.y} L${end.x},${end.y}`
}

function NodeLinkRenderer({ content, focusedIds }: RendererProps<NodeLinkContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [regionRef, containerWidth] = useContainerWidth()
  const layout = useMemo(() => graphLayout(content, containerWidth), [containerWidth, content])
  const [selected, setSelected] = useState<SelectedItem | undefined>()
  const nodeById = useMemo(() => new Map(content.nodes.map(node => [node.id, node])), [content.nodes])
  const selectNode = (node: NodeLinkContent['nodes'][number]): void => setSelected({
    id: node.id,
    label: node.label,
    detail: node.detail,
    kind: 'node',
  })
  const selectEdge = (edge: NodeLinkContent['edges'][number]): void => setSelected({
    id: edge.id,
    label: edge.label ?? `${nodeById.get(edge.from)?.label ?? edge.from} → ${nodeById.get(edge.to)?.label ?? edge.to}`,
    detail: edge.detail,
    kind: 'edge',
  })
  const accessibleDescription = [
    labelTemplate(labels.nodeLinkSummary, { nodes: content.nodes.length, edges: content.edges.length }),
    ...content.nodes.map(node => `${node.label}${node.detail === undefined ? '' : `: ${node.detail}`}`),
    ...content.edges.map(edge => `${labelTemplate(labels.connection, { from: nodeById.get(edge.from)?.label ?? edge.from, to: nodeById.get(edge.to)?.label ?? edge.to })}${edge.label === undefined ? '' : `, ${edge.label}`}`),
  ].join(' ')

  return (
    <div className={css.nodeLinkRenderer}>
      <div className={css.graphViewport} ref={regionRef}>
        <svg className={css.graphSvg} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={accessibleDescription} data-dense-edges={content.edges.length > 12 || undefined}>
          <defs>
            {DEFAULT_TONES.map(tone => (
              <marker key={tone} id={`${id}-arrow-${tone}`} className={css.arrowMarker} data-tone={tone} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 z" />
              </marker>
            ))}
          </defs>
          {content.layout !== 'radial' && layout.layers.map((layer, index) => {
            const first = layer.nodes[0]
            const position = first === undefined ? undefined : layout.positions.get(first.id)
            if (position === undefined) return null
            return <text key={layer.id} className={css.layerLabel} x={position.x} y={content.layout === 'layered' ? 30 : Math.max(22, position.y - 42)} textAnchor="middle" data-visual-id={layer.id} data-focus-state={focusState(layer.id, focusedIds)}>{layer.label ?? labelTemplate(labels.layerLabel, { index: index + 1 })}</text>
          })}
          <g>
            {content.edges.map((edge, edgeIndex) => {
              const from = layout.positions.get(edge.from)
              const to = layout.positions.get(edge.to)
              if (from === undefined || to === undefined) return null
              const tone = toneAt(edge.tone, edgeIndex)
              const fromNode = nodeById.get(edge.from)
              const toNode = nodeById.get(edge.to)
              const state = relatedFocusState(edge.id, [edge.from, edge.to, fromNode?.group, toNode?.group], focusedIds)
              const path = edgePath(from, to, content.layout)
              const labelX = (from.x + to.x) / 2
              const labelY = (from.y + to.y) / 2 - 7
              return (
                <g
                  key={edge.id}
                  className={css.edgeGroup}
                  data-tone={tone}
                  data-stroke={edge.stroke ?? 'solid'}
                  data-focus-state={state}
                  data-edge-focused={focusedIds.has(edge.id) || undefined}
                  data-selected={selected?.id === edge.id || undefined}
                  data-visual-id={edge.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${edge.label ?? labels.edgeLabel}: ${labelTemplate(labels.connection, { from: nodeById.get(edge.from)?.label ?? edge.from, to: nodeById.get(edge.to)?.label ?? edge.to })}${edge.detail === undefined ? '' : `. ${edge.detail}`}`}
                  onClick={() => selectEdge(edge)}
                  onKeyDown={event => activateWithKeyboard(event, () => selectEdge(edge))}
                >
                  <path className={css.edgeVisible} d={path} markerEnd={edge.directed === true ? `url(#${id}-arrow-${tone})` : undefined} />
                  <path className={css.edgeHit} d={path} />
                  {edge.label === undefined ? null : <text className={css.edgeLabel} x={labelX} y={labelY} textAnchor="middle">{edge.label}</text>}
                </g>
              )
            })}
          </g>
          <g>
            {content.nodes.map((node, nodeIndex) => {
              const position = layout.positions.get(node.id)
              if (position === undefined) return null
              return (
                <g
                  key={node.id}
                  className={css.nodeGroup}
                  data-tone={toneAt(node.tone, nodeIndex)}
                  data-focus-state={relatedFocusState(node.id, [node.group], focusedIds)}
                  data-selected={selected?.id === node.id || undefined}
                  data-visual-id={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.label}${node.detail === undefined ? '' : `。${node.detail}`}`}
                  transform={`translate(${position.x} ${position.y})`}
                  onClick={() => selectNode(node)}
                  onKeyDown={event => activateWithKeyboard(event, () => selectNode(node))}
                >
                  <circle r="29" />
                  <text textAnchor="middle" dominantBaseline="middle">{node.label}</text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      {selected === undefined ? (
        <p className={css.interactionHint}>{labels.nodeLinkInteractionHint}</p>
      ) : (
        <aside className={css.detailPanel} aria-live="polite">
          <span>{selected.kind === 'node' ? labels.nodeKind : labels.edgeKind}</span>
          <strong>{selected.label}</strong>
          <p>{selected.detail ?? labels.noDetail}</p>
          <button type="button" onClick={() => setSelected(undefined)} aria-label={labels.closeDetail}>×</button>
        </aside>
      )}
    </div>
  )
}

function Scene2DRenderer({ content, focusedIds }: RendererProps<Scene2DContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [regionRef, containerWidth] = useContainerWidth()
  const geometry = useMemo(() => chartGeometry(containerWidth, SVG_MIN_WIDTH), [containerWidth])
  const [selected, setSelected] = useState<SelectedItem | undefined>()
  const xTicks = useMemo(() => ticks(content.xAxis.min, content.xAxis.max), [content.xAxis.max, content.xAxis.min])
  const yTicks = useMemo(() => ticks(content.yAxis.min, content.yAxis.max), [content.yAxis.max, content.yAxis.min])
  const zeroX = content.xAxis.min <= 0 && content.xAxis.max >= 0 ? scaleX(0, content.xAxis, geometry) : undefined
  const zeroY = content.yAxis.min <= 0 && content.yAxis.max >= 0 ? scaleY(0, content.yAxis, geometry) : undefined

  const selectElement = (element: Scene2DContent['elements'][number]): void => setSelected({
    id: element.id,
    label: element.type === 'label' ? element.text : element.label ?? labelTemplate(labels.elementFallback, { id: element.id }),
    detail: element.detail,
    kind: 'element',
  })

  return (
    <div className={css.sceneRenderer}>
      <div className={css.sceneViewport} ref={regionRef}>
        <svg
          className={css.sceneSvg}
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          role="group"
          aria-label={labelTemplate(labels.sceneSummary, {
            elements: content.elements.length,
            labels: content.elements.map(element => element.type === 'label' ? element.text : element.label).filter(Boolean).join(', '),
          })}
        >
          <defs>
            <clipPath id={`${id}-scene-clip`}>
              <rect x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
            </clipPath>
            {DEFAULT_TONES.map(tone => (
              <marker key={tone} id={`${id}-scene-arrow-${tone}`} className={css.arrowMarker} data-tone={tone} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L9,4.5 L0,9 z" />
              </marker>
            ))}
          </defs>
          <rect className={css.plotFrame} x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
          {content.grid !== true ? null : yTicks.map(value => <line key={`gy-${String(value)}`} className={css.gridLine} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={scaleY(value, content.yAxis, geometry)} y2={scaleY(value, content.yAxis, geometry)} />)}
          {content.grid !== true ? null : xTicks.map(value => <line key={`gx-${String(value)}`} className={css.gridLine} x1={scaleX(value, content.xAxis, geometry)} x2={scaleX(value, content.xAxis, geometry)} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />)}
          {zeroX === undefined ? null : <line className={css.zeroAxis} x1={zeroX} x2={zeroX} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />}
          {zeroY === undefined ? null : <line className={css.zeroAxis} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={zeroY} y2={zeroY} />}
          {yTicks.map(value => <text key={`yt-${String(value)}`} className={css.tickLabel} x={geometry.left - 10} y={scaleY(value, content.yAxis, geometry)} textAnchor="end" dominantBaseline="middle">{formatNumber(value)}</text>)}
          {xTicks.map(value => <text key={`xt-${String(value)}`} className={css.tickLabel} x={scaleX(value, content.xAxis, geometry)} y={geometry.top + geometry.plotHeight + 22} textAnchor="middle">{formatNumber(value)}</text>)}
          <g clipPath={`url(#${id}-scene-clip)`}>
            {content.elements.map((element, index) => {
              const tone = toneAt(element.tone, index)
              const common = {
                className: css.sceneElement,
                'data-tone': tone,
                'data-focus-state': focusState(element.id, focusedIds),
                'data-selected': selected?.id === element.id || undefined,
                'data-visual-id': element.id,
                role: 'button',
                tabIndex: 0,
                'aria-label': `${element.type === 'label' ? element.text : element.label ?? element.type}${element.detail === undefined ? '' : `。${element.detail}`}`,
                onClick: () => selectElement(element),
                onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateWithKeyboard(event, () => selectElement(element)),
              } as const
              if (element.type === 'point') {
                const x = scaleX(element.x, content.xAxis, geometry)
                const y = scaleY(element.y, content.yAxis, geometry)
                return <g key={element.id} {...common}><circle className={css.scenePoint} cx={x} cy={y} r={element.size ?? 6} />{element.label === undefined ? null : <text className={css.shapeLabel} x={x + 10} y={y - 10}>{element.label}</text>}</g>
              }
              if (element.type === 'segment' || element.type === 'arrow') {
                const x1 = scaleX(element.x1, content.xAxis, geometry)
                const y1 = scaleY(element.y1, content.yAxis, geometry)
                const x2 = scaleX(element.x2, content.xAxis, geometry)
                const y2 = scaleY(element.y2, content.yAxis, geometry)
                return <g key={element.id} {...common} data-stroke={element.stroke ?? 'solid'}><line className={css.sceneLine} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={element.type === 'arrow' ? `url(#${id}-scene-arrow-${tone})` : undefined} /><line className={css.sceneHit} x1={x1} y1={y1} x2={x2} y2={y2} />{element.label === undefined ? null : <text className={css.shapeLabel} x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle">{element.label}</text>}</g>
              }
              if (element.type === 'circle') {
                const cx = scaleX(element.cx, content.xAxis, geometry)
                const cy = scaleY(element.cy, content.yAxis, geometry)
                const rx = Math.abs(scaleX(element.cx + element.r, content.xAxis, geometry) - cx)
                const ry = Math.abs(scaleY(element.cy + element.r, content.yAxis, geometry) - cy)
                return <g key={element.id} {...common}><ellipse className={css.sceneShape} cx={cx} cy={cy} rx={rx} ry={ry} />{element.label === undefined ? null : <text className={css.shapeLabel} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'rect') {
                const x = scaleX(element.x, content.xAxis, geometry)
                const y = scaleY(element.y + element.height, content.yAxis, geometry)
                const width = Math.abs(scaleX(element.x + element.width, content.xAxis, geometry) - x)
                const height = Math.abs(scaleY(element.y, content.yAxis, geometry) - y)
                return <g key={element.id} {...common}><rect className={css.sceneShape} x={x} y={y} width={width} height={height} rx="3" />{element.label === undefined ? null : <text className={css.shapeLabel} x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'polygon') {
                const points = element.points.map(point => `${scaleX(point.x, content.xAxis, geometry)},${scaleY(point.y, content.yAxis, geometry)}`).join(' ')
                const center = element.points.reduce((total, point) => ({ x: total.x + point.x / element.points.length, y: total.y + point.y / element.points.length }), { x: 0, y: 0 })
                return <g key={element.id} {...common}><polygon className={css.sceneShape} points={points} />{element.label === undefined ? null : <text className={css.shapeLabel} x={scaleX(center.x, content.xAxis, geometry)} y={scaleY(center.y, content.yAxis, geometry)} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'label') return <g key={element.id} {...common}><text className={css.sceneText} x={scaleX(element.x, content.xAxis, geometry)} y={scaleY(element.y, content.yAxis, geometry)} textAnchor="middle" dominantBaseline="middle">{element.text}</text></g>
              return null
            })}
          </g>
          <text className={css.axisLabel} x={geometry.left + geometry.plotWidth / 2} y={geometry.height - 7} textAnchor="middle">{content.xAxis.label ?? 'x'}</text>
          <text className={css.axisLabel} x="16" y={geometry.top + geometry.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 16 ${geometry.top + geometry.plotHeight / 2})`}>{content.yAxis.label ?? 'y'}</text>
        </svg>
      </div>
      {selected === undefined ? (
        <p className={css.interactionHint}>{labels.sceneInteractionHint}</p>
      ) : (
        <aside className={css.detailPanel} aria-live="polite">
          <span>{labels.elementKind}</span><strong>{selected.label}</strong><p>{selected.detail ?? labels.noDetail}</p>
          <button type="button" onClick={() => setSelected(undefined)} aria-label={labels.closeDetail}>×</button>
        </aside>
      )}
    </div>
  )
}

function RelationRenderer({ content, focusedIds }: RendererProps<RelationContent>) {
  const labels = useVisualLabels()
  const [selected, setSelected] = useState<{ label: string; detail?: string; kind: string } | undefined>()

  if (content.variant === 'comparison') {
    return (
      <div className={css.relationRenderer}>
        <div className={css.tableViewport}>
          <table className={css.relationTable}>
            <caption className={css.srOnly}>{labels.comparisonCaption}</caption>
            <thead><tr><th scope="col">{labels.comparisonDimension}</th>{content.subjects.map(subject => (
              <th key={subject.id} scope="col" data-tone={toneAt(subject.tone)} data-focus-state={focusState(subject.id, focusedIds)} data-visual-id={subject.id}>
                <button type="button" onClick={() => setSelected({ label: subject.label, detail: subject.detail, kind: labels.comparisonSubject })}>{subject.label}</button>
              </th>
            ))}</tr></thead>
            <tbody>{content.rows.map(row => (
              <tr key={row.id} data-focus-state={focusState(row.id, focusedIds)} data-visual-id={row.id}>
                <th scope="row"><button type="button" onClick={() => setSelected({ label: row.label, detail: row.detail, kind: labels.comparisonDimension })}>{row.label}</button></th>
                {content.subjects.map(subject => {
                  const cell = row.cells.find(item => item.subjectId === subject.id)
                  return <td key={subject.id} data-tone={toneAt(cell?.tone)}>{cell?.value ?? '—'}</td>
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {selected === undefined ? <p className={css.interactionHint}>{labels.comparisonInteractionHint}</p> : <RelationDetail selected={selected} onClose={() => setSelected(undefined)} />}
      </div>
    )
  }

  if (content.variant === 'matrix') {
    return (
      <div className={css.relationRenderer}>
        <div className={css.tableViewport}>
          <table className={`${css.relationTable} ${css.matrixTable}`}>
            <caption className={css.srOnly}>{labels.matrixCaption}</caption>
            <thead><tr><th scope="col">{labels.matrixAxes}</th>{content.columns.map(column => <th key={column.id} scope="col" data-focus-state={focusState(column.id, focusedIds)} data-visual-id={column.id}>{column.label}</th>)}</tr></thead>
            <tbody>{content.rows.map(row => (
              <tr key={row.id}>
                <th scope="row" data-focus-state={focusState(row.id, focusedIds)} data-visual-id={row.id}>{row.label}</th>
                {content.columns.map(column => {
                  const cell = content.cells.find(item => item.rowId === row.id && item.columnId === column.id)
                  return <td key={column.id}>{cell === undefined ? <span className={css.emptyCell} aria-label={labels.noRelation}>·</span> : (
                    <button
                      type="button"
                      className={css.matrixCell}
                      data-tone={toneAt(cell.tone)}
                      data-focus-state={focusState(cell.id, focusedIds)}
                      data-visual-id={cell.id}
                      onClick={() => setSelected({ label: cell.label, detail: cell.detail, kind: `${row.label} × ${column.label}` })}
                    >{cell.label}</button>
                  )}</td>
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {selected === undefined ? <p className={css.interactionHint}>{labels.matrixInteractionHint}</p> : <RelationDetail selected={selected} onClose={() => setSelected(undefined)} />}
      </div>
    )
  }

  const setById = new Map(content.sets.map(set => [set.id, set]))
  const exclusiveItems = (setId: string) => content.items.filter(item => item.setIds.length === 1 && item.setIds[0] === setId)
  const sharedItems = content.items.filter(item => item.setIds.length !== 1)
  return (
    <div className={css.relationRenderer}>
      <div className={css.setMap} aria-label={labels.setsLabel}>
        <div className={css.setZones}>
          {content.sets.map((set, setIndex) => (
            <section key={set.id} className={css.setZone} data-tone={toneAt(set.tone, setIndex)} data-focus-state={focusState(set.id, focusedIds)} data-visual-id={set.id}>
              <h4><span aria-hidden="true" />{set.label}</h4>
              <div>{exclusiveItems(set.id).map(item => (
                <button key={item.id} type="button" data-focus-state={focusState(item.id, focusedIds)} data-visual-id={item.id} onClick={() => setSelected({ label: item.label, detail: item.detail, kind: set.label })}>{item.label}</button>
              ))}{exclusiveItems(set.id).length === 0 ? <span className={css.emptySet}>{labels.noExclusiveItems}</span> : null}</div>
            </section>
          ))}
        </div>
        {sharedItems.length === 0 ? null : (
          <section className={css.intersections}>
            <h4>{labels.intersections}</h4>
            <div>{sharedItems.map(item => (
              <button key={item.id} type="button" data-focus-state={focusState(item.id, focusedIds)} data-visual-id={item.id} onClick={() => setSelected({ label: item.label, detail: item.detail, kind: item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized })}>
                <strong>{item.label}</strong><span>{item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized}</span>
              </button>
            ))}</div>
          </section>
        )}
      </div>
      {selected === undefined ? <p className={css.interactionHint}>{labels.setsInteractionHint}</p> : <RelationDetail selected={selected} onClose={() => setSelected(undefined)} />}
    </div>
  )
}

function RelationDetail({
  selected,
  onClose,
}: {
  selected: { label: string; detail?: string; kind: string }
  onClose: () => void
}) {
  const labels = useVisualLabels()
  return (
    <aside className={css.detailPanel} aria-live="polite">
      <span>{selected.kind}</span><strong>{selected.label}</strong><p>{selected.detail ?? labels.noDetail}</p>
      <button type="button" onClick={onClose} aria-label={labels.closeDetail}>×</button>
    </aside>
  )
}

function timelinePosition(event: TimelineContent['events'][number], index: number, count: number): number {
  if (event.position !== undefined) return Math.max(0, Math.min(1, event.position))
  return count <= 1 ? 0.5 : index / (count - 1)
}

function TimelineRenderer({ content, focusedIds }: RendererProps<TimelineContent>) {
  const labels = useVisualLabels()
  const [regionRef, containerWidth] = useContainerWidth()
  const [selected, setSelected] = useState<{ label: string; detail?: string; kind: string } | undefined>()
  const eras = content.eras ?? []
  const eventIndex = useMemo(() => new Map(content.events.map((event, index) => [event.id, index])), [content.events])
  const selectEvent = (event: TimelineContent['events'][number]): void => setSelected({ label: `${event.time} · ${event.label}`, detail: event.detail, kind: labels.timelineEventKind })
  const selectEra = (era: NonNullable<TimelineContent['eras']>[number]): void => setSelected({ label: era.label, detail: era.detail, kind: labels.timelineEraKind })

  if ((content.orientation ?? 'horizontal') === 'vertical') {
    return (
      <div className={css.timelineRenderer} role="group" aria-label={labels.timelineLabel}>
        {eras.length === 0 ? null : (
          <div className={css.timelineEraChips} aria-label={labels.timelineEraKind}>
            {eras.map((era, index) => <button key={era.id} type="button" data-tone={toneAt(era.tone, index)} data-focus-state={focusState(era.id, focusedIds)} data-visual-id={era.id} onClick={() => selectEra(era)}><strong>{era.label}</strong><span>{content.events[eventIndex.get(era.startEventId) ?? 0]?.time} – {content.events[eventIndex.get(era.endEventId) ?? 0]?.time}</span></button>)}
          </div>
        )}
        <ol className={css.timelineVertical}>
          {content.events.map((event, index) => (
            <li key={event.id} data-tone={toneAt(event.tone, index)} data-focus-state={focusState(event.id, focusedIds)} data-visual-id={event.id}>
              <button type="button" onClick={() => selectEvent(event)}>
                <span>{event.time}</span><strong>{event.label}</strong>
                {event.detail === undefined ? null : <small>{event.detail}</small>}
              </button>
            </li>
          ))}
        </ol>
        {selected === undefined ? <p className={css.interactionHint}>{labels.timelineInteractionHint}</p> : <RelationDetail selected={selected} onClose={() => setSelected(undefined)} />}
      </div>
    )
  }

  const eventCount = content.events.length
  const minimumWidth = eventCount <= 4
    ? Math.max(360, 144 + Math.max(0, eventCount - 1) * 104)
    : 144 + Math.max(0, eventCount - 1) * 142
  const width = Math.max(minimumWidth, Math.floor(containerWidth) - 2)
  const axisY = 72 + Math.min(4, eras.length) * 30
  const height = axisY + 142
  const inset = 72
  const eventX = (event: TimelineContent['events'][number], index: number): number => inset + timelinePosition(event, index, content.events.length) * (width - inset * 2)
  return (
    <div className={css.timelineRenderer} role="group" aria-label={labels.timelineLabel}>
      <div className={css.timelineViewport} ref={regionRef}>
        <div className={css.timelineCanvas} style={{ width, height }}>
          {eras.map((era, index) => {
            const startIndex = eventIndex.get(era.startEventId) ?? 0
            const endIndex = eventIndex.get(era.endEventId) ?? startIndex
            const start = eventX(content.events[startIndex] as TimelineContent['events'][number], startIndex)
            const end = eventX(content.events[endIndex] as TimelineContent['events'][number], endIndex)
            return (
              <button
                key={era.id}
                type="button"
                className={css.timelineEra}
                data-tone={toneAt(era.tone, index)}
                data-focus-state={focusState(era.id, focusedIds)}
                data-visual-id={era.id}
                style={{ left: Math.min(start, end), top: 16 + index % 4 * 30, width: Math.max(42, Math.abs(end - start)) } as CSSProperties}
                onClick={() => selectEra(era)}
              >{era.label}</button>
            )
          })}
          <div className={css.timelineAxis} style={{ top: axisY }} aria-hidden="true" />
          {content.events.map((event, index) => (
            <button
              key={event.id}
              type="button"
              className={css.timelineEvent}
              data-tone={toneAt(event.tone, index)}
              data-side={index % 2 === 0 ? 'top' : 'bottom'}
              data-focus-state={focusState(event.id, focusedIds)}
              data-visual-id={event.id}
              style={{ left: eventX(event, index), top: index % 2 === 0 ? axisY - 74 : axisY + 24 } as CSSProperties}
              onClick={() => selectEvent(event)}
            >
              <span>{event.time}</span><strong>{event.label}</strong>
            </button>
          ))}
        </div>
      </div>
      {selected === undefined ? <p className={css.interactionHint}>{labels.timelineInteractionHint}</p> : <RelationDetail selected={selected} onClose={() => setSelected(undefined)} />}
    </div>
  )
}

function FormulaStepsRenderer({ content, focusedIds }: RendererProps<FormulaStepsContent>) {
  const labels = useVisualLabels()
  const [revealedIndex, setRevealedIndex] = useState(0)
  const lastIndex = content.steps.length - 1
  useEffect(() => {
    const focusedIndex = content.steps.findIndex(step => focusedIds.has(step.id))
    if (focusedIndex >= 0) setRevealedIndex(current => Math.max(current, focusedIndex))
  }, [content.steps, focusedIds])
  const move = (delta: number): void => setRevealedIndex(current => Math.max(0, Math.min(lastIndex, current + delta)))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    else if (event.key === 'Home') { event.preventDefault(); setRevealedIndex(0) }
    else if (event.key === 'End') { event.preventDefault(); setRevealedIndex(lastIndex) }
  }
  return (
    <div className={css.formulaRenderer} tabIndex={0} onKeyDown={onKeyDown} aria-label={labels.formulaLabel}>
      <div className={css.formulaMeta}>
        <span>{labelTemplate(labels.formulaProgress, { current: revealedIndex + 1, total: content.steps.length })}</span>
        {content.notation === undefined ? null : <code>{content.notation}</code>}
      </div>
      <ol className={css.formulaSteps} aria-live="polite">
        {content.steps.slice(0, revealedIndex + 1).map((step, index) => (
          <li key={step.id} data-tone={toneAt(step.tone, index)} data-focus-state={focusState(step.id, focusedIds)} data-visual-id={step.id}>
            {index === 0 || step.rule === undefined ? null : <div className={css.formulaRule}><span aria-hidden="true">↓</span><strong>{labels.formulaRule}</strong><span>{step.rule}</span></div>}
            <div className={css.formulaStepCard}>
              <span>{index + 1}</span>
              <div><div className={css.formulaExpression} aria-label={step.expression}><MarkdownText text={displayMath(step.expression)} /></div>{step.label === undefined ? null : <strong>{step.label}</strong>}{step.detail === undefined ? null : <p>{step.detail}</p>}</div>
            </div>
          </li>
        ))}
      </ol>
      {revealedIndex >= lastIndex ? (
        <div className={css.formulaConclusion} aria-live="polite">
          <span>{labels.formulaConclusion}</span><strong>{content.conclusion ?? labels.formulaComplete}</strong>
        </div>
      ) : <div className={css.formulaUnknown} aria-hidden="true"><span>↓</span><code>?</code></div>}
      <div className={css.formulaActions}>
        <button type="button" onClick={() => move(-1)} disabled={revealedIndex === 0}>{labels.previousStep}</button>
        <button type="button" className={css.primaryAction} onClick={() => move(1)} disabled={revealedIndex >= lastIndex}>{labels.revealNextFormulaStep}</button>
        <button type="button" onClick={() => setRevealedIndex(0)} disabled={revealedIndex === 0}>{labels.reset}</button>
      </div>
      <p className={css.interactionHint}>{labels.formulaInteractionHint}</p>
    </div>
  )
}

function studyRoleLabel(role: StudyMapContent['concepts'][number]['role'], labels: LearningVisualV4Labels): string | undefined {
  if (role === 'foundation') return labels.roleFoundation
  if (role === 'core') return labels.roleCore
  if (role === 'extension') return labels.roleExtension
  if (role === 'practice') return labels.rolePractice
  return undefined
}

function StudyMapRenderer({ content, focusedIds }: RendererProps<StudyMapContent>) {
  const labels = useVisualLabels()
  const conceptById = useMemo(() => new Map(content.concepts.map(concept => [concept.id, concept])), [content.concepts])
  const focusedConcept = content.concepts.find(concept => focusedIds.has(concept.id))
  const focusedSection = content.sections.find(section => focusedIds.has(section.id))
  const [sectionId, setSectionId] = useState(focusedConcept?.sectionId ?? focusedSection?.id ?? content.sections[0]?.id ?? '')
  const [selectedConceptId, setSelectedConceptId] = useState<string | undefined>(focusedConcept?.id)
  useEffect(() => {
    const concept = content.concepts.find(item => focusedIds.has(item.id))
    const section = content.sections.find(item => focusedIds.has(item.id))
    if (concept !== undefined) { setSectionId(concept.sectionId); setSelectedConceptId(concept.id) }
    else if (section !== undefined) setSectionId(section.id)
  }, [content.concepts, content.sections, focusedIds])
  const section = content.sections.find(item => item.id === sectionId) ?? content.sections[0]
  const concepts = content.concepts.filter(concept => concept.sectionId === section?.id)
  const selectedConcept = selectedConceptId === undefined ? undefined : conceptById.get(selectedConceptId)
  const selectSection = (nextId: string): void => { setSectionId(nextId); setSelectedConceptId(undefined) }
  const sectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
    const nextIndex = (index + delta + content.sections.length) % content.sections.length
    const next = content.sections[nextIndex]
    if (next !== undefined) {
      selectSection(next.id)
      const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.[nextIndex]?.focus()
    }
  }
  return (
    <div className={css.studyRenderer}>
      <div className={css.studySource}>
        <span>{labels.studySource}</span><strong>{content.sourceLabel}</strong>
        {content.goal === undefined ? null : <p><b>{labels.studyGoal}</b>{content.goal}</p>}
      </div>
      <div className={css.studyLayout}>
        <nav className={css.studySections} role="tablist" aria-label={labels.studySections}>
          {content.sections.map((item, index) => (
            <button key={item.id} type="button" role="tab" tabIndex={item.id === section?.id ? 0 : -1} aria-selected={item.id === section?.id} data-focus-state={relatedFocusState(item.id, content.concepts.filter(concept => concept.sectionId === item.id).map(concept => concept.id), focusedIds)} data-visual-id={item.id} onClick={() => selectSection(item.id)} onKeyDown={event => sectionKeyDown(event, index)}>
              <span>{index + 1}</span><strong>{item.label}</strong>{item.anchor === undefined ? null : <small>{item.anchor}</small>}
            </button>
          ))}
        </nav>
        <section className={css.studySectionPanel} role="tabpanel">
          {section === undefined ? null : <header><div><span>{section.anchor === undefined ? labels.studySummary : `${labels.studyAnchor} · ${section.anchor}`}</span><h4>{section.label}</h4></div>{section.summary === undefined ? null : <p>{section.summary}</p>}</header>}
          <div className={css.studyConcepts} aria-label={labels.studyConcepts}>
            {concepts.map((concept, index) => {
              const role = studyRoleLabel(concept.role, labels)
              const prerequisites = (concept.prerequisiteIds ?? []).map(id => conceptById.get(id)?.label ?? id)
              return (
                <button key={concept.id} type="button" data-tone={toneAt(concept.tone, index)} data-role={concept.role} data-focus-state={focusState(concept.id, focusedIds)} data-selected={concept.id === selectedConceptId || undefined} data-visual-id={concept.id} onClick={() => setSelectedConceptId(concept.id)}>
                  <span>{role ?? labels.studyConcepts}</span><strong>{concept.label}</strong>
                  <small><b>{labels.prerequisite}</b>{prerequisites.length === 0 ? labels.noPrerequisite : prerequisites.join(' → ')}</small>
                </button>
              )
            })}
          </div>
        </section>
      </div>
      {selectedConcept === undefined ? <p className={css.interactionHint}>{labels.studyInteractionHint}</p> : (
        <aside className={css.studyDetail} aria-live="polite">
          <div><span>{studyRoleLabel(selectedConcept.role, labels) ?? labels.studyConcepts}</span><strong>{selectedConcept.label}</strong></div>
          <p>{selectedConcept.detail ?? labels.noDetail}</p>
          <dl><dt>{labels.prerequisite}</dt><dd>{(selectedConcept.prerequisiteIds ?? []).map(id => conceptById.get(id)?.label ?? id).join(' → ') || labels.noPrerequisite}</dd></dl>
          <button type="button" onClick={() => setSelectedConceptId(undefined)} aria-label={labels.closeDetail}>×</button>
        </aside>
      )}
    </div>
  )
}

type RecallStage = 'prompt' | 'hint' | 'answer'
type RecallStatus = 'mastered' | 'review'

function initialRecallState(content: RecallDeckContent, storageKey: string | undefined): {
  index: number
  stage: RecallStage
  statuses: Record<string, RecallStatus>
} {
  const initial = { index: 0, stage: 'prompt' as RecallStage, statuses: {} as Record<string, RecallStatus> }
  if (storageKey === undefined || typeof sessionStorage === 'undefined') return initial
  try {
    const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@4:recall:${storageKey}`) ?? '{}') as { index?: unknown; stage?: unknown; statuses?: unknown }
    if (typeof stored.index === 'number' && Number.isInteger(stored.index)) initial.index = Math.max(0, Math.min(content.cards.length - 1, stored.index))
    if (stored.stage === 'prompt' || stored.stage === 'hint' || stored.stage === 'answer') initial.stage = stored.stage
    if (typeof stored.statuses === 'object' && stored.statuses !== null && !Array.isArray(stored.statuses)) {
      for (const card of content.cards) {
        const status = (stored.statuses as Record<string, unknown>)[card.id]
        if (status === 'mastered' || status === 'review') initial.statuses[card.id] = status
      }
    }
    if (initial.stage === 'hint' && content.cards[initial.index]?.hint === undefined) initial.stage = 'answer'
  } catch {
    // Corrupt optional recall state should never prevent the canonical deck replay.
  }
  return initial
}

function RecallDeckRenderer({ content, focusedIds, storageKey }: RendererProps<RecallDeckContent>) {
  const labels = useVisualLabels()
  const initial = useMemo(() => initialRecallState(content, storageKey), [content, storageKey])
  const [cardIndex, setCardIndex] = useState(initial.index)
  const [stage, setStage] = useState<RecallStage>(initial.stage)
  const [statuses, setStatuses] = useState<Record<string, RecallStatus>>(initial.statuses)
  const current = content.cards[cardIndex]
  useEffect(() => {
    const focusedIndex = content.cards.findIndex(card => focusedIds.has(card.id))
    if (focusedIndex >= 0) { setCardIndex(focusedIndex); setStage('prompt') }
  }, [content.cards, focusedIds])
  useEffect(() => {
    if (storageKey === undefined || typeof sessionStorage === 'undefined') return
    try { sessionStorage.setItem(`dsh-learning/visual@4:recall:${storageKey}`, JSON.stringify({ index: cardIndex, stage, statuses })) } catch {
      // Persistence is optional; the deck remains fully usable without it.
    }
  }, [cardIndex, stage, statuses, storageKey])
  if (current === undefined) return null
  const move = (delta: number): void => {
    setCardIndex(index => Math.max(0, Math.min(content.cards.length - 1, index + delta)))
    setStage('prompt')
  }
  const reset = (): void => { setCardIndex(0); setStage('prompt'); setStatuses({}) }
  const mark = (status: RecallStatus): void => setStatuses(value => ({ ...value, [current.id]: status }))
  const masteredCount = Object.values(statuses).filter(status => status === 'mastered').length
  const reviewCount = Object.values(statuses).filter(status => status === 'review').length
  const status = statuses[current.id]
  const revealNext = (): void => setStage(value => value === 'prompt' && current.hint !== undefined ? 'hint' : 'answer')
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
  }
  return (
    <div className={css.recallRenderer} tabIndex={0} onKeyDown={onKeyDown} aria-label={labels.recallDeckLabel}>
      <div className={css.recallToolbar}>
        <span>{labelTemplate(labels.recallProgress, { current: cardIndex + 1, total: content.cards.length })}</span>
        <output>{labelTemplate(labels.recallStatus, { mastered: masteredCount, review: reviewCount })}</output>
      </div>
      {content.instructions === undefined ? null : <p className={css.recallInstructions}>{content.instructions}</p>}
      <article className={css.recallCard} data-visual-id={current.id} data-focus-state={focusState(current.id, focusedIds)} data-stage={stage}>
        <div className={css.recallCardHeader}><span>{labels.recallPrompt}</span><small data-status={status ?? 'unrated'}>{status === 'mastered' ? labels.mastered : status === 'review' ? labels.reviewAgain : labels.unrated}</small></div>
        <h4>{current.prompt}</h4>
        {current.tags === undefined || current.tags.length === 0 ? null : <ul className={css.recallTags}>{current.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        {stage === 'prompt' || current.hint === undefined ? null : <section className={css.recallReveal} data-kind="hint" aria-live="polite"><span>{labels.recallHint}</span><p>{current.hint}</p></section>}
        {stage !== 'answer' ? null : <section className={css.recallReveal} data-kind="answer" aria-live="polite"><span>{labels.recallAnswer}</span><p>{current.answer}</p></section>}
        {stage === 'answer' ? (
          <div className={css.recallRating}>
            <button type="button" aria-pressed={status === 'review'} onClick={() => mark('review')}>{labels.reviewAgain}</button>
            <button type="button" aria-pressed={status === 'mastered'} onClick={() => mark('mastered')}>{labels.mastered}</button>
          </div>
        ) : <button type="button" className={css.recallRevealButton} onClick={revealNext}>{stage === 'prompt' && current.hint !== undefined ? labels.showHint : labels.showAnswer}</button>}
      </article>
      <div className={css.recallNavigation}>
        <button type="button" onClick={() => move(-1)} disabled={cardIndex === 0}>← {labels.previousCard}</button>
        <button type="button" onClick={() => move(1)} disabled={cardIndex >= content.cards.length - 1}>{labels.nextCard} →</button>
        <button type="button" onClick={reset} disabled={cardIndex === 0 && stage === 'prompt' && Object.keys(statuses).length === 0}>{labels.resetDeck}</button>
      </div>
      <p className={css.interactionHint}>{labels.recallInteractionHint}</p>
    </div>
  )
}

type RendererRegistry = {
  [Kind in VisualContent['kind']]: ComponentType<RendererProps<Extract<VisualContent, { kind: Kind }>>>
}

const VISUAL_RENDERER_REGISTRY: RendererRegistry = {
  plot: PlotRenderer,
  node_link: NodeLinkRenderer,
  scene_2d: Scene2DRenderer,
  relation: RelationRenderer,
  timeline: TimelineRenderer,
  formula_steps: FormulaStepsRenderer,
  study_map: StudyMapRenderer,
  recall_deck: RecallDeckRenderer,
}

function RegisteredVisual({
  content,
  focusedIds,
  storageKey,
}: RendererProps) {
  const Renderer = VISUAL_RENDERER_REGISTRY[content.kind] as ComponentType<RendererProps>
  return <Renderer content={content} focusedIds={focusedIds} storageKey={storageKey} />
}

export function LearningVisualV4({
  visual,
  storageKey,
  labels: suppliedLabels,
}: {
  visual: LearningVisualV4Definition
  storageKey?: string
  labels?: Partial<LearningVisualV4Labels>
}) {
  const titleId = useId()
  const descriptionId = useId()
  const initialFrameIndex = visual.sequence === undefined ? 0 : Math.max(0, visual.sequence.frames.findIndex(frame => frame.id === visual.sequence?.initialFrameId))
  const [frameIndex, setFrameIndex] = useState(initialFrameIndex)
  const frame = visual.sequence?.frames[frameIndex]
  const focusedIds = useMemo(() => new Set(frame?.focusIds ?? []), [frame?.focusIds])
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...suppliedLabels }), [suppliedLabels])

  useEffect(() => setFrameIndex(initialFrameIndex), [initialFrameIndex, visual])

  return (
    <VisualLabelsContext.Provider value={labels}>
      <section
        className={css.visualShell}
        data-learning-visual={visual.content.kind}
        data-render-state="ready"
        aria-labelledby={titleId}
        aria-describedby={visual.description === undefined ? undefined : descriptionId}
      >
        <header className={css.visualHeader}>
          <span className={css.visualEyebrow} aria-hidden="true">{labels.eyebrow}</span>
          <h3 id={titleId}>{visual.title}</h3>
          {visual.description === undefined ? null : <p id={descriptionId}>{visual.description}</p>}
        </header>
        {visual.sequence === undefined || visual.sequence.frames.length === 0 ? null : (
          <SequenceController sequence={visual.sequence} frameIndex={frameIndex} onFrameChange={setFrameIndex} />
        )}
        <VisualErrorBoundary key={`${visual.protocol}:${visual.title}:${visual.content.kind}`} fallbackMarkdown={visual.fallbackMarkdown} labels={labels}>
          <RegisteredVisual content={visual.content} focusedIds={focusedIds} storageKey={storageKey} />
        </VisualErrorBoundary>
      </section>
    </VisualLabelsContext.Provider>
  )
}
