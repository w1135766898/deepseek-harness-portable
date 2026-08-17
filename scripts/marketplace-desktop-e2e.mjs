#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function requiredOption(name) {
  const value = option(name)
  if (value === undefined || value.trim() === '') throw new Error(`--${name} is required`)
  return resolve(value)
}

async function waitFor(match, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = match()
    if (value !== undefined) return value
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function waitForHarnessTarget(devtoolsUrl, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${devtoolsUrl}/json/list`, { signal: AbortSignal.timeout(5_000) })
      const targets = await response.json()
      const target = targets.find(candidate => (
        candidate.type === 'page'
        && /^http:\/\/127\.0\.0\.1:\d+\//.test(candidate.url)
        && typeof candidate.webSocketDebuggerUrl === 'string'
      ))
      if (target !== undefined) return target
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200))
  }
  throw new Error('timed out waiting for a desktop DevTools target at the Harness loopback URL')
}

async function inspectMain(wsUrl, expression, timeoutMs = 30_000, resumeMain = false) {
  const socket = new WebSocket(wsUrl)
  return new Promise((resolvePromise, reject) => {
    let evaluationValue
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`Node Inspector evaluation timed out: ${expression}`))
    }, timeoutMs)
    const finish = (error, value) => {
      clearTimeout(timer)
      socket.close()
      if (error === undefined) resolvePromise(value)
      else reject(error)
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }))
    })
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id === 2) {
        if (message.error !== undefined) finish(new Error(message.error.message))
        else finish(undefined, evaluationValue)
        return
      }
      if (message.id !== 1) return
      if (message.error !== undefined) finish(new Error(message.error.message))
      else if (message.result?.exceptionDetails !== undefined) {
        finish(new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text))
      } else {
        evaluationValue = message.result?.result?.value
        if (resumeMain) socket.send(JSON.stringify({ id: 2, method: 'Runtime.runIfWaitingForDebugger' }))
        else finish(undefined, evaluationValue)
      }
    })
    socket.addEventListener('error', () => finish(new Error(`failed to connect Node Inspector at ${wsUrl}`)))
  })
}

async function inspectRenderer(wsUrl, expression, observeMs = 1_500) {
  const socket = new WebSocket(wsUrl)
  return new Promise((resolvePromise, reject) => {
    const pageErrors = []
    const requestFailures = []
    let value
    let enabled = 0
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`renderer DevTools evaluation timed out: ${expression}`))
    }, 30_000)
    const finish = error => {
      clearTimeout(timer)
      socket.close()
      if (error === undefined) resolvePromise({ value, pageErrors, requestFailures })
      else reject(error)
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
      socket.send(JSON.stringify({ id: 2, method: 'Network.enable' }))
    })
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.method === 'Runtime.exceptionThrown') {
        pageErrors.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'unknown renderer exception')
      }
      if (message.method === 'Network.loadingFailed' && message.params?.canceled !== true) {
        requestFailures.push({ requestId: message.params?.requestId, error: message.params?.errorText })
      }
      if (message.id === 1 || message.id === 2) {
        enabled += 1
        if (enabled === 2) {
          socket.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          }))
        }
        return
      }
      if (message.id !== 3) return
      if (message.error !== undefined) finish(new Error(message.error.message))
      else if (message.result?.exceptionDetails !== undefined) {
        finish(new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text))
      } else {
        value = message.result?.result?.value
        setTimeout(() => finish(), observeMs)
      }
    })
    socket.addEventListener('error', () => finish(new Error(`failed to connect renderer DevTools at ${wsUrl}`)))
  })
}

async function fetchJson(url, init, timeoutMs = 30_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  let value
  try { value = JSON.parse(text) } catch { value = text }
  return { ok: response.ok, status: response.status, value }
}

async function waitForMarketJob(baseUrl, jobId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  const snapshots = []
  while (Date.now() < deadline) {
    const response = await fetchJson(`${baseUrl}api/market/install/status?job=${encodeURIComponent(jobId)}`)
    if (!response.ok) throw new Error(`marketplace job ${jobId} status failed: ${JSON.stringify(response)}`)
    const job = response.value?.job
    if (job === undefined) throw new Error(`marketplace job ${jobId} returned no job snapshot`)
    snapshots.push(job)
    if (job.done === true) return { response, snapshots }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error(`marketplace job ${jobId} did not finish within ${timeoutMs}ms`)
}

async function performMarketAction(baseUrl, action, pluginName, spec) {
  if (action === undefined) return undefined
  const post = (path, body, timeoutMs) => fetchJson(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs)
  if (action === 'disable' || action === 'enable') {
    const response = await post('api/market/set-enabled', {
      name: pluginName,
      enabled: action === 'enable',
    }, 120_000)
    if (!response.ok || response.value?.ok !== true) {
      throw new Error(`marketplace ${action} failed: ${JSON.stringify(response)}`)
    }
    return { action, pluginName, response }
  }
  if (action === 'uninstall') {
    const response = await post('api/market/uninstall', { name: pluginName }, 180_000)
    if (!response.ok || response.value?.ok !== true) {
      throw new Error(`marketplace uninstall failed: ${JSON.stringify(response)}`)
    }
    return { action, pluginName, response }
  }
  if (action === 'update') {
    const response = await post('api/market/update', { name: pluginName })
    if (response.status !== 202 || response.value?.ok !== true || typeof response.value?.jobId !== 'string') {
      throw new Error(`marketplace update did not start: ${JSON.stringify(response)}`)
    }
    const completion = await waitForMarketJob(baseUrl, response.value.jobId)
    if (completion.response.value?.job?.ok !== true) {
      throw new Error(`marketplace update failed: ${JSON.stringify(completion.response)}`)
    }
    return { action, pluginName, response, completion }
  }
  if (action === 'install' || action === 'cancel-install') {
    if (spec === undefined || spec.trim() === '') throw new Error(`--action-spec is required for ${action}`)
    const response = await post('api/market/install', { spec })
    if (response.status !== 202 || response.value?.ok !== true || typeof response.value?.jobId !== 'string') {
      throw new Error(`marketplace install did not start: ${JSON.stringify(response)}`)
    }
    if (action === 'cancel-install') {
      const cancel = await post('api/market/install/cancel', { jobId: response.value.jobId }, 120_000)
      if (!cancel.ok || cancel.value?.ok !== true) {
        throw new Error(`marketplace install cancellation failed: ${JSON.stringify(cancel)}`)
      }
      const completion = await waitForMarketJob(baseUrl, response.value.jobId)
      if (completion.response.value?.job?.canceled !== true && completion.response.value?.job?.ok === true) {
        throw new Error(`marketplace install completed instead of being interrupted: ${JSON.stringify(completion.response)}`)
      }
      return { action, spec, response, cancel, completion }
    }
    const completion = await waitForMarketJob(baseUrl, response.value.jobId)
    if (completion.response.value?.job?.ok !== true) {
      throw new Error(`marketplace install failed: ${JSON.stringify(completion.response)}`)
    }
    return { action, spec, response, completion }
  }
  throw new Error(`unsupported --market-action ${JSON.stringify(action)}`)
}

async function waitForExit(child, timeoutMs = 30_000) {
  if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode, signal: child.signalCode }
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`desktop main PID ${child.pid} did not exit within ${timeoutMs}ms`)), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, signal })
    })
  })
}

async function main() {
  const product = requiredOption('product')
  const dshHome = requiredOption('home')
  const workspace = requiredOption('workspace')
  const userData = requiredOption('user-data')
  const expectedPlugin = option('expect-plugin') ?? '@anionex/dsh-vision-toolkit'
  const expectedEnabled = (option('expect-enabled') ?? 'true') === 'true'
  const expectedInstalled = (option('expect-installed') ?? 'true') === 'true'
  const expectedMarketplaceAvailable = (option('expect-marketplace-available') ?? 'true') === 'true'
  const expectedDiagnosticCode = option('expect-diagnostic-code')
  const marketAction = option('market-action')
  const actionPlugin = option('action-plugin') ?? expectedPlugin
  const actionSpec = option('action-spec')
  const reportPath = option('report') === undefined ? undefined : resolve(option('report'))
  const executablePath = join(product, 'runtime', 'DeepSeek Harness.exe')
  if (!existsSync(executablePath)) throw new Error(`packaged Electron executable is missing: ${executablePath}`)

  const output = []
  let inspectorUrl
  let devtoolsUrl
  const child = spawn(executablePath, [
    '--inspect=0',
    '--remote-debugging-port=0',
    `--user-data-dir=${userData}`,
    '--disable-gpu',
    '--start-minimized',
    '--window-position=-32000,-32000',
  ], {
    cwd: workspace,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_CWD: workspace,
      DSH_TELEMETRY_DISABLED: '1',
      CI: 'true',
      DSH_E2E_HIDDEN_WINDOWS: '1',
      PATH: `${product};${process.env.PATH ?? ''}`,
      Path: `${product};${process.env.Path ?? process.env.PATH ?? ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const onOutput = chunk => {
    const text = chunk.toString()
    output.push(text)
    const inspector = /Debugger listening on (ws:\/\/[^\s]+)/.exec(text)
    if (inspector !== null) inspectorUrl = inspector[1]
    const devtools = /DevTools listening on ws:\/\/([^/\s]+)/.exec(text)
    if (devtools !== null) devtoolsUrl = `http://${devtools[1]}`
  }
  child.stdout.on('data', onOutput)
  child.stderr.on('data', onOutput)

  try {
    await waitFor(() => inspectorUrl, 30_000, 'Node Inspector URL')
    const hiddenHookInstalled = await inspectMain(inspectorUrl, 'globalThis.__DSH_ELECTRON_TEST__?.installed === true')
    if (!hiddenHookInstalled) throw new Error('failed to install the hidden-window Electron test hook')
    await waitFor(() => devtoolsUrl, 30_000, 'Chromium DevTools URL')
    const target = await waitForHarnessTarget(devtoolsUrl)
    const url = new URL(target.url)
    const baseUrl = `${url.origin}/`
    const indexResponse = await fetch(baseUrl, { signal: AbortSignal.timeout(30_000) })
    const indexHtml = await indexResponse.text()
    const inventory = await fetchJson(`${baseUrl}api/market/installed`)
    const hostRoute = await fetchJson(`${baseUrl}_dsh/vision-toolkit/settings`, {
      headers: { Origin: url.origin, 'Sec-Fetch-Site': 'same-origin' },
    })
    const rendererInspection = await inspectRenderer(target.webSocketDebuggerUrl, `(() => {
      const pluginId = ${JSON.stringify(expectedPlugin)}
      const loader = window.__ModuleLoader__
      return {
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 2_000) ?? '',
        loaderKeys: loader === undefined ? [] : Object.keys(loader),
        pluginMentionedInDom: document.documentElement.innerHTML.includes(pluginId),
      }
    })()`)
    const renderer = rendererInspection.value
    const pageErrors = rendererInspection.pageErrors
    const requestFailures = rendererInspection.requestFailures
    const mainState = await inspectMain(inspectorUrl, `(() => {
      const electron = globalThis.__DSH_ELECTRON_TEST__
      return {
        isPackaged: electron.app.isPackaged,
        electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
        userData: electron.app.getPath('userData'),
        windows: electron.BrowserWindow.getAllWindows().map(window => ({
          visible: window.isVisible(),
          destroyed: window.isDestroyed(),
          url: window.webContents.getURL(),
        })),
      }
    })()`)
    const pluginInventory = Array.isArray(inventory.value?.plugins)
      ? inventory.value.plugins.find(plugin => plugin.name === expectedPlugin)
      : undefined
    const marketplaceAvailable = inventory.ok && inventory.value?.ok === true && Array.isArray(inventory.value?.plugins)
    const hostPluginLoaded = hostRoute.ok && hostRoute.value?.ok === true
    const assertions = {
      actualDesktopMain: mainState?.isPackaged === true && mainState?.electronRunAsNode === null,
      isolatedElectronUserData: resolve(mainState?.userData ?? '') === userData,
      httpReadiness: indexResponse.ok,
      harnessWindowCreated: mainState?.windows?.some(window => window.url.startsWith(baseUrl)) === true,
      windowsHiddenFromDesktop: mainState?.windows?.every(window => window.visible === false) === true,
      marketplaceAvailabilityMatches: marketplaceAvailable === expectedMarketplaceAvailable,
      inventoryInstalled: (pluginInventory !== undefined) === expectedInstalled,
      inventoryEnabled: expectedInstalled ? pluginInventory?.enabled === expectedEnabled : pluginInventory === undefined,
      clientGraphMatches: indexHtml.includes(expectedPlugin) === (expectedInstalled && expectedEnabled),
      hostRouteMatches: hostPluginLoaded === (expectedInstalled && expectedEnabled),
      noModuleNotFound: !output.join('').includes('MODULE_NOT_FOUND'),
      diagnosticMatches: expectedDiagnosticCode === undefined || output.join('').includes(expectedDiagnosticCode),
      noRendererPageError: pageErrors.length === 0,
    }

    const result = {
      schemaVersion: 1,
      product,
      dshHome,
      workspace,
      userData,
      pid: child.pid,
      spawnargs: child.spawnargs,
      baseUrl,
      expectedPlugin,
      expectedEnabled,
      expectedInstalled,
      expectedMarketplaceAvailable,
      expectedDiagnosticCode,
      hiddenHookInstalled,
      assertions,
      mainState,
      inventory: inventory.value,
      hostRoute,
      renderer,
      pageErrors,
      requestFailures,
      outputTail: output.join('').slice(-32_768),
    }
    if (Object.values(assertions).some(value => value !== true)) {
      throw new Error(`desktop assertions failed: ${JSON.stringify(result)}`)
    }

    result.marketAction = await performMarketAction(baseUrl, marketAction, actionPlugin, actionSpec)

    result.quitMenuClicked = await inspectMain(inspectorUrl, `(() => {
      const { Menu } = globalThis.__DSH_ELECTRON_TEST__
      const quit = Menu.getApplicationMenu()?.items[0]?.submenu?.items.at(-1)
      if (quit === undefined || typeof quit.click !== 'function') return false
      quit.click()
      return true
    })()`)
    if (!result.quitMenuClicked) throw new Error('desktop application menu did not expose the quit action')
    result.exit = await waitForExit(child)
    const serialized = `${JSON.stringify(result, undefined, 2)}\n`
    if (reportPath !== undefined) {
      await mkdir(dirname(reportPath), { recursive: true })
      await writeFile(reportPath, serialized)
    }
    process.stdout.write(serialized)
  } finally {
    if (child.exitCode === null && child.signalCode === null && inspectorUrl !== undefined) {
      try {
        await inspectMain(inspectorUrl, `(() => {
          const electron = globalThis.__DSH_ELECTRON_TEST__
          if (electron?.app === undefined) return false
          electron.app.quit()
          return true
        })()`, 5_000)
        await waitForExit(child, 10_000)
      } catch {}
    }
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

await main()
