/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 * @module @dsh-portable/vision-bridge
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { VisionConfig } from './types.ts';
export * from './types.ts';
export declare const name = "vision-bridge";
export declare const inject: string[];
export type Config = VisionConfig;
export declare const Config: z<VisionConfig>;
export declare const VISION_SETTINGS_NAMESPACE: any;
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map