/**
 * Localization strings for vision-bridge client components.
 * @module @dsh-portable/vision-bridge/client/locales
 */
export declare const zh: {
    cardTitle: string;
    cardDescription: string;
    enabled: string;
    enabledHint: string;
    provider: string;
    providerOpenAI: string;
    providerOllama: string;
    providerCompatible: string;
    model: string;
    modelHint: string;
    baseURL: string;
    baseURLHint: string;
    apiKey: string;
    apiKeyHint: string;
    apiKeySet: string;
    apiKeyUnset: string;
    promptOverride: string;
    promptOverrideHint: string;
    save: string;
    discard: string;
    unsaved: string;
    overridden: string;
    reset: string;
    readOnly: string;
    saving: string;
    saveFailed: string;
    collapse: string;
    expand: string;
};
export declare const en: {
    cardTitle: string;
    cardDescription: string;
    enabled: string;
    enabledHint: string;
    provider: string;
    providerOpenAI: string;
    providerOllama: string;
    providerCompatible: string;
    model: string;
    modelHint: string;
    baseURL: string;
    baseURLHint: string;
    apiKey: string;
    apiKeyHint: string;
    apiKeySet: string;
    apiKeyUnset: string;
    promptOverride: string;
    promptOverrideHint: string;
    save: string;
    discard: string;
    unsaved: string;
    overridden: string;
    reset: string;
    readOnly: string;
    saving: string;
    saveFailed: string;
    collapse: string;
    expand: string;
};
export type VisionLocaleKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'vision-bridge': VisionLocaleKey;
    }
}
//# sourceMappingURL=locales.d.ts.map