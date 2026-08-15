const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const {
  buildUpdaterArguments,
  launchDetachedPowerShell,
  resolvePowerShellExecutable,
} = require('./update-launcher.cjs')

test('builds portable update arguments with status, package, and process context', () => {
  assert.deepEqual(buildUpdaterArguments({
    scriptPath: 'C:\\portable\\update.ps1',
    statusFile: 'C:\\user-data\\update-status.json',
    fromVersion: '1.0.7',
    targetVersion: '1.1.0',
    packagePath: 'C:\\temp\\update.zip',
    expectedSha256: 'abc123',
    enginePid: 12,
    shellPid: 34,
  }), [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'C:\\portable\\update.ps1',
    '-StatusFile',
    'C:\\user-data\\update-status.json',
    '-FromVersion',
    '1.0.7',
    '-TargetVersion',
    '1.1.0',
    '-PackagePath',
    'C:\\temp\\update.zip',
    '-ExpectedSha256',
    'abc123',
    '-LaunchAfterUpdate',
    '-EnginePid',
    '12',
    '-ShellPid',
    '34',
  ])
})

test('builds rollback arguments with status and relaunch options', () => {
  assert.deepEqual(buildUpdaterArguments({
    scriptPath: 'C:\\portable\\update.ps1',
    statusFile: 'C:\\user-data\\update-status.json',
    fromVersion: 'ignored',
    targetVersion: 'ignored',
    rollback: true,
    relaunchAfterRollback: true,
    enginePid: 12,
    shellPid: 34,
  }), [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'C:\\portable\\update.ps1',
    '-Rollback',
    '-StatusFile',
    'C:\\user-data\\update-status.json',
    '-RelaunchAfterRollback',
    '-EnginePid',
    '12',
    '-ShellPid',
    '34',
  ])
})

test('builds minimal rollback arguments without optional statusFile or relaunch', () => {
  assert.deepEqual(buildUpdaterArguments({
    scriptPath: 'C:\\portable\\update.ps1',
    rollback: true,
    enginePid: 12,
    shellPid: 34,
  }), [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'C:\\portable\\update.ps1',
    '-Rollback',
    '-EnginePid',
    '12',
    '-ShellPid',
    '34',
  ])
})

test('resolves the system Windows PowerShell executable', () => {
  assert.equal(
    resolvePowerShellExecutable({ env: { SystemRoot: 'C:\\Windows' }, platform: 'win32' }),
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  )
  assert.equal(resolvePowerShellExecutable({ env: {}, platform: 'linux' }), 'pwsh')
})

test('records the detached updater PID before requesting app exit', async () => {
  const child = new EventEmitter()
  child.pid = 4321
  let spawnCall
  let launchedPid = 0
  let quitCount = 0
  let unrefCount = 0
  child.unref = () => { unrefCount += 1 }

  const result = launchDetachedPowerShell({
    root: 'C:\\portable',
    scriptPath: 'C:\\portable\\update.ps1',
    args: ['-Test'],
    env: { SystemRoot: 'C:\\Windows' },
    platform: 'win32',
    spawnImpl: (executable, args, options) => {
      spawnCall = { executable, args, options }
      return child
    },
    onLaunch: pid => { launchedPid = pid },
    quit: () => { quitCount += 1 },
    quitDelayMs: 5,
  })

  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(result.started, true)
  assert.equal(result.pid, 4321)
  assert.equal(launchedPid, 4321)
  assert.equal(unrefCount, 1)
  assert.equal(quitCount, 1)
  assert.equal(spawnCall.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  assert.equal(spawnCall.options.detached, true)
  assert.equal(spawnCall.options.windowsHide, true)
})

test('reports a synchronous launcher failure without requesting exit', () => {
  let errorMessage = ''
  let quitCount = 0
  const result = launchDetachedPowerShell({
    root: 'C:\\portable',
    scriptPath: 'C:\\portable\\update.ps1',
    args: [],
    spawnImpl: () => { throw new Error('spawn denied') },
    onError: error => { errorMessage = error.message },
    quit: () => { quitCount += 1 },
  })

  assert.equal(result.started, false)
  assert.equal(errorMessage, 'spawn denied')
  assert.equal(quitCount, 0)
})
