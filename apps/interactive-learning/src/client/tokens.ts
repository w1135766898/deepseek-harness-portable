/**
 * Design-token scope for every learning surface.
 *
 * Importing this module loads `tokens.module.css`, which declares the shared
 * type ramp, spacing, radii, tones, focus ring and motion on the unhashed
 * `[data-learning-scope]` selector. Spreading {@link learningScope} onto a root
 * element opts its whole subtree into that scale, across both CSS Modules.
 */
import './tokens.module.css'

export const learningScope = { 'data-learning-scope': '' } as const
