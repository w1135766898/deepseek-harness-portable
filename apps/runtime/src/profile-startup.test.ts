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

test('a fresh process heals managed fallbacks before its first profile compose', () => {
  const events: string[] = []
  let broken = true
  const result = composeAfterManagedFallback({
    virtualRuntime: false,
    installAnchor: 'C:\\release\\resources\\app\\package.json',
    heal: () => {
      events.push('heal')
      broken = false
    },
    compose: () => {
      events.push('compose')
      if (broken) throw new Error('cannot resolve profile bundle from stale fallback')
      return 'ready'
    },
  })
  assert.equal(result, 'ready')
  assert.deepEqual(events, ['heal', 'compose'])
})

test('single-file virtual runtime composes without writing filesystem fallbacks', () => {
  let healed = false
  assert.equal(composeAfterManagedFallback({
    virtualRuntime: true,
    installAnchor: '/virtual/package.json',
    heal: () => { healed = true },
    compose: () => 'ready',
  }), 'ready')
  assert.equal(healed, false)
})
