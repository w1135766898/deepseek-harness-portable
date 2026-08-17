import { spawn } from 'node:child_process';
export function browserCommand(url, platform = process.platform) {
    if (platform === 'win32') {
        return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url], options: { windowsHide: true } };
    }
    if (platform === 'darwin')
        return { command: 'open', args: [url], options: {} };
    return { command: 'xdg-open', args: [url], options: {} };
}
export function openBrowser(url, options = {}) {
    const spec = browserCommand(url, options.platform);
    const child = (options.spawnImpl ?? spawn)(spec.command, [...spec.args], {
        ...spec.options,
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    return child;
}
//# sourceMappingURL=open-browser.js.map