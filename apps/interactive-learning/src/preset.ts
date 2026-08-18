import { fileURLToPath } from 'node:url'
import { registerInteractiveLearningSessionCompatibility } from './bootstrap.ts'

// apps/runtime/packaged-bin.ts imports this entry before boot. This is the
// clean-checkout load-order boundary that makes persisted learning/state
// events known before any session resume/load can validate them.
registerInteractiveLearningSessionCompatibility()

/** Packaged preset root; portable distributions merge this into their system roster. */
export const interactiveLearningPresetRoot = fileURLToPath(new URL('../preset/', import.meta.url))

/** The independently installable preset directory inside the package. */
export const interactiveLearningPresetSource = fileURLToPath(new URL('../preset/learning/', import.meta.url))
