const { existsSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Locate the outer portable directory from Electron's app/src directory.
 *
 * In a packaged app, app/src is four parents below the portable root:
 * runtime/resources/app/src. The shorter candidates keep the helper useful
 * for development layouts without assuming that source and packaged trees
 * have the same parent depth.
 *
 * @param {string} appDir - the directory containing the Electron entry file.
 * @param {(path: string) => boolean} [exists] - injectable filesystem probe.
 * @returns {string|undefined} the portable root, when it is present.
 */
function findPortableRoot(appDir, exists = existsSync) {
  const candidates = [
    join(appDir, '..', '..', '..', '..'),
    join(appDir, '..', '..', '..'),
    join(appDir, '..', '..'),
  ]

  for (const candidate of candidates) {
    if (exists(join(candidate, 'update.ps1'))
      && exists(join(candidate, 'runtime', 'DeepSeek Harness.exe'))) {
      return candidate
    }
  }
  return undefined
}

module.exports = { findPortableRoot }
