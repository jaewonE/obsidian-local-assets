import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp-tests");
const outFile = resolve(outDir, "pure-services.test.mjs");

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

await build({
	entryPoints: [resolve(rootDir, "tests/pure-services.test.ts")],
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node18",
	outfile: outFile,
	logLevel: "silent",
});

const result = spawnSync(process.execPath, ["--test", outFile], {
	cwd: rootDir,
	stdio: "inherit",
});

rmSync(outDir, { force: true, recursive: true });
process.exit(result.status ?? 1);
