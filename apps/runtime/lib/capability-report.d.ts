import type { CapabilityReport } from './mode-resolver.js';
export interface ProbeOutcome {
    readonly ok: boolean;
    readonly provider?: string;
    readonly version?: string;
    readonly reason?: string;
    readonly remediation?: string;
    readonly limitations?: readonly string[];
}
export interface CapabilityProbeOverrides {
    readonly pty?: (file: string, args: string[]) => Promise<ProbeOutcome>;
    readonly persistentShell?: (file: string, args: string[], dialect: 'bash' | 'powershell') => Promise<ProbeOutcome>;
    readonly command?: (file: string, args: string[], expected?: string) => Promise<ProbeOutcome>;
    readonly posixSignals?: () => Promise<ProbeOutcome>;
    readonly sandboxWorkspaceWrite?: () => Promise<ProbeOutcome>;
    readonly directoryPickerIpc?: () => Promise<ProbeOutcome>;
}
export interface CapabilityReportOptions {
    readonly platform?: NodeJS.Platform;
    readonly arch?: NodeJS.Architecture;
    readonly overrides?: CapabilityProbeOverrides;
    readonly cache?: false | {
        readonly path: string;
        readonly refresh?: boolean;
        readonly upstreamVersion?: string;
        readonly probeImplementationHash?: string;
        readonly maxAgeMs?: number;
    };
}
export declare function capabilitySnapshotHash(report: Pick<CapabilityReport, 'target' | 'capabilities'>): string;
/** Run bounded, effect-based runtime capability probes. No platform receives support by declaration alone. */
export declare function collectCapabilityReport(options?: CapabilityReportOptions): Promise<CapabilityReport>;
//# sourceMappingURL=capability-report.d.ts.map