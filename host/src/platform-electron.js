import { AppError } from "./util.js";

// L'API exposée par electron/preload.js renvoie des enveloppes
// { ok, value } ou { ok: false, code, message } pour garder le code d'erreur.
function unwrap(promise) {
	return promise.then((r) => {
		if (r && r.ok) {
			return r.value;
		}
		throw new AppError((r && r.code) || "error", (r && r.message) || "Erreur");
	});
}

export function createElectronPlatform(api) {
	return {
		name: "windows",
		version: api.version,
		auth: {
			available: api.auth.configured,
			getSession: () => unwrap(api.auth.getSession()),
			signIn: () => unwrap(api.auth.signIn()),
			signOut: () => unwrap(api.auth.signOut()),
			getAccessToken: () => unwrap(api.auth.getAccessToken()),
			invalidateToken: () => unwrap(api.auth.invalidateToken())
		},
		http: (req) => unwrap(api.http(req)),
		updater: {
			supported: true,
			onEvent: (cb) => api.updater.onEvent(cb),
			check: () => unwrap(api.updater.check()),
			install: () => unwrap(api.updater.install())
		},
		onResume(cb) {
			window.addEventListener("focus", cb);
		},
		onPause(cb) {
			window.addEventListener("blur", cb);
		},
		onCloseRequest(handler) {
			api.onCloseRequest(async () => {
				try {
					await handler();
				} finally {
					api.closeReady();
				}
			});
		},
		saveFile: (name, content) => unwrap(api.saveFile(name, content)),
		openExternal: (url) => api.openExternal(url)
	};
}
