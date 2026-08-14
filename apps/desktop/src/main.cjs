const { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } = require('electron')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { readyUrl } = require('./ready-url.cjs')

const APP_NAME = 'DeepSeek Harness'
const STARTUP_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 5_000

let window
let tray
let harness
let quitting = false
let restarting = false

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

function workspace() {
  try {
    const saved = JSON.parse(readFileSync(configPath(), 'utf8')).workspace
    if (typeof saved === 'string' && existsSync(saved) && statSync(saved).isDirectory()) return saved
  } catch {
    // A missing or invalid preference uses the documented home-directory default.
  }
  return homedir()
}

function saveWorkspace(path) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath(), `${JSON.stringify({ workspace: path }, null, 2)}\n`)
}

function iconPath() {
  return join(__dirname, '..', 'assets', 'deepseek.ico')
}

function showWindow() {
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function appendOutput(current, chunk) {
  const output = current + chunk.toString()
  return output.length > 32_768 ? output.slice(-32_768) : output
}

function stopHarness() {
  return new Promise(resolve => {
    if (harness === undefined) {
      resolve()
      return
    }
    const child = harness
    harness = undefined
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(finish, STOP_TIMEOUT_MS)
    timeout.unref()
    child.once('exit', finish)
    child.kill()
  })
}

function startHarness(cwd) {
  const packagedBin = join(__dirname, '..', 'lib', 'packaged-bin.js')
  if (!existsSync(packagedBin)) {
    throw new Error(`The packaged Harness entry is missing: ${packagedBin}. Run the desktop build first.`)
  }

  const child = spawn(process.execPath, [
    '--expose-internals',
    packagedBin,
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--no-open',
  ], {
    cwd,
    env: {
      ...process.env,
      DSH_HOME: process.env.DSH_HOME?.trim() || join(app.getPath('userData'), 'dsh'),
      DSH_TELEMETRY_DISABLED: '1',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  harness = child

  return new Promise((resolve, reject) => {
    let output = ''
    let ready = false
    let settled = false
    const timeout = setTimeout(() => {
      child.kill()
      fail(`Harness startup timed out.`)
    }, STARTUP_TIMEOUT_MS)
    timeout.unref()
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const fail = message => finish(() => reject(new Error(`${message}\n\n${output}`)))
    const onOutput = chunk => {
      output = appendOutput(output, chunk)
      const url = readyUrl(output)
      if (url !== undefined && !ready) {
        ready = true
        finish(() => resolve(url))
      }
    }
    child.stdout.on('data', onOutput)
    child.stderr.on('data', onOutput)
    child.once('error', error => fail(`Harness failed to start: ${error.message}`))
    child.once('exit', code => {
      if (harness === child) {
        harness = undefined
        if (!quitting && !restarting && ready) {
          void dialog.showMessageBox({
            type: 'error',
            title: `${APP_NAME} stopped`,
            message: `Harness exited unexpectedly (code ${code}).\n\n${output}`,
          })
        }
      }
      if (!ready) fail(`Harness exited before it was ready (code ${code}).`)
    })
  })
}

async function restartHarness() {
  if (restarting) return
  restarting = true
  try {
    await stopHarness()
    const url = await startHarness(workspace())
    if (window !== undefined && !window.isDestroyed()) await window.loadURL(url)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} failed to start`,
      message: errorMessage(error),
    })
  } finally {
    restarting = false
  }
}

async function chooseWorkspace() {
  if (window === undefined || window.isDestroyed()) return
  const result = await dialog.showOpenDialog(window, {
    title: 'Choose workspace',
    defaultPath: workspace(),
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths[0] === undefined) return
  saveWorkspace(result.filePaths[0])
  await restartHarness()
  rebuildMenus()
}

function menuItems() {
  return [
    { label: `Show ${APP_NAME}`, click: showWindow },
    { label: 'Choose Workspace…', click: () => { void chooseWorkspace() } },
    { label: `Open Workspace (${workspace()})`, click: () => { void shell.openPath(workspace()) } },
    {
      label: 'Use Home as Workspace',
      enabled: workspace() !== homedir(),
      click: async () => {
        saveWorkspace(homedir())
        await restartHarness()
        rebuildMenus()
      },
    },
    { label: 'Restart Harness', click: () => { void restartHarness() } },
    { type: 'separator' },
    { label: 'Quit', accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Alt+F4', click: () => app.quit() },
  ]
}

function rebuildMenus() {
  const template = menuItems()
  if (tray !== undefined) tray.setContextMenu(Menu.buildFromTemplate(template))
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: APP_NAME, submenu: template.slice(1) },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

async function createApp() {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => { window = undefined })
  window.once('ready-to-show', showWindow)
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  tray = new Tray(nativeImage.createFromPath(iconPath()))
  tray.setToolTip(APP_NAME)
  tray.on('click', () => window !== undefined && window.isVisible() ? window.hide() : showWindow())
  rebuildMenus()
  await restartHarness()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', event => {
    if (harness !== undefined) {
      event.preventDefault()
      void stopHarness().then(() => app.quit())
    }
  })
  app.whenReady().then(createApp).catch(error => dialog.showErrorBox(APP_NAME, errorMessage(error)))
}
