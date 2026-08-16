/**
 * Win32 ProcessInspector stub for local PTY terminals (e.g. running wsl.exe).
 *
 * Upstream `dsh-subprocess-local` throws on win32 because POSIX process inspection
 * (/proc/pid/stat or ps -axo) is not supported natively on Windows.
 * This stub provides safe fallbacks:
 * - `processTree(rootPid)` returns `[{ pid: rootPid, started: 'wsl-root' }]` to satisfy `LocalTerminalHandle`'s rootIdentity.
 * - `foregroundPgid(shellPid)` returns `shellPid` so that `signalForeground` does not throw and destroy the session.
 * - `isStdinWaiting()` returns `false` (terminal readiness safely falls back to prompt-marker and silence detection).
 * - `signalGroup` and `signalProcess` are safe no-ops.
 *
 * It also wraps `spawnTerminal` on win32 to:
 * - advertise the terminal environment to the WSL session through `WSLENV`
 *   (WSL shares only PATH and WSLENV-listed names into Linux);
 * - catch WSL launch failures (e.g. ENOENT or missing distro) and provide
 *   actionable instructions for the user.
 *
 * @module dsh-desktop-web-pkg/win32-terminal-inspector
 */

import type { SubprocessTerminalSignal } from '@deepseek-ai/dsh-subprocess'

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

  processTree(rootPid: number): ProcessIdentity[] {
    return [{ pid: rootPid, started: 'wsl-root' }]
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
 * Configure a subprocess runtime for Windows: attach the Win32 inspector stub
 * and wrap spawnTerminal to translate WSL launch errors into actionable guidance.
 */
export function adaptWin32SubprocessRuntime(runtime: unknown): void {
  if (runtime === null || typeof runtime !== 'object') return
  const target = runtime as SubprocessRuntimeWithTerminal
  target.terminalInspector = createWin32TerminalInspector()
  if (typeof target.spawnTerminal === 'function' && !(target.spawnTerminal as { __wslWrapped?: boolean }).__wslWrapped) {
    const originalSpawnTerminal = target.spawnTerminal.bind(target)
    const wrapped = async (spec: { argv?: string[]; env?: Record<string, string> }) => {
      const isWsl = Array.isArray(spec?.argv) && spec.argv.some(arg => /wsl(\.exe)?$/i.test(arg))
      try {
        return await originalSpawnTerminal(isWsl
          ? { ...spec, env: { ...spec.env, WSLENV: mergedWslenv() } }
          : spec)
      } catch (error: unknown) {
        if (isWsl) throw wslLaunchError(error instanceof Error ? error.message : String(error), error)
        throw error
      }
    }
    wrapped.__wslWrapped = true
    target.spawnTerminal = wrapped
  }
}
