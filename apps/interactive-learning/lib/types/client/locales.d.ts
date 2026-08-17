export declare const zh: {
    scaffold: string;
    submit: string;
    skip: string;
    cancel: string;
    submitting: string;
    waiting: string;
    completed: string;
    skipped: string;
    cancelled: string;
    noResponse: string;
    invalidResult: string;
    processEvidence: string;
    structureEvidence: string;
    answer: string;
    answerPlaceholder: string;
    predict: string;
    reveal: string;
    previous: string;
    next: string;
    restart: string;
    step: string;
    processMap: string;
    compareMap: string;
    rangeValue: string;
    decreaseParameter: string;
    increaseParameter: string;
    chartLabel: string;
    chartDescription: string;
    invalidActivity: string;
    error: string;
};
export declare const en: typeof zh;
export type LearningLocaleKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'interactive-learning': LearningLocaleKey;
    }
}
//# sourceMappingURL=locales.d.ts.map