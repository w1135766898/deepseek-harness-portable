/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 * @module @dsh-portable/vision-bridge
 */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { executeViewImage, renderViewImageContent } from "./view-image.js";
export * from "./types.js";
export const name = 'vision-bridge';
export const inject = ['tools', 'systemPrompt'];
export const Config = z.object({
    enabled: z.boolean().default(true),
    provider: z.string().default('compatible'),
    model: z.string().default('gpt-4o-mini'),
    baseURL: z.string().default('https://api.openai.com/v1'),
    apiKey: z.string().role('secret').default(''),
    maxImageBytes: z.number().default(20 * 1024 * 1024),
    timeoutMs: z.number().default(60_000),
    prompt: z.string().default(''),
});
export const VISION_SETTINGS_NAMESPACE = settingsNamespace('vision');
const HOOKED = Symbol('vision-bridge-settings-hook');
/** Map one redacted settings descriptor to its wire view (matching api-proxy.ts:1929). */
function toView(descriptor) {
    return {
        ns: String(descriptor.ns),
        schema: descriptor.schema,
        value: descriptor.value,
        ...descriptor.base === undefined ? {} : { base: descriptor.base },
        ...descriptor.user === undefined ? {} : { user: descriptor.user },
        applies: descriptor.applies,
        secrets: (descriptor.secrets ?? []).map(secret => ({ path: [...secret.path], set: secret.set })),
        revision: descriptor.revision,
    };
}
export function apply(ctx, config = {}) {
    const resolved = Config(config);
    // 1) Bind settings namespace (reads user settings.yaml -> fallback to entry config -> schema default)
    let currentConfig = () => resolved;
    installSettingsSection(ctx, VISION_SETTINGS_NAMESPACE, Config, resolved, {
        setSource: thunk => {
            currentConfig = thunk;
        },
        onChange: () => { },
    });
    // 2) Hook apiProxy.settings to expose 'vision' to web clients and handle its mutations
    ctx.inject(['apiProxy', 'settings'], (scopeCtx) => {
        const settingsApi = scopeCtx.apiProxy.settings;
        if (settingsApi === undefined || settingsApi[HOOKED])
            return;
        settingsApi[HOOKED] = true;
        const rawDescribe = settingsApi.describe.bind(settingsApi);
        const rawMutate = settingsApi.mutate.bind(settingsApi);
        settingsApi.describe = async (request) => {
            const response = await rawDescribe(request);
            if (!response.result.ok)
                return response;
            const namespaces = response.result.value.namespaces;
            if (namespaces.some(entry => entry.ns === 'vision'))
                return response;
            const descriptor = scopeCtx.settings
                .describe({ redactSecrets: true })
                .find(entry => String(entry.ns) === 'vision');
            if (descriptor !== undefined)
                namespaces.push(toView(descriptor));
            return response;
        };
        settingsApi.mutate = async (request) => {
            const { ns, ops, expectedRevision } = request.payload;
            if (ns !== 'vision')
                return rawMutate(request);
            try {
                await scopeCtx.settings.mutate(VISION_SETTINGS_NAMESPACE, ops, expectedRevision);
                const updated = scopeCtx.settings
                    .describe({ redactSecrets: true })
                    .find(entry => String(entry.ns) === 'vision');
                if (updated === undefined)
                    throw new Error('vision namespace vanished after write');
                return {
                    rpcId: request.rpcId,
                    result: { ok: true, value: toView(updated) },
                };
            }
            catch (error) {
                return {
                    rpcId: request.rpcId,
                    result: {
                        ok: false,
                        error: {
                            code: 'settings-rejected',
                            message: error instanceof Error ? error.message : String(error),
                            details: {},
                        },
                    },
                };
            }
        };
    });
    // 3) Register global view_image tool on Host level (visible to all agents without modifying presets)
    ctx.tools.register(defineTool({
        name: 'view_image',
        description: 'Inspect and describe an image file using an external vision model. Supports PNG, JPEG, WebP, and GIF images. ' +
            'Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images on disk.',
        parameters: {
            path: {
                type: 'string',
                required: true,
                description: 'Absolute path or workspace-relative path to the image file.',
            },
            prompt: {
                type: 'string',
                description: 'Specific question or instruction for the vision model (e.g. "Extract the error code from this dialog").',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    text: { type: 'string', required: true },
                    model: { type: 'string', required: true },
                    path: { type: 'string', required: true },
                    bytes: { type: 'number' },
                    isError: { type: 'boolean' },
                },
            },
            render: (_args, value) => renderViewImageContent(value),
        },
        timeoutMs: resolved.timeoutMs,
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            return executeViewImage(args, exec, currentConfig);
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `Inspect image ${args.path}`,
                kind: 'read',
                locations: [{ path: args.path }],
            };
        },
    }));
    // 4) System prompt guidance section
    ctx.systemPrompt.section({
        name: 'tool:view_image',
        order: 150,
        text: 'Use the view_image tool when the user provides or asks about an image file: it inspects and describes the image with an external vision model.',
    });
}
//# sourceMappingURL=index.js.map