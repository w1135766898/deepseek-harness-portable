import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { discoverDesktopVerificationFiles } from './desktop-verification.js'

const desktopSourceDir = resolve(import.meta.dirname, '..', '..', 'apps', 'desktop', 'src')
const runtimeSourceDir = resolve(import.meta.dirname, '..', '..', 'apps', 'runtime', 'src')

test('release verification discovers desktop shell and runtime capsule files by convention', () => {
  const desktop = discoverDesktopVerificationFiles(desktopSourceDir)
  const runtime = discoverDesktopVerificationFiles(runtimeSourceDir)
  for (const required of ['main.cjs', 'desktop-platform.cjs', 'runtime-supervisor.cjs', 'update-client.cjs']) {
    assert.ok(desktop.runtimeSources.includes(required), `${required} must be synchronized into releases`)
    assert.ok(desktop.syntaxFiles.includes(required), `${required} must receive a syntax check`)
  }
  for (const required of ['runtime-supervisor.test.cjs', 'desktop-platform.test.cjs']) {
    assert.ok(desktop.nodeTests.includes(required), `${required} must run in the desktop Node test group`)
  }
  for (const required of ['marketplace-bootstrap.test.ts', 'mode-resolver.test.ts']) {
    assert.ok(runtime.tsxTests.includes(required), `${required} must run in the runtime tsx test group`)
  }
  assert.ok(runtime.tsxTests.includes('minimal-preset.test.ts'))
  assert.ok(!desktop.runtimeSources.some(file => file.includes('.test.')))
  assert.ok(!desktop.syntaxFiles.some(file => file.includes('.test.')))
})
