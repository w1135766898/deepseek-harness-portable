export type CapabilityState = 'available' | 'degraded' | 'unavailable';
export type ModeSupportLevel = 'native' | 'compatible' | 'alternative' | 'unavailable';
export interface CapabilityResult {
    readonly state: CapabilityState;
    readonly provider?: string;
    readonly version?: string;
    readonly reason?: string;
    readonly remediation?: string;
    readonly limitations?: readonly string[];
}
export interface CapabilityReport {
    readonly target: {
        readonly platform: NodeJS.Platform;
        readonly arch: NodeJS.Architecture;
    };
    readonly capabilities: Readonly<Record<string, CapabilityResult>>;
    readonly generatedAt: string;
    readonly snapshotHash: string;
}
export interface ModeVariant {
    readonly id: string;
    readonly supportLevel: Exclude<ModeSupportLevel, 'unavailable'>;
    readonly requires: readonly string[];
    readonly acceptsDegraded?: readonly string[];
    readonly limitations?: readonly string[];
    readonly config: string;
    readonly provides?: Readonly<Record<string, string>>;
}
export interface ModeDefinition {
    readonly id: string;
    readonly baseConfig?: string;
    readonly contract: ModeContract;
    readonly variants: readonly ModeVariant[];
}
export interface ModeContract {
    readonly tools?: {
        readonly exactRows?: readonly string[];
        readonly requiredRows?: readonly string[];
        readonly variantSlots?: Readonly<Record<string, readonly string[]>>;
    };
    readonly composition?: {
        readonly requiredRows?: readonly string[];
        readonly forbiddenRows?: readonly string[];
    };
    readonly [key: string]: unknown;
}
export interface MissingCapability {
    readonly id: string;
    readonly reason: string;
    readonly remediation?: string;
}
export type ResolvedMode = {
    readonly modeId: string;
    readonly variantId: string;
    readonly supportLevel: Exclude<ModeSupportLevel, 'unavailable'>;
    readonly limitations: readonly string[];
} | {
    readonly modeId: string;
    readonly supportLevel: 'unavailable';
    readonly missingCapabilities: readonly string[];
    readonly missing: readonly MissingCapability[];
    readonly reason: string;
    readonly remediation: readonly string[];
};
/** Resolve the first variant whose complete capability contract is available. */
export declare function resolveVariant(mode: ModeDefinition, report: CapabilityReport): ResolvedMode;
/**
 * Pick the closest platform implementation for diagnostics and fail-loud tool
 * startup when no variant is fully usable. Product support remains
 * `unavailable`; this fallback never upgrades the resolver result.
 */
export declare function closestVariant(mode: ModeDefinition, report: CapabilityReport): ModeVariant;
//# sourceMappingURL=mode-resolver.d.ts.map