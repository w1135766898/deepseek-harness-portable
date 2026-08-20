import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'
import type { TsdownPlugin } from 'tsdown'

const PACKAGE_ID = '@dsh-portable/interactive-learning'
const ABSOLUTE_CSS_VIRTUAL_ID = /\\0dsh-css:(?:[A-Za-z]:[\\/]|\/)[^\r\n]*?[\\/]src[\\/]client[\\/]((?:[^\\/\r\n]+[\\/])*[^\\/\r\n]+\.module\.css\.mjs)/g

/**
 * Rolldown emits virtual module ids in region comments. The shared CSS plugin
 * needs an absolute path while loading the stylesheet, but that build-machine
 * path is not part of the published artifact contract. Strip it after bundle
 * generation while retaining a stable, package-relative diagnostic id.
 */
function sanitizePublishedPath(value: string): string {
  // The captured tail keeps the nested `visuals/styles/` segments, and on a
  // Windows build still carries backslashes; the published diagnostic id is
  // normalised so the bundle is byte-identical whichever platform built it.
  return value.replace(ABSOLUTE_CSS_VIRTUAL_ID, (_match, tail: string) => (
    `\\0dsh-css:src/client/${tail.replaceAll('\\', '/')}`
  ))
}

const pathSanitizer: TsdownPlugin = {
  name: 'learning-package-path-sanitizer',
  generateBundle(_options, outputBundle) {
    for (const file of Object.values(outputBundle)) {
      if (file.type === 'chunk') file.code = sanitizePublishedPath(file.code)
      else if (typeof file.source === 'string') file.source = sanitizePublishedPath(file.source)
    }
  },
}

/** Virtual modules the shared CSS plugin creates, one per `*.module.css`. */
const CSS_VIRTUAL_ID = /dsh-css:.*\.module\.css\.mjs$/

/**
 * lightningcss does not guarantee a stable iteration order for its exports, so
 * the generated class table lands in a different order on each build. This
 * package commits `lib/` for direct installs, where that churn rewrites the
 * client bundle on every rebuild and buries real changes in the diff.
 *
 * The emitted line is a single `export default {json};`, so it is re-serialized
 * with sorted keys rather than pattern-matched out of the bundled output. The
 * ordering is fixed here instead of in the pinned upstream plugin, which this
 * repository vendors as a submodule.
 */
const deterministicClassMap: TsdownPlugin = {
  name: 'learning-deterministic-css-class-map',
  transform(code: string, id: string) {
    if (!CSS_VIRTUAL_ID.test(id)) return null
    return code.replace(/^export default (\{.*\});$/m, (match: string, literal: string) => {
      try {
        const parsed = JSON.parse(literal) as Record<string, string>
        const sorted = Object.fromEntries(
          Object.entries(parsed).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
        )
        return `export default ${JSON.stringify(sorted)};`
      } catch {
        return match
      }
    })
  },
}

const bundle = clientBundle(PACKAGE_ID, [
  'lib/types/index.js',
  'lib/types/agent.js',
  'lib/types/bootstrap.js',
  'lib/types/protocol.js',
  'lib/types/installer.js',
  'lib/types/installer-cli.js',
  'lib/types/preset.js',
  'lib/types/eval.js',
  'lib/types/eval-cli.js',
])

export default (inlineConfig: Parameters<typeof bundle>[0]) => bundle(inlineConfig).map(config => {
  if (config.name !== `${PACKAGE_ID}/client`) return config
  return {
    ...config,
    plugins: [...(config.plugins ?? []), deterministicClassMap, pathSanitizer],
  }
})
