import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attestPatchedFile, PatchConflictError, patchStatus, type PatchDefinition } from './patch-manifest.js'

const definition: PatchDefinition = {
  id: 'fixture',
  targets: ['*'],
  files: [{ path: 'fixture.js', guards: ['ORIGINAL'] }],
}

test('patch attestations bind reviewed input and output bytes', () => {
  const result = attestPatchedFile(definition, definition.files[0]!, 'const ORIGINAL = 1\n', source => source.replace('1', '2'))
  assert.equal(result.changed, true)
  assert.match(result.attestation.inputSha256, /^[0-9a-f]{64}$/)
  assert.match(result.attestation.outputSha256, /^[0-9a-f]{64}$/)
  assert.notEqual(result.attestation.inputSha256, result.attestation.outputSha256)
  assert.equal(patchStatus([result]), 'applied')
})

test('a missing reviewed guard is a fail-closed conflict with the input hash', () => {
  assert.throws(
    () => attestPatchedFile(definition, definition.files[0]!, 'changed upstream\n', source => source),
    (error: unknown) => error instanceof PatchConflictError
      && error.status === 'conflict'
      && /^[0-9a-f]{64}$/u.test(error.inputSha256),
  )
})
