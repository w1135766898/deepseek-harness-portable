#!/usr/bin/env node
import { i as gradeTeachingSuite, t as OFFLINE_REFERENCE_CANDIDATES } from "./eval-DMIggSLf.js";
import { readFile } from "node:fs/promises";
//#region lib/types/eval-cli.js
async function candidatesFrom(path) {
	if (path === void 0) return OFFLINE_REFERENCE_CANDIDATES;
	const text = await readFile(path, "utf8");
	if (text.trimStart().startsWith("[")) return JSON.parse(text);
	return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
const input = process.argv[2];
const verdicts = gradeTeachingSuite(await candidatesFrom(input));
for (const verdict of verdicts) {
	process.stdout.write(`${verdict.passed ? "PASS" : "FAIL"} ${verdict.caseId}\n`);
	for (const check of verdict.checks.filter((item) => !item.passed)) process.stdout.write(`  - ${check.name}: ${check.detail}\n`);
}
if (verdicts.some((verdict) => !verdict.passed)) process.exitCode = 1;
//#endregion
export {};
