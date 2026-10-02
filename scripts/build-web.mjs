// Construit la version web de l'appli dans dist/web :
//   index.html  — TiddlyWiki + le plugin Mon Journal (sans aucune donnée perso)
//   host.js     — la couche hôte (compte, stockage, synchro, mises à jour)
//   host.css, fonts/, icon.png
// dist/web est ensuite emballé par Electron (Windows) et Capacitor (Android).
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const out = join(root, "dist", "web");
const dev = process.argv.includes("--dev");

// La version du plugin suit celle de l'appli.
const pluginInfoPath = join(root, "wiki", "plugins", "monjournal", "plugin.info");
const pluginInfo = JSON.parse(readFileSync(pluginInfoPath, "utf8"));
if (pluginInfo.version !== pkg.version) {
	pluginInfo.version = pkg.version;
	writeFileSync(pluginInfoPath, JSON.stringify(pluginInfo, null, "\t") + "\n");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

execFileSync(process.execPath, [
	join(root, "node_modules", "tiddlywiki", "tiddlywiki.js"),
	join(root, "wiki"),
	"--output", join(root, "build", "tw"),
	"--build", "app"
], { stdio: "inherit" });
cpSync(join(root, "build", "tw", "index.html"), join(out, "index.html"));

await esbuild.build({
	entryPoints: [join(root, "host", "src", "index.js")],
	bundle: true,
	format: "iife",
	target: ["chrome100"],
	minify: !dev,
	sourcemap: dev ? "inline" : false,
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	outfile: join(out, "host.js"),
	logLevel: "warning"
});
cpSync(join(root, "host", "host.css"), join(out, "host.css"));
cpSync(join(root, "host", "assets"), out, { recursive: true });

console.log("dist/web prêt (version " + pkg.version + ")");
