import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..', '..')
const source = join(root, 'apps', 'desktop', 'launcher', 'DeepSeekHarnessLauncher.cs')
const icon = join(root, 'apps', 'desktop', 'assets', 'deepseek.ico')

function frameworkCompiler(): string | undefined {
  if (process.platform !== 'win32') return undefined
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return [
    join(systemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(systemRoot, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ].find(candidate => existsSync(candidate))
}

function compileLauncher(destination: string): void {
  const compiler = frameworkCompiler()
  assert.ok(compiler, 'Windows .NET Framework C# compiler is required')
  mkdirSync(dirname(destination), { recursive: true })
  const result = spawnSync(compiler, [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/reference:System.Web.Extensions.dll',
    `/win32icon:${icon}`,
    `/out:${destination}`,
    source,
  ], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

function compileRuntimeProbe(destination: string, sourcePath: string): void {
  const compiler = frameworkCompiler()
  assert.ok(compiler, 'Windows .NET Framework C# compiler is required')
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(sourcePath, String.raw`
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

internal static class RuntimeProbe
{
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [STAThread]
    private static int Main(string[] arguments)
    {
        string root = Environment.CurrentDirectory;
        string launcher = Path.Combine(root, "DeepSeek Harness Launcher.exe");
        bool launcherDeleted = false;
        bool keepLauncher = String.Equals(
            Environment.GetEnvironmentVariable("DSH_PROBE_KEEP_LAUNCHER"),
            "1",
            StringComparison.Ordinal);
        try
        {
            if (!keepLauncher)
            {
                File.Delete(launcher);
                launcherDeleted = !File.Exists(launcher);
            }
        }
        catch (Exception)
        {
            launcherDeleted = false;
        }

        List<string> leakedWorkerVariables = new List<string>();
        foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            string name = entry.Key as string;
            if (name != null && name.StartsWith("DSH_GUI_WORKER_", StringComparison.OrdinalIgnoreCase))
            {
                leakedWorkerVariables.Add(name);
            }
        }

        Dictionary<string, object> result = new Dictionary<string, object>();
        result["arguments"] = arguments;
        result["launcherDeleted"] = launcherDeleted;
        result["recoveryMarkerPresent"] = File.Exists(Path.Combine(root, "recovery-ran.txt"));
        result["workerVariables"] = leakedWorkerVariables.ToArray();
        result["consoleAttached"] = GetConsoleWindow() != IntPtr.Zero;
        string json = new JavaScriptSerializer().Serialize(result);
        File.WriteAllText(Path.Combine(root, "runtime-result.json"), json, new UTF8Encoding(false));
        return 0;
    }
}
`)
  const result = spawnSync(compiler, [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/reference:System.Web.Extensions.dll',
    `/out:${destination}`,
    sourcePath,
  ], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

async function waitFor(path: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50))
  }
}

async function runRootLauncher(launcher: string, appRoot: string, arguments_: string[]): Promise<void> {
  const processHandle = spawn(launcher, arguments_, { cwd: appRoot, stdio: 'ignore', windowsHide: true })
  const rootExit = await new Promise<number | null>((resolveExit, reject) => {
    processHandle.once('error', reject)
    processHandle.once('exit', resolveExit)
  })
  assert.equal(rootExit, 0)
}

test('Windows launcher is a GUI PE, preserves argv, and releases its root image', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-launcher-test-'))
  const appRoot = join(temporary, 'DeepSeek Harness 空格 & (测试)')
  const launcher = join(appRoot, 'DeepSeek Harness Launcher.exe')
  const runtime = join(appRoot, 'runtime', 'DeepSeek Harness.exe')
  const resultPath = join(appRoot, 'runtime-result.json')
  const arguments_ = [
    '',
    'plain value',
    'quote"value',
    'metacharacters & | < > % !',
    'trailing-backslash\\',
    'line one\r\nline two',
  ]
  try {
    compileLauncher(launcher)
    compileRuntimeProbe(runtime, join(temporary, 'RuntimeProbe.cs'))
    const image = readFileSync(launcher)
    const peOffset = image.readUInt32LE(0x3c)
    assert.equal(image.toString('ascii', peOffset, peOffset + 4), 'PE\0\0')
    const optionalHeader = peOffset + 4 + 20
    assert.ok([0x10b, 0x20b].includes(image.readUInt16LE(optionalHeader)))
    assert.equal(image.readUInt16LE(optionalHeader + 68), 2, 'launcher must use IMAGE_SUBSYSTEM_WINDOWS_GUI')

    await runRootLauncher(launcher, appRoot, arguments_)
    await waitFor(resultPath)
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      arguments: string[]
      launcherDeleted: boolean
      recoveryMarkerPresent: boolean
      workerVariables: string[]
      consoleAttached: boolean
    }
    assert.deepEqual(result.arguments, arguments_)
    assert.equal(result.launcherDeleted, true, 'TEMP worker must not lock the root launcher image')
    assert.deepEqual(result.workerVariables, [], 'worker-only environment metadata must not reach Electron')
    assert.equal(result.consoleAttached, false)
    assert.equal(result.recoveryMarkerPresent, false)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('Windows launcher recovers a pending transaction before starting the runtime', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-launcher-recovery-test-'))
  const appRoot = join(temporary, 'DeepSeek Harness recovery 空格')
  const launcher = join(appRoot, 'DeepSeek Harness Launcher.exe')
  const runtime = join(appRoot, 'runtime', 'DeepSeek Harness.exe')
  const resultPath = join(appRoot, 'runtime-result.json')
  try {
    compileLauncher(launcher)
    compileRuntimeProbe(runtime, join(temporary, 'RuntimeProbe.cs'))
    writeFileSync(join(appRoot, '.update-transaction.json'), '{"phase":"backed-up"}', 'utf8')
    writeFileSync(join(appRoot, 'update.ps1'), [
      'param([switch]$RecoverOnly, [string]$AppRoot)',
      "if (-not $RecoverOnly) { exit 71 }",
      "[IO.File]::WriteAllText((Join-Path $AppRoot 'recovery-ran.txt'), 'yes')",
      "[IO.File]::WriteAllText((Join-Path $AppRoot '.update-transaction.json'), '{\"phase\":\"rolled-back\"}')",
      'exit 0',
      '',
    ].join('\r\n'), 'utf8')

    await runRootLauncher(launcher, appRoot, [])
    await waitFor(resultPath)
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      recoveryMarkerPresent: boolean
      launcherDeleted: boolean
      workerVariables: string[]
    }
    assert.equal(result.recoveryMarkerPresent, true, 'runtime must start only after RecoverOnly completes')
    assert.equal(result.launcherDeleted, true, 'recovery must run from TEMP without mapping the root launcher')
    assert.deepEqual(result.workerVariables, [])
    assert.deepEqual(JSON.parse(readFileSync(join(appRoot, '.update-transaction.json'), 'utf8')), {
      phase: 'rolled-back',
    })
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('legacy updater runtime swap self-installs the root launcher on the first console fallback', {
  skip: process.platform !== 'win32',
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-launcher-legacy-update-test-'))
  const appRoot = join(temporary, 'installed DeepSeek Harness 空格')
  const sourceRoot = join(temporary, 'new release')
  const oldRuntime = join(appRoot, 'runtime')
  const newRuntime = join(sourceRoot, 'runtime')
  const rootLauncher = join(appRoot, 'DeepSeek Harness Launcher.exe')
  const compatibilityLauncher = join(newRuntime, 'DeepSeek Harness Launcher.exe')
  const resultPath = join(appRoot, 'runtime-result.json')
  try {
    mkdirSync(oldRuntime, { recursive: true })
    writeFileSync(join(oldRuntime, 'old-version.txt'), 'old')
    compileLauncher(compatibilityLauncher)
    compileRuntimeProbe(join(newRuntime, 'DeepSeek Harness.exe'), join(temporary, 'RuntimeProbe.cs'))

    // Model the legacy updater contract: it atomically replaces the complete
    // runtime tree, then copies only paths known to its old fixed root payload.
    renameSync(oldRuntime, join(appRoot, 'runtime.backup'))
    renameSync(newRuntime, join(appRoot, 'runtime'))
    copyFileSync(join(root, 'apps', 'desktop', 'start-desktop.cmd'), join(appRoot, 'start-desktop.cmd'))
    mkdirSync(join(appRoot, 'updater'), { recursive: true })
    copyFileSync(
      join(root, 'apps', 'desktop', 'updater', 'updater.psm1'),
      join(appRoot, 'updater', 'updater.psm1'),
    )
    copyFileSync(
      join(root, 'apps', 'desktop', 'updater', 'release-payload.ps1'),
      join(appRoot, 'updater', 'release-payload.ps1'),
    )
    assert.equal(existsSync(rootLauncher), false, 'legacy root payload does not know the new launcher path')

    const commandProcessor = process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    const result = spawnSync(commandProcessor, ['/D', '/C', 'call', join(appRoot, 'start-desktop.cmd')], {
      cwd: appRoot,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        DSH_GUI_LAUNCHER: '1',
        DSH_PROBE_KEEP_LAUNCHER: '1',
      },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    await waitFor(resultPath)
    assert.equal(existsSync(rootLauncher), true, 'the new console fallback must materialize the root GUI launcher')
    assert.deepEqual(readFileSync(rootLauncher), readFileSync(join(appRoot, 'runtime', 'DeepSeek Harness Launcher.exe')))
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 })
  }
})
