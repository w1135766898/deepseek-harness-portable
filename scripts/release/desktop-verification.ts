import { readdirSync } from 'node:fs'

export interface DesktopVerificationFiles {
  readonly runtimeSources: readonly string[]
  readonly nodeTests: readonly string[]
  readonly tsxTests: readonly string[]
  readonly syntaxFiles: readonly string[]
}

/**
 * Discover desktop verification inputs from naming conventions so adding a
 * runtime module or test cannot silently bypass the release gate.
 */
export function discoverDesktopVerificationFiles(sourceDir: string): DesktopVerificationFiles {
  const files = readdirSync(sourceDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort()
  const isNodeTest = (file: string): boolean => file.endsWith('.test.cjs') || file.endsWith('.test.js')
  const isTsxTest = (file: string): boolean => file.endsWith('.test.ts') || file.endsWith('.test.tsx')
  const isTest = (file: string): boolean => isNodeTest(file) || isTsxTest(file)
  return {
    runtimeSources: files.filter(file => file.endsWith('.cjs') && !isTest(file)),
    nodeTests: files.filter(isNodeTest),
    tsxTests: files.filter(isTsxTest),
    syntaxFiles: files.filter(file => !isTest(file) && /\.(?:cjs|mjs|js)$/.test(file)),
  }
}
