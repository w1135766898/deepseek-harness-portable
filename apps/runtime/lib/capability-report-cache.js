import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export const CAPABILITY_CACHE_SCHEMA_VERSION = 1;
export const CAPABILITY_PROBE_REVISION = 1;
export function currentCapabilityCacheIdentity(platform = process.platform, arch = process.arch, upstreamVersion = 'development', probeImplementationHash = '') {
    return {
        platform,
        arch,
        nodeModules: process.versions.modules ?? '',
        electron: process.versions.electron ?? '',
        upstreamVersion,
        probeImplementationHash,
    };
}
function sameIdentity(left, right) {
    return left.platform === right.platform
        && left.arch === right.arch
        && left.nodeModules === right.nodeModules
        && left.electron === right.electron
        && left.upstreamVersion === right.upstreamVersion
        && left.probeImplementationHash === right.probeImplementationHash;
}
export async function readCapabilityReportCache(path, identity, maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
        const cached = JSON.parse(await readFile(path, 'utf8'));
        if (cached.schemaVersion !== CAPABILITY_CACHE_SCHEMA_VERSION
            || cached.probeRevision !== CAPABILITY_PROBE_REVISION
            || !sameIdentity(cached.runtime, identity)
            || cached.report?.target.platform !== identity.platform
            || cached.report.target.arch !== identity.arch
            || !Number.isFinite(Date.parse(cached.writtenAt))
            || Date.now() - Date.parse(cached.writtenAt) > maxAgeMs
            || cached.report.snapshotHash !== createHash('sha256').update(JSON.stringify({
                target: cached.report.target,
                capabilities: cached.report.capabilities,
            })).digest('hex'))
            return undefined;
        return cached.report;
    }
    catch {
        return undefined;
    }
}
export async function writeCapabilityReportCache(path, identity, report) {
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
        await writeFile(temporary, `${JSON.stringify({
            schemaVersion: CAPABILITY_CACHE_SCHEMA_VERSION,
            probeRevision: CAPABILITY_PROBE_REVISION,
            writtenAt: new Date().toISOString(),
            runtime: identity,
            report,
        }, null, 2)}\n`, 'utf8');
        await rename(temporary, path);
    }
    finally {
        await rm(temporary, { force: true });
    }
}
//# sourceMappingURL=capability-report-cache.js.map