export const RUNTIME_PROTOCOL_VERSION: 1
export const RUNTIME_PROTOCOL_ENV: 'DSH_RUNTIME_PROTOCOL_VERSION'
export const RUNTIME_EVENT_PREFIX: '@@DSH_RUNTIME@@'

export interface RuntimeHelloEvent {
  protocolVersion: 1
  type: 'hello'
  pid: number
}

export interface RuntimeListeningEvent {
  protocolVersion: 1
  type: 'listening'
  url: string
}

export interface RuntimeDiagnosticEvent {
  protocolVersion: 1
  type: 'diagnostic'
  code: string
  component: string
  severity: 'warning' | 'error'
  message: string
  recoverable: boolean
}

export type RuntimeEvent = RuntimeHelloEvent | RuntimeListeningEvent | RuntimeDiagnosticEvent

export function protocolEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
export function protocolEnabled(environment?: NodeJS.ProcessEnv): boolean
export function runtimeLaunchArguments(options?: { host?: string; port?: number; open?: boolean }): string[]
export function assertRuntimeEvent(value: unknown): RuntimeEvent
export function encodeRuntimeEvent(event: RuntimeEvent): string
export function createRuntimeEventDecoder(onEvent: (event: RuntimeEvent) => void): {
  push(chunk: string | Buffer): void
  end(): void
}
