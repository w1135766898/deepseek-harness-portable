import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'

export default clientBundle('@dsh-portable/interactive-learning', [
  'lib/types/index.js',
  'lib/types/agent.js',
  'lib/types/protocol.js',
  'lib/types/installer.js',
  'lib/types/installer-cli.js',
  'lib/types/preset.js',
  'lib/types/eval.js',
  'lib/types/eval-cli.js',
])
