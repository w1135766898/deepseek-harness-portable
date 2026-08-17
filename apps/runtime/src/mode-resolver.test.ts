import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closestVariant, resolveVariant, type CapabilityReport, type ModeDefinition } from './mode-resolver.js'

const mode: ModeDefinition = {
  id: 'minimal',
  contract: {},
  variants: [
    { id: 'posix-bash', supportLevel: 'native', requires: ['terminal.pty.native', 'shell.bash'], config: 'variants/posix.yml' },
    {
      id: 'win32-wsl',
      supportLevel: 'compatible',
      requires: ['terminal.conpty', 'wsl.bash', 'bridge.win32-wsl-terminal'],
      limitations: ['process-tree-unobservable'],
      config: 'variants/wsl.yml',
    },
  ],
}

function report(capabilities: CapabilityReport['capabilities']): CapabilityReport {
  return {
    target: { platform: 'linux', arch: 'x64' },
    capabilities,
    generatedAt: '2026-08-17T00:00:00.000Z',
    snapshotHash: 'a'.repeat(64),
  }
}

test('resolver selects a complete native variant', () => {
  assert.deepEqual(resolveVariant(mode, report({
    'terminal.pty.native': { state: 'available' },
    'shell.bash': { state: 'available' },
  })), {
    modeId: 'minimal',
    variantId: 'posix-bash',
    supportLevel: 'native',
    limitations: [],
  })
})

test('resolver publishes compatible variant limitations', () => {
  assert.deepEqual(resolveVariant(mode, report({
    'terminal.conpty': { state: 'available' },
    'wsl.bash': { state: 'available' },
    'bridge.win32-wsl-terminal': { state: 'available' },
  })), {
    modeId: 'minimal',
    variantId: 'win32-wsl',
    supportLevel: 'compatible',
    limitations: ['process-tree-unobservable'],
  })
})

test('degraded capabilities do not silently satisfy a contract', () => {
  const unavailable = resolveVariant(mode, report({
    'terminal.pty.native': { state: 'available' },
    'shell.bash': { state: 'degraded' },
  }))
  assert.equal(unavailable.supportLevel, 'unavailable')
  assert.ok(unavailable.supportLevel === 'unavailable' && unavailable.missingCapabilities.includes('shell.bash'))
  assert.ok(unavailable.supportLevel === 'unavailable' && unavailable.missing.some(item => item.id === 'shell.bash'))
})

test('a variant must explicitly opt into a degraded capability', () => {
  const optedIn: ModeDefinition = {
    ...mode,
    variants: [{
      id: 'partial-sandbox',
      supportLevel: 'native',
      requires: ['sandbox.workspace-write'],
      acceptsDegraded: ['sandbox.workspace-write'],
      config: 'partial.yml',
    }],
  }
  assert.equal(resolveVariant(optedIn, report({
    'sandbox.workspace-write': { state: 'degraded', limitations: ['partial-enforcement'] },
  })).supportLevel, 'native')
})

test('closest variant is only a diagnostic fallback', () => {
  const capabilities = report({
    'terminal.conpty': { state: 'available' },
    'bridge.win32-wsl-terminal': { state: 'available' },
  })
  assert.equal(resolveVariant(mode, capabilities).supportLevel, 'unavailable')
  assert.equal(closestVariant(mode, capabilities).id, 'win32-wsl')
})
