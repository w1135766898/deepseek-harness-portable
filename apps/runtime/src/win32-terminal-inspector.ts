/**
 * Win32 ProcessInspector stub for local PTY terminals (e.g. running wsl.exe).
 *
 * Upstream `dsh-subprocess-local` throws on win32 because POSIX process inspection
 * (/proc/pid/stat or ps -axo) is not supported natively on Windows.
 * This stub provides safe fallbacks:
 * - `processTree(rootPid)` returns `[]`: a fabricated root identity would make
 *   `LocalTerminalHandle.forceStopShell` take its (no-op) signal branch and skip
 *   the node-pty kill fallback during host exit.
 * - `foregroundPgid(shellPid)` returns `shellPid` so that `signalForeground` does not throw and destroy the session.
 * - `isStdinWaiting()` returns `false` (terminal readiness safely falls back to prompt-marker and silence detection).
 * - `signalGroup` and `signalProcess` are safe no-ops.
 *
 * It also wraps `spawnTerminal` on win32 to:
 * - advertise the terminal environment to the WSL session through `WSLENV`
 *   (WSL shares only PATH and WSLENV-listed names into Linux);
 * - catch WSL launch failures (spawn throws, or wsl.exe exiting before the
 *   shell reaches readiness — e.g. no distribution installed) and provide
 *   actionable instructions for the user;
 * - deliver `SIGINT` to the WSL foreground group as a Ctrl+C byte, since the
 *   stub cannot signal Linux process groups from Windows.
 *
 * @module @dsh-portable/runtime/win32-terminal-inspector
 */

import type { Readable } from 'node:stream'
import { execFile } from 'node:child_process'
import type {
  SubprocessOutcome,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
} from '@deepseek-ai/dsh-subprocess'

export interface ProcessIdentity {
  pid: number
  started: string
}

export interface ProcessInspector {
  foregroundPgid(shellPid: number): number | undefined
  isStdinWaiting(pgid: number): boolean
  processTree(rootPid: number): ProcessIdentity[]
  processSession(sessionId: number): ProcessIdentity[]
  isAlive(identity: ProcessIdentity): boolean
  signalGroup(pgid: number, signal: SubprocessTerminalSignal): void
  signalProcess(identity: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL'): void
}

export class Win32TerminalProcessInspector implements ProcessInspector {
  foregroundPgid(shellPid: number): number | undefined {
    // Return shellPid so signalForeground does not throw and destroy the persistent PTY session.
    return shellPid
  }

  isStdinWaiting(_pgid: number): boolean {
    // Settle path relies on prompt-marker and silence/timeout readiness detection.
    return false
  }

  processTree(_rootPid: number): ProcessIdentity[] {
    // No Windows process table and no visibility into the WSL VM: report no
    // members. A fabricated root identity would make
    // LocalTerminalHandle.forceStopShell take its (no-op) signal branch and
    // skip the node-pty kill fallback during host exit.
    return []
  }

  processSession(_sessionId: number): ProcessIdentity[] {
    return []
  }

  isAlive(_identity: ProcessIdentity): boolean {
    return false
  }

  signalGroup(_pgid: number, _signal: SubprocessTerminalSignal): void {
    // No-op on Win32; signals to WSL are not directly routed via Win32 process.kill.
  }

  signalProcess(_identity: ProcessIdentity, _signal: 'SIGTERM' | 'SIGKILL'): void {
    // No-op on Win32.
  }
}

export function createWin32TerminalInspector(): ProcessInspector {
  return new Win32TerminalProcessInspector()
}

interface SubprocessRuntimeWithTerminal {
  terminalInspector?: ProcessInspector
  spawnTerminal?: (spec: { argv?: string[]; env?: Record<string, string> }) => Promise<unknown>
}

/** Names the minimal preset sets on wsl.exe that WSL only shares through WSLENV. */
const WSL_SHARED_ENV = [
  'PROMPT_COMMAND',
  'PAGER',
  'GIT_PAGER',
  'TERM',
  'BASH_SILENCE_DEPRECATION_WARNING',
  'DSH_SHELL',
  'DSH_SESSION_ID',
  'DSH_PTY_SESSION_ID',
] as const

/** Bilingual guidance appended to translated WSL launch failures. */
const WSL_LAUNCH_GUIDANCE = [
  '[WSL 运行环境缺失] 极简模式需要 WSL (Linux Bash) 运行环境。',
  '请在 PowerShell 中执行 "wsl --install" 安装 Linux 发行版，或在会话设置中切换至【标准模式 (PowerShell)】。',
  'Please ensure WSL is installed via "wsl --install", or switch to the Standard preset (PowerShell).',
].join('\n')

function wslLaunchError(detail: string, cause?: unknown): Error {
  return new Error(`Failed to start WSL Linux terminal (${detail}).\n${WSL_LAUNCH_GUIDANCE}`, { cause })
}

/**
 * WSL shares only PATH and the WSLENV-listed names into the Linux session, so
 * the terminal backend's child environment (PAGER/TERM/PROMPT_COMMAND/…) must
 * be advertised there or bash never sees it. PS1 is deliberately absent: WSL
 * filters it even when listed. The parent's own WSLENV entries are preserved;
 * duplicates collapse by name.
 * @returns a WSLENV value merging the parent's entries with the shared list.
 */
function mergedWslenv(): string {
  const parent = process.env.WSLENV
    ?? Object.entries(process.env).find(([key]) => key.toUpperCase() === 'WSLENV')?.[1]
    ?? ''
  const seen = new Set<string>()
  const parts: string[] = []
  const push = (part: string): void => {
    const name = part.split('/')[0] as string
    if (part !== '' && !seen.has(name)) {
      seen.add(name)
      parts.push(part)
    }
  }
  for (const part of parent.split(':')) push(part)
  for (const name of WSL_SHARED_ENV) push(name)
  return parts.join(':')
}

/**
 * Window during which a freshly spawned WSL session may still prove to be a
 * launch failure. wsl.exe with no installed (or no default) distribution
 * prints an error and exits with 0xFFFFFFFF within this window; a healthy
 * session survives it by orders of magnitude, so the added startup latency is
 * bounded by this one-time constant.
 */
const WSL_EARLY_EXIT_GRACE_MS = 1_000
const WSL_TERMINATION_GRACE_MS = 5_000

export type WslProcessTreeTerminator = (pid: number) => Promise<void>

/** Force-stop only the Windows process tree rooted at this terminal's wsl.exe. */
function terminateWslProcessTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'taskkill.exe',
      ['/PID', String(pid), '/T', '/F'],
      { windowsHide: true },
      (error) => error === null ? resolve() : reject(error),
    )
  })
}

async function terminalExited(done: Promise<SubprocessOutcome>, graceMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      done.then(() => true, () => true),
      new Promise<false>(resolve => { timer = setTimeout(resolve, graceMs, false) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Detect a WSL launch failure that does not throw at spawn: wsl.exe starts,
 * prints its error, and exits before the shell reaches readiness.
 * @param handle - the allocated terminal handle.
 * @returns the early exit outcome, or undefined when the session survived the grace window.
 */
async function wslEarlyExit(handle: SubprocessTerminalHandle): Promise<SubprocessOutcome | undefined> {
  try {
    const outcome = await Promise.race([
      handle.done,
      new Promise<undefined>(resolve => setTimeout(resolve, WSL_EARLY_EXIT_GRACE_MS)),
    ])
    if (outcome === undefined || outcome.exitCode === 0 || outcome.exitCode === null) return undefined
    return outcome
  } catch {
    // A transport failure is not a WSL launch failure; the caller's own
    // lifecycle surfaces it.
    return undefined
  }
}

/**
 * Win32 WSL terminal handle: delivers `SIGINT` to the WSL foreground group as
 * a Ctrl+C byte. The Win32 stub cannot signal Linux process groups from
 * Windows (they live inside the WSL VM); the terminal's ISIG handling
 * interrupts the foreground job when the byte reaches the PTY, which is how a
 * real console sends Ctrl+C.
 */
class Win32WslTerminalHandle implements SubprocessTerminalHandle {
  private termination: Promise<void> | undefined

  constructor(
    private readonly inner: SubprocessTerminalHandle,
    private readonly terminateProcessTree: WslProcessTreeTerminator,
    private readonly terminationGraceMs: number,
  ) {}

  get pid(): number {
    return this.inner.pid
  }

  get output(): Readable {
    return this.inner.output
  }

  get done(): Promise<SubprocessOutcome> {
    return this.inner.done
  }

  write(data: string): Promise<void> {
    return this.inner.write(data)
  }

  inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    return this.inner.inspectForeground()
  }

  async signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    if (signal === 'SIGINT') {
      try {
        await this.inner.write('\x03')
      } catch {
        // A concurrent close can end the session between inspection and write.
      }
    }
    return this.inner.signalForeground(signal)
  }

  terminate(): Promise<void> {
    this.termination ??= this.terminateOnce()
    return this.termination
  }

  private async terminateOnce(): Promise<void> {
    let treeError: unknown
    try {
      await this.terminateProcessTree(this.inner.pid)
    } catch (error) {
      treeError = error
    }

    await terminalExited(this.inner.done, this.terminationGraceMs)
    try {
      // Even after taskkill, delegate so LocalTerminalHandle can dispose its
      // node-pty transport and settle internal lifecycle state.
      await this.inner.terminate()
    } catch (error) {
      const treeDetail = treeError === undefined
        ? ''
        : `; taskkill failed: ${treeError instanceof Error ? treeError.message : String(treeError)}`
      throw new Error(`WSL terminal cleanup failed${treeDetail}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }

    // A taskkill race is harmless when node-pty's own termination succeeded;
    // the delegated cleanup above is authoritative.
  }
}

export interface Win32SubprocessRuntimeOptions {
  terminateProcessTree?: WslProcessTreeTerminator
  terminationGraceMs?: number
}

/**
 * Configure a subprocess runtime for Windows: attach the Win32 inspector stub
 * and wrap spawnTerminal to translate WSL launch errors into actionable
 * guidance, share the terminal environment through WSLENV, and route SIGINT
 * to the WSL session as a Ctrl+C byte.
 */
export function adaptWin32SubprocessRuntime(runtime: unknown, options: Win32SubprocessRuntimeOptions = {}): void {
  if (runtime === null || typeof runtime !== 'object') return
  const target = runtime as SubprocessRuntimeWithTerminal
  target.terminalInspector = createWin32TerminalInspector()
  if (typeof target.spawnTerminal === 'function' && !(target.spawnTerminal as { __wslWrapped?: boolean }).__wslWrapped) {
    const originalSpawnTerminal = target.spawnTerminal.bind(target)
    const wrapped = async (spec: { argv?: string[]; env?: Record<string, string> }) => {
      const isWsl = Array.isArray(spec?.argv) && spec.argv.some(arg => /wsl(\.exe)?$/i.test(arg))
      let handle: unknown
      try {
        handle = await originalSpawnTerminal(isWsl
          ? { ...spec, env: { ...spec.env, WSLENV: mergedWslenv() } }
          : spec)
      } catch (error: unknown) {
        if (isWsl) throw wslLaunchError(error instanceof Error ? error.message : String(error), error)
        throw error
      }
      if (!isWsl || handle === null || typeof handle !== 'object') return handle
      const terminal = handle as SubprocessTerminalHandle
      const early = await wslEarlyExit(terminal)
      if (early !== undefined) {
        throw wslLaunchError(
          `exited with code ${early.exitCode} before the shell started (usually no Linux distribution is installed)`,
          early,
        )
      }
      return new Win32WslTerminalHandle(
        terminal,
        options.terminateProcessTree ?? terminateWslProcessTree,
        Math.max(0, options.terminationGraceMs ?? WSL_TERMINATION_GRACE_MS),
      )
    }
    wrapped.__wslWrapped = true
    target.spawnTerminal = wrapped
  }
}
