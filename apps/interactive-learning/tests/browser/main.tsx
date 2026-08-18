import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { LearningToolView } from '../../src/client/LearningToolView.tsx'
import { en } from '../../src/client/locales.ts'
import {
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  parseLearningCheckpointResultV1,
  RESPONSE_PROTOCOL,
  VISUAL_PROTOCOL_V3,
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V3,
  VISUAL_RESULT_PROTOCOL_V4,
  type LearningActivityV1,
  type LearningCheckpointKindV1,
  type LearningCheckpointResultV1,
  type LearningCheckpointV1,
  type LearningResponseV1,
  type LearningVisualV3,
  type LearningVisualV4,
  type MathExpressionV1,
} from '../../src/protocol.ts'
import { encodeLearningCheckpointDetail, learningCheckpointQuestionId } from '../../src/transport.ts'
import { compareActivity, parameterActivity, processActivity, visualV4Catalog } from '../fixtures.ts'
import './page.css'

const SESSION_ID = 'learning-browser-visual-gallery'
const VISUAL_CALL_ID = 'call:logistic-regression-visual'
const VISUAL_V4_CALL_PREFIX = 'call:visual-v4'

type CheckpointSessionKey = 'a' | 'b'

function checkpointFixture(kind: LearningCheckpointKindV1): LearningCheckpointV1 {
  return {
    protocol: CHECKPOINT_PROTOCOL,
    kind,
    prompt: kind === 'single_choice'
      ? 'Which item leaves this queue first?'
      : 'Explain one observable change before the lesson continues.',
    context: 'Use only the example already visible in this turn.',
    expectedEvidence: 'attempt',
    ...(kind === 'single_choice' ? {
      options: [
        { id: 'first', label: 'The first inserted item' },
        { id: 'last', label: 'The last inserted item' },
      ],
    } : {}),
    fallbackMarkdown: 'Pause and contribute one step before continuing.',
  }
}

function checkpointIdentity(sessionKey: CheckpointSessionKey) {
  const sessionId = `learning-browser-checkpoint-${sessionKey}`
  return {
    sessionId,
    callId: `call:checkpoint:${sessionKey}`,
    waitId: `wait_browser_${sessionKey}`,
    checkpointId: `checkpoint_browser_${sessionKey}`,
  }
}

function runningCheckpointBlock(callId: string, checkpoint: LearningCheckpointV1) {
  return {
    seq: 1,
    time: 1_000,
    callId,
    name: 'learning_checkpoint',
    argsRaw: JSON.stringify(checkpoint),
  }
}

function completedCheckpointBlock(
  callId: string,
  checkpoint: LearningCheckpointV1,
  result: LearningCheckpointResultV1,
) {
  return {
    kind: 'tool-result' as const,
    seq: 3,
    time: 3_000,
    callId,
    call: { name: 'learning_checkpoint', argsRaw: JSON.stringify(checkpoint) },
    callTime: 2_000,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

const t = ((key: keyof typeof en, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'interactive-learning'>

function logitExpression(): MathExpressionV1 {
  return {
    op: 'add',
    left: { op: 'variable', name: 'beta0' },
    right: {
      op: 'mul',
      left: { op: 'variable', name: 'beta1' },
      right: { op: 'variable', name: 'x' },
    },
  }
}

/**
 * The main browser fixture mirrors the target teaching turn: two local sliders,
 * observed classes, an intentionally unbounded linear approximation, the
 * logistic curve, and a derived decision boundary.
 */
const logisticVisual: LearningVisualV3 = {
  protocol: VISUAL_PROTOCOL_V3,
  kind: 'parameter_chart',
  title: '为什么逻辑回归需要 Sigmoid',
  description: '橙色虚线展示线性概率近似如何越界；拖动截距和斜率，观察 Sigmoid 如何始终把概率压在 0 到 1 之间。',
  parameters: [
    { id: 'beta0', label: 'β₀（截距）', min: -8, max: 2, step: 0.1, initial: -5 },
    { id: 'beta1', label: 'β₁（斜率）', min: 0.1, max: 5, step: 0.1, initial: 1 },
  ],
  xAxis: { label: '学习时长（小时）', min: 0, max: 10, samples: 160 },
  yAxis: { label: 'P（通过）', min: -0.5, max: 1.5 },
  series: [
    {
      type: 'points',
      id: 'failed-observations',
      label: '不及格（y = 0）',
      tone: 'red',
      points: [1, 1.5, 2, 2.5, 3, 3.5, 4].map(x => ({ x, y: 0 })),
    },
    {
      type: 'points',
      id: 'passed-observations',
      label: '通过（y = 1）',
      tone: 'green',
      points: [5.5, 6, 6.5, 7, 7.5, 8, 9].map(x => ({ x, y: 1 })),
    },
    {
      type: 'curve',
      id: 'linear-probability',
      label: '线性概率近似（可越界）',
      tone: 'orange',
      stroke: 'dashed',
      expression: {
        op: 'add',
        left: { op: 'constant', value: -0.36 },
        right: {
          op: 'mul',
          left: { op: 'constant', value: 0.18 },
          right: { op: 'variable', name: 'x' },
        },
      },
    },
    {
      type: 'curve',
      id: 'logistic-probability',
      label: '逻辑回归（Sigmoid）',
      tone: 'blue',
      stroke: 'solid',
      expression: { op: 'sigmoid', value: logitExpression() },
    },
  ],
  metrics: [{
    id: 'decision-boundary',
    label: '决策边界 P = 0.5 → x =',
    expression: {
      op: 'div',
      left: { op: 'neg', value: { op: 'variable', name: 'beta0' } },
      right: { op: 'variable', name: 'beta1' },
    },
    digits: 1,
    suffix: ' 小时',
  }],
}

function runningVisualBlock() {
  return {
    callId: VISUAL_CALL_ID,
    name: 'learning_visual',
    argsRaw: JSON.stringify(logisticVisual),
    turn: 1,
    step: 1,
    time: 2_000,
    callView: null,
    subCalls: [],
  }
}

function completedVisualBlock() {
  return {
    kind: 'tool-result' as const,
    seq: 3,
    time: 3_000,
    callId: VISUAL_CALL_ID,
    call: { name: 'learning_visual', argsRaw: JSON.stringify(logisticVisual) },
    callTime: 2_000,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ protocol: VISUAL_RESULT_PROTOCOL_V3, status: 'ready' }),
    }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function completedV4VisualBlock(catalogKey: string, visual: LearningVisualV4) {
  const callId = `${VISUAL_V4_CALL_PREFIX}:${catalogKey}`
  return {
    kind: 'tool-result' as const,
    seq: 3,
    time: 3_000,
    callId,
    call: { name: 'learning_visual', argsRaw: JSON.stringify(visual) },
    callTime: 2_000,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }),
    }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

const legacyActivities = {
  parameter_explorer: parameterActivity,
  process_stepper: processActivity,
  structure_compare: compareActivity,
} as const
type LegacyKind = keyof typeof legacyActivities

function legacyResponse(kind: LegacyKind, activityId: string): LearningResponseV1 {
  if (kind === 'parameter_explorer') {
    return {
      protocol: RESPONSE_PROTOCOL,
      activityId,
      action: 'submit',
      answer: { parameters: { slope: 1.5 }, explanation: 'The slope controls the line direction.' },
    }
  }
  if (kind === 'process_stepper') {
    return {
      protocol: RESPONSE_PROTOCOL,
      activityId,
      action: 'submit',
      answer: { checkpoints: ['A'], explanation: 'FIFO removes A first.' },
    }
  }
  return {
    protocol: RESPONSE_PROTOCOL,
    activityId,
    action: 'submit',
    answer: { selectedDifferences: ['lookup_cost'], explanation: 'Arrays support indexed lookup.' },
  }
}

function legacyReplayBlock(kind: LegacyKind, activity: LearningActivityV1) {
  const activityId = `legacy-${kind}`
  return {
    kind: 'tool-result' as const,
    seq: 3,
    time: 3_000,
    callId: `call:${activityId}`,
    call: { name: 'learning_activity', argsRaw: JSON.stringify(activity) },
    callTime: 2_000,
    content: [{ type: 'text' as const, text: JSON.stringify(legacyResponse(kind, activityId)) }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

type BrowserToolBlock =
  | ReturnType<typeof runningVisualBlock>
  | ReturnType<typeof completedVisualBlock>
  | ReturnType<typeof completedV4VisualBlock>
  | ReturnType<typeof runningCheckpointBlock>
  | ReturnType<typeof completedCheckpointBlock>
  | ReturnType<typeof legacyReplayBlock>

const ToolView = LearningToolView as unknown as ComponentType<{
  block: BrowserToolBlock
  inspect(): void
  t: typeof t
  sessionId: string
  useSession(selector: (snapshot: { pending: unknown[] }) => unknown): unknown
}>

/** Visual fixtures never claim the ordinary composer as a pending interaction. */
const useEmptySession = (selector: (snapshot: { pending: unknown[] }) => unknown): unknown =>
  selector({ pending: [] })

type VisualCatalogKey = keyof typeof visualV4Catalog
type FixtureView = 'v4-gallery' | 'v3-running' | 'v3-completed' | 'checkpoint' | 'legacy-replay'

const visualV4Entries = Object.entries(visualV4Catalog) as Array<[VisualCatalogKey, LearningVisualV4]>

function visualDeclaredIds(visual: LearningVisualV4): string[] {
  const { content } = visual
  switch (content.kind) {
    case 'plot': return [...(content.parameters ?? []), ...content.series, ...(content.metrics ?? [])].map(item => item.id)
    case 'node_link': return [...(content.groups ?? []), ...content.nodes, ...content.edges].map(item => item.id)
    case 'scene_2d': return content.elements.map(item => item.id)
    case 'timeline': return [...content.events, ...(content.eras ?? [])].map(item => item.id)
    case 'formula_steps': return content.steps.map(item => item.id)
    case 'study_map': return [...content.sections, ...content.concepts].map(item => item.id)
    case 'recall_deck': return content.cards.map(item => item.id)
    case 'relation':
      switch (content.variant) {
        case 'comparison': return [...content.subjects, ...content.rows].map(item => item.id)
        case 'matrix': return [...content.rows, ...content.columns, ...content.cells].map(item => item.id)
        case 'sets': return [...content.sets, ...content.items].map(item => item.id)
      }
  }
}

interface FixtureReadiness {
  fixtureKey: string
  ready: boolean
  expectedKind: string | null
  renderedKind: string | null
  renderState: string | null
  hasError: boolean
  hasFallback: boolean
  hasMarkdown: boolean
  expectedVisualIds: string[]
  hasNativeContent: boolean
}

const initialReadiness: FixtureReadiness = {
  fixtureKey: '',
  ready: false,
  expectedKind: null,
  renderedKind: null,
  renderState: null,
  hasError: false,
  hasFallback: false,
  hasMarkdown: false,
  expectedVisualIds: [],
  hasNativeContent: false,
}

function sameReadiness(left: FixtureReadiness, right: FixtureReadiness): boolean {
  return left.fixtureKey === right.fixtureKey
    && left.ready === right.ready
    && left.expectedKind === right.expectedKind
    && left.renderedKind === right.renderedKind
    && left.renderState === right.renderState
    && left.hasError === right.hasError
    && left.hasFallback === right.hasFallback
    && left.hasMarkdown === right.hasMarkdown
    && left.expectedVisualIds.join('\u0000') === right.expectedVisualIds.join('\u0000')
    && left.hasNativeContent === right.hasNativeContent
}

function checkpointResultFromRequest(request: unknown): LearningCheckpointResultV1 | undefined {
  try {
    if (typeof request !== 'object' || request === null || !('value' in request)) return undefined
    const value = request.value
    if (typeof value !== 'object' || value === null || !('answer' in value)) return undefined
    const answer = value.answer
    if (typeof answer !== 'object' || answer === null || !('answers' in answer)) return undefined
    const answers = answer.answers
    if (!Array.isArray(answers) || typeof answers[0]?.custom !== 'string') return undefined
    return parseLearningCheckpointResultV1(JSON.parse(answers[0].custom))
  } catch {
    return undefined
  }
}

function BrowserAcceptance() {
  const [mode, setMode] = useState<'learning' | 'standard'>('learning')
  const [view, setView] = useState<FixtureView>('v4-gallery')
  const [visualKey, setVisualKey] = useState<VisualCatalogKey>('derivativePlot')
  const [legacyKind, setLegacyKind] = useState<LegacyKind>('parameter_explorer')
  const [checkpointKind, setCheckpointKind] = useState<LearningCheckpointKindV1>('free_text')
  const [checkpointSession, setCheckpointSession] = useState<CheckpointSessionKey>('a')
  const [checkpointResult, setCheckpointResult] = useState<LearningCheckpointResultV1 | null>(null)
  const [checkpointRespondCount, setCheckpointRespondCount] = useState(0)
  const [checkpointMountEpoch, setCheckpointMountEpoch] = useState(0)
  const [draft, setDraft] = useState('')
  const [sentMessages, setSentMessages] = useState<string[]>([])
  const [readiness, setReadiness] = useState<FixtureReadiness>(initialReadiness)
  const fixtureRef = useRef<HTMLElement>(null)
  const selectedVisual = visualV4Catalog[visualKey]
  const legacyActivity = legacyActivities[legacyKind]()
  const checkpoint = useMemo(() => checkpointFixture(checkpointKind), [checkpointKind])
  const checkpointIds = checkpointIdentity(checkpointSession)
  const respondToCheckpoint = useCallback(async (request: unknown) => {
    const result = checkpointResultFromRequest(request)
    if (result === undefined) return { accepted: false, reason: 'malformed checkpoint receipt' }
    setCheckpointRespondCount(count => count + 1)
    setCheckpointResult(result)
    return { accepted: true }
  }, [])
  const pendingCheckpoint = useMemo(() => ({
    kind: 'question',
    key: `question_${checkpointIds.waitId}`,
    sessionId: checkpointIds.sessionId,
    payload: {
      questions: [{
        id: learningCheckpointQuestionId(checkpointIds.waitId),
        question: checkpoint.prompt,
        detail: encodeLearningCheckpointDetail({ ...checkpointIds, checkpoint }),
      }],
    },
    respond: respondToCheckpoint,
  }), [checkpoint, checkpointIds.callId, checkpointIds.checkpointId, checkpointIds.sessionId, checkpointIds.waitId, respondToCheckpoint])
  const useCheckpointSession = useCallback((selector: (snapshot: { pending: unknown[] }) => unknown): unknown => (
    selector({ pending: checkpointResult === null ? [pendingCheckpoint] : [] })
  ), [checkpointResult, pendingCheckpoint])
  const expectedKind = mode !== 'learning'
    ? null
    : view === 'v4-gallery'
      ? selectedVisual.content.kind
      : view.startsWith('v3-')
        ? logisticVisual.kind
        : view === 'checkpoint'
          ? checkpoint.kind
        : null
  const expectedVisualIds = mode === 'learning' && view === 'v4-gallery'
    ? visualDeclaredIds(selectedVisual)
    : []
  const expectedVisualIdsKey = expectedVisualIds.join('\u0000')
  const activeProtocol = mode !== 'learning'
    ? null
    : view === 'v4-gallery'
      ? VISUAL_PROTOCOL_V4
      : view.startsWith('v3-')
        ? VISUAL_PROTOCOL_V3
        : view === 'checkpoint'
          ? CHECKPOINT_PROTOCOL
        : legacyActivity.protocol
  const activeFixtureKey = mode === 'standard'
    ? 'standard'
    : view === 'v4-gallery'
      ? `${view}:${visualKey}`
      : view === 'checkpoint'
        ? `${view}:${checkpointSession}:${checkpointKind}:${checkpointResult?.status ?? 'pending'}:${String(checkpointMountEpoch)}`
      : view === 'legacy-replay'
        ? `${view}:${legacyKind}`
        : view
  const currentReadiness = readiness.fixtureKey === activeFixtureKey
    ? readiness
    : { ...initialReadiness, fixtureKey: activeFixtureKey, expectedKind }
  const protocolLabel = activeProtocol === VISUAL_PROTOCOL_V4
    ? 'visual@4'
    : activeProtocol === VISUAL_PROTOCOL_V3
      ? 'visual@3 replay'
      : activeProtocol === CHECKPOINT_PROTOCOL
        ? 'checkpoint@1'
      : activeProtocol === null
        ? 'none'
        : 'activity@1 replay'

  useEffect(() => {
    const host = fixtureRef.current
    if (host === null) return

    const measure = (): void => {
      const renderedVisual = host.querySelector<HTMLElement>('[data-learning-visual]')
      const renderedCheckpoint = host.querySelector<HTMLElement>('[data-learning-checkpoint]')
      const completedCheckpoint = host.querySelector<HTMLElement>('[data-learning-result="submitted"], [data-learning-result="skipped"], [data-learning-result="cancelled"]')
      const renderedKind = renderedVisual?.dataset.learningVisual ?? renderedCheckpoint?.dataset.learningCheckpoint ?? null
      const renderState = renderedVisual?.dataset.renderState
        ?? completedCheckpoint?.dataset.learningResult
        ?? (renderedCheckpoint === null ? null : 'pending')
      const hasError = host.querySelector('[data-learning-result="error"], [role="alert"]') !== null
      const hasFallback = host.querySelector('[data-learning-fallback]') !== null
      const hasMarkdown = [...host.querySelectorAll('[data-markdown-text]')].some(node => (
        node.closest('[data-learning-visual][data-render-state="ready"]') === null
      ))
      const expectedVisualIdSet = new Set(expectedVisualIds)
      const hasNativeContent = expectedVisualIds.length === 0 || Array.from(
        renderedVisual?.querySelectorAll<HTMLElement>('[data-visual-id]') ?? [],
      ).some(node => expectedVisualIdSet.has(node.dataset.visualId ?? ''))
      const hasCompletedLegacyResult = host.querySelector('[data-learning-result]:not([data-learning-result="error"])') !== null
      const ready = mode === 'standard'
          ? host.matches('[data-testid="standard-clean"]') && !hasMarkdown
        : view === 'legacy-replay'
          ? hasCompletedLegacyResult && !hasError && !hasFallback && !hasMarkdown
        : view === 'checkpoint'
          ? checkpointResult === null
            ? renderedKind === checkpoint.kind && renderState === 'pending' && !hasError && !hasFallback && !hasMarkdown
            : renderState === checkpointResult.status && !hasError && !hasFallback && !hasMarkdown
        : renderedKind === expectedKind
            && (view !== 'v4-gallery' || (renderState === 'ready' && hasNativeContent))
            && !hasError
            && !hasFallback
            && !hasMarkdown
      const next = { fixtureKey: activeFixtureKey, ready, expectedKind, renderedKind, renderState, hasError, hasFallback, hasMarkdown, expectedVisualIds, hasNativeContent }
      setReadiness(current => sameReadiness(current, next) ? current : next)
    }

    measure()
    const observer = new MutationObserver(measure)
    observer.observe(host, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [activeFixtureKey, checkpoint.kind, checkpointResult, expectedKind, expectedVisualIdsKey, legacyKind, mode, view, visualKey])

  useEffect(() => {
    ;(window as unknown as { __LEARNING_ACCEPTANCE__: unknown }).__LEARNING_ACCEPTANCE__ = {
      mode,
      view,
      protocol: activeProtocol,
      visualKey: view === 'v4-gallery' ? visualKey : null,
      visualKind: expectedKind,
      catalogKeys: visualV4Entries.map(([key]) => key),
      checkpoint: view === 'checkpoint' ? {
        kind: checkpoint.kind,
        sessionId: checkpointIds.sessionId,
        callId: checkpointIds.callId,
        waitId: checkpointIds.waitId,
        checkpointId: checkpointIds.checkpointId,
        status: checkpointResult?.status ?? 'pending',
        respondCount: checkpointRespondCount,
        storageKey: `dsh-learning/checkpoint@1:${checkpointIds.waitId}`,
      } : null,
      readiness: currentReadiness,
      ready: currentReadiness.ready,
      rendererReady: currentReadiness.ready,
      pending: mode === 'learning' && view === 'checkpoint' && checkpointResult === null ? [checkpointIds.waitId] : [],
      pendingCount: mode === 'learning' && view === 'checkpoint' && checkpointResult === null ? 1 : 0,
      fixtureComposerEnabled: true,
      sentMessages,
    }
  }, [activeProtocol, checkpoint.kind, checkpointIds.callId, checkpointIds.checkpointId, checkpointIds.sessionId, checkpointIds.waitId, checkpointRespondCount, checkpointResult, currentReadiness, expectedKind, mode, sentMessages, view, visualKey])

  const sendMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const message = draft.trim()
    if (message === '') return
    setSentMessages(current => [...current, message])
    setDraft('')
  }

  const openCheckpoint = (kind: LearningCheckpointKindV1 = checkpointKind): void => {
    setMode('learning')
    setView('checkpoint')
    if (kind !== checkpointKind) {
      try {
        sessionStorage.removeItem(`dsh-learning/checkpoint@1:${checkpointIds.waitId}`)
      } catch {}
      setCheckpointKind(kind)
    }
    setCheckpointResult(null)
    setCheckpointMountEpoch(epoch => epoch + 1)
  }

  const switchCheckpointSession = (session: CheckpointSessionKey): void => {
    setCheckpointSession(session)
    setCheckpointResult(null)
    setCheckpointMountEpoch(epoch => epoch + 1)
  }

  const resetCheckpoint = (): void => {
    try {
      sessionStorage.removeItem(`dsh-learning/checkpoint@1:${checkpointIds.waitId}`)
    } catch {}
    setCheckpointResult(null)
    setCheckpointMountEpoch(epoch => epoch + 1)
  }

  return (
    <main>
      <header className="acceptance-header">
        <div>
          <p className="kicker">Learning visual V4 gallery</p>
          <h1>Renderer browser fixture</h1>
          <p>切换真实 ToolView 渲染器，确认图形没有降级为 Markdown；下方输入框只用于组件页隔离检查。</p>
        </div>
        <div className="mode-row" role="group" aria-label="Agent preset">
          <button type="button" aria-pressed={mode === 'learning'} onClick={() => setMode('learning')}>Learning preset</button>
          <button type="button" aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>Standard preset</button>
        </div>
      </header>

      <nav aria-label="ToolView fixtures">
        <button type="button" aria-pressed={view === 'v4-gallery'} onClick={() => { setMode('learning'); setView('v4-gallery') }}>
          V4 renderer gallery
        </button>
        <button type="button" aria-pressed={view === 'v3-running'} onClick={() => { setMode('learning'); setView('v3-running') }}>
          V3 running ToolView
        </button>
        <button type="button" aria-pressed={view === 'v3-completed'} onClick={() => { setMode('learning'); setView('v3-completed') }}>
          V3 completed ToolView
        </button>
        <button type="button" aria-pressed={view === 'checkpoint'} onClick={() => openCheckpoint()}>
          Checkpoint gate
        </button>
        <button type="button" aria-pressed={view === 'legacy-replay'} onClick={() => { setMode('learning'); setView('legacy-replay') }}>
          Legacy V1 replay
        </button>
      </nav>

      <section className="status" aria-label="Acceptance status">
        <span>Mode <strong>{mode}</strong></span>
        <span>Protocol <strong>{protocolLabel}</strong></span>
        <span>
          Renderer <strong data-testid="visual-readiness" data-ready={String(currentReadiness.ready)} data-render-state={currentReadiness.renderState ?? undefined}>{currentReadiness.ready ? 'ready' : 'not ready'}</strong>
        </span>
        <span>Pending interactions <strong data-testid="pending-count">{mode === 'learning' && view === 'checkpoint' && checkpointResult === null ? 1 : 0}</strong></span>
        <span>Fixture composer <strong>available</strong></span>
      </section>

      <section className="conversation-shell">
        {mode === 'standard' ? (
          <article ref={fixtureRef} className="assistant-turn standard-clean" data-testid="standard-clean">
            Standard preset 不渲染 Learning 工具；下方仅保留组件页自己的测试输入框。
          </article>
        ) : view === 'v4-gallery' ? (
          <article
            ref={fixtureRef}
            className="assistant-turn"
            data-testid="v4-gallery"
            data-visual-key={visualKey}
            data-visual-kind={selectedVisual.content.kind}
          >
            <p>这是 visual@4 的完整浏览器画廊。每个选项都通过已完成的 ToolView 与 ready result 渲染。</p>
            <div className="legacy-toolbar" role="group" aria-label="Visual V4 gallery">
              <span>选择图形：</span>
              {visualV4Entries.map(([key, visual]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`${key}: ${visual.title} (${visual.content.kind})`}
                  aria-pressed={visualKey === key}
                  data-testid={`v4-choice-${key}`}
                  data-visual-kind={visual.content.kind}
                  onClick={() => setVisualKey(key)}
                >
                  {key} · {visual.content.kind}
                </button>
              ))}
            </div>
            <div className="tool-state" data-state="completed">
              ToolView: completed visual@4 result · {visualKey} · pending=[]
            </div>
            <div data-testid="v4-completed-tool-view" data-visual-key={visualKey}>
              <ToolView
                key={visualKey}
                block={completedV4VisualBlock(visualKey, selectedVisual)}
                inspect={() => {}}
                t={t}
                sessionId={SESSION_ID}
                useSession={useEmptySession}
              />
            </div>
            <p className="continuation" data-testid="same-turn-continuation">
              当前组件是 <strong>{selectedVisual.content.kind}</strong>，标题为“{selectedVisual.title}”。切换后应直接出现对应图形，而不是 Markdown fallback。
            </p>
          </article>
        ) : view === 'checkpoint' ? (
          <article
            ref={fixtureRef}
            className="assistant-turn"
            data-testid="checkpoint-fixture"
            data-checkpoint-session={checkpointSession}
            data-checkpoint-status={checkpointResult?.status ?? 'pending'}
          >
            <p>This is one answer-free, optional checkpoint. It owns one pending wait; the separate input below belongs only to this component harness.</p>
            <div className="legacy-toolbar checkpoint-toolbar" role="group" aria-label="Checkpoint fixture controls">
              <span>Kind:</span>
              <button type="button" aria-pressed={checkpointKind === 'free_text'} onClick={() => openCheckpoint('free_text')}>Free text</button>
              <button type="button" aria-pressed={checkpointKind === 'single_choice'} onClick={() => openCheckpoint('single_choice')}>Single choice</button>
              <span>Session:</span>
              <button type="button" aria-pressed={checkpointSession === 'a'} onClick={() => switchCheckpointSession('a')}>Session A</button>
              <button type="button" aria-pressed={checkpointSession === 'b'} onClick={() => switchCheckpointSession('b')}>Session B</button>
              <button type="button" data-testid="checkpoint-remount" disabled={checkpointResult !== null} onClick={() => setCheckpointMountEpoch(epoch => epoch + 1)}>Simulate refresh</button>
              <button type="button" data-testid="checkpoint-reset" onClick={resetCheckpoint}>Fresh pending</button>
            </div>
            <div className="tool-state" data-state={checkpointResult === null ? 'running' : 'completed'}>
              ToolView: checkpoint@1 · {checkpointResult?.status ?? 'pending'} · session {checkpointSession.toUpperCase()}
            </div>
            <div data-testid="checkpoint-tool-view">
              <ToolView
                key={`${checkpointSession}:${checkpointKind}:${String(checkpointMountEpoch)}:${checkpointResult?.status ?? 'pending'}`}
                block={checkpointResult === null
                  ? runningCheckpointBlock(checkpointIds.callId, checkpoint)
                  : completedCheckpointBlock(checkpointIds.callId, checkpoint, checkpointResult)}
                inspect={() => {}}
                t={t}
                sessionId={checkpointIds.sessionId}
                useSession={useCheckpointSession}
              />
            </div>
            <p className="continuation" data-testid="checkpoint-continuation">
              Respond callbacks: <strong data-testid="checkpoint-respond-count">{checkpointRespondCount}</strong>. No reveal or Continue gate follows a terminal result.
            </p>
          </article>
        ) : view === 'legacy-replay' ? (
          <article ref={fixtureRef} className="assistant-turn" data-testid="legacy-replay">
            <div className="legacy-toolbar" role="group" aria-label="Legacy replay kind">
              <span>Optional legacy replay:</span>
              {(Object.keys(legacyActivities) as LegacyKind[]).map(kind => (
                <button key={kind} type="button" aria-pressed={legacyKind === kind} onClick={() => setLegacyKind(kind)}>
                  {kind}
                </button>
              ))}
            </div>
            <ToolView
              block={legacyReplayBlock(legacyKind, legacyActivity)}
              inspect={() => {}}
              t={t}
              sessionId={SESSION_ID}
              useSession={useEmptySession}
            />
          </article>
        ) : (
          <article ref={fixtureRef} className="assistant-turn" data-testid={view === 'v3-running' ? 'v3-running-tool-view' : 'v3-completed-tool-view'}>
            <p>逻辑回归的出发点只有一个：我们想用一条曲线预测<strong>概率</strong>，但普通线性输出会越过 0 和 1。</p>
            <p>拖动下面两个参数。橙色虚线代表会越界的线性近似，蓝色实线则经过 Sigmoid 压缩。</p>
            <div className="tool-state" data-state={view === 'v3-running' ? 'running' : 'completed'}>
              ToolView: {view === 'v3-running' ? 'running call' : 'completed result'} · pending=[]
            </div>
            <ToolView
              block={view === 'v3-running' ? runningVisualBlock() : completedVisualBlock()}
              inspect={() => {}}
              t={t}
              sessionId={SESSION_ID}
              useSession={useEmptySession}
            />
            <p className="continuation" data-testid="same-turn-continuation">
              关键点：不论参数怎样变化，蓝色曲线始终位于 0 到 1 之间；P = 0.5 所在的 x 就是当前决策边界。你觉得增大 β₁ 会让边界附近的曲线更陡还是更平？
            </p>
          </article>
        )}

        {sentMessages.map((message, index) => (
          <p className="user-message" data-testid="sent-message" key={`${String(index)}:${message}`}>{message}</p>
        ))}

        <form className="ordinary-composer" data-testid="ordinary-composer" onSubmit={sendMessage}>
          <label htmlFor="ordinary-message">组件页测试输入</label>
          <div>
            <textarea
              id="ordinary-message"
              aria-label="Message"
              placeholder="此输入框不代表真实 Host composer…"
              rows={2}
              value={draft}
              onChange={event => setDraft(event.target.value)}
            />
            <button type="submit" disabled={draft.trim() === ''}>发送</button>
          </div>
        </form>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<BrowserAcceptance />)
