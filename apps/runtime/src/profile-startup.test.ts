import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeAfterManagedFallback } from './profile-startup.js'

test('legacy compose-before-heal reproduces code 1 first and success only after a later heal', () => {
  let broken = true
  const compose = (): void => {
    if (broken) throw new Error('cannot resolve managed UI bundle')
  }
  const legacyLaunch = (): number => {
    try {
      compose()
      broken = false // unreachable late heal in the legacy entry
      return 0
    } catch {
      return 1
    }
  }
  assert.equal(legacyLaunch(), 1)
  broken = false // the repair observed before the user's later manual launch
  assert.equal(legacyLaunch(), 0)
})

test('marketplace mutation is followed by fallback heal before the first loadProfile', () => {
  const events: string[] = []
  let fallbackPresent = true
  const result = composeAfterManagedFallback({
    virtualRuntime: false,
    installAnchor: 'C:\\release\\resources\\app\\package.json',
    mutate: () => {
      events.push('marketplace')
      fallbackPresent = false
    },
    heal: () => {
      events.push('heal')
      fallbackPresent = true
    },
    compose: () => {
      events.push('loadProfile')
      if (!fallbackPresent) throw new Error('cannot resolve profile bundle from removed fallback')
      return 'ready'
    },
  })
  assert.equal(result, 'ready')
  assert.deepEqual(events, ['marketplace', 'heal', 'loadProfile'])
})

test('single-file virtual runtime composes without writing filesystem fallbacks', () => {
  let healed = false
  assert.equal(composeAfterManagedFallback({
    virtualRuntime: true,
    installAnchor: '/virtual/package.json',
    mutate: () => {},
    heal: () => { healed = true },
    compose: () => 'ready',
  }), 'ready')
  assert.equal(healed, false)
})
