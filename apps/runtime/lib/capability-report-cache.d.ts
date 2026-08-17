import type { CapabilityReport } from './mode-resolver.js';
export declare const CAPABILITY_CACHE_SCHEMA_VERSION = 1;
export declare const CAPABILITY_PROBE_REVISION = 1;
type CapabilityCacheEnvelope = {
    schemaVersion: number;
    probeRevision: number;
    writtenAt: string;
    runtime: {
        platform: NodeJS.Platform;
        arch: NodeJS.Architecture;
        nodeModules: string;
        electron: string;
        upstreamVersion: string;
        probeImplementationHash: string;
    };
    report: CapabilityReport;
};
export type CapabilityCacheIdentity = CapabilityCacheEnvelope['runtime'];
export declare function currentCapabilityCacheIdentity(platform?: NodeJS.Platform, arch?: NodeJS.Architecture, upstreamVersion?: string, probeImplementationHash?: string): CapabilityCacheIdentity;
export declare function readCapabilityReportCache(path: string, identity: CapabilityCacheIdentity, maxAgeMs?: number): Promise<CapabilityReport | undefined>;
export declare function writeCapabilityReportCache(path: string, identity: CapabilityCacheIdentity, report: CapabilityReport): Promise<void>;
export {};
//# sourceMappingURL=capability-report-cache.d.ts.map