/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 *
 * The plugin contributes one explicit `view_image` tool that analyzes local
 * image files or re-analyzes durable images already referenced by the current
 * session. Everything underneath it — provider credentials, model capability,
 * durable image storage, retry and metering — belongs to the kernel services
 * this plugin injects, so there is no parallel endpoint or secret to configure.
 * @module @dsh-portable/vision-bridge
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { VisionConfig } from './types.ts';
export * from './types.ts';
export * from './model-selection.ts';
export * from './hybrid-evidence.ts';
export * from './hybrid-routing.ts';
export * from './hybrid-host.ts';
export declare const name = "vision-bridge";
export declare const inject: string[];
export type Config = VisionConfig;
export declare const Config: z<VisionConfig>;
export declare const VISION_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/**
 * Register the vision bridge on a host context.
 * @param ctx - the injecting cordis context.
 * @param config - entry configuration merged under the stored settings.
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map