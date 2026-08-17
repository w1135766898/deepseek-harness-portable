/**
 * Versioned, credential-free MVP rubric. A remote or local model collector can
 * emit TeachingEvalCandidate JSON and feed it to the same deterministic gate.
 */
export const TEACHING_EVAL_CASES = [
    {
        id: 'simple-fact-no-visual',
        learnerPrompt: 'What is the capital of France? Give me the short answer.',
        expectedActivityKind: null,
        requiredContinuationTerms: ['paris'],
        rationale: 'One short fact does not benefit from an interactive visual.',
    },
    {
        id: 'parameter-relationship',
        learnerPrompt: 'Help me see how changing the sign of slope changes a line.',
        expectedActivityKind: 'parameter_explorer',
        requiredContinuationTerms: ['slope'],
        rationale: 'A bounded quantitative relationship should be manipulated locally.',
    },
    {
        id: 'process-state',
        learnerPrompt: 'Walk me through what happens to a queue when we dequeue twice.',
        expectedActivityKind: 'process_stepper',
        requiredContinuationTerms: ['queue'],
        rationale: 'A state-changing sequence should use predict-then-reveal steps.',
    },
    {
        id: 'structure-difference',
        learnerPrompt: 'Help me compare array and linked-list lookup structure.',
        expectedActivityKind: 'structure_compare',
        requiredContinuationTerms: ['array', 'linked'],
        rationale: 'Aligned structural differences should be compared side by side.',
    },
    {
        id: 'adaptive-response',
        learnerPrompt: 'I predicted a negative slope would descend instead of rise. Continue from that.',
        expectedActivityKind: null,
        requiredContinuationTerms: ['descend', 'negative'],
        responseEvidence: 'descend',
        rationale: 'The continuation must name and use the learner evidence, not repeat the lesson.',
    },
    {
        id: 'transfer-stop',
        learnerPrompt: 'I can now explain slope and correctly applied it to y = -3x. Wrap up this segment.',
        expectedActivityKind: null,
        requiredContinuationTerms: ['complete'],
        shouldEndSegment: true,
        rationale: 'Successful transfer is the stop condition; another mechanical question is a failure.',
    },
];
function normalized(value) {
    return value.trim().toLocaleLowerCase('en-US');
}
export function gradeTeachingCandidate(scenario, candidate) {
    const text = normalized(candidate.continuation);
    const checks = [];
    checks.push({
        name: 'activity-selection',
        passed: candidate.activityKind === scenario.expectedActivityKind,
        detail: `expected ${scenario.expectedActivityKind ?? 'no activity'}, received ${candidate.activityKind ?? 'no activity'}`,
    });
    for (const term of scenario.requiredContinuationTerms) {
        checks.push({
            name: `continuation:${term}`,
            passed: text.includes(normalized(term)),
            detail: `continuation must contain evidence term ${JSON.stringify(term)}`,
        });
    }
    if (scenario.responseEvidence !== undefined) {
        checks.push({
            name: 'uses-learner-response',
            passed: text.includes(normalized(scenario.responseEvidence)),
            detail: `continuation must explicitly use learner evidence ${JSON.stringify(scenario.responseEvidence)}`,
        });
    }
    if (scenario.shouldEndSegment === true) {
        checks.push({
            name: 'ends-mastered-segment',
            passed: candidate.endedSegment && !text.includes('?'),
            detail: 'a mastered segment must be marked ended and must not append another question',
        });
    }
    return { caseId: scenario.id, passed: checks.every(check => check.passed), checks };
}
export function gradeTeachingSuite(candidates) {
    const byId = new Map(candidates.map(candidate => [candidate.caseId, candidate]));
    return TEACHING_EVAL_CASES.map(scenario => {
        const candidate = byId.get(scenario.id);
        if (candidate !== undefined)
            return gradeTeachingCandidate(scenario, candidate);
        return {
            caseId: scenario.id,
            passed: false,
            checks: [{ name: 'candidate-present', passed: false, detail: 'no candidate transcript was supplied' }],
        };
    });
}
/** Reference outputs exercise the rubric itself; they are not presented as model-quality evidence. */
export const OFFLINE_REFERENCE_CANDIDATES = [
    { caseId: 'simple-fact-no-visual', activityKind: null, continuation: 'Paris.', endedSegment: true },
    { caseId: 'parameter-relationship', activityKind: 'parameter_explorer', continuation: 'Explore how slope changes direction.', endedSegment: false },
    { caseId: 'process-state', activityKind: 'process_stepper', continuation: 'Predict each queue state before revealing it.', endedSegment: false },
    { caseId: 'structure-difference', activityKind: 'structure_compare', continuation: 'Align the array and linked-list nodes.', endedSegment: false },
    { caseId: 'adaptive-response', activityKind: null, continuation: 'Exactly: a negative slope descends; now transfer that observation to y = -3x.', endedSegment: false },
    { caseId: 'transfer-stop', activityKind: null, continuation: 'This learning segment is complete: you explained the relationship and transferred it to a fresh equation.', endedSegment: true },
];
export function offlineContinuation(explanation) {
    const evidence = explanation.trim();
    return evidence === ''
        ? 'No explanation was submitted, so continue with the Markdown fallback.'
        : `You observed: “${evidence}” That evidence should determine the next example instead of repeating the explanation.`;
}
//# sourceMappingURL=eval.js.map