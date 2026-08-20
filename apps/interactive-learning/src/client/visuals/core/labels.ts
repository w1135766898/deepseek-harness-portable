/**
 * Every model-independent string the visual@4 renderers show.
 *
 * The Host supplies these through the plugin locale; the defaults here keep the
 * renderers usable in isolation (tests, the browser fixture) without forking the
 * wording.
 */
import { createContext, useContext } from 'react'

export interface LearningVisualV4Labels {
  eyebrow: string
  errorTitle: string
  errorContinue: string
  sequenceLabel: string
  previousStep: string
  nextStep: string
  reset: string
  chartProbeHint: string
  metricsLabel: string
  legendLabel: string
  plotInteractionHint: string
  noValuesInRange: string
  seriesOutOfRange: string
  nodeLinkSummary: string
  connection: string
  layerLabel: string
  edgeLabel: string
  nodeLinkInteractionHint: string
  nodeKind: string
  edgeKind: string
  noDetail: string
  closeDetail: string
  elementFallback: string
  sceneSummary: string
  sceneInteractionHint: string
  elementKind: string
  comparisonCaption: string
  comparisonDimension: string
  comparisonSubject: string
  comparisonInteractionHint: string
  matrixCaption: string
  matrixAxes: string
  noRelation: string
  matrixInteractionHint: string
  setsLabel: string
  noExclusiveItems: string
  intersections: string
  uncategorized: string
  setsInteractionHint: string
  timelineLabel: string
  timelineEventKind: string
  timelineEraKind: string
  timelineInteractionHint: string
  formulaLabel: string
  formulaProgress: string
  formulaRule: string
  formulaConclusion: string
  revealNextFormulaStep: string
  formulaComplete: string
  formulaInteractionHint: string
  studySource: string
  studyGoal: string
  studySections: string
  studyConcepts: string
  studyAnchor: string
  studySummary: string
  prerequisite: string
  noPrerequisite: string
  roleFoundation: string
  roleCore: string
  roleExtension: string
  rolePractice: string
  studyInteractionHint: string
  recallDeckLabel: string
  recallProgress: string
  recallPrompt: string
  recallHint: string
  recallAnswer: string
  showHint: string
  showAnswer: string
  previousCard: string
  nextCard: string
  resetDeck: string
  mastered: string
  reviewAgain: string
  unrated: string
  recallStatus: string
  recallInteractionHint: string
  stepOfTotal: string
  emptyVisual: string
  graphLegendLabel: string
  stateCurrent: string
  stateRelated: string
  stateContext: string
  stateVisited: string
}

export const DEFAULT_LABELS: LearningVisualV4Labels = {
  eyebrow: '交互可视化',
  errorTitle: '视觉组件暂时无法显示',
  errorContinue: '你仍可继续阅读上下文。',
  sequenceLabel: '视觉讲解步骤',
  previousStep: '上一步',
  nextStep: '下一步',
  reset: '重置',
  chartProbeHint: '图表，按左右方向键开始探查数值',
  metricsLabel: '当前指标',
  legendLabel: '图例与系列显示',
  plotInteractionHint: '鼠标移入图表可探查数值；键盘聚焦图表后可用 ← → 移动。',
  noValuesInRange: '当前坐标范围内没有可显示的数值。',
  seriesOutOfRange: '不在范围内',
  nodeLinkSummary: '{nodes} 个节点，{edges} 条连线。',
  connection: '{from} 到 {to}',
  layerLabel: '第 {index} 层',
  edgeLabel: '连线',
  nodeLinkInteractionHint: '选择节点或连线查看解释；键盘按 Tab 进入图形，再用 ← → 移动、Enter 选择。',
  nodeKind: '节点',
  edgeKind: '连线',
  noDetail: '暂无补充说明。',
  closeDetail: '关闭详细说明',
  elementFallback: '图元 {id}',
  sceneSummary: '二维场景，{elements} 个图元。{labels}',
  sceneInteractionHint: '选择图中的点、线或形状查看说明；键盘按 Tab 进入图形，再用 ← → 移动、Enter 选择。',
  elementKind: '图元',
  comparisonCaption: '特征对比表',
  comparisonDimension: '对比维度',
  comparisonSubject: '对比对象',
  comparisonInteractionHint: '按行阅读可对比同一维度；选择表头可查看补充说明。',
  matrixCaption: '关系矩阵',
  matrixAxes: '行 ↓ / 列 →',
  noRelation: '无关系',
  matrixInteractionHint: '从行与列的交点读取关系；选择单元格可查看细节。',
  setsLabel: '集合关系图',
  noExclusiveItems: '无独有项',
  intersections: '交集 / 共有',
  uncategorized: '未归类',
  setsInteractionHint: '单一归属项在各集合内，多重归属项在交集区。',
  timelineLabel: '时间线',
  timelineEventKind: '事件',
  timelineEraKind: '时期',
  timelineInteractionHint: '选择事件或时期可查看补充说明。',
  formulaLabel: '公式推导',
  formulaProgress: '第 {current} / {total} 步',
  formulaRule: '规则',
  formulaConclusion: '结论',
  revealNextFormulaStep: '显示下一步',
  formulaComplete: '推导已完成',
  formulaInteractionHint: '先预测下一步，再逐步揭示变形规则。',
  studySource: '学习来源',
  studyGoal: '学习目标',
  studySections: '来源章节',
  studyConcepts: '本节概念',
  studyAnchor: '位置',
  studySummary: '摘要',
  prerequisite: '前置概念',
  noPrerequisite: '无',
  roleFoundation: '基础',
  roleCore: '核心',
  roleExtension: '拓展',
  rolePractice: '练习',
  studyInteractionHint: '按来源章节导览，选择概念查看作用、前置关系与详细说明。',
  recallDeckLabel: '回忆卡组',
  recallProgress: '第 {current} / {total} 张',
  recallPrompt: '问题',
  recallHint: '提示',
  recallAnswer: '答案',
  showHint: '查看提示',
  showAnswer: '显示答案',
  previousCard: '上一张',
  nextCard: '下一张',
  resetDeck: '重置卡组',
  mastered: '已掌握',
  reviewAgain: '待复习',
  unrated: '未标记',
  recallStatus: '掌握 {mastered} · 待复习 {review}',
  recallInteractionHint: '先在心中回答，再查看提示和答案，最后标记掌握状态。',
  stepOfTotal: '第 {current} / {total} 步',
  emptyVisual: '这张图目前没有可显示的内容。',
  graphLegendLabel: '图形状态说明',
  stateCurrent: '当前重点',
  stateRelated: '相关路径',
  stateContext: '其余结构',
  stateVisited: '已讲过',
}

const VisualLabelsContext = createContext<LearningVisualV4Labels>(DEFAULT_LABELS)

export const VisualLabelsProvider = VisualLabelsContext.Provider

export function useVisualLabels(): LearningVisualV4Labels {
  return useContext(VisualLabelsContext)
}

/** Fill `{name}` placeholders, leaving unknown ones untouched. */
export function labelTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([a-z]+)\}/gi, (match, key: string) => (
    values[key] === undefined ? match : String(values[key])
  ))
}
