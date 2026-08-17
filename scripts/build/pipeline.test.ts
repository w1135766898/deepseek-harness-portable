import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runBuildStages } from './pipeline.js'

test('build stages are ordered and duplicate boundaries fail closed', async () => {
  const seen: string[] = []
  await runBuildStages(seen, [
    { id: 'one', run: async state => { state.push('one') } },
    { id: 'two', run: async state => { state.push('two') } },
  ])
  assert.deepEqual(seen, ['one', 'two'])
  await assert.rejects(runBuildStages([], [
    { id: 'same', run: async () => {} },
    { id: 'same', run: async () => {} },
  ]), /duplicate build stage/)
})
