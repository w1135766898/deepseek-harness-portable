const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const TERMINAL_PHASES = new Set(['committed', 'rolled-back'])

function argumentValue(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? '' : String(argv[index + 1] ?? '')
}

/**
 * Decide whether Electron may start while a portable update transaction exists.
 * The updater's own health-probe launch is the sole exception: both its probe
 * path and transaction id must be present and the id must match the journal.
 */
function evaluateUpdateLaunch(root, argv = process.argv, {
  exists = existsSync,
  readFile = readFileSync,
} = {}) {
  if (typeof root !== 'string' || root.trim() === '') return { allowed: true }
  const transactionPath = join(root, '.update-transaction.json')
  if (!exists(transactionPath)) return { allowed: true, transactionPath }

  let transaction
  try {
    transaction = JSON.parse(readFile(transactionPath, 'utf8'))
  } catch (error) {
    return {
      allowed: false,
      transactionPath,
      reason: `The update transaction journal is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const phase = typeof transaction?.phase === 'string' ? transaction.phase : ''
  if (TERMINAL_PHASES.has(phase)) return { allowed: true, transactionPath, transaction }

  const transactionId = typeof transaction?.transactionId === 'string' ? transaction.transactionId : ''
  const probePath = argumentValue(argv, '--update-probe-file')
  const probeTransactionId = argumentValue(argv, '--update-transaction')
  if (phase === 'layout-verified'
    && transactionId !== ''
    && probePath !== ''
    && probeTransactionId === transactionId) {
    return { allowed: true, healthProbe: true, transactionPath, transaction }
  }

  return {
    allowed: false,
    transactionPath,
    transaction,
    reason: `Portable update transaction ${transactionId || '(unknown)'} is still in phase ${phase || '(unknown)'}.`,
  }
}

module.exports = { evaluateUpdateLaunch }
