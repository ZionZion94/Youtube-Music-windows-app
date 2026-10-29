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
	// Certaines dépendances (ws) sont en CommonJS et appellent require("events"), etc.
	// Un bundle ESM n'a pas de `require` : on en fournit un.
	banner: {
		js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
	},
});
// Indique à Node que le bundle est un module ES.
writeFileSync(`${bin}/package.json`, '{ "type": "module" }\n');
