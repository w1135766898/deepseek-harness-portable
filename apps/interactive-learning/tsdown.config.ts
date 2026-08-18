import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'
import type { TsdownPlugin } from 'tsdown'

const PACKAGE_ID = '@dsh-portable/interactive-learning'
const ABSOLUTE_CSS_VIRTUAL_ID = /\\0dsh-css:(?:[A-Za-z]:[\\/]|\/)[^\r\n]*?[\\/]src[\\/]client[\\/]([^\\/\r\n]+\.module\.css\.mjs)/g

/**
 * Rolldown emits virtual module ids in region comments. The shared CSS plugin
 * needs an absolute path while loading the stylesheet, but that build-machine
 * path is not part of the published artifact contract. Strip it after bundle
 * generation while retaining a stable, package-relative diagnostic id.
 */
function sanitizePublishedPath(value: string): string {
  return value.replace(ABSOLUTE_CSS_VIRTUAL_ID, '\\0dsh-css:src/client/$1')
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
    plugins: [...(config.plugins ?? []), pathSanitizer],
  }
})
