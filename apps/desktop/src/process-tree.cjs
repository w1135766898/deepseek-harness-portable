const { execFile } = require('node:child_process')

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
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
      // POSIX: send SIGTERM, then SIGKILL to process group
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}

      const start = Date.now()
      const checkInterval = setInterval(() => {
        if (!isProcessAlive(pid)) {
          clearInterval(checkInterval)
          resolve(true)
          return
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(checkInterval)
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {}
          }
          resolve(!isProcessAlive(pid))
        }
      }, 100)
    }
  })
}

module.exports = {
  isProcessAlive,
  terminateProcessTree,
}
