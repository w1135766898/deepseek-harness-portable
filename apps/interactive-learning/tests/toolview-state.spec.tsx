// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { LearningToolView } from '../src/client/LearningToolView.tsx'
import { en } from '../src/client/locales.ts'
import {
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V4,
  parseLearningVisualV4,
} from '../src/protocol.ts'
import { visualV4Catalog } from './fixtures.ts'

const t = ((key: keyof typeof en, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'interactive-learning'>

const ToolView = LearningToolView as unknown as ComponentType<Record<string, unknown>>

const useEmptySession = (selector: (snapshot: { pending: unknown[] }) => unknown): unknown => (
  selector({ pending: [] })
)

function completedBlock(args: unknown, callId: string) {
  return {
    kind: 'tool-result',
    seq: 3,
    time: 3_000,
    callId,
    call: { name: 'learning_visual', argsRaw: JSON.stringify(args) },
    callTime: 2_000,
    content: [{ type: 'text', text: JSON.stringify({ protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }) }],
    isError: false,
  }
}

function props(args: unknown, callId: string) {
  return {
    block: completedBlock(args, callId),
    inspect: () => {},
    t,
    sessionId: 'session_state',
    useSession: useEmptySession,
  }
}

afterEach(cleanup)

/**
 * The tool view re-renders on every session snapshot. Re-parsing `argsRaw` on
 * each of those renders used to mint a fresh definition identity, which reset
 * every renderer effect keyed on it — silently rewinding learner-owned state.
 */
describe('learner-owned visual state survives unrelated re-renders', () => {
  it('keeps the chosen sequence frame when the parent re-renders', () => {
    const visual = parseLearningVisualV4(visualV4Catalog.fullyConnectedNetwork)
    const view = render(<ToolView {...props(visual, 'call_sequence')} />)

    expect(screen.getByText('1 / 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.visualNextStep }))
    expect(screen.getByText('2 / 3')).toBeTruthy()

    view.rerender(<ToolView {...props(visual, 'call_sequence')} />)
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  it('keeps probed plot parameters when the parent re-renders', () => {
    const visual = parseLearningVisualV4(visualV4Catalog.derivativePlot)
    const view = render(<ToolView {...props(visual, 'call_plot')} />)

    const slider = screen.getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('1.5')

    view.rerender(<ToolView {...props(visual, 'call_plot')} />)
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('1.5')
  })

  it('rewinds to the initial frame only when the sequence itself changes', () => {
    const visual = parseLearningVisualV4(visualV4Catalog.fullyConnectedNetwork)
    const view = render(<ToolView {...props(visual, 'call_swap')} />)
    fireEvent.click(screen.getByRole('button', { name: en.visualNextStep }))
    expect(screen.getByText('2 / 3')).toBeTruthy()

    const replacement = parseLearningVisualV4(visualV4Catalog.vectorScene)
    view.rerender(<ToolView {...props(replacement, 'call_swap')} />)
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })
})

describe('rejected arguments explain themselves', () => {
  it('names the closed-schema violation and keeps the text equivalent', () => {
    const invalid = {
      protocol: VISUAL_PROTOCOL_V4,
      title: 'Broken visual',
      description: 'A description that must survive the rejection.',
      content: { kind: 'plot', series: [] },
      fallbackMarkdown: 'Use the power rule directly.',
    }
    render(<ToolView {...props(invalid, 'call_invalid')} />)

    expect(screen.getByText(en.invalidActivity)).toBeTruthy()
    // The concrete reason replaces the previous silent, unexplained failure.
    const reason = screen.getByText(/^Reason: /)
    expect(reason.textContent).not.toBe('Reason: ')
    expect(screen.getByText('Use the power rule directly.')).toBeTruthy()
  })

  it('shows the neutral running state while arguments are still incomplete', () => {
    render(
      <ToolView
        block={{ callId: 'call_stream', argsRaw: '{"protocol":"dsh-learning/visual@4","ti' }}
        inspect={() => {}}
        t={t}
        sessionId="session_state"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByText(en.waiting)).toBeTruthy()
  })

  it('names the figure as soon as the title arrives in the stream', () => {
    const streaming = '{"protocol":"dsh-learning/visual@4","title":"Power rule and its derivative","description":"Dr'
    render(
      <ToolView
        block={{ callId: 'call_title', argsRaw: streaming }}
        inspect={() => {}}
        t={t}
        sessionId="session_state"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByText('Preparing: Power rule and its derivative')).toBeTruthy()
    expect(screen.queryByText(en.waiting)).toBeNull()
  })

  it('decodes escapes and ignores a title from a non-visual payload', () => {
    const escaped = '{"protocol":"dsh-learning/visual@4","title":"Reading \\"big O\\" notation","desc'
    const { unmount } = render(
      <ToolView
        block={{ callId: 'call_escape', argsRaw: escaped }}
        inspect={() => {}}
        t={t}
        sessionId="session_state"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByText('Preparing: Reading "big O" notation')).toBeTruthy()
    unmount()

    // A checkpoint carries no title, so the wait stays neutral.
    render(
      <ToolView
        block={{ callId: 'call_other', argsRaw: '{"protocol":"dsh-learning/checkpoint@1","title":"leak me","pro' }}
        inspect={() => {}}
        t={t}
        sessionId="session_state"
        useSession={useEmptySession}
      />,
    )
    expect(screen.getByText(en.waiting)).toBeTruthy()
    expect(screen.queryByText(/leak me/)).toBeNull()
  })
})
