import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectPackageReferences,
  generatedDependencyMap,
  resolveWorkspaceDependencyClosure,
  type WorkspacePackage,
} from './dependency-closure.js'
import { isManifestBridge } from '../build/client-manifest-bridge.js'
import {
  auditRuntimeWorkspaceLinks,
  repairRuntimeWorkspaceLinks,
  type RuntimeWorkspacePackageLink,
} from './workspace-links.js'

const root = resolve(import.meta.dirname, '..', '..')
const runtimeRoot = join(root, 'apps', 'runtime')
const runtimeManifestPath = join(runtimeRoot, 'package.json')
const generatedPath = join(runtimeRoot, 'runtime-deps.generated.json')

const STATIC_WORKSPACE_ROOTS = [
  '@dsh-portable/desktop-protocol',
  '@dsh-portable/interactive-learning',
  '@dsh-portable/vision-bridge',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-include',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-cmdline',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/dsh-web-app',
] as const

const EXTERNAL_RUNTIME_ROOTS = {
  'dsh-plugin-marketplace': 'github:AwesomeHou/dsh-plugin-marketplace#463e6cb856272018a7f5a76e260a0d1ef5b589e3',
  'js-yaml': '^4.2.0',
  'node-addon-require-builtin': '^0.1.4',
  'pnpm': '11.21.0',
} as const

const SKIPPED_DIRECTORIES = new Set([
  '.git', '.pnpm', 'dist', 'lib', 'node_modules', 'test', 'tests', 'fixtures', 'coverage',
])

async function filesBelow(directory: string, predicate: (path: string) => boolean): Promise<string[]> {
  if (!existsSync(directory)) return []
  const result: string[] = []
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(path)
      } else if (entry.isFile() && predicate(path)) {
        result.push(path)
      }
    }
  }
  await visit(directory)
  return result.sort()
}

async function workspacePackages(): Promise<Map<string, WorkspacePackage>> {
  const roots = [
    join(root, 'vendor', 'deepseek-harness'),
    join(root, 'apps'),
    join(root, 'packages'),
  ]
  const paths = (await Promise.all(roots.map(directory => filesBelow(
    directory,
    path => path.endsWith(`${sep}package.json`) || path === join(directory, 'package.json'),
  )))).flat()
  const packages = new Map<string, WorkspacePackage>()
  for (const path of paths) {
    const manifest = JSON.parse(await readFile(path, 'utf8')) as Partial<WorkspacePackage>
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue
    // A mirrored manifest restates a package that already lives in this scan;
    // reading it as a second package would collide with its own source.
    if (isManifestBridge(manifest)) continue
    const item: WorkspacePackage = {
      name: manifest.name,
      version: manifest.version,
      path: relative(root, dirname(path)).replaceAll('\\', '/'),
      dependencies: manifest.dependencies,
      peerDependencies: manifest.peerDependencies,
      optionalDependencies: manifest.optionalDependencies,
    }
    const previous = packages.get(item.name)
    if (previous !== undefined && previous.path !== item.path) {
      throw new Error(`duplicate workspace package ${item.name}: ${previous.path}, ${item.path}`)
    }
    packages.set(item.name, item)
  }
  return packages
}

async function modeRoots(): Promise<string[]> {
  const paths = await filesBelow(join(runtimeRoot, 'config'), path => /\.(?:ya?ml|md)$/.test(path))
  return collectPackageReferences(await Promise.all(paths.map(path => readFile(path, 'utf8'))))
}

export async function generatedRuntimeState(): Promise<{
  manifest: Record<string, unknown>
  generated: {
    schemaVersion: number
    generatedBy: string
    roots: string[]
    closureHash: string
    packages: RuntimeWorkspacePackageLink[]
    dependencies: Record<string, string>
  }
}> {
  const [packages, configRoots] = await Promise.all([workspacePackages(), modeRoots()])
  const roots = [...new Set([...STATIC_WORKSPACE_ROOTS, ...configRoots])].sort()
  const closure = resolveWorkspaceDependencyClosure(packages, roots)
  const dependencies = generatedDependencyMap(closure, EXTERNAL_RUNTIME_ROOTS)
  const closureBody = JSON.stringify(closure.map(pkg => ({ name: pkg.name, version: pkg.version, path: pkg.path })))
  const generated = {
    schemaVersion: 1,
    generatedBy: 'scripts/runtime/sync-runtime-deps.ts',
    roots,
    closureHash: `sha256:${createHash('sha256').update(closureBody).digest('hex')}`,
    packages: closure.map(pkg => ({ name: pkg.name, version: pkg.version, path: pkg.path })),
    dependencies,
  }
  const manifest = JSON.parse(await readFile(runtimeManifestPath, 'utf8')) as Record<string, unknown>
  return { manifest: { ...manifest, dependencies }, generated }
}

export async function syncRuntimeDependencies(check = false, repairLinksOnly = false): Promise<void> {
  const state = await generatedRuntimeState()
  if (repairLinksOnly) {
    const repaired = await repairRuntimeWorkspaceLinks(root, runtimeRoot, state.generated.packages)
    console.log(repaired.length === 0
      ? 'runtime workspace links are current'
      : `runtime workspace links repaired: ${repaired.join(', ')}`)
    return
  }
  const manifestText = `${JSON.stringify(state.manifest, null, 2)}\n`
  const generatedText = `${JSON.stringify(state.generated, null, 2)}\n`
  if (check) {
    const mismatches: string[] = []
    if (await readFile(runtimeManifestPath, 'utf8') !== manifestText) mismatches.push(relative(root, runtimeManifestPath))
    if (!existsSync(generatedPath) || await readFile(generatedPath, 'utf8') !== generatedText) {
      mismatches.push(relative(root, generatedPath))
    }
    mismatches.push(...await auditRuntimeWorkspaceLinks(root, runtimeRoot, state.generated.packages))
    if (mismatches.length > 0) throw new Error(`runtime dependency closure is stale: ${mismatches.join(', ')}`)
    console.log(`runtime dependency closure is current: ${state.generated.packages.length} workspace packages`)
    return
  }
  await Promise.all([
    writeFile(runtimeManifestPath, manifestText),
    writeFile(generatedPath, generatedText),
  ])
  const repaired = await repairRuntimeWorkspaceLinks(root, runtimeRoot, state.generated.packages)
  console.log(`runtime dependency closure synchronized: ${state.generated.packages.length} workspace packages; ${repaired.length} link(s) repaired`)
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  await syncRuntimeDependencies(process.argv.includes('--check'), process.argv.includes('--repair-links'))
}
