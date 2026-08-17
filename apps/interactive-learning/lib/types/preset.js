import { fileURLToPath } from 'node:url';
/** Packaged preset root; portable distributions merge this into their system roster. */
export const interactiveLearningPresetRoot = fileURLToPath(new URL('../preset/', import.meta.url));
/** The independently installable preset directory inside the package. */
export const interactiveLearningPresetSource = fileURLToPath(new URL('../preset/learning/', import.meta.url));
//# sourceMappingURL=preset.js.map