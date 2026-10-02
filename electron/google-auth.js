// Connexion Google pour Windows : flux OAuth « appli de bureau » avec PKCE.
// Le navigateur de la personne s'ouvre sur la page Google, qui renvoie vers un
// mini-serveur local (127.0.0.1) ; le jeton de rafraîchissement est ensuite
// chiffré par Windows (DPAPI, via safeStorage) dans le dossier de l'appli.
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { shell, safeStorage, net } = require("electron");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const ABOUT_URL = "https://www.googleapis.com/drive/v3/about?fields=" + encodeURIComponent("user(displayName,emailAddress,photoLink,permissionId)");
const LOGIN_TIMEOUT = 5 * 60 * 1000;

function base64url(buffer) {
	return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

class AuthError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

const PAGE = (title, text) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Mon Journal</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#15161d;color:#ece6f0;font:18px/1.5 Georgia,serif;text-align:center}
main{max-width:420px;padding:24px}h1{font-variant:small-caps;font-weight:400;font-size:34px;margin:0 0 8px}p{color:#a39cad}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

class GoogleAuth {
	constructor({ userDataDir, config, onLoggedIn }) {
		this.config = config;
		this.tokenFile = path.join(userDataDir, "google-token.bin");
		this.sessionFile = path.join(userDataDir, "session.json");
		this.onLoggedIn = onLoggedIn || (() => {});
		this.access = null;
		this.pendingLogin = null;
	}

	get configured() {
		return !!(this.config.clientId && this.config.clientSecret);
	}

	getSession() {
		try {
			if (!fs.existsSync(this.tokenFile)) {
				return null;
			}
			return JSON.parse(fs.readFileSync(this.sessionFile, "utf8"));
		} catch (e) {
			return null;
		}
	}

	readRefreshToken() {
		try {
			const raw = fs.readFileSync(this.tokenFile);
			if (raw.subarray(0, 6).toString() === "plain:") {
				return raw.subarray(6).toString();
			}
			return safeStorage.decryptString(raw);
		} catch (e) {
			return null;
		}
	}

	writeRefreshToken(token) {
		const data = safeStorage.isEncryptionAvailable()
			? safeStorage.encryptString(token)
			: Buffer.from("plain:" + token);
		fs.writeFileSync(this.tokenFile, data, { mode: 0o600 });
	}

	async tokenRequest(params) {
		const body = new URLSearchParams(Object.assign({
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret
		}, params)).toString();
		let res;
		try {
			res = await net.fetch(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body
			});
		} catch (e) {
			throw new AuthError("offline", "Pas de connexion à Google");
		}
		const json = await res.json().catch(() => ({}));
		if (!res.ok) {
			if (json.error === "invalid_grant") {
				throw new AuthError("auth", "La connexion Google a expiré, reconnecte-toi");
			}
			throw new AuthError("auth", "Google refuse la connexion : " + (json.error_description || json.error || res.status));
		}
		return json;
	}

	async signIn() {
		if (!this.configured) {
			throw new AuthError("config", "Connexion Google non configurée dans cette version");
		}
		if (this.pendingLogin) {
			this.pendingLogin.cancel();
		}
		const verifier = base64url(crypto.randomBytes(48));
		const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
		const state = base64url(crypto.randomBytes(16));
		const server = http.createServer();
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		const redirectUri = "http://127.0.0.1:" + server.address().port;

		const code = await new Promise((resolve, reject) => {
			const timer = setTimeout(() => finish(new AuthError("cancelled", "Connexion abandonnée")), LOGIN_TIMEOUT);
			const finish = (err, value) => {
				clearTimeout(timer);
				this.pendingLogin = null;
				server.close();
				err ? reject(err) : resolve(value);
			};
			this.pendingLogin = { cancel: () => finish(new AuthError("cancelled", "Connexion annulée")) };
			server.on("request", (req, res) => {
				const url = new URL(req.url, redirectUri);
				if (url.pathname !== "/") {
					res.writeHead(404).end();
					return;
				}
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				if (url.searchParams.get("state") !== state) {
					res.end(PAGE("Oups", "Cette page de connexion n'est plus valide. Recommence depuis Mon Journal."));
					return;
				}
				const error = url.searchParams.get("error");
				if (error) {
					res.end(PAGE("Connexion annulée", "Tu peux fermer cet onglet et réessayer depuis Mon Journal."));
					finish(new AuthError(error === "access_denied" ? "cancelled" : "auth", "Connexion refusée (" + error + ")"));
					return;
				}
				res.end(PAGE("C'est bon ✓", "Tu es connecté·e. Tu peux fermer cet onglet et revenir dans Mon Journal."));
				finish(null, url.searchParams.get("code"));
			});
			const params = new URLSearchParams({
				client_id: this.config.clientId,
				redirect_uri: redirectUri,
				response_type: "code",
				scope: this.config.scope,
				code_challenge: challenge,
				code_challenge_method: "S256",
				state,
				access_type: "offline",
				prompt: "consent select_account"
			});
			shell.openExternal(AUTH_URL + "?" + params.toString());
		});

		const tokens = await this.tokenRequest({
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri,
			grant_type: "authorization_code"
		});
		if (!tokens.refresh_token) {
			throw new AuthError("auth", "Google n'a pas renvoyé de jeton durable, réessaie");
		}
		this.access = { token: tokens.access_token, exp: Date.now() + (tokens.expires_in || 3600) * 1000 };
		const user = await this.about();
		const session = {
			email: user.emailAddress,
			name: user.displayName,
			photo: user.photoLink || "",
			key: user.permissionId
		};
		this.writeRefreshToken(tokens.refresh_token);
		fs.writeFileSync(this.sessionFile, JSON.stringify(session));
		this.onLoggedIn();
		return session;
	}

	async about() {
		const res = await net.fetch(ABOUT_URL, { headers: { Authorization: "Bearer " + this.access.token } });
		if (!res.ok) {
			throw new AuthError("auth", "Google Drive refuse l'accès (" + res.status + ")");
		}
		return (await res.json()).user;
	}

	async getAccessToken() {
		if (this.access && this.access.exp - 60 * 1000 > Date.now()) {
			return this.access.token;
		}
		const refreshToken = this.readRefreshToken();
		if (!refreshToken) {
			throw new AuthError("auth", "Connexion Google nécessaire");
		}
		const tokens = await this.tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
		this.access = { token: tokens.access_token, exp: Date.now() + (tokens.expires_in || 3600) * 1000 };
		return this.access.token;
	}

	invalidateToken() {
		this.access = null;
	}

	async signOut() {
		const refreshToken = this.readRefreshToken();
		this.access = null;
		for (const file of [this.tokenFile, this.sessionFile]) {
			try {
				fs.unlinkSync(file);
			} catch (e) {}
		}
		if (refreshToken) {
			try {
				await net.fetch(REVOKE_URL, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({ token: refreshToken }).toString()
				});
			} catch (e) {}
		}
	}
}

module.exports = { GoogleAuth };
