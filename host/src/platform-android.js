import { CapacitorHttp, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { AppError, compareVersions } from "./util.js";

// Plugins natifs écrits pour l'appli (android/app/src/main/java/.../).
const NativeAuth = registerPlugin("MonJournalAuth");
const NativeUpdater = registerPlugin("MonJournalUpdater");
const NativeFiles = registerPlugin("MonJournalFiles");

const SESSION_KEY = "monjournal-session";
const RELEASES = "https://api.github.com/repos/Pink-Rain/Mon-Journal/releases/latest";
const APK_NAME = "Mon-Journal.apk";

function readSession() {
	try {
		return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
	} catch (e) {
		return null;
	}
}

async function http(req) {
	let res;
	try {
		res = await CapacitorHttp.request({
			url: req.url,
			method: req.method || "GET",
			headers: req.headers || {},
			data: req.body,
			responseType: "text"
		});
	} catch (e) {
		throw new AppError("offline", "Pas de connexion", e);
	}
	const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
	return { status: res.status, body };
}

export async function createAndroidPlatform() {
	const info = await App.getInfo();
	let access = null;

	async function authorize(interactive) {
		let result;
		try {
			result = await NativeAuth.authorize({ interactive });
		} catch (e) {
			const msg = (e && e.message) || String(e);
			if (/cancel/i.test(msg)) {
				throw new AppError("cancelled", "Connexion annulée");
			}
			if (/network|offline|7:/i.test(msg)) {
				throw new AppError("offline", "Pas de connexion");
			}
			throw new AppError("auth", msg);
		}
		if (!result || !result.accessToken) {
			throw new AppError("auth", "Reconnexion à Google nécessaire");
		}
		access = { token: result.accessToken, exp: Date.now() + 50 * 60 * 1000 };
		return access.token;
	}

	const platform = {
		name: "android",
		version: info.version,
		auth: {
			available: true,
			getSession: async () => readSession(),
			signIn: async () => {
				await authorize(true);
				const res = await http({
					method: "GET",
					url: "https://www.googleapis.com/drive/v3/about?fields=" + encodeURIComponent("user(displayName,emailAddress,photoLink,permissionId)"),
					headers: { Authorization: "Bearer " + access.token }
				});
				if (res.status !== 200) {
					throw new AppError("auth", "Google Drive refuse l'accès (" + res.status + ")");
				}
				const user = JSON.parse(res.body).user;
				const session = { email: user.emailAddress, name: user.displayName, photo: user.photoLink || "", key: user.permissionId };
				localStorage.setItem(SESSION_KEY, JSON.stringify(session));
				return session;
			},
			signOut: async () => {
				localStorage.removeItem(SESSION_KEY);
				if (access) {
					try {
						await NativeAuth.clearToken({ token: access.token });
					} catch (e) {}
				}
				access = null;
			},
			getAccessToken: async () => {
				if (access && access.exp > Date.now()) {
					return access.token;
				}
				return authorize(false);
			},
			invalidateToken: async () => {
				if (access) {
					try {
						await NativeAuth.clearToken({ token: access.token });
					} catch (e) {}
				}
				access = null;
			}
		},
		http,
		updater: {
			supported: true,
			listeners: new Set(),
			onEvent(cb) {
				this.listeners.add(cb);
			},
			emit(event) {
				for (const cb of this.listeners) {
					cb(event);
				}
			},
			async check() {
				const res = await http({ method: "GET", url: RELEASES, headers: { Accept: "application/vnd.github+json" } });
				if (res.status !== 200) {
					throw new AppError("update", "Impossible de vérifier les mises à jour (" + res.status + ")");
				}
				const release = JSON.parse(res.body);
				const latest = String(release.tag_name || "").replace(/^v/, "");
				const asset = (release.assets || []).find((a) => a.name === APK_NAME);
				if (asset && compareVersions(latest, info.version) > 0) {
					this.pending = { version: latest, url: asset.browser_download_url };
					this.emit({ type: "available", version: latest });
					return { available: true, version: latest };
				}
				this.emit({ type: "none" });
				return { available: false, version: info.version };
			},
			async install() {
				if (!this.pending) {
					throw new AppError("update", "Aucune mise à jour en attente");
				}
				this.emit({ type: "downloading", version: this.pending.version });
				await NativeUpdater.downloadAndInstall({ url: this.pending.url, version: this.pending.version });
			}
		},
		onResume(cb) {
			App.addListener("resume", cb);
		},
		onPause(cb) {
			App.addListener("pause", cb);
		},
		onCloseRequest() {},
		saveFile: async (name, content) => {
			await NativeFiles.share({ name, content });
			return true;
		},
		openExternal: (url) => window.open(url, "_system")
	};
	return platform;
}
