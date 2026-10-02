// Version navigateur, utilisée pour le développement et les tests : pas de
// compte Google, données seulement dans ce navigateur.
export function createWebPlatform() {
	return {
		name: "web",
		version: "dev",
		auth: {
			available: false,
			getSession: async () => null,
			signIn: async () => null,
			signOut: async () => {},
			getAccessToken: async () => {
				throw new Error("Pas de compte Google en mode navigateur");
			},
			invalidateToken: async () => {}
		},
		http: async (req) => {
			const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
			return { status: res.status, body: await res.text() };
		},
		updater: { supported: false },
		onResume(cb) {
			window.addEventListener("focus", cb);
		},
		onPause() {},
		onCloseRequest() {},
		saveFile: async (name, content) => {
			const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
			const a = document.createElement("a");
			a.href = url;
			a.download = name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			return true;
		},
		openExternal: (url) => window.open(url, "_blank", "noopener")
	};
}
