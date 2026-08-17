import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

function pinnedWorkspaceAliases(): Record<string, string> {
  const aliases: Record<string, string> = {}
  const roots = [
    resolve(import.meta.dirname, '../../vendor/deepseek-harness/packages'),
    resolve(import.meta.dirname, '../../vendor/deepseek-harness/vendor'),
  ]
  const visit = (directory: string, depth: number): void => {
    if (depth > 4) return
    const manifestPath = join(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          name?: unknown
          main?: unknown
          exports?: Record<string, unknown>
        }
        if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
          // Register longer subpath aliases first. Vite string aliases also
          // match `find/…`, so a package-root alias would otherwise swallow
          // `@deepseek-ai/pkg/client` before its exact alias is considered.
          for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
            if (subpath === '.' || !subpath.startsWith('./') || subpath.includes('*')) continue
            const relativeTarget = typeof target === 'string' ? target
              : typeof target === 'object' && target !== null
                ? (target as { default?: unknown }).default : undefined
            if (typeof relativeTarget !== 'string') continue
            const subpathEntry = resolve(dirname(manifestPath), relativeTarget)
            if (existsSync(subpathEntry)) aliases[`${manifest.name}/${subpath.slice(2)}`] = subpathEntry
          }
          const main = typeof manifest.main === 'string' ? manifest.main : 'lib/index.js'
          const entry = resolve(dirname(manifestPath), main)
          if (existsSync(entry)) aliases[manifest.name] = entry
        }
      } catch {}
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'lib' || entry.name === 'src') continue
      visit(join(directory, entry.name), depth + 1)
    }
  }
  for (const root of roots) visit(root, 0)
  return aliases
}

export default defineConfig({
  resolve: {
    // Behavior-neutral in a healthy install; keeps focused tests usable if a
    // Windows pnpm relink leaves one vendored junction temporarily unreadable.
    alias: pinnedWorkspaceAliases(),
  },
})
