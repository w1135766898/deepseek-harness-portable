const { execFile } = require('node:child_process')
const { readFileSync } = require('node:fs')

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function linuxDescendantPids(pid, result = [], seen = new Set()) {
  if (process.platform !== 'linux' || seen.has(pid)) return result
  seen.add(pid)

  let children = []
  try {
    const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim()
    children = raw ? raw.split(/\s+/).map(Number).filter(childPid => childPid > 0) : []
  } catch {
    return result
  }

  // Read the complete tree before signalling the root. The children are
  // appended after their own descendants so the deepest processes are
  // signalled first and cannot be orphaned by the root's exit.
  for (const childPid of children) {
    if (!seen.has(childPid)) {
      linuxDescendantPids(childPid, result, seen)
      result.push(childPid)
    }
  }
  return result
}

function terminateProcessTree(pid, { timeoutMs = 5000, logger = console } = {}) {
  if (!pid || typeof pid !== 'number' || pid <= 0) {
    return Promise.resolve(true)
  }

  if (!isProcessAlive(pid)) {
    return Promise.resolve(true)
  }

  return new Promise(resolve => {
    if (process.platform === 'win32') {
      // Windows: use taskkill /PID <pid> /T /F to kill entire process tree recursively
      execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: Math.max(1000, timeoutMs),
      }, (error) => {
        if (error && logger && typeof logger.debug === 'function') {
          logger.debug(`taskkill on PID ${pid}: ${error.message}`)
        }

        // Verify exit or wait up to timeoutMs
        const start = Date.now()
        const checkInterval = setInterval(() => {
          if (!isProcessAlive(pid)) {
            clearInterval(checkInterval)
            resolve(true)
          } else if (Date.now() - start >= timeoutMs) {
            clearInterval(checkInterval)
            resolve(false)
          }
        }, 100)
      })
    } else {
      // POSIX: Linux does not guarantee that a spawned child is a process
      // group leader, so a negative-PID kill alone can miss grandchildren.
      // Snapshot /proc first, then terminate descendants before the root.
      const trackedPids = process.platform === 'linux'
        ? [...linuxDescendantPids(pid), pid]
        : [pid]

      const signalTrackedProcesses = signal => {
        for (const trackedPid of trackedPids) {
          if (!isProcessAlive(trackedPid)) continue
          try {
            process.kill(trackedPid, signal)
          } catch {}
        }
      }

      signalTrackedProcesses('SIGTERM')

      const start = Date.now()
      const checkInterval = setInterval(() => {
        if (!trackedPids.some(isProcessAlive)) {
          clearInterval(checkInterval)
          resolve(true)
          return
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(checkInterval)
          signalTrackedProcesses('SIGKILL')
          // A detached POSIX child may have descendants that were created
          // after the /proc snapshot. Preserve the process-group fallback,
          // but only after the explicit Linux tree has been signalled.
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {}
          setTimeout(() => resolve(!trackedPids.some(isProcessAlive)), 100)
        }
      }, 100)
    }
  })
}

module.exports = {
  isProcessAlive,
  terminateProcessTree,
}
