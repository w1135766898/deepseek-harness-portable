import { n as interactiveLearningPresetSource } from "./preset-zxiL8IeT.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
//#region lib/types/installer.js
const LEARNING_PACK_VERSION = "0.1.0";
const LEARNING_MANIFEST_FILE = ".dsh-managed.json";
function defaultDshHome() {
	const configured = process.env.DSH_HOME?.trim();
	return resolve(configured === void 0 || configured === "" ? join(homedir(), ".dsh") : configured);
}
function targetFor(dshHome) {
	return join(resolve(dshHome ?? defaultDshHome()), ".agent-presets", "learning");
}
function digest(value) {
	return createHash("sha256").update(value).digest("hex");
}
async function fileDigest(path) {
	try {
		return digest(await readFile(path));
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
}
async function filesUnder(root) {
	const files = [];
	const visit = async (directory) => {
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
		}
	};
	await visit(root);
	return files;
}
function safePath(root, candidate) {
	if (candidate === "" || candidate.startsWith("/") || candidate.startsWith("\\")) return void 0;
	const destination = resolve(root, candidate);
	const resolvedRoot = resolve(root);
	if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${sep}`)) return void 0;
	return destination;
}
async function readManifest(path) {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8"));
		if (parsed.schema !== 1 || parsed.package !== "@dsh-portable/interactive-learning" || parsed.preset !== "learning" || !Array.isArray(parsed.files)) return void 0;
		return {
			...parsed,
			presetSchema: 1,
			userModified: parsed.userModified === true,
			preservedFiles: Array.isArray(parsed.preservedFiles) ? parsed.preservedFiles : []
		};
	} catch (error) {
		if (error.code === "ENOENT" || error instanceof SyntaxError) return void 0;
		throw error;
	}
}
async function writeAtomic(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.tmp-${String(process.pid)}-${randomUUID()}`;
	await writeFile(temporary, value);
	try {
		await rename(temporary, path);
	} catch (error) {
		if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
		await unlink(path);
		await rename(temporary, path);
	}
}
async function sidecarPath(target, relativePath) {
	const base = `${relativePath}.dsh-new-${LEARNING_PACK_VERSION}`;
	for (let suffix = 0;; suffix += 1) {
		const candidate = suffix === 0 ? base : `${base}-${String(suffix + 1)}`;
		const path = safePath(target, candidate);
		if (path === void 0) throw new Error(`invalid managed sidecar path: ${candidate}`);
		if (await fileDigest(path) === void 0) return {
			path,
			relative: candidate
		};
	}
}
/** Install or safely upgrade the independently owned user preset. */
async function installLearningPreset(options = {}) {
	const source = resolve(options.source ?? interactiveLearningPresetSource);
	if (!(await stat(source)).isDirectory()) throw new Error(`learning preset source is not a directory: ${source}`);
	const target = targetFor(options.dshHome);
	const manifestPath = join(target, LEARNING_MANIFEST_FILE);
	const previous = await readManifest(manifestPath);
	const previousFiles = new Map(previous?.files.map((file) => [file.path, file]) ?? []);
	const previousPreserved = new Map(previous?.preservedFiles.map((file) => [file.path, file]) ?? []);
	const installed = [];
	const updated = [];
	const preserved = [];
	const staged = [];
	const files = [];
	const preservedFiles = [];
	const sourceFiles = await filesUnder(source);
	await mkdir(target, { recursive: true });
	for (const relativePath of sourceFiles) {
		const sourcePath = safePath(source, relativePath);
		const destination = safePath(target, relativePath);
		if (sourcePath === void 0 || destination === void 0 || relativePath === ".dsh-managed.json") throw new Error(`invalid learning preset source path: ${relativePath}`);
		const content = await readFile(sourcePath);
		const desiredHash = digest(content);
		const currentHash = await fileDigest(destination);
		if (currentHash === void 0) {
			await writeAtomic(destination, content);
			installed.push(relativePath);
			files.push({
				path: relativePath,
				ownedHash: desiredHash
			});
			continue;
		}
		if (currentHash === desiredHash) {
			files.push({
				path: relativePath,
				ownedHash: desiredHash
			});
			continue;
		}
		if (previousFiles.get(relativePath)?.ownedHash === currentHash) {
			await writeAtomic(destination, content);
			updated.push(relativePath);
			files.push({
				path: relativePath,
				ownedHash: desiredHash
			});
			continue;
		}
		preserved.push(relativePath);
		const previousCopy = previousPreserved.get(relativePath);
		const previousSidecar = previousCopy === void 0 ? void 0 : safePath(target, previousCopy.stagedPath);
		if (previousCopy?.desiredHash === desiredHash && previousSidecar !== void 0 && await fileDigest(previousSidecar) === desiredHash) {
			files.push({
				path: previousCopy.stagedPath,
				ownedHash: desiredHash
			});
			preservedFiles.push({
				path: relativePath,
				observedHash: currentHash,
				desiredHash,
				stagedPath: previousCopy.stagedPath
			});
			continue;
		}
		const sidecar = await sidecarPath(target, relativePath);
		await writeAtomic(sidecar.path, content);
		staged.push(sidecar.relative);
		files.push({
			path: sidecar.relative,
			ownedHash: desiredHash
		});
		preservedFiles.push({
			path: relativePath,
			observedHash: currentHash,
			desiredHash,
			stagedPath: sidecar.relative
		});
	}
	for (const old of previous?.files ?? []) {
		if (sourceFiles.includes(old.path) || files.some((file) => file.path === old.path)) continue;
		const oldPath = safePath(target, old.path);
		if (oldPath === void 0) continue;
		const currentHash = await fileDigest(oldPath);
		if (currentHash === old.ownedHash) {
			await unlink(oldPath);
			updated.push(old.path);
		} else if (currentHash !== void 0) preserved.push(old.path);
	}
	const manifest = {
		schema: 1,
		presetSchema: 1,
		package: "@dsh-portable/interactive-learning",
		packageVersion: LEARNING_PACK_VERSION,
		preset: "learning",
		source: "package",
		installedAt: (/* @__PURE__ */ new Date()).toISOString(),
		userModified: preservedFiles.length > 0,
		files,
		preservedFiles
	};
	await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return {
		target,
		installed,
		updated,
		preserved: [...new Set(preserved)],
		staged
	};
}
/** Uninstall only files whose current content still matches the package-owned hash. */
async function uninstallLearningPreset(options = {}) {
	const target = targetFor(options.dshHome);
	const manifestPath = join(target, LEARNING_MANIFEST_FILE);
	const manifest = await readManifest(manifestPath);
	if (manifest === void 0) return {
		target,
		removed: [],
		preserved: [],
		manifestFound: false
	};
	const removed = [];
	const preserved = manifest.preservedFiles.map((file) => file.path);
	for (const file of manifest.files) {
		const path = safePath(target, file.path);
		if (path === void 0) {
			preserved.push(file.path);
			continue;
		}
		const currentHash = await fileDigest(path);
		if (currentHash === void 0) continue;
		if (currentHash !== file.ownedHash) {
			preserved.push(file.path);
			continue;
		}
		await unlink(path);
		removed.push(file.path);
	}
	await unlink(manifestPath);
	const directories = [];
	for (const file of removed) {
		let directory = dirname(join(target, file));
		while (directory !== target && directory.startsWith(`${target}${sep}`)) {
			directories.push(directory);
			directory = dirname(directory);
		}
	}
	directories.sort((a, b) => b.length - a.length);
	for (const directory of new Set(directories)) {
		if (directory === target) continue;
		try {
			await rmdir(directory);
		} catch {}
	}
	try {
		await rmdir(target);
	} catch {}
	return {
		target,
		removed,
		preserved: [...new Set(preserved)],
		manifestFound: true
	};
}
//#endregion
export { uninstallLearningPreset as i, LEARNING_PACK_VERSION as n, installLearningPreset as r, LEARNING_MANIFEST_FILE as t };
