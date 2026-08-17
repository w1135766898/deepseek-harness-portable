const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function nativeShellState(platform = process.platform, pathExists = existsSync) {
  if (platform === 'win32') {
    return { platform, native: false, available: false, probed: false, distros: [], executable: 'wsl.exe' }
  }
  const available = pathExists('/bin/bash')
  return {
    platform,
    native: true,
    available,
    probed: true,
    distros: available ? [platform === 'darwin' ? 'macOS Bash' : 'POSIX Bash'] : [],
    executable: '/bin/bash',
  }
}

function iconPath(assets, platform = process.platform) {
  const candidates = platform === 'darwin'
    ? ['deepseek.icns', 'deepseek.png', 'deepseek.ico']
    : platform === 'linux'
      ? ['deepseek.png', 'deepseek.ico']
      : ['deepseek.ico', 'deepseek.png']
  return candidates
    .map(name => join(assets, name))
    .find(path => existsSync(path)) || join(assets, candidates[0])
}

function releaseAssetName(version, platform = process.platform, arch = process.arch) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || version === '0.0.0') return undefined
  if (platform === 'darwin') return `DeepSeek-Harness-${version}-darwin-arm64.dmg`
  if (platform === 'linux') return `DeepSeek-Harness-${version}-linux-${arch === 'arm64' ? 'arm64' : 'x64'}.AppImage`
  return `DeepSeek-Harness-${version}-win32-x64.zip`
}

function browserCommand(url, platform = process.platform) {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url], options: { windowsHide: true } }
  if (platform === 'darwin') return { command: 'open', args: [url], options: {} }
  return { command: 'xdg-open', args: [url], options: {} }
}

function openBrowser(url, { platform = process.platform, spawnImpl = spawn } = {}) {
  const spec = browserCommand(url, platform)
  const child = spawnImpl(spec.command, spec.args, { ...spec.options, detached: true, stdio: 'ignore' })
  if (child && typeof child.unref === 'function') child.unref()
  return child
}

module.exports = {
  browserCommand,
  iconPath,
  nativeShellState,
  openBrowser,
  releaseAssetName,
}
