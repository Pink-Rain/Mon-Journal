// Pont sécurisé entre la page (Mon Journal) et le processus principal.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Preload « sandboxé » : pas de require de fichiers, les infos arrivent
// par les arguments de la fenêtre (voir additionalArguments dans main.js).
const arg = (name) => {
	const found = process.argv.find((a) => a.startsWith("--" + name + "="));
	return found ? found.slice(name.length + 3) : "";
};

contextBridge.exposeInMainWorld("mjElectron", {
	version: arg("mj-version"),
	auth: {
		configured: process.argv.includes("--mj-auth-configured"),
		getSession: () => ipcRenderer.invoke("mj:auth:get-session"),
		signIn: () => ipcRenderer.invoke("mj:auth:sign-in"),
		signOut: () => ipcRenderer.invoke("mj:auth:sign-out"),
		getAccessToken: () => ipcRenderer.invoke("mj:auth:get-access-token"),
		invalidateToken: () => ipcRenderer.invoke("mj:auth:invalidate")
	},
	http: (req) => ipcRenderer.invoke("mj:http", req),
	saveFile: (name, content) => ipcRenderer.invoke("mj:save-file", name, content),
	openExternal: (url) => ipcRenderer.send("mj:open-external", url),
	updater: {
		check: () => ipcRenderer.invoke("mj:updater:check"),
		install: () => ipcRenderer.invoke("mj:updater:install"),
		onEvent: (cb) => ipcRenderer.on("mj:updater:event", (_e, event) => cb(event))
	},
	onCloseRequest: (cb) => ipcRenderer.on("mj:close-request", () => cb()),
	closeReady: () => ipcRenderer.send("mj:close-ready")
});
