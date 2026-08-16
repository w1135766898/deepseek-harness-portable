/**
 * Vision bridge configuration and tool argument types.
 * @module @dsh-portable/vision-bridge/types
 */

/** Vision service provider flavor. */
export type VisionProviderType = 'openai' | 'ollama' | 'compatible'

/** Host-side configuration schema definition. */
export interface VisionConfig {
  /** Whether the vision bridge capability is enabled. */
  enabled?: boolean
  /** Provider type indicator. */
  provider?: VisionProviderType | string
  /** Vision model id to invoke (e.g. gpt-4o-mini, qwen-vl-max). */
  model?: string
  /** Base URL for OpenAI-compatible completions endpoint. */
  baseURL?: string
  /** API key secret for authentication. */
  apiKey?: string
  /** Maximum image size in bytes admitted by the tool. */
  maxImageBytes?: number
  /** Request timeout in milliseconds. */
  timeoutMs?: number
  /** Custom system prompt override for vision analysis. */
  prompt?: string
}

/** Validated arguments for the view_image tool. */
export interface ViewImageArgs {
  /** Path to the image file (absolute, or relative to current workspace). */
  path: string
  /** Optional custom instruction; defaults to describing the image contents. */
  prompt?: string
}

/** Structured output returned by the view_image tool. */
export interface ViewImageResult {
  /** High-fidelity textual description / analysis of the image. */
  text: string
  /** The model identifier that produced the description. */
  model: string
  /** Normalized path of the inspected image. */
  path: string
  /** Image file size in bytes. */
  bytes: number
  /** Optional error indicator if fallback failed. */
  isError?: boolean
}
