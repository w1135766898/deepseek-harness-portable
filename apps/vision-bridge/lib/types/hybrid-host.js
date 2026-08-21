/** Host middleware for routing image turns through the selected vision model. */
import { contentHasImage, createUserMessage, } from '@deepseek-ai/dsh-llm';
import { formatVisualEvidenceForModel, parseVisualEvidence, } from "./hybrid-evidence.js";
import { modelSupportsImages, selectVisionRoute, } from "./model-selection.js";
import { VISUAL_EVIDENCE_INSTRUCTION } from "./hybrid-routing.js";
function routeConfig(config) {
    return {
        enabled: config.enabled === true,
        model: config.model ?? '',
    };
}
async function catalogOf(runtime, options) {
    if (options.catalog !== undefined)
        return await options.catalog();
    const providers = runtime.listProviders();
    const models = await Promise.all(providers.map(async (provider) => {
        try {
            return await runtime.listModels(provider.id);
        }
        catch {
            return [];
        }
    }));
    return models.flat();
}
function routeFromAssembly(assembly) {
    const provider = assembly.variables.provider;
    const model = assembly.variables.model;
    return provider === undefined || model === undefined || provider === '' || model === ''
        ? undefined
        : { provider, model };
}
function routeFromAgent(agent) {
    const provider = agent.options?.provider;
    const model = agent.options?.model;
    return provider === undefined || model === undefined || provider === '' || model === ''
        ? undefined
        : { provider, model };
}
function evidenceMessage(evidence, original) {
    // Keep ordinary text from a mixed text+image user message visible after its
    // image-bearing event is replaced on the model surface.
    const text = original.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
    const evidenceText = formatVisualEvidenceForModel(evidence);
    return createUserMessage({
        content: [{ type: 'text', text: text === '' ? evidenceText : `${text}\n\n${evidenceText}` }],
        source: { kind: 'plugin', plugin: 'vision-bridge' },
    });
}
function continueFromEvidenceMessage() {
    return createUserMessage({
        content: [{
                type: 'text',
                text: 'Answer the user\'s request using the structured visual evidence already added above.',
            }],
        source: { kind: 'plugin', plugin: 'vision-bridge' },
    });
}
async function analyzeWithRuntime(runtime, route, messages, signal) {
    const instruction = createUserMessage({
        content: [{ type: 'text', text: VISUAL_EVIDENCE_INSTRUCTION }],
        source: { kind: 'plugin', plugin: 'vision-bridge' },
    });
    let text = '';
    for await (const chunk of runtime.stream({
        provider: route.provider,
        model: route.model,
        messages: [instruction, ...messages],
        temperature: 0,
        signal,
    })) {
        if (chunk.type === 'text-delta')
            text += chunk.text;
        if (chunk.type === 'block-end' && chunk.block.type === 'text' && text === '')
            text = chunk.block.text;
        if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            throw new Error(chunk.reason.failure.message);
        }
    }
    return text;
}
/**
 * Install the only durable bridge point available before agent-loop request
 * construction. The returned resolver is deliberately separate from the
 * runtime's resolver: native capability checks in this middleware always use
 * the unmodified catalog, while api-proxy may use the returned resolver solely
 * to admit a text-only model when a fallback route is configured.
 *
 * Typical Host wiring:
 *
 * ```ts
 * const hybrid = installHybridVisionRouting(ctx, getVisionConfig, ctx.llm)
 * // api-proxy's image admission calls hybrid.resolveModelInfo(...)
 * // dispose hybrid when the plugin context is torn down
 * ```
 */
export function installHybridVisionRouting(ctx, getConfig, runtime, options = {}) {
    const assembledRoutes = new WeakMap();
    const originalResolveModelInfo = runtime.resolveModelInfo.bind(runtime);
    const resolveModelInfo = async (provider, model, signal) => {
        const resolved = await originalResolveModelInfo(provider, model, signal);
        // Unknown capability is already admitted by api-proxy. Only explicit
        // text-only metadata needs the bridge capability for the current request.
        if (resolved.inputModalities === undefined || resolved.inputModalities.includes('image'))
            return resolved;
        const config = routeConfig(await getConfig());
        const catalog = await catalogOf(runtime, options);
        const vision = selectVisionRoute(config, catalog);
        if (!vision.ok)
            return resolved;
        return { ...resolved, inputModalities: ['text', 'image'] };
    };
    const assemblyDispose = ctx.on('system-prompt/assemble', async (assemblyValue, contextValue, next) => {
        const assembled = await next();
        const context = contextValue;
        const agent = context?.agent;
        const route = routeFromAssembly(assembled);
        if (agent !== undefined && route !== undefined)
            assembledRoutes.set(agent, route);
        return assembled;
    });
    const preStepDispose = ctx.on('agent/pre-step', async (payloadValue, next) => {
        const payload = payloadValue;
        const decision = await next();
        if (decision.kind !== 'enter' || decision.messages === undefined || decision.messages.length === 0)
            return decision;
        const current = assembledRoutes.get(payload.agent) ?? routeFromAgent(payload.agent);
        if (current === undefined)
            return decision;
        const turnMessages = decision.messages;
        if (!turnMessages.some(message => contentHasImage(message.content)))
            return decision;
        const catalog = await catalogOf(runtime, options);
        if (modelSupportsImages(current, catalog))
            return decision;
        const vision = selectVisionRoute(routeConfig(await getConfig()), catalog);
        if (!vision.ok) {
            // Admission can race with provider/settings changes. Never return the
            // original image here: the selected text-only model must not receive
            // an image that the bridge failed to analyze.
            throw new Error(vision.message);
        }
        const rawEvidence = options.analyze === undefined
            ? await analyzeWithRuntime(runtime, vision.route, turnMessages, payload.signal)
            : await options.analyze({ route: vision.route, messages: turnMessages, signal: payload.signal });
        const evidence = parseVisualEvidence(rawEvidence);
        const remaining = [];
        let replacedImageMessage = false;
        for (const message of turnMessages) {
            if (!contentHasImage(message.content)) {
                remaining.push(message);
                continue;
            }
            replacedImageMessage = true;
            const originalEvent = payload.agent.session.append('user/message', message, { surfaceOp: 'append' });
            payload.agent.session.append('user/message', evidenceMessage(evidence, message), {
                surfaceOp: { op: 'replace', start: originalEvent.seq, end: originalEvent.seq },
                sourceEventSeqs: [originalEvent.seq],
            });
        }
        // The agent loop treats an empty pre-step decision as a completed turn.
        // Keep the original image as the append-origin transcript event, keep
        // its evidence replacement model-only, and return one small context
        // message so the original text model actually performs this step.
        return {
            ...decision,
            messages: replacedImageMessage
                ? [...remaining, continueFromEvidenceMessage()]
                : remaining,
        };
    });
    return {
        dispose: () => {
            assemblyDispose();
            preStepDispose();
        },
        resolveModelInfo,
        currentRoute: agent => assembledRoutes.get(agent),
    };
}
//# sourceMappingURL=hybrid-host.js.map