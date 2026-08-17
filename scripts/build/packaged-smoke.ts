import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MeasuredModeSupport, TargetSpec } from '../../packages/platform-contract/src/index.js'

const require = createRequire(import.meta.url)
const { waitForOnboardingReady } = require('../../apps/desktop/src/ready-url.cjs') as {
  waitForOnboardingReady(baseUrl: string, options?: { timeoutMs?: number; intervalMs?: number }): Promise<void>
}
const {
  createRuntimeEventDecoder,
  protocolEnvironment,
  runtimeLaunchArguments,
} = require('../../packages/desktop-protocol/src/index.cjs') as {
  createRuntimeEventDecoder(onEvent: (event: { type: string; url?: string; pid?: number }) => void): {
    push(chunk: string | Buffer): void
    end(): void
  }
  protocolEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
  runtimeLaunchArguments(options?: { host?: string; port?: number; open?: boolean }): string[]
}

export class RuntimeHandshake {
  private helloPid: number | undefined
  private listening = false

  accept(event: { type: string; url?: string; pid?: number }, expectedPid: number | undefined): string | undefined {
    if (event.type === 'hello') {
      if (this.helloPid !== undefined) throw new Error('runtime emitted duplicate hello')
      if (event.pid === undefined || expectedPid === undefined || event.pid !== expectedPid) {
        throw new Error(`runtime hello pid ${String(event.pid)} does not match child pid ${String(expectedPid)}`)
      }
      this.helloPid = event.pid
      return undefined
    }
    if (event.type === 'listening') {
      if (this.helloPid === undefined) throw new Error('runtime emitted listening before hello')
      if (this.listening) throw new Error('runtime emitted duplicate listening')
      if (event.url === undefined) throw new Error('runtime listening event has no URL')
      this.listening = true
      return event.url
    }
    if (event.type === 'diagnostic') {
      if (this.helloPid === undefined) throw new Error('runtime emitted diagnostic before hello')
      return undefined
    }
    throw new Error(`unsupported runtime handshake event ${event.type}`)
  }
}

export function electronExecutable(product: string, target: TargetSpec): string {
  return target.platform === 'darwin'
    ? join(product, 'Contents', 'MacOS', 'DeepSeek Harness')
    : product
}

export interface PackagedSmokeOptions {
  readonly product: string
  readonly appResources: string
  readonly target: TargetSpec
  readonly timeoutMs?: number
  readonly upstreamCommit: string
}

export interface PackagedRuntimeEvidence {
  readonly schemaVersion: 1
  readonly capabilityReport: {
    readonly target: { readonly platform: string; readonly arch: string }
    readonly snapshotHash: string
  }
  readonly modeCatalog: {
    readonly target: { readonly platform: string; readonly arch: string }
    readonly capabilitySnapshotHash: string
  }
  readonly modeSupport: Readonly<Record<string, MeasuredModeSupport>>
}

/** Managed UI links that old Windows installations commonly leave dangling. */
export const STALE_MANAGED_FALLBACK_PACKAGES = [
  '@deepseek-ai/dsh-client-ui-subagent',
  '@deepseek-ai/dsh-client-ui-jobs',
  '@deepseek-ai/dsh-client-ui-goal',
  '@deepseek-ai/dsh-client-ui-message-feedback',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-permission-presets',
  '@deepseek-ai/dsh-client-ui-agent-preset',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-plan',
  '@deepseek-ai/dsh-client-ui-user-questions',
] as const

/** Stage the exact stale managed-fallback shape an upgrade must heal on its first process. */
export async function stageStaleManagedFallback(home: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  for (const packageName of STALE_MANAGED_FALLBACK_PACKAGES) {
    const link = join(home, 'profiles', 'node_modules', packageName)
    const staleTarget = join(home, '.removed-previous-runtime', 'node_modules', packageName)
    await mkdir(dirname(link), { recursive: true })
    await symlink(staleTarget, link, platform === 'win32' ? 'junction' : 'dir')
  }
}

function validateEvidence(value: unknown, target: TargetSpec): PackagedRuntimeEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('runtime evidence must be an object')
  const evidence = value as Partial<PackagedRuntimeEvidence>
  const reportTarget = evidence.capabilityReport?.target
  const catalogTarget = evidence.modeCatalog?.target
  if (evidence.schemaVersion !== 1
    || `${reportTarget?.platform}-${reportTarget?.arch}` !== target.id
    || `${catalogTarget?.platform}-${catalogTarget?.arch}` !== target.id) {
    throw new Error(`runtime evidence target mismatch; expected ${target.id}`)
  }
  if (!/^[a-f0-9]{64}$/.test(evidence.capabilityReport.snapshotHash)
    || evidence.modeCatalog.capabilitySnapshotHash !== evidence.capabilityReport.snapshotHash) {
    throw new Error('runtime evidence capability snapshot is missing or inconsistent')
  }
  if (typeof evidence.modeSupport !== 'object' || evidence.modeSupport === null) {
    throw new Error('runtime evidence is missing measured mode support')
  }
  return evidence as PackagedRuntimeEvidence
}

/** Launch the final packaged runtime and wait for the same readiness gate as the desktop shell. */
export async function runPackagedSmoke(options: PackagedSmokeOptions): Promise<PackagedRuntimeEvidence> {
  const timeoutMs = options.timeoutMs ?? 90_000
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))
  const dshHome = join(temporaryRoot, '.dsh')
  await stageStaleManagedFallback(dshHome)
  const executable = electronExecutable(options.product, options.target)
  const entry = join(options.appResources, 'lib', 'packaged-bin.js')
  let output = ''
  let readiness: Promise<void> | undefined
  let settled = false
  let timeout: NodeJS.Timeout | undefined
  const handshake = new RuntimeHandshake()

  const child = spawn(executable, [entry, ...runtimeLaunchArguments()], {
    cwd: temporaryRoot,
    env: protocolEnvironment({
      ...process.env,
      CI: 'true',
      DSH_CWD: temporaryRoot,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_UPSTREAM_COMMIT: options.upstreamCommit,
      ELECTRON_RUN_AS_NODE: '1',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const completion = new Promise<void>((resolvePromise, reject) => {
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      if (error === undefined) resolvePromise()
      else reject(error)
    }
    const decoder = createRuntimeEventDecoder(event => {
      try {
        const url = handshake.accept(event, child.pid)
        if (url === undefined) return
        if (readiness !== undefined) throw new Error('runtime readiness was already started')
        readiness = waitForOnboardingReady(url, { timeoutMs: Math.max(1, timeoutMs - 2_000) })
        readiness.then(() => finish(), cause => finish(new Error(
          `packaged Harness failed readiness at ${url}: ${cause instanceof Error ? cause.message : String(cause)}\n${output}`,
        )))
      } catch (cause) {
        finish(new Error(`packaged Harness violated the hello-to-listening protocol: ${String(cause)}\n${output}`))
      }
    })
    const onOutput = (chunk: Buffer | string): void => {
      output = `${output}${chunk.toString()}`.slice(-65_536)
    }
    const onProtocolOutput = (chunk: Buffer | string): void => {
      onOutput(chunk)
      try {
        decoder.push(chunk)
      } catch (cause) {
        finish(new Error(`packaged Harness emitted an invalid runtime protocol event: ${String(cause)}\n${output}`))
      }
    }
    // Runtime protocol events are stdout-only. Keep stderr diagnostics in the
    // captured log without allowing independent stream chunks to corrupt a line.
    child.stdout.on('data', onProtocolOutput)
    child.stderr.on('data', onOutput)
    child.once('error', error => finish(new Error(`packaged Harness failed to spawn: ${error.message}`)))
    child.once('exit', (code, signal) => {
      try { decoder.end() } catch {}
      if (!settled) finish(new Error(
        `packaged Harness exited before readiness (${code === null ? signal ?? 'signal' : `exit ${code}`}):\n${output}`,
      ))
    })
    timeout = setTimeout(() => finish(new Error(`packaged Harness readiness timed out after ${timeoutMs}ms:\n${output}`)), timeoutMs)
    timeout.unref()
  })

  try {
    await completion
    // Read through every previously dangling link. Reaching readiness is not
    // enough if a partial graph happened to avoid one of the stale packages.
    for (const packageName of STALE_MANAGED_FALLBACK_PACKAGES) {
      await readFile(join(dshHome, 'profiles', 'node_modules', packageName, 'package.json'), 'utf8')
    }
    const evidencePath = join(dshHome, '.system-agent-presets', '.runtime-capabilities.json')
    return validateEvidence(JSON.parse(await readFile(evidencePath, 'utf8')) as unknown, options.target)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([
        new Promise<void>(resolvePromise => child.once('close', () => resolvePromise())),
        new Promise<void>(resolvePromise => setTimeout(resolvePromise, 5_000)),
      ])
    }
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}
