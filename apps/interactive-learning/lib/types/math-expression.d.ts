import type { MathExpressionV1 } from './protocol.ts';
/** Values available to a safe mathematical expression. */
export type MathBindings = Readonly<Record<string, number>>;
/**
 * Evaluate the protocol's closed mathematical AST. The protocol validator
 * bounds its depth and node count; this evaluator never executes source text.
 */
export declare function evaluateMathExpression(expression: MathExpressionV1, bindings: MathBindings): number;
//# sourceMappingURL=math-expression.d.ts.map