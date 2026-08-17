import { spawn, type ChildProcess } from 'node:child_process';
export interface BrowserCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: {
        readonly windowsHide?: boolean;
    };
}
export declare function browserCommand(url: string, platform?: NodeJS.Platform): BrowserCommand;
export declare function openBrowser(url: string, options?: {
    readonly platform?: NodeJS.Platform;
    readonly spawnImpl?: typeof spawn;
}): ChildProcess;
//# sourceMappingURL=open-browser.d.ts.map