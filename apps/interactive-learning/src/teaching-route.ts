/**
 * Small, deterministic routing hints for the Learning preset.
 *
 * The model still owns the final wording and teaching judgment. This helper
 * exists so the high-priority ambiguity rule is testable and reusable by
 * canaries without copying prompt prose into another subsystem.
 */

import {
  classifyLearnIntent,
  type LearnIntentDecision,
} from './learn-intent.ts'

export type LearningRoute =
  | 'calibrate'
  | 'teach-minimum'
  | 'overview'
  | 'direct'

export interface LearningRouteDecision {
  route: LearningRoute
  reason:
    | 'short-learning-request'
    | 'explicit-learning'
    | 'explicit-beginner'
    | 'explicit-overview'
    | 'current-or-contested'
    | 'specific-goal'
    | 'definition'
    | 'bare-concept'
    | 'confusion-repair'
    | 'learning-path'
    | 'resource-creation'
    | 'direct'
  intent: LearnIntentDecision
}

const SHORT_LEARNING_REQUEST = /^(?:please\s+)?(?:teach\s+me|help\s+me\s+learn|learn|understand|get\s+to\s+know|walk\s+me\s+through|take\s+me\s+through)\b|^(?:学习|教我|了解|想学)\s*/i
const EXPLICIT_BEGINNER = /(?:\b(?:from\s+scratch|from\s+zero|beginner|beginners|intro(?:duction)?|concept(?:ual)?\s+intro)\b|零基础|从零|入门|概念入门)/i
const EXPLICIT_OVERVIEW = /\b(?:complete|full|comprehensive|structured|direct)\s+(?:overview|survey|summary)|\b(?:overview|survey)\b.*\b(?:directly|without\s+(?:asking|questions)|don['’]?t\s+(?:ask|quiz)|no\s+questions)|(?:完整|全面|结构化).*(?:概览|综述)|(?:直接讲|不要提问|别提问|不要先问)/i
const SPECIFIC_LEARNING_GOAL = /(?:\b(?:why|how|difference|distinguish|compare|debug|apply|predict|explain|derive|implement)\b|练习|区别|为什么|如何|怎么|对比|调试|应用|预测|推导|实现)/i

/**
 * Classify only the first-turn shape. It deliberately does not infer a
 * learner level from jargon or topic name.
 */
export function routeLearningRequest(text: string): LearningRouteDecision {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const intent = classifyLearnIntent(normalized)
  if (intent.intent !== 'learn') {
    return { route: 'direct', reason: 'direct', intent }
  }
  if (EXPLICIT_OVERVIEW.test(normalized)) {
    return { route: 'overview', reason: 'explicit-overview', intent }
  }
  if (intent.trigger === 'current-topic') {
    return { route: 'overview', reason: 'current-or-contested', intent }
  }
  if (SHORT_LEARNING_REQUEST.test(normalized)) {
    if (EXPLICIT_BEGINNER.test(normalized)) {
      return { route: 'teach-minimum', reason: 'explicit-beginner', intent }
    }
    if (SPECIFIC_LEARNING_GOAL.test(normalized)) {
      return { route: 'teach-minimum', reason: 'specific-goal', intent }
    }
    return { route: 'calibrate', reason: 'short-learning-request', intent }
  }
  if (EXPLICIT_BEGINNER.test(normalized)) {
    return { route: 'teach-minimum', reason: 'explicit-beginner', intent }
  }
  switch (intent.trigger) {
    case 'definition':
      return { route: 'teach-minimum', reason: 'definition', intent }
    case 'bare-concept':
      return { route: 'calibrate', reason: 'bare-concept', intent }
    case 'confusion-repair':
      return { route: 'teach-minimum', reason: 'confusion-repair', intent }
    case 'learning-path':
      return { route: 'teach-minimum', reason: 'learning-path', intent }
    case 'resource-creation':
      return { route: 'direct', reason: 'resource-creation', intent }
    default:
      break
  }
  if (SPECIFIC_LEARNING_GOAL.test(normalized)) {
    return { route: 'teach-minimum', reason: 'specific-goal', intent }
  }
  if (intent.trigger === 'explicit-learning') {
    return { route: 'calibrate', reason: 'explicit-learning', intent }
  }
  return { route: 'direct', reason: 'direct', intent }
}
