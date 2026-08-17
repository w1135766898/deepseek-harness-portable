/**
 * Build desktop distributions for the desktop web surface.
 *
 * The default route uses the fixed `@yao-pkg/pkg --sea` single-file
 * executable flow. The `--electron` route packages the same deployed
 * runtime behind the native Electron shell. Both routes use the
 * `dsh-desktop-web-pkg` closure, stage target-native addons, and apply the
 * platform application icon.
 *
 * Windows is a documented non-goal of the Python SDK distribution; this
 * script is the local/personal channel for portable desktop distributions of
 * the dsh web surface and is not part of the repository gates.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { patchWelcomeNoticeStore } from '../patches/dsh-client-ui-settings-models-welcome-store.js'
import { patchMarketplaceSelfUpdate } from '../patches/dsh-plugin-marketplace-self-update.js'
import {
  cacheLayerMatches,
  completeCacheLayer,
  fingerprintPaths,
  preserveFiles,
  readPackagingCache,
  writePackagingCache,
  type PackagingCacheState,
} from './packaging-cache.ts'

const root = resolve(import.meta.dirname, '..')

/** The closure manifest whose dependencies define the executable. */
const DEPLOY_ROOT_PACKAGE = 'dsh-desktop-web-pkg'
/** The packaged boot entry inside the deployed closure (staged at the closure root). */
const ENTRY_BIN = 'lib/packaged-bin.js'
/** Base executable basename; the version is appended from the desktop manifest. */
const OUTPUT_BASENAME = 'dsh-desktop-web'
/** Default Node major; SEA mode requires at least Node 22. */
const DEFAULT_NODE_RANGE = 'node24'
/** Pinned for reproducible builds. */
const PKG_SPEC = '@yao-pkg/pkg@6.21.0'
/** The checked-in Windows icon applied to the Windows executable. */
const DESKTOP_ICON = resolve(root, 'apps/desktop/assets/deepseek.ico')
/** An optional checked-in macOS icon; otherwise it is generated from the shell logo. */
const MAC_DESKTOP_ICON = resolve(root, 'apps/desktop/assets/deepseek.icns')
/** The native shell's product name and packaged executable path. */
const ELECTRON_APP_NAME = 'DeepSeek Harness'
/** pkg base-binary download cache lives in the user profile; no repo state. */
const OUT_DIR = 'dist-exe'
/** The unpacked Electron app is the portable desktop distribution. */
const ELECTRON_OUT_DIR = 'dist-desktop/electron'
/** The cleared deploy target and pkg input. */
const STAGING_DIR = 'dist-desktop/node'
/** Successful layer fingerprints live with other disposable packaging output. */
const CACHE_STATE_FILE = 'dist-desktop/.cache/packaging-state.json'
/** Legacy deploy may hoist direct workspace packages into the deploy source's own node_modules. */
const DEPLOY_SOURCE_NODE_MODULES = 'apps/desktop/node_modules'
/** Legacy deploy must not leave the host workspace marked as production-only. */
const HOST_INSTALL_STATE_FILES = [
  'node_modules/.modules.yaml',
  'node_modules/.package-map.json',
  'node_modules/.pnpm/lock.yaml',
  'node_modules/.pnpm-workspace-state-v1.json',
]

const FINGERPRINT_EXCLUDED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  'coverage',
  'dist',
  'lib',
  'node_modules',
  'release',
  'stress-tests',
  'test',
  'tests',
])

const BUILD_INPUT_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/desktop/package.json',
  'apps/desktop/tsconfig.json',
  'apps/desktop/src',
  'apps/desktop/config',
  'apps/desktop/assets',
  'apps/vision-bridge/package.json',
  'apps/vision-bridge/tsconfig.json',
  'apps/vision-bridge/tsdown.config.ts',
  'apps/vision-bridge/src',
  'vendor/deepseek-harness/package.json',
  'vendor/deepseek-harness/pnpm-lock.yaml',
  'vendor/deepseek-harness/pnpm-workspace.yaml',
  'vendor/deepseek-harness/tsconfig.json',
  'vendor/deepseek-harness/tsconfig.base.json',
  'vendor/deepseek-harness/tsconfig.base.client.json',
  'vendor/deepseek-harness/tsconfig.client.json',
  'vendor/deepseek-harness/tsconfig.host.json',
  'vendor/deepseek-harness/tsdown.config.ts',
  'vendor/deepseek-harness/apps/web',
  'vendor/deepseek-harness/native/landlock-run',
  'vendor/deepseek-harness/packages',
  'vendor/deepseek-harness/vendor',
]

const STAGING_INPUT_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/build-desktop-web-exe.ts',
  'scripts/packaging-cache.ts',
  'patches',
]

/** The desktop app owns the shell version embedded in the Electron package. */
const DESKTOP_PACKAGE_JSON = resolve(root, 'apps/desktop/package.json')

function desktopVersion(): string {
  if (!existsSync(DESKTOP_PACKAGE_JSON)) {
    throw new Error(`build-desktop-web-exe: desktop manifest is missing: ${DESKTOP_PACKAGE_JSON}`)
  }
  const version = (JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, 'utf8')) as { version?: unknown }).version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`build-desktop-web-exe: invalid desktop package version in ${DESKTOP_PACKAGE_JSON}`)
  }
  return version
}

function distributionVersion(): string {
  if (!existsSync(DESKTOP_PACKAGE_JSON)) {
    throw new Error(`build-desktop-web-exe: desktop manifest is missing: ${DESKTOP_PACKAGE_JSON}`)
  }
  const version = (JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, 'utf8')) as { distributionVersion?: unknown }).distributionVersion
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`build-desktop-web-exe: invalid distributionVersion in ${DESKTOP_PACKAGE_JSON}`)
  }
  return version
}

/**
 * Whole-tree assets cover Cordis's runtime bare-package imports, which pkg's
 * static analysis cannot see, plus the web frontend dist (html/css/fonts)
 * and the shipped config layers (yml/md).
 */
const ASSET_GLOBS = [
  'package.json',
  'lib/**/*.js',
  'config/**/*',
  'node_modules/**/*.js',
  'node_modules/**/*.cjs',
  'node_modules/**/*.mjs',
 'node_modules/**/*.json',
 'node_modules/**/*.node',
  'node_modules/**/*.dll',
 'node_modules/**/*.wasm',
  'node_modules/**/*.yml',
  'node_modules/**/*.yaml',
  'node_modules/**/*.md',
  'node_modules/**/*.html',
  'node_modules/**/*.css',
  'node_modules/**/*.svg',
  'node_modules/**/*.woff',
  'node_modules/**/*.woff2',
  'node_modules/**/*.ttf',
  'node_modules/**/*.webmanifest',
  'node_modules/**/*.ico',
  'node_modules/**/*.png',
  'node_modules/**/*.txt',
]

const MARKETPLACE_RUNTIME_FILES = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
] as const

/**
 * Validated CLI configuration; construction owns help and parse-error exits.
 */
class BuildCli {
  private constructor(
    /** Skip step 1 (`pnpm run build`); lib/ artifacts must already exist. */
    readonly skipBuild: boolean,
    /** Print every command and config patch instead of executing. */
    readonly dryRun: boolean,
    /** Build the native Electron shell instead of the browser-opening exe. */
    readonly electron: boolean,
    /** Electron target operating system. Windows remains the default for compatibility. */
    readonly platform: 'win32' | 'darwin',
    /** Electron target architecture. The first macOS release is arm64 only. */
    readonly arch: 'x64' | 'arm64',
    /** Create a compressed macOS disk image after the .app is staged. */
    readonly dmg: boolean,
    /** Remove ordinary TypeScript sources after the safe release pruning pass. */
    readonly pruneSources: boolean,
    /** Rebuild every disposable packaging layer and refresh its cache key. */
    readonly noCache: boolean,
  ) {}

  /**
   * Parse argv. Help exits 0; malformed flags exit 1.
   * @param argv - the raw arguments (`process.argv.slice(2)`).
   * @returns the parsed, validated configuration.
   */
  static parse(argv: string[]): BuildCli {
    let values: ReturnType<typeof BuildCli.parseRaw>
    try {
      values = BuildCli.parseRaw(argv)
    } catch (error) {
      console.error(`build-desktop-web-exe: ${error instanceof Error ? error.message : String(error)}\n`)
      console.error(BuildCli.usage())
      process.exit(1)
    }
    if (values.help) {
      console.log(BuildCli.usage())
      process.exit(0)
    }
    const platform = values.platform === undefined ? 'win32' : values.platform
    const arch = values.arch === undefined
      ? platform === 'darwin' ? 'arm64' : 'x64'
      : values.arch
    if (platform !== 'win32' && platform !== 'darwin') {
      throw new Error(`unsupported target platform ${JSON.stringify(platform)}; use win32 or darwin`)
    }
    if (arch !== 'x64' && arch !== 'arm64') {
      throw new Error(`unsupported target architecture ${JSON.stringify(arch)}; use x64 or arm64`)
    }
    if (platform === 'darwin' && arch !== 'arm64') {
      throw new Error('the macOS release target is currently arm64 only')
    }
    if (platform === 'darwin' && !values.electron) {
      throw new Error('macOS packaging requires --electron')
    }
    if (values.dmg && (platform !== 'darwin' || !values.electron)) {
      throw new Error('--dmg is only valid for the macOS Electron target')
    }
    return new BuildCli(
      values['skip-build'],
      values['dry-run'],
      values.electron,
      platform,
      arch,
      values.dmg,
      values['prune-sources'],
      values['no-cache'],
    )
  }

  private static parseRaw(argv: string[]) {
    return parseArgs({
      args: argv,
      options: {
        'skip-build': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'electron': { type: 'boolean', default: false },
        'platform': { type: 'string' },
        'arch': { type: 'string' },
        'dmg': { type: 'boolean', default: false },
        'prune-sources': { type: 'boolean', default: false },
        'no-cache': { type: 'boolean', default: false },
        'help': { type: 'boolean', default: false },
      },
    }).values
  }

  private static usage(): string {
    return [
      'Usage: pnpm exec tsx scripts/build-desktop-web-exe.ts [flags]',
      '',
      '  --skip-build   skip `pnpm run build` (lib/ artifacts must already exist).',
      '  --dry-run      print every command and config patch without executing.',
      '  --electron     build the native Electron shell.',
      '  --platform     Electron target platform: win32 (default) or darwin.',
      '  --arch         Electron target architecture: x64 (default on Windows) or arm64.',
      '  --dmg          create a macOS DMG after building the arm64 .app.',
      '  --prune-sources remove ordinary .ts/.tsx source files after safe pruning; smoke-test the release before publishing.',
      '  --no-cache     rebuild all disposable packaging layers and refresh their cache keys.',
      '  --help         print this help.',
      '',
      `Default route: ${PKG_SPEC} --sea, target ${DEFAULT_NODE_RANGE}-win-x64; writes to ${OUT_DIR}/.`,
      `Electron route: target is selected with --platform/--arch; writes to ${ELECTRON_OUT_DIR}/.`,
    ].join('\n')
  }
}

function pnpmBin(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

/**
 * Render a command for logs and errors, quoting arguments with spaces.
 * @param command - the executable.
 * @param args - its arguments.
 * @returns the printable command line.
 */
function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(part => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ')
}

/**
 * Sequential build pipeline. Subprocesses inherit stdio and errors include
 * the command; dry runs print commands and filesystem changes.
 */
class DesktopExeBuild {
  /** The cleared deploy target and pkg input. */
  readonly staging = resolve(root, STAGING_DIR)
  private readonly outDir = resolve(root, OUT_DIR)
  private readonly electronOutDir = resolve(root, ELECTRON_OUT_DIR)
  private readonly cachePath = resolve(root, CACHE_STATE_FILE)
  private cacheState: PackagingCacheState = { version: 1 }
  private buildKey = ''
  private stagingKey = ''

  constructor(private readonly cli: BuildCli) {}

  /** Load cache state and fingerprint source inputs before any mutable step. */
  async initialize(): Promise<void> {
    this.cacheState = this.cli.noCache || this.cli.dryRun
      ? { version: 1 }
      : await readPackagingCache(this.cachePath)
    this.buildKey = await this.timed('fingerprint build inputs', () => fingerprintPaths({
      baseDir: root,
      paths: BUILD_INPUT_PATHS,
      excludedDirectoryNames: FINGERPRINT_EXCLUDED_DIRECTORIES,
      salt: ['build-v1', this.cli.platform, this.cli.arch, process.version],
    }))
    if (this.cli.noCache) console.log('build-desktop-web-exe: cache bypassed (--no-cache)')
  }

  /** Build all package artifacts unless `--skip-build` was passed. */
  async build(): Promise<void> {
    if (this.cli.skipBuild) {
      console.log('build-desktop-web-exe: skipping pnpm run build (--skip-build)')
      return
    }
    const required = [
      join(root, 'apps', 'desktop', ENTRY_BIN),
      join(root, 'apps', 'vision-bridge', 'lib', 'index.js'),
      join(root, 'vendor', 'deepseek-harness', 'apps', 'web', 'dist', 'index.html'),
      join(root, 'vendor', 'deepseek-harness', 'packages', 'bundle', 'web-app', 'lib', 'index.js'),
    ]
    if (!this.cli.noCache && cacheLayerMatches(this.cacheState.build, this.buildKey, required)) {
      console.log(`build-desktop-web-exe: build cache hit (${this.buildKey.slice(0, 12)})`)
      return
    }
    console.log(`build-desktop-web-exe: build cache miss (${this.buildKey.slice(0, 12)})`)
    await this.timed('build', () => this.run('build', pnpmBin(), ['run', 'build']))
    if (!this.cli.dryRun) {
      this.cacheState = completeCacheLayer(this.cacheState, 'build', this.buildKey)
      await writePackagingCache(this.cachePath, this.cacheState)
    }
  }

  /** Reuse a complete deployed closure, or rebuild and cache it as one layer. */
  async prepareStaging(): Promise<void> {
    this.stagingKey = await fingerprintPaths({
      baseDir: root,
      paths: STAGING_INPUT_PATHS,
      excludedDirectoryNames: FINGERPRINT_EXCLUDED_DIRECTORIES,
      salt: [
        'staging-v1',
        this.buildKey,
        this.cli.electron ? 'electron' : 'sea',
        `${this.cli.platform}-${this.cli.arch}`,
        this.cli.pruneSources ? 'prune-sources' : 'keep-sources',
      ],
    })
    const required = [
      join(this.staging, 'package.json'),
      join(this.staging, ENTRY_BIN),
      join(this.staging, 'lib', 'marketplace-bootstrap.js'),
      join(this.staging, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'package.json'),
      join(this.staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'package.json'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'lib', 'index.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'lib', 'client.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'cordis.patch.yml'),
      join(this.staging, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      join(this.staging, 'node_modules', 'node-pty', 'prebuilds', `${this.cli.platform}-${this.cli.arch}`, 'pty.node'),
      join(this.staging, 'node_modules', '@img', `sharp-${this.cli.platform}-${this.cli.arch}`, 'lib'),
      join(
        this.staging,
        'node_modules',
        '@koromix',
        `koffi-${this.cli.platform}-${this.cli.arch}`,
        `${this.cli.platform}_${this.cli.arch}`,
        'koffi.node',
      ),
    ]
    if (!this.cli.noCache && cacheLayerMatches(this.cacheState.staging, this.stagingKey, required)) {
      console.log(`build-desktop-web-exe: staging cache hit (${this.stagingKey.slice(0, 12)})`)
      await this.validateMarketplaceStaging()
      return
    }
    console.log(`build-desktop-web-exe: staging cache miss (${this.stagingKey.slice(0, 12)})`)
    await this.timed('prepare staging', async () => {
      await this.deployStaging()
      await this.stageNativeAddons()
      await this.applyRuntimePatches()
      await this.pruneReleasePayload()
      await this.injectPkgConfig()
      await this.validateMarketplaceStaging()
    })
    if (!this.cli.dryRun) {
      this.cacheState = completeCacheLayer(this.cacheState, 'staging', this.stagingKey)
      await writePackagingCache(this.cachePath, this.cacheState)
    }
  }

  /** Clear and deploy the runtime closure into the staging directory. */
  async deployStaging(): Promise<void> {
    if (this.staging === root || root.startsWith(this.staging + sep)) {
      throw new Error(`build-desktop-web-exe: refusing to clear staging dir ${this.staging}: it contains the repo root.`)
    }
    if (this.cli.dryRun) console.log(`build-desktop-web-exe: [dry-run] rm -rf ${this.staging}`)
    else await rm(this.staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await this.preserveHostInstallState(() => this.run('deploy', pnpmBin(), [
      '--filter',
      DEPLOY_ROOT_PACKAGE,
      'deploy',
      '--legacy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      '--config.confirmModulesPurge=false',
      // Native addons are staged explicitly from the host install; the
      // deploy-time install must not run node-gyp (and needs no scripts).
      '--config.ignore-scripts=true',
      this.staging,
    ]))
    await this.restoreLegacyHoists()
    await this.materializeStagedLinks()
  }

  private async preserveHostInstallState(action: () => Promise<void>): Promise<void> {
    if (this.cli.dryRun) {
      await action()
      return
    }
    await preserveFiles(HOST_INSTALL_STATE_FILES.map(path => join(root, path)), action)
    console.log('build-desktop-web-exe: preserved host pnpm install state across legacy deploy')
  }

  /**
   * Restore direct packages that pnpm's legacy hoister places beside the
   * deploy source instead of in the target. The deploy source's own
   * node_modules (apps/desktop, managed by the workspace install) is the
   * source of record: every direct workspace dependency resolves there as a
   * symlink into its real package directory.
   */
  private async restoreLegacyHoists(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] restore direct dependencies omitted by legacy deploy')
      return
    }
    const manifestPath = join(this.staging, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const sourceNodeModules = resolve(root, DEPLOY_SOURCE_NODE_MODULES)
    const restored: string[] = []
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      const destination = join(this.staging, 'node_modules', dependency)
      if (existsSync(destination)) continue
      const source = join(sourceNodeModules, dependency)
      if (!existsSync(source)) {
        throw new Error(
          `build-desktop-web-exe: deployed dependency ${dependency} is absent from both ${destination} and ${source}.`,
        )
      }
      await mkdir(dirname(destination), { recursive: true })
      const nestedNodeModules = join(source, 'node_modules')
      await cp(source, destination, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
      restored.push(dependency)
    }
    const stillMissing = Object.keys(manifest.dependencies ?? {})
      .filter(dependency => !existsSync(join(this.staging, 'node_modules', dependency)))
    if (stillMissing.length > 0) {
      throw new Error(`build-desktop-web-exe: staged dependencies remain missing: ${stillMissing.join(', ')}.`)
    }
    if (restored.length > 0) {
      console.log(`build-desktop-web-exe: restored legacy deploy hoists: ${restored.join(', ')}`)
    }
  }

  /**
   * Replace deploy-time package links with files, drop every `.bin` shim
   * directory, and reject any remaining link. pnpm's Windows links are
   * junctions, which lstat reports as symbolic links.
   */
  private async materializeStagedLinks(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] materialize staged package links')
      return
    }
    const nodeModules = join(this.staging, 'node_modules')
    let materialized = 0
    let removedBinDirectories = 0
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.name === '.bin') {
          await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
          removedBinDirectories += 1
          continue
        }
        const metadata = await lstat(path)
        if (metadata.isSymbolicLink()) {
          const source = await realpath(path)
          const nestedNodeModules = join(source, 'node_modules')
          await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
          await cp(source, path, {
            recursive: true,
            dereference: true,
            filter: candidate => candidate !== nestedNodeModules && !candidate.startsWith(nestedNodeModules + sep),
          })
          materialized += 1
          const copied = await lstat(path)
          if (copied.isDirectory()) await visit(path)
          continue
        }
        if (metadata.isDirectory()) await visit(path)
      }
    }
    await visit(nodeModules)
    console.log(
      `build-desktop-web-exe: materialized ${materialized} links and removed ${removedBinDirectories} .bin directories in one pass`,
    )
  }

  /**
   * Ensure one native addon file inside the staged closure, copying it from
   * the host install when the deploy did not provide it (the deploy install
   * runs with scripts ignored, so script-produced outputs are absent).
   * @param storePrefix - the `.pnpm` store-entry prefix for host copies.
   * @param packageDir - the staged package directory (relative to staging).
   * @param relativeFile - the addon file path inside that package.
   */
  private async ensureNativeFile(storePrefix: string, packageDir: string, relativeFile: string): Promise<void> {
    const staged = join(this.staging, 'node_modules', packageDir, relativeFile)
    if (existsSync(staged)) {
      console.log(`build-desktop-web-exe: native file present: ${join(packageDir, relativeFile)}`)
      return
    }
    const candidates = [
      ...this.hostStoreCandidates(storePrefix, packageDir, relativeFile),
    ]
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue
      if (this.cli.dryRun) {
        console.log(`build-desktop-web-exe: [dry-run] cp ${candidate} ${staged}`)
        return
      }
      await mkdir(dirname(staged), { recursive: true })
      await copyFile(candidate, staged)
      console.log(`build-desktop-web-exe: staged native file ${join(packageDir, relativeFile)} from ${candidate}`)
      return
    }
    throw new Error(
      `build-desktop-web-exe: native file ${join(packageDir, relativeFile)} is missing from the staged closure and the host install.`,
    )
  }

  /**
   * Candidate store copies of one native file: pnpm's content-addressed dirs
   * under the root install, matched by their store-entry prefix.
   * @param storePrefix - the `.pnpm` entry prefix (e.g. `node-pty@`, `@img+sharp-win32-x64@`).
   * @param packageDir - the package path inside the store entry.
   * @param relativeFile - the addon file path inside that package.
   */
  private hostStoreCandidates(storePrefix: string, packageDir: string, relativeFile: string): string[] {
    const rootNodeModules = resolve(root, 'node_modules', '.pnpm')
    const candidates: string[] = []
    if (existsSync(rootNodeModules)) {
      for (const entry of readdirSync(rootNodeModules)) {
        if (!entry.startsWith(storePrefix)) continue
        const candidate = join(rootNodeModules, entry, 'node_modules', packageDir, relativeFile)
        if (existsSync(candidate)) candidates.push(candidate)
      }
    }
    return candidates
  }

  /**
   * Ensure one native addon directory inside the staged closure (all files
   * under it), copying recursively from the host install when absent.
   * @param storePrefix - the `.pnpm` store-entry prefix for host copies.
   * @param packageDir - the staged package directory (relative to staging).
   * @param relativeDir - the addon directory inside that package.
   */
  private async ensureNativeDir(storePrefix: string, packageDir: string, relativeDir: string): Promise<void> {
    const stagedDir = join(this.staging, 'node_modules', packageDir, relativeDir)
    const hasContents = existsSync(stagedDir)
      && readdirSync(stagedDir).length > 0
    if (hasContents) {
      console.log(`build-desktop-web-exe: native dir present: ${join(packageDir, relativeDir)}`)
      return
    }
    const rootNodeModules = resolve(root, 'node_modules', '.pnpm')
    let copied = false
    if (existsSync(rootNodeModules)) {
      for (const entry of readdirSync(rootNodeModules)) {
        if (!entry.startsWith(storePrefix)) continue
        const source = join(rootNodeModules, entry, 'node_modules', packageDir, relativeDir)
        if (!existsSync(source)) continue
        if (this.cli.dryRun) {
          console.log(`build-desktop-web-exe: [dry-run] cp -r ${source} ${stagedDir}`)
          return
        }
        await mkdir(dirname(stagedDir), { recursive: true })
        await cp(source, stagedDir, { recursive: true, dereference: true })
        console.log(`build-desktop-web-exe: staged native dir ${join(packageDir, relativeDir)} from ${source}`)
        copied = true
        break
      }
    }
    if (!copied) {
      throw new Error(
        `build-desktop-web-exe: native dir ${join(packageDir, relativeDir)} is missing from the staged closure and the host install.`,
      )
    }
  }

  /** Stage the native addons the web closure loads for the selected target. */
  async stageNativeAddons(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] stage native addons')
      return
    }
    const target = `${this.cli.platform}-${this.cli.arch}`
    await Promise.all([
      // node-pty ships pty.node and its platform helper in one directory.
      this.ensureNativeDir('node-pty@', 'node-pty', `prebuilds/${target}`),
      // sharp carries the platform libraries and versioned .node binary together.
      this.ensureNativeDir(`@img+sharp-${target}@`, `@img/sharp-${target}`, 'lib'),
      this.ensureNativeFile(
        `@koromix+koffi-${target}@`,
        `@koromix/koffi-${target}`,
        `${this.cli.platform}_${this.cli.arch}/koffi.node`,
      ),
    ])
  }

  /**
   * Apply the Windows directory-picker fixes to the deployed dependency.
   *
   * Electron must launch the dialog child in Node mode, and the child must
   * keep IPC connected until the parent acknowledges a terminal result. These are
   * local release patches until the corresponding upstream package includes
   * both fixes.
   */
  async applyRuntimePatches(): Promise<void> {
    if (this.cli.dryRun) {
      if (this.cli.platform === 'win32') {
        console.log('build-desktop-web-exe: [dry-run] apply Windows directory-picker runtime patches')
      } else {
        console.log('build-desktop-web-exe: [dry-run] skip Windows directory-picker runtime patches on macOS')
      }
      console.log('build-desktop-web-exe: [dry-run] apply welcome-notice retry runtime patch')
      console.log('build-desktop-web-exe: [dry-run] apply marketplace broken-link self-update fallback')
      return
    }
    if (this.cli.platform === 'win32') {
      const packageLib = join(
        this.staging,
        'node_modules',
        '@deepseek-ai',
        'dsh-host-directory-picker-native',
        'lib',
      )
      const indexSource = resolve(root, 'patches/dsh-host-directory-picker-native-index.js')
      const indexTarget = join(packageLib, 'index.js')
      const workerTarget = join(packageLib, 'worker.cjs')
      if (!existsSync(indexSource) || !existsSync(workerTarget)) {
        throw new Error('build-desktop-web-exe: Windows directory-picker patch inputs are missing.')
      }
      await copyFile(indexSource, indexTarget)
      const worker = await readFile(workerTarget, 'utf8')
      const oldReadUtf16Comment = `* Read a NUL-terminated UTF-16 string at a native address. koffi's\n* \`_Out_ void **\` out-params surface a raw address, and\n* \`koffi.decode(addr, 'str16')\` would dereference it as a pointer — crash\n* on real Windows — so view the memory directly instead.`
      const newReadUtf16Comment = `* Read a NUL-terminated UTF-16 string at a native address. The specialized\n* helper decodes from the raw string base without creating a fixed-size view\n* that can cross the COM allocation boundary and crash the worker.`
      const oldReadUtf16 = `function readUtf16(koffi, address) {\n\tconst bytes = Buffer.from(koffi.view(address, 32768));\n\tlet end = 0;\n\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;\n\treturn bytes.toString("utf16le", 0, end);\n}`
      const newReadUtf16 = `function readUtf16(koffi, address) {\n\treturn koffi.decode.string16(address);\n}`
      const oldPost = `const post = (message) => {\n\t/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */\n\tsend(message, () => {\n\t\tif (process.connected) process.disconnect();\n\t});\n};`
      const newPost = `const post = (message) => {\n\tsend(message);\n};`
      if (worker.includes(oldReadUtf16Comment) || worker.includes(oldReadUtf16) || worker.includes(oldPost)) {
        const patchedWorker = worker
          .replace(oldReadUtf16Comment, newReadUtf16Comment)
          .replace(oldReadUtf16, newReadUtf16)
          .replace(oldPost, newPost)
        await writeFile(workerTarget, patchedWorker)
        console.log('build-desktop-web-exe: applied Windows directory-picker runtime patches')
      } else if (worker.includes(newReadUtf16) && worker.includes(newPost)) {
        console.log('build-desktop-web-exe: Windows directory-picker runtime already up to date')
      } else {
        throw new Error('build-desktop-web-exe: directory-picker worker no longer matches the expected upstream IPC code.')
      }
    } else {
      console.log('build-desktop-web-exe: skipped Windows directory-picker runtime patches for macOS')
    }

    const welcomeTarget = join(
      this.staging,
      'node_modules',
      '@deepseek-ai',
      'dsh-client-ui-settings-models',
      'lib',
      'client.js',
    )
    if (!existsSync(welcomeTarget)) {
      throw new Error(`build-desktop-web-exe: welcome-notice bundle is missing: ${welcomeTarget}`)
    }
    const welcomeSource = await readFile(welcomeTarget, 'utf8')
    if (welcomeSource.includes('scheduleRetry(operation)')) {
      console.log('build-desktop-web-exe: welcome-notice retry runtime patch already applied')
    } else {
      const welcomePatched = patchWelcomeNoticeStore(welcomeSource)
      if (welcomePatched === welcomeSource) {
        throw new Error('build-desktop-web-exe: welcome-notice patch made no changes.')
      }
      await writeFile(welcomeTarget, welcomePatched)
      console.log('build-desktop-web-exe: applied welcome-notice retry runtime patch')
    }

    const marketplaceTarget = join(
      this.staging,
      'node_modules',
      'dsh-plugin-marketplace',
      'lib',
      'index.js',
    )
    if (!existsSync(marketplaceTarget)) {
      throw new Error(`build-desktop-web-exe: marketplace host bundle is missing: ${marketplaceTarget}`)
    }
    const marketplaceSource = await readFile(marketplaceTarget, 'utf8')
    const marketplacePatched = patchMarketplaceSelfUpdate(marketplaceSource)
    if (marketplacePatched === marketplaceSource) {
      console.log('build-desktop-web-exe: marketplace broken-link self-update fallback already applied')
    } else {
      await writeFile(marketplaceTarget, marketplacePatched)
      console.log('build-desktop-web-exe: applied marketplace broken-link self-update fallback')
    }
  }

  /** Reject a deploy/cache layer that cannot supply the bundled marketplace. */
  private async validateMarketplaceStaging(): Promise<void> {
    const packageRoot = join(this.staging, 'node_modules', 'dsh-plugin-marketplace')
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] validate bundled marketplace at ${packageRoot}`)
      return
    }
    const missing = MARKETPLACE_RUNTIME_FILES.filter(relative => !existsSync(join(packageRoot, relative)))
    if (missing.length > 0) {
      throw new Error(`build-desktop-web-exe: staged marketplace is incomplete; missing: ${missing.join(', ')}`)
    }
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { name?: unknown }
    if (manifest.name !== 'dsh-plugin-marketplace') {
      throw new Error(`build-desktop-web-exe: staged marketplace manifest has unexpected name: ${String(manifest.name)}`)
    }
  }

  /** Remove native variants and source metadata that are never loaded by the target runtime. */
  async pruneReleasePayload(): Promise<void> {
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] prune native extras for ${this.cli.platform}-${this.cli.arch}, maps, and declarations`)
      if (this.cli.pruneSources) console.log('build-desktop-web-exe: [dry-run] prune ordinary TypeScript sources')
      return
    }

    const nodePty = join(this.staging, 'node_modules', 'node-pty')
    const target = `${this.cli.platform}-${this.cli.arch}`
    const nodePtyPlatforms = ['darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-x64']
    await Promise.all(nodePtyPlatforms
      .filter(platform => platform !== target)
      .map(platform => rm(join(nodePty, 'prebuilds', platform), { recursive: true, force: true })))
    await this.pruneUnusedNativePackages(target)
    const removed = await this.removeUnusedStagedFiles(nodePty)
    const rceditPath = join(this.staging, 'node_modules', 'rcedit')
    if (existsSync(rceditPath)) await rm(rceditPath, { recursive: true, force: true })
    console.log(
      `build-desktop-web-exe: pruned ${removed.pdb} PDB, ${removed.map} map, ${removed.declaration} declaration` +
      `${this.cli.pruneSources ? `, and ${removed.source} source` : ''} files in one pass`,
    )
  }

  private async pruneUnusedNativePackages(target: string): Promise<void> {
    const nodeModules = join(this.staging, 'node_modules')
    const groups = [
      { scope: '@img', pattern: /^(?:sharp|sharp-libvips)-(?:darwin|win32)-/ },
      { scope: '@koromix', pattern: /^koffi-(?:darwin|win32)-/ },
    ]
    let removed = 0
    for (const { scope, pattern } of groups) {
      const directory = join(nodeModules, scope)
      if (!existsSync(directory)) continue
      for (const entry of readdirSync(directory)) {
        if (!pattern.test(entry) || entry.includes(`-${target}`)) continue
        await rm(join(directory, entry), { recursive: true, force: true })
        removed += 1
      }
    }
    if (removed > 0) console.log(`build-desktop-web-exe: pruned ${removed} unused native platform packages`)
  }

  private async removeUnusedStagedFiles(nodePty: string): Promise<Record<'pdb' | 'map' | 'declaration' | 'source', number>> {
    const removed = { pdb: 0, map: 0, declaration: 0, source: 0 }
    const removals: string[] = []
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(path)
        } else if (entry.isFile()) {
          const lower = path.toLowerCase()
          let category: keyof typeof removed | undefined
          if (path.startsWith(nodePty + sep) && lower.endsWith('.pdb')) category = 'pdb'
          else if (lower.endsWith('.map')) category = 'map'
          else if (lower.endsWith('.d.ts')) category = 'declaration'
          else if (this.cli.pruneSources && /\.(?:ts|tsx)$/i.test(path)) category = 'source'
          if (category) {
            removed[category] += 1
            removals.push(path)
          }
        }
      }
    }
    await visit(this.staging)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(16, removals.length) }, async () => {
      while (cursor < removals.length) {
        const index = cursor
        cursor += 1
        await rm(removals[index], { force: true })
      }
    }))
    return removed
  }

  /** Keep only the locales shipped by the product's supported UI languages. */
  async pruneElectronLocales(product: string): Promise<void> {
    if (!this.cli.electron || this.cli.dryRun) return
    const localesDir = this.cli.platform === 'darwin'
      ? join(product, 'Contents', 'Resources', 'locales')
      : join(dirname(product), 'locales')
    if (!existsSync(localesDir)) return
    const keep = new Set(['en-US.pak', 'zh-CN.pak', 'zh-TW.pak'])
    let removed = 0
    for (const entry of await readdir(localesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pak') && !keep.has(entry.name)) {
        await rm(join(localesDir, entry.name), { force: true })
        removed += 1
      }
    }
    console.log(`build-desktop-web-exe: pruned ${removed} Electron locale files`)
  }

  /** Add the executable entry and pkg assets to the staged manifest. */
  async injectPkgConfig(): Promise<void> {
    const patch = this.cli.electron ? {} : { bin: ENTRY_BIN, pkg: { assets: ASSET_GLOBS } }
    const manifestPath = join(this.staging, 'package.json')
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] patch ${manifestPath} with ${JSON.stringify(patch)}`)
      return
    }
    if (!existsSync(manifestPath)) {
      throw new Error(`build-desktop-web-exe: ${manifestPath} missing — pnpm deploy did not produce a staged package.`)
    }
    if (!this.cli.electron && !existsSync(join(this.staging, ENTRY_BIN))) {
      throw new Error(`build-desktop-web-exe: ${join(this.staging, ENTRY_BIN)} missing — run without --skip-build so the desktop entry builds.`)
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, ...patch }, null, 2)}\n`)
    if (this.cli.electron) {
      console.log(`build-desktop-web-exe: prepared Electron manifest at ${manifestPath}`)
    } else {
      console.log(`build-desktop-web-exe: injected pkg config into ${manifestPath}`)
    }
  }

  /**
   * Package the selected target; SEA mode remains Windows-only.
   * @returns the executable or application bundle path.
   */
  async pack(): Promise<string> {
    const version = desktopVersion()
    const product = this.cli.electron
      ? this.cli.platform === 'darwin'
        ? join(this.electronOutDir, `${ELECTRON_APP_NAME}-darwin-${this.cli.arch}`, `${ELECTRON_APP_NAME}.app`)
        : join(this.electronOutDir, `${ELECTRON_APP_NAME}-win32-${this.cli.arch}`, 'runtime', `${ELECTRON_APP_NAME}.exe`)
      : join(this.outDir, `${OUTPUT_BASENAME}-${version}-win-x64.exe`)
    const artifactKey = await fingerprintPaths({
      baseDir: root,
      paths: [],
      salt: [
        'artifact-v1',
        this.stagingKey,
        process.version,
        this.cli.electron
          ? `electron-${this.cli.platform}-${this.cli.arch}`
          : `${PKG_SPEC}-${DEFAULT_NODE_RANGE}-win-x64`,
      ],
    })
    const required = this.cli.electron
      ? [
          product,
          this.appResourcesDir(product),
          join(this.appResourcesDir(product), ENTRY_BIN),
          join(this.appResourcesDir(product), 'node_modules', '@deepseek-ai', 'dsh-web-app', 'package.json'),
          join(this.appResourcesDir(product), 'node_modules', 'dsh-plugin-marketplace', 'package.json'),
        ]
      : [product]
    if (!this.cli.noCache && cacheLayerMatches(this.cacheState.electron, artifactKey, required)) {
      console.log(`build-desktop-web-exe: artifact cache hit (${artifactKey.slice(0, 12)})`)
      return product
    }
    console.log(`build-desktop-web-exe: artifact cache miss (${artifactKey.slice(0, 12)})`)
    await this.timed('package artifact', async () => {
      if (this.cli.electron) await this.packElectron()
      else await this.packSea(product)
      await this.pruneElectronLocales(product)
    })
    if (!this.cli.dryRun) {
      this.cacheState = completeCacheLayer(this.cacheState, 'electron', artifactKey)
      await writePackagingCache(this.cachePath, this.cacheState)
    }
    return product
  }

  private appResourcesDir(product: string): string {
    return this.cli.platform === 'darwin'
      ? join(product, 'Contents', 'Resources', 'app')
      : join(dirname(product), 'resources', 'app')
  }

  /** Package the single-file SEA executable. */
  private async packSea(product: string): Promise<void> {
    if (!this.cli.dryRun) await mkdir(this.outDir, { recursive: true })
    const baseReady = this.cli.dryRun ? true : await this.preparePkgBaseIcon()
    await this.runPkg(product)
    if (!this.cli.dryRun && !baseReady) {
      if (!(await this.preparePkgBaseIcon())) {
        throw new Error(`build-desktop-web-exe: pkg did not leave an extracted ${DEFAULT_NODE_RANGE} Windows base executable in ${join(homedir(), '.pkg-cache', 'sea')}.`)
      }
      await this.runPkg(product)
    }
    if (!this.cli.dryRun && !existsSync(product)) {
      throw new Error(`build-desktop-web-exe: product ${product} is missing after the pkg run; inspect ${this.outDir}.`)
    }
  }

  /** Run the single-file SEA packager for the staged runtime. */
  private async runPkg(product: string): Promise<void> {
    await this.run(`pkg ${DEFAULT_NODE_RANGE}-win-x64`, pnpmBin(), [
      'dlx',
      PKG_SPEC,
      this.staging,
      '--sea',
      '--targets',
      `${DEFAULT_NODE_RANGE}-win-x64`,
      '--output',
      product,
    ])
  }

  /** Package the staged runtime into the selected Electron application layout. */
  private async packElectron(): Promise<string> {
    if (this.cli.platform === 'darwin') return this.packElectronMac()
    const target = `win32-${this.cli.arch}`
    const portableRoot = join(this.electronOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagerOutDir = join(this.electronOutDir, '.packager')
    const nextPortableRoot = join(this.electronOutDir, `.portable-next-${process.pid}`)
    const previousPortableRoot = join(this.electronOutDir, `.portable-previous-${process.pid}`)
    const packagedRoot = join(packagerOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagedProduct = join(packagedRoot, `${ELECTRON_APP_NAME}.exe`)
    const runtimeRoot = join(portableRoot, 'runtime')
    const product = join(runtimeRoot, `${ELECTRON_APP_NAME}.exe`)
    if (!this.cli.dryRun) {
      await Promise.all([
        rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(nextPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(previousPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
      ])
      await mkdir(packagerOutDir, { recursive: true })
    }
    // electron-packager reads the Electron package's downloaded distribution
    // directly. If install scripts were skipped, that package can contain
    // only the npm wrapper and path metadata, which lets packager emit an exe
    // without the ICU, Chromium, and GPU runtime files beside it. Running the
    // wrapper first makes the missing distribution download itself and fails
    // before a partial portable directory can be presented as a product.
    const electronBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.CMD' : 'electron')
    if (existsSync(electronBin)) {
      await this.run('prepare Electron runtime', electronBin, ['--version'])
    } else {
      await this.run('prepare Electron runtime', pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'electron',
        '--version',
      ])
    }

    const electronPackagerBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.CMD' : 'electron-packager')
    const packagerArgs = [
      this.staging,
      ELECTRON_APP_NAME,
      '--platform',
      'win32',
      '--arch',
      this.cli.arch,
      '--icon',
      DESKTOP_ICON,
      '--out',
      packagerOutDir,
      '--overwrite',
      '--no-asar',
      '--no-prune',
    ]
    if (existsSync(electronPackagerBin)) {
      await this.run(`Electron ${ELECTRON_APP_NAME} ${target}`, electronPackagerBin, packagerArgs)
    } else {
      await this.run(`Electron ${ELECTRON_APP_NAME} ${target}`, pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'electron-packager',
        ...packagerArgs,
      ])
    }

    if (!this.cli.dryRun) {
      if (!existsSync(packagedProduct)) {
        throw new Error(`build-desktop-web-exe: Electron product ${packagedProduct} is missing after packaging.`)
      }
      await mkdir(nextPortableRoot, { recursive: true })
      await rename(packagedRoot, join(nextPortableRoot, 'runtime'))
      if (existsSync(portableRoot)) await rename(portableRoot, previousPortableRoot)
      try {
        await rename(nextPortableRoot, portableRoot)
      } catch (error) {
        if (existsSync(previousPortableRoot) && !existsSync(portableRoot)) {
          await rename(previousPortableRoot, portableRoot)
        }
        throw error
      }
      await rm(previousPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      console.log('build-desktop-web-exe: moved Electron runtime into place without a second tree copy')
    }
    return product
  }

  /** Package the native macOS arm64 application bundle. */
  private async packElectronMac(): Promise<string> {
    const target = `darwin-${this.cli.arch}`
    const bundleRoot = join(this.electronOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagerOutDir = join(this.electronOutDir, '.packager')
    const nextBundleRoot = join(this.electronOutDir, `.app-next-${process.pid}`)
    const previousBundleRoot = join(this.electronOutDir, `.app-previous-${process.pid}`)
    const packagedRoot = join(packagerOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagedProduct = join(packagedRoot, `${ELECTRON_APP_NAME}.app`)
    const product = join(bundleRoot, `${ELECTRON_APP_NAME}.app`)

    if (!this.cli.dryRun) {
      await Promise.all([
        rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(nextBundleRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(previousBundleRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
      ])
      await mkdir(packagerOutDir, { recursive: true })
    }

    const electronBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.CMD' : 'electron')
    if (existsSync(electronBin)) {
      await this.run('prepare Electron runtime', electronBin, ['--version'])
    } else {
      await this.run('prepare Electron runtime', pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'electron',
        '--version',
      ])
    }

    const electronPackagerBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.CMD' : 'electron-packager')
    const macIcon = await this.prepareMacIcon()
    const packagerArgs = [
      this.staging,
      ELECTRON_APP_NAME,
      '--platform',
      'darwin',
      '--arch',
      this.cli.arch,
      '--app-bundle-id',
      'com.deepseek.harness',
      '--out',
      packagerOutDir,
      '--overwrite',
      '--no-asar',
      '--no-prune',
    ]
    if (macIcon) packagerArgs.push('--icon', macIcon)
    else console.warn('build-desktop-web-exe: macOS icon is not present; using Electron default app icon')

    if (existsSync(electronPackagerBin)) {
      await this.run(`Electron ${ELECTRON_APP_NAME} ${target}`, electronPackagerBin, packagerArgs)
    } else {
      await this.run(`Electron ${ELECTRON_APP_NAME} ${target}`, pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'electron-packager',
        ...packagerArgs,
      ])
    }

    if (!this.cli.dryRun) {
      if (!existsSync(packagedProduct)) {
        throw new Error(`build-desktop-web-exe: macOS Electron product ${packagedProduct} is missing after packaging.`)
      }
      await mkdir(nextBundleRoot, { recursive: true })
      await rename(packagedRoot, join(nextBundleRoot, `${ELECTRON_APP_NAME}.app`))
      if (existsSync(bundleRoot)) await rename(bundleRoot, previousBundleRoot)
      try {
        await rename(nextBundleRoot, bundleRoot)
      } catch (error) {
        if (existsSync(previousBundleRoot) && !existsSync(bundleRoot)) {
          await rename(previousBundleRoot, bundleRoot)
        }
        throw error
      }
      await rm(previousBundleRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      console.log('build-desktop-web-exe: moved macOS Electron app bundle into place')
    }
    return product
  }

  /**
   * Produce an .icns file on macOS from the 64px logo already embedded in the
   * desktop shell. Keeping this build-time avoids committing a generated
   * binary asset while still giving the native app a product icon.
   */
  private async prepareMacIcon(): Promise<string | undefined> {
    if (existsSync(MAC_DESKTOP_ICON)) return MAC_DESKTOP_ICON
    if (this.cli.dryRun || process.platform !== 'darwin') return undefined

    const source = await readFile(join(root, 'apps', 'desktop', 'src', 'desktop-preload.cjs'), 'utf8')
    const match = /const DEEPSEEK_LOGO_DATA_URI = 'data:image\/png;base64,([^']+)'/.exec(source)
    if (!match?.[1]) return undefined

    const workDir = join(this.electronOutDir, `.mac-icon-${process.pid}`)
    const iconset = join(workDir, 'deepseek.iconset')
    const sourcePng = join(workDir, 'source.png')
    const output = join(this.staging, 'assets', 'deepseek.icns')
    await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await mkdir(iconset, { recursive: true })
    await mkdir(dirname(output), { recursive: true })
    await writeFile(sourcePng, Buffer.from(match[1], 'base64'))

    try {
      for (const size of [16, 32, 128, 256, 512]) {
        await this.run(`prepare macOS icon ${size}x${size}`, 'sips', [
          '-z',
          String(size),
          String(size),
          sourcePng,
          '--out',
          join(iconset, `icon_${size}x${size}.png`),
        ])
        await this.run(`prepare macOS icon ${size * 2}x${size * 2}`, 'sips', [
          '-z',
          String(size * 2),
          String(size * 2),
          sourcePng,
          '--out',
          join(iconset, `icon_${size}x${size}@2x.png`),
        ])
      }
      await this.run('create macOS icns', 'iconutil', ['-c', 'icns', iconset, '-o', output])
    } finally {
      await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    }
    return existsSync(output) ? output : undefined
  }

  /** Create a compressed DMG containing the app and an Applications alias. */
  async createDmg(product: string): Promise<string | undefined> {
    if (!this.cli.dmg) return undefined
    if (process.platform !== 'darwin' && !this.cli.dryRun) {
      throw new Error('build-desktop-web-exe: DMG creation must run on macOS because hdiutil is a system tool.')
    }
    const dmgPath = join(
      this.electronOutDir,
      `DeepSeek-Harness-${distributionVersion()}-${this.cli.platform}-${this.cli.arch}.dmg`,
    )
    const dmgStaging = join(this.electronOutDir, `.dmg-staging-${process.pid}`)
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] create DMG ${dmgPath}`)
      return dmgPath
    }
    await rm(dmgStaging, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await mkdir(dmgStaging, { recursive: true })
    await cp(product, join(dmgStaging, `${ELECTRON_APP_NAME}.app`), { recursive: true, dereference: true })
    await symlink('/Applications', join(dmgStaging, 'Applications'))
    await rm(dmgPath, { force: true })
    try {
      await this.run('create macOS DMG', 'hdiutil', [
        'create',
        '-volname',
        ELECTRON_APP_NAME,
        '-srcfolder',
        dmgStaging,
        '-ov',
        '-format',
        'UDZO',
        dmgPath,
      ])
    } finally {
      await rm(dmgStaging, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    }
    if (!existsSync(dmgPath)) throw new Error(`build-desktop-web-exe: DMG ${dmgPath} is missing after hdiutil.`)
    return dmgPath
  }

  /** Embed the same icon used by the Electron shell into the portable exe. */
  private async applyIcon(product: string): Promise<void> {
    if (!existsSync(DESKTOP_ICON)) {
      throw new Error(`build-desktop-web-exe: Windows icon is missing: ${DESKTOP_ICON}.`)
    }
    const applyIconScript = join(root, 'apps', 'desktop', 'src', 'apply-icon.mjs')
    if (existsSync(applyIconScript)) {
      await this.run('apply Windows icon', process.execPath, [
        applyIconScript,
        product,
        DESKTOP_ICON,
      ])
    } else {
      await this.run('apply Windows icon', pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'node',
        'src/apply-icon.mjs',
        product,
        DESKTOP_ICON,
      ])
    }
  }

  /**
   * Apply the icon to pkg's extracted Node base before SEA injection.
   *
   * rcedit can update the extracted Node PE, but it can hang while parsing
   * the much larger postject output. pkg copies this base before injecting
   * the SEA blob, so the resulting single-file executable keeps the resource.
   *
   * @returns whether a cached, already-extracted base was found and updated.
   */
  private async preparePkgBaseIcon(): Promise<boolean> {
    const cacheDir = join(homedir(), '.pkg-cache', 'sea')
    if (!existsSync(cacheDir)) return false
    const prefix = `node-v${DEFAULT_NODE_RANGE.slice(4)}.`
    const baseNames = readdirSync(cacheDir)
      .filter((name) => name.startsWith(prefix) && name.endsWith('-win-x64.exe'))
      .sort()
    const baseName = baseNames[baseNames.length - 1]
    if (!baseName) return false
    const base = join(cacheDir, baseName)
    if (!existsSync(`${base}.ok`)) return false
    await this.applyIcon(base)
    return true
  }

  /**
   * Print the product path and, outside dry-run mode, its size.
   * @param product - the product path returned by {@link pack}.
   */
  printProduct(product: string, additional?: string): void {
    console.log(this.cli.dryRun ? 'build-desktop-web-exe: [dry-run] would produce:' : 'build-desktop-web-exe: product:')
    if (this.cli.dryRun) {
      console.log(`  ${product}`)
      if (additional) console.log(`  ${additional}`)
      return
    }
    const productStat = statSync(product)
    if (productStat.isFile()) {
      const megabytes = productStat.size / (1024 * 1024)
      console.log(`  ${product}  (${megabytes.toFixed(1)} MB)`)
    } else {
      console.log(`  ${product}`)
    }
    if (additional) {
      const additionalStat = statSync(additional)
      const megabytes = additionalStat.isFile() ? additionalStat.size / (1024 * 1024) : 0
      console.log(`  ${additional}${additionalStat.isFile() ? `  (${megabytes.toFixed(1)} MB)` : ''}`)
    }
  }

  /**
   * Carry the repository's MIT license and third-party notices with the
   * distribution. The Electron route places them inside the app payload
   * (resources/app); the single-file route places them beside the exe, where
   * they ride along in the release.
   * @param product - the product path returned by {@link pack}.
   */
  async stageDistributionDocs(product: string): Promise<void> {
    const destDir = this.cli.electron
      ? this.appResourcesDir(product)
      : this.outDir
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      const destination = join(destDir, name)
      if (this.cli.dryRun) {
        console.log(`build-desktop-web-exe: [dry-run] cp ${join(root, name)} ${destination}`)
        continue
      }
      if (!existsSync(join(root, name))) {
        throw new Error(`build-desktop-web-exe: distribution doc ${join(root, name)} is missing.`)
      }
      await mkdir(destDir, { recursive: true })
      await copyFile(join(root, name), destination)
      console.log(`build-desktop-web-exe: staged ${name} into ${destination}`)
    }

    if (this.cli.electron && this.cli.platform === 'win32') {
      const rootDir = dirname(dirname(product))
      const rootFiles = [
        'LICENSE',
        'THIRD_PARTY_NOTICES.md',
        'smoke-native.cjs',
        'apps/desktop/start-web.cmd',
        'apps/desktop/start-desktop.cmd',
        'apps/desktop/update.cmd',
        'apps/desktop/启动网页版.bat',
        'apps/desktop/启动桌面窗口.bat',
        'apps/desktop/启动桌面版.bat',
        'apps/desktop/在线更新.bat',
        'apps/desktop/创建桌面快捷方式.bat',
        'apps/desktop/一键解除拦截(自签名信任).bat',
        'apps/desktop/使用说明.txt',
        'apps/desktop/使用说明.en.txt',
        'apps/desktop/dsh.cmd',
        'apps/desktop/portable-pnpm.cmd',
        'uninstall.cmd',
        'uninstall.ps1',
        'apps/desktop/update.ps1',
        'apps/desktop/setup-shortcuts.ps1',
      ]
      for (const relPath of rootFiles) {
        const source = join(root, relPath)
        if (!existsSync(source)) continue
        const basename = relPath === 'apps/desktop/portable-pnpm.cmd'
          ? 'pnpm.cmd'
          : relPath.includes('/') ? relPath.slice(relPath.lastIndexOf('/') + 1) : relPath
        const dest = join(rootDir, basename)
        if (this.cli.dryRun) {
          console.log(`build-desktop-web-exe: [dry-run] cp ${source} ${dest}`)
        } else {
          await copyFile(source, dest)
          console.log(`build-desktop-web-exe: staged ${basename} into ${dest}`)
        }
      }

      const updaterSource = join(root, 'apps', 'desktop', 'updater')
      if (existsSync(updaterSource)) {
        const updaterDest = join(rootDir, 'updater')
        if (this.cli.dryRun) {
          console.log(`build-desktop-web-exe: [dry-run] cp -r ${updaterSource} ${updaterDest}`)
        } else {
          await cp(updaterSource, updaterDest, { recursive: true })
          console.log(`build-desktop-web-exe: staged updater module into ${updaterDest}`)
        }
      }
    }
  }

  private async timed<T>(label: string, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
      return await action()
    } finally {
      const seconds = (performance.now() - startedAt) / 1000
      console.log(`build-desktop-web-exe: ${label} completed in ${seconds.toFixed(2)}s`)
    }
  }

  /**
   * Run one subprocess with inherited stdio. Spawn and non-zero-exit errors
   * include the command; dry runs only print it.
   * @param label - the step name used in logs and error messages.
   * @param command - the executable.
   * @param args - its arguments.
   */
  private async run(label: string, command: string, args: string[]): Promise<void> {
    const printable = formatCommand(command, args)
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] ${printable}`)
      return
    }
    console.log(`build-desktop-web-exe: ${label}: ${printable}`)
    await new Promise<void>((resolvePromise, reject) => {
      // On Windows, .cmd shims (pnpm.cmd) cannot spawn directly; route the
      // whole command line through the shell.
      const binDir = join(root, 'node_modules', '.bin')
      const pnpmBinDir = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin')
      const envPath = [binDir, pnpmBinDir, process.env.PATH || process.env.Path || ''].join(delimiter)
      const childEnv = {
        ...process.env,
        NODE_ENV: 'development',
        PATH: envPath,
        Path: envPath,
        CI: 'true',
        HUSKY: '0',
        LEFTHOOK: '0',
        npm_config_confirm_modules_purge: 'false',
      }
      const child = process.platform === 'win32'
        ? spawn(printable, { cwd: root, stdio: 'inherit', env: childEnv, shell: true })
        : spawn(command, args, {
          cwd: root,
          stdio: 'inherit',
          // Artifact builds must not mutate or validate a developer's Git hooks.
          env: childEnv,
        })
      child.once('error', (error) => {
        reject(new Error(`build-desktop-web-exe: ${label} failed to spawn: ${error.message} (${printable})`))
      })
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolvePromise()
          return
        }
        const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
        reject(new Error(`build-desktop-web-exe: ${label} failed (${cause}): ${printable}`))
      })
    })
  }
}

async function main(): Promise<void> {
  const startedAt = performance.now()
  const cli = BuildCli.parse(process.argv.slice(2))
  const pipeline = new DesktopExeBuild(cli)
  console.log(`build-desktop-web-exe: staging: ${pipeline.staging}`)
  await pipeline.initialize()
  await pipeline.build()
  await pipeline.prepareStaging()
  const product = await pipeline.pack()
  await pipeline.stageDistributionDocs(product)
  const dmg = await pipeline.createDmg(product)
  pipeline.printProduct(product, dmg)
  console.log(`build-desktop-web-exe: total ${((performance.now() - startedAt) / 1000).toFixed(2)}s`)
}

await main()
