/** Build the vendored kernel through a JavaScript package-manager entry point. */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const KERNEL_PACKAGE = '@deepseek-ai/dsh-root'

/**
 * Resolve the JavaScript pnpm entry pinned by the runtime workspace.
 *
 * The kernel build re-spawns `node <npm_execpath>` for its own lib and web
 * steps, so a native `pnpm.exe` launcher — the default installation on
 * Windows — makes that spawn fail with ERR_UNKNOWN_FILE_EXTENSION. Driving the
 * build through the pinned JavaScript bin keeps `npm_execpath` loadable by Node
 * on every platform.
 * @param root - Repository root holding the runtime workspace.
 */
export function resolvePackageManagerEntry(root: string): string {
  const entry = join(root, 'apps', 'runtime', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  if (!existsSync(entry)) {
    throw new Error(`kernel build requires the pinned pnpm JavaScript entry at ${entry}; run pnpm install first`)
  }
  return entry
}

/**
 * Arguments that build the vendored kernel without a native launcher.
 * @param entry - JavaScript package-manager entry from {@link resolvePackageManagerEntry}.
 */
export function kernelBuildArguments(entry: string): readonly string[] {
  return [entry, '--filter', KERNEL_PACKAGE, 'run', 'build']
}

/** Build the browser client with DeepSeek's official brand occupants enabled. */
export function kernelBuildEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, DSH_BUILD_CLIENT_PROFILE: 'official' }
}

function main(): void {
  const root = resolve(import.meta.dirname, '..', '..')
  const result = spawnSync(process.execPath, [...kernelBuildArguments(resolvePackageManagerEntry(root))], {
    cwd: root,
    env: kernelBuildEnvironment(process.env),
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (import.meta.main) main()
