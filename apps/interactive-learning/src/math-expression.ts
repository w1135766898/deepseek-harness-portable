import type { MathExpressionV1 } from './protocol.ts'

/** Values available to a safe mathematical expression. */
export type MathBindings = Readonly<Record<string, number>>

/**
 * Evaluate the protocol's closed mathematical AST. The protocol validator
 * bounds its depth and node count; this evaluator never executes source text.
 */
export function evaluateMathExpression(expression: MathExpressionV1, bindings: MathBindings): number {
  switch (expression.op) {
    case 'constant':
      return expression.value
    case 'variable':
      return bindings[expression.name] ?? Number.NaN
    case 'add':
      return evaluateMathExpression(expression.left, bindings) + evaluateMathExpression(expression.right, bindings)
    case 'sub':
      return evaluateMathExpression(expression.left, bindings) - evaluateMathExpression(expression.right, bindings)
    case 'mul':
      return evaluateMathExpression(expression.left, bindings) * evaluateMathExpression(expression.right, bindings)
    case 'div':
      return evaluateMathExpression(expression.left, bindings) / evaluateMathExpression(expression.right, bindings)
    case 'pow':
      return evaluateMathExpression(expression.left, bindings) ** evaluateMathExpression(expression.right, bindings)
    case 'neg':
      return -evaluateMathExpression(expression.value, bindings)
    case 'abs':
      return Math.abs(evaluateMathExpression(expression.value, bindings))
    case 'sqrt':
      return Math.sqrt(evaluateMathExpression(expression.value, bindings))
    case 'sin':
      return Math.sin(evaluateMathExpression(expression.value, bindings))
    case 'cos':
      return Math.cos(evaluateMathExpression(expression.value, bindings))
    case 'exp':
      return Math.exp(evaluateMathExpression(expression.value, bindings))
    case 'log':
      return Math.log(evaluateMathExpression(expression.value, bindings))
    case 'sigmoid': {
      const value = evaluateMathExpression(expression.value, bindings)
      // The split form avoids overflow while preserving accuracy in both tails.
      if (value >= 0) return 1 / (1 + Math.exp(-value))
      const exponential = Math.exp(value)
      return exponential / (1 + exponential)
    }
  }
}
