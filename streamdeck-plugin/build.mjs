// Construit bin/plugin.js (bundle unique) à partir de src/.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";

const bin = "com.zionzion94.ytmusic.sdPlugin/bin";

await build({
	entryPoints: ["src/plugin.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	minify: true,
	outfile: `${bin}/plugin.js`,
});
// Indique à Node que le bundle est un module ES.
writeFileSync(`${bin}/package.json`, '{ "type": "module" }\n');
