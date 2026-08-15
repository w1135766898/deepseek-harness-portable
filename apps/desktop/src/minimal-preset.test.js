/**
 * Regression tests for the shipped `minimal` agent preset's per-platform
 * shell composition and the win32 terminal inspector stub.
 *
 * On POSIX hosts, `terminal-bash` spawns `/bin/bash`.
 * On Windows hosts, `terminal-bash` spawns `C:/Windows/System32/wsl.exe` with `['--', 'bash', ...]`.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate } from '@deepseek-ai/cordis-plugin-loader'
import { adaptWin32SubprocessRuntime, createWin32TerminalInspector } from '../lib/win32-terminal-inspector.js'

const presetPath = fileURLToPath(new URL('../config/agent-presets/minimal/agent.cordis.yml', import.meta.url))

function loadPreset() {
  const entries = yaml.load(readFileSync(presetPath, 'utf8'), { schema: entryListSchema })
  assert.ok(Array.isArray(entries), 'minimal preset must parse to an entry array')
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

function evalValue(value, platform) {
  if (value !== null && typeof value === 'object' && '__jsExpr' in value) {
    return evaluate({ process: { platform } }, value.__jsExpr)
  }
  return value
}

test('minimal preset configures terminal-bash for WSL on win32 and /bin/bash on POSIX', () => {
  const entries = loadPreset()
  const terminalBash = row(entries, 'terminal-bash')

  const win32Shell = evalValue(terminalBash.config.shellPath, 'win32')
  const posixShell = evalValue(terminalBash.config.shellPath, 'linux')
  assert.equal(win32Shell, 'C:/Windows/System32/wsl.exe')
  assert.equal(posixShell, '/bin/bash')

  const win32Args = evalValue(terminalBash.config.shellArgs, 'win32')
  const posixArgs = evalValue(terminalBash.config.shellArgs, 'linux')
  assert.deepEqual(win32Args, ['--', 'bash', '--noprofile', '--norc', '-i'])
  assert.deepEqual(posixArgs, ['--noprofile', '--norc', '-i'])
})

test('minimal preset keeps persistent-shell, str_replace_editor and persona', () => {
  const entries = loadPreset()
  const persistentShell = row(entries, 'persistent-shell')
  assert.ok(persistentShell, 'persistent-shell row must exist')

  const editor = row(entries, 'str-replace-editor')
  assert.ok(editor, 'str-replace-editor row must exist')

  const persona = row(entries, 'persona')
  assert.equal(persona.config.complete, true)
  assert.equal(persona.config.includeRuntimeContext, false)
})

test('win32 terminal inspector stub satisfies ProcessInspector contracts safely', () => {
  const inspector = createWin32TerminalInspector()

  // foregroundPgid must return shellPid so signalForeground does not throw and tear down session
  assert.equal(inspector.foregroundPgid(9999), 9999)

  // isStdinWaiting must return false so readiness falls back to prompt/silence
  assert.equal(inspector.isStdinWaiting(9999), false)

  // processTree must provide rootIdentity member
  const tree = inspector.processTree(9999)
  assert.equal(tree.length, 1)
  assert.equal(tree[0].pid, 9999)

  // processSession and isAlive
  assert.deepEqual(inspector.processSession(9999), [])
  assert.equal(inspector.isAlive({ pid: 9999, started: 'wsl-root' }), false)

  // Signals must be safe no-ops
  assert.doesNotThrow(() => inspector.signalGroup(9999, 'SIGINT'))
  assert.doesNotThrow(() => inspector.signalProcess({ pid: 9999, started: 'wsl-root' }, 'SIGTERM'))
})

test('adaptWin32SubprocessRuntime injects inspector and translates WSL launch failures', async () => {
  const fakeRuntime = {
    terminalInspector: undefined,
    spawnTerminal: async (spec) => {
      if (spec?.argv?.[0]?.includes('wsl.exe')) {
        throw new Error('ENOENT: command not found')
      }
      if (spec?.argv?.[0]?.includes('fail.exe')) {
        throw new Error('generic failure')
      }
      return { ok: true }
    },
  }

  adaptWin32SubprocessRuntime(fakeRuntime)
  assert.ok(fakeRuntime.terminalInspector, 'terminalInspector must be set')

  // WSL error must be translated with guidance
  await assert.rejects(
    async () => fakeRuntime.spawnTerminal({ argv: ['C:/Windows/System32/wsl.exe', '--', 'bash'] }),
    /Failed to start WSL Linux terminal.*wsl --install.*Standard preset/,
  )

  // Non-WSL error must preserve original message
  await assert.rejects(
    async () => fakeRuntime.spawnTerminal({ argv: ['C:/fail.exe'] }),
    /generic failure/,
  )

  // Successful spawn
  const result = await fakeRuntime.spawnTerminal({ argv: ['C:/other.exe'] })
  assert.deepEqual(result, { ok: true })
})
