/** Host entry: one non-model-facing Learning Activity broker service. */
export { LearningActivityBroker, type PresentLearningActivityRequest } from './broker.ts'
export { LearningActivityBroker as default } from './broker.ts'
export type {
  LearningActivityV1,
  LearningResponseV1,
  LearningActivityKind,
} from './protocol.ts'
