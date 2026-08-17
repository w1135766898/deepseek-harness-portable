/**
 * Regression tests for the shipped Minimal contract, its explicit runtime
 * variants, and the win32 terminal inspector compatibility bridge.
 *
 * On POSIX hosts (Linux and macOS), `terminal-bash` spawns `/bin/bash`.
 * On Windows hosts, `terminal-bash` spawns `C:/Windows/System32/wsl.exe` with `['--', 'bash', ...]`.
 *
 * The win32 inspector stub reports no process-tree members (the WSL VM is not
 * observable from Windows), and spawnTerminal is wrapped to share WSLENV,
 * translate WSL launch failures, and route SIGINT as a Ctrl+C byte.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { adaptWin32SubprocessRuntime, createWin32TerminalInspector } from './win32-terminal-inspector.js'

const modePath = fileURLToPath(new URL('../config/agent-presets/minimal/mode.yml', import.meta.url))
const posixVariantPath = fileURLToPath(new URL('../config/agent-presets/minimal/variants/posix-bash.cordis.yml', import.meta.url))
const win32VariantPath = fileURLToPath(new URL('../config/agent-presets/minimal/variants/win32-wsl.cordis.yml', import.meta.url))
const jsExpressionType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: expression => ({ __jsExpr: expression }),
})
const cordisTestSchema = yaml.DEFAULT_SCHEMA.extend([jsExpressionType])

function loadVariant(path) {
  const entries = yaml.load(readFileSync(path, 'utf8'), { schema: cordisTestSchema })
  assert.ok(Array.isArray(entries), 'minimal variant must parse to an entry array')
  return entries
}

function findRow(entries, id) {
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    if (entry.id === id) return entry
    if (Array.isArray(entry.config)) {
      const found = findRow(entry.config, id)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function row(entries, id) {
  const found = findRow(entries, id)
  assert.ok(found !== undefined, `row ${id} must be present`)
  return found
}

test('minimal mode declares a stable contract and capability-driven variants', () => {
  const source = readFileSync(modePath, 'utf8')
  const mode = yaml.load(source)
  assert.equal(mode.id, 'minimal')
  assert.deepEqual(mode.contract.tools.exact, ['persistent-shell', 'str-replace-editor'])
  assert.equal(mode.contract.persona.complete, true)
  assert.equal(mode.contract.persona.includeRuntimeContext, false)
  assert.equal(mode.contract.compaction, 'disabled')
  assert.equal(mode.contract.filesystem, 'bare-local')
  assert.equal(mode.contract.sandbox, 'danger-full-access')
  assert.deepEqual(mode.variants.map(variant => [variant.id, variant.supportLevel]), [
    ['posix-bash', 'native'],
    ['win32-wsl', 'compatible'],
  ])
  assert.deepEqual(mode.variants[1].limitations, [
    'process-tree-unobservable',
    'process-group-signals-emulated',
  ])
})

test('minimal variants use literal shell implementations without process.platform in config', () => {
  const posixSource = readFileSync(posixVariantPath, 'utf8')
  const win32Source = readFileSync(win32VariantPath, 'utf8')
  assert.doesNotMatch(`${posixSource}\n${win32Source}`, /process\.platform/)

  const posixBash = row(loadVariant(posixVariantPath), 'terminal-bash')
  assert.equal(posixBash.config.shellPath, '/bin/bash')
  assert.deepEqual(posixBash.config.shellArgs, ['--noprofile', '--norc', '-i'])

  const win32Bash = row(loadVariant(win32VariantPath), 'terminal-bash')
  assert.equal(win32Bash.config.shellPath, 'C:/Windows/System32/wsl.exe')
  assert.deepEqual(win32Bash.config.shellArgs, ['--', 'bash', '--noprofile', '--norc', '-i'])
})

test('both minimal variants preserve the same model-facing contract', () => {
  for (const path of [posixVariantPath, win32VariantPath]) {
    const entries = loadVariant(path)
    const persistentShell = row(entries, 'persistent-shell')
    assert.equal(persistentShell.isolate?.terminals, true)
    assert.equal(persistentShell.isolate?.sandboxPolicy, true)

    const sandboxPolicy = row(persistentShell.config, 'sandbox-policy')
    assert.equal(sandboxPolicy.name, '@deepseek-ai/dsh-sandbox-policy')
    assert.equal(sandboxPolicy.config?.mode, 'danger-full-access')
    assert.equal(row(entries, 'persistent-bash').name, '@deepseek-ai/dsh-tool-bash-persistent')
    assert.equal(row(entries, 'str-replace-editor').name, '@deepseek-ai/dsh-tool-str-replace-editor')

    const persona = row(entries, 'persona')
    assert.equal(persona.config.complete, true)
    assert.equal(persona.config.includeRuntimeContext, false)
  }
})

test('win32 terminal inspector stub satisfies ProcessInspector contracts safely', () => {
  const inspector = createWin32TerminalInspector()

  // foregroundPgid must return shellPid so signalForeground does not throw and tear down session
  assert.equal(inspector.foregroundPgid(9999), 9999)

  // isStdinWaiting must return false so readiness falls back to prompt/silence
  assert.equal(inspector.isStdinWaiting(9999), false)

  // processTree must report no members so LocalTerminalHandle.forceStopShell
  // falls back to node-pty's own kill during host exit instead of routing
  // through the (no-op) signal branch of a fabricated root identity
  const tree = inspector.processTree(9999)
  assert.deepEqual(tree, [])

  // processSession and isAlive
  assert.deepEqual(inspector.processSession(9999), [])
  assert.equal(inspector.isAlive({ pid: 9999, started: 'wsl-root' }), false)

  // Signals must be safe no-ops
  assert.doesNotThrow(() => inspector.signalGroup(9999, 'SIGINT'))
  assert.doesNotThrow(() => inspector.signalProcess({ pid: 9999, started: 'wsl-root' }, 'SIGTERM'))
})

function fakeWslTerminal({ earlyExit } = {}) {
  const calls = { writes: [], signals: [], terminates: 0 }
  let resolveDone
  const handle = {
    pid: 4242,
    output: new PassThrough(),
    done: earlyExit === undefined
      ? new Promise(resolve => { resolveDone = resolve })
      : Promise.resolve(earlyExit),
    write: async (data) => { calls.writes.push(data) },
    inspectForeground: async () => ({ processGroupId: 4242, inputWaiting: false }),
    signalForeground: async (signal) => { calls.signals.push(signal); return 4242 },
    terminate: async () => { calls.terminates += 1 },
  }
  return {
    handle,
    calls,
    exit: (outcome = { exitCode: 1, signal: null }) => resolveDone?.(outcome),
  }
}

test('adaptWin32SubprocessRuntime injects inspector and translates WSL launch failures', async () => {
  const seenSpecs = []
  const wslTerminal = fakeWslTerminal()
  const fakeRuntime = {
    terminalInspector: undefined,
    spawnTerminal: async (spec) => {
      seenSpecs.push(spec)
      const argv = spec?.argv ?? []
      const isWsl = argv.some(arg => arg.includes('wsl.exe'))
      if (argv.includes('missing.exe') || (argv[0] === 'runner.exe' && isWsl)) {
        throw new Error('ENOENT: command not found')
      }
      if (argv[0]?.includes('fail.exe')) {
        throw new Error('generic failure')
      }
      if (isWsl) return wslTerminal.handle
      return { ok: true }
    },
  }

  const terminatedTrees = []
  adaptWin32SubprocessRuntime(fakeRuntime, {
    terminateProcessTree: async (pid) => {
      terminatedTrees.push(pid)
      wslTerminal.exit()
    },
    terminationGraceMs: 25,
  })
  assert.ok(fakeRuntime.terminalInspector, 'terminalInspector must be set')

  // Direct WSL error must be translated with guidance
  await assert.rejects(
    async () => fakeRuntime.spawnTerminal({ argv: ['C:/Windows/System32/wsl.exe', 'missing.exe', '--', 'bash'] }),
    /Failed to start WSL Linux terminal.*WSL 运行环境缺失.*wsl --install/s,
  )

  // Wrapped/confined WSL argv error must also be translated
  await assert.rejects(
    async () => fakeRuntime.spawnTerminal({ argv: ['runner.exe', '--', 'C:/Windows/System32/wsl.exe', '--', 'bash'] }),
    /Failed to start WSL Linux terminal.*WSL 运行环境缺失.*wsl --install/s,
  )

  // Non-WSL error must preserve original message
  await assert.rejects(
    async () => fakeRuntime.spawnTerminal({ argv: ['C:/fail.exe'] }),
    /generic failure/,
  )

  // A WSL session that exits before readiness (e.g. no distribution installed)
  // must be translated with guidance instead of surfacing the raw early exit
  const earlyTerminal = fakeWslTerminal({ earlyExit: { exitCode: 4294967295, signal: null } })
  const earlyRuntime = {
    terminalInspector: undefined,
    spawnTerminal: async (spec) => {
      if (spec?.argv?.some(arg => arg.includes('wsl.exe'))) return earlyTerminal.handle
      throw new Error('unexpected non-WSL spawn')
    },
  }
  adaptWin32SubprocessRuntime(earlyRuntime)
  await assert.rejects(
    async () => earlyRuntime.spawnTerminal({ argv: ['C:/Windows/System32/wsl.exe', '--', 'bash'] }),
    /Failed to start WSL Linux terminal.*4294967295.*wsl --install/s,
  )

  // WSL spawns must advertise the terminal environment through WSLENV while
  // preserving the parent's own entries and collapsing duplicates by name
  const previousWslenv = process.env.WSLENV
  let wslHandle
  try {
    process.env.WSLENV = 'FOO:/bar:PROMPT_COMMAND'
    wslHandle = await fakeRuntime.spawnTerminal({ argv: ['C:/Windows/System32/wsl.exe', '--', 'bash'], env: {} })
  } finally {
    if (previousWslenv === undefined) delete process.env.WSLENV
    else process.env.WSLENV = previousWslenv
  }
  const wslSpec = seenSpecs[seenSpecs.length - 1]
  assert.ok(wslSpec.env && typeof wslSpec.env === 'object', 'WSL spawn spec must keep an env object')
  const wslenvParts = wslSpec.env.WSLENV.split(':')
  assert.ok(wslenvParts.includes('FOO'), 'parent WSLENV entries must be preserved')
  assert.ok(wslenvParts.includes('/bar'), 'parent WSLENV path-flagged entries must be preserved')
  assert.equal(wslenvParts.filter(part => part === 'PROMPT_COMMAND').length, 1, 'duplicate names must collapse')
  for (const name of ['PAGER', 'GIT_PAGER', 'TERM', 'DSH_SHELL', 'DSH_PTY_SESSION_ID']) {
    assert.ok(wslenvParts.includes(name), `WSLENV must share ${name}`)
  }
  assert.ok(!wslenvParts.includes('PS1'), 'PS1 must stay out of WSLENV (WSL filters it)')

  // WSL handles route SIGINT as a Ctrl+C byte and delegate everything else
  assert.equal(wslHandle.pid, 4242, 'proxy must expose the inner terminal pid')
  await wslHandle.signalForeground('SIGINT')
  assert.deepEqual(wslTerminal.calls.writes, ['\x03'], 'SIGINT must be delivered as a Ctrl+C byte')
  await wslHandle.signalForeground('SIGTERM')
  assert.equal(wslTerminal.calls.writes.length, 1, 'non-SIGINT signals must not inject bytes')
  assert.deepEqual(wslTerminal.calls.signals, ['SIGINT', 'SIGTERM'], 'all signals must reach the inner handle')
  assert.deepEqual(await wslHandle.inspectForeground(), { processGroupId: 4242, inputWaiting: false })
  await wslHandle.terminate()
  await wslHandle.terminate()
  assert.deepEqual(terminatedTrees, [4242], 'terminate must taskkill the specific wsl.exe process tree once')
  assert.equal(wslTerminal.calls.terminates, 1, 'terminate must dispose the inner PTY exactly once')
  assert.equal(wslTerminal.calls.writes.length, 1, 'terminate must not inject extra terminal input')

  // Successful non-WSL spawn passes through untouched
  const result = await fakeRuntime.spawnTerminal({ argv: ['C:/other.exe'] })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(seenSpecs[seenSpecs.length - 1], { argv: ['C:/other.exe'] })
})
