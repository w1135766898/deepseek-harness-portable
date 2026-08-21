/** Model-route selection and transient message rewriting for hybrid vision. */
import { contentHasImage, OFFLOADED_IMAGE_TEXT, } from '@deepseek-ai/dsh-llm';
import { imageInputCapability, modelSupportsImages, selectVisionRoute, } from "./model-selection.js";
import { formatVisualEvidenceForModel, parseVisualEvidence, } from "./hybrid-evidence.js";
/** Return the history suffix after the latest assistant message. */
export function currentTurnMessages(messages) {
    let lastAssistant = -1;
    for (const [index, message] of messages.entries()) {
        if (message.role === 'assistant')
            lastAssistant = index;
    }
    return messages.slice(lastAssistant + 1);
}
/**
 * Detect images in the current turn only.
 *
 * Looking at the whole derived history would keep a text-only conversation on
 * the vision route forever after its first image. The loop builds requests
 * from the full history, so the latest assistant boundary is the useful
 * stateless approximation when a Host does not already have turn events.
 */
export function currentTurnHasImage(messages) {
    return currentTurnMessages(messages).some(message => contentHasImage(message.content));
}
/** Alias for callers that phrase the question as a predicate. */
export const hasCurrentTurnImage = currentTurnHasImage;
/** Pick native image input, fallback vision analysis, or ordinary text. */
export function selectHybridRoute(input) {
    const turn = input.currentTurnMessages ?? (input.messages === undefined ? [] : currentTurnMessages(input.messages));
    const hasImage = input.hasImage ?? turn.some(message => contentHasImage(message.content));
    if (!hasImage)
        return { ok: true, kind: 'text', route: input.current, hasImage: false };
    if (modelSupportsImages(input.current, input.catalog)) {
        return { ok: true, kind: 'native-image', route: input.current, hasImage: true };
    }
    const vision = selectVisionRoute(input.vision, input.catalog);
    if (!vision.ok)
        return vision;
    return {
        ok: true,
        kind: 'vision-fallback',
        route: input.current,
        visionRoute: vision.route,
        hasImage: true,
    };
}
/** Alias used by Host code that calls the operation a model-route selection. */
export const selectHybridModelRoute = selectHybridRoute;
/** True when the active model is known to accept image input. */
export function currentRouteAcceptsImages(current, catalog) {
    return imageInputCapability(current, catalog) === 'supported';
}
/** Replace image blocks without mutating the immutable session messages. */
function replaceBlocks(blocks, replacement) {
    let changed = false;
    const next = [];
    for (const block of blocks) {
        if (block.type === 'image') {
            next.push(replacement(block));
            changed = true;
        }
        else if (block.type === 'tool-result') {
            const content = replaceBlocks(block.content, replacement);
            next.push(content === block.content ? block : { ...block, content });
            changed ||= content !== block.content;
        }
        else {
            next.push(block);
        }
    }
    return changed ? next : blocks;
}
/**
 * Replace images with one aggregate evidence block for the current turn and a
 * text-only omission marker for older history. The returned messages are
 * transient and can safely be passed to a text adapter without changing the
 * durable image-bearing user message.
 */
export function replaceImagesWithEvidence(messages, evidence, turnMessages = currentTurnMessages(messages)) {
    const turnIds = new Set(turnMessages.map(message => String(message.id)));
    const evidenceText = formatVisualEvidenceForModel(evidence);
    let emittedEvidence = false;
    return messages.map((message) => {
        const isCurrentTurn = turnIds.has(String(message.id));
        const content = replaceBlocks(message.content, () => {
            if (isCurrentTurn && !emittedEvidence) {
                emittedEvidence = true;
                return { type: 'text', text: evidenceText };
            }
            return {
                type: 'text',
                text: isCurrentTurn
                    ? '[additional image represented by the visual evidence above]'
                    : OFFLOADED_IMAGE_TEXT,
            };
        });
        return content === message.content ? message : { ...message, content };
    });
}
/** Alias for the common "rewrite image content" phrasing. */
export const rewriteImagesAsEvidence = replaceImagesWithEvidence;
/** Build a text block suitable for appending as a model-facing evidence message. */
export function visualEvidenceText(evidence) {
    return formatVisualEvidenceForModel(evidence);
}
/**
 * Select a route and, for a text-only image round, ask the Host callback for
 * visual evidence and return a transient text-only request. The callback is
 * deliberately injected so this helper can run from either `agent/pre-step`
 * or a Host-owned dispatch seam without recursively entering `llm/stream`.
 */
export async function prepareHybridRequest(request, options) {
    const selection = selectHybridRoute({ ...options, messages: options.messages ?? request.messages });
    if (!selection.ok)
        return selection;
    if (selection.kind !== 'vision-fallback')
        return { ok: true, route: selection, request };
    if (options.analyze === undefined) {
        return {
            ok: false,
            reason: 'VISION_ANALYZER_UNAVAILABLE',
            message: 'A text-only model received an image, but no visual evidence analyzer is installed.',
        };
    }
    const turn = options.currentTurnMessages ?? currentTurnMessages(request.messages);
    const result = await options.analyze({ messages: turn, signal: request.signal });
    const evidence = parseVisualEvidence(result);
    return {
        ok: true,
        route: selection,
        request: { ...request, messages: replaceImagesWithEvidence(request.messages, evidence, turn) },
        evidence,
    };
}
/** Prompt text for a Host callback that wants provider JSON rather than prose. */
export const VISUAL_EVIDENCE_INSTRUCTION = [
    'Inspect the supplied image(s) and return JSON only.',
    'Use exactly these top-level keys: summary, ocr, layout, objects, coordinates, semantics.',
    'Include readable OCR text, layout regions, detected objects or UI targets, coordinates or bounding boxes, and semantic relations when present.',
    'Use numeric x, y, width, height values for boxes and numeric x, y values for points; omit unknown values rather than guessing.',
].join(' ');
//# sourceMappingURL=hybrid-routing.js.map