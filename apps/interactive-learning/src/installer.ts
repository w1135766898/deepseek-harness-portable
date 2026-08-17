import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { interactiveLearningPresetSource } from './preset.ts'

export const LEARNING_PACK_VERSION = '0.1.0'
export const LEARNING_MANIFEST_FILE = '.dsh-managed.json'

interface ManagedFile {
  path: string
  ownedHash: string
}

interface PreservedFile {
  path: string
  observedHash: string
  desiredHash: string
  stagedPath: string
}

export interface LearningInstallManifest {
  schema: 1
  presetSchema: 1
  package: '@dsh-portable/interactive-learning'
  packageVersion: string
  preset: 'learning'
  source: 'package'
  installedAt: string
  userModified: boolean
  files: ManagedFile[]
  preservedFiles: PreservedFile[]
}

export interface LearningInstallResult {
  target: string
  installed: string[]
  updated: string[]
  preserved: string[]
  staged: string[]
}

export interface LearningUninstallResult {
  target: string
  removed: string[]
  preserved: string[]
  manifestFound: boolean
}

export interface LearningInstallerOptions {
  dshHome?: string
  source?: string
}

function defaultDshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  return resolve(configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured)
}

function targetFor(dshHome?: string): string {
  return join(resolve(dshHome ?? defaultDshHome()), '.agent-presets', 'learning')
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function fileDigest(path: string): Promise<string | undefined> {
  try {
    return digest(await readFile(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'))
    }
  }
  await visit(root)
  return files
}

function safePath(root: string, candidate: string): string | undefined {
  if (candidate === '' || candidate.startsWith('/') || candidate.startsWith('\\')) return undefined
  const destination = resolve(root, candidate)
  const resolvedRoot = resolve(root)
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${sep}`)) return undefined
  return destination
}

async function readManifest(path: string): Promise<LearningInstallManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as LearningInstallManifest
    if (parsed.schema !== 1 || parsed.package !== '@dsh-portable/interactive-learning'
      || parsed.preset !== 'learning' || !Array.isArray(parsed.files)) return undefined
    return {
      ...parsed,
      presetSchema: 1,
      userModified: parsed.userModified === true,
      preservedFiles: Array.isArray(parsed.preservedFiles) ? parsed.preservedFiles : [],
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

async function writeAtomic(path: string, value: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${String(process.pid)}-${randomUUID()}`
  await writeFile(temporary, value)
  try {
    await rename(temporary, path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    await unlink(path)
    await rename(temporary, path)
  }
}

async function sidecarPath(target: string, relativePath: string): Promise<{ path: string; relative: string }> {
  const base = `${relativePath}.dsh-new-${LEARNING_PACK_VERSION}`
  for (let suffix = 0; ; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${String(suffix + 1)}`
    const path = safePath(target, candidate)
    if (path === undefined) throw new Error(`invalid managed sidecar path: ${candidate}`)
    if (await fileDigest(path) === undefined) return { path, relative: candidate }
  }
}

/** Install or safely upgrade the independently owned user preset. */
export async function installLearningPreset(options: LearningInstallerOptions = {}): Promise<LearningInstallResult> {
  const source = resolve(options.source ?? interactiveLearningPresetSource)
  if (!(await stat(source)).isDirectory()) throw new Error(`learning preset source is not a directory: ${source}`)
  const target = targetFor(options.dshHome)
  const manifestPath = join(target, LEARNING_MANIFEST_FILE)
  const previous = await readManifest(manifestPath)
  const previousFiles = new Map(previous?.files.map(file => [file.path, file]) ?? [])
  const previousPreserved = new Map(previous?.preservedFiles.map(file => [file.path, file]) ?? [])
  const installed: string[] = []
  const updated: string[] = []
  const preserved: string[] = []
  const staged: string[] = []
  const files: ManagedFile[] = []
  const preservedFiles: PreservedFile[] = []
  const sourceFiles = await filesUnder(source)
  await mkdir(target, { recursive: true })

  for (const relativePath of sourceFiles) {
    const sourcePath = safePath(source, relativePath)
    const destination = safePath(target, relativePath)
    if (sourcePath === undefined || destination === undefined || relativePath === LEARNING_MANIFEST_FILE) {
      throw new Error(`invalid learning preset source path: ${relativePath}`)
    }
    const content = await readFile(sourcePath)
    const desiredHash = digest(content)
    const currentHash = await fileDigest(destination)
    if (currentHash === undefined) {
      await writeAtomic(destination, content)
      installed.push(relativePath)
      files.push({ path: relativePath, ownedHash: desiredHash })
      continue
    }
    if (currentHash === desiredHash) {
      files.push({ path: relativePath, ownedHash: desiredHash })
      continue
    }
    if (previousFiles.get(relativePath)?.ownedHash === currentHash) {
      await writeAtomic(destination, content)
      updated.push(relativePath)
      files.push({ path: relativePath, ownedHash: desiredHash })
      continue
    }
    preserved.push(relativePath)
    const previousCopy = previousPreserved.get(relativePath)
    const previousSidecar = previousCopy === undefined ? undefined : safePath(target, previousCopy.stagedPath)
    if (previousCopy?.desiredHash === desiredHash && previousSidecar !== undefined
      && await fileDigest(previousSidecar) === desiredHash) {
      files.push({ path: previousCopy.stagedPath, ownedHash: desiredHash })
      preservedFiles.push({
        path: relativePath,
        observedHash: currentHash,
        desiredHash,
        stagedPath: previousCopy.stagedPath,
      })
      continue
    }
    const sidecar = await sidecarPath(target, relativePath)
    await writeAtomic(sidecar.path, content)
    staged.push(sidecar.relative)
    files.push({ path: sidecar.relative, ownedHash: desiredHash })
    preservedFiles.push({
      path: relativePath,
      observedHash: currentHash,
      desiredHash,
      stagedPath: sidecar.relative,
    })
  }

  for (const old of previous?.files ?? []) {
    if (sourceFiles.includes(old.path) || files.some(file => file.path === old.path)) continue
    const oldPath = safePath(target, old.path)
    if (oldPath === undefined) continue
    const currentHash = await fileDigest(oldPath)
    if (currentHash === old.ownedHash) {
      await unlink(oldPath)
      updated.push(old.path)
    } else if (currentHash !== undefined) {
      preserved.push(old.path)
    }
  }

  const manifest: LearningInstallManifest = {
    schema: 1,
    presetSchema: 1,
    package: '@dsh-portable/interactive-learning',
    packageVersion: LEARNING_PACK_VERSION,
    preset: 'learning',
    source: 'package',
    installedAt: new Date().toISOString(),
    userModified: preservedFiles.length > 0,
    files,
    preservedFiles,
  }
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { target, installed, updated, preserved: [...new Set(preserved)], staged }
}

/** Uninstall only files whose current content still matches the package-owned hash. */
export async function uninstallLearningPreset(options: Pick<LearningInstallerOptions, 'dshHome'> = {}): Promise<LearningUninstallResult> {
  const target = targetFor(options.dshHome)
  const manifestPath = join(target, LEARNING_MANIFEST_FILE)
  const manifest = await readManifest(manifestPath)
  if (manifest === undefined) return { target, removed: [], preserved: [], manifestFound: false }
  const removed: string[] = []
  const preserved = manifest.preservedFiles.map(file => file.path)
  for (const file of manifest.files) {
    const path = safePath(target, file.path)
    if (path === undefined) {
      preserved.push(file.path)
      continue
    }
    const currentHash = await fileDigest(path)
    if (currentHash === undefined) continue
    if (currentHash !== file.ownedHash) {
      preserved.push(file.path)
      continue
    }
    await unlink(path)
    removed.push(file.path)
  }
  await unlink(manifestPath)
  const directories: string[] = []
  for (const file of removed) {
    let directory = dirname(join(target, file))
    while (directory !== target && directory.startsWith(`${target}${sep}`)) {
      directories.push(directory)
      directory = dirname(directory)
    }
  }
  directories.sort((a, b) => b.length - a.length)
  for (const directory of new Set(directories)) {
    if (directory === target) continue
    try { await rmdir(directory) } catch {}
  }
  try { await rmdir(target) } catch {}
  return { target, removed, preserved: [...new Set(preserved)], manifestFound: true }
}
