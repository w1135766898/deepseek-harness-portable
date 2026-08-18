import { createHash, randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-modules'
import {
  UserQuestionService,
  UserQuestionError,
} from '@deepseek-ai/dsh-user-questions'
import {
  CHECKPOINT_RESULT_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  RESPONSE_PROTOCOL,
  LearningProtocolError,
  parseLearningCheckpointResultV1,
  parseLearningCheckpointV1,
  parseLearningActivity,
  parseLearningActivityV2,
  parseLearningResponseV2,
  type LearningCheckpointResultV1,
  type LearningCheckpointV1,
  type LearningActivityV2,
  type LearningActivityV1,
  type LearningQuestionV2,
  type LearningRevealV2,
  type LearningResponseV2,
  type LearningResponseV1,
} from './protocol.ts'
import {
  encodeLearningCheckpointDetail,
  encodeLearningWaitDetail,
  learningCheckpointQuestionId,
  learningWaitQuestionId,
} from './transport.ts'
import {
  LEARNER_STATE_SESSION_EVENT_TYPE,
  createLearnerStateSnapshotEvent,
  foldLearnerStateSession,
  reduceLearnerState,
  renderLearnerStateTranscript,
  resetLearnerState,
  type LearnerState,
  type LearnerStateCorrection,
  type LearnerStateEvent,
  type ObservableLearnerEvent,
} from './learner-state.ts'
import { registerInteractiveLearningSessionCompatibility } from './bootstrap.ts'

// Defensive Host-entry registration. Portable boot gets the stronger ordering
// guarantee from the pre-boot preset/bootstrap import; external Hosts must
// import the public bootstrap before constructing persistence/agent-loop.
registerInteractiveLearningSessionCompatibility()

export const INTERACTIVE_LEARNING_PACKAGE = '@dsh-portable/interactive-learning'
export const DEFAULT_LEARNING_WAIT_TIMEOUT_MS = 5 * 60_000
export const DEFAULT_LEARNING_CHECKPOINT_TIMEOUT_MS = 5 * 60_000

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

export interface PresentLearningGateRequest {
  activity: LearningActivityV2
  agent?: Agent
  signal?: AbortSignal
  timeoutMs?: number
  callId?: string
}

export interface PresentLearningCheckpointRequest {
  checkpoint: LearningCheckpointV1
  agent?: Agent
  signal?: AbortSignal
  timeoutMs?: number
  callId: string
}

export type ObservableLearnerStateUpdate = Exclude<
  LearnerStateEvent,
  { type: 'assistant_move_observed' | 'state_corrected' }
>

export type LearningStateUpdateRequest =
  | {
      action: 'update'
      agent: Agent
      expectedRevision: number
      event: ObservableLearnerStateUpdate
    }
  | {
      action: 'correct'
      agent: Agent
      expectedRevision: number
      correction: LearnerStateCorrection
      observation: ObservableLearnerEvent & { source: 'user-correction' }
    }
  | {
      action: 'reset'
      agent: Agent
      expectedRevision: number
    }

export interface LearningStateUpdateResult {
  status: 'updated' | 'corrected' | 'reset'
  revision: number
}

interface CheckpointCallRecord {
  fingerprint: string
  session: Agent['session']
  result: Promise<LearningCheckpointResultV1>
}

interface CheckpointReceiptRecord {
  session: Agent['session']
  result: LearningCheckpointResultV1
}

interface CheckpointStateFence {
  session: Agent['session']
  revision: number
}

interface LearnerStateCacheRecord {
  session: Agent['session']
  eventCount: number
  state: LearnerState
}

export type LearningLifecycleEventName =
  | 'learning.call.stream_started'
  | 'learning.call.args_completed'
  | 'learning.protocol.validated'
  | 'learning.wait.registered'
  | 'learning.ui.presented'
  | 'learning.answer.accepted'
  | 'learning.reveal.received'
  | 'learning.animation.started'
  | 'learning.animation.finished'
  | 'learning.continue.accepted'
  | 'learning.wait.resolved'
  | 'learning.model.next_step_started'
export interface LearningLifecycleEvent {
  name: LearningLifecycleEventName; at: number; phase: 'question' | 'reveal'
  activityId: string; lessonToken: string; roundToken: string; seq: number; callId?: string
}
interface LessonState {
  sessionId: string; lessonToken: string; roundToken: string; seq: number
  status: 'question-pending' | 'awaiting-reveal' | 'reveal-pending' | 'ready-question'
}

function fallback(activityId: string, activity: LearningActivityV1, reason: string): LearningResponseV1 {
  return {
    protocol: RESPONSE_PROTOCOL,
    activityId,
    action: 'skip',
    interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
  }
}

function boundedIdentity(value: string, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512
    || value.trim() !== value || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new LearningProtocolError([`${label} must be a non-empty bounded identity`])
  }
  return value
}

function trimOldest<K, V>(values: Map<K, V>, limit = 1_024): void {
  if (values.size <= limit) return
  const oldest = values.keys().next().value as K | undefined
  if (oldest !== undefined) values.delete(oldest)
}

function pedagogicalStateFingerprint(state: LearnerState): string {
  const {
    revision: _revision,
    appliedEventIds: _appliedEventIds,
    ...pedagogicalState
  } = state
  return JSON.stringify(pedagogicalState)
}

function learnerObservationId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  return `${prefix}:${digest}`
}

function snapshotCheckpoint(value: LearningCheckpointV1): LearningCheckpointV1 {
  const parsed = parseLearningCheckpointV1(value)
  return {
    protocol: parsed.protocol,
    kind: parsed.kind,
    prompt: parsed.prompt,
    ...(parsed.context === undefined ? {} : { context: parsed.context }),
    expectedEvidence: parsed.expectedEvidence,
    ...(parsed.options === undefined
      ? {}
      : { options: parsed.options.map(option => ({ id: option.id, label: option.label })) }),
    fallbackMarkdown: parsed.fallbackMarkdown,
  }
}

function normalizeCheckpointResult(result: LearningCheckpointResultV1): LearningCheckpointResultV1 {
  if (result.status !== 'submitted') {
    return {
      protocol: result.protocol,
      checkpointId: result.checkpointId,
      status: result.status,
      receiptId: result.receiptId,
    }
  }
  const response = 'text' in result.response
    ? { text: result.response.text }
    : 'optionId' in result.response
      ? { optionId: result.response.optionId }
      : { number: result.response.number }
  return {
    protocol: result.protocol,
    checkpointId: result.checkpointId,
    status: 'submitted',
    response,
    receiptId: result.receiptId,
  }
}

function checkpointFallbackSubmission(
  checkpoint: LearningCheckpointV1,
  checkpointId: string,
  custom: string,
): LearningCheckpointResultV1 | undefined {
  let response: { text: string } | { optionId: string } | { number: number } | undefined
  if (checkpoint.kind === 'single_choice') {
    // Labels are presentation-only and need not be unique. Only the stable
    // protocol id may cross back into the result contract.
    const option = checkpoint.options?.find(candidate => candidate.id === custom)
    if (option !== undefined) response = { optionId: option.id }
  } else if (checkpoint.kind === 'numeric') {
    const number = Number(custom)
    if (Number.isFinite(number)) response = { number }
  } else response = { text: custom }
  if (response === undefined) return undefined
  return normalizeCheckpointResult(parseLearningCheckpointResultV1({
    protocol: CHECKPOINT_RESULT_PROTOCOL,
    checkpointId,
    status: 'submitted',
    response,
    receiptId: randomUUID(),
  }, { checkpointId, checkpoint }))
}

/** Host-side V2 Question/Reveal coordinator; V1 is replay-only. */
export class LearningActivityBroker extends Service {
  static inject = ['userQuestions']

  private readonly pendingActivities = new Map<AbortController, { reason?: LearningAbortReason }>()
  private readonly lessons = new Map<string, LessonState>()
  private readonly receipts = new Map<string, LearningResponseV2>()
  private readonly gateCalls = new Map<string, Promise<LearningResponseV2>>()
  private readonly checkpointCalls = new Map<string, CheckpointCallRecord>()
  private readonly checkpointReceipts = new Map<string, CheckpointReceiptRecord>()
  private readonly pendingCheckpointSessions = new Map<string, string>()
  private readonly pendingCheckpointWaits = new Map<string, {
    session: Agent['session']
    controller: AbortController
  }>()
  private readonly learnerStates = new Map<string, LearnerStateCacheRecord>()
  private readonly observers = new Set<(event: LearningLifecycleEvent) => void>()
  private disposed = false

  constructor(ctx: Context) {
    super(ctx, 'learningActivities')
    ctx.effect(() => () => {
      this.disposed = true
      for (const [controller, state] of this.pendingActivities) {
        state.reason = 'plugin-disposed'
        controller.abort(new LearningWaitAbort(state.reason))
      }
      this.pendingActivities.clear()
      this.lessons.clear()
      this.receipts.clear()
      this.gateCalls.clear()
      this.checkpointCalls.clear()
      this.checkpointReceipts.clear()
      this.pendingCheckpointSessions.clear()
      this.pendingCheckpointWaits.clear()
      this.learnerStates.clear()
      this.observers.clear()
    }, 'interactive-learning: abort pending activities')
    ctx.on('agent/disposed', ({ agent }) => {
      this.abortPendingCheckpointSession(agent.session)
      this.dropLearnerState(agent.session)
    })
    ctx.on('session/disposed', session => {
      this.abortPendingCheckpointSession(session)
      this.dropLearnerState(session)
    })
  }

  /** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
  get pendingCount(): number {
    return this.pendingActivities.size
  }

  /** Diagnostics/test seam; state content remains private to its session. */
  get learnerStateCacheSize(): number {
    return this.learnerStates.size
  }

  /** Diagnostics/test seam; counts only, never checkpoint or learner content. */
  get checkpointCacheSize(): number {
    return this.checkpointCalls.size
      + this.checkpointReceipts.size
      + this.pendingCheckpointSessions.size
      + this.pendingCheckpointWaits.size
  }

  /** Fold the latest durable full snapshot for this exact live session. */
  learnerState(agent: Agent): LearnerState {
    const session = agent.session
    const sessionId = String(session.id)
    const current = this.learnerStates.get(sessionId)
    if (current?.session === session && current.eventCount === session.events.length) {
      return current.state
    }
    const state = foldLearnerStateSession(sessionId, session.events)
    this.learnerStates.set(sessionId, { session, eventCount: session.events.length, state })
    return state
  }

  /** Render only the bounded, model-facing projection of the current state. */
  learnerStateTranscript(agent: Agent, maxTokens = 300): string {
    return renderLearnerStateTranscript(this.learnerState(agent), { maxTokens })
  }

  /** CAS mutation used exclusively by the internal, immediate state tool. */
  updateLearnerState(request: LearningStateUpdateRequest): LearningStateUpdateResult {
    const current = this.learnerState(request.agent)
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
      throw new TypeError('expectedRevision must be a non-negative safe integer')
    }
    if (current.revision !== request.expectedRevision) {
      throw new Error(
        `Learner state revision changed: expected ${request.expectedRevision}, current ${current.revision}`,
      )
    }

    if (request.action === 'reset') {
      this.abortPendingCheckpointSession(request.agent.session)
      const state = resetLearnerState(current)
      this.appendLearnerState(request.agent, state, 'reset')
      return { status: 'reset', revision: state.revision }
    }

    const event: LearnerStateEvent = request.action === 'correct'
      ? { type: 'state_corrected', correction: request.correction, observation: request.observation }
      : request.event
    const state = reduceLearnerState(current, event)
    // A durable replay after a broker refresh still reduces to the exact same
    // state via appliedEventIds. Acknowledge it without appending a snapshot.
    if (state === current) {
      return {
        status: request.action === 'correct' ? 'corrected' : 'updated',
        revision: current.revision,
      }
    }
    if (pedagogicalStateFingerprint(state) === pedagogicalStateFingerprint(current)) {
      throw new Error('learning_state_update requires a substantive observable state change')
    }
    this.appendLearnerState(request.agent, state, request.action === 'correct' ? 'correction' : 'update')
    return {
      status: request.action === 'correct' ? 'corrected' : 'updated',
      revision: state.revision,
    }
  }

  /** Subscribe to answer-free lifecycle metadata. */
  observe(listener: (event: LearningLifecycleEvent) => void): () => void {
    this.observers.add(listener)
    return () => this.observers.delete(listener)
  }

  /** Answer-free ingress for stream/UI/kernel instrumentation outside this service. */
  reportLifecycle(event: Omit<LearningLifecycleEvent, 'at'>): void {
    this.emit(event)
  }

  private emit(event: Omit<LearningLifecycleEvent, 'at'>): void {
    const observed = { ...event, at: Date.now() }
    for (const listener of this.observers) {
      try { listener(observed) } catch { /* diagnostics must not break the learning gate */ }
    }
  }

  /** Whether this Web composition advertises the matching Client bundle. */
  private hasRichClient(): boolean {
    return this.ctx.get('clientModules')?.graph().entries
      .some((entry: { id: string }) => entry.id === INTERACTIVE_LEARNING_PACKAGE) === true
  }

  private dropLearnerState(session: { id: unknown }): void {
    const sessionId = String(session.id)
    if (this.learnerStates.get(sessionId)?.session === session) {
      this.learnerStates.delete(sessionId)
    }
    for (const [key, record] of this.checkpointCalls) {
      if (record.session === session) this.checkpointCalls.delete(key)
    }
    for (const [key, record] of this.checkpointReceipts) {
      if (record.session === session) this.checkpointReceipts.delete(key)
    }
    const pending = this.pendingCheckpointWaits.get(sessionId)
    if (pending?.session === session) {
      this.pendingCheckpointWaits.delete(sessionId)
      this.pendingCheckpointSessions.delete(sessionId)
    }
  }

  private abortPendingCheckpointSession(session: { id: unknown }): void {
    const sessionId = String(session.id)
    const pending = this.pendingCheckpointWaits.get(sessionId)
    if (pending === undefined || pending.session !== session) return
    const { controller } = pending
    const state = this.pendingActivities.get(controller)
    if (state !== undefined) state.reason = 'session-aborted'
    controller.abort(new LearningWaitAbort('session-aborted'))
    this.pendingCheckpointWaits.delete(sessionId)
    this.pendingCheckpointSessions.delete(sessionId)
    this.pendingActivities.delete(controller)
  }

  private appendLearnerState(
    agent: Agent,
    state: LearnerState,
    reason: 'update' | 'correction' | 'reset',
  ): void {
    const session = agent.session
    session.append(
      LEARNER_STATE_SESSION_EVENT_TYPE,
      createLearnerStateSnapshotEvent(state, reason),
    )
    this.learnerStates.set(String(session.id), {
      session,
      eventCount: session.events.length,
      state,
    })
  }

  private recordAutomaticEvents(agent: Agent, events: readonly LearnerStateEvent[]): void {
    try {
      let state = this.learnerState(agent)
      for (const event of events) state = reduceLearnerState(state, event)
      // Replayed observation ids reduce to the exact same state and must not
      // append another full snapshot.
      if (state !== this.learnerState(agent)) this.appendLearnerState(agent, state, 'update')
    } catch (cause) {
      // Internal evidence bookkeeping must never turn an optional visual or
      // checkpoint into a blocking teaching failure.
      this.ctx.logger.warn(`learning state observation was not recorded: ${String(cause)}`)
    }
  }

  /** Record the concrete assistant move without adding another user wait. */
  recordVisual(agent: Agent | undefined, callId: string): void {
    if (agent === undefined) return
    const stableCallId = boundedIdentity(callId, 'callId')
    this.recordAutomaticEvents(agent, [{
      type: 'assistant_move_observed',
      move: 'visual',
      observation: {
        id: learnerObservationId('visual', String(agent.session.id), stableCallId),
        source: 'assistant-output',
        summary: 'The assistant rendered one non-blocking semantic visual.',
      },
    }])
  }

  private recordCheckpointOutcome(
    request: PresentLearningCheckpointRequest,
    result: LearningCheckpointResultV1,
    fence: CheckpointStateFence | undefined,
  ): void {
    const agent = request.agent
    if (agent === undefined || fence === undefined || this.disposed) return
    try {
      const live = this.ctx.get('agents')?.get(agent.id)
      if (live !== agent || agent.session !== fence.session) return
      if (this.learnerState(agent).revision !== fence.revision) return
    } catch (cause) {
      this.ctx.logger.warn(`learning checkpoint state fence could not be verified: ${String(cause)}`)
      return
    }
    const observationBase = learnerObservationId(
      'checkpoint',
      String(agent.session.id),
      request.callId,
      result.status,
    )
    const events: LearnerStateEvent[] = []
    if (result.status === 'submitted') {
      events.push({
        type: 'learner_evidence_observed',
        evidence: request.checkpoint.expectedEvidence === 'transfer'
          ? {
              kind: 'transfer',
              transferContext: 'unknown',
              summary: 'Submitted a transfer response to the optional checkpoint.',
              confidence: 'low',
              correctness: 'unknown',
              independence: 'unknown',
            }
          : {
              kind: request.checkpoint.expectedEvidence,
              summary: `Submitted a ${request.checkpoint.expectedEvidence} response to the optional checkpoint.`,
              confidence: 'low',
              correctness: 'unknown',
              independence: 'unknown',
            },
        observation: {
          id: `${observationBase}:evidence`,
          source: 'learner-action',
          summary: `The learner submitted the requested ${request.checkpoint.expectedEvidence} response.`,
        },
      })
    }
    events.push({
      type: 'assistant_move_observed',
      move: 'checkpoint',
      observation: {
        id: `${observationBase}:move`,
        source: 'assistant-output',
        summary: `The optional checkpoint ended ${result.status}; continue in ordinary conversation.`,
      },
    })
    this.recordAutomaticEvents(agent, events)
  }

  /** Optional V4.1 path: one answer-free checkpoint, independent of V2 lessons. */
  async presentCheckpoint(request: PresentLearningCheckpointRequest): Promise<LearningCheckpointResultV1> {
    const checkpoint = snapshotCheckpoint(request.checkpoint)
    const sessionId = request.agent === undefined ? '' : String(request.agent.session.id)
    const callId = boundedIdentity(request.callId, 'callId')
    const callKey = sessionId === '' ? undefined : JSON.stringify([sessionId, callId])
    const fingerprint = JSON.stringify(checkpoint)
    let prior = callKey === undefined ? undefined : this.checkpointCalls.get(callKey)
    if (prior !== undefined && prior.session !== request.agent?.session) {
      this.checkpointCalls.delete(callKey as string)
      prior = undefined
    }
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) {
        throw new LearningProtocolError(['checkpoint callId was replayed with different content'])
      }
      return prior.result
    }

    const normalizedRequest = { ...request, checkpoint, callId }
    const stateFence: CheckpointStateFence | undefined = request.agent === undefined
      ? undefined
      : { session: request.agent.session, revision: this.learnerState(request.agent).revision }
    const result = this.presentCheckpointOnce(normalizedRequest, sessionId, callKey).then(outcome => {
      this.recordCheckpointOutcome(normalizedRequest, outcome, stateFence)
      return outcome
    })
    if (callKey !== undefined) {
      this.checkpointCalls.set(callKey, {
        fingerprint,
        session: request.agent!.session,
        result,
      })
      trimOldest(this.checkpointCalls)
    }
    try {
      return await result
    } catch (cause) {
      if (callKey !== undefined && this.checkpointCalls.get(callKey)?.result === result) {
        this.checkpointCalls.delete(callKey)
      }
      throw cause
    }
  }

  private async presentCheckpointOnce(
    request: PresentLearningCheckpointRequest,
    sessionId: string,
    callKey: string | undefined,
  ): Promise<LearningCheckpointResultV1> {
    const checkpointId = randomUUID()
    const fallback = (status: 'skipped' | 'cancelled'): LearningCheckpointResultV1 => ({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId,
      status,
      receiptId: randomUUID(),
    })

    if (!this.hasRichClient()) return fallback('skipped')
    if (request.agent === undefined || sessionId === '' || callKey === undefined) return fallback('skipped')
    const timeoutMs = request.timeoutMs ?? DEFAULT_LEARNING_CHECKPOINT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fallback('skipped')

    const activeCall = this.pendingCheckpointSessions.get(sessionId)
    if (activeCall !== undefined && activeCall !== callKey) {
      throw new LearningProtocolError(['a session may have at most one pending learning checkpoint'])
    }
    this.pendingCheckpointSessions.set(sessionId, callKey)
    try {
      return await this.waitForCheckpoint({ request, checkpointId, sessionId, timeoutMs })
    } finally {
      if (this.pendingCheckpointSessions.get(sessionId) === callKey) {
        this.pendingCheckpointSessions.delete(sessionId)
      }
    }
  }

  private async waitForCheckpoint(input: {
    request: PresentLearningCheckpointRequest
    checkpointId: string
    sessionId: string
    timeoutMs: number
  }): Promise<LearningCheckpointResultV1> {
    const { request, checkpointId, sessionId, timeoutMs } = input
    const checkpoint = request.checkpoint
    const waitId = randomUUID()
    const controller = new AbortController()
    const state: { reason?: LearningAbortReason } = {}
    this.pendingActivities.set(controller, state)
    this.pendingCheckpointWaits.set(sessionId, {
      session: (request.agent as Agent).session,
      controller,
    })
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

    const fallback = (status: 'skipped' | 'cancelled'): LearningCheckpointResultV1 => ({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId,
      status,
      receiptId: randomUUID(),
    })

    try {
      const questions = (this.ctx as Context & { userQuestions: UserQuestionService }).userQuestions
      const ask = questions.ask({
        questions: [{
          id: learningCheckpointQuestionId(waitId),
          question: checkpoint.prompt,
          detail: encodeLearningCheckpointDetail({
            sessionId,
            callId: request.callId,
            waitId,
            checkpointId,
            checkpoint,
          }),
          ...(checkpoint.kind === 'single_choice'
            ? { options: checkpoint.options?.map(option => ({ label: option.label })) }
            : {}),
        }],
        agent: request.agent as Agent,
        signal: controller.signal,
      })
      const aborted = new Promise<never>((_resolve, reject) => {
        if (controller.signal.aborted) reject(controller.signal.reason)
        else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      })
      const answer = await Promise.race([ask, aborted])
      const item = answer.answers[0]
      const custom = item?.custom?.trim()
      let result: LearningCheckpointResultV1
      if (custom !== undefined && custom !== '') {
        let decoded: unknown
        try { decoded = JSON.parse(custom) as unknown } catch { decoded = undefined }
        if (typeof decoded === 'object' && decoded !== null
          && (decoded as { protocol?: unknown }).protocol === CHECKPOINT_RESULT_PROTOCOL) {
          result = normalizeCheckpointResult(parseLearningCheckpointResultV1(decoded, { checkpointId, checkpoint }))
        } else result = checkpointFallbackSubmission(checkpoint, checkpointId, custom) ?? fallback('skipped')
      } else result = fallback('skipped')
      return this.acceptCheckpointReceipt((request.agent as Agent).session, result)
    } catch (cause) {
      if (cause instanceof LearningProtocolError) throw cause
      if (cause instanceof LearningWaitAbort) {
        return fallback(cause.reason === 'client-response-timeout' ? 'skipped' : 'cancelled')
      }
      const code = cause instanceof UserQuestionError ? (cause as UserQuestionError & { code: string }).code : undefined
      if (code === 'ASK_CANCELLED') return fallback('cancelled')
      if (code === 'ASK_ABORTED') {
        const reason = state.reason ?? 'session-aborted'
        return fallback(reason === 'client-response-timeout' ? 'skipped' : 'cancelled')
      }
      if (code === 'NO_PROVIDER' || code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
        return fallback('skipped')
      }
      this.ctx.logger.warn(`learning checkpoint provider failed; continuing ordinary conversation: ${String(cause)}`)
      return fallback('skipped')
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', abortFromSession)
      this.pendingActivities.delete(controller)
      if (this.pendingCheckpointWaits.get(sessionId)?.controller === controller) {
        this.pendingCheckpointWaits.delete(sessionId)
      }
    }
  }

  private acceptCheckpointReceipt(
    session: Agent['session'],
    result: LearningCheckpointResultV1,
  ): LearningCheckpointResultV1 {
    const key = JSON.stringify([String(session.id), result.receiptId])
    let prior = this.checkpointReceipts.get(key)
    if (prior !== undefined && prior.session !== session) {
      this.checkpointReceipts.delete(key)
      prior = undefined
    }
    if (prior !== undefined) {
      if (JSON.stringify(prior.result) !== JSON.stringify(result)) {
        throw new LearningProtocolError(['checkpointResult.receiptId was reused for different content'])
      }
      return prior.result
    }
    this.checkpointReceipts.set(key, { session, result })
    trimOldest(this.checkpointReceipts)
    return result
  }

  async presentQuestion(request: Omit<PresentLearningGateRequest, 'activity'> & { activity: LearningQuestionV2 }): Promise<LearningResponseV2> {
    return this.presentGate(request)
  }

  async presentReveal(request: Omit<PresentLearningGateRequest, 'activity'> & { activity: LearningRevealV2 }): Promise<LearningResponseV2> {
    return this.presentGate(request)
  }

  /** V2 live path: one call owns exactly one durable Question or Reveal wait. */
  async presentGate(request: PresentLearningGateRequest): Promise<LearningResponseV2> {
    const callKey = request.callId === undefined || request.agent === undefined
      ? undefined : `${String(request.agent.session.id)}:${request.callId}`
    const prior = callKey === undefined ? undefined : this.gateCalls.get(callKey)
    if (prior !== undefined) return prior
    const pending = this.presentGateOnce(request)
    if (callKey !== undefined) {
      this.gateCalls.set(callKey, pending)
      if (this.gateCalls.size > 1_024) {
        const oldest = this.gateCalls.keys().next().value as string | undefined
        if (oldest !== undefined) this.gateCalls.delete(oldest)
      }
    }
    try {
      return await pending
    } catch (cause) {
      if (callKey !== undefined) this.gateCalls.delete(callKey)
      throw cause
    }
  }

  private async presentGateOnce(request: PresentLearningGateRequest): Promise<LearningResponseV2> {
    const activity = parseLearningActivityV2(request.activity)
    const activityId = randomUUID()
    const waitId = randomUUID()
    const sessionId = request.agent === undefined ? '' : String(request.agent.session.id)
    let lessonToken: string
    let roundToken: string
    let lesson: LessonState | undefined

    if (activity.phase === 'question') {
      if (activity.lessonToken === undefined) {
        if (activity.seq !== 0) throw new LearningProtocolError(['a new lesson must start with activity.seq 0'])
        for (const [tokenValue, active] of this.lessons) {
          if (active.sessionId === sessionId) this.lessons.delete(tokenValue)
        }
        lessonToken = randomUUID()
        roundToken = randomUUID()
        if (sessionId !== '') {
          lesson = { sessionId, lessonToken, roundToken, seq: activity.seq, status: 'question-pending' }
          this.lessons.set(lessonToken, lesson)
        }
      } else {
        lessonToken = activity.lessonToken
        lesson = this.lessons.get(lessonToken)
        if (lesson === undefined) throw new LearningProtocolError(['activity.lessonToken is not active'])
        if (lesson.sessionId !== sessionId) throw new LearningProtocolError(['activity.lessonToken belongs to another session'])
        if (lesson.status !== 'ready-question') throw new LearningProtocolError(['the previous reveal must resolve before the next question'])
        if (activity.seq !== lesson.seq + 1) throw new LearningProtocolError(['activity.seq must advance by exactly one'])
        roundToken = randomUUID()
        lesson.seq = activity.seq
        lesson.roundToken = roundToken
        lesson.status = 'question-pending'
      }
    } else {
      lessonToken = activity.lessonToken
      roundToken = activity.roundToken
      lesson = this.lessons.get(lessonToken)
      if (lesson === undefined) throw new LearningProtocolError(['activity.lessonToken is not active'])
      if (lesson.sessionId !== sessionId) throw new LearningProtocolError(['activity.lessonToken belongs to another session'])
      if (lesson.status !== 'awaiting-reveal') throw new LearningProtocolError(['reveal is not valid in the current lesson state'])
      if (lesson.seq !== activity.seq) throw new LearningProtocolError(['activity.seq does not match the answered question'])
      if (lesson.roundToken !== roundToken) throw new LearningProtocolError(['activity.roundToken does not match the answered question'])
      lesson.status = 'reveal-pending'
    }

    const eventBase = {
      phase: activity.phase,
      activityId,
      lessonToken,
      roundToken,
      seq: activity.seq,
      ...(request.callId === undefined ? {} : { callId: request.callId }),
    } as const
    if (activity.phase === 'reveal' || activity.lessonToken !== undefined) {
      this.emit({ name: 'learning.model.next_step_started', ...eventBase })
    }
    this.emit({ name: 'learning.call.args_completed', ...eventBase })
    this.emit({ name: 'learning.protocol.validated', ...eventBase })

    const fallbackV2 = (reason: string, action: 'skip' | 'cancel' = 'skip'): LearningResponseV2 => activity.phase === 'question'
      ? {
          protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken,
          seq: activity.seq, action, receiptId: randomUUID(),
          interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
        }
      : {
          protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId, lessonToken, roundToken,
          seq: activity.seq, action, animation: { completed: false }, receiptId: randomUUID(),
          interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
        }

    let result: LearningResponseV2
    if (!this.hasRichClient()) result = fallbackV2('client-capability-unavailable')
    else if (request.agent === undefined) result = fallbackV2('agent-context-unavailable')
    else {
      const timeoutMs = request.timeoutMs ?? DEFAULT_LEARNING_WAIT_TIMEOUT_MS
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) result = fallbackV2('client-response-timeout')
      else {
        try {
          result = await this.waitForV2({ request, activity, activityId, waitId, lessonToken, roundToken, eventBase, timeoutMs })
        } catch (cause) {
          this.lessons.delete(lessonToken)
          throw cause
        }
      }
    }

    if (lesson !== undefined) {
      if (result.action === 'cancel' || result.action === 'skip') this.lessons.delete(lessonToken)
      else if (activity.phase === 'question') lesson.status = 'awaiting-reveal'
      else lesson.status = 'ready-question'
    }
    this.emit({ name: 'learning.wait.resolved', ...eventBase })
    return result
  }

  private async waitForV2(input: {
    request: PresentLearningGateRequest
    activity: LearningActivityV2
    activityId: string
    waitId: string
    lessonToken: string
    roundToken: string
    eventBase: Omit<LearningLifecycleEvent, 'name' | 'at'>
    timeoutMs: number
  }): Promise<LearningResponseV2> {
    const { request, activity, activityId, waitId, lessonToken, roundToken, eventBase, timeoutMs } = input
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

    const fallbackV2 = (reason: string, action: 'skip' | 'cancel' = 'skip'): LearningResponseV2 => activity.phase === 'question'
      ? { protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken, seq: activity.seq, action, receiptId: randomUUID(), interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown } }
      : { protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId, lessonToken, roundToken, seq: activity.seq, action, animation: { completed: false }, receiptId: randomUUID(), interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown } }

    try {
      const questions = (this.ctx as Context & { userQuestions: UserQuestionService }).userQuestions
      const ask = questions.ask({
        questions: [{
          id: learningWaitQuestionId(waitId),
          question: activity.phase === 'question' ? activity.prompt : 'Review this reveal, then continue.',
          detail: encodeLearningWaitDetail({
            waitId, activityId, lessonToken, roundToken, seq: activity.seq, phase: activity.phase, activity,
            ...(request.callId === undefined ? {} : { callId: request.callId }),
          }),
        }],
        agent: request.agent as Agent,
        signal: controller.signal,
      })
      this.emit({ name: 'learning.wait.registered', ...eventBase })
      if (activity.phase === 'reveal') this.emit({ name: 'learning.reveal.received', ...eventBase })
      const aborted = new Promise<never>((_resolve, reject) => {
        if (controller.signal.aborted) reject(controller.signal.reason)
        else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      })
      const answer = await Promise.race([ask, aborted])
      const item = answer.answers[0]
      const custom = item?.custom?.trim()
      let response: LearningResponseV2
      if (custom === undefined || custom === '') response = fallbackV2('user-skipped')
      else {
        let decoded: unknown
        try { decoded = JSON.parse(custom) as unknown } catch { decoded = undefined }
        if (typeof decoded === 'object' && decoded !== null
          && (decoded as { protocol?: unknown }).protocol === RESPONSE_PROTOCOL_V2) {
          response = parseLearningResponseV2(decoded, { activityId, phase: activity.phase, lessonToken, roundToken, seq: activity.seq })
        } else if (activity.phase === 'question') {
          response = {
            protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken,
            seq: activity.seq, action: 'submit', answer: { text: custom }, receiptId: randomUUID(),
            interactionState: { renderer: 'markdown-fallback' },
          }
        } else response = fallbackV2('rich-client-required')
      }
      const prior = this.receipts.get(response.receiptId)
      if (prior !== undefined) {
        if (JSON.stringify(prior) !== JSON.stringify(response)) throw new LearningProtocolError(['response.receiptId was reused for different content'])
        response = prior
      } else {
        this.receipts.set(response.receiptId, response)
        if (this.receipts.size > 1_024) {
          const oldest = this.receipts.keys().next().value as string | undefined
          if (oldest !== undefined) this.receipts.delete(oldest)
        }
      }
      if (activity.phase === 'question' && response.action === 'submit') {
        this.emit({ name: 'learning.answer.accepted', ...eventBase })
      } else if (activity.phase === 'reveal' && response.action === 'continue') {
        this.emit({ name: 'learning.continue.accepted', ...eventBase })
      }
      return response
    } catch (cause) {
      if (cause instanceof LearningProtocolError) throw cause
      if (cause instanceof LearningWaitAbort) return fallbackV2(cause.reason, cause.reason === 'client-response-timeout' ? 'skip' : 'cancel')
      const code = cause instanceof UserQuestionError ? (cause as UserQuestionError & { code: string }).code : undefined
      if (code === 'ASK_CANCELLED') return fallbackV2('user-cancelled', 'cancel')
      if (code === 'ASK_ABORTED') {
        const reason = state.reason ?? 'session-aborted'
        return fallbackV2(reason, reason === 'client-response-timeout' ? 'skip' : 'cancel')
      }
      if (code === 'NO_PROVIDER' || code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') return fallbackV2(code.toLowerCase())
      throw cause
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', abortFromSession)
      this.pendingActivities.delete(controller)
    }
  }



  /** @deprecated V1 is accepted only for static legacy replay/fallback. */
  async present(request: PresentLearningActivityRequest): Promise<LearningResponseV1> {
    const activity = parseLearningActivity(request.activity)
    return fallback(randomUUID(), activity, 'legacy-replay-only')
  }
}

export default LearningActivityBroker
