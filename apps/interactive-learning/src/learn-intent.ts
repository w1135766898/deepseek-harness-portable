/**
 * Small pre-routing classifier for the Learning preset.
 *
 * It answers one narrow question: is the user asking to build understanding,
 * or asking for a different kind of help? Teaching route selection happens
 * after this boundary. The classifier is deliberately evidence-based; it does
 * not infer a learner level from topic vocabulary.
 */

export const LEARN_INTENT = 'learn' as const

export type LearnIntent = typeof LEARN_INTENT | 'not-learn'

export type LearnTrigger =
  | 'explicit-learning'
  | 'definition'
  | 'bare-concept'
  | 'confusion-repair'
  | 'learning-path'
  | 'conceptual-question'
  | 'explicit-overview'
  | 'current-topic'
  | 'resource-creation'
  | 'coding-task'
  | 'translation-task'
  | 'news-request'
  | 'resource-recommendation'
  | 'opinion-judgment'
  | 'unknown'

export interface LearnIntentDecision {
  intent: LearnIntent
  trigger: LearnTrigger
  /** A short stable explanation for tests and route diagnostics, not a model profile. */
  reason: string
}

const EXPLICIT_LEARNING = /(?:^|\s)(?:please\s+)?(?:teach\s+me|help\s+me\s+(?:learn|understand|grasp)|help\s+me\s+with\s+the\s+concept|learn|understand|explain|walk\s+me\s+through|study|from\s+(?:scratch|zero)|teach)(?:\b|\s|$)|(?:学习|教我|理解|讲解|解释|学会|从零|入门)/i
const DEFINITION = /^(?:please\s+)?(?:what\s+is|what's|define|definition\s+of|meaning\s+of)\b|^(?:解释一下|什么是|何谓)/i
const CONFUSION_REPAIR = /(?:keep\s+(?:mixing|confusing)|always\s+(?:mix|confuse)|constantly\s+(?:mix|confuse)|can't\s+(?:remember|get|understand)|cannot\s+(?:remember|get|understand)|won't\s+stick|not\s+(?:getting|sticking)|never\s+(?:learned|understood)|总是混淆|老是混淆|记不住|没学会|学不会|搞不懂|分不清|总是弄错)/i
const LEARNING_PATH = /(?:prerequisite|pre-requisite|what\s+(?:should|do)\s+i\s+learn\s+before|what\s+comes\s+before|where\s+do\s+i\s+start|learning\s+path|study\s+path|roadmap|sequence\s+to\s+learn|how\s+to\s+study|先学什么|前置知识|前置条件|学习路径|学习路线|入门顺序|学习顺序|怎么学)/i
const RESOURCE_CREATION = /(?:make|create|write|draft|prepare|turn|convert|生成|制作|整理|编写).{0,80}(?:flashcards?|study\s+guide|quiz|outline|review\s+sheet|闪卡|抽认卡|学习指南|复习提纲|测验|知识卡片)/i
const RESOURCE_RECOMMENDATION = /(?:recommend|suggest|what\s+should\s+i\s+read|推荐|建议).{0,80}(?:book|course|tutorial|resource|textbook|教材|课程|教程|资料|资源)|\b(?:best|good)\s+(?:book|course|tutorial|resource|textbook)\b|(?:教材|课程|教程|资料|资源)\s*(?:推荐|建议)/i
const CODING_TASK = /(?:^|\s)(?:write|implement|code|build|fix|debug|refactor|run|deploy|integrate|编写|实现|写代码|修复|调试|重构|部署|接入)(?:\b|\s|$)|(?:function|class|api|bug|stack\s+trace|报错|代码).{0,80}(?:write|fix|debug|implement|编写|实现|修复|调试)|(?:explain|walk\s+me\s+through|what\s+does).{0,30}(?:this|the|my|following)\s+(?:code|function|class|snippet|script)|(?:解释|说明).{0,20}(?:这段|以下|这个).{0,10}(?:代码|函数|类|脚本)/i
const TRANSLATION_TASK = /(?:translate|translation|翻译|翻成|译成|proofread|copyedit|rewrite|polish|润色|改写)/i
const NEWS_REQUEST = /(?:latest|breaking|today's?|this\s+week|recent\s+update|news|what\s+happened|current\s+events|最新|近期消息|新闻|时事|刚刚发生|最近发生了什么)/i
const NEWS_CONTENT = /(?:\b(?:news|breaking|current\s+events|what\s+happened)\b|新闻|时事|刚刚发生|最近发生了什么|近期消息)/i
const CURRENT_TOPIC = /(?:\b(?:current|right\s+now|today|recent|contested|controversial|debate)\b|当前|现在|如今|争议|有争议|辩论|争论)/i
const CURRENT_SURVEY = /(?:\b(?:latest|recent|current)\b|最新|近期).{0,50}(?:survey|overview|summary|综述|概览)/i
const EXPLICIT_OVERVIEW = /(?:\b(?:complete|full|comprehensive|structured|direct)\s+(?:overview|survey|summary)|\b(?:overview|survey)\b.*\b(?:directly|without\s+(?:asking|questions)|don['’]?t\s+(?:ask|quiz)|no\s+questions)|(?:完整|全面|结构化).{0,20}(?:overview|survey|summary|概览|综述)|(?:直接讲|不要提问|别提问|不要先问))/i
const OPINION_JUDGMENT = /(?:do\s+you\s+think|what(?:'s|\s+is)\s+your\s+(?:take|opinion)|honest\s+take|in\s+your\s+opinion|is\s+.+\s+(?:dead|over|still\s+relevant|taken\s+seriously)|was\s+.+\s+really|settle\s+this|你怎么看|你的看法|观点|评价一下|到底是不是|还值得认真对待吗)/i
const CONCEPTUAL_QUESTION = /(?:^|\s)(?:why|how|difference\s+between|distinguish|compare|mechanism|cause|what\s+does\s+.+\s+mean)(?:\b|\s|$)|(?:为什么|为何|如何|怎么|区别|对比|机制|原因|含义)/i

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isBareConcept(text: string): boolean {
  if (text === '' || text.length > 120) return false
  if (/[?!。！？,:;，；：]/.test(text) || /https?:\/\//i.test(text)) return false
  if (/[{}[\]();=<>]|```|\\/.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length > 8) return false
  if (/^(?:i|we|you|please|can|could|would|how|why|what|帮我|请|我|你|能否|如何|为什么)\b/i.test(text)) return false
  if (/\b(?:is|are|was|were|do|does|did|can|should|need|want|please|give|show|tell|write|make|recommend)\b/i.test(text)) return false
  // A short noun phrase, including a Chinese concept name, is the useful
  // signal here. It is intentionally permissive after task/news exclusions.
  return words.length <= 6
}

function decision(intent: LearnIntent, trigger: LearnTrigger, reason: string): LearnIntentDecision {
  return { intent, trigger, reason }
}

/** Classify the first-turn request before choosing a teaching route. */
export function classifyLearnIntent(input: string): LearnIntentDecision {
  const text = normalize(input)
  if (text === '') return decision('not-learn', 'unknown', 'empty request')

  // Explicit non-learning tasks win over broad words such as “explain” or
  // “how”. “Explain this bug” remains debugging, not a tutoring request.
  if (TRANSLATION_TASK.test(text)) return decision('not-learn', 'translation-task', 'translation or text transformation')
  if (RESOURCE_RECOMMENDATION.test(text) && !RESOURCE_CREATION.test(text)) {
    return decision('not-learn', 'resource-recommendation', 'request for a resource recommendation')
  }
  if (RESOURCE_CREATION.test(text)) return decision('learn', 'resource-creation', 'the learner asks for a study artifact')
  if (CODING_TASK.test(text)) return decision('not-learn', 'coding-task', 'implementation or troubleshooting task')
  if (CURRENT_SURVEY.test(text) && !NEWS_CONTENT.test(text)) {
    return decision('learn', 'current-topic', 'request for a current structured survey')
  }
  if (NEWS_REQUEST.test(text)) return decision('not-learn', 'news-request', 'news or breaking-update request')
  if (OPINION_JUDGMENT.test(text)) return decision('not-learn', 'opinion-judgment', 'request for a verdict or personal take')

  if (CONFUSION_REPAIR.test(text)) return decision('learn', 'confusion-repair', 'the learner reports a persistent confusion or memory failure')
  if (LEARNING_PATH.test(text)) return decision('learn', 'learning-path', 'the learner asks how concepts or prerequisites should be sequenced')
  if (DEFINITION.test(text)) return decision('learn', 'definition', 'definition request')
  if (CURRENT_TOPIC.test(text)) return decision('learn', 'current-topic', 'request to understand a current or contested topic')
  if (EXPLICIT_OVERVIEW.test(text)) return decision('learn', 'explicit-overview', 'the learner explicitly requests a structured overview')
  if (EXPLICIT_LEARNING.test(text)) return decision('learn', 'explicit-learning', 'explicit request to learn or understand')
  if (CONCEPTUAL_QUESTION.test(text)) return decision('learn', 'conceptual-question', 'question about a mechanism, cause, meaning, or contrast')
  if (isBareConcept(text)) return decision('learn', 'bare-concept', 'short concept name implies a request to understand it')

  return decision('not-learn', 'unknown', 'no learning trigger was observed')
}

export function isLearnIntent(input: string): boolean {
  return classifyLearnIntent(input).intent === LEARN_INTENT
}

/** Compact standing text; detailed diagnosis and moves stay in references. */
export const LEARNING_INTENT_POLICY = [
  'Classify the request before teaching: learn intent covers definitions (“what is X”), a bare concept name, persistent confusion (“I always mix these up / can’t remember / 没学会”), conceptual why/how questions, prerequisites, learning paths, and requested study artifacts such as flashcards or a study guide.',
  'Keep coding/implementation or debugging, translation or rewriting, news/breaking updates, resource recommendations, and opinion or verdict requests on their ordinary task route. A current or contested topic is still learn intent when the user asks for a structured explanation; a latest-news lookup is not.',
].join(' ')
