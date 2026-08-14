#!/usr/bin/env node
/**
 * Packaged boot entry for the portable Windows desktop web build. It boots
 * the same `web` profile a source `dsh --profile web` invocation composes
 * (dsh-base + dsh-web-app bundle layers, the profile's own patch layer, the
 * `$DSH_HOME/cordis.patch.yml` layer, the agent-presets shipped root, and the
 * telemetry switch), with two packaged-runtime adaptations:
 *
 * - `DSH_HOME` defaults to `<exe-dir>/.dsh` so the exe is portable; an
 *   explicit `DSH_HOME` env var still wins.
 * - `boot()` receives the packaged install's `node_modules` as
 *   `bareModuleBaseUrl`, so bare plugin specifiers resolve from the VFS
 *   instead of from the on-disk profile directory, and the
 *   profiles/node_modules symlink fallback is deliberately not healed
 *   (its targets live inside the pkg VFS and cannot be junctioned from disk).
 *
 * After the tree settles, the local URL is polled and (unless `--no-open`)
 * opened in the default browser. All other flags pass through to the web
 * app's own flag family (`--host`, `--port`, `--trusted-host`, `--help`).
 *
 * @module dsh-desktop-web-pkg/packaged-bin
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import {
  assertEntriesActivated,
  composeEntries,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  mountRootInclude,
  PROFILE_PATCH_FILENAME,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { dshHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'

/** Diagnostic prefix for every fail-loud and load error. */
const NAME = 'dsh-desktop'
/** The profile the exe boots, matching the shipped `web` template. */
const PROFILE_NAME = 'web'
/** The session-telemetry row id the DSH_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'
/** Shipped agent-preset source: beside this package's own config, possibly in the pkg VFS. */
const SHIPPED_PRESET_SOURCE = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))
/** This package's manifest: the install anchor for bundle resolution inside the VFS. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))
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

/**
 * Materialize shipped presets before the host exposes preset discovery.
 * @returns a real filesystem root that preserves the shipped-root contract.
 */
async function materializeShippedPresetRoot(): Promise<string> {
  const target = join(resolveDshHome(), '.system-agent-presets')
  if (resolve(SHIPPED_PRESET_SOURCE) === resolve(target)) return SHIPPED_PRESET_SOURCE
  const manifestPath = join(target, '.manifest.json')
  const manifest = await packagedTreeManifest(SHIPPED_PRESET_SOURCE)
  try {
    if ((await readFile(manifestPath, 'utf8')) === manifest) return target
  } catch {}
  await rm(target, { recursive: true, force: true })
  await copyPackagedTree(SHIPPED_PRESET_SOURCE, target)
  await writeFile(manifestPath, manifest)
  return target
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
} {
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
  const telemetryPatch = resolveTelemetryPatch(process.env.DSH_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) overlays.push(telemetryPatch)
  return { profile, bundlePatches, homePatches, overlays }
}

/** Whether an argv string belongs to the launcher's own flag family. */
function isLauncherFlag(arg: string): arg is '--no-open' | '--open' {
  return arg === '--no-open' || arg === '--open'
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
      if (response.ok) {
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
            spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
            return
          }
          lastReason = body.result?.error?.message ?? 'ui-onboarding namespace is not registered'
        }
      }
    } catch {
      // Server or api-gateway not up yet; keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  console.error(`${NAME}: host onboarding readiness timed out at ${url}: ${lastReason}; open the URL manually.`)
}

/**
 * Boot the web profile end to end and own process lifetime: signals and the
 * web app's bounded exit request dispose the tree, then exit.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let openBrowser = true
  const webArgs: string[] = []
  for (const arg of args) {
    if (arg === '--no-open') openBrowser = false
    else if (isLauncherFlag(arg)) openBrowser = true
    else webArgs.push(arg)
  }

  const shippedPresetRoot = await materializeShippedPresetRoot()
  const composed = composeProfile(shippedPresetRoot)
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

 // Bare specifiers resolve from the packaged install's node_modules inside
  // the pkg VFS; relative specifiers keep resolving from the profile dir.
  const bareModuleBaseUrl = pathToFileURL(join(dirname(INSTALL_ANCHOR), 'node_modules') + '/').href

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
