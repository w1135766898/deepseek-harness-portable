const {
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
  closeSync,
} = require('node:fs')
const { join, resolve } = require('node:path')

const CURRENT_SCHEMA_VERSION = 1

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  workspace: undefined,
  recentWorkspaces: [],
  zoomFactor: 1.0,
  windowBounds: {},
  lastDismissedVersion: '',
  lastSeenVersion: '',
  lastAcknowledgedUpdateStatus: '',
  lastNotifiedAvailableVersion: '',
  releaseHistory: [],
})

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ...DEFAULT_CONFIG }
  }
  return { ...config }
}

function migrateConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CONFIG }
  }

  const result = { ...raw }
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0

  if (version < 1) {
    result.schemaVersion = 1
    if (!Array.isArray(result.recentWorkspaces)) {
      result.recentWorkspaces = []
    }
    if (result.windowBounds === undefined || typeof result.windowBounds !== 'object' || Array.isArray(result.windowBounds)) {
      result.windowBounds = {}
    }
    if (typeof result.zoomFactor !== 'number' || Number.isNaN(result.zoomFactor)) {
      result.zoomFactor = 1.0
    }
  }

  return result
}

function writeAtomic(filePath, data, { preserveBackup = true } = {}) {
  const dir = resolve(join(filePath, '..'))
  mkdirSync(dir, { recursive: true })

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  const content = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`

  const fd = openSync(tempPath, 'w')
  try {
    writeSync(fd, content, 0, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  const bakPath = `${filePath}.bak`
  if (preserveBackup && existsSync(filePath)) {
    try {
      copyFileSync(filePath, bakPath)
    } catch {}
  }

  try {
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      unlinkSync(tempPath)
    } catch {}
    throw error
  }
}

function nextCorruptPath(configPath) {
  const base = `${configPath}.corrupt-${Date.now()}`
  let candidate = base
  let suffix = 1
  while (existsSync(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function readConfigStore(configPath, { logger = console } = {}) {
  const bakPath = `${configPath}.bak`

  const recoverFromBackup = () => {
    if (!existsSync(bakPath)) return undefined
    try {
      const bakRaw = JSON.parse(readFileSync(bakPath, 'utf8'))
      const validBak = migrateConfig(bakRaw)
      // The current config may be corrupt. Do not copy it over the known-good
      // backup while restoring the primary file.
      writeAtomic(configPath, validBak, { preserveBackup: false })
      if (logger && typeof logger.info === 'function') {
        logger.info(`Successfully restored config from ${bakPath}`)
      }
      return validBak
    } catch {
      return undefined
    }
  }

  if (!existsSync(configPath)) {
    const recovered = recoverFromBackup()
    if (recovered !== undefined) return recovered
    return { ...DEFAULT_CONFIG }
  }

  try {
    const text = readFileSync(configPath, 'utf8')
    const raw = JSON.parse(text)
    const migrated = migrateConfig(raw)
    if (raw && typeof raw === 'object' && raw.schemaVersion !== migrated.schemaVersion) {
      try {
        writeAtomic(configPath, migrated)
      } catch (error) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`Failed to persist config schema migration for ${configPath}: ${error.message}`)
        }
      }
    }
    return migrated
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`Failed to parse config file ${configPath}: ${error.message}`)
    }

    // Preserve corrupted file
    try {
      renameSync(configPath, nextCorruptPath(configPath))
    } catch {
      try {
        copyFileSync(configPath, nextCorruptPath(configPath))
      } catch {}
    }

    // Attempt recovery from backup
    const recovered = recoverFromBackup()
    if (recovered !== undefined) return recovered

    const defaults = { ...DEFAULT_CONFIG }
    try {
      writeAtomic(configPath, defaults, { preserveBackup: false })
    } catch {}
    return defaults
  }
}

function updateConfigStore(configPath, patch, { logger = console } = {}) {
  const current = readConfigStore(configPath, { logger })
  const merged = migrateConfig({
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  })
  writeAtomic(configPath, merged)
  return merged
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CONFIG,
  migrateConfig,
  writeAtomic,
  readConfigStore,
  updateConfigStore,
}
