import { type CapabilityReport, type ModeDefinition, type ModeVariant } from './mode-resolver.js';
export interface RuntimeModeTrace {
    readonly modeId: string;
    readonly variantId: string;
    readonly supportLevel: 'native' | 'compatible' | 'alternative';
    readonly presetHash: string;
    readonly upstreamCommit: string;
    readonly capabilitySnapshotHash: string;
    readonly limitations: readonly string[];
}
export interface RuntimeModeResolution {
    readonly modeId: string;
    readonly supportLevel: 'native' | 'compatible' | 'alternative' | 'unavailable';
    readonly selectable: boolean;
    readonly trace?: RuntimeModeTrace;
    readonly reason?: string;
    readonly remediation?: readonly string[];
    readonly missing?: readonly {
        id: string;
        reason: string;
        remediation?: string;
    }[];
}
export interface RuntimeModeCatalog {
    readonly schemaVersion: 1;
    readonly target: CapabilityReport['target'];
    readonly capabilitySnapshotHash: string;
    readonly upstreamCommit: string;
    readonly modes: Readonly<Record<string, RuntimeModeResolution>>;
}
/** Parse and validate one mode contract without evaluating composition JavaScript tags. */
export declare function parseModeDefinition(source: string, path: string): ModeDefinition;
/** Compose a stable base with one small platform implementation fragment. */
export declare function composeModeVariant(directory: string, definition: ModeDefinition, variant: ModeVariant): Promise<string>;
/** Fail loud when the final model-facing composition diverges from its stable contract. */
export declare function validateModeComposition(definition: ModeDefinition, variant: ModeVariant, source: string): void;
/** Compile selectable presets and omit every unavailable mode from upstream discovery. */
export declare function compileModeCatalog(root: string, report: CapabilityReport, upstreamCommit: string): Promise<RuntimeModeCatalog>;
export declare function measuredModeSupport(catalog: RuntimeModeCatalog): Record<string, Record<string, unknown>>;
//# sourceMappingURL=mode-catalog.d.ts.map