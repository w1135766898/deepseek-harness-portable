const { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const STATUS_FILE_NAME = 'update-status.json'
const ACTIVE_STATES = new Set(['starting', 'checking', 'downloading', 'verifying', 'extracting', 'replacing', 'ready'])
const TERMINAL_STATES = new Set(['completed', 'failed', 'interrupted', 'rolled-back'])
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000

function statusPath(userDataPath) {
  return join(userDataPath, STATUS_FILE_NAME)
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function processIdValue(value) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function normalizeUpdateStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const state = textValue(value.state)
  if (!state) return undefined
  const targetVersion = textValue(value.targetVersion) || textValue(value.version)
  return {
    state,
    fromVersion: textValue(value.fromVersion),
    targetVersion,
    stage: textValue(value.stage) || state,
    message: textValue(value.message),
    updatedAt: textValue(value.updatedAt),
    startedAt: textValue(value.startedAt),
    processId: processIdValue(value.processId),
    packagePath: textValue(value.packagePath),
    stagingPath: textValue(value.stagingPath),
    sha256: textValue(value.sha256),
  }
}

function readUpdateStatus(userDataPath) {
  const path = statusPath(userDataPath)
  if (!existsSync(path)) return undefined
  try {
    return normalizeUpdateStatus(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return undefined
  }
}

function clearUpdateStatus(userDataPath) {
  try {
    rmSync(statusPath(userDataPath), { force: true })
    return true
  } catch {
    return false
  }
}

function writeUpdateStatus(userDataPath, status) {
  const normalized = normalizeUpdateStatus({
    ...status,
    updatedAt: status?.updatedAt || new Date().toISOString(),
    startedAt: status?.startedAt || new Date().toISOString(),
  })
  if (!normalized) return undefined

  const path = statusPath(userDataPath)
  const temporaryPath = path + '.' + process.pid + '.' + Date.now() + '.tmp'
  const serialized = JSON.stringify(normalized, null, 2) + '\n'
  mkdirSync(userDataPath, { recursive: true })
  try {
    writeFileSync(temporaryPath, serialized, 'utf8')
    try {
      renameSync(temporaryPath, path)
    } catch {
      // Windows cannot always rename over an existing file. Keep the
      // replacement path short and fall back to a direct write if needed.
      try { rmSync(path, { force: true }) } catch {}
      try {
        renameSync(temporaryPath, path)
      } catch {
        writeFileSync(path, serialized, 'utf8')
      }
    }
    return normalized
  } finally {
    try { rmSync(temporaryPath, { force: true }) } catch {}
  }
}

function isSupersededByCurrentVersion(status, currentVersion, compareVersions) {
  const normalized = normalizeUpdateStatus(status)
  if (!normalized || normalized.state === 'completed' || normalized.state === 'rolled-back') return false
  if (normalized.targetVersion === '' || typeof currentVersion !== 'string' || currentVersion.trim() === '') return false
  if (typeof compareVersions !== 'function') return false
  try {
    return compareVersions(currentVersion.trim(), normalized.targetVersion) >= 0
  } catch {
    return false
  }
}

function updateStatusKey(status) {
  const normalized = normalizeUpdateStatus(status)
  if (!normalized) return ''
  return [
    normalized.state,
    normalized.fromVersion,
    normalized.targetVersion,
    normalized.stage,
    normalized.updatedAt,
    normalized.message,
  ].join('|')
}

function isActiveUpdateStatus(status) {
  const normalized = normalizeUpdateStatus(status)
  return Boolean(normalized && ACTIVE_STATES.has(normalized.state))
}

function isTerminalUpdateStatus(status) {
  const normalized = normalizeUpdateStatus(status)
  return Boolean(normalized && TERMINAL_STATES.has(normalized.state))
}

function statusNeedsNotice(status, lastSeenKey) {
  return Boolean(isTerminalUpdateStatus(status) && updateStatusKey(status) !== lastSeenKey)
}

function defaultProcessIsAlive(processId) {
  if (!processId) return false
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

function reconcileUpdateStatus(status, options = {}) {
  const normalized = normalizeUpdateStatus(status)
  if (!normalized || !ACTIVE_STATES.has(normalized.state)) return normalized

  const now = options.now === undefined ? Date.now() : options.now
  const staleAfterMs = options.staleAfterMs === undefined ? DEFAULT_STALE_AFTER_MS : options.staleAfterMs
  const processIsAlive = options.processIsAlive || defaultProcessIsAlive
  const updatedAt = Date.parse(normalized.updatedAt)
  const age = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : Number.POSITIVE_INFINITY
  const processStopped = normalized.processId > 0 && !processIsAlive(normalized.processId)
  const launchGraceMs = options.launchGraceMs === undefined ? 30 * 1000 : options.launchGraceMs
  const launchExpired = normalized.state === 'starting'
    && normalized.processId === 0
    && age > launchGraceMs

  if (!processStopped && !launchExpired && age <= staleAfterMs) return normalized
  return {
    ...normalized,
    state: 'interrupted',
    stage: 'interrupted',
    message: normalized.state === 'starting'
      ? 'The updater stopped before it could start. The current installation was kept.'
      : normalized.message || 'The update stopped during ' + normalized.stage + '. The current installation was kept.',
    updatedAt: new Date(now).toISOString(),
    processId: 0,
  }
}

module.exports = {
  ACTIVE_STATES,
  DEFAULT_STALE_AFTER_MS,
  STATUS_FILE_NAME,
  TERMINAL_STATES,
  clearUpdateStatus,
  isActiveUpdateStatus,
  isTerminalUpdateStatus,
  isSupersededByCurrentVersion,
  normalizeUpdateStatus,
  readUpdateStatus,
  reconcileUpdateStatus,
  statusNeedsNotice,
  statusPath,
  updateStatusKey,
  writeUpdateStatus,
}
