/**
 * Vision bridge configuration and tool vocabulary.
 * @module @dsh-portable/vision-bridge/types
 */

/**
 * Host-side configuration schema definition.
 *
 * Credentials and endpoints are deliberately absent: image analysis runs on the
 * providers the deployment has already configured, so the vision route is a
 * selection over the kernel's model catalog rather than a second, parallel set
 * of secrets to keep in sync.
 */
export interface VisionConfig {
  /** Whether the explicit `view_image` capability is offered at all. */
  enabled?: boolean
  /** Model id to pin; empty selects the first image-capable model in the shared catalog. */
  model?: string
}

/** Validated arguments for the view_image tool. */
export interface ViewImageArgs {
  /** Path to the image file (absolute, or relative to the session workspace). */
  path: string
  /** Optional custom instruction; defaults to describing the image contents. */
  prompt?: string
}

/** Structured output returned by the view_image tool. */
export interface ViewImageResult {
  /** Textual description or analysis of the image, or the failure explanation. */
  text: string
  /** Provider route that produced the description. */
  provider: string
  /** Model identifier that produced the description. */
  model: string
  /** Normalized path of the inspected image. */
  path: string
  /** Encoded image size in bytes. */
  bytes: number
  /** Intrinsic image width in pixels, once the attachment store has decoded it. */
  width?: number
  /** Intrinsic image height in pixels, once the attachment store has decoded it. */
  height?: number
  /** Stable machine-routing code for a failure; absent on success. */
  reason?: string
  /** Whether this result reports a failure. */
  isError?: boolean
}
