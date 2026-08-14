const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } = require('electron')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { readyUrl, waitForOnboardingReady } = require('./ready-url.cjs')
const { mergeReleaseHistory, normalizeReleaseNotes } = require('./release-notes.cjs')
const { findPortableRoot } = require('./update-path.cjs')

const APP_NAME = 'DeepSeek Harness'
const PORTABLE_RELEASE_REPO = 'wsnxxxs/deepseek-harness-portable'
const RELEASE_MANIFEST_NAME = 'release-manifest.json'
const RELEASE_NOTES_FILE_NAME = 'release-notes.json'
const RELEASE_NOTES_PAGE_NAME = 'release-notes.html'
const RELEASE_NOTES_PRELOAD_NAME = 'release-notes-preload.cjs'
const RELEASE_HISTORY_LIMIT = 20
const STARTUP_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 5_000

let window
let tray
let harness
let harnessUrl
let restartPromise
let quitting = false
let restarting = false
let releaseNotesWindow
let whatsNewWindow
let releaseNotesContext = { mode: 'history' }

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

function readConfig() {
  try {
    const value = JSON.parse(readFileSync(configPath(), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function updateConfig(patch) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configPath(), `${JSON.stringify({ ...readConfig(), ...patch }, null, 2)}\n`)
}

function workspace() {
  try {
    const saved = readConfig().workspace
    if (typeof saved === 'string' && existsSync(saved) && statSync(saved).isDirectory()) return saved
  } catch {
    // A missing or invalid preference uses the documented home-directory default.
  }
  return homedir()
}

function saveWorkspace(path) {
  updateConfig({ workspace: path })
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
    harnessUrl = undefined
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
    packagedBin,
    '--host',
    '127.0.0.1',
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
    let readyUrlSeen = false
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
      if (url !== undefined && !readyUrlSeen) {
        readyUrlSeen = true
        void waitForOnboardingReady(url).then(
          () => {
            ready = true
            finish(() => resolve(url))
          },
          error => {
            child.kill()
            fail(`Harness host was not ready: ${error instanceof Error ? error.message : String(error)}`)
          },
        )
      }
    }
    child.stdout.on('data', onOutput)
    child.stderr.on('data', onOutput)
    child.once('error', error => fail(`Harness failed to start: ${error.message}`))
    child.once('exit', code => {
      if (harness === child) {
        harness = undefined
        harnessUrl = undefined
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
  if (restartPromise !== undefined) return restartPromise
  const currentRestart = (async () => {
    restarting = true
    try {
      await stopHarness()
      const url = await startHarness(workspace())
      harnessUrl = url
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
  })()
  restartPromise = currentRestart
  try {
    await currentRestart
  } finally {
    if (restartPromise === currentRestart) restartPromise = undefined
  }
}

async function openWebUiInBrowser() {
  if (harnessUrl === undefined) await restartHarness()
  if (harnessUrl === undefined) {
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} Web UI unavailable`,
      message: 'The Web UI is not ready yet.',
      detail: 'Please try again after the desktop client finishes starting.',
    })
    return
  }
  void shell.openExternal(harnessUrl)
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

function readJsonIfPresent(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  } catch {}
  return undefined
}

function firstVersion(...values) {
  return values.find(value => typeof value === 'string' && value.length > 0) || '0.0.0'
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() || 'unknown'
}

function getLocalReleaseInfo() {
  const packageManifest = readJsonIfPresent(join(__dirname, '..', 'package.json')) || {}
  const bundledReleaseNotes = readJsonIfPresent(join(__dirname, RELEASE_NOTES_FILE_NAME)) || {}
  const portableRoot = findPortableRoot(__dirname)
  const releaseManifest = portableRoot === undefined
    ? undefined
    : readJsonIfPresent(join(portableRoot, RELEASE_MANIFEST_NAME))
  let appVersion
  try {
    appVersion = app.getVersion()
  } catch {}
  return {
    distributionVersion: firstVersion(
      releaseManifest?.distributionVersion,
      packageManifest.distributionVersion,
      packageManifest.version,
      appVersion,
    ),
    desktopVersion: firstVersion(
      releaseManifest?.desktopVersion,
      packageManifest.version,
      appVersion,
    ),
    kernelVersion: firstVersion(releaseManifest?.kernelVersion, 'unknown'),
    kernelCommit: firstText(releaseManifest?.kernelCommit),
    releaseNotes: normalizeReleaseNotes(
      releaseManifest?.releaseNotes || bundledReleaseNotes,
      firstVersion(
        releaseManifest?.distributionVersion,
        packageManifest.distributionVersion,
        packageManifest.version,
        appVersion,
      ),
    ),
  }
}

function getLocalVersion() {
  return getLocalReleaseInfo().distributionVersion
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
  // Race direct GitHub and the mirror, but keep both channels on the same
  // Windows portable release source that the updater actually downloads.
  const channels = [
    {
      name: 'Portable Windows GitHub',
      url: `https://api.github.com/repos/${PORTABLE_RELEASE_REPO}/releases/latest`,
      parser: data => (data.tag_name || '').replace(/^v/, ''),
      releaseUrl: data => data.html_url || `https://github.com/${PORTABLE_RELEASE_REPO}/releases`,
    },
    {
      name: 'Portable Windows GitHub mirror',
      url: `https://ghfast.top/https://api.github.com/repos/${PORTABLE_RELEASE_REPO}/releases/latest`,
      parser: data => (data.tag_name || '').replace(/^v/, ''),
      releaseUrl: `https://github.com/${PORTABLE_RELEASE_REPO}/releases`,
    }
  ]

  const results = await Promise.allSettled(channels.map(async c => {
    const data = await fetchJson(c.url)
    const version = c.parser(data)
    if (!version) throw new Error('No version tag found')
    const zipAsset = Array.isArray(data.assets)
      ? data.assets.find(asset => asset?.name === `DeepSeek-Harness-${version}-win32-x64.zip`)
      : undefined
    if (zipAsset === undefined) throw new Error('No portable ZIP asset found')
    const relUrl = typeof c.releaseUrl === 'function' ? c.releaseUrl(data) : c.releaseUrl
    return {
      ...normalizeReleaseNotes({
        ...data,
        version,
        releaseUrl: relUrl,
        channel: c.name,
        assetName: zipAsset.name,
      }, version),
      channel: c.name,
      assetName: zipAsset.name,
    }
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

async function queryReleaseHistory() {
  const channels = [
    {
      name: 'Portable Windows GitHub',
      url: `https://api.github.com/repos/${PORTABLE_RELEASE_REPO}/releases?per_page=${RELEASE_HISTORY_LIMIT}`,
      releaseUrl: data => data.html_url || `https://github.com/${PORTABLE_RELEASE_REPO}/releases`,
    },
    {
      name: 'Portable Windows GitHub mirror',
      url: `https://ghfast.top/https://api.github.com/repos/${PORTABLE_RELEASE_REPO}/releases?per_page=${RELEASE_HISTORY_LIMIT}`,
      releaseUrl: `https://github.com/${PORTABLE_RELEASE_REPO}/releases`,
    },
  ]

  const results = await Promise.allSettled(channels.map(async channel => {
    const data = await fetchJson(channel.url)
    if (!Array.isArray(data)) throw new Error('Release history response was not an array')
    return data
      .filter(release => release && !release.draft)
      .map(release => normalizeReleaseNotes({
        ...release,
        releaseUrl: typeof channel.releaseUrl === 'function' ? channel.releaseUrl(release) : channel.releaseUrl,
        channel: channel.name,
        assetName: Array.isArray(release.assets)
          ? release.assets.find(asset => asset?.name === `DeepSeek-Harness-${String(release.tag_name || '').replace(/^v/, '')}-win32-x64.zip`)?.name
          : undefined,
      }))
      .filter(release => release.version !== '0.0.0')
  }))

  const successful = results
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => result.value)
  if (successful.length === 0) throw new Error('Release history is unavailable')
  return successful
}

function sortReleaseHistory(history) {
  return mergeReleaseHistory(history)
    .sort((left, right) => compareVersions(right.version, left.version))
    .slice(0, RELEASE_HISTORY_LIMIT)
}

function cachedReleaseHistory() {
  const cached = readConfig().releaseHistory
  return Array.isArray(cached) ? cached.map(item => normalizeReleaseNotes(item)).filter(item => item.version !== '0.0.0') : []
}

function saveReleaseHistory(history) {
  updateConfig({
    releaseHistory: sortReleaseHistory(history),
    releaseHistoryFetchedAt: new Date().toISOString(),
  })
}

async function buildReleaseNotesData(context = {}) {
  const localInfo = getLocalReleaseInfo()
  const localRelease = normalizeReleaseNotes({
    ...localInfo.releaseNotes,
    releaseUrl: localInfo.releaseNotes.releaseUrl || `https://github.com/${PORTABLE_RELEASE_REPO}/releases`,
  }, localInfo.distributionVersion)
  const cached = cachedReleaseHistory()
  let remote = []
  let offline = false
  try {
    remote = await queryReleaseHistory()
    if (remote.length > 0) saveReleaseHistory(remote)
  } catch {
    offline = true
  }

  const update = context.update === undefined ? undefined : normalizeReleaseNotes(context.update)
  const history = sortReleaseHistory([update, ...remote, ...cached, localRelease])
  const latestRelease = history[0] || localRelease
  const currentRelease = history.find(item => item.version === localInfo.distributionVersion) || localRelease
  const updateAvailable = Boolean(
    latestRelease
      && latestRelease.assetName
      && compareVersions(latestRelease.version, localInfo.distributionVersion) > 0,
  )

  return {
    mode: context.mode || 'history',
    offline,
    currentVersion: localInfo.distributionVersion,
    localInfo,
    currentRelease,
    latestRelease: updateAvailable || context.mode === 'update' ? latestRelease : undefined,
    updateAvailable,
    selectedVersion: context.selectedVersion
      || (context.mode === 'update' ? latestRelease.version : currentRelease.version),
    history,
  }
}

function openExternalSafe(value) {
  if (typeof value !== 'string' || value.trim() === '') return
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') void shell.openExternal(url.toString())
  } catch {
    // Release bodies are remote input; reject malformed or non-HTTPS links.
  }
}

function releaseNotesWindowKind(senderId) {
  if (releaseNotesWindow !== undefined && !releaseNotesWindow.isDestroyed() && releaseNotesWindow.webContents.id === senderId) return 'full'
  if (whatsNewWindow !== undefined && !whatsNewWindow.isDestroyed() && whatsNewWindow.webContents.id === senderId) return 'whats-new'
  return undefined
}

function markVersionSeen(version) {
  if (typeof version === 'string' && version.trim() !== '') updateConfig({ lastSeenVersion: version.trim() })
}

function closeWhatsNewWindow() {
  if (whatsNewWindow !== undefined && !whatsNewWindow.isDestroyed()) whatsNewWindow.close()
}

function registerReleaseNotesIpc() {
  ipcMain.handle('release-notes:get-data', async event => {
    const kind = releaseNotesWindowKind(event.sender.id)
    if (kind === 'full') return buildReleaseNotesData(releaseNotesContext)
    if (kind === 'whats-new') {
      const localInfo = getLocalReleaseInfo()
      return {
        mode: 'whats-new',
        currentVersion: localInfo.distributionVersion,
        currentRelease: localInfo.releaseNotes,
      }
    }
    throw new Error('Unknown release notes window')
  })

  ipcMain.on('release-notes:action', (event, action) => {
    const kind = releaseNotesWindowKind(event.sender.id)
    if (kind === undefined || !action || typeof action.type !== 'string') return

    if (action.type === 'close') {
      if (kind === 'full' && releaseNotesWindow !== undefined && !releaseNotesWindow.isDestroyed()) releaseNotesWindow.close()
      if (kind === 'whats-new') closeWhatsNewWindow()
      return
    }

    if (action.type === 'open-url') {
      openExternalSafe(action.url)
      return
    }

    if (action.type === 'update' && kind === 'full') {
      event.sender.send('release-notes:update-state', { label: 'Updater started… / 更新程序已启动…' })
      if (!triggerInPlaceUpdate()) event.sender.send('release-notes:update-state', { label: 'Open the release page in your browser / 已在浏览器打开发布页' })
      return
    }

    if (action.type === 'open-notes' && kind === 'whats-new') {
      closeWhatsNewWindow()
      void openReleaseNotesWindow({ mode: 'history', selectedVersion: getLocalVersion() })
      return
    }

    if (action.type === 'show-about' && kind === 'full') {
      releaseNotesContext = { ...releaseNotesContext, mode: 'about' }
      releaseNotesWindow?.webContents.send('release-notes:reload')
      return
    }

    if (action.type === 'show-notes' && kind === 'full') {
      releaseNotesContext = { ...releaseNotesContext, mode: releaseNotesContext.update ? 'update' : 'history' }
      releaseNotesWindow?.webContents.send('release-notes:reload')
    }
  })
}

async function openReleaseNotesWindow(context = {}) {
  releaseNotesContext = { ...context }
  if (releaseNotesWindow !== undefined && !releaseNotesWindow.isDestroyed()) {
    releaseNotesWindow.show()
    releaseNotesWindow.focus()
    releaseNotesWindow.webContents.send('release-notes:reload')
    return
  }

  const parentWindow = window !== undefined && !window.isDestroyed() && window.isVisible() ? window : undefined
  releaseNotesWindow = new BrowserWindow({
    width: 660,
    height: 580,
    minWidth: 540,
    minHeight: 460,
    show: false,
    title: `${APP_NAME} Updates`,
    icon: iconPath(),
    parent: releaseNotesContext.mode === 'update' ? parentWindow : undefined,
    modal: releaseNotesContext.mode === 'update' && parentWindow !== undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, RELEASE_NOTES_PRELOAD_NAME),
    },
  })
  releaseNotesWindow.on('closed', () => { releaseNotesWindow = undefined })
  releaseNotesWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  try {
    await releaseNotesWindow.loadFile(join(__dirname, RELEASE_NOTES_PAGE_NAME))
    if (releaseNotesWindow !== undefined && !releaseNotesWindow.isDestroyed()) {
      releaseNotesWindow.show()
      releaseNotesWindow.focus()
    }
  } catch (error) {
    if (releaseNotesWindow !== undefined && !releaseNotesWindow.isDestroyed()) releaseNotesWindow.close()
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} Release Notes`,
      message: `Unable to open release notes.\n\n${errorMessage(error)}`,
    })
  }
}

async function showWhatsNewWindow() {
  if (whatsNewWindow !== undefined && !whatsNewWindow.isDestroyed()) {
    whatsNewWindow.showInactive()
    return
  }

  whatsNewWindow = new BrowserWindow({
    width: 430,
    height: 76,
    resizable: false,
    movable: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, RELEASE_NOTES_PRELOAD_NAME),
    },
  })
  whatsNewWindow.on('closed', () => { whatsNewWindow = undefined })
  try {
    await whatsNewWindow.loadFile(join(__dirname, RELEASE_NOTES_PAGE_NAME))
    const workArea = screen.getPrimaryDisplay().workArea
    const [width, height] = whatsNewWindow.getSize()
    whatsNewWindow.setPosition(
      Math.max(workArea.x + 16, workArea.x + workArea.width - width - 24),
      Math.max(workArea.y + 16, workArea.y + workArea.height - height - 24),
    )
    whatsNewWindow.showInactive()
  } catch {
    if (whatsNewWindow !== undefined && !whatsNewWindow.isDestroyed()) whatsNewWindow.close()
  }
}

async function showWhatsNewIfNeeded() {
  const current = getLocalVersion()
  const lastSeen = readConfig().lastSeenVersion
  if (typeof lastSeen !== 'string' || lastSeen.trim() === '') {
    markVersionSeen(current)
    await showWhatsNewWindow()
    return
  }
  if (compareVersions(current, lastSeen) <= 0) return
  markVersionSeen(current)
  await showWhatsNewWindow()
}

function triggerInPlaceUpdate() {
  const root = findPortableRoot(__dirname)
  if (root !== undefined) {
    const updatePs1 = join(root, 'update.ps1')
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', updatePs1], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
    return true
  } else {
    openExternalSafe(`https://github.com/${PORTABLE_RELEASE_REPO}/releases`)
    return false
  }
}

async function checkForUpdates(manual = true) {
  const current = getLocalVersion()
  try {
    const latestInfo = await queryLatestVersion()
    const hasUpdate = compareVersions(latestInfo.version, current) > 0

    if (hasUpdate) {
      closeWhatsNewWindow()
      await openReleaseNotesWindow({ mode: 'update', currentVersion: current, update: latestInfo })
      return
    } else if (manual) {
      await openReleaseNotesWindow({ mode: 'history', selectedVersion: current })
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
    { label: 'Check for Updates / 检查更新', click: () => { void checkForUpdates(true) } },
    { label: 'Release Notes / 更新日志', click: () => { void openReleaseNotesWindow({ mode: 'history' }) } },
    { label: 'About DeepSeek Harness / 关于', click: () => { void openReleaseNotesWindow({ mode: 'about' }) } },
    { label: 'Open Web UI in Browser', click: () => { void openWebUiInBrowser() } },
    { type: 'separator' },
    { label: 'Choose Workspace / 选择工作区', click: () => { void chooseWorkspace() } },
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
  registerReleaseNotesIpc()
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
    void (async () => {
      await showWhatsNewIfNeeded()
      await checkForUpdates(false)
    })()
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
