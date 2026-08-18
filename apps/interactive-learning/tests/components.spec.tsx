// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ComponentType } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ActivityRendererRegistry, activityRendererRegistry } from '../src/client/ActivityRenderer.tsx'
import { LearningVisual } from '../src/client/LearningVisual.tsx'
import { LearningCheckpoint } from '../src/client/LearningCheckpoint.tsx'
import { LearningToolView } from '../src/client/LearningToolView.tsx'
import { LEARNING_TOOL_VIEW_KEYS, LearningStateUpdateToolView } from '../src/client/index.ts'
import { subscribeLearningUiLifecycle } from '../src/client/lifecycle.ts'
import { en } from '../src/client/locales.ts'
import {
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  VISUAL_RESULT_PROTOCOL_V3,
  VISUAL_RESULT_PROTOCOL_V4,
  parseLearningVisualV4,
  type LearningCheckpointKindV1,
  type LearningCheckpointResponseV1,
  type LearningCheckpointV1,
  type LearningVisualV4,
} from '../src/protocol.ts'
import {
  encodeLearningCheckpointDetail,
  learningCheckpointQuestionId,
} from '../src/transport.ts'
import { logisticVisual, questionRound, visualV4Catalog } from './fixtures.ts'

const t = ((key: keyof typeof en, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'interactive-learning'>

const ToolView = LearningToolView as unknown as ComponentType<{
  block: unknown
  inspect(): void
  t: typeof t
  sessionId: string
  useSession(selector: (snapshot: { pending: unknown[] }) => unknown): unknown
}>

const useEmptySession = (selector: (snapshot: { pending: unknown[] }) => unknown): unknown => (
  selector({ pending: [] })
)

function completedVisualV4Block(visual: LearningVisualV4, callId: string) {
  return {
    kind: 'tool-result',
    seq: 3,
    time: 3_000,
    callId,
    call: { name: 'learning_visual', argsRaw: JSON.stringify(visual) },
    callTime: 2_000,
    content: [{
      type: 'text',
      text: JSON.stringify({ protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }),
    }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function checkpointFixture(
  kind: LearningCheckpointKindV1 = 'free_text',
  overrides: Partial<LearningCheckpointV1> = {},
): LearningCheckpointV1 {
  return {
    protocol: CHECKPOINT_PROTOCOL,
    kind,
    prompt: kind === 'single_choice' ? 'Which queue item leaves first?' : 'Explain what changes next.',
    context: 'Use the current example only.',
    expectedEvidence: kind === 'prediction' ? 'prediction' : 'attempt',
    ...(kind === 'single_choice' ? { options: [
      { id: 'first', label: 'The first item' },
      { id: 'last', label: 'The last item' },
    ] } : {}),
    fallbackMarkdown: 'Pause and contribute one step before continuing.',
    ...overrides,
  }
}

function runningCheckpointHarness(checkpoint = checkpointFixture(), ids: {
  sessionId?: string
  callId?: string
  waitId?: string
  checkpointId?: string
} = {}) {
  const sessionId = ids.sessionId ?? 'session_checkpoint'
  const callId = ids.callId ?? 'call_checkpoint'
  const waitId = ids.waitId ?? 'wait_checkpoint'
  const checkpointId = ids.checkpointId ?? 'checkpoint_one'
  const respond = vi.fn().mockResolvedValue({ accepted: true })
  const pending = {
    kind: 'question',
    key: `question_${waitId}`,
    sessionId,
    payload: {
      questions: [{
        id: learningCheckpointQuestionId(waitId),
        question: checkpoint.prompt,
        detail: encodeLearningCheckpointDetail({ sessionId, callId, waitId, checkpointId, checkpoint }),
      }],
    },
    respond,
  }
  return {
    sessionId,
    callId,
    waitId,
    checkpointId,
    respond,
    pending,
    block: {
      seq: 1,
      time: 1_000,
      callId,
      name: 'learning_checkpoint',
      argsRaw: JSON.stringify(checkpoint),
    },
    usePendingSession: (selector: (snapshot: { pending: unknown[] }) => unknown): unknown => (
      selector({ pending: [pending] })
    ),
  }
}

function completedCheckpointBlock(
  checkpoint: LearningCheckpointV1,
  result: unknown,
  options: { callId?: string; isError?: boolean; argsRaw?: string } = {},
) {
  const callId = options.callId ?? 'call_checkpoint_complete'
  return {
    kind: 'tool-result',
    seq: 3,
    time: 3_000,
    callId,
    call: {
      name: 'learning_checkpoint',
      argsRaw: options.argsRaw ?? JSON.stringify(checkpoint),
    },
    callTime: 2_000,
    content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
    isError: options.isError ?? false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function customResponseOf(respond: ReturnType<typeof vi.fn>, call = 0): unknown {
  const request = respond.mock.calls[call]?.[0] as {
    value?: { answer?: { answers?: Array<{ custom?: string }> } }
  } | undefined
  const custom = request?.value?.answer?.answers?.[0]?.custom
  return custom === undefined ? undefined : JSON.parse(custom)
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('learning client registration', () => {
  it('retains only the three trusted V1 renderers for historical activity replay', () => {
    expect(activityRendererRegistry.kinds()).toEqual([
      'parameter_explorer',
      'process_stepper',
      'structure_compare',
    ])
    const registry = new ActivityRendererRegistry()
    const renderer = (() => null) as never
    registry.register('parameter_explorer', renderer)
    expect(() => registry.register('parameter_explorer', renderer)).toThrow(/already registered/)
  })

  it('registers visual/checkpoint routes, a silent state route, and legacy replay keys', () => {
    expect(LEARNING_TOOL_VIEW_KEYS).toEqual([
      'learning_visual',
      'learning_checkpoint',
      'learning_state_update',
      'learning_activity',
      'learning_question',
      'learning_reveal',
    ])
    const silent = render(<LearningStateUpdateToolView />)
    expect(silent.container.innerHTML).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
    expect(document.body.textContent).not.toContain(en.invalidActivity)
  })
})

describe('non-blocking LearningVisual v3', () => {
  it('updates its curve and metric from sliders while retaining point observations', () => {
    const visual = logisticVisual()
    const view = render(<LearningVisual visual={visual} storageKey="logistic" />)

    expect(screen.getByRole('heading', { name: 'Logistic regression boundary' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Logistic regression boundary' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Logistic regression boundary' }).textContent).toContain('Observed outcomes')
    expect(view.container.querySelectorAll('[data-series="observations"] circle')).toHaveLength(2)
    expect(view.container.querySelector('[data-series="observations"] title')?.textContent).toBe('Failed after 1 hour')

    const curve = view.container.querySelector('path[data-tone="blue"]')
    const initialPath = curve?.getAttribute('d')
    expect(initialPath).toBeTruthy()
    expect(screen.getByText('Decision boundary').parentElement?.textContent).toContain('5.0 h')

    const slope = screen.getByRole('slider', { name: 'Slope' }) as HTMLInputElement
    fireEvent.change(slope, { target: { value: '2' } })
    expect(slope.value).toBe('2')
    expect(curve?.getAttribute('d')).not.toBe(initialPath)
    expect(screen.getByText('Decision boundary').parentElement?.textContent).toContain('2.5 h')
    expect(JSON.parse(sessionStorage.getItem('dsh-learning/visual@3:logistic') ?? '{}')).toMatchObject({
      b0: -5,
      b1: 2,
    })

    expect(screen.queryByRole('button')).toBeNull()
    expect(view.container.textContent).not.toMatch(/Submit|Continue/)
  })

  it('restores local parameter state on a replay without producing an answer gate', () => {
    const visual = logisticVisual()
    const first = render(<LearningVisual visual={visual} storageKey="stable-call" />)
    fireEvent.change(screen.getByRole('slider', { name: 'Intercept' }), { target: { value: '-2' } })
    first.unmount()

    const replay = render(<LearningVisual visual={visual} storageKey="stable-call" />)
    expect((screen.getByRole('slider', { name: 'Intercept' }) as HTMLInputElement).value).toBe('-2')
    expect(replay.container.querySelector('[data-learning-visual="parameter_chart"]')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('bounds tick generation and keeps finite SVG geometry for extreme finite axes', () => {
    const visual = logisticVisual()
    const view = render(<LearningVisual visual={{
      ...visual,
      xAxis: { ...visual.xAxis, min: -1e308, max: 1e308, samples: 24 },
      yAxis: { ...visual.yAxis, min: -1e308, max: 1e308 },
    }} storageKey="extreme-axes" />)

    expect(screen.getByRole('img', { name: 'Logistic regression boundary' })).toBeTruthy()
    expect(view.container.querySelectorAll('line').length).toBeLessThan(60)
    expect(view.container.innerHTML).not.toMatch(/(?:NaN|Infinity)/)
  })
})

describe('learning_visual tool-call replay', () => {
  it('shows a neutral running state only until arguments form a valid visual', () => {
    const events: string[] = []
    const unsubscribe = subscribeLearningUiLifecycle(event => events.push(event.name))
    const block = {
      seq: 1,
      time: 1_000,
      callId: 'visual-running',
      name: 'learning_visual',
      argsRaw: '{"protocol":"dsh-learning/visual@3","kind":"parameter_chart","title":"Logistic',
    }
    const view = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useEmptySession} />,
    )
    expect(screen.getByRole('status').textContent).toContain('Preparing')
    expect(screen.queryByText(/could not be displayed safely/)).toBeNull()
    expect(events).toEqual(['learning.call.stream_started'])

    view.rerender(
      <ToolView
        block={{ ...block, argsRaw: JSON.stringify(logisticVisual()) }}
        inspect={() => {}}
        t={t}
        sessionId="s1"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByRole('slider', { name: 'Slope' })).toBeTruthy()
    expect(view.container.querySelector('[data-state="running"]')).toBeNull()
    expect(events).toEqual(['learning.call.stream_started', 'learning.call.args_completed'])
    unsubscribe()
  })

  it('replays the same interactive chart from a completed ready result', () => {
    const visual = logisticVisual()
    const block = {
      kind: 'tool-result',
      seq: 3,
      time: 3_000,
      callId: 'visual-complete',
      call: { name: 'learning_visual', argsRaw: JSON.stringify(visual) },
      callTime: 2_000,
      content: [{
        type: 'text',
        text: JSON.stringify({ protocol: VISUAL_RESULT_PROTOCOL_V3, status: 'ready' }),
      }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    }
    const first = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useEmptySession} />,
    )
    fireEvent.change(screen.getByRole('slider', { name: 'Slope' }), { target: { value: '3' } })
    expect(first.container.querySelectorAll('[data-series="observations"] circle')).toHaveLength(2)
    first.unmount()

    const replay = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useEmptySession} />,
    )
    expect((screen.getByRole('slider', { name: 'Slope' }) as HTMLInputElement).value).toBe('3')
    expect(screen.getByText('Decision boundary').parentElement?.textContent).toContain('1.7 h')
    expect(replay.container.querySelector('path[data-tone="blue"]')?.getAttribute('d')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('semantic LearningVisual v4 completed ToolView gallery', () => {
  const entries = Object.entries(visualV4Catalog) as Array<[
    keyof typeof visualV4Catalog,
    LearningVisualV4,
  ]>

  it.each(entries)('parses and renders %s natively without Markdown downgrade', (name, source) => {
    const visual = parseLearningVisualV4(source)
    const view = render(
      <ToolView
        block={completedVisualV4Block(visual, `v4-${name}`)}
        inspect={() => {}}
        t={t}
        sessionId="s-v4"
        useSession={useEmptySession}
      />,
    )
    const root = view.container.querySelector(`[data-learning-visual="${visual.content.kind}"]`)
    expect(root, `${name} did not reach its native V4 renderer`).toBeTruthy()
    expect(root?.getAttribute('data-render-state')).toBe('ready')
    expect(view.container.querySelector('[data-learning-result="error"]')).toBeNull()
    expect(view.container.querySelector('[data-learning-fallback]')).toBeNull()
    expect([...view.container.querySelectorAll('[data-markdown-text]')].filter(node => !root?.contains(node))).toHaveLength(0)
    expect(view.container.querySelector('[role="alert"]')).toBeNull()

    if (visual.content.kind === 'plot') {
      const svg = root?.querySelector('svg[role="img"]')
      const curve = root?.querySelector('[data-visual-id="function"]')
      expect(svg).toBeTruthy()
      expect(curve?.tagName.toLocaleLowerCase()).toBe('path')
      const initialPath = curve?.getAttribute('d')
      expect(initialPath).toBeTruthy()
      const slider = screen.getByRole('slider', { name: /^指数 n/ }) as HTMLInputElement
      fireEvent.change(slider, { target: { value: '2' } })
      expect(slider.value).toBe('2')
      expect(root?.querySelector('[data-visual-id="function"]')?.getAttribute('d')).not.toBe(initialPath)
      expect(screen.getByText('x = 1 处切线斜率').parentElement?.textContent).toContain('2.0')
      return
    }

    if (visual.content.kind === 'node_link') {
      expect(root?.querySelector('svg[role="group"]')).toBeTruthy()
      expect(root?.querySelectorAll('[data-visual-id^="w_"]')).toHaveLength(12)
      expect(root?.querySelectorAll('[data-visual-id^="v_"]')).toHaveLength(8)
      const inputNode = root?.querySelector('[data-visual-id="x1"]')
      const hiddenNode = root?.querySelector('[data-visual-id="h1"]')
      expect(inputNode?.getAttribute('data-focus-state')).toBe('focus')
      expect(hiddenNode?.getAttribute('data-focus-state')).toBe('dim')
      fireEvent.click(screen.getByRole('button', { name: en.visualNextStep }))
      expect(hiddenNode?.getAttribute('data-focus-state')).toBe('focus')
      fireEvent.click(hiddenNode as Element)
      expect(hiddenNode?.getAttribute('data-selected')).toBe('true')
      expect(screen.getByText('隐藏单元：加权求和后通过激活函数')).toBeTruthy()
      return
    }

    if (visual.content.kind === 'scene_2d') {
      expect(root?.querySelector('svg[role="group"]')).toBeTruthy()
      expect(root?.querySelector('[data-visual-id="parallelogram"] polygon')).toBeTruthy()
      const sum = root?.querySelector('[data-visual-id="vector_sum"]')
      expect(sum?.querySelectorAll('line')).toHaveLength(2)
      fireEvent.click(sum as Element)
      expect(sum?.getAttribute('data-selected')).toBe('true')
      expect(screen.getByText('合向量直接连接共同起点和最终端点。')).toBeTruthy()
      return
    }

    if (visual.content.kind === 'timeline') {
      expect(root?.querySelector(`[aria-label="${en.visualTimelineLabel}"]`)).toBeTruthy()
      expect(root?.querySelectorAll('[data-visual-id]')).toHaveLength(6)
      const event = root?.querySelector('[data-visual-id="perceptron"]')
      expect(event?.tagName.toLocaleLowerCase()).toBe('button')
      fireEvent.click(event as Element)
      expect(screen.getByText('用可学习权重完成线性分类。')).toBeTruthy()
      expect(screen.getByRole('button', { name: en.visualCloseDetail })).toBeTruthy()
      return
    }

    if (visual.content.kind === 'formula_steps') {
      expect(root?.querySelector(`[aria-label="${en.visualFormulaLabel}"]`)).toBeTruthy()
      const initialStep = root?.querySelector<HTMLElement>('[data-visual-id="limit_definition"]')
      const initialKatex = initialStep?.querySelector<HTMLElement>('.katex')
      expect(initialStep).toBeTruthy()
      expect(initialKatex).toBeTruthy()
      expect(initialKatex?.closest('[hidden], [aria-hidden="true"]')).toBeNull()
      expect(initialKatex === undefined ? 'none' : getComputedStyle(initialKatex).display).not.toBe('none')
      expect(initialStep?.textContent).not.toContain('$$')
      expect(root?.querySelector('[data-visual-id="expand_square"]')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: en.visualRevealNextFormulaStep }))
      const expandedStep = root?.querySelector<HTMLElement>('[data-visual-id="expand_square"]')
      expect(expandedStep?.querySelector('.katex')).toBeTruthy()
      expect(expandedStep?.textContent).not.toContain('$$')
      expect(screen.getByText('完全平方公式')).toBeTruthy()
      expect(screen.getByText(t('visualFormulaProgress', { current: 2, total: 4 }))).toBeTruthy()
      return
    }

    if (visual.content.kind === 'study_map') {
      expect(root?.querySelector(`[aria-label="${en.visualStudySections}"]`)).toBeTruthy()
      const section = root?.querySelector('[data-visual-id="derivatives_section"]')
      expect(section?.getAttribute('role')).toBe('tab')
      fireEvent.click(section as Element)
      expect(section?.getAttribute('aria-selected')).toBe('true')
      const concept = root?.querySelector('[data-visual-id="derivative_definition"]')
      expect(concept).toBeTruthy()
      fireEvent.click(concept as Element)
      expect(concept?.getAttribute('data-selected')).toBe('true')
      expect(screen.getByText('差商在 Δx→0 时的极限。')).toBeTruthy()
      return
    }

    if (visual.content.kind === 'recall_deck') {
      expect(root?.querySelector(`[aria-label="${en.visualRecallDeckLabel}"]`)).toBeTruthy()
      const card = root?.querySelector('[data-visual-id="power_rule"]')
      expect(card?.getAttribute('data-stage')).toBe('prompt')
      fireEvent.click(screen.getByRole('button', { name: en.visualShowHint }))
      expect(card?.getAttribute('data-stage')).toBe('hint')
      expect(screen.getByText('指数移到前面，再减 1。')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: en.visualShowAnswer }))
      expect(card?.getAttribute('data-stage')).toBe('answer')
      expect(screen.getByText('n·xⁿ⁻¹')).toBeTruthy()
      const mastered = screen.getByRole('button', { name: en.visualMastered })
      fireEvent.click(mastered)
      expect(mastered.getAttribute('aria-pressed')).toBe('true')
      expect(root?.querySelector('output')?.textContent).toContain('1 mastered')
      fireEvent.click(screen.getByRole('button', { name: new RegExp(en.visualNextCard) }))
      expect(root?.getAttribute('data-render-state')).toBe('ready')
      expect(root?.querySelector('[data-visual-id="power_rule"]')).toBeNull()
      expect(root?.querySelector('[data-visual-id="product_rule"]')?.getAttribute('data-stage')).toBe('prompt')
      return
    }

    expect(visual.content.kind).toBe('relation')
    if (visual.content.kind !== 'relation') throw new Error('fixture mismatch')
    if (visual.content.variant === 'comparison') {
      expect(root?.querySelector('table caption')?.textContent).toBe(en.visualComparisonCaption)
      const subject = screen.getByRole('button', { name: '数组' })
      fireEvent.click(subject)
      expect(screen.getByText('连续内存中的索引序列。')).toBeTruthy()
      expect(screen.getByRole('button', { name: en.visualCloseDetail })).toBeTruthy()
      return
    }
    if (visual.content.variant === 'matrix') {
      expect(root?.querySelector('table caption')?.textContent).toBe(en.visualMatrixCaption)
      const cell = screen.getByRole('button', { name: '∂u/∂x' })
      fireEvent.click(cell)
      expect(screen.getByText('x 对 u 的局部影响。')).toBeTruthy()
      expect(screen.getByRole('button', { name: en.visualCloseDetail })).toBeTruthy()
      return
    }
    expect(root?.querySelector(`[aria-label="${en.visualSetsLabel}"]`)).toBeTruthy()
    const sharedItem = screen.getByRole('button', { name: /6/ })
    fireEvent.click(sharedItem)
    expect(screen.getByText('6 同时能被 2 和 3 整除。')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.visualCloseDetail })).toBeTruthy()
  })

  it('retains local plot state when a completed V4 call is replayed', () => {
    const visual = parseLearningVisualV4(visualV4Catalog.derivativePlot)
    const block = completedVisualV4Block(visual, 'v4-plot-replay')
    const first = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s-v4" useSession={useEmptySession} />,
    )
    fireEvent.change(screen.getByRole('slider', { name: /^指数 n/ }), { target: { value: '1.5' } })
    first.unmount()

    const replay = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s-v4" useSession={useEmptySession} />,
    )
    expect((screen.getByRole('slider', { name: /^指数 n/ }) as HTMLInputElement).value).toBe('1.5')
    expect(replay.container.querySelector('[data-learning-visual="plot"]')).toBeTruthy()
    expect(replay.container.querySelector('[data-learning-fallback]')).toBeNull()
  })
})

describe('learning_checkpoint client gate and replay', () => {
  const checkpointCases: Array<{
    kind: LearningCheckpointKindV1
    role: 'textbox' | 'spinbutton' | 'radio'
    value: string
    response: LearningCheckpointResponseV1
    label: string
  }> = [
    { kind: 'free_text', role: 'textbox', value: 'A short explanation', response: { text: 'A short explanation' }, label: en.checkpointFreeTextLabel },
    { kind: 'single_choice', role: 'radio', value: 'first', response: { optionId: 'first' }, label: 'The first item' },
    { kind: 'numeric', role: 'spinbutton', value: '3.5', response: { number: 3.5 }, label: en.checkpointNumericLabel },
    { kind: 'prediction', role: 'textbox', value: 'It increases', response: { text: 'It increases' }, label: en.checkpointPredictionLabel },
    { kind: 'code_slot', role: 'textbox', value: 'return head.next', response: { text: 'return head.next' }, label: en.checkpointCodeLabel },
  ]

  it.each(checkpointCases)('renders and submits an accessible $kind contribution', async ({ kind, role, value, response, label }) => {
    const checkpoint = checkpointFixture(kind)
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <LearningCheckpoint
        checkpoint={checkpoint}
        storageKey={`direct_${kind}`}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onSkip={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
        t={t}
      />,
    )

    const heading = screen.getByRole('heading', { name: checkpoint.prompt })
    expect(view.container.querySelector('[data-learning-checkpoint]')?.getAttribute('aria-labelledby')).toBe(heading.id)
    const input = screen.getByRole(role, { name: label }) as HTMLInputElement | HTMLTextAreaElement
    if (role === 'radio') fireEvent.click(input)
    else fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: en.submit }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(response))
    expect(screen.getByRole('button', { name: en.skip })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.cancel })).toBeTruthy()
  })

  it('submits a single-choice option id even when visible labels are identical', async () => {
    const checkpoint = checkpointFixture('single_choice', {
      options: [
        { id: 'first-id', label: 'Same visible label' },
        { id: 'second-id', label: 'Same visible label' },
      ],
    })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningCheckpoint
        checkpoint={checkpoint}
        storageKey="duplicate-labels"
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onSkip={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
        t={t}
      />,
    )

    const choices = screen.getAllByRole('radio', { name: 'Same visible label' })
    fireEvent.click(choices[1]!)
    fireEvent.click(screen.getByRole('button', { name: en.submit }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ optionId: 'second-id' }))
  })

  it('restores a same-wait draft after refresh and reuses one receipt across retries', async () => {
    const harness = runningCheckpointHarness()
    const first = render(
      <ToolView
        block={harness.block}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    const draft = screen.getByRole('textbox', { name: en.checkpointFreeTextLabel }) as HTMLTextAreaElement
    fireEvent.change(draft, { target: { value: 'FIFO preserves insertion order' } })
    expect(sessionStorage.getItem(`dsh-learning/checkpoint@1:${harness.waitId}`)).toBe('FIFO preserves insertion order')
    first.unmount()

    const refreshed = render(
      <ToolView
        block={harness.block}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    expect((screen.getByRole('textbox', { name: en.checkpointFreeTextLabel }) as HTMLTextAreaElement).value)
      .toBe('FIFO preserves insertion order')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(harness.respond).toHaveBeenCalledTimes(1))
    const firstReceipt = customResponseOf(harness.respond) as Record<string, unknown>
    expect(firstReceipt).toEqual({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: harness.checkpointId,
      receiptId: `receipt_${harness.waitId}`,
      status: 'submitted',
      response: { text: 'FIFO preserves insertion order' },
    })
    await waitFor(() => expect(sessionStorage.getItem(`dsh-learning/checkpoint@1:${harness.waitId}`)).toBeNull())
    refreshed.unmount()

    render(
      <ToolView
        block={harness.block}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retry contribution' } })
    fireEvent.click(screen.getByRole('button', { name: en.submit }))
    await waitFor(() => expect(harness.respond).toHaveBeenCalledTimes(2))
    expect((customResponseOf(harness.respond, 1) as Record<string, unknown>).receiptId).toBe(firstReceipt.receiptId)
    expect(screen.queryByRole('button', { name: en.continue })).toBeNull()
    expect(screen.queryByText(en.reveal)).toBeNull()
  })

  it('matches a refreshed checkpoint by validated session/call identity, independent of JSON key order', () => {
    const harness = runningCheckpointHarness()
    const source = JSON.parse(harness.block.argsRaw) as Record<string, unknown>
    const argsRaw = JSON.stringify({
      fallbackMarkdown: source.fallbackMarkdown,
      options: source.options,
      expectedEvidence: source.expectedEvidence,
      context: source.context,
      prompt: source.prompt,
      kind: source.kind,
      protocol: source.protocol,
    })
    const view = render(
      <ToolView
        block={{ ...harness.block, argsRaw }}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    expect(view.container.querySelector('[data-learning-checkpoint]')).toBeTruthy()
    expect(view.container.querySelector('[data-state="running"]')).toBeNull()
  })

  it('coalesces double click and repeated Ctrl+Enter into one terminal response under StrictMode', async () => {
    const harness = runningCheckpointHarness()
    let resolveResponse: ((value: { accepted: true }) => void) | undefined
    harness.respond.mockReset().mockImplementation(() => new Promise(resolve => {
      resolveResponse = resolve
    }))
    render(
      <StrictMode>
        <ToolView
          block={harness.block}
          inspect={() => {}}
          t={t}
          sessionId={harness.sessionId}
          useSession={harness.usePendingSession}
        />
      </StrictMode>,
    )
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'one contribution' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.doubleClick(screen.getByRole('button', { name: en.submit }))

    await waitFor(() => expect(harness.respond).toHaveBeenCalledTimes(1))
    resolveResponse?.({ accepted: true })
    await waitFor(() => expect(sessionStorage.getItem(`dsh-learning/checkpoint@1:${harness.waitId}`)).toBeNull())
    expect(customResponseOf(harness.respond)).toMatchObject({
      status: 'submitted',
      receiptId: `receipt_${harness.waitId}`,
    })
  })

  it.each([
    ['skipped', en.skip],
    ['cancelled', en.cancel],
  ] as const)('sends a closed %s result and clears its draft', async (status, buttonName) => {
    const harness = runningCheckpointHarness()
    render(
      <ToolView
        block={harness.block}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsent draft' } })
    fireEvent.click(screen.getByRole('button', { name: buttonName }))
    await waitFor(() => expect(harness.respond).toHaveBeenCalledTimes(1))
    expect(customResponseOf(harness.respond)).toEqual({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: harness.checkpointId,
      receiptId: `receipt_${harness.waitId}`,
      status,
    })
    await waitFor(() => expect(sessionStorage.getItem(`dsh-learning/checkpoint@1:${harness.waitId}`)).toBeNull())
  })

  it('keeps the draft and exposes a retryable alert when the wait response fails', async () => {
    const harness = runningCheckpointHarness()
    harness.respond.mockReset().mockResolvedValue({ accepted: false, reason: 'connection lost' })
    render(
      <ToolView
        block={harness.block}
        inspect={() => {}}
        t={t}
        sessionId={harness.sessionId}
        useSession={harness.usePendingSession}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'retain this answer' } })
    fireEvent.click(screen.getByRole('button', { name: en.submit }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('connection lost'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('retain this answer')
    expect(sessionStorage.getItem(`dsh-learning/checkpoint@1:${harness.waitId}`)).toBe('retain this answer')
    expect(screen.getByRole('button', { name: en.submit }).hasAttribute('disabled')).toBe(false)
  })

  it.each([
    ['submitted', { response: { text: 'My own attempt' } }, en.completed],
    ['skipped', {}, en.skipped],
    ['cancelled', {}, en.cancelled],
  ] as const)('replays a completed %s result as a read-only receipt', (status, extra, expectedLabel) => {
    const checkpoint = checkpointFixture()
    const block = completedCheckpointBlock(checkpoint, {
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: 'checkpoint_replay',
      receiptId: 'receipt_wait_replay',
      status,
      ...extra,
    })
    const view = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="session_checkpoint" useSession={useEmptySession} />,
    )

    expect(view.container.querySelector(`[data-learning-result="${status}"]`)?.textContent).toContain(expectedLabel)
    if (status === 'submitted') expect(view.container.textContent).toContain('My own attempt')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(view.container.textContent).not.toMatch(/Reveal|Continue/)
  })

  it('uses safe Markdown fallback for completed failures and malformed checkpoint arguments', () => {
    const checkpoint = checkpointFixture()
    const validResult = {
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: 'checkpoint_failed',
      receiptId: 'receipt_wait_failed',
      status: 'skipped',
    }
    const failed = render(
      <ToolView
        block={completedCheckpointBlock(checkpoint, validResult, { isError: true })}
        inspect={() => {}}
        t={t}
        sessionId="session_checkpoint"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain(en.invalidResult)
    expect(failed.container.textContent).toContain(checkpoint.fallbackMarkdown)
    expect(screen.queryByRole('button')).toBeNull()
    failed.unmount()

    const malformedRaw = JSON.stringify({ ...checkpoint, answer: 'hidden model answer' })
    const malformed = render(
      <ToolView
        block={completedCheckpointBlock(checkpoint, validResult, { argsRaw: malformedRaw })}
        inspect={() => {}}
        t={t}
        sessionId="session_checkpoint"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain(en.invalidActivity)
    expect(malformed.container.textContent).toContain(checkpoint.fallbackMarkdown)
    expect(malformed.container.textContent).not.toContain('hidden model answer')
  })

  it.each([
    ['prompt', '正确答案是 A，请选择 A。', 'Use the ordinary conversation to explain your reasoning.'],
    ['context', '评分标准：提到 FIFO 得两分。', 'Use the ordinary conversation to explain your reasoning.'],
    ['fallbackMarkdown', '下一步将揭示标准答案。', undefined],
    ['fallbackMarkdown', 'Solution: FIFO removes A.', undefined],
  ] as const)('never re-exposes unsafe %s copy through malformed fallback extraction', (field, unsafe, expectedFallback) => {
    const checkpoint = checkpointFixture()
    const argsRaw = JSON.stringify({
      ...checkpoint,
      fallbackMarkdown: expectedFallback ?? checkpoint.fallbackMarkdown,
      [field]: unsafe,
    })
    const result = {
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: 'checkpoint_unsafe_chinese',
      receiptId: 'receipt_unsafe_chinese',
      status: 'skipped',
    }
    const view = render(
      <ToolView
        block={completedCheckpointBlock(checkpoint, result, { argsRaw })}
        inspect={() => {}}
        t={t}
        sessionId="session_checkpoint"
        useSession={useEmptySession}
      />,
    )

    expect(view.container.textContent).not.toContain(unsafe)
    if (expectedFallback === undefined) {
      expect(view.container.querySelector('[data-learning-fallback]')).toBeNull()
    } else {
      expect(view.container.textContent).toContain(expectedFallback)
    }
  })
})

describe('retired V2 result replay', () => {
  function completedQuestionBlock(content: string) {
    const activity = questionRound()
    return {
      activity,
      block: {
        kind: 'tool-result',
        seq: 3,
        time: 3_000,
        callId: 'legacy-question',
        call: { name: 'learning_question', argsRaw: JSON.stringify(activity) },
        callTime: 2_000,
        content: [{ type: 'text', text: content }],
        isError: false,
        callView: null,
        resultView: null,
        subCalls: [],
      },
    }
  }

  it('renders a successful historical Question as a compact answer receipt', () => {
    const response = {
      protocol: RESPONSE_PROTOCOL_V2,
      phase: 'question',
      activityId: 'legacy-activity',
      lessonToken: 'legacy-lesson',
      roundToken: 'legacy-round',
      seq: 0,
      action: 'submit',
      answer: { text: 'A' },
      receiptId: 'legacy-receipt',
    }
    const { block } = completedQuestionBlock(JSON.stringify(response))
    const view = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useEmptySession} />,
    )

    expect(view.container.querySelector('[data-learning-result="submit"]')?.textContent).toContain('Response submitted')
    expect(view.container.querySelector('[data-learning-result="submit"]')?.textContent).toContain('“A”')
    expect(screen.queryByText('Which item leaves first?')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a clear error and Markdown fallback when a historical result is corrupt', () => {
    const { activity, block } = completedQuestionBlock('{not-json')
    render(<ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useEmptySession} />)

    expect(screen.getByRole('alert').textContent).toContain('result could not be restored')
    expect(document.body.textContent).toContain(activity.fallbackMarkdown)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
