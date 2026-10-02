import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const bundle = await esbuild.build({ entryPoints: [join(here, "sync.test.js")], bundle: true, write: false, format: "iife" });
const js = bundle.outputFiles[0].text;
const server = createServer((req, res) => {
	if (req.url === "/test.js") {
		res.writeHead(200, { "Content-Type": "text/javascript" }).end(js);
	} else {
		res.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><script src="/test.js"></script>');
	}
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error(e));
await page.goto("http://localhost:" + port + "/");
const results = await page.evaluate(() => window.runSyncTests());
let failed = 0;
for (const r of results) {
	console.log((r.ok ? "✔ " : "✘ ") + r.name + (r.ok ? "" : "  " + r.detail));
	if (!r.ok) failed++;
}
await browser.close();
server.close();
console.log(failed ? failed + " échec(s)" : "Tous les tests passent (" + results.length + ")");
process.exit(failed ? 1 : 0);
