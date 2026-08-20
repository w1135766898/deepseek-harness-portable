/**
 * State controller for the VisionCard settings UI.
 * Connects SettingsScope<VisionSettings> to the React view model.
 * @module @dsh-portable/vision-bridge/client/vision-card-controller
 */
import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { VisionConfig } from '../types.ts';
import { type VisionRouteSummary } from './vision-route.ts';
export interface VisionSettings extends VisionConfig {
}
export interface VisionCardState {
    available: boolean;
    writable: boolean;
    dirty: boolean;
    saving: boolean;
    failed: boolean;
    enabled: boolean;
    model: string;
    route: VisionRouteSummary;
}
export interface VisionCardFace {
    hooks: {
        visionCard: SnapshotStore<VisionCardState>;
    };
    edit: (field: keyof VisionSettings, value: unknown) => void;
    save: () => Promise<void>;
    discard: () => void;
    useAutomaticModel: () => void;
}
export declare class VisionCardController {
    private readonly scope;
    private readonly store;
    private staged;
    private saving;
    private failed;
    constructor(scope: SettingsScope<VisionSettings>);
    /** Staged edit, then stored value, then the schema default. */
    private field;
    private projection;
    edit: (field: keyof VisionSettings, value: unknown) => void;
    /** Clear the model pin so the host discovers an image-capable model itself. */
    useAutomaticModel: () => void;
    discard: () => void;
    save: () => Promise<void>;
    inject(): VisionCardFace;
}
//# sourceMappingURL=vision-card-controller.d.ts.map