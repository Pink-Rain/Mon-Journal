// Petits outils partagés par la couche hôte.

// Empreinte rapide (cyrb53 doublé → 64 bits en hexadécimal). Sert à savoir si
// le contenu d'un tiddler a changé ; ce n'est pas une empreinte de sécurité.
export function hashString(str) {
	let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export function stableStringify(fields) {
	const out = {};
	for (const key of Object.keys(fields).sort()) {
		out[key] = fields[key];
	}
	return JSON.stringify(out);
}

export function hashFields(fields) {
	return hashString(stableStringify(fields));
}

// Horodatage strictement croissant dans ce processus : deux modifications
// rapprochées ne peuvent jamais avoir le même instant.
let lastIssued = 0;
export function nextTimestamp(previous) {
	lastIssued = Math.max(Date.now(), lastIssued + 1, (previous || 0) + 1);
	return lastIssued;
}

export function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout(promise, ms, message) {
	let timer;
	return Promise.race([
		promise.finally(() => clearTimeout(timer)),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(message || "Délai dépassé")), ms);
		})
	]);
}

export function compareVersions(a, b) {
	const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
	const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] || 0) - (pb[i] || 0);
		if (d) {
			return d > 0 ? 1 : -1;
		}
	}
	return 0;
}

export function formatRelative(ts) {
	if (!ts) {
		return "jamais";
	}
	const s = Math.round((Date.now() - ts) / 1000);
	if (s < 45) {
		return "à l'instant";
	}
	if (s < 3600) {
		return "il y a " + Math.max(1, Math.round(s / 60)) + " min";
	}
	if (s < 86400) {
		return "il y a " + Math.round(s / 3600) + " h";
	}
	return new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export class AppError extends Error {
	constructor(code, message, cause) {
		super(message || code);
		this.code = code;
		this.cause = cause;
	}
}
