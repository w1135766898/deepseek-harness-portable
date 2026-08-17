#!/usr/bin/env node
/**
 * Packaged boot entry for the desktop web build. It boots
 * the same `web` profile a source `dsh --profile web` invocation composes
 * (dsh-base + dsh-web-app bundle layers, the profile's own patch layer, the
 * `$DSH_HOME/cordis.patch.yml` layer, the agent-presets shipped root, and the
 * telemetry switch), with two packaged-runtime adaptations:
 *
 * - `DSH_HOME` defaults to `<exe-dir>/.dsh` so the exe is portable; an
 *   explicit `DSH_HOME` env var still wins.
 * - Real-filesystem runtimes resolve bare plugins from the profile first and
 *   heal its installation fallback, so profile-owned updates take effect.
 *   The legacy single-file runtime keeps resolving from its packaged VFS.
 *
 * After the tree settles, the local URL is polled and (unless `--no-open`)
 * opened in the default browser. All other flags pass through to the web
 * app's own flag family (`--host`, `--port`, `--trusted-host`, `--help`).
 *
 * @module @dsh-portable/runtime/packaged-bin
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  assertEntriesActivated,
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  mountRootInclude,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveProfileDir,
  type Profile,
  writeProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { dshHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { interactiveLearningPresetRoot } from '@dsh-portable/interactive-learning/preset'
import { collectCapabilityReport } from './capability-report.js'
import {
  compileModeCatalog,
  measuredModeSupport,
  type RuntimeModeCatalog,
  type RuntimeModeTrace,
} from './mode-catalog.js'
import { openBrowser } from './open-browser.js'
import {
  ensureMarketplacePreinstalled,
  materializeMarketplaceSeed,
  MARKETPLACE_PACKAGE,
  type MarketplaceBootstrapDiagnostic,
} from './marketplace-bootstrap.js'
import type { CapabilityReport } from './mode-resolver.js'
import { createProfileFirstPackageJsonResolver } from './profile-module-resolver.js'
import { composeAfterManagedFallback } from './profile-startup.js'
import { adaptWin32SubprocessRuntime } from './win32-terminal-inspector.js'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'portable-runtime/mode-resolution': RuntimeModeTrace
  }
}

/** Diagnostic prefix for every fail-loud and load error. */
const NAME = 'dsh-desktop'
/** The profile the exe boots, matching the shipped `web` template. */
const PROFILE_NAME = 'web'
/** The session-telemetry row id the DSH_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'
/** Shipped agent-preset sources: the portable catalog plus installable experience packs. */
const SHIPPED_PRESET_SOURCES = [
  { id: 'desktop', path: fileURLToPath(new URL('../config/agent-presets/', import.meta.url)) },
  { id: 'interactive-learning', path: interactiveLearningPresetRoot },
] as const
/** This package's manifest: the install anchor for bundle resolution inside the VFS. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))
/** Runtime packages used by the one-time marketplace profile bootstrap. */
const installationRequire = createRequire(INSTALL_ANCHOR)
const {
  RUNTIME_PROTOCOL_VERSION,
  encodeRuntimeEvent,
  protocolEnabled,
} = installationRequire('@dsh-portable/desktop-protocol') as {
  RUNTIME_PROTOCOL_VERSION: 1
  encodeRuntimeEvent(event: { protocolVersion: 1; type: 'hello'; pid: number } | {
    protocolVersion: 1
    type: 'listening'
    url: string
  } | {
    protocolVersion: 1
    type: 'diagnostic'
    code: string
    component: string
    severity: 'warning' | 'error'
    message: string
    recoverable: boolean
  }): string
  protocolEnabled(environment?: NodeJS.ProcessEnv): boolean
}
const PNPM_CLI_ENTRY = join(dirname(installationRequire.resolve('pnpm')), 'bin', 'pnpm.cjs')

function marketplaceSourceDir(): string | undefined {
  try {
    return dirname(installationRequire.resolve(`${MARKETPLACE_PACKAGE}/package.json`))
  } catch {
    return undefined
  }
}
/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in the profile's dsh.profile.bundles, then cordis.patch.yml, then any
# $DSH_HOME/cordis.patch.yml layer. Edit cordis.patch.yml, not this file.
[]
`
/** Root config filename inside a profile directory. */
const PROFILE_ROOT_FILENAME = 'cordis.yml'

/**
 * Copy a small packaged config tree to a real filesystem directory.
 * SEA VFS directory reads do not return Node Dirent instances, while preset
 * discovery needs ordinary filesystem directory behavior for its shipped root.
 * @param source - the packaged source path.
 * @param target - the writable runtime copy path.
 */
async function copyPackagedTree(source: string, target: string): Promise<void> {
  if ((await stat(source)).isDirectory()) {
    await mkdir(target, { recursive: true })
    for (const name of await readdir(source)) {
      await copyPackagedTree(join(source, name), join(target, name))
    }
    return
  }
  await writeFile(target, await readFile(source))
}

async function packagedTreeManifest(source: string, prefix = ''): Promise<string> {
  const entries: Array<{ path: string; size: number; sha256: string }> = []
  const visit = async (directory: string, relative: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const sourcePath = join(directory, name)
      const relativePath = relative === '' ? name : `${relative}/${name}`
      const metadata = await stat(sourcePath)
      if (metadata.isDirectory()) {
        await visit(sourcePath, relativePath)
      } else {
        const digest = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
        entries.push({ path: relativePath, size: metadata.size, sha256: digest })
      }
    }
  }
  await visit(source, prefix)
  return JSON.stringify(entries)
}

interface RuntimeCapabilityEvidence {
  readonly schemaVersion: 1
  readonly capabilityReport: CapabilityReport
  readonly modeCatalog: RuntimeModeCatalog
  readonly modeSupport: Record<string, Record<string, unknown>>
}

interface MaterializedPresetState extends RuntimeCapabilityEvidence {
  readonly root: string
}

async function resolveUpstreamCommit(): Promise<string> {
  const fromEnvironment = process.env.DSH_UPSTREAM_COMMIT?.trim()
  if (fromEnvironment !== undefined && /^[0-9a-f]{7,40}$/iu.test(fromEnvironment)) return fromEnvironment
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const candidates = [
    ...(resourcesPath === undefined ? [] : [join(resourcesPath, 'release-manifest.json')]),
    join(dirname(INSTALL_ANCHOR), 'release-manifest.json'),
    join(dirname(dirname(INSTALL_ANCHOR)), 'release-manifest.json'),
  ]
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(candidate, 'utf8')) as { source?: { upstreamCommit?: unknown } }
      const commit = manifest.source?.upstreamCommit
      if (typeof commit === 'string' && /^[0-9a-f]{7,40}$/iu.test(commit)) return commit
    } catch {}
  }
  return 'unknown'
}

/** Materialize shipped presets, omitting unavailable modes from discovery and retaining their diagnostics. */
async function materializeShippedPresetRoot(): Promise<MaterializedPresetState> {
  const target = join(resolveDshHome(), '.system-agent-presets')
  for (const source of SHIPPED_PRESET_SOURCES) {
    if (resolve(source.path) === resolve(target)) {
      throw new Error(`${NAME}: shipped preset source and writable materialization target must differ`)
    }
  }
  const manifestPath = join(target, '.manifest.json')
  const evidencePath = join(target, '.runtime-capabilities.json')
  const report = await collectCapabilityReport()
  const upstreamCommit = await resolveUpstreamCommit()
  const sourceTrees = await Promise.all(SHIPPED_PRESET_SOURCES.map(async source => ({
    id: source.id,
    path: source.path,
    entries: JSON.parse(await packagedTreeManifest(source.path)) as Array<{ path: string }>,
  })))
  const owners = new Map<string, string>()
  for (const source of sourceTrees) {
    for (const entry of source.entries) {
      const owner = owners.get(entry.path)
      if (owner !== undefined) {
        throw new Error(`${NAME}: shipped preset file ${entry.path} is owned by both ${owner} and ${source.id}`)
      }
      owners.set(entry.path, source.id)
    }
  }
  const manifest = JSON.stringify({
    sources: sourceTrees.map(source => ({ id: source.id, entries: source.entries })),
    target: report.target,
    capabilities: report.capabilities,
    capabilitySnapshotHash: report.snapshotHash,
    upstreamCommit,
  })
  try {
    if ((await readFile(manifestPath, 'utf8')) === manifest) {
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as RuntimeCapabilityEvidence
      if (evidence.schemaVersion === 1) return { root: target, ...evidence }
    }
  } catch {}
  await rm(target, { recursive: true, force: true })
  for (const source of sourceTrees) await copyPackagedTree(source.path, target)
  const modeCatalog = await compileModeCatalog(target, report, upstreamCommit)
  const evidence: RuntimeCapabilityEvidence = {
    schemaVersion: 1,
    capabilityReport: report,
    modeCatalog,
    modeSupport: measuredModeSupport(modeCatalog),
  }
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  await writeFile(manifestPath, manifest)
  return { root: target, ...evidence }
}

// Portable home: the exe's own directory unless the user opted into a
// specific home. When running via global node/electron runtime, fallback to user home directory.
if (process.env.DSH_HOME === undefined || process.env.DSH_HOME.trim() === '') {
  const isGlobalRuntime = /node(\.exe)?$/i.test(process.execPath) || /electron(\.exe)?$/i.test(process.execPath)
  if (isGlobalRuntime) {
    const userDir = process.env.USERPROFILE || process.env.HOME || process.env.LOCALAPPDATA || '.'
    process.env.DSH_HOME = join(userDir, '.dsh')
  } else {
    process.env.DSH_HOME = join(dirname(process.execPath), '.dsh')
  }
}

/**
 * Resolve the telemetry opt-out switch into its boot patch, mirroring the
 * source launcher's `resolveTelemetryPatch`: ANY non-empty value disables.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value.
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/** The web profile's own user patch layer inside the portable home. */
function homePatchPath(): string {
  return join(resolveDshHome(), PROFILE_PATCH_FILENAME)
}

/**
 * Compose the web profile's effective patch stack: bundle layers in order,
 * the profile's user layer, the home-level user layer, the agent-presets
 * shipped-root overlay, then the telemetry switch.
 * @returns the profile, its bundle layers, and the composed row index.
 */
function composeProfile(shippedPresetRoot: string): {
  profile: Profile
  bundlePatches: PatchOptions[]
  homePatches: PatchOptions[]
  overlays: PatchOptions[]
  marketplaceDiagnostic?: MarketplaceBootstrapDiagnostic
} {
  const profileDir = resolveProfileDir(PROFILE_NAME)
  initProfile(profileDir, PROFILE_TEMPLATES[PROFILE_NAME] ?? [])
  const bundledMarketplace = marketplaceSourceDir()
  const marketplaceSeed = materializeMarketplaceSeed({
    homeDir: resolveDshHome(),
    bundledSourceDir: bundledMarketplace,
  })
  const marketplace = ensureMarketplacePreinstalled({
    profileDir,
    sourceDir: marketplaceSeed.sourceDir,
    legacySourceDirs: bundledMarketplace === undefined ? [] : [bundledMarketplace],
    install: (sourceSpec, enabled) => {
        const child = spawnSync(process.execPath, [
          PNPM_CLI_ENTRY,
          'add',
          '-w',
          sourceSpec,
        ], {
          cwd: profileDir,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
          },
          stdio: 'inherit',
          windowsHide: true,
        })
        if (child.error !== undefined) {
          console.error(`${NAME}: failed to start the embedded marketplace installer: ${child.error.message}`)
          return 1
        }
        const exitCode = child.status ?? 1
        if (exitCode !== 0) return exitCode
        try {
          // The public `dsh plugin` command performs this same reconciliation
          // after pnpm exits. Run pnpm directly here because its Windows shell
          // forwarder cannot preserve a file path containing spaces.
          const manifest = readProfileManifest(NAME, profileDir)
          const bundles = manifest.dsh?.profile?.bundles ?? []
          const nextBundles = enabled
            ? bundles.includes(MARKETPLACE_PACKAGE) ? bundles : [...bundles, MARKETPLACE_PACKAGE]
            : bundles.filter(bundle => bundle !== MARKETPLACE_PACKAGE)
          if (nextBundles.length !== bundles.length || nextBundles.some((bundle, index) => bundle !== bundles[index])) {
            manifest.dsh = {
              ...manifest.dsh,
              profile: {
                ...manifest.dsh?.profile,
                bundles: nextBundles,
              },
            }
            writeProfileManifest(profileDir, manifest)
          }
        } catch (cause) {
          console.error(`${NAME}: failed to enable the preinstalled marketplace: ${cause instanceof Error ? cause.message : String(cause)}`)
          return 1
        }
        return 0
    },
  })
  if (marketplace.diagnostic !== undefined) {
    const reason = marketplace.error ?? marketplaceSeed.error ?? 'unknown error'
    console.error(`${NAME}: ${marketplace.diagnostic.message}; ${reason}`)
  } else if (marketplace.status === 'installed' || marketplace.status === 'repaired') {
    console.log(`${NAME}: ${marketplace.status === 'installed' ? 'preinstalled' : 'repaired'} ${MARKETPLACE_PACKAGE} in the web profile`)
  }
  const profile = loadProfile(NAME, PROFILE_NAME, INSTALL_ANCHOR)
  const homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? []
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const rows = new Map<string, { config?: unknown }>()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const overlays: PatchOptions[] = []
  // The SHIPPED preset root is the part of the roster only this package can
  // resolve: it sits beside the packaged entry in the VFS, and the writable
  // root the roster appends is dsh-agent-presets' own default.
  if (rows.has('agent-presets')) {
    overlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}) as Record<string, unknown>,
        roots: [{ path: shippedPresetRoot, trust: 'system' }],
      },
    })
  }
  if (!rows.has('vision-bridge')) {
    overlays.push({
      insert: [
        {
          id: 'vision-bridge',
          name: '@dsh-portable/vision-bridge',
        },
      ],
    })
  }
  if (!rows.has('interactive-learning')) {
    overlays.push({
      insert: [
        {
          id: 'interactive-learning',
          name: '@dsh-portable/interactive-learning',
        },
      ],
    })
  }
  const telemetryPatch = resolveTelemetryPatch(process.env.DSH_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) overlays.push(telemetryPatch)
  return {
    profile,
    bundlePatches,
    homePatches,
    overlays,
    ...(marketplace.diagnostic === undefined ? {} : { marketplaceDiagnostic: marketplace.diagnostic }),
  }
}

/** Whether an argv string belongs to the launcher's own flag family. */
function isLauncherFlag(arg: string): arg is '--no-open' | '--open' {
  return arg === '--no-open' || arg === '--open'
}

/** The browser shell cannot activate until these graph entries exist. */
const REQUIRED_CLIENT_ENTRIES = [
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-layout',
]

/**
 * Check the boot graph embedded in the exact index document that the browser
 * will consume. Follow declared inject edges so a partially scanned roster is
 * not mistaken for a ready client surface.
 */
function hasRequiredClientGraph(html: string): boolean {
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (match === null) return false
  let manifest: { entries?: Array<{ id?: string; inject?: string[] }> }
  try {
    manifest = JSON.parse(match[1]) as { entries?: Array<{ id?: string; inject?: string[] }> }
  } catch {
    return false
  }
  if (!Array.isArray(manifest.entries)) return false
  const rows = new Map(manifest.entries
    .filter(row => row !== null && typeof row === 'object' && typeof row.id === 'string')
    .map(row => [row.id as string, row]))
  const pending = [...REQUIRED_CLIENT_ENTRIES]
  const seen = new Set<string>()
  while (pending.length > 0) {
    const id = pending.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const row = rows.get(id)
    if (row === undefined) return false
    if (Array.isArray(row.inject)) pending.push(...row.inject)
  }
  return true
}

/**
 * Repair the client-module roster after the host loader has settled.
 *
 * Repoint client-module metadata resolution at the writable profile first and
 * the packaged app second, clear its negative cache, and re-run the existing
 * reconciliation pass after the loader barrier. Downloaded client plugins and
 * their host bundle therefore resolve from the same profile-owned version.
 */
function refreshClientModuleGraph(ctx: Context, profileDir: string): void {
  const registry = ctx.get('clientModules') as unknown as {
    processOne?: (entryName: string) => boolean
    compose?: () => unknown
    notifyGraphChanged?: () => void
    composed?: unknown
    pkgMeta?: Map<string, unknown>
    resolvePkgJson?: (packageName: string) => string
  } | undefined
  const loader = ctx.get('loader') as unknown as {
    entries?: () => Iterable<{ options?: { name?: string } }>
  } | undefined
  if (registry?.processOne === undefined || registry.compose === undefined || loader?.entries === undefined) return

  registry.resolvePkgJson = createProfileFirstPackageJsonResolver(profileDir, INSTALL_ANCHOR)
  registry.pkgMeta?.clear()

  const names = new Set<string>()
  for (const entry of loader.entries()) {
    const name = entry.options?.name
    if (typeof name === 'string') names.add(name)
  }
  let changed = false
  for (const name of names) {
    if (registry.processOne.call(registry, name)) changed = true
  }
  if (!changed) return
  registry.composed = registry.compose.call(registry)
  registry.notifyGraphChanged?.call(registry)
}

/**
 * Poll the local web URL until the server answers, then open it in the
 * default browser. Bounded, non-fatal: a server that never answers only
 * prints a hint, and the open failure never kills the server.
 * @param ctx - the settled boot context (webStartup may carry host/port).
 */
async function openBrowserWhenReady(ctx: Context): Promise<void> {
  const startup = ctx.get('webStartup') as { host?: string; port?: number } | undefined
  const host = startup?.host ?? '127.0.0.1'
  const port = startup?.port ?? 3080
  const url = `http://${host}:${port}/`
  const deadline = Date.now() + 20_000
  let lastReason = 'settings.describe has not completed'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        lastReason = `web index HTTP ${response.status}`
      } else if (!hasRequiredClientGraph(await response.text())) {
        lastReason = 'client plugin graph is not populated'
      } else {
        const apiResponse = await fetch(`${url}api/settings.describe`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `web-readiness-${Date.now()}`,
            method: 'settings.describe',
            payload: {},
          }),
          signal: AbortSignal.timeout(Math.min(1500, Math.max(1, deadline - Date.now()))),
        })
        if (!apiResponse.ok) {
          lastReason = `settings.describe HTTP ${apiResponse.status}`
        } else {
          const body = await apiResponse.json() as {
            result?: { ok?: boolean; error?: { message?: string }; value?: { namespaces?: Array<{ ns?: string }> } }
          }
          if (body.result?.ok && body.result.value?.namespaces?.some(namespace => namespace.ns === 'ui-onboarding')) {
            openBrowser(url)
            return
          }
          lastReason = body.result?.error?.message ?? 'ui-onboarding namespace is not registered'
        }
      }
    } catch {
      // Server, client graph, or api-gateway not up yet; keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  console.error(`${NAME}: host onboarding readiness timed out at ${url}: ${lastReason}; open the URL manually.`)
}

function installRuntimeEvidenceSurface(ctx: Context, state: MaterializedPresetState): void {
  const responseBody = `${JSON.stringify({
    schemaVersion: 1,
    capabilityReport: state.capabilityReport,
    modeCatalog: state.modeCatalog,
    modeSupport: state.modeSupport,
  })}\n`
  const webServer = ctx.get('webServer') as {
    register(route: {
      kind: 'exact'
      path: string
      handler(req: { method?: string }, res: {
        writeHead(status: number, headers?: Record<string, string>): void
        end(body?: string): void
      }): void
    }): () => void
  } | undefined
  if (webServer !== undefined) {
    const dispose = webServer.register({
      kind: 'exact',
      path: '/api/portable/runtime-capabilities',
      handler: (req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' })
          res.end()
          return
        }
        res.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(responseBody)
      },
    })
    ctx.effect(() => dispose, 'portable-runtime.capability-api')
  }

  type RuntimeAgent = {
    ctx: Context
    session: {
      header: { agentPreset?: string }
      events: Array<{ type: string; data: unknown }>
      append(type: 'portable-runtime/mode-resolution', data: RuntimeModeTrace): unknown
    }
  }
  const appendTrace = (agent: RuntimeAgent, requestedPreset?: string): void => {
    const presets = ctx.get('agentPresets') as { composedPreset(agentCtx: Context): string | undefined } | undefined
    const presetId = requestedPreset ?? presets?.composedPreset(agent.ctx) ?? agent.session.header.agentPreset
    if (presetId === undefined) return
    const trace = state.modeCatalog.modes[presetId]?.trace
    if (trace === undefined) return
    let previous: RuntimeModeTrace | undefined
    for (let index = agent.session.events.length - 1; index >= 0; index -= 1) {
      const event = agent.session.events[index]
      if (event?.type !== 'portable-runtime/mode-resolution') continue
      previous = event.data as RuntimeModeTrace
      break
    }
    if (previous?.variantId === trace.variantId
      && previous.presetHash === trace.presetHash
      && previous.upstreamCommit === trace.upstreamCommit
      && previous.capabilitySnapshotHash === trace.capabilitySnapshotHash) return
    agent.session.append('portable-runtime/mode-resolution', trace)
  }

  const events = ctx as unknown as {
    on(name: 'agent/created', listener: (payload: { agent: RuntimeAgent }) => void): void
    on(name: 'agent-preset/selected', listener: (sessionId: string, presetId: string) => void): void
    agents: { get(sessionId: string): RuntimeAgent | undefined }
  }
  events.on('agent/created', ({ agent }) => { appendTrace(agent) })
  events.on('agent-preset/selected', (sessionId, presetId) => {
    const agent = events.agents.get(sessionId)
    if (agent !== undefined) appendTrace(agent, presetId)
  })
}

/**
 * Boot the web profile end to end and own process lifetime: signals and the
 * web app's bounded exit request dispose the tree, then exit.
 */
async function main(): Promise<void> {
  const shellProtocol = protocolEnabled(process.env)
  if (shellProtocol) {
    console.log(encodeRuntimeEvent({
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      type: 'hello',
      pid: process.pid,
    }))
  }
  const args = process.argv.slice(2)
  // `cmd.exe` keeps `%*` unchanged after SHIFT. Accept the explicit `web`
  // alias here so `dsh.cmd web ...` forwards an arbitrary number of flags
  // without reconstructing or re-quoting them in batch syntax.
  if (args[0]?.toLowerCase() === 'web') args.shift()
  let openBrowser = true
  const webArgs: string[] = []
  for (const arg of args) {
    if (arg === '--no-open') openBrowser = false
    else if (isLauncherFlag(arg)) openBrowser = true
    else webArgs.push(arg)
  }

  // Repair the shared, installation-owned module fallback before loadProfile
  // resolves any bundle. Old releases left absolute junctions pointing into
  // their removed runtime; waiting until after composition makes the first
  // process fail even though a later launch can see repaired links. The web
  // profile's own node_modules remains first in resolution order, so external
  // user-selected plugins are never replaced by this managed fallback heal.
  const virtualRuntime = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg)
  const presetState = await materializeShippedPresetRoot()
  const composed = composeAfterManagedFallback({
    virtualRuntime,
    installAnchor: INSTALL_ANCHOR,
    heal: healProfilesModuleFallback,
    compose: () => composeProfile(presetState.root),
  })
  if (shellProtocol && composed.marketplaceDiagnostic !== undefined) {
    console.log(encodeRuntimeEvent({
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      type: 'diagnostic',
      ...composed.marketplaceDiagnostic,
    }))
  }
  const app: { current?: Context } = {}
  const shutdown = (() => {
    let exiting = false
    return async (code: number): Promise<void> => {
      if (exiting) return
      exiting = true
      try {
        await app.current?.fiber.dispose()
      } finally {
        process.exit(code)
      }
    }
  })()
  process.on('SIGTERM', () => { void shutdown(0) })
  process.on('SIGINT', () => { void shutdown(130) })
  installFailLoud(NAME, process, async () => {
    await app.current?.fiber.dispose()
  })

  // The root config file exists on disk only because the Loader needs a real
  // include root to anchor baseUrl at the profile directory; it is rewritten
  // on every boot so a plugin self-dispose can never bake composed rows in.
  const rootConfig = join(composed.profile.dir, PROFILE_ROOT_FILENAME)
  await writeFile(rootConfig, PROFILE_ROOT_CONFIG)

  // Electron and ordinary Node runtimes use the profile as the first package
  // anchor, then its healed profiles/node_modules installation fallback. The
  // single-file VFS cannot be the target of real filesystem junctions.
  const bareModuleBaseUrl = pathToFileURL(
    virtualRuntime ? join(dirname(INSTALL_ANCHOR), 'node_modules') : composed.profile.dir,
  ).href + '/'

  // The Loader tree captures `baseUrl` at construction, so app-boot's `boot()`
  // cannot point runtime-created bare-name entries (e.g. the
  // directory-picker child rows) at the packaged install: it sets ctx.baseUrl
  // to the config directory before the Loader is created. Replicate the boot
  // sequence with the Loader's own `baseUrl` config instead; the root Include
  // still anchors relative config specifiers to the profile directory, and
  // bare config specifiers go through HostResolvedRootInclude's override.
  const prepare = (hostCtx: Context): void => {
    app.current = hostCtx
    // Before any config-tree entry mounts, so plugins resolve all launch-time
    // environment values from the same immutable provenance snapshot.
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME) satisfies LaunchEnvironmentSnapshot)
    // The command line and bounded exit request are launcher facts available
    // to every app plugin that injects the argument snapshot.
    provideCmdline(hostCtx, {
      args: webArgs,
      exit: code => void shutdown(code),
    })
    if (process.platform === 'win32') {
      hostCtx.inject(['subprocess'], (scopeCtx: Context) => {
        adaptWin32SubprocessRuntime(scopeCtx.get('subprocess'))
      })
    }
  }
  let ctx = new Context()
  try {
    ctx.baseUrl = pathToFileURL(dirname(rootConfig)).href + '/'
    ctx.provide('dshHomePath', dshHomePath)
    await ctx.plugin(Loader, { baseUrl: bareModuleBaseUrl })
    prepare(ctx)
    await mountRootInclude(ctx, rootConfig, structuredClone([
      ...composed.bundlePatches,
      ...composed.profile.patches,
      ...composed.homePatches,
      ...composed.overlays,
    ]), bareModuleBaseUrl)
    await ctx.get('loader')?.await()
    if (ctx.get('loader') !== undefined) await assertEntriesActivated(ctx, NAME)
    if (process.platform === 'win32') {
      adaptWin32SubprocessRuntime(ctx.get('subprocess'))
    }
    installRuntimeEvidenceSurface(ctx, presetState)
    refreshClientModuleGraph(ctx, composed.profile.dir)
    if (shellProtocol) {
      const port = (ctx.get('webServer') as { port?: number } | undefined)?.port
      if (!Number.isSafeInteger(port) || (port as number) <= 0) {
        throw new Error(`${NAME}: runtime protocol cannot publish an invalid Web server port`)
      }
      console.log(encodeRuntimeEvent({
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        type: 'listening',
        url: `http://127.0.0.1:${String(port)}/`,
      }))
    }
  } catch (cause) {
    await ctx.fiber.dispose()
    throw cause
  }
 app.current = ctx

  // Packaged VFS paths are read-only and are not valid HMR watch roots.
  // User patch layers are loaded at startup; restart the distribution after
  // editing them.

 if (openBrowser) void openBrowserWhenReady(ctx)
}

await main()
