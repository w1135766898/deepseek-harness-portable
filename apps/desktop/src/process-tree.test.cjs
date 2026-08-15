const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const test = require('node:test')
const { isProcessAlive, terminateProcessTree } = require('./process-tree.cjs')

test('isProcessAlive returns true for current process and false for invalid PID', () => {
  assert.equal(isProcessAlive(process.pid), true)
  assert.equal(isProcessAlive(-1), false)
  assert.equal(isProcessAlive(0), false)
  assert.equal(isProcessAlive(9999999), false)
})

test('terminateProcessTree terminates child and its grandchildren', async () => {
  // Spawn a node child process that spawns another child process
  const child = spawn(process.execPath, [
    '-e',
    `
      const { spawn } = require('node:child_process');
      const sub = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.stdout.write(String(sub.pid) + '\\n');
      setInterval(() => {}, 1000);
    `,
  ], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })

  const subPid = await new Promise((resolve, reject) => {
    child.stdout.once('data', data => {
      const parsed = parseInt(data.toString().trim(), 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        resolve(parsed)
      } else {
        reject(new Error(`Failed to parse sub PID: ${data}`))
      }
    })
    child.once('error', reject)
  })

  const childPid = child.pid
  assert.ok(childPid > 0)
  assert.ok(subPid > 0)
  assert.equal(isProcessAlive(childPid), true)
  assert.equal(isProcessAlive(subPid), true)

  // Terminate root child process tree
  await terminateProcessTree(childPid, { timeoutMs: 3000 })

  // Allow a short moment for OS cleanup
  await new Promise(r => setTimeout(r, 300))

  assert.equal(isProcessAlive(childPid), false, 'Child process should be terminated')
  assert.equal(isProcessAlive(subPid), false, 'Grandchild process should be terminated')
})
