import { createRequire } from 'node:module'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  INTERACTIVE_LEARNING_APP_FILES,
  INTERACTIVE_LEARNING_PACKAGE_FILES,
  assertInteractiveLearningPublishedPathPolicy,
  type InteractiveLearningReleaseEvidence,
} from '../../packages/release-manifest/src/learning-contract.js'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as {
  DEFAULT_SCHEMA: { extend(types: unknown[]): unknown }
  Type: new (tag: string, options: { kind: 'scalar'; construct(value: string): string }) => unknown
  load(source: string, options?: { schema?: unknown }): unknown
}
const expressionSchema = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value }),
])

const PACKAGE_NAME = '@dsh-portable/interactive-learning' as const
const HOST_ROW_ID = 'interactive-learning' as const
const PRESET_ID = 'learning' as const
const AGENT_MODULE = `${PACKAGE_NAME}/agent` as const
const CLIENT_MODULE = `${PACKAGE_NAME}/client` as const
const PACKAGE_DIRECTORY = join('node_modules', '@dsh-portable', 'interactive-learning')

type PackageManifest = {
  name?: unknown
  main?: unknown
  bin?: unknown
  files?: unknown
  exports?: Record<string, unknown>
  dsh?: { client?: { inject?: unknown; platform?: unknown } }
}

type CompositionRow = { id?: unknown; name?: unknown }

function exportedDefault(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return (value as { default?: unknown }).default
}

function portablePath(path: string): string {
  return path.split(sep).join('/')
}

function packagePath(root: string, path: string): string {
  return join(root, ...path.split('/'))
}

type PackageTree = {
  readonly files: string[]
  readonly directories: string[]
  readonly links: string[]
}

type PublishedPackageSelection = PackageTree & {
  readonly selected: Set<string>
}

const AUTOMATIC_NPM_ROOT_FILE = /^(?:package\.json|readme(?:\..*)?|licen[cs]e(?:\..*)?)$/i
const ARCHIVE_FILE = /(?:^|\/)[^/]+\.(?:tgz|tar(?:\.(?:gz|bz2|xz|zst))?|zip|7z|rar|gz|bz2|xz|zst|asar)$/i

function comparePortablePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Enumerate package-owned paths without following links or workspace node_modules. */
async function packageTree(packageRoot: string): Promise<PackageTree> {
  const files: string[] = []
  const directories: string[] = []
  const links: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const relativePath = portablePath(relative(packageRoot, path))
      if (entry.isSymbolicLink()) {
        links.push(relativePath)
      } else if (entry.isDirectory()) {
        directories.push(relativePath)
        // npm never publishes a dependency's private install tree. Avoid
        // traversing a workspace package's potentially enormous link farm.
        if (relativePath !== 'node_modules') await visit(path)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }
  await visit(packageRoot)
  return {
    files: files.sort(comparePortablePaths),
    directories: directories.sort(comparePortablePaths),
    links: links.sort(comparePortablePaths),
  }
}

function normalizePublishedPattern(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Interactive Learning package files must contain non-empty string patterns')
  }
  const pattern = value.trim().replaceAll('\\', '/').replace(/^\.\//, '')
  if (pattern.startsWith('/') || pattern.startsWith('!') || /^[A-Za-z]:/.test(pattern)
    || pattern.split('/').includes('..')) {
    throw new Error(`Interactive Learning package files pattern escapes the package: ${value}`)
  }
  return pattern
}

/** Compile the small npm-files glob dialect used by the Learning manifest. */
function publishedPatternExpression(pattern: string): RegExp {
  let expression = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          expression += '(?:.*/)?'
        } else {
          expression += '.*'
        }
      } else {
        expression += '[^/]*'
      }
    } else if (character === '?') {
      expression += '[^/]'
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`${expression}$`)
}

/**
 * Resolve the exact set selected by package.json files from the current tree.
 * Workspace-only files may exist at build-source time, but archives may never
 * be selected and every literal manifest member must exist.
 */
async function publishedPackageSelection(
  packageRoot: string,
  manifest: PackageManifest,
): Promise<PublishedPackageSelection> {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Interactive Learning package requires a non-empty package.json files allowlist')
  }
  const patterns = manifest.files.map(normalizePublishedPattern)
  const matchers = patterns.map(pattern => ({ pattern, expression: publishedPatternExpression(pattern) }))
  const tree = await packageTree(packageRoot)
  const selected = new Set(tree.files.filter(path => (
    (!path.includes('/') && AUTOMATIC_NPM_ROOT_FILE.test(path))
    || matchers.some(({ expression }) => expression.test(path))
  )))
  const missingLiterals = patterns
    .filter(pattern => !/[?*]/.test(pattern) && !selected.has(pattern))
  if (missingLiterals.length > 0) {
    throw new Error(`Interactive Learning package files allowlist is missing literal outputs: ${missingLiterals.join(', ')}`)
  }
  const emptyPatterns = matchers
    .filter(({ expression }) => !tree.files.some(path => expression.test(path)))
    .map(({ pattern }) => pattern)
  if (emptyPatterns.length > 0) {
    throw new Error(`Interactive Learning package files patterns match no outputs: ${emptyPatterns.join(', ')}`)
  }
  const missingContract = INTERACTIVE_LEARNING_PACKAGE_FILES.filter(path => !selected.has(path))
  if (missingContract.length > 0) {
    throw new Error(`Interactive Learning package files exclude required runtime outputs: ${missingContract.join(', ')}`)
  }
  const archives = [...selected].filter(path => ARCHIVE_FILE.test(path))
  if (archives.length > 0) {
    throw new Error(`Interactive Learning package files select forbidden nested archives: ${archives.join(', ')}`)
  }
  assertInteractiveLearningPublishedPathPolicy([...selected].sort(comparePortablePaths))
  return { ...tree, selected }
}

/** Reject every file, link, or empty directory outside the manifest-derived packlist. */
export async function assertInteractiveLearningPublishedPackage(packageRoot: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest
  const selection = await publishedPackageSelection(packageRoot, manifest)
  if (!selection.selected.has('LICENSE')) {
    throw new Error('Interactive Learning published package is missing the materialized repository LICENSE')
  }
  const unexpectedFiles = selection.files.filter(path => !selection.selected.has(path))
  const unexpectedDirectories = selection.directories.filter(directory => (
    ![...selection.selected].some(path => path.startsWith(`${directory}/`))
  ))
  if (unexpectedFiles.length > 0 || selection.links.length > 0 || unexpectedDirectories.length > 0) {
    const unexpected = [
      ...unexpectedFiles,
      ...selection.links.map(path => `${path} (link)`),
      ...unexpectedDirectories.map(path => `${path}/`),
    ].sort(comparePortablePaths)
    throw new Error(`Interactive Learning package contains files outside its published allowlist: ${unexpected.join(', ')}`)
  }
}

/** Materialize only the package.json files selection inside a staging package. */
export async function pruneInteractiveLearningPackageToPublishedFiles(packageRoot: string): Promise<number> {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest
  const selection = await publishedPackageSelection(packageRoot, manifest)
  await Promise.all(selection.files
    .filter(path => !selection.selected.has(path))
    .map(path => rm(packagePath(packageRoot, path), { force: true })))
  await Promise.all(selection.links.map(path => rm(packagePath(packageRoot, path), { recursive: true, force: true })))
  const removableDirectories = selection.directories
    .filter(directory => ![...selection.selected].some(path => path.startsWith(`${directory}/`)))
    .sort((left, right) => right.length - left.length)
  for (const directory of removableDirectories) {
    await rm(packagePath(packageRoot, directory), { recursive: true, force: true })
  }
  await assertInteractiveLearningPublishedPackage(packageRoot)
  return selection.selected.size
}

/** Verify the package subtree inside a container against final-app evidence. */
export function assertInteractiveLearningContainerInventory(
  containerEntries: readonly string[],
  packagePrefix: string,
  publishedFiles: readonly string[],
): void {
  const prefix = packagePrefix.replaceAll('\\', '/').replace(/\/?$/, '/')
  const expected = [...publishedFiles].sort(comparePortablePaths)
  const expectedSet = new Set(expected)
  const actualFiles: string[] = []
  const unexpectedDirectories: string[] = []
  for (const rawEntry of containerEntries) {
    const entry = rawEntry.replaceAll('\\', '/')
    if (entry === prefix.slice(0, -1)) {
      throw new Error('Interactive Learning container package root must be a directory entry')
    }
    if (!entry.startsWith(prefix)) continue
    const relativePath = entry.slice(prefix.length)
    if (relativePath === '') continue
    if (relativePath.endsWith('/')) {
      const directory = relativePath.slice(0, -1)
      if (directory !== '' && !expected.some(path => path.startsWith(`${directory}/`))) {
        unexpectedDirectories.push(`${directory}/`)
      }
      continue
    }
    actualFiles.push(relativePath)
  }
  actualFiles.sort(comparePortablePaths)
  const duplicate = actualFiles.find((path, index) => path === actualFiles[index - 1])
  const actualSet = new Set(actualFiles)
  const missing = expected.filter(path => !actualSet.has(path))
  const unexpected = actualFiles.filter(path => !expectedSet.has(path))
  if (duplicate !== undefined || missing.length > 0 || unexpected.length > 0 || unexpectedDirectories.length > 0) {
    throw new Error(
      'Interactive Learning container inventory is not exact; '
      + `duplicate=${JSON.stringify(duplicate)} missing=${JSON.stringify(missing)} `
      + `unexpected=${JSON.stringify(unexpected)} directories=${JSON.stringify(unexpectedDirectories.sort(comparePortablePaths))}`,
    )
  }
}

/** Stable generated outputs that make the Learning package independently loadable. */
export function interactiveLearningPackageRequiredPaths(packageRoot: string): string[] {
  return INTERACTIVE_LEARNING_PACKAGE_FILES.map(path => packagePath(packageRoot, path))
}

/** Stable final-app outputs, including the runtime row that mounts the Host bundle. */
export function interactiveLearningAppRequiredPaths(appResources: string): string[] {
  return [
    ...INTERACTIVE_LEARNING_APP_FILES.map(path => packagePath(appResources, path)),
    ...interactiveLearningPackageRequiredPaths(join(appResources, PACKAGE_DIRECTORY)),
  ]
}

async function assertRequiredFiles(root: string, paths: readonly string[], label: string): Promise<void> {
  const missing: string[] = []
  for (const path of paths) {
    try {
      const metadata = await stat(packagePath(root, path))
      if (!metadata.isFile() || metadata.size === 0) missing.push(path)
    } catch {
      missing.push(path)
    }
  }
  if (missing.length > 0) throw new Error(`${label} is incomplete; missing or empty: ${missing.join(', ')}`)
}

function assertHostRow(source: string): void {
  const id = /(?:\bid\b|["']id["'])\s*:\s*["']interactive-learning["']/g
  for (const match of source.matchAll(id)) {
    const neighborhood = source.slice(match.index, match.index + 512)
    if (/(?:\bname\b|["']name["'])\s*:\s*["']@dsh-portable\/interactive-learning["']/.test(neighborhood)) return
  }
  throw new Error(`packaged runtime is missing the ${HOST_ROW_ID} Host row for ${PACKAGE_NAME}`)
}

function publishedJavaScriptEntries(manifest: PackageManifest): string[] {
  const entries = new Set<string>()
  const add = (value: unknown): void => {
    const entry = exportedDefault(value)
    if (typeof entry !== 'string' || !entry.endsWith('.js')) return
    entries.add(entry.replaceAll('\\', '/').replace(/^\.\//, ''))
  }
  add(manifest.main)
  for (const value of Object.values(manifest.exports ?? {})) add(value)
  if (typeof manifest.bin === 'string') add(manifest.bin)
  else if (typeof manifest.bin === 'object' && manifest.bin !== null && !Array.isArray(manifest.bin)) {
    for (const value of Object.values(manifest.bin as Record<string, unknown>)) add(value)
  }
  return [...entries].sort(comparePortablePaths)
}

async function assertRelativeJavaScriptClosure(
  packageRoot: string,
  entryFiles: readonly string[],
): Promise<Set<string>> {
  const packageBoundary = `${resolve(packageRoot)}${sep}`
  const pending = entryFiles.map(path => packagePath(packageRoot, path))
  const seen = new Set<string>()
  while (pending.length > 0) {
    const path = resolve(pending.pop() as string)
    if (seen.has(path)) continue
    seen.add(path)
    let source: string
    try {
      source = await readFile(path, 'utf8')
    } catch {
      throw new Error(`Interactive Learning JavaScript closure is missing ${portablePath(relative(packageRoot, path))}`)
    }
    const specifiers = new Set<string>()
    for (const pattern of [
      /\bfrom\s*["'](\.[^"']+)["']/g,
      /\bimport\s*["'](\.[^"']+)["']/g,
      /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    ]) {
      for (const match of source.matchAll(pattern)) specifiers.add(match[1])
    }
    for (const specifier of specifiers) {
      const target = resolve(dirname(path), specifier)
      if (target === resolve(packageRoot) || !target.startsWith(packageBoundary)) {
        throw new Error(`Interactive Learning JavaScript import escapes its package: ${specifier}`)
      }
      pending.push(target)
    }
  }
  return new Set([...seen].map(path => portablePath(relative(packageRoot, path))))
}

/**
 * Reject stale root bundles that broad package globs would otherwise publish.
 * Public main/exports/bin entries are the only roots; every other root-level
 * JavaScript file must be reached from one of them.
 */
async function assertPublishedJavaScriptAllowlist(
  packageRoot: string,
  manifest: PackageManifest,
): Promise<void> {
  const entries = publishedJavaScriptEntries(manifest)
  if (entries.length === 0) throw new Error('Interactive Learning package publishes no JavaScript entries')
  const invalidEntries = entries.filter(entry => (
    !entry.startsWith('lib/')
    || entry.split('/').includes('..')
    || /^[A-Za-z]:/.test(entry)
  ))
  if (invalidEntries.length > 0) {
    throw new Error(`Interactive Learning package has JavaScript entries outside lib/: ${invalidEntries.join(', ')}`)
  }
  const reachable = await assertRelativeJavaScriptClosure(packageRoot, entries)
  const lib = join(packageRoot, 'lib')
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(portablePath(relative(packageRoot, path)))
    }
  }
  await visit(lib)
  const unexpected = files.filter(path => path.endsWith('.js') && !reachable.has(path)).sort(comparePortablePaths)
  if (unexpected.length > 0) {
    throw new Error(`Interactive Learning package has unreachable JavaScript: ${unexpected.join(', ')}`)
  }
  const orphanedMaps = files
    .filter(path => path.endsWith('.js.map') && !reachable.has(path.slice(0, -'.map'.length)))
    .sort(comparePortablePaths)
  if (orphanedMaps.length > 0) {
    throw new Error(`Interactive Learning package has source maps without reachable JavaScript: ${orphanedMaps.join(', ')}`)
  }
}

/** Parse the Loader YAML dialect without evaluating its `!!js` expressions. */
export function interactiveLearningCompositionRows(source: string): Array<{ id: string; module: string }> {
  const composition = yaml.load(source, { schema: expressionSchema })
  if (!Array.isArray(composition) || composition.length === 0) {
    throw new Error(`Interactive Learning ${PRESET_ID} preset requires a non-empty agent composition`)
  }
  const rows = composition.map((value, index) => {
    const row = value as CompositionRow
    if (typeof row !== 'object' || row === null
      || typeof row.id !== 'string' || row.id.length === 0
      || typeof row.name !== 'string' || row.name.length === 0) {
      throw new Error(`Interactive Learning composition row ${String(index + 1)} requires id and module name`)
    }
    return { id: row.id, module: row.name }
  })
  const agentRows = rows.filter(row => row.id === 'learning-agent' && row.module === AGENT_MODULE)
  if (agentRows.length !== 1) {
    throw new Error(`Interactive Learning composition must contain exactly one learning-agent -> ${AGENT_MODULE} row`)
  }
  return rows
}

/**
 * Validate the stable Host/Agent/Client/preset surface without freezing V4.x
 * implementation text or content-hashed chunk names.
 */
export async function inspectInteractiveLearningPackage(
  packageRoot: string,
): Promise<InteractiveLearningReleaseEvidence> {
  await assertRequiredFiles(packageRoot, INTERACTIVE_LEARNING_PACKAGE_FILES, 'Interactive Learning package')
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest
  // Build-source packages may contain tests and other workspace-only inputs,
  // but their manifest-selected publication must already be complete and pure.
  const publication = await publishedPackageSelection(packageRoot, manifest)
  if (manifest.name !== PACKAGE_NAME || manifest.main !== 'lib/index.js') {
    throw new Error(`Interactive Learning package must publish ${PACKAGE_NAME} from lib/index.js`)
  }
  const expectedExports = {
    '.': './lib/index.js',
    './bootstrap': './lib/bootstrap.js',
    './agent': './lib/agent.js',
    './client': './lib/client.js',
    './preset': './lib/preset.js',
  } as const
  for (const [subpath, expected] of Object.entries(expectedExports)) {
    if (exportedDefault(manifest.exports?.[subpath]) !== expected) {
      throw new Error(`Interactive Learning export ${subpath} must resolve to ${expected}`)
    }
  }
  const client = manifest.dsh?.client
  if (client?.platform !== 'web'
    || !Array.isArray(client.inject)
    || client.inject.length === 0
    || client.inject.some(value => typeof value !== 'string' || value.length === 0)) {
    throw new Error('Interactive Learning package is missing its Web client-module metadata')
  }

  const descriptorPath = join(packageRoot, 'preset', PRESET_ID, 'preset.yml')
  const descriptor = yaml.load(await readFile(descriptorPath, 'utf8')) as Record<string, unknown>
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)
    || typeof descriptor.name !== 'string' || descriptor.name.trim() === ''
    || typeof descriptor.description !== 'string' || descriptor.description.trim() === '') {
    throw new Error(`Interactive Learning ${PRESET_ID} preset requires non-empty name and description`)
  }

  const compositionPath = join(packageRoot, 'preset', PRESET_ID, 'agent.cordis.yml')
  const compositionRows = interactiveLearningCompositionRows(await readFile(compositionPath, 'utf8'))

  await assertPublishedJavaScriptAllowlist(packageRoot, manifest)

  return {
    schemaVersion: 1,
    publishedFiles: [...publication.selected].sort(comparePortablePaths),
    host: {
      id: HOST_ROW_ID,
      module: PACKAGE_NAME,
      runtimeBundle: 'lib/packaged-bin.js',
      bundle: 'lib/index.js',
      bootstrapBundle: 'lib/bootstrap.js',
    },
    preset: {
      id: PRESET_ID,
      selectable: true,
      name: descriptor.name,
      description: descriptor.description,
      bundle: 'lib/preset.js',
      descriptor: 'preset/learning/preset.yml',
      composition: 'preset/learning/agent.cordis.yml',
      compositionRows,
    },
    agent: { module: AGENT_MODULE, bundle: 'lib/agent.js' },
    client: { module: CLIENT_MODULE, bundle: 'lib/client.js' },
  }
}

/** Validate one staged or packaged app and return manifest-ready evidence. */
export async function inspectInteractiveLearningApp(
  appResources: string,
): Promise<InteractiveLearningReleaseEvidence> {
  await assertRequiredFiles(appResources, INTERACTIVE_LEARNING_APP_FILES, 'Interactive Learning app contract')
  assertHostRow(await readFile(join(appResources, 'lib', 'packaged-bin.js'), 'utf8'))
  const packageRoot = join(appResources, PACKAGE_DIRECTORY)
  const evidence = await inspectInteractiveLearningPackage(packageRoot)
  await assertInteractiveLearningPublishedPackage(packageRoot)
  return evidence
}

/** Prove that runtime materialization retained the shipped selectable preset. */
export async function assertMaterializedInteractiveLearningPreset(dshHome: string): Promise<void> {
  const root = join(dshHome, '.system-agent-presets')
  const value = JSON.parse(await readFile(join(root, '.manifest.json'), 'utf8')) as {
    sources?: Array<{ id?: unknown; entries?: Array<{ path?: unknown }> }>
  }
  const source = value.sources?.find(item => item.id === 'interactive-learning')
  const paths = new Set(source?.entries?.map(entry => entry.path).filter(path => typeof path === 'string') as string[] | undefined)
  for (const required of ['learning/preset.yml', 'learning/agent.cordis.yml']) {
    if (!paths.has(required)) throw new Error(`runtime preset manifest is missing interactive-learning/${required}`)
    const metadata = await stat(packagePath(root, required)).catch(() => undefined)
    if (metadata === undefined || !metadata.isFile() || metadata.size === 0) {
      throw new Error(`materialized Learning preset is missing ${required}`)
    }
  }
}
