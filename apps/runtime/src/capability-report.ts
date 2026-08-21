import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import type { CapabilityReport, CapabilityResult } from './mode-resolver.js'
import {
  currentCapabilityCacheIdentity,
  readCapabilityReportCache,
  writeCapabilityReportCache,
} from './capability-report-cache.js'

const require = createRequire(import.meta.url)
const PROBE_TIMEOUT_MS = 8_000

interface PtyHandle {
  write(data: string): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

interface NodePty {
  spawn(file: string, args: string[], options: Record<string, unknown>): PtyHandle
}

export interface ProbeOutcome {
  readonly ok: boolean
  readonly provider?: string
  readonly version?: string
  readonly reason?: string
  readonly remediation?: string
  readonly limitations?: readonly string[]
}

export interface CapabilityProbeOverrides {
  readonly pty?: (file: string, args: string[]) => Promise<ProbeOutcome>
  readonly persistentShell?: (file: string, args: string[], dialect: 'bash' | 'powershell') => Promise<ProbeOutcome>
  readonly command?: (file: string, args: string[], expected?: string) => Promise<ProbeOutcome>
  readonly posixSignals?: () => Promise<ProbeOutcome>
  readonly sandboxWorkspaceWrite?: () => Promise<ProbeOutcome>
  readonly directoryPickerIpc?: () => Promise<ProbeOutcome>
}

export interface CapabilityReportOptions {
  readonly platform?: NodeJS.Platform
  readonly arch?: NodeJS.Architecture
  readonly overrides?: CapabilityProbeOverrides
  readonly cache?: false | {
    readonly path: string
    readonly refresh?: boolean
    readonly upstreamVersion?: string
    readonly probeImplementationHash?: string
    readonly maxAgeMs?: number
  }
}

function runtimeUpstreamVersion(): string {
  const fromEnvironment = process.env.DSH_UPSTREAM_COMMIT?.trim()
  if (fromEnvironment !== undefined && fromEnvironment !== '') return fromEnvironment
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    ...(resourcesPath === undefined ? [] : [join(resourcesPath, 'release-manifest.json')]),
    join(moduleDirectory, '..', 'release-manifest.json'),
    join(moduleDirectory, '..', '..', 'release-manifest.json'),
  ]
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(readFileSync(candidate, 'utf8')) as { source?: { upstreamCommit?: unknown } }
      if (typeof value.source?.upstreamCommit === 'string' && value.source.upstreamCommit !== '') {
        return value.source.upstreamCommit
      }
    } catch {}
  }
  return 'development'
}

function probeImplementationHash(): string {
  return createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')
}

function available(outcome: ProbeOutcome, fallbackProvider: string): CapabilityResult {
  if (outcome.ok) {
    return {
      state: outcome.limitations?.length ? 'degraded' : 'available',
      provider: outcome.provider ?? fallbackProvider,
      ...(outcome.version === undefined ? {} : { version: outcome.version }),
      ...(outcome.limitations === undefined ? {} : { limitations: outcome.limitations }),
    }
  }
  return {
    state: 'unavailable',
    reason: outcome.reason ?? `${fallbackProvider} failed its functional probe`,
    remediation: outcome.remediation ?? `Install or repair ${fallbackProvider}, then rerun the functional capability probe.`,
  }
}

function unavailable(
  reason: string,
  remediation = 'Run on a supported native platform or select a mode variant that does not require this capability.',
): CapabilityResult {
  return {
    state: 'unavailable',
    reason,
    remediation,
  }
}

async function loadNodePty(): Promise<NodePty> {
  const loaded = require('node-pty') as NodePty & { default?: NodePty }
  const nodePty = loaded.default ?? loaded
  if (typeof nodePty.spawn !== 'function') throw new Error('node-pty does not export spawn()')
  return nodePty
}

function waitForPtyText(handle: PtyHandle, marker: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      data.dispose()
      exit.dispose()
      if (error === undefined) resolvePromise()
      else reject(error)
    }
    const data = handle.onData(chunk => {
      output = `${output}${chunk}`.slice(-16_384)
      if (output.includes(marker)) finish()
    })
    const exit = handle.onExit(event => finish(new Error(
      `PTY exited before marker ${marker} (exit ${event.exitCode}, signal ${String(event.signal ?? 'none')}): ${output}`,
    )))
    const timeout = setTimeout(() => finish(new Error(`PTY timed out waiting for ${marker}: ${output}`)), timeoutMs)
  })
}

async function probePty(file: string, args: string[]): Promise<ProbeOutcome> {
  let handle: PtyHandle | undefined
  try {
    const nodePty = await loadNodePty()
    const marker = `__DSH_PTY_${randomUUID().replaceAll('-', '')}__`
    handle = nodePty.spawn(file, args, {
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
      cols: 80,
      rows: 24,
    })
    const waiting = waitForPtyText(handle, marker)
    if (process.platform === 'win32' && /cmd(?:\.exe)?$/i.test(file)) handle.write(`echo ${marker}\r`)
    else handle.write(`printf '${marker}\\n'\n`)
    await waiting
    return { ok: true, provider: `node-pty:${file}` }
  } catch (error) {
    return {
      ok: false,
      reason: `PTY command ${file} did not complete an interactive round trip: ${String(error)}`,
      remediation: 'Rebuild node-pty for the packaged Electron ABI and verify the selected shell executable.',
    }
  } finally {
    try { handle?.kill() } catch {}
  }
}

async function probePersistentShell(
  file: string,
  args: string[],
  dialect: 'bash' | 'powershell',
): Promise<ProbeOutcome> {
  let handle: PtyHandle | undefined
  try {
    const nodePty = await loadNodePty()
    const token = randomUUID().replaceAll('-', '')
    const first = `__DSH_PERSIST_ONE_${token}__`
    const second = `__DSH_PERSIST_TWO_${token}__`
    handle = nodePty.spawn(file, args, {
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
      cols: 80,
      rows: 24,
    })
    const firstWait = waitForPtyText(handle, first)
    handle.write(dialect === 'bash'
      ? `export DSH_CAPABILITY_TOKEN=${token}; printf '${first}\\n'\n`
      : `$env:DSH_CAPABILITY_TOKEN='${token}'; [Console]::Out.WriteLine('${first}')\r`)
    await firstWait
    const secondWait = waitForPtyText(handle, second)
    handle.write(dialect === 'bash'
      ? `[ \"$DSH_CAPABILITY_TOKEN\" = '${token}' ] && printf '${second}\\n'\n`
      : `if ($env:DSH_CAPABILITY_TOKEN -eq '${token}') { [Console]::Out.WriteLine('${second}') }\r`)
    await secondWait
    return { ok: true, provider: `node-pty:${file}:two-call-state` }
  } catch (error) {
    return {
      ok: false,
      reason: `persistent ${dialect} shell did not retain state across two PTY calls: ${String(error)}`,
      remediation: `Verify ${dialect} interactive startup and rebuild node-pty for the packaged Electron ABI.`,
    }
  } finally {
    try { handle?.kill() } catch {}
  }
}

async function probeCommand(file: string, args: string[], expected?: string): Promise<ProbeOutcome> {
  const result = spawnSync(file, args, {
    windowsHide: true,
    timeout: PROBE_TIMEOUT_MS,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WSL_UTF8: '1' },
  })
  if (result.error !== undefined || result.status !== 0) {
    return {
      ok: false,
      reason: `${file} failed (status ${String(result.status)}, error ${String(result.error ?? result.stderr).trim()})`,
    }
  }
  if (expected !== undefined && !String(result.stdout).includes(expected)) {
    return { ok: false, reason: `${file} completed but did not return the expected probe marker` }
  }
  return { ok: true, provider: file }
}

async function probePosixSignals(): Promise<ProbeOutcome> {
  return await new Promise(resolvePromise => {
    const marker = `DSH_SIGNAL_${randomUUID().replaceAll('-', '')}`
    const source = `process.on('SIGTERM',()=>{process.stdout.write('${marker}');process.exit(0)});process.stdout.write('READY');setInterval(()=>{},1000)`
    const child = spawn(process.execPath, ['-e', source], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    let signalled = false
    let settled = false
    const finish = (outcome: ProbeOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      resolvePromise(outcome)
    }
    child.stdout.on('data', chunk => {
      output += chunk.toString()
      if (!signalled && output.includes('READY')) {
        signalled = true
        child.kill('SIGTERM')
      }
      if (output.includes(marker)) finish({ ok: true, provider: 'node:SIGTERM-roundtrip' })
    })
    child.once('error', error => finish({ ok: false, reason: `signal probe failed to spawn: ${error.message}` }))
    child.once('exit', () => {
      if (!output.includes(marker)) finish({ ok: false, reason: `SIGTERM handler did not run: ${output}` })
    })
    const timeout = setTimeout(() => finish({ ok: false, reason: 'SIGTERM functional probe timed out' }), PROBE_TIMEOUT_MS)
  })
}

async function probeSandboxWorkspaceWrite(): Promise<ProbeOutcome> {
  // The Linux runners intentionally grant /tmp so confined commands can use
  // normal temporary files. Keep the negative-control file outside /tmp;
  // otherwise a successful write there would make a working sandbox look
  // like an escape.
  const root = await mkdtemp(join(homedir(), 'dsh-cap-sandbox-'))
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside.txt')
  const inside = join(workspace, 'inside.txt')
  const fs = await import('node:fs/promises')
  await fs.mkdir(workspace)
  const ctx = new Context()
  try {
    const provider = new LocalSandboxProvider(ctx, {
      runnerCommand: [],
      runnerFailureSignatures: [],
      probeTimeoutMs: PROBE_TIMEOUT_MS,
    })
    const script = [
      "const fs=require('node:fs')",
      "fs.writeFileSync(process.argv[1],'inside')",
      "try{fs.writeFileSync(process.argv[2],'outside');process.exit(23)}catch{}",
    ].join(';')
    const confined = provider.confine([process.execPath, '-e', script, inside, outside], {
      mode: 'workspace-write',
      workspaceRoot: workspace,
    })
    const result = spawnSync(confined.argv[0], confined.argv.slice(1), {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
    })
    const insideValue = existsSync(inside) ? await readFile(inside, 'utf8') : ''
    if (result.status !== 0 || insideValue !== 'inside' || existsSync(outside)) {
      return {
        ok: false,
        reason: `sandbox effect probe failed (status ${String(result.status)}; outsideWritable=${String(existsSync(outside))}; stderr=${String(result.stderr).trim()})`,
        remediation: 'Install or enable the platform sandbox backend and verify its packaged native launcher.',
      }
    }
    return {
      ok: true,
      provider: confined.argv[0],
      limitations: confined.enforcement === 'full' ? undefined : [`${confined.enforcement}-enforcement`],
    }
  } catch (error) {
    return {
      ok: false,
      reason: `workspace-write sandbox is unavailable: ${String(error)}`,
      remediation: 'Install or enable the platform sandbox backend and verify its packaged native launcher.',
    }
  } finally {
    await ctx.fiber.dispose().catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  }
}

async function probeDirectoryPickerIpc(): Promise<ProbeOutcome> {
  let manifest: string
  try {
    manifest = require.resolve('@deepseek-ai/dsh-host-directory-picker-native/package.json')
  } catch (error) {
    return {
      ok: false,
      reason: `native directory-picker package cannot be resolved: ${String(error)}`,
      remediation: 'Reinstall the packaged runtime dependency closure.',
    }
  }
  const worker = join(dirname(manifest), 'lib', 'worker.cjs')
  if (!existsSync(worker)) {
    return { ok: false, reason: `directory-picker IPC worker is missing: ${worker}`, remediation: 'Rebuild the runtime payload.' }
  }
  const source = readFileSync(worker, 'utf8')
  if (!source.includes('DSH_DIRECTORY_PICKER_IPC_PROBE')) {
    return {
      ok: false,
      reason: 'directory-picker worker does not expose the non-interactive IPC health contract',
      remediation: 'Rebuild the product so the reviewed directory-picker IPC patch is applied.',
    }
  }
  return await new Promise(resolvePromise => {
    const child = spawn(process.execPath, [worker], {
      env: {
        ...process.env,
        DSH_DIRECTORY_PICKER_IPC_PROBE: '1',
        DSH_DIALOG_TITLE: 'DeepSeek Harness capability probe',
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    })
    let settled = false
    let stderr = ''
    const finish = (outcome: ProbeOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (child.exitCode === null && child.signalCode === null) child.kill()
      resolvePromise(outcome)
    }
    child.stderr?.on('data', chunk => { stderr += chunk.toString() })
    child.on('message', message => {
      const record = message as { kind?: unknown; protocolVersion?: unknown }
      if (record.kind === 'probe' && record.protocolVersion === 1) {
        finish({ ok: true, provider: 'directory-picker-native/worker-ipc-v1' })
      }
    })
    child.once('error', error => finish({ ok: false, reason: `directory-picker worker failed to spawn: ${error.message}` }))
    child.once('exit', code => {
      if (!settled) finish({ ok: false, reason: `directory-picker worker exited before IPC reply (${String(code)}): ${stderr}` })
    })
    const timeout = setTimeout(() => finish({ ok: false, reason: 'directory-picker IPC round trip timed out' }), PROBE_TIMEOUT_MS)
  })
}

export function capabilitySnapshotHash(report: Pick<CapabilityReport, 'target' | 'capabilities'>): string {
  return createHash('sha256').update(JSON.stringify({
    target: report.target,
    capabilities: report.capabilities,
  })).digest('hex')
}

/** Run bounded, effect-based runtime capability probes. No platform receives support by declaration alone. */
export async function collectCapabilityReport(options: CapabilityReportOptions = {}): Promise<CapabilityReport> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const overrides = options.overrides ?? {}
  const defaultCachePath = process.env.DSH_HOME?.trim() === '' || process.env.DSH_HOME === undefined
    ? undefined
    : join(process.env.DSH_HOME, '.runtime-capabilities-cache.json')
  const cache = options.cache === false
    ? undefined
    : options.cache ?? (Object.keys(overrides).length === 0 && defaultCachePath !== undefined
      ? { path: defaultCachePath }
      : undefined)
  const cacheIdentity = currentCapabilityCacheIdentity(
    platform,
    arch,
    cache?.upstreamVersion ?? runtimeUpstreamVersion(),
    cache?.probeImplementationHash ?? probeImplementationHash(),
  )
  const forceRefresh = cache?.refresh === true || process.env.DSH_REFRESH_RUNTIME_CAPABILITIES === '1'
  if (cache !== undefined && !forceRefresh) {
    const cached = await readCapabilityReportCache(cache.path, cacheIdentity, cache.maxAgeMs)
    if (cached !== undefined) return cached
  }
  const command = overrides.command ?? probeCommand
  const pty = overrides.pty ?? probePty
  const persistentShell = overrides.persistentShell ?? probePersistentShell
  const posixSignals = overrides.posixSignals ?? probePosixSignals
  const sandboxWorkspaceWrite = overrides.sandboxWorkspaceWrite ?? probeSandboxWorkspaceWrite
  const directoryPickerIpc = overrides.directoryPickerIpc ?? probeDirectoryPickerIpc
  const capabilities: Record<string, CapabilityResult> = {}

  const sandbox = await sandboxWorkspaceWrite()
  capabilities['sandbox.workspace-write'] = available(sandbox, 'platform-sandbox')

  const powershellProgram = platform === 'win32' ? 'powershell.exe' : 'pwsh'
  const psExecutable = await command(powershellProgram, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'])
  capabilities['powershell.executable'] = available(psExecutable, powershellProgram)
  const psMarker = `DSH_POWERSHELL_${randomUUID().replaceAll('-', '')}`
  const psCommand = psExecutable.ok
    ? await command(powershellProgram, ['-NoProfile', '-NonInteractive', '-Command', `$v='${psMarker}';[Console]::Out.Write($v)`], psMarker)
    : psExecutable
  capabilities['powershell.command'] = available(psCommand, powershellProgram)
  const psPersistent = psCommand.ok
    ? await persistentShell(powershellProgram, ['-NoLogo', '-NoProfile'], 'powershell')
    : psCommand
  capabilities['powershell.persistent'] = available(psPersistent, `${powershellProgram}/node-pty:two-call-state`)
  capabilities['shell.powershell'] = capabilities['powershell.persistent']

  if (platform === 'win32') {
    const conpty = await pty('cmd.exe', ['/d', '/q'])
    capabilities['terminal.conpty'] = available(conpty, 'node-pty/conpty')

    const wslExecutable = await command('C:/Windows/System32/wsl.exe', ['--status'])
    capabilities['wsl.executable'] = available({
      ...wslExecutable,
      remediation: 'Enable the Windows Subsystem for Linux optional component and restart Windows.',
    }, 'wsl.exe')
    const distroMarker = `DSH_WSL_DISTRO_${randomUUID().replaceAll('-', '')}`
    const wslDistribution = wslExecutable.ok
      ? await command('C:/Windows/System32/wsl.exe', ['--', 'sh', '-c', `printf ${distroMarker}`], distroMarker)
      : wslExecutable
    capabilities['wsl.distribution'] = available({
      ...wslDistribution,
      remediation: 'Run `wsl --install`, finish distribution initialization, then restart DeepSeek Harness.',
    }, 'wsl.exe/default-distribution')
    const bashMarker = `DSH_WSL_BASH_${randomUUID().replaceAll('-', '')}`
    const wslBash = wslDistribution.ok
      ? await command('C:/Windows/System32/wsl.exe', ['--', 'bash', '--noprofile', '--norc', '-c', `printf ${bashMarker}`], bashMarker)
      : wslDistribution
    capabilities['wsl.bash'] = available({
      ...wslBash,
      remediation: 'Install Bash inside the default WSL distribution and verify `wsl -- bash -lc true`.',
    }, 'wsl.exe/bash')
    const wslPersistent = wslBash.ok
      ? await persistentShell('C:/Windows/System32/wsl.exe', ['--', 'bash', '--noprofile', '--norc', '-i'], 'bash')
      : wslBash
    capabilities['wsl.bash.persistent'] = available(wslPersistent, 'wsl.exe/bash/node-pty')
    capabilities['bridge.win32-wsl-terminal'] = conpty.ok && wslPersistent.ok
      ? { state: 'available', provider: 'desktop-runtime/wsl-terminal-bridge' }
      : unavailable(
        'the Win32-to-WSL terminal bridge cannot operate until ConPTY and persistent WSL Bash both pass',
        'Repair node-pty/ConPTY and the default WSL Bash distribution.',
      )
    capabilities['process.posix-signals'] = unavailable(
      'the Windows host cannot provide native POSIX process-group signals to WSL guests',
      'Use the documented Ctrl+C/process-tree emulation or run the POSIX variant on Linux/macOS.',
    )
    capabilities['native.directory-picker'] = available(await directoryPickerIpc(), 'directory-picker-native/worker-ipc-v1')
    capabilities['terminal.pty.native'] = unavailable('native POSIX PTY is not a Win32 capability')
    capabilities['shell.bash'] = unavailable('native /bin/bash is not available on Win32; WSL is a separate compatible variant')
    capabilities['shell.bash.persistent'] = unavailable('native persistent Bash is not available on Win32; WSL is a separate compatible variant')
  } else {
    const bashMarker = `DSH_BASH_${randomUUID().replaceAll('-', '')}`
    const bash = await command('/bin/bash', ['--noprofile', '--norc', '-c', `printf ${bashMarker}`], bashMarker)
    capabilities['shell.bash'] = available({
      ...bash,
      remediation: 'Install /bin/bash and verify that it can run without profile scripts.',
    }, '/bin/bash')
    const nativePty = bash.ok ? await pty('/bin/bash', ['--noprofile', '--norc', '-i']) : bash
    capabilities['terminal.pty.native'] = available(nativePty, 'node-pty/posix')
    const persistent = nativePty.ok && bash.ok
      ? await persistentShell('/bin/bash', ['--noprofile', '--norc', '-i'], 'bash')
      : { ok: false, reason: 'Bash or native PTY failed before the persistence probe' }
    capabilities['shell.bash.persistent'] = available(persistent, 'node-pty+/bin/bash:two-call-state')
    capabilities['process.posix-signals'] = available(await posixSignals(), 'node:SIGTERM-roundtrip')
    capabilities['terminal.conpty'] = unavailable('ConPTY is only available on Windows')
    capabilities['wsl.executable'] = unavailable('WSL is only available on Windows')
    capabilities['wsl.distribution'] = unavailable('WSL is only available on Windows')
    capabilities['wsl.bash'] = unavailable('WSL is only available on Windows')
    capabilities['wsl.bash.persistent'] = unavailable('WSL is only available on Windows')
    capabilities['bridge.win32-wsl-terminal'] = unavailable('the Win32-to-WSL bridge is only available on Windows')
    capabilities['native.directory-picker'] = unavailable(
      'a non-interactive native picker IPC round trip is not available on this platform',
      platform === 'linux'
        ? 'Install zenity or kdialog; the UI will use the native picker only after an interactive health check.'
        : 'Use the signed macOS application bundle so the interactive picker can be verified by the native UI lane.',
    )
  }

  const base = {
    target: { platform, arch },
    capabilities,
    generatedAt: new Date().toISOString(),
  }
  const report = { ...base, snapshotHash: capabilitySnapshotHash(base) }
  if (cache !== undefined) {
    await writeCapabilityReportCache(cache.path, cacheIdentity, report).catch(() => undefined)
  }
  return report
}
