#!/usr/bin/env node
import { l as gradeTeachingTrajectorySuite, n as OFFLINE_TRAJECTORY_CANDIDATES, s as gradeTeachingSuite, t as OFFLINE_REFERENCE_CANDIDATES } from "./eval-BJVVBA-E.js";
import { readFile } from "node:fs/promises";
//#region lib/types/eval-cli.js
function classify(values) {
	const teaching = [];
	const trajectories = [];
	for (const value of values) if (typeof value === "object" && value !== null && Array.isArray(value.turns)) trajectories.push(value);
	else teaching.push(value);
	return {
		teaching,
		trajectories
	};
}
async function candidatesFrom(path) {
	if (path === void 0) return {
		teaching: OFFLINE_REFERENCE_CANDIDATES,
		trajectories: OFFLINE_TRAJECTORY_CANDIDATES,
		fixture: true
	};
	const text = await readFile(path, "utf8");
	return {
		...classify(text.trimStart().startsWith("[") ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))),
		fixture: false
	};
}
const input = process.argv[2];
const candidates = await candidatesFrom(input);
const verdicts = [...candidates.teaching.length === 0 ? [] : gradeTeachingSuite(candidates.teaching), ...candidates.trajectories.length === 0 ? [] : gradeTeachingTrajectorySuite(candidates.trajectories)];
for (const verdict of verdicts) {
	process.stdout.write(`${candidates.fixture ? "FIXTURE" : "EXTERNAL_INPUT"} ${verdict.passed ? "PASS" : "FAIL"} ${verdict.caseId}\n`);
	for (const check of verdict.checks.filter((item) => !item.passed)) process.stdout.write(`  - ${check.name}: ${check.detail}\n`);
}
if (verdicts.some((verdict) => !verdict.passed)) process.exitCode = 1;
//#endregion
export {};
