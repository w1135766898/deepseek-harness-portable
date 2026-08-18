import { t as registerInteractiveLearningSessionCompatibility } from "./bootstrap-BiT0bfyq.js";
import { fileURLToPath } from "node:url";
//#region lib/types/preset.js
registerInteractiveLearningSessionCompatibility();
/** Packaged preset root; portable distributions merge this into their system roster. */
const interactiveLearningPresetRoot = fileURLToPath(new URL("../preset/", import.meta.url));
/** The independently installable preset directory inside the package. */
const interactiveLearningPresetSource = fileURLToPath(new URL("../preset/learning/", import.meta.url));
//#endregion
export { interactiveLearningPresetSource as n, interactiveLearningPresetRoot as t };
