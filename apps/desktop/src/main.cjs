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

function resolveUnifiedDshHome() {
  let targetHome
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '') {
    targetHome = process.env.DSH_HOME.trim()
  } else {
    const userHome = process.env.USERPROFILE || homedir()
    targetHome = join(userHome, '.dsh')
  }

  // Ensure target directories exist before spawning engine child process
  try {
    mkdirSync(targetHome, { recursive: true })
    mkdirSync(join(targetHome, 'sessions'), { recursive: true })
    mkdirSync(app.getPath('userData'), { recursive: true })
  } catch {}

  // Seamless legacy data migration: if AppData\Roaming\DeepSeek Harness\dsh has sessions, migrate to ~/.dsh
  try {
    const legacyDsh = join(app.getPath('userData'), 'dsh')
    if (existsSync(legacyDsh) && legacyDsh !== targetHome) {
      const { cpSync } = require('node:fs')
      const legacySessions = join(legacyDsh, 'sessions')
      const targetSessions = join(targetHome, 'sessions')
      if (existsSync(legacySessions) && !existsSync(targetSessions)) {
        if (typeof cpSync === 'function') {
          cpSync(legacySessions, targetSessions, { recursive: true })
        }
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return targetHome
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
      DSH_HOME: resolveUnifiedDshHome(),
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
  if (window !== undefined && !window.isDestroyed() && !window.isVisible()) {
    showWindow()
  }
  const parentWindow = window !== undefined && !window.isDestroyed() && window.isVisible() ? window : undefined
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Choose workspace',
    defaultPath: workspace(),
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths[0] === undefined) return
  saveWorkspace(result.filePaths[0])
  await restartHarness()
  rebuildMenus()
}

const https = require('node:https')

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'DeepSeek-Harness-Desktop' }, timeout: timeoutMs }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

function getLocalVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json')
    if (existsSync(pkgPath)) {
      const ver = JSON.parse(readFileSync(pkgPath, 'utf8')).version
      if (ver && ver !== '0.0.1') return ver
    }
  } catch {}
  return '0.1.0-rc.6'
}

function compareVersions(v1, v2) {
  const clean = v => (v || '').replace(/^v/, '').trim()
  const s1 = clean(v1).split(/[-.]/)
  const s2 = clean(v2).split(/[-.]/)
  for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
    const p1 = isNaN(Number(s1[i])) ? s1[i] || '' : Number(s1[i])
    const p2 = isNaN(Number(s2[i])) ? s2[i] || '' : Number(s2[i])
    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }
  return 0
}

async function queryLatestVersion() {
  // Multi-source concurrent racing against official upstream deepseek-ai/deepseek-harness
  const channels = [
    {
      name: 'DeepSeek 官方国内镜像 (Alibaba Cloud NPM CDN)',
      url: 'https://registry.npmmirror.com/@deepseek-ai/dsh',
      parser: data => data['dist-tags']?.latest || data['dist-tags']?.next,
      releaseUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases',
    },
    {
      name: 'DeepSeek 官方 NPM 全球源',
      url: 'https://registry.npmjs.org/@deepseek-ai/dsh',
      parser: data => data['dist-tags']?.latest || data['dist-tags']?.next,
      releaseUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases',
    },
    {
      name: 'DeepSeek 官方 GitHub (Direct API)',
      url: 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/latest',
      parser: data => (data.tag_name || '').replace(/^v/, ''),
      releaseUrl: data => data.html_url || 'https://github.com/deepseek-ai/deepseek-harness/releases',
    },
    {
      name: 'DeepSeek 官方 GitHub 国内加速源',
      url: 'https://ghfast.top/https://api.github.com/repos/deepseek-ai/deepseek-harness/releases/latest',
      parser: data => (data.tag_name || '').replace(/^v/, ''),
      releaseUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases',
    }
  ]

  const results = await Promise.allSettled(channels.map(async c => {
    const data = await fetchJson(c.url)
    const version = c.parser(data)
    if (!version) throw new Error('No version tag found')
    const relUrl = typeof c.releaseUrl === 'function' ? c.releaseUrl(data) : c.releaseUrl
    return { channel: c.name, version, releaseUrl: relUrl }
  }))

  const successful = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  if (successful.length === 0) {
    throw new Error('所有官方更新节点连接超时，请检查网络。')
  }

  successful.sort((a, b) => compareVersions(b.version, a.version))
  return successful[0]
}

function triggerInPlaceUpdate() {
  const root = join(__dirname, '..', '..', '..')
  const updateScript = join(root, '在线更新.bat')
  const updatePs1 = join(root, 'runtime', 'update.ps1')

  if (existsSync(updateScript)) {
    shell.openPath(updateScript)
  } else if (existsSync(updatePs1)) {
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', updatePs1], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  } else {
    void shell.openExternal('https://github.com/deepseek-ai/deepseek-harness/releases')
  }
}

async function checkForUpdates(manual = true) {
  const current = getLocalVersion()
  try {
    const latestInfo = await queryLatestVersion()
    const hasUpdate = compareVersions(latestInfo.version, current) > 0

    if (hasUpdate) {
      const parentWindow = window !== undefined && !window.isDestroyed() && window.isVisible() ? window : undefined
      const choice = await dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: 'DeepSeek Harness 更新提示',
        message: `发现 DeepSeek Harness 最新版本: v${latestInfo.version}`,
        detail: `当前安装版本: v${current}\n已自动优选最佳测速通道: ${latestInfo.channel}\n\n是否立即启动一键增量热升级？（所有会话与配置将 100% 完好保留）`,
        buttons: ['立即更新 (一键热升级)', '查看发布说明', '稍后提醒'],
        defaultId: 0,
        cancelId: 2,
      })

      if (choice.response === 0) {
        triggerInPlaceUpdate()
      } else if (choice.response === 1) {
        void shell.openExternal(latestInfo.releaseUrl)
      }
    } else if (manual) {
      const parentWindow = window !== undefined && !window.isDestroyed() && window.isVisible() ? window : undefined
      await dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本！',
        detail: `当前版本: v${current}\n检测通道: ${latestInfo.channel} (连接正常)\n暂无可用更新。`,
        buttons: ['确定'],
      })
    }
  } catch (error) {
    if (manual) {
      const parentWindow = window !== undefined && !window.isDestroyed() && window.isVisible() ? window : undefined
      await dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: '检查更新失败',
        message: '无法连接到更新服务器',
        detail: `错误详情: ${error.message}\n如果网络受到限制，您也可以直接运行目录下的【在线更新.bat】进行国内镜像换源更新。`,
        buttons: ['确定'],
      })
    }
  }
}

function menuItems() {
  return [
    { label: `Show ${APP_NAME}`, click: showWindow },
    { label: 'Check for Updates… (检查更新)', click: () => { void checkForUpdates(true) } },
    { type: 'separator' },
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
  tray.on('double-click', () => showWindow())
  rebuildMenus()
  await restartHarness()
  setTimeout(() => {
    void checkForUpdates(false)
  }, 4000)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', event => {
    if (tray !== undefined && !tray.isDestroyed()) {
      tray.destroy()
    }
    if (harness !== undefined) {
      event.preventDefault()
      void stopHarness().then(() => app.quit())
    }
  })
  app.whenReady().then(createApp).catch(error => dialog.showErrorBox(APP_NAME, errorMessage(error)))
}
