/** Portable runtime session-event compatibility declarations. */

import {
  KNOWN_SESSION_EVENT_TYPES,
} from '@deepseek-ai/dsh-session'
import { registerInteractiveLearningSessionCompatibility } from '@dsh-portable/interactive-learning/bootstrap'
import type { RuntimeModeTrace } from './mode-catalog.js'

/** Exact durable discriminator used by portable mode-resolution diagnostics. */
export const PORTABLE_MODE_RESOLUTION_EVENT_TYPE = 'portable-runtime/mode-resolution' as const

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /**
     * Records the portable runtime variant selected for the session.
     * @param modeId - Requested portable mode id.
     * @mode append
     */
    [PORTABLE_MODE_RESOLUTION_EVENT_TYPE]: RuntimeModeTrace
  }
}

/** Register the exact legacy portable event understood by this distribution. */
export function registerPortableSessionCompatibility(): void {
  // rc7 exposes the catalog as ReadonlySet, but the runtime value is the
  // process-wide Set also read by persistence. Extend only this exact event.
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(PORTABLE_MODE_RESOLUTION_EVENT_TYPE)
}

/** Register every required event understood by the packaged runtime before persistence can read. */
export function registerPackagedSessionCompatibility(): void {
  // Learning state is required durable data. Register it; never downgrade it
  // to an ignorable event merely to make an older startup path accept it.
  registerInteractiveLearningSessionCompatibility()
  registerPortableSessionCompatibility()
}

/** Minimal append capability required by the portable diagnostic producer. */
export interface PortableModeResolutionWriter {
  append(
    type: typeof PORTABLE_MODE_RESOLUTION_EVENT_TYPE,
    data: RuntimeModeTrace,
    opts: { ignorable: true },
  ): unknown
}

/**
 * Append an informational mode-resolution trace with forward-safe metadata.
 * @param session - Session receiving the durable diagnostic.
 * @param trace - Resolved portable mode trace.
 */
export function appendPortableModeResolution(session: unknown, trace: RuntimeModeTrace): void {
  ;(session as PortableModeResolutionWriter).append(PORTABLE_MODE_RESOLUTION_EVENT_TYPE, trace, { ignorable: true })
}
