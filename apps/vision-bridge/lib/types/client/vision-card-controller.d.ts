/**
 * State controller for the VisionCard settings UI.
 * Connects SettingsScope<VisionSettings> to the React view model.
 * @module @dsh-portable/vision-bridge/client/vision-card-controller
 */
import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { VisionConfig } from '../types.ts';
export interface VisionSettings extends VisionConfig {
}
export interface VisionCardState {
    available: boolean;
    writable: boolean;
    dirty: boolean;
    saving: boolean;
    failed: boolean;
    enabled: boolean;
    provider: string;
    model: string;
    baseURL: string;
    apiKey: string;
    prompt: string;
    hasStoredKey: boolean;
}
export interface VisionCardFace {
    hooks: {
        visionCard: SnapshotStore<VisionCardState>;
    };
    edit: (field: keyof VisionSettings, value: unknown) => void;
    save: () => Promise<void>;
    discard: () => void;
    selectProviderPreset: (preset: 'openai' | 'ollama' | 'compatible') => void;
}
export declare class VisionCardController {
    private readonly scope;
    private readonly store;
    private staged;
    private saving;
    private failed;
    constructor(scope: SettingsScope<VisionSettings>);
    private projection;
    edit: (field: keyof VisionSettings, value: unknown) => void;
    selectProviderPreset: (preset: "openai" | "ollama" | "compatible") => void;
    discard: () => void;
    save: () => Promise<void>;
    inject(): VisionCardFace;
}
//# sourceMappingURL=vision-card-controller.d.ts.map