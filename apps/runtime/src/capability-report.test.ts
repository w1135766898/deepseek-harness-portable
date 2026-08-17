import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capabilitySnapshotHash, collectCapabilityReport, type ProbeOutcome } from './capability-report.js'

const ok = (provider = 'fake'): Promise<ProbeOutcome> => Promise.resolve({ ok: true, provider })
const no = (reason = 'not installed'): Promise<ProbeOutcome> => Promise.resolve({
  ok: false,
  reason,
  remediation: 'install it',
})

test('POSIX capabilities come only from functional probe verdicts', async () => {
  const report = await collectCapabilityReport({
    platform: 'linux',
    arch: 'x64',
    overrides: {
      command: async file => file === '/bin/bash' ? await ok(file) : await no(`${file} missing`),
      pty: async () => await ok('pty'),
      persistentShell: async () => await ok('two-call-shell'),
      posixSignals: async () => await ok('signal-roundtrip'),
      sandboxWorkspaceWrite: async () => await ok('landlock'),
      directoryPickerIpc: async () => await no('no headless IPC'),
    },
  })
  assert.equal(report.capabilities['shell.bash']?.state, 'available')
  assert.equal(report.capabilities['shell.bash.persistent']?.provider, 'two-call-shell')
  assert.equal(report.capabilities['process.posix-signals']?.state, 'available')
  assert.equal(report.capabilities['sandbox.workspace-write']?.state, 'available')
  assert.equal(report.capabilities['native.directory-picker']?.state, 'unavailable')
  for (const capability of Object.values(report.capabilities)) {
    if (capability.state === 'unavailable') {
      assert.ok(capability.reason)
      assert.ok(capability.remediation)
    }
  }
  assert.match(report.snapshotHash, /^[0-9a-f]{64}$/)
})

test('Win32 reports WSL phases independently and never upgrades a failed phase', async () => {
  const calls: string[] = []
  const report = await collectCapabilityReport({
    platform: 'win32',
    arch: 'x64',
    overrides: {
      command: async (file, args) => {
        calls.push(`${file} ${args.join(' ')}`)
        if (file.endsWith('wsl.exe') && args[0] === '--status') return await ok('wsl.exe')
        if (file.endsWith('wsl.exe')) return await no('distribution missing')
        return await ok(file)
      },
      pty: async () => await ok('conpty'),
      persistentShell: async (_file, _args, dialect) => {
        calls.push(`persistent:${dialect}`)
        return await ok(`two-call-${dialect}`)
      },
      posixSignals: async () => await ok('should-not-run'),
      sandboxWorkspaceWrite: async () => await no('ACL runner missing'),
      directoryPickerIpc: async () => await ok('picker-ipc'),
    },
  })
  assert.equal(report.capabilities['wsl.executable']?.state, 'available')
  assert.equal(report.capabilities['wsl.distribution']?.state, 'unavailable')
  assert.equal(report.capabilities['wsl.bash']?.state, 'unavailable')
  assert.equal(report.capabilities['wsl.bash.persistent']?.state, 'unavailable')
  assert.equal(report.capabilities['bridge.win32-wsl-terminal']?.state, 'unavailable')
  assert.equal(report.capabilities['native.directory-picker']?.state, 'available')
  assert.equal(report.capabilities['powershell.persistent']?.provider, 'two-call-powershell')
  assert.ok(calls.some(call => call.includes('wsl.exe --status')))
  assert.ok(calls.includes('persistent:powershell'))
  assert.equal(calls.includes('persistent:bash'), false)
})

test('capability snapshot identity excludes diagnostic generation time', () => {
  const first = {
    target: { platform: 'win32', arch: 'x64' },
    capabilities: { 'terminal.conpty': { state: 'available' as const, provider: 'fixture' } },
    generatedAt: '2026-08-17T00:00:00.000Z',
  }
  const second = { ...first, generatedAt: '2026-08-17T00:00:01.000Z' }
  assert.equal(capabilitySnapshotHash(first), capabilitySnapshotHash(second))
})

test('capability report reuses a matching persistent cache without rerunning probes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-capability-report-'))
  const path = join(root, 'cache.json')
  let commandCalls = 0
  const options = {
    platform: 'linux' as const,
    arch: 'x64' as const,
    cache: { path, upstreamVersion: 'fixture-upstream', probeImplementationHash: 'fixture-probes' },
    overrides: {
      command: async (file: string) => {
        commandCalls += 1
        return file === '/bin/bash' ? await ok(file) : await no(`${file} missing`)
      },
      pty: async () => await ok('pty'),
      persistentShell: async () => await ok('persistent'),
      posixSignals: async () => await ok('signals'),
      sandboxWorkspaceWrite: async () => await ok('sandbox'),
      directoryPickerIpc: async () => await no('unavailable'),
    },
  }
  try {
    const first = await collectCapabilityReport(options)
    const callsAfterFirstRun = commandCalls
    assert.ok(callsAfterFirstRun > 0)
    const second = await collectCapabilityReport(options)
    assert.equal(commandCalls, callsAfterFirstRun)
    assert.deepEqual(second, first)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
