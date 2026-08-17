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
import { execFile } from 'node:child_process';
export class Win32TerminalProcessInspector {
    foregroundPgid(shellPid) {
        // Return shellPid so signalForeground does not throw and destroy the persistent PTY session.
        return shellPid;
    }
    isStdinWaiting(_pgid) {
        // Settle path relies on prompt-marker and silence/timeout readiness detection.
        return false;
    }
    processTree(_rootPid) {
        // No Windows process table and no visibility into the WSL VM: report no
        // members. A fabricated root identity would make
        // LocalTerminalHandle.forceStopShell take its (no-op) signal branch and
        // skip the node-pty kill fallback during host exit.
        return [];
    }
    processSession(_sessionId) {
        return [];
    }
    isAlive(_identity) {
        return false;
    }
    signalGroup(_pgid, _signal) {
        // No-op on Win32; signals to WSL are not directly routed via Win32 process.kill.
    }
    signalProcess(_identity, _signal) {
        // No-op on Win32.
    }
}
export function createWin32TerminalInspector() {
    return new Win32TerminalProcessInspector();
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
];
/** Bilingual guidance appended to translated WSL launch failures. */
const WSL_LAUNCH_GUIDANCE = [
    '[WSL 运行环境缺失] 极简模式需要 WSL (Linux Bash) 运行环境。',
    '请在 PowerShell 中执行 "wsl --install" 安装 Linux 发行版，或在会话设置中切换至【标准模式 (PowerShell)】。',
    'Please ensure WSL is installed via "wsl --install", or switch to the Standard preset (PowerShell).',
].join('\n');
function wslLaunchError(detail, cause) {
    return new Error(`Failed to start WSL Linux terminal (${detail}).\n${WSL_LAUNCH_GUIDANCE}`, { cause });
}
/**
 * WSL shares only PATH and the WSLENV-listed names into the Linux session, so
 * the terminal backend's child environment (PAGER/TERM/PROMPT_COMMAND/…) must
 * be advertised there or bash never sees it. PS1 is deliberately absent: WSL
 * filters it even when listed. The parent's own WSLENV entries are preserved;
 * duplicates collapse by name.
 * @returns a WSLENV value merging the parent's entries with the shared list.
 */
function mergedWslenv() {
    const parent = process.env.WSLENV
        ?? Object.entries(process.env).find(([key]) => key.toUpperCase() === 'WSLENV')?.[1]
        ?? '';
    const seen = new Set();
    const parts = [];
    const push = (part) => {
        const name = part.split('/')[0];
        if (part !== '' && !seen.has(name)) {
            seen.add(name);
            parts.push(part);
        }
    };
    for (const part of parent.split(':'))
        push(part);
    for (const name of WSL_SHARED_ENV)
        push(name);
    return parts.join(':');
}
/**
 * Window during which a freshly spawned WSL session may still prove to be a
 * launch failure. wsl.exe with no installed (or no default) distribution
 * prints an error and exits with 0xFFFFFFFF within this window; a healthy
 * session survives it by orders of magnitude, so the added startup latency is
 * bounded by this one-time constant.
 */
const WSL_EARLY_EXIT_GRACE_MS = 1_000;
const WSL_TERMINATION_GRACE_MS = 5_000;
/** Force-stop only the Windows process tree rooted at this terminal's wsl.exe. */
function terminateWslProcessTree(pid) {
    return new Promise((resolve, reject) => {
        execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (error) => error === null ? resolve() : reject(error));
    });
}
async function terminalExited(done, graceMs) {
    let timer;
    try {
        return await Promise.race([
            done.then(() => true, () => true),
            new Promise(resolve => { timer = setTimeout(resolve, graceMs, false); }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/**
 * Detect a WSL launch failure that does not throw at spawn: wsl.exe starts,
 * prints its error, and exits before the shell reaches readiness.
 * @param handle - the allocated terminal handle.
 * @returns the early exit outcome, or undefined when the session survived the grace window.
 */
async function wslEarlyExit(handle) {
    try {
        const outcome = await Promise.race([
            handle.done,
            new Promise(resolve => setTimeout(resolve, WSL_EARLY_EXIT_GRACE_MS)),
        ]);
        if (outcome === undefined || outcome.exitCode === 0 || outcome.exitCode === null)
            return undefined;
        return outcome;
    }
    catch {
        // A transport failure is not a WSL launch failure; the caller's own
        // lifecycle surfaces it.
        return undefined;
    }
}
/**
 * Win32 WSL terminal handle: delivers `SIGINT` to the WSL foreground group as
 * a Ctrl+C byte. The Win32 stub cannot signal Linux process groups from
 * Windows (they live inside the WSL VM); the terminal's ISIG handling
 * interrupts the foreground job when the byte reaches the PTY, which is how a
 * real console sends Ctrl+C.
 */
class Win32WslTerminalHandle {
    inner;
    terminateProcessTree;
    terminationGraceMs;
    termination;
    constructor(inner, terminateProcessTree, terminationGraceMs) {
        this.inner = inner;
        this.terminateProcessTree = terminateProcessTree;
        this.terminationGraceMs = terminationGraceMs;
    }
    get pid() {
        return this.inner.pid;
    }
    get output() {
        return this.inner.output;
    }
    get done() {
        return this.inner.done;
    }
    write(data) {
        return this.inner.write(data);
    }
    inspectForeground() {
        return this.inner.inspectForeground();
    }
    async signalForeground(signal) {
        if (signal === 'SIGINT') {
            try {
                await this.inner.write('\x03');
            }
            catch {
                // A concurrent close can end the session between inspection and write.
            }
        }
        return this.inner.signalForeground(signal);
    }
    terminate() {
        this.termination ??= this.terminateOnce();
        return this.termination;
    }
    async terminateOnce() {
        let treeError;
        try {
            await this.terminateProcessTree(this.inner.pid);
        }
        catch (error) {
            treeError = error;
        }
        await terminalExited(this.inner.done, this.terminationGraceMs);
        try {
            // Even after taskkill, delegate so LocalTerminalHandle can dispose its
            // node-pty transport and settle internal lifecycle state.
            await this.inner.terminate();
        }
        catch (error) {
            const treeDetail = treeError === undefined
                ? ''
                : `; taskkill failed: ${treeError instanceof Error ? treeError.message : String(treeError)}`;
            throw new Error(`WSL terminal cleanup failed${treeDetail}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        // A taskkill race is harmless when node-pty's own termination succeeded;
        // the delegated cleanup above is authoritative.
    }
}
/**
 * Configure a subprocess runtime for Windows: attach the Win32 inspector stub
 * and wrap spawnTerminal to translate WSL launch errors into actionable
 * guidance, share the terminal environment through WSLENV, and route SIGINT
 * to the WSL session as a Ctrl+C byte.
 */
export function adaptWin32SubprocessRuntime(runtime, options = {}) {
    if (runtime === null || typeof runtime !== 'object')
        return;
    const target = runtime;
    target.terminalInspector = createWin32TerminalInspector();
    if (typeof target.spawnTerminal === 'function' && !target.spawnTerminal.__wslWrapped) {
        const originalSpawnTerminal = target.spawnTerminal.bind(target);
        const wrapped = async (spec) => {
            const isWsl = Array.isArray(spec?.argv) && spec.argv.some(arg => /wsl(\.exe)?$/i.test(arg));
            let handle;
            try {
                handle = await originalSpawnTerminal(isWsl
                    ? { ...spec, env: { ...spec.env, WSLENV: mergedWslenv() } }
                    : spec);
            }
            catch (error) {
                if (isWsl)
                    throw wslLaunchError(error instanceof Error ? error.message : String(error), error);
                throw error;
            }
            if (!isWsl || handle === null || typeof handle !== 'object')
                return handle;
            const terminal = handle;
            const early = await wslEarlyExit(terminal);
            if (early !== undefined) {
                throw wslLaunchError(`exited with code ${early.exitCode} before the shell started (usually no Linux distribution is installed)`, early);
            }
            return new Win32WslTerminalHandle(terminal, options.terminateProcessTree ?? terminateWslProcessTree, Math.max(0, options.terminationGraceMs ?? WSL_TERMINATION_GRACE_MS));
        };
        wrapped.__wslWrapped = true;
        target.spawnTerminal = wrapped;
    }
}
//# sourceMappingURL=win32-terminal-inspector.js.map