// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ParameterExplorer } from '../src/client/ParameterExplorer.tsx'
import { ActivityRendererRegistry, activityRendererRegistry } from '../src/client/ActivityRenderer.tsx'
import { ProcessStepper } from '../src/client/ProcessStepper.tsx'
import { StructureCompare } from '../src/client/StructureCompare.tsx'
import { LearningComposer, selectLearningActivity } from '../src/client/LearningComposer.tsx'
import { LearningToolView } from '../src/client/LearningToolView.tsx'
import { en } from '../src/client/locales.ts'
import { encodeLearningDetail } from '../src/transport.ts'
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
    expect((slider as HTMLInputElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(/negative value/), { target: { value: 'The line should reverse.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock prediction and explore' }))
    expect((slider as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(slider, { target: { value: '-2' } })
    fireEvent.change(screen.getByPlaceholderText(/relationship you noticed/), { target: { value: 'The direction flips.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    expect(onSubmit).toHaveBeenCalledWith({
      answer: { prediction: 'The line should reverse.', parameters: { slope: -2 }, explanation: 'The direction flips.' },
      interactionState: {
        prediction: 'The line should reverse.', predictionCommitted: true, parameters: { slope: -2 },
      },
    })
    expect((slider as HTMLInputElement).type).toBe('range')
  })

  it('enforces predict-before-reveal in a process stepper', () => {
    const activity = processActivity()
    if (activity.kind !== 'process_stepper') throw new Error('fixture mismatch')
    const onSubmit = vi.fn()
    render(<ProcessStepper activity={activity} busy={false} onSubmit={onSubmit} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Access cost differs.' }))
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
          id: 'learning:host-id',
          question: activity.prompt,
          detail: encodeLearningDetail({ activityId: 'host-id', activity }),
        }],
      },
      respond,
    }
    expect(selectLearningActivity({ interactions: [ordinary], session: { id: 's1' } })).toBeNull()
    expect(selectLearningActivity({ interactions: [ordinary, learning], session: { id: 's1' } })).toBe(learning)
    expect(selectLearningActivity({ interactions: [learning], session: { id: 'fork-s2' } })).toBeNull()
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
          id: 'learning:host-id',
          question: activity.prompt,
          detail: encodeLearningDetail({ activityId: 'host-id', activity }),
        }],
      },
      respond,
    }
    const Composer = LearningComposer as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
    render(<Composer matched={matched} t={t} />)
    fireEvent.change(screen.getByPlaceholderText(/negative value/), { target: { value: 'It should reverse.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock prediction and explore' }))
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
      answer: { prediction: 'It should reverse.', parameters: { slope: -2 }, explanation: 'The direction flips.' },
      interactionState: {
        prediction: 'It should reverse.', predictionCommitted: true, parameters: { slope: -2 },
      },
    })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
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
          id: 'learning:host-id',
          question: activity.prompt,
          detail: encodeLearningDetail({ activityId: 'host-id', activity }),
        }],
      },
      respond,
    }
    const Composer = LearningComposer as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
    render(<Composer matched={matched} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel activity' }))

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
    }>
    const first = render(<ToolView block={block} inspect={() => {}} t={t} />)
    expect(screen.getByText('Interactive activity completed')).toBeTruthy()
    fireEvent.click(screen.getByText('Interactive activity completed'))
    const firstReplay = first.container.textContent
    first.unmount()

    const refreshed = render(<ToolView block={block} inspect={() => {}} t={t} />)
    fireEvent.click(screen.getByText('Interactive activity completed'))
    expect(refreshed.container.textContent).toBe(firstReplay)
    expect(refreshed.container.textContent).toContain('The direction flips.')
  })
})
