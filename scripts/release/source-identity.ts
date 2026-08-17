import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i

export interface SourceIdentity {
  readonly portableCommit: string
  readonly upstreamCommit: string
}

export interface SourceIdentityOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly gitRevParse?: (cwd: string) => string | undefined
}

/** Return one validated git commit without leaking git failures to archive builds. */
export function gitRevParse(cwd: string): string | undefined {
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
    return COMMIT_PATTERN.test(value) ? value : undefined
  } catch {
    return undefined
  }
}

function configuredCommit(env: NodeJS.ProcessEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]
    if (value !== undefined && COMMIT_PATTERN.test(value)) return value
  }
  return undefined
}

/**
 * Resolve the two independent source identities. GITHUB_SHA belongs only to
 * the portable repository; the pinned Harness identity always comes from its
 * own override or the vendor/deepseek-harness checkout.
 */
export function resolveSourceIdentity(root: string, options: SourceIdentityOptions = {}): SourceIdentity {
  const env = options.env ?? process.env
  const revParse = options.gitRevParse ?? gitRevParse
  const portableCommit = configuredCommit(env, ['PORTABLE_GIT_COMMIT', 'GITHUB_SHA'])
    ?? revParse(root)
    ?? 'unknown'
  const upstreamCommit = configuredCommit(env, ['UPSTREAM_GIT_COMMIT', 'KERNEL_GIT_COMMIT'])
    ?? revParse(join(root, 'vendor', 'deepseek-harness'))
    ?? 'unknown'
  return { portableCommit, upstreamCommit }
}
