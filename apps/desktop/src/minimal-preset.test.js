/**
 * Regression tests for the shipped `minimal` agent preset's per-platform
 * shell composition (mirrors upstream apps/cli/tests/windows-shell.spec.ts).
 *
 * The preset must mount exactly one shell surface per platform: the
 * persistent bash PTY stack on POSIX hosts (where `/bin/bash` exists) and
 * the `pwsh` tool on Windows (where no POSIX shell is guaranteed). The
 * `str_replace_editor` and persona rows stay platform-neutral.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate } from '@deepseek-ai/cordis-plugin-loader'

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

/** Evaluate a row's `!!js` disabled expression against one platform. */
function disabledOn(row, platform) {
  const value = row.disabled
  if (value !== null && typeof value === 'object' && '__jsExpr' in value) {
    return Boolean(evaluate({ process: { platform } }, value.__jsExpr))
  }
  return value === true
}

test('minimal preset mounts the persistent bash stack only on POSIX', () => {
  const entries = loadPreset()
  assert.equal(disabledOn(row(entries, 'persistent-shell'), 'win32'), true)
  assert.equal(disabledOn(row(entries, 'persistent-shell'), 'linux'), false)
})

test('minimal preset mounts the pwsh tool only on win32', () => {
  const entries = loadPreset()
  assert.equal(disabledOn(row(entries, 'tool-pwsh'), 'win32'), false)
  assert.equal(disabledOn(row(entries, 'tool-pwsh'), 'linux'), true)
})

test('minimal preset disables pwsh background jobs on win32', () => {
  const entries = loadPreset()
  const pwsh = row(entries, 'tool-pwsh')
  // The minimal preset mounts no `tool-jobs` controls, so a started job could
  // never be collected or stopped; the schema must not expose the parameter.
  assert.equal(pwsh.config.enableRunInBackground, false)
})

test('minimal preset keeps str_replace_editor and the persona on every platform', () => {
  const entries = loadPreset()
  assert.equal(disabledOn(row(entries, 'str-replace-editor'), 'win32'), false)
  assert.equal(disabledOn(row(entries, 'str-replace-editor'), 'linux'), false)
  const persona = row(entries, 'persona')
  assert.equal(persona.config.complete, true)
  assert.equal(persona.config.includeRuntimeContext, false)
})
