#!/usr/bin/env node
import { i as uninstallLearningPreset, r as installLearningPreset } from "./installer-C34dzozy.js";
//#region lib/types/installer-cli.js
function usage() {
	console.error("Usage: dsh-learning-preset <install|uninstall> [--home <DSH_HOME>]");
	process.exit(2);
}
const args = process.argv.slice(2);
const command = args.shift();
let dshHome;
while (args.length > 0) {
	if (args.shift() !== "--home" || args.length === 0) usage();
	dshHome = args.shift();
}
if (command === "install") {
	const result = await installLearningPreset({ ...dshHome === void 0 ? {} : { dshHome } });
	console.log(JSON.stringify(result, null, 2));
} else if (command === "uninstall") {
	const result = await uninstallLearningPreset({ ...dshHome === void 0 ? {} : { dshHome } });
	console.log(JSON.stringify(result, null, 2));
} else usage();
//#endregion
export {};
