import { fileURLToPath } from 'node:url'

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      {
        find: '@deepseek-ai/dsh-client-ui-primitives',
        replacement: fileURLToPath(new URL('./markdown-stub.tsx', import.meta.url)),
      },
      {
        find: 'katex/dist/katex.min.css',
        replacement: fileURLToPath(new URL('../../../../vendor/deepseek-harness/packages/client/ui-primitives/node_modules/katex/dist/katex.min.css', import.meta.url)),
      },
      {
        find: 'katex',
        replacement: fileURLToPath(new URL('../../../../vendor/deepseek-harness/packages/client/ui-primitives/node_modules/katex/dist/katex.mjs', import.meta.url)),
      },
    ],
  },
  server: { host: '127.0.0.1', port: 41739, strictPort: true },
}
