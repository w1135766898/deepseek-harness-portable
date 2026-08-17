import { TRANSPORT_PROTOCOL, parseLearningActivity, } from "./protocol.js";
const MARKER_PREFIX = '<!--dsh-learning/transport@1:';
const MARKER_SUFFIX = '-->';
const QUESTION_ID_PREFIX = 'dsh-learning/transport@1:';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let result = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const a = bytes[index];
        const b = bytes[index + 1];
        const c = bytes[index + 2];
        const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
        result += BASE64URL[(triple >> 18) & 63];
        result += BASE64URL[(triple >> 12) & 63];
        if (b !== undefined)
            result += BASE64URL[(triple >> 6) & 63];
        if (c !== undefined)
            result += BASE64URL[triple & 63];
    }
    return result;
}
function decodeBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
        return undefined;
    const bytes = [];
    for (let index = 0; index < value.length; index += 4) {
        const a = BASE64URL.indexOf(value[index]);
        const b = BASE64URL.indexOf(value[index + 1]);
        const c = value[index + 2] === undefined ? 0 : BASE64URL.indexOf(value[index + 2]);
        const d = value[index + 3] === undefined ? 0 : BASE64URL.indexOf(value[index + 3]);
        if (a < 0 || b < 0 || c < 0 || d < 0)
            return undefined;
        const triple = (a << 18) | (b << 12) | (c << 6) | d;
        bytes.push((triple >> 16) & 255);
        if (value[index + 2] !== undefined)
            bytes.push((triple >> 8) & 255);
        if (value[index + 3] !== undefined)
            bytes.push(triple & 255);
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    }
    catch {
        return undefined;
    }
}
function decodeEnvelope(value) {
    const json = decodeBase64Url(value);
    if (json === undefined)
        return undefined;
    try {
        const parsed = JSON.parse(json);
        if (parsed.transport !== TRANSPORT_PROTOCOL
            || typeof parsed.activityId !== 'string' || parsed.activityId === '')
            return undefined;
        return {
            transport: TRANSPORT_PROTOCOL,
            activityId: parsed.activityId,
            activity: parseLearningActivity(parsed.activity),
        };
    }
    catch {
        return undefined;
    }
}
/**
 * Encode the package-owned envelope in the question id. Generic question
 * clients do not render ids, so an incompatible Client sees only the readable
 * prompt and Markdown fallback instead of a Base64 transport marker.
 */
export function encodeLearningQuestionId(input) {
    const envelope = { transport: TRANSPORT_PROTOCOL, ...input };
    return `${QUESTION_ID_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}`;
}
/** Decode and revalidate a package-owned question id. */
export function decodeLearningQuestionId(value) {
    if (typeof value !== 'string' || !value.startsWith(QUESTION_ID_PREFIX))
        return undefined;
    return decodeEnvelope(value.slice(QUESTION_ID_PREFIX.length));
}
/**
 * Legacy transport retained for pending waits created by older package
 * versions. New requests use encodeLearningQuestionId so generic renderers do
 * not expose the machine envelope.
 */
export function encodeLearningDetail(input) {
    const envelope = { transport: TRANSPORT_PROTOCOL, ...input };
    return `${MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${envelope.activity.fallbackMarkdown}`;
}
/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
export function decodeLearningDetail(detail) {
    if (typeof detail !== 'string' || !detail.startsWith(MARKER_PREFIX))
        return undefined;
    const end = detail.indexOf(MARKER_SUFFIX, MARKER_PREFIX.length);
    if (end < 0)
        return undefined;
    return decodeEnvelope(detail.slice(MARKER_PREFIX.length, end));
}
//# sourceMappingURL=transport.js.map