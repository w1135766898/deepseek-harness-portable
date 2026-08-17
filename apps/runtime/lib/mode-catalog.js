import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { resolveVariant, } from './mode-resolver.js';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
function stringArray(value, path) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
        throw new Error(`${path} must be an array of non-empty strings`);
    }
    return value;
}
function stringMap(value, path) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`${path} must be an object`);
    const entries = Object.entries(value);
    if (entries.some(([key, item]) => key.length === 0 || typeof item !== 'string' || item.length === 0)) {
        throw new Error(`${path} must map non-empty strings to non-empty strings`);
    }
    return Object.fromEntries(entries);
}
/** Parse and validate one mode contract without evaluating composition JavaScript tags. */
export function parseModeDefinition(source, path) {
    const raw = yaml.load(source);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        throw new Error(`${path} must contain an object`);
    if (typeof raw.id !== 'string' || raw.id.length === 0)
        throw new Error(`${path}: id must be a non-empty string`);
    if (typeof raw.contract !== 'object' || raw.contract === null || Array.isArray(raw.contract)) {
        throw new Error(`${path}: contract must be an object`);
    }
    if (raw.baseConfig !== undefined && (typeof raw.baseConfig !== 'string' || raw.baseConfig.length === 0)) {
        throw new Error(`${path}: baseConfig must be a non-empty string`);
    }
    if (!Array.isArray(raw.variants) || raw.variants.length === 0)
        throw new Error(`${path}: variants must be a non-empty array`);
    const variants = raw.variants.map((value, index) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new Error(`${path}: variant ${String(index + 1)} must be an object`);
        }
        const item = value;
        if (typeof item.id !== 'string' || item.id.length === 0
            || (item.supportLevel !== 'native' && item.supportLevel !== 'compatible' && item.supportLevel !== 'alternative')
            || typeof item.config !== 'string' || item.config.length === 0) {
            throw new Error(`${path}: variant ${String(index + 1)} has an invalid id, supportLevel, or config`);
        }
        return {
            id: item.id,
            supportLevel: item.supportLevel,
            requires: stringArray(item.requires, `${path}: variant ${item.id}.requires`),
            ...(item.acceptsDegraded === undefined
                ? {}
                : { acceptsDegraded: stringArray(item.acceptsDegraded, `${path}: variant ${item.id}.acceptsDegraded`) }),
            ...(item.limitations === undefined
                ? {}
                : { limitations: stringArray(item.limitations, `${path}: variant ${item.id}.limitations`) }),
            config: item.config,
            ...(item.provides === undefined ? {} : { provides: stringMap(item.provides, `${path}: variant ${item.id}.provides`) }),
        };
    });
    return {
        id: raw.id,
        ...(raw.baseConfig === undefined ? {} : { baseConfig: raw.baseConfig }),
        contract: raw.contract,
        variants,
    };
}
function safeConfigPath(directory, relative) {
    const target = resolve(directory, relative);
    if (target !== directory && !target.startsWith(`${directory}/`) && !target.startsWith(`${directory}\\`)) {
        throw new Error(`mode config escapes its directory: ${relative}`);
    }
    return target;
}
/** Compose a stable base with one small platform implementation fragment. */
export async function composeModeVariant(directory, definition, variant) {
    const parts = [];
    if (definition.baseConfig !== undefined)
        parts.push(await readFile(safeConfigPath(directory, definition.baseConfig), 'utf8'));
    parts.push(await readFile(safeConfigPath(directory, variant.config), 'utf8'));
    return `${parts.map(part => part.trim()).filter(Boolean).join('\n\n')}\n`;
}
function compositionRows(source) {
    const lines = source.split(/\r?\n/u);
    const rows = [];
    for (let index = 0; index < lines.length; index += 1) {
        const match = /^\s*-\s+id:\s*['"]?([^'"\s]+)['"]?\s*$/u.exec(lines[index] ?? '');
        if (match?.[1] === undefined)
            continue;
        let name;
        let disabled = false;
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
            const line = lines[cursor] ?? '';
            const nextRow = /^(\s*)-\s+id:/u.exec(line);
            if (nextRow !== null)
                break;
            const nameMatch = /^\s+name:\s*['"]?([^'"]+)['"]?\s*$/u.exec(line);
            if (nameMatch?.[1] !== undefined)
                name = nameMatch[1];
            if (/^\s+disabled:\s*true\s*$/u.test(line))
                disabled = true;
        }
        rows.push({ id: match[1], ...(name === undefined ? {} : { name }), disabled });
    }
    return rows;
}
function contractStringArray(value, label) {
    if (value === undefined)
        return [];
    return stringArray(value, label);
}
/** Fail loud when the final model-facing composition diverges from its stable contract. */
export function validateModeComposition(definition, variant, source) {
    const rows = compositionRows(source);
    const rowIds = new Set(rows.map(row => row.id));
    const contract = definition.contract;
    const tools = typeof contract.tools === 'object' && contract.tools !== null
        ? contract.tools
        : {};
    const composition = typeof contract.composition === 'object' && contract.composition !== null
        ? contract.composition
        : {};
    const required = [
        ...contractStringArray(tools.requiredRows, `${definition.id}.contract.tools.requiredRows`),
        ...contractStringArray(composition.requiredRows, `${definition.id}.contract.composition.requiredRows`),
    ];
    const missing = required.filter(id => !rowIds.has(id));
    if (missing.length > 0)
        throw new Error(`mode ${definition.id}/${variant.id} is missing contract rows: ${missing.join(', ')}`);
    const forbidden = contractStringArray(composition.forbiddenRows, `${definition.id}.contract.composition.forbiddenRows`)
        .filter(id => rowIds.has(id));
    if (forbidden.length > 0)
        throw new Error(`mode ${definition.id}/${variant.id} contains forbidden rows: ${forbidden.join(', ')}`);
    const slots = tools.variantSlots;
    if (slots !== undefined) {
        if (typeof slots !== 'object' || slots === null || Array.isArray(slots)) {
            throw new Error(`${definition.id}.contract.tools.variantSlots must be an object`);
        }
        for (const [slot, choicesValue] of Object.entries(slots)) {
            const choices = stringArray(choicesValue, `${definition.id}.contract.tools.variantSlots.${slot}`);
            const present = choices.filter(id => rowIds.has(id));
            const declared = variant.provides?.[slot];
            if (present.length !== 1 || declared === undefined || present[0] !== declared) {
                throw new Error(`mode ${definition.id}/${variant.id} must provide exactly one ${slot} row (${choices.join(', ')})`);
            }
        }
    }
    const exactRows = tools.exactRows === undefined
        ? contractStringArray(tools.requiredRows, `${definition.id}.contract.tools.requiredRows`)
        : contractStringArray(tools.exactRows, `${definition.id}.contract.tools.exactRows`);
    if (exactRows.length > 0) {
        const enabledToolRows = rows
            .filter(row => !row.disabled && (row.name?.includes('/dsh-tool-') || row.name?.includes('/dsh-agent-tool-')))
            .map(row => row.id)
            .sort();
        const expected = [...new Set([...exactRows, ...Object.values(variant.provides ?? {})])].sort();
        if (JSON.stringify(enabledToolRows) !== JSON.stringify(expected)) {
            throw new Error(`mode ${definition.id}/${variant.id} model-facing tool rows ${enabledToolRows.join(', ')} do not equal contract ${expected.join(', ')}`);
        }
    }
}
function presetHash(source) {
    return createHash('sha256').update(source).digest('hex');
}
async function writeResolution(directory, resolution) {
    await writeFile(join(directory, 'mode-resolution.json'), `${JSON.stringify(resolution, null, 2)}\n`);
}
/** Compile selectable presets and omit every unavailable mode from upstream discovery. */
export async function compileModeCatalog(root, report, upstreamCommit) {
    const modes = {};
    for (const child of await readdir(root, { withFileTypes: true })) {
        if (!child.isDirectory())
            continue;
        const directory = join(root, child.name);
        const definitionPath = join(directory, 'mode.yml');
        let definition;
        try {
            definition = parseModeDefinition(await readFile(definitionPath, 'utf8'), definitionPath);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                continue;
            throw error;
        }
        if (definition.id !== child.name)
            throw new Error(`${definitionPath}: mode id ${definition.id} must match directory ${child.name}`);
        const resolved = resolveVariant(definition, report);
        if (resolved.supportLevel === 'unavailable') {
            await Promise.all([
                rm(join(directory, 'agent.cordis.yml'), { force: true }),
                rm(join(directory, 'preset.yml'), { force: true }),
            ]);
            const resolution = {
                modeId: definition.id,
                supportLevel: 'unavailable',
                selectable: false,
                reason: resolved.reason,
                remediation: resolved.remediation,
                missing: resolved.missing,
            };
            modes[definition.id] = resolution;
            await writeResolution(directory, resolution);
            continue;
        }
        const variant = definition.variants.find(item => item.id === resolved.variantId);
        if (variant === undefined)
            throw new Error(`mode ${definition.id} resolved unknown variant ${resolved.variantId}`);
        const composed = await composeModeVariant(directory, definition, variant);
        validateModeComposition(definition, variant, composed);
        await writeFile(join(directory, 'agent.cordis.yml'), composed);
        const presetDescriptor = await readFile(join(directory, 'preset.yml'), 'utf8');
        const trace = {
            modeId: definition.id,
            variantId: variant.id,
            supportLevel: resolved.supportLevel,
            presetHash: presetHash(`${presetDescriptor}\0${composed}`),
            upstreamCommit,
            capabilitySnapshotHash: report.snapshotHash,
            limitations: resolved.limitations,
        };
        const resolution = {
            modeId: definition.id,
            supportLevel: resolved.supportLevel,
            selectable: true,
            trace,
        };
        modes[definition.id] = resolution;
        await writeResolution(directory, resolution);
    }
    return {
        schemaVersion: 1,
        target: report.target,
        capabilitySnapshotHash: report.snapshotHash,
        upstreamCommit,
        modes,
    };
}
export function measuredModeSupport(catalog) {
    return Object.fromEntries(Object.entries(catalog.modes).map(([id, resolution]) => [id, {
            level: resolution.supportLevel,
            ...(resolution.trace === undefined ? {} : {
                variant: resolution.trace.variantId,
                presetHash: resolution.trace.presetHash,
                upstreamCommit: resolution.trace.upstreamCommit,
                capabilitySnapshotHash: resolution.trace.capabilitySnapshotHash,
                limitations: resolution.trace.limitations,
            }),
            ...(resolution.reason === undefined ? {} : { reason: resolution.reason }),
            ...(resolution.remediation === undefined ? {} : { remediation: resolution.remediation }),
            ...(resolution.missing === undefined ? {} : { missing: resolution.missing }),
        }]));
}
//# sourceMappingURL=mode-catalog.js.map