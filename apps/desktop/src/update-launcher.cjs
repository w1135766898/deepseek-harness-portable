const { spawn: defaultSpawn } = require('node:child_process')
const { join } = require('node:path')

const DEFAULT_QUIT_DELAY_MS = 750

function resolvePowerShellExecutable({ env = process.env, platform = process.platform } = {}) {
  if (platform !== 'win32') return 'pwsh'
  const systemRoot = typeof env.SystemRoot === 'string' && env.SystemRoot.trim() !== ''
    ? env.SystemRoot
    : typeof env.WINDIR === 'string' && env.WINDIR.trim() !== ''
      ? env.WINDIR
      : ''
  return systemRoot === ''
    ? 'powershell.exe'
    : join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function positivePid(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function buildUpdaterArguments({
  scriptPath,
  statusFile,
  fromVersion,
  targetVersion,
  packagePath,
  expectedSha256,
  stagingPath,
  enginePid,
  shellPid,
  rollback = false,
  relaunchAfterRollback = false,
} = {}) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
  ]

  if (rollback) {
    args.push('-Rollback')
    if (statusFile) args.push('-StatusFile', statusFile)
    if (relaunchAfterRollback) args.push('-RelaunchAfterRollback')
  } else {
    args.push(
      '-StatusFile', statusFile,
      '-FromVersion', fromVersion,
      '-TargetVersion', targetVersion,
    )
    if (stagingPath) {
      args.push('-StagingPath', stagingPath)
    }
    if (packagePath) {
      args.push('-PackagePath', packagePath)
      if (expectedSha256) args.push('-ExpectedSha256', expectedSha256)
    }
    args.push('-LaunchAfterUpdate')
  }

  const normalizedEnginePid = positivePid(enginePid)
  const normalizedShellPid = positivePid(shellPid)
  if (normalizedEnginePid > 0) args.push('-EnginePid', String(normalizedEnginePid))
  if (normalizedShellPid > 0) args.push('-ShellPid', String(normalizedShellPid))
  return args
}

function launchDetachedPowerShell({
  root,
  scriptPath,
  args,
  spawnImpl = defaultSpawn,
  onLaunch,
  onError,
  quit,
  quitDelayMs = DEFAULT_QUIT_DELAY_MS,
  env = process.env,
  platform = process.platform,
} = {}) {
  const executable = resolvePowerShellExecutable({ env, platform })
  let child
  try {
    // NOTE: do NOT use `detached: true` here. On Windows, Node translates it
    // to DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP, and Windows PowerShell
    // 5.1 (ConsoleHost) exits immediately with code 0 WITHOUT executing the
    // script when it is started with DETACHED_PROCESS and no valid standard
    // handles (stdio: 'ignore' gives NUL) — exactly the console-less
    // environment of an Electron main process. The updater would never run
    // and the status file would stay at "starting" forever, surfacing as
    // "last update incomplete" on the next launch. A plain spawn still
    // outlives this process on Windows (children are not killed when the
    // parent exits) and unref() below keeps the app from waiting on it.
    child = spawnImpl(executable, args, {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch (error) {
    if (typeof onError === 'function') onError(error)
    return { started: false, pid: 0, executable, args, error }
  }

  const pid = positivePid(child?.pid)
  if (pid === 0) {
    const error = new Error('Portable updater process did not return a valid PID.')
    if (typeof onError === 'function') onError(error)
    return { started: false, pid: 0, executable, args, error }
  }

  if (typeof onLaunch === 'function') onLaunch(pid)
  if (child && typeof child.once === 'function' && typeof onError === 'function') {
    child.once('error', onError)
  }
  if (child && typeof child.unref === 'function') child.unref()

  if (typeof quit === 'function') {
    const delay = Math.max(0, Number(quitDelayMs) || 0)
    const timer = setTimeout(quit, delay)
    if (typeof timer.unref === 'function') timer.unref()
  }

  return { started: true, pid, executable, args }
}

module.exports = {
  DEFAULT_QUIT_DELAY_MS,
  buildUpdaterArguments,
  launchDetachedPowerShell,
  resolvePowerShellExecutable,
}
