// Écrit electron/oauth-config.json (ignoré par git) avec le code secret du
// client Google « appli de bureau ». En CI, il vient du secret GitHub
// MJ_GOOGLE_DESKTOP_CLIENT_SECRET ; en local, de config/google-desktop.local.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let secret = process.env.MJ_GOOGLE_DESKTOP_CLIENT_SECRET || "";
const local = join(root, "config", "google-desktop.local.json");
if (!secret && existsSync(local)) {
	const json = JSON.parse(readFileSync(local, "utf8"));
	secret = (json.installed || json).client_secret || json.clientSecret || "";
}
if (!secret) {
	console.warn("⚠ Pas de code secret Google : cette version Windows ne pourra pas se connecter.");
}
writeFileSync(join(root, "electron", "oauth-config.json"), JSON.stringify({ clientSecret: secret }));
console.log("electron/oauth-config.json écrit" + (secret ? "" : " (vide)"));
