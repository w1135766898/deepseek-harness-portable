import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  LearningActivityV1,
  LearningJson,
  LearningResponseV1,
} from '../protocol.ts'

export interface ActivitySubmission {
  answer: LearningJson
  interactionState: LearningJson
}

export interface ActivityRendererProps<A extends LearningActivityV1 = LearningActivityV1> {
  activity: A
  busy: boolean
  t: TranslateNS<'interactive-learning'>
  onSubmit(submission: ActivitySubmission): void
}

export interface LearningReplayProps {
  activity: LearningActivityV1
  response?: LearningResponseV1
  t: TranslateNS<'interactive-learning'>
}
