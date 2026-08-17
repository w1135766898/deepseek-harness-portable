import { spawn, type ChildProcess } from 'node:child_process'

export interface BrowserCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly options: { readonly windowsHide?: boolean }
}

export function browserCommand(url: string, platform = process.platform): BrowserCommand {
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url], options: { windowsHide: true } }
  }
  if (platform === 'darwin') return { command: 'open', args: [url], options: {} }
  return { command: 'xdg-open', args: [url], options: {} }
}

export function openBrowser(
  url: string,
  options: {
    readonly platform?: NodeJS.Platform
    readonly spawnImpl?: typeof spawn
  } = {},
): ChildProcess {
  const spec = browserCommand(url, options.platform)
  const child = (options.spawnImpl ?? spawn)(spec.command, [...spec.args], {
    ...spec.options,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return child
}
