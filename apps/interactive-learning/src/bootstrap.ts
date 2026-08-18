/**
 * Earliest-load compatibility hook for the installable Learning package.
 *
 * The portable runtime statically imports this package's preset entry before
 * boot and before persistence can load a session. Keep required session-event
 * registration here so every Host/preset entry uses the same idempotent seam.
 */
import { registerLearningSessionEventType } from './learner-state.ts'

/** Register the exact required Learning session event before persistence load. */
export function registerInteractiveLearningSessionCompatibility(): void {
  registerLearningSessionEventType()
}

// Importing the stable bootstrap subpath is itself sufficient. Explicit calls
// from preset/Host entries remain useful documentation and are idempotent.
registerInteractiveLearningSessionCompatibility()
