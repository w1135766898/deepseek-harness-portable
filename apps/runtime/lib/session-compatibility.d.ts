/** Portable runtime session-event compatibility declarations. */
import type { RuntimeModeTrace } from './mode-catalog.js';
/** Exact durable discriminator used by portable mode-resolution diagnostics. */
export declare const PORTABLE_MODE_RESOLUTION_EVENT_TYPE: "portable-runtime/mode-resolution";
declare module '@deepseek-ai/dsh-session' {
    interface SessionEventMap {
        /**
         * Records the portable runtime variant selected for the session.
         * @param modeId - Requested portable mode id.
         * @mode append
         */
        [PORTABLE_MODE_RESOLUTION_EVENT_TYPE]: RuntimeModeTrace;
    }
}
/** Register the exact legacy portable event understood by this distribution. */
export declare function registerPortableSessionCompatibility(): void;
/** Minimal append capability required by the portable diagnostic producer. */
export interface PortableModeResolutionWriter {
    append(type: typeof PORTABLE_MODE_RESOLUTION_EVENT_TYPE, data: RuntimeModeTrace, opts: {
        ignorable: true;
    }): unknown;
}
/**
 * Append an informational mode-resolution trace with forward-safe metadata.
 * @param session - Session receiving the durable diagnostic.
 * @param trace - Resolved portable mode trace.
 */
export declare function appendPortableModeResolution(session: unknown, trace: RuntimeModeTrace): void;
//# sourceMappingURL=session-compatibility.d.ts.map