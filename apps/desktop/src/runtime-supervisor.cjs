const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { waitForOnboardingReady } = require('./ready-url.cjs')
const { terminateProcessTree } = require('./process-tree.cjs')

function loadProtocol() {
  try {
    return require('@dsh-portable/desktop-protocol')
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error
    // Source checkouts can run tests before pnpm has materialized the new
    // workspace link. Packaged apps always resolve the declared dependency.
    return require('../../../packages/desktop-protocol/src/index.cjs')
  }
}

const {
  RUNTIME_PROTOCOL_VERSION,
  createRuntimeEventDecoder,
  protocolEnvironment,
  runtimeLaunchArguments,
} = loadProtocol()

function appendOutput(current, chunk) {
  const output = current + chunk.toString()
  return output.length > 32_768 ? output.slice(-32_768) : output
}

function runtimeStartupError(message, output = '', code = undefined) {
  const error = new Error(message)
  error.code = code
  error.startupLog = output
  return error
}

class RuntimeSupervisor {
  constructor(dependencies = {}) {
    this.spawnProcess = dependencies.spawnProcess || spawn
    this.terminate = dependencies.terminate || terminateProcessTree
    this.waitUntilReady = dependencies.waitUntilReady || waitForOnboardingReady
    this.logger = dependencies.logger || console
    this.child = undefined
    this.output = ''
    this.runtimeDiagnostics = []
  }

  get pid() {
    return this.child?.pid
  }

  get running() {
    return this.child !== undefined
  }

  get startupLog() {
    return this.output
  }

  get diagnostics() {
    return [...this.runtimeDiagnostics]
  }

  async stop(options = {}) {
    const child = this.child
    if (child === undefined) return true
    const stopped = await this.terminate(child.pid, {
      timeoutMs: options.timeoutMs ?? 5_000,
      logger: this.logger,
    })
    if (stopped && this.child === child) this.child = undefined
    return stopped
  }

  start(options) {
    if (this.child !== undefined) throw new Error('runtime supervisor already owns a process')
    if (!existsSync(options.entry)) {
      throw new Error(`The packaged Harness entry is missing: ${options.entry}. Run the runtime build first.`)
    }

    this.output = ''
    this.runtimeDiagnostics = []
    const child = this.spawnProcess(options.executable, [
      options.entry,
      ...runtimeLaunchArguments({ host: options.host, port: options.port, open: options.open }),
      ...(options.args || []),
    ], {
      cwd: options.cwd,
      env: protocolEnvironment(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    return new Promise((resolve, reject) => {
      let settled = false
      let ready = false
      let hello = false
      let listening = false
      let portIssueShown = false
      let timeout
      let slowTimer

      const cleanupStartup = () => {
        clearTimeout(timeout)
        clearTimeout(slowTimer)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const finish = callback => {
        if (settled) return
        settled = true
        cleanupStartup()
        callback()
      }
      const fail = (message, code) => finish(() => {
        reject(runtimeStartupError(message, this.output, code))
      })
      const failAfterTermination = (message, code) => {
        void this.stop({ timeoutMs: options.stopTimeoutMs }).then(
          () => fail(message, code),
          error => fail(`${message} Runtime termination also failed: ${error.message}`, code),
        )
      }
      const acceptEvent = event => {
        if (event.type === 'hello') {
          if (event.pid !== child.pid) {
            failAfterTermination(`Runtime protocol PID mismatch: expected ${child.pid}, received ${event.pid}.`, 'PROTOCOL_PID')
            return
          }
          hello = true
          options.onProtocol?.({ version: RUNTIME_PROTOCOL_VERSION, pid: event.pid })
          return
        }
        if (event.type === 'diagnostic') {
          if (!hello) {
            failAfterTermination('Runtime sent a diagnostic event before the protocol handshake.', 'PROTOCOL_ORDER')
            return
          }
          this.runtimeDiagnostics.push(event)
          options.onDiagnostic?.(event)
          return
        }
        if (event.type !== 'listening') {
          failAfterTermination(`Runtime sent unsupported protocol event ${String(event.type)}.`, 'PROTOCOL_EVENT')
          return
        }
        if (!hello) {
          failAfterTermination('Runtime sent a listening event before the protocol handshake.', 'PROTOCOL_ORDER')
          return
        }
        if (listening) return
        listening = true
        options.onListening?.(event.url)
        void this.waitUntilReady(event.url).then(
          () => {
            ready = true
            finish(() => resolve(event.url))
          },
          error => failAfterTermination(
            `Harness host was not ready: ${error instanceof Error ? error.message : String(error)}`,
            'NOT_READY',
          ),
        )
      }
      const decoder = createRuntimeEventDecoder(acceptEvent)
      const onOutput = chunk => {
        this.output = appendOutput(this.output, chunk)
        options.onOutput?.(this.output, chunk)
        if (!portIssueShown && /EADDRINUSE|address already in use|only one usage of each socket address/i.test(this.output)) {
          portIssueShown = true
          options.onPortIssue?.(this.output)
        }
      }
      const onProtocolOutput = chunk => {
        onOutput(chunk)
        try {
          decoder.push(chunk)
        } catch (error) {
          failAfterTermination(`Invalid runtime protocol event: ${error.message}`, 'PROTOCOL_EVENT')
        }
      }
      const onAbort = () => failAfterTermination(options.cancelledMessage || 'Harness startup was cancelled.', 'ABORTED')

      timeout = setTimeout(() => {
        const stage = hello ? 'listening event' : 'protocol handshake'
        failAfterTermination(`Harness startup timed out while waiting for its ${stage}.`, 'TIMEOUT')
      }, options.startupTimeoutMs ?? 60_000)
      timeout.unref?.()
      slowTimer = setTimeout(() => options.onSlow?.(this.output), options.slowStartupMs ?? 10_000)
      slowTimer.unref?.()
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.signal?.aborted) onAbort()

      // Protocol events are emitted on stdout. Decoding a shared stdout/stderr
      // buffer lets independent stream chunks splice into the same line.
      child.stdout.on('data', onProtocolOutput)
      child.stderr.on('data', onOutput)
      child.once('error', error => fail(`Harness failed to start: ${error.message}`, error.code || 'SPAWN_ERROR'))
      child.once('exit', code => {
        try { decoder.end() } catch {}
        if (this.child === child) this.child = undefined
        if (!ready) {
          fail(`Harness exited before it was ready (code ${code}).`, `EXIT_${code ?? 'UNKNOWN'}`)
        } else {
          options.onUnexpectedExit?.({ code, output: this.output })
        }
      })
    })
  }
}

module.exports = {
  RuntimeSupervisor,
  appendOutput,
  runtimeStartupError,
}
