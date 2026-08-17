// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ParameterExplorer } from '../src/client/ParameterExplorer.tsx'
import { ActivityRendererRegistry, activityRendererRegistry } from '../src/client/ActivityRenderer.tsx'
import { ProcessStepper } from '../src/client/ProcessStepper.tsx'
import { StructureCompare } from '../src/client/StructureCompare.tsx'
import { LearningComposer, LearningInteraction, selectLearningActivity } from '../src/client/LearningComposer.tsx'
import { LearningToolView } from '../src/client/LearningToolView.tsx'
import { en } from '../src/client/locales.ts'
import { encodeLearningQuestionId } from '../src/transport.ts'
import { RESPONSE_PROTOCOL } from '../src/protocol.ts'
import { compareActivity, parameterActivity, processActivity } from './fixtures.ts'

const t = ((key: keyof typeof en, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'interactive-learning'>

afterEach(cleanup)

describe('native learning renderers', () => {
  it('registers exactly the three trusted protocol renderers and rejects duplicate keys', () => {
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

  it('submits local parameter state and an explanation', () => {
    const activity = parameterActivity()
    if (activity.kind !== 'parameter_explorer') throw new Error('fixture mismatch')
    const onSubmit = vi.fn()
    render(<ParameterExplorer activity={activity} busy={false} onSubmit={onSubmit} t={t} />)
    const slider = screen.getByRole('slider', { name: /Slope/ })
    expect((slider as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(slider, { target: { value: '-2' } })
    fireEvent.change(screen.getByPlaceholderText(/relationship you noticed/), { target: { value: 'The direction flips.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    expect(onSubmit).toHaveBeenCalledWith({
      answer: { parameters: { slope: -2 }, explanation: 'The direction flips.' },
      interactionState: { parameters: { slope: -2 } },
    })
    expect((slider as HTMLInputElement).type).toBe('range')
  })

  it('keeps a stable chart scale and offers precise parameter controls', () => {
    const activity = parameterActivity()
    if (activity.kind !== 'parameter_explorer') throw new Error('fixture mismatch')
    render(<ParameterExplorer activity={activity} busy={false} onSubmit={vi.fn()} t={t} />)

    const slider = screen.getByRole('slider', { name: 'Slope' })
    const curve = document.querySelector('path[data-curve="0"]')
    const initialPath = curve?.getAttribute('d')
    expect(initialPath).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('1')

    fireEvent.change(slider, { target: { value: '3' } })
    expect(curve?.getAttribute('d')).not.toBe(initialPath)
    expect(screen.getByRole('status').textContent).toBe('3')
    expect((screen.getByRole('button', { name: 'Increase Slope' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Slope' }))
    expect((slider as HTMLInputElement).value).toBe('2.75')

    cleanup()
    const nonlinear = parameterActivity()
    if (nonlinear.kind !== 'parameter_explorer') throw new Error('fixture mismatch')
    nonlinear.payload.parameters = [{ id: 'bend', label: 'Bend', min: 0, max: 2, step: 1, initial: 0 }]
    nonlinear.payload.curves = [{
      id: 'interior-maximum',
      label: 'Interior maximum',
      expression: {
        op: 'mul',
        left: { op: 'constant', value: 10 },
        right: {
          op: 'mul',
          left: { op: 'variable', name: 'bend' },
          right: {
            op: 'sub',
            left: { op: 'constant', value: 2 },
            right: { op: 'variable', name: 'bend' },
          },
        },
      },
    }]
    render(<ParameterExplorer activity={nonlinear} busy={false} onSubmit={vi.fn()} t={t} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Bend' }), { target: { value: '1' } })
    const description = document.querySelector('desc')?.textContent ?? ''
    const upperDomain = Number(description.match(/Y axis: y [^–]+–([^.]*)\./)?.[1])
    expect(upperDomain).toBeGreaterThanOrEqual(10)
    expect(description).toContain('Parameters: Bend 1 (0–2)')
    expect(description).toContain('Curves: Interior maximum')
    expect(document.querySelector('text[data-axis="x"]')).toBeTruthy()
    expect(document.querySelector('text[data-axis="y"]')).toBeTruthy()
  })

  it('enforces predict-before-reveal in a process stepper', () => {
    const activity = processActivity()
    if (activity.kind !== 'process_stepper') throw new Error('fixture mismatch')
    const onSubmit = vi.fn()
    render(<ProcessStepper activity={activity} busy={false} onSubmit={onSubmit} t={t} />)
    expect(screen.getByRole('list', { name: 'Process steps' })).toBeTruthy()
    const secondStep = screen.getByRole('button', { name: /Remove one/ }) as HTMLButtonElement
    expect(secondStep.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(secondStep.disabled).toBe(false)
    expect(secondStep.getAttribute('aria-current')).toBe('step')
    const reveal = screen.getByRole('button', { name: 'Reveal this step' })
    expect((reveal as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'A' }))
    expect((reveal as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(reveal)
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      answer: { checkpoints: [{ stepId: 'remove', answer: 'A' }] },
    }))
  })

  it('submits selected structural differences with a transfer explanation', () => {
    const activity = compareActivity()
    if (activity.kind !== 'structure_compare') throw new Error('fixture mismatch')
    const onSubmit = vi.fn()
    render(<StructureCompare activity={activity} busy={false} onSubmit={onSubmit} t={t} />)
    expect(screen.getByRole('group', { name: 'Structural relationships' })).toBeTruthy()
    const checkbox = screen.getByRole('checkbox', { name: 'Access cost differs.' })
    const alignment = checkbox.closest('[data-alignment-id="lookup_cost"]')
    expect(alignment?.getAttribute('data-selected')).toBeNull()
    fireEvent.click(checkbox)
    expect(alignment?.getAttribute('data-selected')).toBe('true')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An array jumps to an index.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    expect(onSubmit).toHaveBeenCalledWith({
      answer: { selectedDifferences: ['lookup_cost'], explanation: 'An array jumps to an index.' },
      interactionState: { selectedDifferences: ['lookup_cost'] },
    })
  })
})

describe('composer isolation', () => {
  it('claims only a Host-marked learning question', () => {
    const respond = vi.fn(async () => ({ accepted: true as const }))
    const ordinary = {
      kind: 'question',
      key: 'ordinary',
      sessionId: 's1',
      payload: { questions: [{ id: 'q', question: 'Ordinary?' }] },
      respond,
    }
    const activity = parameterActivity()
    const learning = {
      kind: 'question',
      key: 'learning',
      sessionId: 's1',
      payload: {
        questions: [{
          id: encodeLearningQuestionId({ activityId: 'host-id', activity }),
          question: activity.prompt,
          detail: activity.fallbackMarkdown,
        }],
      },
      respond,
    }
    expect(selectLearningActivity({ interactions: [ordinary], session: { sessionId: 's1' } })).toBeNull()
    expect(selectLearningActivity({ interactions: [ordinary, learning], session: { sessionId: 's1' } })).toBe(learning)
    expect(selectLearningActivity({ interactions: [learning], session: { sessionId: 'fork-s2' } })).toBeNull()
  })

  it('submits a protocol response once and disables duplicate submission while pending', async () => {
    const activity = parameterActivity()
    const respond = vi.fn(async () => ({ accepted: true as const }))
    const matched = {
      kind: 'question',
      key: 'learning-submit',
      sessionId: 's1',
      payload: {
        questions: [{
          id: encodeLearningQuestionId({ activityId: 'host-id', activity }),
          question: activity.prompt,
          detail: activity.fallbackMarkdown,
        }],
      },
      respond,
    }
    const Interaction = LearningInteraction as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
    render(<Interaction matched={matched} t={t} />)
    fireEvent.change(screen.getByRole('slider', { name: /Slope/ }), { target: { value: '-2' } })
    fireEvent.change(screen.getByPlaceholderText(/relationship you noticed/), { target: { value: 'The direction flips.' } })
    const submit = screen.getByRole('button', { name: 'Submit response' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    await waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    const call = respond.mock.calls[0]?.[0]
    expect(call?.ok).toBe(true)
    const response = JSON.parse(call?.value.answer.answers[0].custom ?? '')
    expect(response).toEqual({
      protocol: RESPONSE_PROTOCOL,
      activityId: 'host-id',
      action: 'submit',
      answer: { parameters: { slope: -2 }, explanation: 'The direction flips.' },
      interactionState: { parameters: { slope: -2 } },
    })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the pending activity as bare assistant-flow content and leaves no page composer', () => {
    const activity = parameterActivity()
    const respond = vi.fn(async () => ({ accepted: true as const }))
    const matched = {
      kind: 'question',
      key: 'learning-inline',
      sessionId: 's1',
      payload: {
        questions: [{
          id: encodeLearningQuestionId({ activityId: 'host-id', activity }),
          question: activity.prompt,
          detail: activity.fallbackMarkdown,
        }],
      },
      respond,
    }
    const block = {
      name: 'learning_activity',
      callId: 'learning-call-inline',
      argsRaw: JSON.stringify(activity),
      args: activity,
    }
    const ToolView = LearningToolView as unknown as ComponentType<{
      block: typeof block
      inspect(): void
      t: typeof t
      sessionId: string
      useSession(selector: (snapshot: { pending: typeof matched[] }) => unknown): unknown
    }>
    const useSession = (selector: (snapshot: { pending: typeof matched[] }) => unknown): unknown => (
      selector({ pending: [matched] })
    )

    const queued = render(
      <ToolView
        block={block}
        inspect={() => {}}
        t={t}
        sessionId="s1"
        useSession={selector => selector({ pending: [] })}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('Preparing the interaction')
    expect(screen.queryByRole('button')).toBeNull()
    expect(queued.container.querySelector('[data-state="running"]')).toBeTruthy()
    queued.unmount()

    const inline = render(
      <ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useSession} />,
    )
    const surface = inline.container.querySelector('[data-learning-activity-id="host-id"]')
    expect(surface).toBeTruthy()
    expect(surface?.getAttribute('data-learning-surface')).toBe('inline')
    expect(surface?.querySelector('header, footer')).toBeNull()
    expect(screen.getByText('What changes, and what stays fixed?')).toBeTruthy()
    expect(screen.getByRole('slider', { name: /Slope/ })).toBeTruthy()
    inline.unmount()

    const Composer = LearningComposer as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
    const composer = render(<Composer matched={matched} t={t} />)
    expect(composer.container.childElementCount).toBe(0)
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('sends cancellation through the pending wait instead of fabricating a submitted answer', async () => {
    const activity = parameterActivity()
    const respond = vi.fn(async () => ({ accepted: true as const }))
    const matched = {
      kind: 'question',
      key: 'learning-cancel',
      sessionId: 's1',
      payload: {
        questions: [{
          id: encodeLearningQuestionId({ activityId: 'host-id', activity }),
          question: activity.prompt,
          detail: activity.fallbackMarkdown,
        }],
      },
      respond,
    }
    const Interaction = LearningInteraction as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
    render(<Interaction matched={matched} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'End here' }))

    await waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'cancelled', message: 'the learner cancelled this activity', details: {} },
    })
  })

  it('replays the same completed activity and response after a remount', () => {
    const activity = parameterActivity()
    const response = {
      protocol: RESPONSE_PROTOCOL,
      activityId: 'host-id',
      action: 'submit' as const,
      answer: { parameters: { slope: -2 }, explanation: 'The direction flips.' },
    }
    const block = {
      kind: 'tool-result',
      seq: 3,
      time: 3_000,
      callId: 'learning-call-1',
      call: { name: 'learning_activity', argsRaw: JSON.stringify(activity) },
      callTime: 2_000,
      content: [{ type: 'text', text: JSON.stringify(response) }],
      isError: false,
      callView: null,
      resultView: null,
      subCalls: [],
    }
    const ToolView = LearningToolView as unknown as ComponentType<{
      block: typeof block
      inspect(): void
      t: typeof t
      sessionId: string
      useSession(selector: (snapshot: { pending: never[] }) => unknown): unknown
    }>
    const useSession = (selector: (snapshot: { pending: never[] }) => unknown): unknown => selector({ pending: [] })
    const first = render(<ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useSession} />)
    expect(screen.getByText('Response submitted')).toBeTruthy()
    const firstReplay = first.container.textContent
    first.unmount()

    const refreshed = render(<ToolView block={block} inspect={() => {}} t={t} sessionId="s1" useSession={useSession} />)
    expect(refreshed.container.textContent).toBe(firstReplay)
    expect(refreshed.container.textContent).toContain('Slope: -2')
    expect(refreshed.container.textContent).toContain('The direction flips.')
    refreshed.unmount()

    const malformed = { ...block, content: [{ type: 'text', text: '{not-json' }] }
    const fallback = render(<ToolView block={malformed} inspect={() => {}} t={t} sessionId="s1" useSession={useSession} />)
    expect(fallback.container.textContent).toContain('result could not be restored')
    expect(fallback.container.textContent).toContain('Compare y = -x, y = 0, and y = x')
  })
})
