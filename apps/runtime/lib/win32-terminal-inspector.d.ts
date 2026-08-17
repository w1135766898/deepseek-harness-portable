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
import type { SubprocessTerminalSignal } from '@deepseek-ai/dsh-subprocess';
export interface ProcessIdentity {
    pid: number;
    started: string;
}
export interface ProcessInspector {
    foregroundPgid(shellPid: number): number | undefined;
    isStdinWaiting(pgid: number): boolean;
    processTree(rootPid: number): ProcessIdentity[];
    processSession(sessionId: number): ProcessIdentity[];
    isAlive(identity: ProcessIdentity): boolean;
    signalGroup(pgid: number, signal: SubprocessTerminalSignal): void;
    signalProcess(identity: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL'): void;
}
export declare class Win32TerminalProcessInspector implements ProcessInspector {
    foregroundPgid(shellPid: number): number | undefined;
    isStdinWaiting(_pgid: number): boolean;
    processTree(_rootPid: number): ProcessIdentity[];
    processSession(_sessionId: number): ProcessIdentity[];
    isAlive(_identity: ProcessIdentity): boolean;
    signalGroup(_pgid: number, _signal: SubprocessTerminalSignal): void;
    signalProcess(_identity: ProcessIdentity, _signal: 'SIGTERM' | 'SIGKILL'): void;
}
export declare function createWin32TerminalInspector(): ProcessInspector;
export type WslProcessTreeTerminator = (pid: number) => Promise<void>;
export interface Win32SubprocessRuntimeOptions {
    terminateProcessTree?: WslProcessTreeTerminator;
    terminationGraceMs?: number;
}
/**
 * Configure a subprocess runtime for Windows: attach the Win32 inspector stub
 * and wrap spawnTerminal to translate WSL launch errors into actionable
 * guidance, share the terminal environment through WSLENV, and route SIGINT
 * to the WSL session as a Ctrl+C byte.
 */
export declare function adaptWin32SubprocessRuntime(runtime: unknown, options?: Win32SubprocessRuntimeOptions): void;
//# sourceMappingURL=win32-terminal-inspector.d.ts.map