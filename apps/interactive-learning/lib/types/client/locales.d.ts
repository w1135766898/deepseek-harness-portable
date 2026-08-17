export declare const zh: {
    activity: string;
    objective: string;
    scaffold: string;
    submit: string;
    skip: string;
    cancel: string;
    submitting: string;
    waiting: string;
    completed: string;
    skipped: string;
    cancelled: string;
    answer: string;
    answerPlaceholder: string;
    response: string;
    selected: string;
    predict: string;
    parameterPredictionPrompt: string;
    parameterPredictionPlaceholder: string;
    commitPrediction: string;
    predictionCommitted: string;
    reveal: string;
    previous: string;
    next: string;
    restart: string;
    step: string;
    rangeValue: string;
    chartLabel: string;
    invalidActivity: string;
    error: string;
    noResponse: string;
    fallback: string;
};
export declare const en: typeof zh;
export type LearningLocaleKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'interactive-learning': LearningLocaleKey;
    }
}
//# sourceMappingURL=locales.d.ts.map