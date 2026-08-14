/**
 * Build Windows distributions for the desktop web surface.
 *
 * The default route uses the fixed `@yao-pkg/pkg --sea` single-file
 * executable flow. The `--electron` route packages the same deployed
 * runtime behind the native Electron shell. Both routes use the
 * `dsh-desktop-web-pkg` closure, stage Windows-native addons, and apply the
 * checked-in application icon.
 *
 * Windows is a documented non-goal of the Python SDK distribution; this
 * script is the local/personal channel for portable Windows distributions of
 * the dsh web surface and is not part of the repository gates.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { patchWelcomeNoticeStore } from '../patches/dsh-client-ui-settings-models-welcome-store.js'

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
/** The checked-in Windows icon applied to the single-file executable. */
const DESKTOP_ICON = resolve(root, 'apps/desktop/assets/deepseek.ico')
/** The native shell's product name and packaged executable path. */
const ELECTRON_APP_NAME = 'DeepSeek Harness'
/** pkg base-binary download cache lives in the user profile; no repo state. */
const OUT_DIR = 'dist-exe'
/** The unpacked Electron app is the portable desktop distribution. */
const ELECTRON_OUT_DIR = 'dist-desktop/electron'
/** The cleared deploy target and pkg input. */
const STAGING_DIR = 'dist-desktop/node'
/** Legacy deploy may hoist direct workspace packages into the deploy source's own node_modules. */
const DEPLOY_SOURCE_NODE_MODULES = 'apps/desktop/node_modules'

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
    /** Remove ordinary TypeScript sources after the safe release pruning pass. */
    readonly pruneSources: boolean,
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
    return new BuildCli(values['skip-build'], values['dry-run'], values.electron, values['prune-sources'])
  }

  private static parseRaw(argv: string[]) {
    return parseArgs({
      args: argv,
      options: {
        'skip-build': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'electron': { type: 'boolean', default: false },
        'prune-sources': { type: 'boolean', default: false },
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
      '  --electron     build the native Windows Electron shell (portable folder).',
      '  --prune-sources remove ordinary .ts/.tsx source files after safe pruning; smoke-test the release before publishing.',
      '  --help         print this help.',
      '',
      `Default route: ${PKG_SPEC} --sea, target ${DEFAULT_NODE_RANGE}-win-x64; writes to ${OUT_DIR}/.`,
      `Electron route: ${ELECTRON_APP_NAME} win32-x64; writes to ${ELECTRON_OUT_DIR}/.`,
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

  constructor(private readonly cli: BuildCli) {}

  /** Build all package artifacts unless `--skip-build` was passed. */
  async build(): Promise<void> {
    if (this.cli.skipBuild) {
      console.log('build-desktop-web-exe: skipping pnpm run build (--skip-build)')
    } else {
      await this.run('build', pnpmBin(), ['run', 'build'])
    }
    // The desktop package is not in the host/client aggregate, so its entry
    // lib/ is built explicitly (its lib/types outputs stay out of the tree).
    await this.run('build desktop entry', pnpmBin(), ['--filter', DEPLOY_ROOT_PACKAGE, 'run', 'build'])
  }

  /** Clear and deploy the runtime closure into the staging directory. */
  async deployStaging(): Promise<void> {
    if (this.staging === root || root.startsWith(this.staging + sep)) {
      throw new Error(`build-desktop-web-exe: refusing to clear staging dir ${this.staging}: it contains the repo root.`)
    }
    if (this.cli.dryRun) console.log(`build-desktop-web-exe: [dry-run] rm -rf ${this.staging}`)
    else await rm(this.staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    await this.run('deploy', pnpmBin(), [
      '--filter',
      DEPLOY_ROOT_PACKAGE,
      'deploy',
      '--legacy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      // Native addons are staged explicitly from the host install; the
      // deploy-time install must not run node-gyp (and needs no scripts).
      '--config.ignore-scripts=true',
      this.staging,
    ])
    await this.restoreLegacyHoists()
    await this.materializeStagedLinks()
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
    let remaining = await this.findSymlink(nodeModules)
    while (remaining !== undefined) {
      const segments = remaining.slice(nodeModules.length + 1).split(sep)
      const binIndex = segments.lastIndexOf('.bin')
      if (binIndex >= 0) {
        await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
        remaining = await this.findSymlink(nodeModules)
        continue
      }
      const destination = remaining
      const source = await realpath(destination)
      const nestedNodeModules = join(source, 'node_modules')
      await rm(destination, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await cp(source, destination, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
      remaining = await this.findSymlink(nodeModules)
    }
  }

  /** Return the first symbolic link (or junction) below a directory, if one exists. */
  private async findSymlink(directory: string): Promise<string | undefined> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) return path
      if (metadata.isDirectory()) {
        const nested = await this.findSymlink(path)
        if (nested !== undefined) return nested
      }
    }
    return undefined
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

  /** Stage the native addons the web closure loads on Windows. */
  async stageNativeAddons(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] stage native addons')
      return
    }
    // node-pty 1.1.0 ships prebuilt win32 binaries in its tarball; the whole
    // win32-x64 prebuild dir (pty.node + conpty pieces) must be present.
    await this.ensureNativeDir('node-pty@', 'node-pty', 'prebuilds/win32-x64')
    // sharp: the attachment image processor; its lib dir carries the
    // platform DLLs and the versioned .node binary.
    await this.ensureNativeDir('@img+sharp-win32-x64@', '@img/sharp-win32-x64', 'lib')
    // koffi: the sandbox-windows-acl FFI addon, shipped as an optional
    // @koromix/koffi-<platform> package with the binary inside.
    await this.ensureNativeFile('@koromix+koffi-win32-x64@', '@koromix/koffi-win32-x64', 'win32_x64/koffi.node')
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
    if (this.cli.dryRun) {
      console.log(`build-desktop-web-exe: [dry-run] cp ${indexSource} ${indexTarget}`)
      console.log(`build-desktop-web-exe: [dry-run] patch ${workerTarget} IPC lifecycle`)
      return
    }
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
    if (!worker.includes(oldReadUtf16Comment) || !worker.includes(oldReadUtf16) || !worker.includes(oldPost)) {
      throw new Error('build-desktop-web-exe: directory-picker worker no longer matches the expected upstream IPC code.')
    }
    const patchedWorker = worker
      .replace(oldReadUtf16Comment, newReadUtf16Comment)
      .replace(oldReadUtf16, newReadUtf16)
      .replace(oldPost, newPost)
    await writeFile(workerTarget, patchedWorker)
    console.log('build-desktop-web-exe: applied Windows directory-picker runtime patches')

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
    const welcomePatched = patchWelcomeNoticeStore(welcomeSource)
    if (welcomePatched === welcomeSource) {
      throw new Error('build-desktop-web-exe: welcome-notice patch made no changes.')
    }
    await writeFile(welcomeTarget, welcomePatched)
    console.log('build-desktop-web-exe: applied welcome-notice retry runtime patch')
  }

  /** Remove files that are never loaded by the Windows runtime. */
  async pruneReleasePayload(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-desktop-web-exe: [dry-run] prune native extras, maps, and declarations')
      if (this.cli.pruneSources) console.log('build-desktop-web-exe: [dry-run] prune ordinary TypeScript sources')
      return
    }

    const nodePty = join(this.staging, 'node_modules', 'node-pty')
    for (const platform of ['darwin-arm64', 'darwin-x64', 'win32-arm64']) {
      await rm(join(nodePty, 'prebuilds', platform), { recursive: true, force: true })
    }
    const removedPdb = await this.removeStagedFiles((path) => path.startsWith(nodePty + sep) && path.toLowerCase().endsWith('.pdb'))
    const removedMaps = await this.removeStagedFiles((path) => path.toLowerCase().endsWith('.map'))
    const removedDeclarations = await this.removeStagedFiles((path) => path.toLowerCase().endsWith('.d.ts'))
    const rceditPath = join(this.staging, 'node_modules', 'rcedit')
    if (existsSync(rceditPath)) await rm(rceditPath, { recursive: true, force: true })
    const removedSources = this.cli.pruneSources
      ? await this.removeStagedFiles((path) => /\.(?:ts|tsx)$/i.test(path))
      : 0
    console.log(
      `build-desktop-web-exe: pruned ${removedPdb} PDB, ${removedMaps} map, ${removedDeclarations} declaration` +
      `${this.cli.pruneSources ? `, and ${removedSources} source` : ''} files`,
    )
  }

  private async removeStagedFiles(predicate: (path: string) => boolean): Promise<number> {
    let removed = 0
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(path)
        } else if (entry.isFile() && predicate(path)) {
          await rm(path, { force: true })
          removed += 1
        }
      }
    }
    await visit(this.staging)
    return removed
  }

  /** Keep only the locales shipped by the product's supported UI languages. */
  async pruneElectronLocales(product: string): Promise<void> {
    if (!this.cli.electron || this.cli.dryRun) return
    const localesDir = join(dirname(product), 'locales')
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
   * Package the win-x64 target; SEA mode accepts one target per invocation.
   * @returns the executable path.
   */
  async pack(): Promise<string> {
    if (this.cli.electron) return this.packElectron()
    const version = desktopVersion()
    const product = join(this.outDir, `${OUTPUT_BASENAME}-${version}-win-x64.exe`)
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
    return product
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

  /** Package the staged runtime into a portable root with a `runtime` child. */
  private async packElectron(): Promise<string> {
    const portableRoot = join(this.electronOutDir, `${ELECTRON_APP_NAME}-win32-x64`)
    const packagerOutDir = join(this.electronOutDir, '.packager')
    const packagedRoot = join(packagerOutDir, `${ELECTRON_APP_NAME}-win32-x64`)
    const packagedProduct = join(packagedRoot, `${ELECTRON_APP_NAME}.exe`)
    const runtimeRoot = join(portableRoot, 'runtime')
    const product = join(runtimeRoot, `${ELECTRON_APP_NAME}.exe`)
    if (!this.cli.dryRun) {
      await rm(portableRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      await mkdir(packagerOutDir, { recursive: true })
    }
    // electron-packager reads the Electron package's downloaded distribution
    // directly. If install scripts were skipped, that package can contain
    // only the npm wrapper and path metadata, which lets packager emit an exe
    // without the ICU, Chromium, and GPU runtime files beside it. Running the
    // wrapper first makes the missing distribution download itself and fails
    // before a partial portable directory can be presented as a product.
    await this.run('prepare Electron runtime', pnpmBin(), [
      '--filter',
      DEPLOY_ROOT_PACKAGE,
      'exec',
      'electron',
      '--version',
    ])
    await this.run(`Electron ${ELECTRON_APP_NAME} win32-x64`, pnpmBin(), [
      '--filter',
      DEPLOY_ROOT_PACKAGE,
      'exec',
      'electron-packager',
      this.staging,
      ELECTRON_APP_NAME,
      '--platform',
      'win32',
      '--arch',
      'x64',
      '--icon',
      DESKTOP_ICON,
      '--out',
      packagerOutDir,
      '--overwrite',
      '--no-asar',
      '--no-prune',
    ])
    if (!this.cli.dryRun) {
      if (!existsSync(packagedProduct)) {
        throw new Error(`build-desktop-web-exe: Electron product ${packagedProduct} is missing after packaging.`)
      }
      await mkdir(portableRoot, { recursive: true })
      await cp(packagedRoot, runtimeRoot, { recursive: true, dereference: true })
      await rm(packagerOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    }
    return product
  }

  /** Embed the same icon used by the Electron shell into the portable exe. */
 private async applyIcon(product: string): Promise<void> {
   if (!existsSync(DESKTOP_ICON)) {
     throw new Error(`build-desktop-web-exe: Windows icon is missing: ${DESKTOP_ICON}.`)
   }
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
  printProduct(product: string): void {
    console.log(this.cli.dryRun ? 'build-desktop-web-exe: [dry-run] would produce:' : 'build-desktop-web-exe: product:')
    if (this.cli.dryRun) {
      console.log(`  ${product}`)
      return
    }
    const megabytes = statSync(product).size / (1024 * 1024)
    console.log(`  ${product}  (${megabytes.toFixed(1)} MB)`)
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
      ? join(dirname(product), 'resources', 'app')
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

    if (this.cli.electron) {
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
        'uninstall.cmd',
        'uninstall.ps1',
        'apps/desktop/update.ps1',
        'apps/desktop/setup-shortcuts.ps1',
      ]
      for (const relPath of rootFiles) {
        const source = join(root, relPath)
        if (!existsSync(source)) continue
        const basename = relPath.includes('/') ? relPath.slice(relPath.lastIndexOf('/') + 1) : relPath
        const dest = join(rootDir, basename)
        if (this.cli.dryRun) {
          console.log(`build-desktop-web-exe: [dry-run] cp ${source} ${dest}`)
        } else {
          await copyFile(source, dest)
          console.log(`build-desktop-web-exe: staged ${basename} into ${dest}`)
        }
      }
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
      const child = process.platform === 'win32'
        ? spawn(printable, { cwd: root, stdio: 'inherit', env: { ...process.env, CI: 'true' }, shell: true })
        : spawn(command, args, {
          cwd: root,
          stdio: 'inherit',
          // Artifact builds must not mutate or validate a developer's Git hooks.
          env: { ...process.env, CI: 'true' },
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
  const cli = BuildCli.parse(process.argv.slice(2))
  const pipeline = new DesktopExeBuild(cli)
  console.log(`build-desktop-web-exe: staging: ${pipeline.staging}`)
  await pipeline.build()
  await pipeline.deployStaging()
  await pipeline.stageNativeAddons()
  await pipeline.applyRuntimePatches()
  await pipeline.pruneReleasePayload()
  await pipeline.injectPkgConfig()
  const product = await pipeline.pack()
  await pipeline.pruneElectronLocales(product)
  await pipeline.stageDistributionDocs(product)
  pipeline.printProduct(product)
}

await main()

