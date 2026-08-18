import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface RuntimeWorkspacePackageLink {
  name: string
  path: string
}

interface RuntimeDependencyState {
  packages?: RuntimeWorkspacePackageLink[]
}

function packageSegments(name: string): string[] {
  const segments = name.split('/')
  if (segments.length < 1 || segments.length > 2
    || segments.some(segment => segment === '' || segment === '.' || segment === '..' || segment.includes('\\'))) {
    throw new Error(`invalid workspace package name: ${name}`)
  }
  return segments
}

function containedPath(parent: string, child: string, label: string): string {
  const resolvedParent = resolve(parent)
  const resolvedChild = resolve(child)
  const relation = relative(resolvedParent, resolvedChild)
  if (relation === '' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || relation === '..' || isAbsolute(relation)) {
    throw new Error(`${label} escapes ${resolvedParent}: ${resolvedChild}`)
  }
  return resolvedChild
}

function canonical(path: string): string {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function installedPath(runtimeRoot: string, name: string): string {
  return containedPath(join(runtimeRoot, 'node_modules'), join(runtimeRoot, 'node_modules', ...packageSegments(name)), name)
}

function ignoredPath(destination: string): string {
  return join(dirname(destination), `.ignored_${basename(destination)}`)
}

async function pointsTo(destination: string, expected: string): Promise<boolean> {
  if (!existsSync(destination)) return false
  try {
    return canonical(await realpath(destination)) === canonical(await realpath(expected))
  } catch {
    return false
  }
}

export async function readRuntimeWorkspacePackages(runtimeRoot: string): Promise<RuntimeWorkspacePackageLink[]> {
  const state = JSON.parse(await readFile(join(runtimeRoot, 'runtime-deps.generated.json'), 'utf8')) as RuntimeDependencyState
  if (!Array.isArray(state.packages)) throw new Error('runtime-deps.generated.json does not contain packages')
  return state.packages
}

/** Report workspace dependencies that pnpm deploy materialized instead of linking. */
export async function auditRuntimeWorkspaceLinks(
  repoRoot: string,
  runtimeRoot: string,
  packages: readonly RuntimeWorkspacePackageLink[],
): Promise<string[]> {
  const issues: string[] = []
  for (const pkg of packages) {
    const source = containedPath(repoRoot, join(repoRoot, pkg.path), `${pkg.name} source`)
    const destination = installedPath(runtimeRoot, pkg.name)
    if (!existsSync(source)) {
      issues.push(`${pkg.name}: workspace source is missing (${source})`)
      continue
    }
    if (!existsSync(destination)) {
      issues.push(`${pkg.name}: runtime workspace link is missing`)
    } else if (!await pointsTo(destination, source)) {
      issues.push(`${pkg.name}: runtime dependency is a stale materialized copy`)
    }
    if (existsSync(ignoredPath(destination))) issues.push(`${pkg.name}: stale pnpm .ignored entry exists`)
  }
  return issues
}

/** Replace only generated workspace dependency entries with links to their source packages. */
export async function repairRuntimeWorkspaceLinks(
  repoRoot: string,
  runtimeRoot: string,
  packages: readonly RuntimeWorkspacePackageLink[],
): Promise<string[]> {
  const repaired: string[] = []
  let sequence = 0
  for (const pkg of packages) {
    const source = containedPath(repoRoot, join(repoRoot, pkg.path), `${pkg.name} source`)
    const destination = installedPath(runtimeRoot, pkg.name)
    if (!existsSync(source)) throw new Error(`${pkg.name}: workspace source is missing (${source})`)
    const ignored = ignoredPath(destination)
    const linked = await pointsTo(destination, source)
    if (!linked) {
      await mkdir(dirname(destination), { recursive: true })
      const temporary = join(dirname(destination), `.dsh-workspace-link-${basename(destination)}-${String(process.pid)}-${String(sequence)}`)
      sequence += 1
      await rm(temporary, { recursive: true, force: true })
      try {
        await symlink(source, temporary, process.platform === 'win32' ? 'junction' : 'dir')
        await rm(destination, { recursive: true, force: true })
        await rename(temporary, destination)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
      repaired.push(pkg.name)
    }
    await rm(ignored, { recursive: true, force: true })
  }
  return repaired
}

/** Keep legacy pnpm deploy from deleting dependency links inside workspace packages. */
export async function preserveWorkspaceNodeModules<T>(
  repoRoot: string,
  packages: readonly RuntimeWorkspacePackageLink[],
  action: () => Promise<T>,
): Promise<T> {
  const backupParent = containedPath(repoRoot, join(repoRoot, 'dist-desktop', '.host-node-modules'), 'workspace backup')
  await mkdir(backupParent, { recursive: true })
  const backupRoot = await mkdtemp(join(backupParent, 'run-'))
  const snapshots: Array<{ path: string; backup?: string }> = []
  const seen = new Set<string>()
  try {
    for (const [index, pkg] of packages.entries()) {
      const packageRoot = containedPath(repoRoot, join(repoRoot, pkg.path), `${pkg.name} source`)
      const nodeModules = containedPath(packageRoot, join(packageRoot, 'node_modules'), `${pkg.name} node_modules`)
      const key = canonical(nodeModules)
      if (seen.has(key)) continue
      seen.add(key)
      if (!existsSync(nodeModules)) {
        snapshots.push({ path: nodeModules })
        continue
      }
      const backup = join(backupRoot, String(index))
      await rename(nodeModules, backup)
      snapshots.push({ path: nodeModules, backup })
    }
    return await action()
  } finally {
    for (const snapshot of snapshots.reverse()) {
      await rm(snapshot.path, { recursive: true, force: true })
      if (snapshot.backup !== undefined && existsSync(snapshot.backup)) {
        await mkdir(dirname(snapshot.path), { recursive: true })
        await rename(snapshot.backup, snapshot.path)
      }
    }
    await rm(backupRoot, { recursive: true, force: true })
  }
}
