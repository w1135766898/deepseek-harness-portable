'use strict'

const RUNTIME_PROTOCOL_VERSION = 1
const RUNTIME_PROTOCOL_ENV = 'DSH_RUNTIME_PROTOCOL_VERSION'
const RUNTIME_EVENT_PREFIX = '@@DSH_RUNTIME@@'

function protocolEnvironment(environment = process.env) {
  return {
    ...environment,
    [RUNTIME_PROTOCOL_ENV]: String(RUNTIME_PROTOCOL_VERSION),
  }
}

function protocolEnabled(environment = process.env) {
  return environment[RUNTIME_PROTOCOL_ENV] === String(RUNTIME_PROTOCOL_VERSION)
}

function runtimeLaunchArguments(options = {}) {
  return [
    '--host', options.host || '127.0.0.1',
    '--port', String(options.port ?? 0),
    options.open ? '--open' : '--no-open',
  ]
}

function assertRuntimeEvent(value) {
  if (value === null || typeof value !== 'object') throw new TypeError('runtime event must be an object')
  if (value.protocolVersion !== RUNTIME_PROTOCOL_VERSION) {
    throw new Error(`unsupported runtime protocol version ${String(value.protocolVersion)}`)
  }
  if (value.type === 'hello') {
    if (!Number.isSafeInteger(value.pid) || value.pid <= 0) throw new TypeError('hello event requires a positive pid')
    return value
  }
  if (value.type === 'listening') {
    const url = new URL(value.url)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new TypeError('listening event requires a loopback HTTP URL')
    }
    return value
  }
  if (value.type === 'diagnostic') {
    if (typeof value.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.code)) {
      throw new TypeError('diagnostic event requires a stable uppercase code')
    }
    if (typeof value.component !== 'string' || value.component.trim() === '') {
      throw new TypeError('diagnostic event requires a component')
    }
    if (!['warning', 'error'].includes(value.severity)) {
      throw new TypeError('diagnostic event requires warning or error severity')
    }
    if (typeof value.message !== 'string' || value.message.trim() === '' || value.message.length > 4096) {
      throw new TypeError('diagnostic event requires a bounded non-empty message')
    }
    if (typeof value.recoverable !== 'boolean') {
      throw new TypeError('diagnostic event requires a recoverable flag')
    }
    return value
  }
  throw new TypeError(`unknown runtime event type ${String(value.type)}`)
}

function encodeRuntimeEvent(event) {
  return `${RUNTIME_EVENT_PREFIX}${JSON.stringify(assertRuntimeEvent(event))}`
}

function createRuntimeEventDecoder(onEvent) {
  let pending = ''
  const acceptLine = line => {
    if (!line.startsWith(RUNTIME_EVENT_PREFIX)) return
    const body = line.slice(RUNTIME_EVENT_PREFIX.length)
    onEvent(assertRuntimeEvent(JSON.parse(body)))
  }
  return {
    push(chunk) {
      pending += chunk.toString()
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) acceptLine(line)
    },
    end() {
      if (pending !== '') acceptLine(pending)
      pending = ''
    },
  }
}

module.exports = {
  RUNTIME_EVENT_PREFIX,
  RUNTIME_PROTOCOL_ENV,
  RUNTIME_PROTOCOL_VERSION,
  assertRuntimeEvent,
  createRuntimeEventDecoder,
  encodeRuntimeEvent,
  protocolEnabled,
  protocolEnvironment,
  runtimeLaunchArguments,
}
