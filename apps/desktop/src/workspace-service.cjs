const { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { homedir } = require('node:os')

const MIGRATION_MARKER = '.migration-v1-complete'

function resolveTargetDshHome(env = process.env, userHome = process.env.USERPROFILE || homedir()) {
  if (env && env.DSH_HOME && env.DSH_HOME.trim() !== '') {
    return resolve(env.DSH_HOME.trim())
  }
  return resolve(join(userHome, '.dsh'))
}

function migrateLegacySessions({ targetHome, legacyUserDataPath, logger = console } = {}) {
  try {
    if (!targetHome || !legacyUserDataPath) return false
    const legacyDsh = resolve(join(legacyUserDataPath, 'dsh'))
    const normalizedTarget = resolve(targetHome)
    if (!existsSync(legacyDsh) || legacyDsh.toLowerCase() === normalizedTarget.toLowerCase()) {
      return false
    }

    const markerFile = join(normalizedTarget, MIGRATION_MARKER)
    if (existsSync(markerFile)) {
      return false
    }

    const legacySessions = join(legacyDsh, 'sessions')
    if (!existsSync(legacySessions)) {
      try {
        mkdirSync(normalizedTarget, { recursive: true })
        writeFileSync(markerFile, `${new Date().toISOString()}\n`, 'utf8')
      } catch {}
      return false
    }

    mkdirSync(normalizedTarget, { recursive: true })
    const targetSessions = join(normalizedTarget, 'sessions')

    if (!existsSync(targetSessions)) {
      if (typeof cpSync === 'function') {
        cpSync(legacySessions, targetSessions, { recursive: true, errorOnExist: false })
      }
    } else {
      const legacyEntries = readdirSync(legacySessions)
      for (const entry of legacyEntries) {
        const srcPath = join(legacySessions, entry)
        const dstPath = join(targetSessions, entry)
        if (!existsSync(dstPath)) {
          if (typeof cpSync === 'function') {
            cpSync(srcPath, dstPath, { recursive: true })
          }
        }
      }
    }

    try {
      writeFileSync(markerFile, `${new Date().toISOString()}\n`, 'utf8')
    } catch {}
    return true
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('Failed to migrate legacy sessions:', error)
    }
    return false
  }
}

function ensureUnifiedDshHome({ env = process.env, userHome = process.env.USERPROFILE || homedir(), userDataPath, logger = console } = {}) {
  const targetHome = resolveTargetDshHome(env, userHome)
  try {
    mkdirSync(targetHome, { recursive: true })
    if (userDataPath) {
      mkdirSync(userDataPath, { recursive: true })
    }
  } catch {}

  migrateLegacySessions({ targetHome, legacyUserDataPath: userDataPath, logger })

  try {
    mkdirSync(join(targetHome, 'sessions'), { recursive: true })
  } catch {}

  return targetHome
}

module.exports = {
  MIGRATION_MARKER,
  resolveTargetDshHome,
  migrateLegacySessions,
  ensureUnifiedDshHome,
}
