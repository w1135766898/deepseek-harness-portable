/**
 * Implementation of the `view_image` tool.
 * Reads an image from disk and calls an OpenAI-compatible vision model.
 * @module @dsh-portable/vision-bridge/view-image
 */

import { stat, readFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ViewImageArgs, ViewImageResult, VisionConfig } from './types.ts'

const SUPPORTED_MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const DEFAULT_SYSTEM_PROMPT =
  'You are an expert visual analysis assistant. Carefully inspect the provided image and describe its contents with high accuracy. ' +
  'Extract any visible text, user interface elements, error messages, code blocks, diagrams, chart trends, or technical layouts.'

/** Validated in-memory image supplied to the configured vision endpoint. */
export interface VisionByteInput {
  data: Uint8Array
  mediaType: string
  prompt?: string
}

/** Provider-neutral result returned by the explicit `view_image` path. */
export type VisionAnalysisOutcome =
  | { ok: true; text: string; model: string }
  | { ok: false; message: string; model: string; reason: string }

/** Return the earliest actionable configuration problem, if any. */
export function visionConfigurationIssue(
  cfg: Required<VisionConfig>,
): { message: string; reason: string } | undefined {
  if (!cfg.enabled) {
    return {
      message: 'Vision Bridge is currently disabled. Enable it in Settings → Plugins before using view_image.',
      reason: 'VISION_BRIDGE_DISABLED',
    }
  }
  if (cfg.provider !== 'ollama' && (!cfg.apiKey || cfg.apiKey.trim().length === 0)) {
    return {
      message: 'Vision Bridge has no API key configured. Add one in Settings → Plugins before using view_image.',
      reason: 'VISION_BRIDGE_NOT_CONFIGURED',
    }
  }
  return undefined
}

/** Analyze validated image bytes through the configured OpenAI-compatible endpoint. */
export async function analyzeImageBytes(
  input: VisionByteInput,
  cfg: Required<VisionConfig>,
  signal?: AbortSignal,
): Promise<VisionAnalysisOutcome> {
  const issue = visionConfigurationIssue(cfg)
  if (issue !== undefined) return { ok: false, model: cfg.model, ...issue }

  const endpoint = `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`
  const requestPrompt = input.prompt && input.prompt.trim().length > 0
    ? input.prompt.trim()
    : 'Please analyze and describe the contents of this image in detail.'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey && cfg.apiKey.trim().length > 0) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`
  const payload = {
    model: cfg.model,
    messages: [
      {
        role: 'system',
        content: cfg.prompt && cfg.prompt.trim().length > 0 ? cfg.prompt.trim() : DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: requestPrompt },
          {
            type: 'image_url',
            image_url: { url: `data:${input.mediaType};base64,${Buffer.from(input.data).toString('base64')}` },
          },
        ],
      },
    ],
    temperature: 0.1,
  }
  const timeoutSignal = AbortSignal.timeout(cfg.timeoutMs)
  const combinedSignal = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: combinedSignal,
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const truncated = errorText.length > 300 ? `${errorText.slice(0, 300)}...` : errorText
      return {
        ok: false,
        message: `Vision API call failed with HTTP ${response.status}: ${truncated}`,
        model: cfg.model,
        reason: 'VISION_ANALYSIS_FAILED',
      }
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return {
        ok: false,
        message: 'Vision API returned an empty or invalid response.',
        model: cfg.model,
        reason: 'VISION_ANALYSIS_FAILED',
      }
    }
    return { ok: true, text: content, model: cfg.model }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: `Vision inspection failed: ${message}`,
      model: cfg.model,
      reason: 'VISION_ANALYSIS_FAILED',
    }
  }
}

/**
 * Detect image MIME type from its file extension.
 * @param filePath - Path to the file.
 * @returns MIME string or undefined if not supported.
 */
export function mimeTypeForPath(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  return SUPPORTED_MIME_TYPES[ext]
}

/**
 * Execute the `view_image` tool logic.
 * @param args - Tool invocation arguments.
 * @param exec - Cordis tool execution context.
 * @param getConfig - Accessor for current resolved vision configuration.
 * @returns Structured result with model-generated image description.
 */
export async function executeViewImage(
  args: ViewImageArgs,
  exec: ToolExecution,
  getConfig: () => Required<VisionConfig>,
): Promise<ViewImageResult> {
  const cfg = getConfig()

  const configIssue = visionConfigurationIssue(cfg)
  if (configIssue !== undefined) {
    return {
      text: `Error: ${configIssue.message}`,
      model: cfg.model,
      path: args.path,
      bytes: 0,
      isError: true,
    }
  }

  if (typeof args.path !== 'string' || args.path.trim().length === 0) {
    throw new Error('path must be a non-empty string')
  }

  // 1. Resolve path (absolute or relative to the session workspace)
  const rawPath = args.path.trim()
  // The session header's cwd is the durable session workspace identity; the
  // host process cwd is the fallback when the session carries none.
  const sessionCwd = exec.agent?.session.header.cwd
  const workspaceRoot = sessionCwd ?? process.cwd()
  const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath)

  // 2. MIME type check
  const mime = mimeTypeForPath(targetPath)
  if (mime === undefined) {
    return {
      text: `Error: Cannot inspect "${rawPath}": view_image only supports PNG, JPEG, WebP, and GIF images.`,
      model: cfg.model,
      path: targetPath,
      bytes: 0,
      isError: true,
    }
  }

  // 3. File existence and size check
  let fileStat
  try {
    fileStat = await stat(targetPath)
  } catch (err: unknown) {
    return {
      text: `Error: Image file not found at "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
      model: cfg.model,
      path: targetPath,
      bytes: 0,
      isError: true,
    }
  }

  if (!fileStat.isFile()) {
    return {
      text: `Error: Specified path is a directory, not a file: "${targetPath}"`,
      model: cfg.model,
      path: targetPath,
      bytes: 0,
      isError: true,
    }
  }

  if (fileStat.size > cfg.maxImageBytes) {
    return {
      text: `Error: Image file size (${fileStat.size} bytes) exceeds configured limit of ${cfg.maxImageBytes} bytes.`,
      model: cfg.model,
      path: targetPath,
      bytes: fileStat.size,
      isError: true,
    }
  }

  // 4. Read file bytes and invoke the shared in-memory analysis path.
  const buffer = await readFile(targetPath)
  const analysis = await analyzeImageBytes({
    data: buffer,
    mediaType: mime,
    ...args.prompt === undefined ? {} : { prompt: args.prompt },
  }, cfg, exec.signal)
  return analysis.ok
    ? { text: analysis.text, model: analysis.model, path: targetPath, bytes: buffer.length }
    : { text: analysis.message, model: analysis.model, path: targetPath, bytes: buffer.length, isError: true }
}

/** Format output for model context. */
export function renderViewImageContent(result: ViewImageResult) {
  if (result.isError) {
    return [{ type: 'text' as const, text: result.text }]
  }
  const formatted = `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`
  return [{ type: 'text' as const, text: formatted }]
}
