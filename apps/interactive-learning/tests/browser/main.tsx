import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { LearningComposer, selectLearningActivity } from '../../src/client/LearningComposer.tsx'
import { LearningToolView } from '../../src/client/LearningToolView.tsx'
import { en } from '../../src/client/locales.ts'
import { RESPONSE_PROTOCOL, type LearningActivityV1, type LearningResponseV1 } from '../../src/protocol.ts'
import { encodeLearningDetail } from '../../src/transport.ts'
import { offlineContinuation } from '../../src/eval.ts'
import { compareActivity, parameterActivity, processActivity } from '../fixtures.ts'
import './page.css'

const STORAGE_KEY = 'dsh-learning-browser-acceptance@1'
const activities = {
  parameter_explorer: parameterActivity,
  process_stepper: processActivity,
  structure_compare: compareActivity,
} as const
type ActivityKind = keyof typeof activities

const t = ((key: keyof typeof en, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'interactive-learning'>

interface StoredRun {
  activityId: string
  activity: LearningActivityV1
  response: LearningResponseV1
  continuation: string
}

function storedRun(): StoredRun | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? undefined : JSON.parse(raw) as StoredRun
  } catch {
    return undefined
  }
}

function explanationOf(response: LearningResponseV1): string {
  const answer = response.answer
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return ''
  const explanation = answer.explanation
  return typeof explanation === 'string' ? explanation : JSON.stringify(answer)
}

function replayBlock(run: StoredRun) {
  return {
    kind: 'tool-result' as const,
    seq: 3,
    time: 3_000,
    callId: `call:${run.activityId}`,
    call: { name: 'learning_activity', argsRaw: JSON.stringify(run.activity) },
    callTime: 2_000,
    content: [{ type: 'text' as const, text: JSON.stringify(run.response) }],
    isError: false,
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function BrowserAcceptance() {
  const [mode, setMode] = useState<'learning' | 'standard'>('learning')
  const [sessionId, setSessionId] = useState('learning-browser-root')
  const [kind, setKind] = useState<ActivityKind>('parameter_explorer')
  const [activityId, setActivityId] = useState('browser-activity-1')
  const [run, setRun] = useState<StoredRun | undefined>(() => storedRun())
  const [pending, setPending] = useState(() => storedRun() === undefined)
  const [forkPendingClaimed, setForkPendingClaimed] = useState<boolean | undefined>()
  const [learningRequests] = useState(0)
  const activity = useMemo(() => activities[kind](), [kind, activityId])

  const matched = useMemo(() => ({
    kind: 'question' as const,
    key: `q:${activityId}`,
    sessionId,
    payload: {
      questions: [{
        id: `learning:${activityId}`,
        question: activity.prompt,
        detail: encodeLearningDetail({ activityId, activity }),
      }],
    },
    async respond(result: { ok: boolean; value?: { answer?: { answers?: Array<{ custom?: string }> } } }) {
      let response: LearningResponseV1
      if (result.ok) {
        response = JSON.parse(result.value?.answer?.answers?.[0]?.custom ?? '') as LearningResponseV1
      } else {
        response = { protocol: RESPONSE_PROTOCOL, activityId, action: 'cancel' }
      }
      const continuation = response.action === 'submit'
        ? offlineContinuation(explanationOf(response))
        : `Activity ${response.action}; continue with the safe Markdown fallback.`
      const completed = { activityId, activity, response, continuation }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
      setRun(completed)
      setPending(false)
      return { accepted: true as const }
    },
  }), [activity, activityId, sessionId])

  useEffect(() => {
    ;(window as unknown as { __LEARNING_ACCEPTANCE__: unknown }).__LEARNING_ACCEPTANCE__ = {
      mode, sessionId, kind, pending, run, forkPendingClaimed, learningRequests,
    }
  }, [mode, sessionId, kind, pending, run, forkPendingClaimed, learningRequests])

  const start = (next: ActivityKind): void => {
    localStorage.removeItem(STORAGE_KEY)
    setMode('learning')
    setKind(next)
    setActivityId(`browser-${next}-${Date.now()}`)
    setRun(undefined)
    setPending(true)
    setForkPendingClaimed(undefined)
  }

  const forkPending = (): void => {
    const forkSession = `${sessionId}-fork`
    setForkPendingClaimed(selectLearningActivity({
      interactions: [matched as never],
      session: { id: forkSession } as never,
    }) !== null)
    setSessionId(forkSession)
    setPending(false)
  }

  const Composer = LearningComposer as unknown as ComponentType<{ matched: typeof matched; t: typeof t }>
  const ToolView = LearningToolView as unknown as ComponentType<{
    block: ReturnType<typeof replayBlock>
    inspect(): void
    t: typeof t
  }>

  return (
    <main>
      <header className="acceptance-header">
        <div>
          <p className="kicker">DSH Learning MVP</p>
          <h1>Browser acceptance harness</h1>
          <p>Actual package components, native DOM events, persistent replay, and an offline continuation driver.</p>
        </div>
        <div className="mode-row" role="group" aria-label="Agent preset">
          <button type="button" aria-pressed={mode === 'learning'} onClick={() => setMode('learning')}>Learning preset</button>
          <button type="button" aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>Standard preset</button>
        </div>
      </header>

      <nav aria-label="Activity fixtures">
        <button type="button" onClick={() => start('parameter_explorer')}>Start parameter explorer</button>
        <button type="button" onClick={() => start('process_stepper')}>Start process stepper</button>
        <button type="button" onClick={() => start('structure_compare')}>Start structure compare</button>
        <button type="button" disabled={!pending} onClick={forkPending}>Fork pending session</button>
      </nav>

      <section className="status" aria-label="Acceptance status">
        <span>Mode: <strong>{mode}</strong></span>
        <span>Session: <strong>{sessionId}</strong></span>
        <span>Learning network requests: <strong>{learningRequests}</strong></span>
        {forkPendingClaimed === undefined ? null : (
          <span data-testid="fork-result">Fork claimed ancestor pending: <strong>{forkPendingClaimed ? 'yes' : 'no'}</strong></span>
        )}
      </section>

      {mode === 'standard' ? (
        <section className="standard-clean" data-testid="standard-clean">
          Standard owns no Learning composer, tool, prompt, or network request.
        </section>
      ) : pending ? (
        <Composer matched={matched} t={t} />
      ) : run === undefined ? (
        <section className="standard-clean">This fork has no revived pending activity.</section>
      ) : (
        <section className="completed-flow">
          <div data-testid="continuation" aria-label="Tutor continuation">{run.continuation}</div>
          <ToolView block={replayBlock(run)} inspect={() => {}} t={t} />
        </section>
      )}
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<BrowserAcceptance />)
