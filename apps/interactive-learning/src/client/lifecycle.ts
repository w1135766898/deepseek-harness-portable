export type LearningUiLifecycleName =
  | 'learning.call.stream_started'
  | 'learning.call.args_completed'
  | 'learning.ui.presented'
  | 'learning.animation.started'
  | 'learning.animation.finished'
  | 'learning.continue.accepted'

export interface LearningUiLifecycleEvent {
  name: LearningUiLifecycleName
  at: number
  phase?: 'question' | 'reveal'
  seq?: number
  storageKey?: string
  callId?: string
}

type Listener = (event: LearningUiLifecycleEvent) => void
const listeners = new Set<Listener>()
const emittedCallEvents = new Set<string>()

export function subscribeLearningUiLifecycle(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitLearningUiLifecycle(event: Omit<LearningUiLifecycleEvent, 'at'>): void {
  const projected = { ...event, at: Date.now() }
  for (const listener of listeners) listener(projected)
}

export function emitLearningCallLifecycle(
  name: 'learning.call.stream_started' | 'learning.call.args_completed',
  projection: Pick<LearningUiLifecycleEvent, 'callId' | 'phase' | 'seq'>,
): void {
  if (projection.callId === undefined) return
  const key = `${name}:${projection.callId}`
  if (emittedCallEvents.has(key)) return
  emittedCallEvents.add(key)
  emitLearningUiLifecycle({ name, ...projection })
}
