/**
 * Build desktop distributions for the desktop web surface.
 *
 * The default route uses the fixed `@yao-pkg/pkg --sea` single-file
 * executable flow. The `--electron` route packages the same deployed
 * runtime behind the native Electron shell. Both routes use the
 * `@dsh-portable/runtime` capsule, stage target-native addons and the thin
 * desktop shell, and apply the
 * platform application icon.
 *
 * Windows is a documented non-goal of the Python SDK distribution; this
 * script is the local/personal channel for portable desktop distributions of
 * the dsh web surface and is not part of the repository gates.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { chmod, copyFile, cp, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import type { NativeAssetRule, TargetSpec } from '../packages/platform-contract/src/index.js'
import { createReleaseManifest, serializeReleaseManifest } from '../packages/release-manifest/src/index.js'
import { collectArtifactInventory } from './build/artifact-inventory.js'
import { writeArtifactVerification } from './build/artifact-verification.js'
import { getTargetSpec, getTargetSpecFor, TARGET_SPECS } from './build/targets.js'
import type { PatchAttestation } from './build/patch-manifest.js'
import { electronExecutable, runPackagedSmoke, type PackagedRuntimeEvidence } from './build/packaged-smoke.js'
import { runBuildStages } from './build/pipeline.js'
import { applyRuntimePatchLayer } from './build/runtime-patches.js'
import { discoverDesktopVerificationFiles } from './release/desktop-verification.js'
import { resolveSourceIdentity } from './release/source-identity.js'
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
const DEPLOY_ROOT_PACKAGE = '@dsh-portable/runtime'
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
/** Official upstream Landlock launcher package used by Linux standard mode. */
const LINUX_LANDLOCK_PACKAGE = '@deepseek-ai/node-addon-landlock-run-linux-x64'
const LINUX_LANDLOCK_SOURCE = resolve(root, 'vendor/deepseek-harness/native/landlock-run/packages/linux-x64')
/** The cleared deploy target and pkg input. */
const STAGING_DIR = 'dist-desktop/node'
/** Successful layer fingerprints live with other disposable packaging output. */
const CACHE_STATE_FILE = 'dist-desktop/.cache/packaging-state.json'
/** Legacy deploy may hoist direct workspace packages into the deploy source's own node_modules. */
const DEPLOY_SOURCE_NODE_MODULES = 'apps/runtime/node_modules'
/** Legacy deploy must not leave the host workspace marked as production-only. */
const HOST_INSTALL_STATE_FILES = [
  'node_modules/.modules.yaml',
  'node_modules/.package-map.json',
  'node_modules/.pnpm/lock.yaml',
  'node_modules/.pnpm-workspace-state-v1.json',
]

function filesystemErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/**
 * Windows can retain a directory handle briefly after electron-packager exits
 * (notably while Defender scans a new executable). Keep the atomic promotion
 * fail-closed, but give those transient EPERM/EBUSY races time to drain.
 */
async function renameWithTransientWindowsRetry(source: string, destination: string): Promise<void> {
  const maxAttempts = process.platform === 'win32' ? 10 : 1
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const code = filesystemErrorCode(error)
      if (attempt >= maxAttempts || (code !== 'EPERM' && code !== 'EBUSY')) throw error
      await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 250))
    }
  }
}

async function moveDirectoryContents(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true })
  for (const entry of await readdir(source)) {
    await renameWithTransientWindowsRetry(join(source, entry), join(destination, entry))
  }
}

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
  'apps/desktop/electron-builder.yml',
  'apps/desktop/src',
  'apps/desktop/assets',
  'apps/runtime/package.json',
  'apps/runtime/runtime-deps.generated.json',
  'apps/runtime/tsconfig.json',
  'apps/runtime/src',
  'apps/runtime/config',
  'packages/desktop-protocol',
  'scripts/runtime',
  'apps/vision-bridge/package.json',
  'apps/vision-bridge/tsconfig.json',
  'apps/vision-bridge/tsdown.config.ts',
  'apps/vision-bridge/src',
  'apps/interactive-learning/package.json',
  'apps/interactive-learning/tsconfig.json',
  'apps/interactive-learning/tsdown.config.ts',
  'apps/interactive-learning/src',
  'apps/interactive-learning/preset',
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
  'scripts/build',
  'scripts/packaging-cache.ts',
  'apps/desktop/electron-builder.yml',
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

function electronVersion(): string {
  if (!existsSync(DESKTOP_PACKAGE_JSON)) {
    throw new Error(`build-desktop-web-exe: desktop manifest is missing: ${DESKTOP_PACKAGE_JSON}`)
  }
  const version = (JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, 'utf8')) as {
    devDependencies?: Record<string, unknown>
  }).devDependencies?.electron
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`build-desktop-web-exe: invalid Electron version in ${DESKTOP_PACKAGE_JSON}`)
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
    /** The single source of all target-specific build facts. */
    readonly target: TargetSpec,
    /** Create a compressed macOS disk image after the .app is staged. */
    readonly dmg: boolean,
    /** Remove ordinary TypeScript sources after the safe release pruning pass. */
    readonly pruneSources: boolean,
    /** Rebuild every disposable packaging layer and refresh its cache key. */
    readonly noCache: boolean,
    /** Optional versioned Electron output root below dist-desktop/. */
    readonly electronOutputRoot: string | undefined,
    /** Continue release gates from an already-packaged product in that root. */
    readonly reuseUnpacked: boolean,
  ) {}

  get platform(): TargetSpec['platform'] {
    return this.target.platform
  }

  get arch(): TargetSpec['arch'] {
    return this.target.arch
  }

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
    if (values.target !== undefined && (values.platform !== undefined || values.arch !== undefined)) {
      throw new Error('--target cannot be combined with the deprecated --platform/--arch flags')
    }
    let target: TargetSpec
    if (values.target !== undefined) {
      target = getTargetSpec(values.target)
    } else if (values.platform !== undefined || values.arch !== undefined) {
      const platform = values.platform ?? 'win32'
      const arch = values.arch ?? (platform === 'darwin' ? 'arm64' : 'x64')
      target = getTargetSpecFor(platform, arch)
      console.warn(`build-desktop-web-exe: --platform/--arch are deprecated; use --target ${target.id}`)
    } else {
      target = getTargetSpec('win32-x64')
    }
    if (target.platform !== 'win32' && !values.electron) {
      throw new Error(`${target.id} packaging requires --electron`)
    }
    if (values.dmg && (target.platform !== 'darwin' || !values.electron)) {
      throw new Error('--dmg is only valid for the macOS Electron target')
    }
    if (values['output-root'] !== undefined && !values.electron) {
      throw new Error('--output-root is only valid with --electron')
    }
    const electronOutputRoot = values['output-root'] === undefined
      ? undefined
      : resolve(root, values['output-root'])
    const allowedOutputRoot = resolve(root, 'dist-desktop')
    if (electronOutputRoot !== undefined
      && electronOutputRoot !== allowedOutputRoot
      && !electronOutputRoot.startsWith(`${allowedOutputRoot}${sep}`)) {
      throw new Error('--output-root must resolve inside dist-desktop/')
    }
    if (values['reuse-unpacked'] && (!values.electron || electronOutputRoot === undefined)) {
      throw new Error('--reuse-unpacked requires --electron and an explicit --output-root')
    }
    return new BuildCli(
      values['skip-build'],
      values['dry-run'],
      values.electron,
      target,
      values.dmg || target.formats.includes('dmg'),
      values['prune-sources'],
      values['no-cache'],
      electronOutputRoot,
      values['reuse-unpacked'],
    )
  }

  private static parseRaw(argv: string[]) {
    return parseArgs({
      args: argv,
      options: {
        'skip-build': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'electron': { type: 'boolean', default: false },
        'target': { type: 'string' },
        // Compatibility-only: all maintained scripts use --target.
        'platform': { type: 'string' },
        'arch': { type: 'string' },
        'dmg': { type: 'boolean', default: false },
        'prune-sources': { type: 'boolean', default: false },
        'no-cache': { type: 'boolean', default: false },
        'output-root': { type: 'string' },
        'reuse-unpacked': { type: 'boolean', default: false },
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
      `  --target       build target: ${TARGET_SPECS.map(target => target.id).join(', ')} (default: win32-x64).`,
      '  --dmg          compatibility flag; darwin targets create their declared DMG automatically.',
      '  --prune-sources remove ordinary .ts/.tsx source files after safe pruning; smoke-test the release before publishing.',
      '  --no-cache     rebuild all disposable packaging layers and refresh their cache keys.',
      '  --output-root  write Electron products and verification below a fresh dist-desktop/ subdirectory.',
      '  --reuse-unpacked continue release gates from an existing product in --output-root.',
      '  --help         print this help.',
      '',
      `Default route: ${PKG_SPEC} --sea, target ${DEFAULT_NODE_RANGE}-win-x64; writes to ${OUT_DIR}/.`,
      `Electron route: target is selected with --target; writes to ${ELECTRON_OUT_DIR}/.`,
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
  private readonly electronOutDir: string
  private readonly cachePath = resolve(root, CACHE_STATE_FILE)
  private cacheState: PackagingCacheState = { version: 1 }
  private buildKey = ''
  private stagingKey = ''
  private patchAttestations: readonly PatchAttestation[] = []

  constructor(private readonly cli: BuildCli) {
    this.electronOutDir = cli.electronOutputRoot ?? resolve(root, ELECTRON_OUT_DIR)
  }

  /** Load cache state and fingerprint source inputs before any mutable step. */
  async initialize(): Promise<void> {
    this.cacheState = this.cli.noCache || this.cli.dryRun
      ? { version: 1 }
      : await readPackagingCache(this.cachePath)
    await this.prepareLinuxNativeLauncher()
    this.buildKey = await this.timed('fingerprint build inputs', () => fingerprintPaths({
      baseDir: root,
      paths: BUILD_INPUT_PATHS,
      excludedDirectoryNames: FINGERPRINT_EXCLUDED_DIRECTORIES,
      salt: ['build-v2', this.cli.target.id, process.version],
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
      join(root, 'apps', 'runtime', ENTRY_BIN),
      join(root, 'apps', 'vision-bridge', 'lib', 'index.js'),
      join(root, 'apps', 'interactive-learning', 'lib', 'index.js'),
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
        this.cli.target.id,
        this.cli.pruneSources ? 'prune-sources' : 'keep-sources',
      ],
    })
    const required = [
      join(this.staging, 'package.json'),
      join(this.staging, ENTRY_BIN),
      join(this.staging, 'lib', 'marketplace-bootstrap.js'),
      ...(this.cli.electron ? [
        join(this.staging, 'src', 'main.cjs'),
        join(this.staging, 'src', 'runtime-supervisor.cjs'),
        join(this.staging, 'assets'),
      ] : []),
      join(this.staging, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'package.json'),
      join(this.staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'package.json'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'lib', 'index.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'lib', 'client.js'),
      join(this.staging, 'node_modules', 'dsh-plugin-marketplace', 'cordis.patch.yml'),
      join(this.staging, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      join(this.staging, 'runtime-patch-attestations.json'),
      ...this.cli.target.nativeAssets.map(asset => this.stagedNativeAssetPath(asset)),
    ]
    if (!this.cli.noCache && cacheLayerMatches(this.cacheState.staging, this.stagingKey, required)) {
      console.log(`build-desktop-web-exe: staging cache hit (${this.stagingKey.slice(0, 12)})`)
      this.patchAttestations = JSON.parse(await readFile(join(this.staging, 'runtime-patch-attestations.json'), 'utf8')) as PatchAttestation[]
      await this.validateMarketplaceStaging()
      return
    }
    console.log(`build-desktop-web-exe: staging cache miss (${this.stagingKey.slice(0, 12)})`)
    await this.timed('prepare staging', async () => {
      await this.deployStaging()
      await this.stageDesktopShell()
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
   * source of record: every generated direct workspace dependency resolves there as a
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

  /** Overlay the dependency-free Electron lifecycle shell onto the runtime deploy root. */
  private async stageDesktopShell(): Promise<void> {
    if (!this.cli.electron) return
    const sourceDir = join(root, 'apps', 'desktop', 'src')
    const targetDir = join(this.staging, 'src')
    const files = [
      ...discoverDesktopVerificationFiles(sourceDir).runtimeSources,
      'release-notes.json',
      'splash.html',
      'apply-icon.mjs',
    ]
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] stage desktop shell (${files.length} source files + assets)`)
      return
    }
    await mkdir(targetDir, { recursive: true })
    await Promise.all(files.map(file => copyFile(join(sourceDir, file), join(targetDir, file))))
    await cp(join(root, 'apps', 'desktop', 'assets'), join(this.staging, 'assets'), {
      recursive: true,
      dereference: true,
    })
    console.log(`build-desktop-web-exe: staged thin desktop shell (${files.length} source files)`)
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

  /** Absolute output path declared by one target-native asset rule. */
  private stagedNativeAssetPath(asset: NativeAssetRule): string {
    return join(this.staging, 'node_modules', ...asset.package.split('/'), ...asset.source.split('/'))
  }

  /** Stage the native addons the web closure loads for the selected target. */
  async stageNativeAddons(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] stage native addons')
      if (this.cli.platform === 'linux') {
        console.log('build-desktop-web-exe: [dry-run] rebuild node-pty for the target Electron ABI')
      }
      return
    }
    const nativeTasks = this.cli.target.nativeAssets.flatMap(asset => {
      if (asset.strategy === 'copy-directory') {
        if (asset.storePrefix === undefined) throw new Error(`target ${this.cli.target.id} native asset ${asset.package} has no storePrefix`)
        return [this.ensureNativeDir(asset.storePrefix, asset.package, asset.source)]
      }
      if (asset.strategy === 'copy-file') {
        if (asset.storePrefix === undefined) throw new Error(`target ${this.cli.target.id} native asset ${asset.package} has no storePrefix`)
        return [this.ensureNativeFile(asset.storePrefix, asset.package, asset.source)]
      }
      return []
    })
    await Promise.all(nativeTasks)
    if (this.cli.target.nativeAssets.some(asset => asset.strategy === 'electron-rebuild' && asset.package === 'node-pty')) {
      // Linux has no published node-pty prebuild. A host-Node build has a
      // different module ABI from Electron, so always rebuild the deployed
      // source against the exact Electron version before pruning it.
      await this.rebuildLinuxNodePty()
    }
    if (this.cli.target.nativeAssets.some(asset => asset.strategy === 'generated-package' && asset.package === LINUX_LANDLOCK_PACKAGE)) {
      await this.stageLinuxLandlockLauncher()
    }
  }

  /** Rebuild Linux node-pty against Electron rather than the build host's Node ABI. */
  private async rebuildLinuxNodePty(): Promise<void> {
    const rebuildBin = join(
      root,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'electron-rebuild.CMD' : 'electron-rebuild',
    )
    const args = [
      '--version',
      electronVersion(),
      '--arch',
      this.cli.arch,
      '--module-dir',
      this.staging,
      '--only',
      'node-pty',
      '--force',
      '--build-from-source',
      '--sequential',
    ]
    if (existsSync(rebuildBin)) {
      await this.run('rebuild Linux node-pty for Electron', rebuildBin, args)
    } else {
      await this.run('rebuild Linux node-pty for Electron', pnpmBin(), ['exec', 'electron-rebuild', ...args])
    }
    const binary = join(this.staging, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node')
    if (!existsSync(binary)) {
      throw new Error(`build-desktop-web-exe: Electron node-pty rebuild did not produce ${binary}.`)
    }
    console.log(`build-desktop-web-exe: rebuilt Linux node-pty for Electron ${electronVersion()}`)
  }

  /**
   * Build the official Linux-only Landlock launcher before deployment. The
   * upstream package deliberately keeps bin/ out of git and refuses to
   * compile on consumer hosts, so a Linux desktop artifact must prepare it
   * on the native build runner.
   */
  private async prepareLinuxNativeLauncher(): Promise<void> {
    if (!this.cli.target.nativeAssets.some(asset => asset.strategy === 'generated-package' && asset.package === LINUX_LANDLOCK_PACKAGE)) return
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] build official Linux Landlock launcher')
      return
    }
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      throw new Error(
        'build-desktop-web-exe: Linux x64 packaging must run on a native Linux x64 host; '
        + `current host is ${process.platform}-${process.arch}.`,
      )
    }
    const binary = join(LINUX_LANDLOCK_SOURCE, 'bin', 'landlock-run')
    if (!existsSync(binary)) {
      await this.run('build Linux Landlock launcher', pnpmBin(), [
        '--dir',
        join(root, 'vendor', 'deepseek-harness', 'native', 'landlock-run'),
        'run',
        'build:native',
      ])
    }
    if (!existsSync(binary)) {
      throw new Error(`build-desktop-web-exe: upstream Landlock launcher is missing: ${binary}`)
    }
    await chmod(binary, 0o755)
  }

  /** Copy the generated upstream platform package into the deploy closure. */
  private async stageLinuxLandlockLauncher(): Promise<void> {
    const sourcePackage = LINUX_LANDLOCK_SOURCE
    const stagedPackage = join(this.staging, 'node_modules', LINUX_LANDLOCK_PACKAGE)
    const sourceBinary = join(sourcePackage, 'bin', 'landlock-run')
    const stagedBinary = join(stagedPackage, 'bin', 'landlock-run')
    if (!existsSync(sourceBinary)) {
      throw new Error(`build-desktop-web-exe: Linux Landlock launcher is missing: ${sourceBinary}`)
    }
    if (!existsSync(stagedPackage)) {
      if (this.cli.dryRun) {
        console.log(`build-desktop-web-exe: [dry-run] cp -r ${sourcePackage} ${stagedPackage}`)
      } else {
        await mkdir(dirname(stagedPackage), { recursive: true })
        await cp(sourcePackage, stagedPackage, { recursive: true, dereference: true })
      }
    }
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] cp ${sourceBinary} ${stagedBinary}`)
      return
    }
    await mkdir(dirname(stagedBinary), { recursive: true })
    await copyFile(sourceBinary, stagedBinary)
    await chmod(stagedBinary, 0o755)
    console.log(`build-desktop-web-exe: staged Linux Landlock launcher ${LINUX_LANDLOCK_PACKAGE}/bin/landlock-run`)
  }

  /** Apply the reviewed patch inventory with fail-closed guards and hashes. */
  async applyRuntimePatches(): Promise<void> {
    this.patchAttestations = await applyRuntimePatchLayer({
      root,
      staging: this.staging,
      targetId: this.cli.target.id,
      dryRun: this.cli.dryRun,
    })
    if (!this.cli.dryRun) {
      await writeFile(
        join(this.staging, 'runtime-patch-attestations.json'),
        `${JSON.stringify(this.patchAttestations, null, 2)}\n`,
      )
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
    const nodePtyPlatforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']
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
      { scope: '@img', pattern: /^(?:sharp|sharp-libvips)-(?:darwin|linux|win32)-/ },
      { scope: '@koromix', pattern: /^koffi-(?:darwin|linux|win32)-/ },
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
    const desktop = JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, 'utf8')) as {
      description?: unknown
      distributionVersion?: unknown
      productName?: unknown
      version?: unknown
    }
    const patch = this.cli.electron
      ? {
          main: 'src/main.cjs',
          description: desktop.description,
          distributionVersion: desktop.distributionVersion,
          productName: desktop.productName,
          version: desktop.version,
          dsh: { runtimeCapsule: DEPLOY_ROOT_PACKAGE, protocolVersion: 1 },
        }
      : { bin: ENTRY_BIN, pkg: { assets: ASSET_GLOBS } }
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
        : this.cli.platform === 'linux'
          ? join(this.electronOutDir, `${ELECTRON_APP_NAME}-linux-${this.cli.arch}`, 'runtime', ELECTRON_APP_NAME)
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
      if (this.cli.reuseUnpacked) {
        for (const path of required) {
          if (!existsSync(path)) throw new Error(`build-desktop-web-exe: reusable unpacked product is incomplete: ${path}`)
        }
        console.log(`build-desktop-web-exe: reusing unpacked Electron product: ${this.artifactRoot(product)}`)
      } else if (this.cli.electron) await this.packElectron()
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

  private artifactRoot(product: string): string {
    return this.cli.platform === 'darwin' ? product : dirname(dirname(product))
  }

  /** Write the same release identity schema into every unpacked target. */
  async writeReleaseManifest(product: string, evidence: PackagedRuntimeEvidence): Promise<void> {
    if (!this.cli.electron) return
    const resources = this.appResourcesDir(product)
    const kernelPackage = join(resources, 'node_modules', ...'@deepseek-ai/dsh-web-app'.split('/'), 'package.json')
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] write release manifest for ${this.cli.target.id}`)
      return
    }
    if (!existsSync(kernelPackage)) throw new Error(`build-desktop-web-exe: kernel package is missing: ${kernelPackage}`)
    const kernel = JSON.parse(readFileSync(kernelPackage, 'utf8')) as { version?: unknown }
    if (typeof kernel.version !== 'string') throw new Error(`build-desktop-web-exe: kernel version is missing from ${kernelPackage}`)
    const modeCatalogHash = await fingerprintPaths({
      baseDir: root,
      paths: ['apps/runtime/config/agent-presets', 'apps/interactive-learning/preset'],
      excludedDirectoryNames: FINGERPRINT_EXCLUDED_DIRECTORIES,
      salt: ['mode-catalog-v1'],
    })
    const source = resolveSourceIdentity(root)
    const files = await collectArtifactInventory(this.artifactRoot(product))
    const manifest = createReleaseManifest({
      distributionVersion: distributionVersion(),
      shellVersion: desktopVersion(),
      kernelVersion: kernel.version,
      source,
      target: this.cli.target,
      electronVersion: electronVersion(),
      nodeVersion: process.versions.node,
      runtimeClosureHash: (
        JSON.parse(readFileSync(join(root, 'apps', 'runtime', 'runtime-deps.generated.json'), 'utf8')) as {
          closureHash: string
        }
      ).closureHash,
      modeCatalogHash,
      measuredModeSupport: evidence.modeSupport,
      files,
      patches: this.patchAttestations,
    })
    const serialized = serializeReleaseManifest(manifest)
    const destinations = [join(resources, 'release-manifest.json')]
    if (this.cli.platform !== 'darwin') destinations.push(join(dirname(dirname(product)), 'release-manifest.json'))
    for (const destination of new Set(destinations)) {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, serialized)
      console.log(`build-desktop-web-exe: release manifest written: ${destination}`)
    }
  }

  /** Exercise native addons, then wait for a clean packaged Harness boot. */
  async smokeTestArtifact(product: string): Promise<PackagedRuntimeEvidence | undefined> {
    if (!this.cli.electron) return undefined
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] smoke-test packaged ${this.cli.target.id} runtime`)
      return undefined
    }
    await this.run('native-addon smoke', electronExecutable(product, this.cli.target), [
      join(root, 'smoke-native.cjs'),
      this.appResourcesDir(product),
    ], { ELECTRON_RUN_AS_NODE: '1' })
    const evidence = await runPackagedSmoke({
      product,
      appResources: this.appResourcesDir(product),
      target: this.cli.target,
      upstreamCommit: resolveSourceIdentity(root).upstreamCommit,
    })
    console.log(`build-desktop-web-exe: packaged smoke passed for ${this.cli.target.id}`)
    return evidence
  }

  /** Stage the immutable, native-host-verified packages consumed by release jobs. */
  async attestArtifacts(
    product: string,
    evidence: PackagedRuntimeEvidence,
    artifacts: readonly string[],
  ): Promise<string> {
    const verification = await writeArtifactVerification({
      target: this.cli.target,
      evidence,
      artifacts,
      manifestPath: join(this.appResourcesDir(product), 'release-manifest.json'),
      outputRoot: resolve(this.electronOutDir, 'verified'),
    })
    return verification.directory
  }

  /** Validate final containers read-only; no stage may modify them after this boundary. */
  async verifyPlatformContainers(artifacts: readonly string[]): Promise<void> {
    if (!this.cli.electron || this.cli.dryRun) return
    if (artifacts.length !== this.cli.target.formats.length) {
      throw new Error(`build-desktop-web-exe: ${this.cli.target.id} produced ${artifacts.length} containers for ${this.cli.target.formats.length} declared formats`)
    }
    if (this.cli.platform === 'win32') {
      const zip = artifacts.find(path => path.toLowerCase().endsWith('.zip'))
      const setup = artifacts.find(path => path.toLowerCase().endsWith('.exe'))
      if (zip === undefined || setup === undefined || statSync(setup).size === 0) {
        throw new Error('build-desktop-web-exe: Windows container verification requires a non-empty ZIP and Setup.exe')
      }
      const archiveRoot = `${ELECTRON_APP_NAME}-win32-${this.cli.arch}`
      const listing = spawnSync('tar.exe', [
        '-tf', zip,
        `${archiveRoot}/release-manifest.json`,
        `${archiveRoot}/runtime/DeepSeek Harness.exe`,
      ], { encoding: 'utf8', windowsHide: true })
      if (listing.status !== 0) {
        throw new Error(`build-desktop-web-exe: Windows ZIP verification failed: ${String(listing.stderr)}`)
      }
      return
    }
    if (this.cli.platform === 'linux') {
      const appImage = artifacts.find(path => path.toLowerCase().endsWith('.appimage'))
      const deb = artifacts.find(path => path.toLowerCase().endsWith('.deb'))
      if (appImage === undefined || deb === undefined) throw new Error('build-desktop-web-exe: Linux containers are incomplete')
      const readHeader = async (path: string, bytes: number): Promise<Buffer> => {
        const handle = await open(path, 'r')
        try {
          const buffer = Buffer.alloc(bytes)
          await handle.read(buffer, 0, bytes, 0)
          return buffer
        } finally {
          await handle.close()
        }
      }
      const [appImageHeader, debHeader] = await Promise.all([readHeader(appImage, 4), readHeader(deb, 8)])
      if (!appImageHeader.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || debHeader.toString('ascii') !== '!<arch>\n') {
        throw new Error('build-desktop-web-exe: Linux container magic validation failed')
      }
      await this.run('Debian package metadata verification', 'dpkg-deb', ['--info', deb])
      return
    }
    const dmg = artifacts.find(path => path.toLowerCase().endsWith('.dmg'))
    if (dmg === undefined) throw new Error('build-desktop-web-exe: macOS DMG is missing')
    await this.run('macOS DMG verification', 'hdiutil', ['verify', dmg])
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
    if (this.cli.platform === 'linux') return this.packElectronLinux()
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
      this.cli.target.electron.platform,
      '--arch',
      this.cli.arch,
      '--electron-version',
      electronVersion(),
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
      await renameWithTransientWindowsRetry(packagedRoot, join(nextPortableRoot, 'runtime'))
      let reusedLockedPortableRoot = false
      if (existsSync(portableRoot)) {
        try {
          await renameWithTransientWindowsRetry(portableRoot, previousPortableRoot)
        } catch (error) {
          const code = filesystemErrorCode(error)
          if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY')) throw error
          await moveDirectoryContents(portableRoot, previousPortableRoot)
          await moveDirectoryContents(nextPortableRoot, portableRoot)
          await rm(nextPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
          reusedLockedPortableRoot = true
          console.log('build-desktop-web-exe: reused a locked Windows output root and promoted its contents')
        }
      }
      if (!reusedLockedPortableRoot) {
        try {
          await renameWithTransientWindowsRetry(nextPortableRoot, portableRoot)
        } catch (error) {
          if (existsSync(previousPortableRoot) && !existsSync(portableRoot)) {
            await renameWithTransientWindowsRetry(previousPortableRoot, portableRoot)
          }
          throw error
        }
      }
      await rm(previousPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      console.log('build-desktop-web-exe: moved Electron runtime into place without a second tree copy')
    }
    return product
  }

  /** Package the staged runtime into an unpacked Linux Electron directory. */
  private async packElectronLinux(): Promise<string> {
    const target = `linux-${this.cli.arch}`
    const portableRoot = join(this.electronOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagerOutDir = join(this.electronOutDir, '.packager')
    const nextPortableRoot = join(this.electronOutDir, `.linux-next-${process.pid}`)
    const previousPortableRoot = join(this.electronOutDir, `.linux-previous-${process.pid}`)
    const packagedRoot = join(packagerOutDir, `${ELECTRON_APP_NAME}-${target}`)
    const packagedProduct = join(packagedRoot, ELECTRON_APP_NAME)
    const runtimeRoot = join(portableRoot, 'runtime')
    const product = join(runtimeRoot, ELECTRON_APP_NAME)
    const linuxIcon = await this.prepareLinuxIcon()

    if (!this.cli.dryRun) {
      await Promise.all([
        rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(nextPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
        rm(previousPortableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }),
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
    const packagerArgs = [
      this.staging,
      ELECTRON_APP_NAME,
      '--platform',
      this.cli.target.electron.platform,
      '--arch',
      this.cli.arch,
      '--electron-version',
      electronVersion(),
      '--out',
      packagerOutDir,
      '--overwrite',
      '--no-asar',
      '--no-prune',
    ]
    if (linuxIcon) packagerArgs.splice(8, 0, '--icon', linuxIcon)
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
        throw new Error(`build-desktop-web-exe: Linux Electron product ${packagedProduct} is missing after packaging.`)
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
      console.log('build-desktop-web-exe: moved Linux Electron runtime into place')
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
      this.cli.target.electron.platform,
      '--arch',
      this.cli.arch,
      '--electron-version',
      electronVersion(),
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

  /** Materialize the embedded logo as a Linux PNG for Electron and desktop entries. */
  private async prepareLinuxIcon(): Promise<string | undefined> {
    const output = join(this.staging, 'assets', 'deepseek.png')
    if (existsSync(output)) return output
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] materialize Linux icon ${output}`)
      return output
    }
    const source = await readFile(join(root, 'apps', 'desktop', 'src', 'desktop-preload.cjs'), 'utf8')
    const match = /const DEEPSEEK_LOGO_DATA_URI = 'data:image\/png;base64,([^']+)'/.exec(source)
    if (!match?.[1]) throw new Error('build-desktop-web-exe: embedded desktop logo is missing.')
    await mkdir(dirname(output), { recursive: true })
    // Electron-builder requires Linux icons to be at least 256x256. Keep the
    // renderer's embedded 64px logo as the source of truth, but upscale it at
    // build time so the package has a valid desktop icon without duplicating
    // a large base64 asset in the source tree.
    const { default: sharp } = await import('sharp')
    await sharp(Buffer.from(match[1], 'base64'))
      .resize(256, 256, { fit: 'contain', kernel: 'nearest' })
      .png()
      .toFile(output)
    console.log(`build-desktop-web-exe: staged Linux icon ${output}`)
    return output
  }

  private findIscc(): string | undefined {
    const candidates = [
      process.env.ISCC_PATH,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe') : undefined,
      'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
      'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    ].filter((candidate): candidate is string => Boolean(candidate))
    return candidates.find(candidate => existsSync(candidate))
  }

  /** Create both declared Windows containers from the already-smoked portable tree. */
  async createWindowsPackages(product: string): Promise<string[] | undefined> {
    if (!this.cli.electron || this.cli.platform !== 'win32') return undefined
    const portableRoot = this.artifactRoot(product)
    const artifactDir = resolve(this.electronOutDir, 'windows-artifacts')
    const version = distributionVersion()
    const zipName = `DeepSeek-Harness-${version}-win32-x64.zip`
    const zip = join(artifactDir, zipName)
    const setup = join(artifactDir, `DeepSeek-Harness-Setup-${version}-win32-x64.exe`)
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] create Windows ZIP and Inno Setup from ${portableRoot}`)
      return [zip, setup]
    }
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      throw new Error('build-desktop-web-exe: Windows containers require a native win32-x64 host')
    }
    const iscc = this.findIscc()
    if (iscc === undefined) throw new Error('build-desktop-web-exe: Inno Setup 6 is required to produce the declared inno-setup format (set ISCC_PATH)')
    await rm(artifactDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await mkdir(artifactDir, { recursive: true })
    await this.run('Windows portable ZIP packaging', 'tar.exe', [
      '-a', '-c', '-f', zip, '-C', dirname(portableRoot), portableRoot.slice(portableRoot.lastIndexOf(sep) + 1),
    ])
    await this.run('Windows Inno Setup packaging', iscc, [
      `/DMyAppVersion=${version}`,
      `/DMyZipName=${zipName}`,
      `/DMyReleaseDir=${artifactDir}`,
      `/DMyIconPath=${DESKTOP_ICON}`,
      join(root, 'scripts', 'setup.iss'),
    ])
    if (!existsSync(zip) || !existsSync(setup)) throw new Error('build-desktop-web-exe: Windows packaging did not produce both ZIP and Setup.exe')
    return [zip, setup]
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

  /** Build Linux AppImage and deb artifacts from the already-packaged app. */
  async createLinuxPackages(product: string): Promise<string[] | undefined> {
    if (!this.cli.electron || this.cli.platform !== 'linux') return undefined
    const artifactDir = resolve(this.electronOutDir, 'linux-artifacts')
    const appRoot = dirname(product)
    const version = distributionVersion()
    const appImage = join(artifactDir, `DeepSeek-Harness-${version}-linux-x64.AppImage`)
    const deb = join(artifactDir, `DeepSeek-Harness-${version}-linux-x64.deb`)
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] create Linux AppImage/deb from ${appRoot}`)
      return [appImage, deb]
    }

    const config = join(root, 'apps', 'desktop', 'electron-builder.yml')
    if (!existsSync(config)) throw new Error(`build-desktop-web-exe: Linux builder config is missing: ${config}`)
    await rm(artifactDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await mkdir(artifactDir, { recursive: true })

    const builderBin = join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.CMD' : 'electron-builder')
    const builderArgs = [
      '--prepackaged',
      appRoot,
      '--config',
      config,
      '--config.directories.output',
      artifactDir,
      '--config.extraMetadata.version',
      version,
      '--config.buildVersion',
      version,
      '--config.linux.icon',
      join(appRoot, 'resources', 'app', 'assets', 'deepseek.png'),
      '--linux',
      'AppImage',
      'deb',
      '--publish',
      'never',
    ]
    if (existsSync(builderBin)) {
      await this.run('Linux AppImage/deb packaging', builderBin, builderArgs)
    } else {
      await this.run('Linux AppImage/deb packaging', pnpmBin(), [
        '--filter',
        DEPLOY_ROOT_PACKAGE,
        'exec',
        'electron-builder',
        ...builderArgs,
      ])
    }

    const produced = await readdir(artifactDir)
    const appImageSource = produced
      .map(name => join(artifactDir, name))
      .find(path => path.toLowerCase().endsWith('.appimage'))
    const debSource = produced
      .map(name => join(artifactDir, name))
      .find(path => path.toLowerCase().endsWith('.deb'))
    if (!appImageSource || !debSource) {
      throw new Error(`build-desktop-web-exe: Linux packaging did not produce both AppImage and deb in ${artifactDir}.`)
    }
    if (appImageSource !== appImage) await rename(appImageSource, appImage)
    if (debSource !== deb) await rename(debSource, deb)
    await chmod(appImage, 0o755)
    console.log(`build-desktop-web-exe: created ${appImage} and ${deb}`)
    return [appImage, deb]
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
  printProduct(product: string, additional?: string | readonly string[]): void {
    console.log(this.cli.dryRun ? 'build-desktop-web-exe: [dry-run] would produce:' : 'build-desktop-web-exe: product:')
    if (this.cli.dryRun) {
      console.log(`  ${product}`)
      for (const path of additional === undefined ? [] : Array.isArray(additional) ? additional : [additional]) {
        console.log(`  ${path}`)
      }
      return
    }
    const productStat = statSync(product)
    if (productStat.isFile()) {
      const megabytes = productStat.size / (1024 * 1024)
      console.log(`  ${product}  (${megabytes.toFixed(1)} MB)`)
    } else {
      console.log(`  ${product}`)
    }
    for (const path of additional === undefined ? [] : Array.isArray(additional) ? additional : [additional]) {
      const additionalStat = statSync(path)
      const megabytes = additionalStat.isFile() ? additionalStat.size / (1024 * 1024) : 0
      console.log(`  ${path}${additionalStat.isFile() ? `  (${megabytes.toFixed(1)} MB)` : ''}`)
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

    if (this.cli.electron && this.cli.platform === 'linux') {
      const rootDir = dirname(dirname(product))
      const rootFiles = [
        'LICENSE',
        'THIRD_PARTY_NOTICES.md',
        'smoke-native.cjs',
        'apps/desktop/start-web.sh',
        'apps/desktop/start-desktop.sh',
        'apps/desktop/dsh.sh',
        'apps/desktop/portable-pnpm.sh',
      ]
      for (const relPath of rootFiles) {
        const source = join(root, relPath)
        if (!existsSync(source)) continue
        const outputName = relPath.includes('/') ? relPath.slice(relPath.lastIndexOf('/') + 1) : relPath
        const destination = join(rootDir, outputName)
        if (this.cli.dryRun) {
          console.log(`build-desktop-web-exe: [dry-run] cp ${source} ${destination}`)
        } else {
          await copyFile(source, destination)
          if (destination.endsWith('.sh')) await chmod(destination, 0o755)
          console.log(`build-desktop-web-exe: staged ${outputName} into ${rootDir}`)
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
  private async run(label: string, command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
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
        ...env,
      }
      const needsShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)
      const child = needsShell
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
  const state: {
    product?: string
    measured?: PackagedRuntimeEvidence
    verified?: PackagedRuntimeEvidence
    finalPackages: string[]
  } = { finalPackages: [] }
  const product = (): string => {
    if (state.product === undefined) throw new Error('unpacked product is not available before the package-unpacked stage')
    return state.product
  }
  console.log(`build-desktop-web-exe: staging: ${pipeline.staging}`)
  await runBuildStages(state, [
    { id: 'initialize-and-fingerprint', run: async () => pipeline.initialize() },
    { id: 'compile-workspaces', run: async () => pipeline.build() },
    { id: 'deploy-native-assets-and-patches', run: async () => pipeline.prepareStaging() },
    { id: 'package-unpacked', run: async current => { current.product = await pipeline.pack() } },
    { id: 'stage-distribution-docs', run: async () => pipeline.stageDistributionDocs(product()) },
    { id: 'measure-packaged-capabilities', run: async current => {
      current.measured = await pipeline.smokeTestArtifact(product())
    } },
    { id: 'manifest-and-final-byte-verification', run: async current => {
      if (current.measured === undefined) return
      await pipeline.writeReleaseManifest(product(), current.measured)
      current.verified = await pipeline.smokeTestArtifact(product())
      if (current.verified === undefined
        || current.verified.capabilityReport.snapshotHash !== current.measured.capabilityReport.snapshotHash
        || JSON.stringify(current.verified.modeSupport) !== JSON.stringify(current.measured.modeSupport)) {
        throw new Error('final-byte smoke evidence differs from the pre-manifest measurement')
      }
    } },
    { id: 'create-platform-containers', run: async current => {
      const windows = await pipeline.createWindowsPackages(product())
      const linux = await pipeline.createLinuxPackages(product())
      const dmg = await pipeline.createDmg(product())
      current.finalPackages = [...(windows ?? []), ...(linux ?? []), ...(dmg === undefined ? [] : [dmg])]
    } },
    { id: 'verify-platform-containers', run: async current => {
      await pipeline.verifyPlatformContainers(current.finalPackages)
    } },
    { id: 'attest-immutable-artifacts', run: async current => {
      if (current.verified === undefined || cli.dryRun) return
      const directory = await pipeline.attestArtifacts(product(), current.verified, current.finalPackages)
      console.log(`build-desktop-web-exe: verified artifact bundle: ${directory}`)
    } },
  ])
  pipeline.printProduct(product(), state.finalPackages)
  console.log(`build-desktop-web-exe: total ${((performance.now() - startedAt) / 1000).toFixed(2)}s`)
}

await main()
