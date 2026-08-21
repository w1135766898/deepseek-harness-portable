const INTERACTIVE_LEARNING_PACKAGE = '@dsh-portable/interactive-learning';
/** Package-relative files that make the Interactive Learning experience usable. */
export const INTERACTIVE_LEARNING_PACKAGE_FILES = [
    'package.json',
    'lib/index.js',
    'lib/bootstrap.js',
    'lib/preset.js',
    'preset/learning/preset.yml',
    'preset/learning/agent.cordis.yml',
    'lib/agent.js',
    'lib/client.js',
];
/** Stable final-distribution additions materialized by the desktop packager. */
export const INTERACTIVE_LEARNING_DISTRIBUTION_FILES = [
    ...INTERACTIVE_LEARNING_PACKAGE_FILES,
    'LICENSE',
];
/** App-relative runtime files that register packaged experience-pack hosts. */
export const INTERACTIVE_LEARNING_APP_FILES = [
    'lib/packaged-bin.js',
];
/** Public declarations intentionally shipped by the Learning package. */
export const INTERACTIVE_LEARNING_PUBLIC_DECLARATION_FILES = [
    'lib/types/agent.d.ts',
    'lib/types/bootstrap.d.ts',
    'lib/types/broker.d.ts',
    'lib/types/client/ActivityRenderer.d.ts',
    'lib/types/client/index.d.ts',
    'lib/types/client/lifecycle.d.ts',
    'lib/types/client/types.d.ts',
    'lib/types/eval.d.ts',
    'lib/types/index.d.ts',
    'lib/types/installer.d.ts',
    'lib/types/learn-intent.d.ts',
    'lib/types/learner-state.d.ts',
    'lib/types/preset.d.ts',
    'lib/types/protocol.d.ts',
    'lib/types/teaching-route.d.ts',
];
function appInventoryRoot(target) {
    return target.platform === 'darwin' ? 'Contents/Resources/app' : 'runtime/resources/app';
}
/** Resolve every Interactive Learning path as it must appear in a target manifest. */
export function interactiveLearningInventoryPaths(target) {
    const appRoot = appInventoryRoot(target);
    const packageRoot = `${appRoot}/node_modules/${INTERACTIVE_LEARNING_PACKAGE}`;
    return [
        ...INTERACTIVE_LEARNING_APP_FILES.map(path => `${appRoot}/${path}`),
        ...INTERACTIVE_LEARNING_DISTRIBUTION_FILES.map(path => `${packageRoot}/${path}`),
    ];
}
function record(value, label) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Interactive Learning release evidence ${label} must be an object`);
    }
    return value;
}
function exact(value, expected, label) {
    if (value !== expected) {
        throw new Error(`Interactive Learning release evidence ${label} must be ${JSON.stringify(expected)}`);
    }
}
function nonEmpty(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Interactive Learning release evidence ${label} must be a non-empty string`);
    }
}
const ARCHIVE_PATH = /(?:^|\/)[^/]+\.(?:tgz|tar(?:\.(?:gz|bz2|xz|zst))?|zip|7z|rar|gz|bz2|xz|zst|asar)$/i;
function comparePaths(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
const PUBLIC_DECLARATIONS = new Set(INTERACTIVE_LEARNING_PUBLIC_DECLARATION_FILES);
/** A package manifest may narrow, but can never broaden, this release policy. */
export function assertInteractiveLearningPublishedPathPolicy(paths) {
    const pathSet = new Set(paths);
    const unexpected = paths.filter(path => {
        if (path === 'package.json' || path === 'LICENSE' || path === 'README.md' || path === 'README.zh.md')
            return false;
        if (/^lib\/[^/]+\.js$/.test(path) || /^lib\/[^/]+\.js\.map$/.test(path))
            return false;
        if (PUBLIC_DECLARATIONS.has(path))
            return false;
        if (path.endsWith('.d.ts.map') && PUBLIC_DECLARATIONS.has(path.slice(0, -'.map'.length)))
            return false;
        return !/^preset\/learning\/(?:preset\.yml|agent\.cordis\.yml|skills\/interactive-teaching\/(?:SKILL\.md|references\/[^/]+\.md))$/.test(path);
    });
    const orphanedMaps = paths.filter(path => (path.endsWith('.js.map') && !pathSet.has(path.slice(0, -'.map'.length))) || (path.endsWith('.d.ts.map') && !pathSet.has(path.slice(0, -'.map'.length))));
    if (unexpected.length > 0 || orphanedMaps.length > 0) {
        throw new Error(`Interactive Learning publishedFiles violate the fixed distribution policy; unexpected=${JSON.stringify(unexpected.sort(comparePaths))} orphanedMaps=${JSON.stringify(orphanedMaps.sort(comparePaths))}`);
    }
}
function validatePublishedFiles(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('Interactive Learning release evidence publishedFiles must be a non-empty array');
    }
    const paths = new Set();
    let previous;
    for (const [index, path] of value.entries()) {
        nonEmpty(path, `publishedFiles[${index}]`);
        if (path.includes('\\')
            || path.includes(':')
            || path.startsWith('/')
            || path.endsWith('/')
            || /[\u0000-\u001f\u007f]/.test(path)
            || path.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
            throw new Error(`Interactive Learning release evidence publishedFiles contains an unsafe path: ${JSON.stringify(path)}`);
        }
        if (ARCHIVE_PATH.test(path)) {
            throw new Error(`Interactive Learning release evidence publishedFiles contains a forbidden archive: ${path}`);
        }
        if (paths.has(path)) {
            throw new Error(`Interactive Learning release evidence publishedFiles duplicates ${path}`);
        }
        if (previous !== undefined && comparePaths(previous, path) >= 0) {
            throw new Error('Interactive Learning release evidence publishedFiles must be strictly sorted');
        }
        paths.add(path);
        previous = path;
    }
    for (const requiredPath of INTERACTIVE_LEARNING_DISTRIBUTION_FILES) {
        if (!paths.has(requiredPath)) {
            throw new Error(`Interactive Learning release evidence publishedFiles is missing required file: ${requiredPath}`);
        }
    }
    assertInteractiveLearningPublishedPathPolicy(value);
}
function validateEvidence(value) {
    const evidence = record(value, 'root');
    exact(evidence.schemaVersion, 1, 'schemaVersion');
    validatePublishedFiles(evidence.publishedFiles);
    const host = record(evidence.host, 'host');
    exact(host.id, 'interactive-learning', 'host.id');
    exact(host.module, INTERACTIVE_LEARNING_PACKAGE, 'host.module');
    exact(host.runtimeBundle, 'lib/packaged-bin.js', 'host.runtimeBundle');
    exact(host.bundle, 'lib/index.js', 'host.bundle');
    exact(host.bootstrapBundle, 'lib/bootstrap.js', 'host.bootstrapBundle');
    const preset = record(evidence.preset, 'preset');
    exact(preset.id, 'learning', 'preset.id');
    exact(preset.selectable, true, 'preset.selectable');
    nonEmpty(preset.name, 'preset.name');
    nonEmpty(preset.description, 'preset.description');
    exact(preset.bundle, 'lib/preset.js', 'preset.bundle');
    exact(preset.descriptor, 'preset/learning/preset.yml', 'preset.descriptor');
    exact(preset.composition, 'preset/learning/agent.cordis.yml', 'preset.composition');
    if (!Array.isArray(preset.compositionRows) || preset.compositionRows.length === 0) {
        throw new Error('Interactive Learning release evidence preset.compositionRows must preserve the authored rows');
    }
    const rowIds = new Set();
    let learningAgentRows = 0;
    for (const [index, value] of preset.compositionRows.entries()) {
        const row = record(value, `preset.compositionRows[${index}]`);
        nonEmpty(row.id, `preset.compositionRows[${index}].id`);
        nonEmpty(row.module, `preset.compositionRows[${index}].module`);
        if (rowIds.has(row.id)) {
            throw new Error(`Interactive Learning release evidence duplicates composition row ${row.id}`);
        }
        rowIds.add(row.id);
        if (row.id === 'learning-agent') {
            exact(row.module, `${INTERACTIVE_LEARNING_PACKAGE}/agent`, 'learning-agent module');
            learningAgentRows += 1;
        }
    }
    if (learningAgentRows !== 1) {
        throw new Error('Interactive Learning release evidence requires exactly one learning-agent composition row');
    }
    const agent = record(evidence.agent, 'agent');
    exact(agent.module, `${INTERACTIVE_LEARNING_PACKAGE}/agent`, 'agent.module');
    exact(agent.bundle, 'lib/agent.js', 'agent.bundle');
    const client = record(evidence.client, 'client');
    exact(client.module, `${INTERACTIVE_LEARNING_PACKAGE}/client`, 'client.module');
    exact(client.bundle, 'lib/client.js', 'client.bundle');
}
/**
 * Fail closed unless both the semantic evidence and every target-specific
 * inventory member prove that Interactive Learning landed in the final app.
 */
export function assertInteractiveLearningReleaseContract(target, files, evidence) {
    validateEvidence(evidence);
    const inventoryPaths = files.map((file, index) => {
        if (typeof file?.path !== 'string') {
            throw new Error(`release manifest files[${index}] has no valid path`);
        }
        return file.path;
    });
    const inventory = new Set(inventoryPaths);
    for (const requiredPath of interactiveLearningInventoryPaths(target)) {
        if (!inventory.has(requiredPath)) {
            throw new Error(`release manifest is missing required Interactive Learning file: ${requiredPath}`);
        }
    }
    const appRoot = appInventoryRoot(target);
    const packagePrefix = `${appRoot}/node_modules/${INTERACTIVE_LEARNING_PACKAGE}/`;
    const actualPublishedFiles = inventoryPaths
        .filter(path => path.startsWith(packagePrefix))
        .map(path => path.slice(packagePrefix.length))
        .sort(comparePaths);
    const duplicate = actualPublishedFiles.find((path, index) => path === actualPublishedFiles[index - 1]);
    if (duplicate !== undefined) {
        throw new Error(`release manifest duplicates Interactive Learning package file: ${duplicate}`);
    }
    const expected = evidence.publishedFiles;
    const actual = new Set(actualPublishedFiles);
    const expectedSet = new Set(expected);
    const missing = expected.filter(path => !actual.has(path));
    const unexpected = actualPublishedFiles.filter(path => !expectedSet.has(path));
    if (missing.length > 0 || unexpected.length > 0) {
        throw new Error(`release manifest Interactive Learning package inventory is not exact; missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}`);
    }
}
//# sourceMappingURL=learning-contract.js.map