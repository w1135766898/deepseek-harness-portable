import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-modules'
import {
  UserQuestionService,
  UserQuestionError,
  type AskUserQuestionAnswer,
} from '@deepseek-ai/dsh-user-questions'
import {
  RESPONSE_PROTOCOL,
  parseLearningActivity,
  parseLearningResponse,
  type LearningActivityV1,
  type LearningResponseV1,
} from './protocol.ts'
import { encodeLearningDetail } from './transport.ts'

export const INTERACTIVE_LEARNING_PACKAGE = '@dsh-portable/interactive-learning'
export const DEFAULT_LEARNING_WAIT_TIMEOUT_MS = 5 * 60_000
const QUESTION_HEADER = 'Interactive learning activity'
const QUESTION_ID_PREFIX = 'learning:'

type LearningAbortReason = 'session-aborted' | 'client-response-timeout' | 'plugin-disposed'

class LearningWaitAbort extends Error {
  constructor(readonly reason: LearningAbortReason) {
    super(reason)
    this.name = 'LearningWaitAbort'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    learningActivities: LearningActivityBroker
  }
}

export interface PresentLearningActivityRequest {
  activity: LearningActivityV1
  agent?: Agent
  signal?: AbortSignal
  /** Bounded wait for a compatible Client response. Primarily configurable by tests/embedders. */
  timeoutMs?: number
}

function fallback(activityId: string, activity: LearningActivityV1, reason: string): LearningResponseV1 {
  return {
    protocol: RESPONSE_PROTOCOL,
    activityId,
    action: 'skip',
    interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
  }
}

function answerOf(
  answer: AskUserQuestionAnswer,
  activityId: string,
  activity: LearningActivityV1,
): LearningResponseV1 {
  const item = answer.answers[0]
  const custom = item?.custom?.trim()
  if (custom === undefined || custom === '') return fallback(activityId, activity, 'user-skipped')
  try {
    const decoded = JSON.parse(custom) as unknown
    if (typeof decoded === 'object' && decoded !== null
      && (decoded as { protocol?: unknown }).protocol === RESPONSE_PROTOCOL) {
      return parseLearningResponse(decoded, activityId)
    }
  } catch {
    // A generic question renderer returns ordinary free text, not protocol JSON.
  }
  return {
    protocol: RESPONSE_PROTOCOL,
    activityId,
    action: 'submit',
    answer: { text: custom },
    interactionState: { renderer: 'markdown-fallback' },
  }
}

/**
 * Host-side interaction coordinator. It owns validation and activity identity,
 * then reuses the pinned kernel's durable question wait for transport.
 */
export class LearningActivityBroker extends Service {
  static inject = ['userQuestions']

  private readonly pendingActivities = new Map<AbortController, { reason?: LearningAbortReason }>()

  constructor(ctx: Context) {
    super(ctx, 'learningActivities')
    ctx.effect(() => () => {
      for (const [controller, state] of this.pendingActivities) {
        state.reason = 'plugin-disposed'
        controller.abort(new LearningWaitAbort(state.reason))
      }
      this.pendingActivities.clear()
    }, 'interactive-learning: abort pending activities')
  }

  /** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
  get pendingCount(): number {
    return this.pendingActivities.size
  }

  /** Whether this Web composition advertises the matching Client bundle. */
  private hasRichClient(): boolean {
    return this.ctx.get('clientModules')?.graph().entries
      .some((entry: { id: string }) => entry.id === INTERACTIVE_LEARNING_PACKAGE) === true
  }

  async present(request: PresentLearningActivityRequest): Promise<LearningResponseV1> {
    const activity = parseLearningActivity(request.activity)
    const activityId = randomUUID()
    if (!this.hasRichClient()) return fallback(activityId, activity, 'client-capability-unavailable')
    if (request.agent === undefined) return fallback(activityId, activity, 'agent-context-unavailable')

    const timeoutMs = request.timeoutMs ?? DEFAULT_LEARNING_WAIT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return fallback(activityId, activity, 'client-response-timeout')
    }
    const controller = new AbortController()
    const state: { reason?: LearningAbortReason } = {}
    this.pendingActivities.set(controller, state)
    const abortFromSession = (): void => {
      state.reason = 'session-aborted'
      controller.abort(new LearningWaitAbort(state.reason))
    }
    if (request.signal?.aborted === true) abortFromSession()
    else request.signal?.addEventListener('abort', abortFromSession, { once: true })
    const timer = setTimeout(() => {
      state.reason = 'client-response-timeout'
      controller.abort(new LearningWaitAbort(state.reason))
    }, timeoutMs)
    timer.unref?.()

    try {
      const questions = (this.ctx as Context & { userQuestions: UserQuestionService }).userQuestions
      const ask = questions.ask({
        questions: [{
          id: `${QUESTION_ID_PREFIX}${activityId}`,
          header: QUESTION_HEADER,
          question: activity.prompt,
          detail: encodeLearningDetail({ activityId, activity }),
        }],
        agent: request.agent,
        signal: controller.signal,
      })
      // Provider implementations are required to honour the signal, but the
      // race also bounds a malformed third-party provider that ignores it.
      const aborted = new Promise<never>((_resolve, reject) => {
        if (controller.signal.aborted) reject(controller.signal.reason)
        else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      })
      const answer = await Promise.race([ask, aborted])
      return answerOf(answer, activityId, activity)
    } catch (cause) {
      if (cause instanceof LearningWaitAbort) {
        if (cause.reason === 'client-response-timeout') return fallback(activityId, activity, cause.reason)
        return {
          protocol: RESPONSE_PROTOCOL,
          activityId,
          action: 'cancel',
          interactionState: { reason: cause.reason },
        }
      }
      const code = cause instanceof UserQuestionError
        ? (cause as UserQuestionError & { code: string }).code
        : undefined
      if (code === 'ASK_CANCELLED') {
        return {
          protocol: RESPONSE_PROTOCOL,
          activityId,
          action: 'cancel',
          interactionState: { reason: 'user-cancelled' },
        }
      }
      if (code === 'ASK_ABORTED') {
        const reason = state.reason ?? 'session-aborted'
        if (reason === 'client-response-timeout') return fallback(activityId, activity, reason)
        return {
          protocol: RESPONSE_PROTOCOL,
          activityId,
          action: 'cancel',
          interactionState: { reason },
        }
      }
      if (code === 'NO_PROVIDER' || code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
        return fallback(activityId, activity, code.toLowerCase())
      }
      throw cause
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', abortFromSession)
      this.pendingActivities.delete(controller)
    }
  }
}

export default LearningActivityBroker
