// Choisit l'implémentation selon l'environnement : Windows (Electron),
// Android (Capacitor) ou navigateur (développement, sans compte Google).
import { createElectronPlatform } from "./platform-electron.js";
import { createAndroidPlatform } from "./platform-android.js";
import { createWebPlatform } from "./platform-web.js";

export async function createPlatform() {
	if (window.mjElectron) {
		return createElectronPlatform(window.mjElectron);
	}
	const cap = window.Capacitor;
	if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
		return createAndroidPlatform();
	}
	return createWebPlatform();
}
