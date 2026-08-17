import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compileModeCatalog, composeModeVariant, parseModeDefinition, validateModeComposition } from './mode-catalog.js'
import type { CapabilityReport } from './mode-resolver.js'

const presets = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))

test('every shipped core mode has a contract and every final variant satisfies it', async () => {
  for (const id of ['standard', 'code', 'cordis', 'minimal']) {
    const directory = join(presets, id)
    const definition = parseModeDefinition(await readFile(join(directory, 'mode.yml'), 'utf8'), `${id}/mode.yml`)
    assert.equal(definition.id, id)
    for (const variant of definition.variants) {
      const composed = await composeModeVariant(directory, definition, variant)
      validateModeComposition(definition, variant, composed)
      assert.doesNotMatch(composed, /process\.platform/)
    }
  }
})

test('an unavailable mode loses both discovery files and retains API diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mode-catalog-'))
  const directory = join(root, 'fixture')
  await mkdir(directory)
  await writeFile(join(directory, 'preset.yml'), 'name: fixture\n')
  await writeFile(join(directory, 'agent.cordis.yml'), '- id: stale\n  name: stale\n')
  await writeFile(join(directory, 'mode.yml'), [
    'id: fixture',
    'contract:',
    '  tools:',
    '    requiredRows: [tool]',
    'variants:',
    '  - id: native',
    '    supportLevel: native',
    '    requires: [missing.capability]',
    '    config: variant.yml',
    '',
  ].join('\n'))
  await writeFile(join(directory, 'variant.yml'), '- id: tool\n  name: tool\n')
  const report: CapabilityReport = {
    target: { platform: 'linux', arch: 'x64' },
    generatedAt: new Date(0).toISOString(),
    snapshotHash: 'a'.repeat(64),
    capabilities: {
      'missing.capability': { state: 'unavailable', reason: 'missing', remediation: 'install it' },
    },
  }
  try {
    const catalog = await compileModeCatalog(root, report, 'b'.repeat(40))
    assert.equal(catalog.modes.fixture?.selectable, false)
    await assert.rejects(readFile(join(directory, 'preset.yml')), /ENOENT/)
    await assert.rejects(readFile(join(directory, 'agent.cordis.yml')), /ENOENT/)
    const diagnostic = JSON.parse(await readFile(join(directory, 'mode-resolution.json'), 'utf8'))
    assert.equal(diagnostic.reason, 'no fixture runtime variant satisfies all required capabilities')
    assert.deepEqual(diagnostic.remediation, ['install it'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
