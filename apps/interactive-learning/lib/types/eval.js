const QUESTION_FORBIDDEN_KEYS = new Set([
    'answer', 'correctAnswer', 'expected', 'explanation', 'futureSteps', 'nextPrompt',
    'nextQuestion', 'reveal', 'solution', 'steps',
]);
const REVEAL_FORBIDDEN_KEYS = new Set([
    'futureSteps', 'input', 'nextPrompt', 'nextQuestion', 'prompt', 'steps',
]);
function serialized(value) {
    try {
        return JSON.stringify(value).toLocaleLowerCase('en-US');
    }
    catch {
        return '';
    }
}
function findForbiddenKey(value, forbidden) {
    const pending = [value];
    while (pending.length > 0) {
        const item = pending.pop();
        if (Array.isArray(item)) {
            pending.push(...item);
            continue;
        }
        if (typeof item !== 'object' || item === null)
            continue;
        for (const [key, child] of Object.entries(item)) {
            if (forbidden.has(key))
                return key;
            pending.push(child);
        }
    }
    return undefined;
}
function firstIndex(events, type) {
    return events.findIndex(event => event.type === type);
}
/**
 * Deterministic temporal/non-leakage gate for captured model and UI events.
 * This intentionally checks a few protocol invariants rather than judging prose quality.
 */
export function gradeLearningTranscript(candidate) {
    const checks = [];
    const events = candidate.events;
    const questionCalls = events.filter(event => event.type === 'learning-question-call');
    const revealCalls = events.filter(event => event.type === 'learning-reveal-call');
    const learningCalls = [...questionCalls, ...revealCalls];
    const callsByStep = new Map();
    let missingStepId = false;
    for (const event of learningCalls) {
        if (event.stepId === undefined || event.stepId === '') {
            missingStepId = true;
            continue;
        }
        callsByStep.set(event.stepId, (callsByStep.get(event.stepId) ?? 0) + 1);
    }
    checks.push({
        name: 'one-learning-gate-per-model-step',
        passed: !missingStepId && [...callsByStep.values()].every(count => count === 1),
        detail: 'each model step must contain exactly one Question or Reveal gate',
    });
    const badQuestionKey = questionCalls
        .map(event => findForbiddenKey(event.payload, QUESTION_FORBIDDEN_KEYS))
        .find(key => key !== undefined);
    checks.push({
        name: 'question-shape-does-not-leak',
        passed: badQuestionKey === undefined,
        detail: badQuestionKey === undefined
            ? 'Question payload contains no Reveal/future-round fields'
            : `Question payload contains forbidden key ${badQuestionKey}`,
    });
    const badRevealKey = revealCalls
        .map(event => findForbiddenKey(event.payload, REVEAL_FORBIDDEN_KEYS))
        .find(key => key !== undefined);
    checks.push({
        name: 'reveal-shape-does-not-advance',
        passed: badRevealKey === undefined,
        detail: badRevealKey === undefined
            ? 'Reveal payload contains no next-question fields'
            : `Reveal payload contains forbidden key ${badRevealKey}`,
    });
    const firstQuestionResult = firstIndex(events, 'learning-question-result');
    const beforeAnswer = serialized(events.slice(0, firstQuestionResult < 0 ? events.length : firstQuestionResult));
    const leakedAnswer = candidate.answerMarkers?.find(marker => beforeAnswer.includes(normalized(marker)));
    checks.push({
        name: 'no-answer-before-question-result',
        passed: leakedAnswer === undefined,
        detail: leakedAnswer === undefined ? 'no configured answer marker leaked early' : `leaked ${JSON.stringify(leakedAnswer)}`,
    });
    const firstRevealResult = firstIndex(events, 'learning-reveal-result');
    const beforeNextRound = serialized(events.slice(0, firstRevealResult < 0 ? events.length : firstRevealResult + 1));
    const leakedFuture = candidate.futureMarkers?.find(marker => beforeNextRound.includes(normalized(marker)));
    checks.push({
        name: 'no-future-round-before-reveal-result',
        passed: leakedFuture === undefined,
        detail: leakedFuture === undefined ? 'no configured future-round marker leaked early' : `leaked ${JSON.stringify(leakedFuture)}`,
    });
    const questionResult = firstIndex(events, 'learning-question-result');
    const revealCall = firstIndex(events, 'learning-reveal-call');
    const animationFinished = firstIndex(events, 'animation-finished');
    const continueEnabled = firstIndex(events, 'continue-enabled');
    const continueCommitted = firstIndex(events, 'continue-committed');
    const revealResult = firstIndex(events, 'learning-reveal-result');
    const nextQuestion = events.findIndex((event, index) => index > revealResult && event.type === 'learning-question-call');
    const completeSequence = [questionResult, revealCall, animationFinished, continueEnabled, continueCommitted, revealResult, nextQuestion]
        .every(index => index >= 0);
    const chronological = completeSequence
        && questionResult < revealCall
        && animationFinished <= continueEnabled
        && continueEnabled <= continueCommitted
        && continueCommitted <= revealResult
        && revealResult < nextQuestion
        && events.every((event, index) => index === 0 || event.at >= events[index - 1].at);
    checks.push({
        name: 'question-reveal-next temporal gate',
        passed: chronological,
        detail: 'Question result < Reveal; animation <= continue; continue <= Reveal result < next Question',
    });
    return { caseId: 'learning-transcript', passed: checks.every(check => check.passed), checks };
}
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
        expectedActivityKind: 'plot',
        requiredContinuationTerms: ['slope'],
        rationale: 'A bounded quantitative relationship should be manipulated locally.',
    },
    {
        id: 'process-state',
        learnerPrompt: 'Walk me through what happens to a queue when we dequeue twice.',
        expectedActivityKind: 'node_link',
        requiredContinuationTerms: ['queue'],
        rationale: 'A non-blocking node-link sequence can expose state transitions without creating an answer gate.',
    },
    {
        id: 'structure-difference',
        learnerPrompt: 'Help me compare array and linked-list lookup structure.',
        expectedActivityKind: 'relation',
        requiredContinuationTerms: ['array', 'linked'],
        rationale: 'A native comparison relation makes the structural contrast directly inspectable.',
    },
    {
        id: 'fully-connected-network',
        learnerPrompt: 'Draw a fully connected neuron layer so I can see every connection.',
        expectedActivityKind: 'node_link',
        requiredContinuationTerms: ['connection', 'layer'],
        rationale: 'Topology must be rendered as layered nodes and explicit edges, never replaced by an activation curve.',
    },
    {
        id: 'derivative-formula-recall',
        learnerPrompt: 'I understand tangent slope; remind me of the derivative formula.',
        expectedActivityKind: null,
        requiredContinuationTerms: ['limit'],
        rationale: 'Formula recall needs the formula directly; a parameter plot would add irrelevant interaction.',
    },
    {
        id: 'vector-geometry',
        learnerPrompt: 'Show me geometrically how two vectors add head to tail.',
        expectedActivityKind: 'scene_2d',
        requiredContinuationTerms: ['vector'],
        rationale: 'A spatial construction belongs in a coordinate scene.',
    },
    {
        id: 'historical-chronology',
        learnerPrompt: 'Make an interactive timeline of the discoveries that led from classical genetics to DNA sequencing.',
        expectedActivityKind: 'timeline',
        requiredContinuationTerms: ['chronology'],
        rationale: 'Events and eras whose order is the explanatory structure require a dedicated timeline.',
    },
    {
        id: 'formula-derivation',
        learnerPrompt: 'Walk me through each algebraic transformation in the quadratic formula derivation.',
        expectedActivityKind: 'formula_steps',
        requiredContinuationTerms: ['derivation'],
        rationale: 'A symbolic derivation needs explicit expressions and named transition rules, not a generic plot.',
    },
    {
        id: 'reference-material-map',
        learnerPrompt: 'I attached a six-chapter study guide. Map its sections, key concepts, and prerequisites before we go deep.',
        expectedActivityKind: 'study_map',
        requiredContinuationTerms: ['section'],
        rationale: 'A multi-section source needs an anchored navigable overview before concept-level teaching.',
    },
    {
        id: 'requested-flashcards',
        learnerPrompt: 'Turn the material we just covered into active-recall flashcards with hints.',
        expectedActivityKind: 'recall_deck',
        requiredContinuationTerms: ['recall'],
        rationale: 'An explicit active-recall request should produce a native revealable deck.',
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
    { caseId: 'parameter-relationship', activityKind: 'plot', continuation: 'Explore how slope changes direction.', endedSegment: false },
    { caseId: 'process-state', activityKind: 'node_link', continuation: 'Follow each queue transition while keeping the ordinary conversation available.', endedSegment: false },
    { caseId: 'structure-difference', activityKind: 'relation', continuation: 'Compare how array and linked-list nodes connect.', endedSegment: false },
    { caseId: 'fully-connected-network', activityKind: 'node_link', continuation: 'Every connection between one layer and the next is visible.', endedSegment: false },
    { caseId: 'derivative-formula-recall', activityKind: null, continuation: 'Use the limit definition directly: f\'(x) = lim h→0 [f(x+h)−f(x)]/h.', endedSegment: false },
    { caseId: 'vector-geometry', activityKind: 'scene_2d', continuation: 'The second vector starts at the head of the first.', endedSegment: false },
    { caseId: 'historical-chronology', activityKind: 'timeline', continuation: 'Read the chronology from each discovery to the next.', endedSegment: false },
    { caseId: 'formula-derivation', activityKind: 'formula_steps', continuation: 'Each derivation step names the algebraic rule that justifies the next expression.', endedSegment: false },
    { caseId: 'reference-material-map', activityKind: 'study_map', continuation: 'Start from the source section map, then follow the prerequisite path into one concept.', endedSegment: false },
    { caseId: 'requested-flashcards', activityKind: 'recall_deck', continuation: 'Try active recall before revealing each answer.', endedSegment: false },
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