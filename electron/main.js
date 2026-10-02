// Mon Journal — processus principal Electron (Windows).
"use strict";

const { app, BrowserWindow, ipcMain, shell, net, dialog, session, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");
const { GoogleAuth } = require("./google-auth");

const WEB_ROOT = path.join(__dirname, "..", "dist", "web");
const INDEX = path.join(WEB_ROOT, "index.html");
const UPDATE_INTERVAL = 4 * 3600 * 1000;

if (!app.requestSingleInstanceLock()) {
	app.quit();
	return;
}

app.setAppUserModelId("com.pinkrain.monjournal");

let win = null;
let quitting = false;
let closeTimer = null;

function loadOAuthConfig() {
	const google = require("../config/google.json");
	let secret = process.env.MJ_GOOGLE_DESKTOP_CLIENT_SECRET || "";
	try {
		secret = secret || require("./oauth-config.json").clientSecret || "";
	} catch (e) {}
	return { clientId: google.desktopClientId, clientSecret: secret, scope: google.scope };
}

const auth = new GoogleAuth({
	userDataDir: app.getPath("userData"),
	config: loadOAuthConfig(),
	onLoggedIn: () => bringToFront()
});

// ---------- Fenêtre ----------

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
	try {
		return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
	} catch (e) {
		return { width: 1440, height: 920, maximized: false };
	}
}

function saveWindowState() {
	if (!win || win.isDestroyed()) {
		return;
	}
	const bounds = win.getNormalBounds();
	fs.writeFileSync(stateFile(), JSON.stringify(Object.assign(bounds, { maximized: win.isMaximized() })));
}

function bringToFront() {
	if (!win) {
		return;
	}
	if (win.isMinimized()) {
		win.restore();
	}
	win.show();
	win.setAlwaysOnTop(true);
	win.focus();
	win.setAlwaysOnTop(false);
}

function isAppUrl(url) {
	return url.startsWith("file://") && decodeURIComponent(new URL(url).pathname).replace(/\\/g, "/").includes("/dist/web/");
}

function createWindow() {
	const state = readWindowState();
	win = new BrowserWindow({
		x: state.x,
		y: state.y,
		width: state.width,
		height: state.height,
		minWidth: 360,
		minHeight: 480,
		show: false,
		backgroundColor: "#15161d",
		title: "Mon Journal",
		icon: path.join(__dirname, "..", "build-resources", "icon.png"),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: true,
			additionalArguments: [
				"--mj-version=" + app.getVersion(),
				auth.configured ? "--mj-auth-configured" : "--mj-auth-missing"
			]
		}
	});
	if (state.maximized) {
		win.maximize();
	}
	win.once("ready-to-show", () => win.show());

	// Liens externes : toujours dans le navigateur, jamais dans l'appli.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url) || url.startsWith("mailto:")) {
			shell.openExternal(url);
		}
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (!isAppUrl(url)) {
			event.preventDefault();
			if (/^https?:\/\//.test(url)) {
				shell.openExternal(url);
			}
		}
	});
	// TiddlyWiki demande confirmation avant de quitter s'il reste des
	// modifications ; ici on gère la fermeture nous-mêmes (voir « close »).
	win.webContents.on("will-prevent-unload", (event) => event.preventDefault());

	win.webContents.on("before-input-event", (event, input) => {
		if (input.type !== "keyDown") {
			return;
		}
		const ctrl = input.control || input.meta;
		if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) {
			win.webContents.toggleDevTools();
			event.preventDefault();
		} else if (ctrl && (input.key === "=" || input.key === "+")) {
			win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
			event.preventDefault();
		} else if (ctrl && input.key === "-") {
			win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
			event.preventDefault();
		} else if (ctrl && input.key === "0") {
			win.webContents.setZoomLevel(0);
			event.preventDefault();
		}
	});

	// Avant de fermer, on laisse l'appli finir d'enregistrer et envoyer
	// les dernières modifications (6 s maximum).
	win.on("close", (event) => {
		saveWindowState();
		if (quitting) {
			return;
		}
		event.preventDefault();
		win.webContents.send("mj:close-request");
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			quitting = true;
			win.close();
		}, 6000);
	});
	win.on("closed", () => {
		win = null;
	});

	win.loadFile(INDEX);
}

// ---------- IPC ----------

function handle(channel, fn) {
	ipcMain.handle(channel, async (_event, ...args) => {
		try {
			return { ok: true, value: await fn(...args) };
		} catch (e) {
			return { ok: false, code: e.code || "error", message: e.message || String(e) };
		}
	});
}

handle("mj:auth:get-session", () => auth.getSession());
handle("mj:auth:sign-in", () => auth.signIn());
handle("mj:auth:sign-out", () => auth.signOut());
handle("mj:auth:get-access-token", () => auth.getAccessToken());
handle("mj:auth:invalidate", () => auth.invalidateToken());

handle("mj:http", async (req) => {
	let res;
	try {
		res = await net.fetch(req.url, { method: req.method || "GET", headers: req.headers || {}, body: req.body });
	} catch (e) {
		const err = new Error("Pas de connexion");
		err.code = "offline";
		throw err;
	}
	return { status: res.status, body: await res.text() };
});

handle("mj:save-file", async (name, content) => {
	const result = await dialog.showSaveDialog(win, {
		title: "Enregistrer une copie de Mon Journal",
		defaultPath: path.join(app.getPath("documents"), name),
		filters: [{ name: "Copie Mon Journal", extensions: ["json"] }]
	});
	if (result.canceled || !result.filePath) {
		return false;
	}
	fs.writeFileSync(result.filePath, content, "utf8");
	return true;
});

ipcMain.on("mj:close-ready", () => {
	clearTimeout(closeTimer);
	quitting = true;
	if (win) {
		win.close();
	}
});

ipcMain.on("mj:open-external", (_e, url) => {
	if (/^https?:\/\//.test(url)) {
		shell.openExternal(url);
	}
});

// ---------- Mises à jour ----------

function isNewer(a, b) {
	const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
	const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) !== (pb[i] || 0)) {
			return (pa[i] || 0) > (pb[i] || 0);
		}
	}
	return false;
}

function sendUpdate(event) {
	if (win && !win.isDestroyed()) {
		win.webContents.send("mj:updater:event", event);
	}
}

function setupUpdater() {
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.on("update-available", (info) => sendUpdate({ type: "available", version: info.version }));
	autoUpdater.on("update-not-available", () => sendUpdate({ type: "none" }));
	autoUpdater.on("download-progress", (p) => sendUpdate({ type: "progress", percent: p.percent }));
	autoUpdater.on("update-downloaded", (info) => sendUpdate({ type: "downloaded", version: info.version }));
	autoUpdater.on("error", (e) => sendUpdate({ type: "error", message: e ? e.message : "" }));
	setInterval(() => {
		autoUpdater.checkForUpdates().catch(() => {});
	}, UPDATE_INTERVAL);
}

handle("mj:updater:check", async () => {
	if (!app.isPackaged) {
		return { available: false, version: app.getVersion() };
	}
	const result = await autoUpdater.checkForUpdates();
	if (!result || !result.updateInfo) {
		return { available: false, version: app.getVersion() };
	}
	const version = result.updateInfo.version;
	const available = typeof result.isUpdateAvailable === "boolean"
		? result.isUpdateAvailable
		: isNewer(version, app.getVersion());
	return { available, version };
});

handle("mj:updater:install", () => {
	quitting = true;
	setImmediate(() => autoUpdater.quitAndInstall(false, true));
	return true;
});

// ---------- Démarrage ----------

app.on("second-instance", () => bringToFront());

app.whenReady().then(() => {
	Menu.setApplicationMenu(null);
	session.defaultSession.setSpellCheckerLanguages(["fr"]);
	session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
		callback(["media", "geolocation", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen"].includes(permission));
	});
	createWindow();
	if (app.isPackaged) {
		setupUpdater();
	}
});

app.on("window-all-closed", () => {
	app.quit();
});
