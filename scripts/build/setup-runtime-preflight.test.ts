import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..', '..')
const preflight = join(root, 'scripts', 'setup-runtime-preflight.ps1')

function runPreflight(args: string[]) {
  return spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    preflight,
    ...args,
  ], { encoding: 'utf8', windowsHide: true })
}

test('Setup uses collision-free transaction paths and no global image-name taskkill', () => {
  const source = readFileSync(join(root, 'scripts', 'setup.iss'), 'utf8')
  assert.match(source, /\.setup-stage-\{#MyAppVersion\}-' \+ RunId/)
  assert.match(source, /\.setup-runtime-backup-' \+ RunId/)
  assert.doesNotMatch(source, /\/IM\s+"DeepSeek Harness\.exe"/i)
  assert.match(source, /setup-runtime-lock-report\.json/)
  assert.match(source, /\.setup-orphan-runtime-' \+ RunId/)
})

test('lock diagnostics report but never terminate an unowned process', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-setup-lock-中文 空格-'))
  const installRoot = join(temporary, 'DeepSeek Harness')
  const runtime = join(installRoot, 'runtime')
  const lockedFile = join(runtime, 'locked.bin')
  const report = join(temporary, 'lock-report.json')
  mkdirSync(runtime, { recursive: true })
  writeFileSync(lockedFile, 'lock-probe')
  const escaped = lockedFile.replace(/'/g, "''")
  const holder = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$stream=[IO.File]::Open('${escaped}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); try { Start-Sleep -Seconds 60 } finally { $stream.Dispose() }`,
  ], { stdio: 'ignore', windowsHide: true })
  try {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 800))
    assert.ok(holder.pid)
    const diagnose = runPreflight([
      '-Mode', 'Diagnose',
      '-InstallRoot', installRoot,
      '-ResourcePath', lockedFile,
      '-DestinationPath', join(installRoot, '.backup'),
      '-ReportPath', report,
    ])
    assert.equal(diagnose.status, 0, `${diagnose.stdout}\n${diagnose.stderr}`)
    const evidence = JSON.parse(readFileSync(report, 'utf8').replace(/^\uFEFF/, '')) as {
      lockingProcesses: Array<{ pid: number; name: string; executablePath: string }>
    }
    const lock = evidence.lockingProcesses.find(item => item.pid === holder.pid)
    assert.ok(lock, JSON.stringify(evidence, null, 2))
    assert.match(lock.name, /powershell/i)
    assert.match(lock.executablePath, /powershell\.exe$/i)

    const stop = runPreflight([
      '-Mode', 'Stop',
      '-InstallRoot', installRoot,
      '-ResourcePath', lockedFile,
      '-DestinationPath', join(installRoot, '.backup'),
      '-ReportPath', report,
    ])
    assert.equal(stop.status, 0, `${stop.stdout}\n${stop.stderr}`)
    assert.equal(holder.exitCode, null, 'an unowned lock holder must remain alive')
    assert.equal(existsSync(report), true)
  } finally {
    holder.kill()
    await new Promise(resolveExit => holder.once('exit', resolveExit))
    rmSync(temporary, { recursive: true, force: true })
  }
})
