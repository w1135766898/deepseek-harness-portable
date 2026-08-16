/** Build, archive, sign (when configured), and checksum the Windows release. */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { basename, delimiter, dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const { isValidSemver } = require(join(root, 'apps', 'desktop', 'src', 'semver.cjs')) as {
  isValidSemver(value: unknown): boolean
}
const releaseDir = join(root, 'release')
const desktopManifest = join(root, 'apps', 'desktop', 'package.json')
const defaultBuildRoot = join(root, 'dist-desktop', 'electron', 'DeepSeek Harness-win32-x64')
const KERNEL_PACKAGE = '@deepseek-ai/dsh-web-app'
const RELEASE_MANIFEST_NAME = 'release-manifest.json'
const RELEASE_NOTES_SOURCE = join(root, 'apps', 'desktop', 'src', 'release-notes.json')
const DESKTOP_RUNTIME_SOURCE_FILES = [
  'main.cjs',
  'desktop-locale.cjs',
  'desktop-locale-store.cjs',
  'desktop-preload.cjs',
  'ready-url.cjs',
  'release-notes.cjs',
  'update-client.cjs',
  'update-launcher.cjs',
  'update-path.cjs',
  'update-transaction.cjs',
  'update-status.cjs',
  'window-state.cjs',
  'workspace-service.cjs',
  'config-store.cjs',
  'process-tree.cjs',
  'semver.cjs',
  'semver-cli.cjs',
]
const DESKTOP_TEST_FILES = [
  'ready-url.test.cjs',
  'update-path.test.cjs',
  'update-transaction.test.cjs',
  'release-notes.test.cjs',
  'update-status.test.cjs',
  'update-client.test.cjs',
  'window-state.test.cjs',
  'workspace-service.test.cjs',
  'config-store.test.cjs',
  'process-tree.test.cjs',
  'semver.test.cjs',
  'update-launcher.test.cjs',
  'minimal-preset.test.js',
]
const DESKTOP_SYNTAX_FILES = [
  'main.cjs',
  'desktop-locale.cjs',
  'desktop-locale-store.cjs',
  'desktop-preload.cjs',
  'ready-url.cjs',
  'update-path.cjs',
  'update-transaction.cjs',
  'release-notes.cjs',
  'update-status.cjs',
  'update-client.cjs',
  'update-launcher.cjs',
  'workspace-service.cjs',
  'config-store.cjs',
  'process-tree.cjs',
  'semver.cjs',
  'semver-cli.cjs',
]

type Options = {
  input?: string
  skipBuild: boolean
  noSetup: boolean
  setupTemplate?: string
  pruneSources: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = { skipBuild: false, noSetup: false, pruneSources: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--no-setup') options.noSetup = true
    else if (arg === '--prune-sources') options.pruneSources = true
    else if (arg === '--input') options.input = resolve(root, argv[++index] ?? '')
    else if (arg === '--setup-template') options.setupTemplate = resolve(root, argv[++index] ?? '')
    else if (arg === '--help') {
      console.log([
        'Usage: pnpm exec tsx scripts/release-windows.ts [options]',
        '',
        '  --input <dir>             package an existing portable root',
        '  --skip-build              do not run the Electron build first',
        '  --prune-sources           remove ordinary TypeScript sources during the build',
        '  --setup-template <exe>    replace the ZIP payload in an existing Setup.exe when ISCC is unavailable',
        '  --no-setup                emit only the ZIP and checksums',
      ].join('\n'))
      process.exit(0)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
}

function readDesktopManifest(): { version?: unknown; distributionVersion?: unknown } {
  return JSON.parse(readFileSync(desktopManifest, 'utf8')) as { version?: unknown; distributionVersion?: unknown }
}

function validateVersion(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isValidSemver(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`)
  }
  return value
}

function desktopVersion(): string {
  return validateVersion(readDesktopManifest().version, `desktop package version in ${desktopManifest}`)
}

function distributionVersion(): string {
  return validateVersion(readDesktopManifest().distributionVersion, `distribution version in ${desktopManifest}`)
}

function kernelVersion(buildRoot: string): string {
  const packagePath = join(buildRoot, 'runtime', 'resources', 'app', 'node_modules', ...KERNEL_PACKAGE.split('/'), 'package.json')
  if (!existsSync(packagePath)) {
    throw new Error(`Kernel package manifest is missing from the portable build: ${packagePath}`)
  }
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
  return validateVersion(manifest.version, `${KERNEL_PACKAGE} version in ${packagePath}`)
}

function kernelCommit(): string {
  const configured = process.env.GITHUB_SHA || process.env.KERNEL_GIT_COMMIT
  if (configured && /^[0-9a-f]{7,64}$/i.test(configured)) return configured
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    if (/^[0-9a-f]{7,64}$/i.test(commit)) return commit
  } catch {
    // Source archives may not contain a .git directory.
  }
  return 'unknown'
}

function bundledReleaseNotes(version: string): Record<string, unknown> {
  let source: Record<string, unknown> = {}
  if (existsSync(RELEASE_NOTES_SOURCE)) {
    const parsed = JSON.parse(readFileSync(RELEASE_NOTES_SOURCE, 'utf8')) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) source = parsed as Record<string, unknown>
  }
  const body = typeof source.body === 'string' ? source.body : ''
  const bodyEn = typeof source.bodyEn === 'string' ? source.bodyEn : ''
  const bodyZh = typeof source.bodyZh === 'string' ? source.bodyZh : ''
  const sections = Array.isArray(source.sections) ? source.sections : []
  const history = Array.isArray(source.history) ? source.history : []
  return {
    version,
    name: typeof source.name === 'string' && source.name.trim() ? source.name : `DeepSeek Harness for Win v${version}`,
    ...(typeof source.publishedAt === 'string' && source.publishedAt.trim() ? { publishedAt: source.publishedAt } : {}),
    ...(bodyEn.trim() ? { bodyEn } : {}),
    ...(bodyZh.trim() ? { bodyZh } : {}),
    ...(sections.length > 0 ? { sections } : {}),
    ...(history.length > 0 ? { history } : {}),
    body,
  }
}

function asciiJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7F]/g, character => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ))
}

async function writeReleaseManifest(buildRoot: string, version: string, shellVersion: string): Promise<void> {
  const manifest = {
    schemaVersion: 2,
    distributionVersion: version,
    desktopVersion: shellVersion,
    kernelVersion: kernelVersion(buildRoot),
    kernelCommit: kernelCommit(),
    kernelPackage: KERNEL_PACKAGE,
    kernelRepository: 'https://github.com/deepseek-ai/deepseek-harness',
    releaseNotes: bundledReleaseNotes(version),
  }
  await writeFile(join(buildRoot, RELEASE_MANIFEST_NAME), `${asciiJson(manifest)}\n`)
  console.log(`Release manifest written: ${join(buildRoot, RELEASE_MANIFEST_NAME)}`)
}

async function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const binDir = join(root, 'node_modules', '.bin')
  const pnpmBinDir = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin')
  const envPath = [binDir, pnpmBinDir, process.env.PATH || process.env.Path || ''].join(delimiter)
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PATH: envPath,
        Path: envPath,
        CI: 'true',
        HUSKY: '0',
        LEFTHOOK: '0',
        npm_config_confirm_modules_purge: 'false',
        ...(options.env ?? {}),
      },
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} failed (${code === null ? signal ?? 'signal' : `exit ${code}`})`))
    })
  })
}

async function verifyReleaseTests(): Promise<void> {
  const desktopDir = join(root, 'apps', 'desktop')
  console.log('Verifying desktop Node.js tests before release packaging...')
  await run(process.execPath, [
    '--test',
    ...DESKTOP_TEST_FILES.map(file => join('src', file)),
  ], { cwd: desktopDir })
  await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    'exec',
    'tsx',
    '--test',
    join(desktopDir, 'src', 'marketplace-bootstrap.test.ts'),
  ])
  for (const file of DESKTOP_SYNTAX_FILES) {
    await run(process.execPath, ['--check', join('src', file)], { cwd: desktopDir })
  }

  const testRunner = join(root, 'apps', 'desktop', 'tests', 'Run-Tests.ps1')
  if (existsSync(testRunner)) {
    console.log('Verifying updater Pester tests before release packaging...')
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', testRunner])
  }
}

async function listArchiveEntries(path: string): Promise<Set<string>> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn('tar.exe', ['-tf', path], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`tar.exe failed while validating ${path} (${code === null ? signal ?? 'signal' : `exit ${code}`})`))
        return
      }
      resolvePromise(new Set(output.split(/\r?\n/).map(entry => entry.trim()).filter(Boolean)))
    })
  })
}

async function verifyPortableArchive(zipPath: string, buildRoot: string): Promise<void> {
  const prefix = `${basename(buildRoot).replaceAll('\\', '/')}/`
  const entries = await listArchiveEntries(zipPath)
  const required = [
    RELEASE_MANIFEST_NAME,
    'dsh.cmd',
    'pnpm.cmd',
    'uninstall.cmd',
    'uninstall.ps1',
    'update.ps1',
    'update.cmd',
    'setup-shortcuts.ps1',
    'updater/updater.psm1',
    'updater/release-payload.ps1',
    'runtime/DeepSeek Harness.exe',
    'runtime/resources/app/package.json',
    'runtime/resources/app/lib/packaged-bin.js',
    'runtime/resources/app/lib/marketplace-bootstrap.js',
    'runtime/resources/app/lib/win32-terminal-inspector.js',
    'runtime/resources/app/src/update-launcher.cjs',
    'runtime/resources/app/src/update-transaction.cjs',
    'runtime/resources/app/src/desktop-locale.cjs',
    'runtime/resources/app/src/desktop-locale-store.cjs',
    'runtime/resources/app/src/semver.cjs',
    'runtime/resources/app/src/semver-cli.cjs',
    'runtime/resources/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
    'runtime/resources/app/node_modules/dsh-plugin-marketplace/package.json',
    'runtime/resources/app/node_modules/dsh-plugin-marketplace/cordis.patch.yml',
    'runtime/resources/app/node_modules/dsh-plugin-marketplace/lib/index.js',
    'runtime/resources/app/node_modules/dsh-plugin-marketplace/lib/client.js',
    'runtime/resources/app/node_modules/pnpm/bin/pnpm.cjs',
  ]
  const missing = required.filter(relative => !entries.has(`${prefix}${relative}`))
  if (missing.length > 0) {
    throw new Error(`Portable ZIP layout validation failed; missing: ${missing.join(', ')}`)
  }
  console.log(`Release archive layout verified: ${prefix}`)
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolvePromise(hash.digest('hex').toUpperCase()))
  })
}

async function verifyDesktopRuntimeSources(buildRoot: string): Promise<void> {
  const packagedSourceRoot = join(buildRoot, 'runtime', 'resources', 'app', 'src')
  const mismatches: string[] = []

  for (const file of DESKTOP_RUNTIME_SOURCE_FILES) {
    const sourcePath = join(root, 'apps', 'desktop', 'src', file)
    const packagedPath = join(packagedSourceRoot, file)
    if (!existsSync(packagedPath)) {
      mismatches.push(`${file} is missing from the portable runtime`)
      continue
    }
    const [sourceHash, packagedHash] = await Promise.all([hashFile(sourcePath), hashFile(packagedPath)])
    if (sourceHash !== packagedHash) mismatches.push(`${file} differs from the current desktop source`)
  }

  if (mismatches.length > 0) {
    throw new Error([
      'Portable runtime source validation failed. Rebuild the desktop runtime before creating the release archive.',
      ...mismatches.map(item => `- ${item}`),
    ].join('\n'))
  }
  console.log(`Portable runtime source validation passed: ${DESKTOP_RUNTIME_SOURCE_FILES.length} files`)
}

async function syncPortablePayload(buildRoot: string): Promise<void> {
  const packagedSourceRoot = join(buildRoot, 'runtime', 'resources', 'app', 'src')
  await mkdir(packagedSourceRoot, { recursive: true })
  for (const file of DESKTOP_RUNTIME_SOURCE_FILES) {
    const sourcePath = join(root, 'apps', 'desktop', 'src', file)
    const packagedPath = join(packagedSourceRoot, file)
    if (existsSync(sourcePath)) {
      await copyFile(sourcePath, packagedPath)
    }
  }
  const extraSrcFiles = ['release-notes.json', 'splash.html', 'apply-icon.mjs']
  for (const file of extraSrcFiles) {
    const sourcePath = join(root, 'apps', 'desktop', 'src', file)
    const packagedPath = join(packagedSourceRoot, file)
    if (existsSync(sourcePath)) {
      await copyFile(sourcePath, packagedPath)
    }
  }
  await copyFile(desktopManifest, join(buildRoot, 'runtime', 'resources', 'app', 'package.json'))

  const updaterSource = join(root, 'apps', 'desktop', 'updater')
  if (existsSync(updaterSource)) {
    const updaterDest = join(buildRoot, 'updater')
    await cp(updaterSource, updaterDest, { recursive: true })
  }

  const rootFiles = [
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'smoke-native.cjs',
    'apps/desktop/start-web.cmd',
    'apps/desktop/start-desktop.cmd',
    'apps/desktop/update.cmd',
    'apps/desktop/update.ps1',
    'apps/desktop/setup-shortcuts.ps1',
    'apps/desktop/dsh.cmd',
    'apps/desktop/portable-pnpm.cmd',
    'apps/desktop/使用说明.txt',
    'apps/desktop/使用说明.en.txt',
    'apps/desktop/启动网页版.bat',
    'apps/desktop/启动桌面窗口.bat',
    'apps/desktop/启动桌面版.bat',
    'apps/desktop/在线更新.bat',
    'apps/desktop/创建桌面快捷方式.bat',
    'apps/desktop/一键解除拦截(自签名信任).bat',
    'uninstall.cmd',
    'uninstall.ps1',
  ]
  for (const relPath of rootFiles) {
    const source = join(root, relPath)
    if (!existsSync(source)) continue
    const base = relPath === 'apps/desktop/portable-pnpm.cmd'
      ? 'pnpm.cmd'
      : relPath.includes('/') ? relPath.slice(relPath.lastIndexOf('/') + 1) : relPath
    await copyFile(source, join(buildRoot, base))
  }
  console.log(`Portable runtime sources and payload synchronized into ${buildRoot}`)
}

async function findIscc(): Promise<string | undefined> {
  const candidates = [
    process.env.ISCC_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe') : undefined,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return undefined
}

async function buildSetupFromTemplate(template: string, zipPath: string, output: string): Promise<void> {
  const [setup, zip] = await Promise.all([readFile(template), readFile(zipPath)])
  const offset = setup.indexOf(zip)
  if (offset < 0) throw new Error(`Setup template does not contain the exact ZIP payload: ${template}`)
  const secondOffset = setup.indexOf(zip, offset + 1)
  if (secondOffset >= 0) throw new Error(`Setup template contains multiple ZIP payloads: ${template}`)
  await writeFile(output, Buffer.concat([setup.subarray(0, offset), zip, setup.subarray(offset + zip.length)]))
}

async function writeChecksums(zipPath: string, setupPath?: string): Promise<void> {
  const files = [zipPath, setupPath].filter((path): path is string => Boolean(path && existsSync(path)))
  const lines: string[] = []
  for (const path of files) {
    const digest = await hashFile(path)
    const name = basename(path)
    lines.push(`${digest} *${name}`)
    await writeFile(`${path}.sha256`, `${digest} *${name}\n`)
  }
  const text = `${lines.join('\n')}\n`
  await writeFile(join(releaseDir, 'SHA256SUMS.txt'), text)
  await writeFile(join(root, 'SHA256SUMS.txt'), text)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const version = distributionVersion()
  const shellVersion = desktopVersion()
  const zipName = `DeepSeek-Harness-${version}-win32-x64.zip`
  const zipPath = join(releaseDir, zipName)
  await rm(zipPath, { force: true })

  await verifyReleaseTests()

  if (!options.input && !options.skipBuild) {
    const tsxBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.CMD' : 'tsx')
    const buildScript = join(root, 'scripts', 'build-desktop-web-exe.ts')
    if (existsSync(tsxBin)) {
      const buildArgs = [buildScript, '--electron', '--skip-build']
      if (options.pruneSources) buildArgs.push('--prune-sources')
      await run(tsxBin, buildArgs)
    } else {
      const buildArgs = ['exec', 'tsx', 'scripts/build-desktop-web-exe.ts', '--electron', '--skip-build']
      if (options.pruneSources) buildArgs.push('--prune-sources')
      await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', buildArgs)
    }
  }

  const buildRoot = options.input ?? defaultBuildRoot
  if (!existsSync(join(buildRoot, 'runtime', 'DeepSeek Harness.exe'))) {
    throw new Error(`Portable build root is missing runtime/DeepSeek Harness.exe: ${buildRoot}`)
  }
  await syncPortablePayload(buildRoot)
  await writeReleaseManifest(buildRoot, version, shellVersion)
  await verifyDesktopRuntimeSources(buildRoot)
  await run('tar.exe', ['-a', '-c', '-f', zipPath, '-C', dirname(buildRoot), basename(buildRoot)])
  await verifyPortableArchive(zipPath, buildRoot)

  let setupPath: string | undefined
  if (!options.noSetup) {
    const iscc = await findIscc()
    setupPath = join(releaseDir, `DeepSeek-Harness-Setup-${version}-win32-x64.exe`)
    if (!options.setupTemplate || resolve(options.setupTemplate) !== resolve(setupPath)) {
      await rm(setupPath, { force: true })
    }
    if (iscc) {
      await run(iscc, [
        `/DMyAppVersion=${version}`,
        `/DMyZipName=${zipName}`,
        '/DMyReleaseDir=..\\release',
        '/DMyIconPath=..\\apps\\desktop\\assets\\deepseek.ico',
        join(root, 'scripts', 'setup.iss'),
      ])
    } else if (options.setupTemplate) {
      await buildSetupFromTemplate(options.setupTemplate, zipPath, setupPath)
    } else {
      throw new Error('ISCC.exe was not found. Install Inno Setup or pass --setup-template; use --no-setup for ZIP-only output.')
    }
  }

  await writeChecksums(zipPath, setupPath)
  console.log(`Release complete: ${zipPath}`)
  if (setupPath) console.log(`Setup complete: ${setupPath}`)
  console.log(`Checksums written last: ${join(root, 'SHA256SUMS.txt')}`)
}

await main()
