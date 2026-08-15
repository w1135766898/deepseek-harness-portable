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
 * It also wraps `spawnTerminal` on win32 to catch WSL launch failures (e.g. ENOENT or missing distro)
 * and provide actionable instructions for the user.
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
  spawnTerminal?: (spec: { argv?: string[] }) => Promise<unknown>
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
    const wrapped = async (spec: { argv?: string[] }) => {
      try {
        return await originalSpawnTerminal(spec)
      } catch (error: unknown) {
        const file = spec?.argv?.[0] || ''
        if (/wsl(\.exe)?$/i.test(file)) {
          const msg = error instanceof Error ? error.message : String(error)
          throw new Error(
            `Failed to start WSL Linux terminal (${msg}). Please ensure WSL is installed with a default distribution via 'wsl --install', or switch to the Standard preset (PowerShell).`,
            { cause: error },
          )
        }
        throw error
      }
    }
    wrapped.__wslWrapped = true
    target.spawnTerminal = wrapped
  }
}
