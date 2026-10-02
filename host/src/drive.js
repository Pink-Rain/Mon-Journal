// Client minimal de l'API Google Drive v3, limité au dossier caché de l'appli
// (appDataFolder, permission drive.appdata).
import { AppError } from "./util.js";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export class Drive {
	constructor(platform) {
		this.platform = platform;
	}

	async request(method, url, { headers = {}, body, retry = true } = {}) {
		const token = await this.platform.auth.getAccessToken();
		let res;
		try {
			res = await this.platform.http({
				method,
				url,
				headers: Object.assign({ Authorization: "Bearer " + token }, headers),
				body
			});
		} catch (e) {
			throw new AppError("offline", "Pas de connexion à Google Drive", e);
		}
		if (res.status === 401 && retry) {
			await this.platform.auth.invalidateToken();
			return this.request(method, url, { headers, body, retry: false });
		}
		if (res.status === 401 || res.status === 403) {
			throw new AppError("auth", "Google Drive refuse l'accès (" + res.status + ")");
		}
		if (res.status === 0) {
			throw new AppError("offline", "Pas de connexion à Google Drive");
		}
		if (res.status >= 400) {
			throw new AppError("drive", "Erreur Google Drive " + res.status + " : " + String(res.body).slice(0, 200));
		}
		return res;
	}

	async about() {
		const res = await this.request("GET", API + "/about?fields=" + encodeURIComponent("user(displayName,emailAddress,photoLink,permissionId)"));
		return JSON.parse(res.body).user;
	}

	async listFiles() {
		const files = [];
		let pageToken = "";
		do {
			const q = new URLSearchParams({
				spaces: "appDataFolder",
				fields: "nextPageToken,files(id,name,modifiedTime,size)",
				pageSize: "1000"
			});
			if (pageToken) {
				q.set("pageToken", pageToken);
			}
			const res = await this.request("GET", API + "/files?" + q.toString());
			const json = JSON.parse(res.body);
			files.push(...(json.files || []));
			pageToken = json.nextPageToken || "";
		} while (pageToken);
		return files;
	}

	async download(id) {
		const res = await this.request("GET", API + "/files/" + encodeURIComponent(id) + "?alt=media");
		return res.body;
	}

	async create(name, content) {
		const boundary = "monjournal" + Math.random().toString(36).slice(2);
		const metadata = JSON.stringify({ name, parents: ["appDataFolder"], mimeType: "application/json" });
		const body =
			"--" + boundary + "\r\n" +
			"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
			metadata + "\r\n" +
			"--" + boundary + "\r\n" +
			"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
			content + "\r\n" +
			"--" + boundary + "--";
		const res = await this.request("POST", UPLOAD + "/files?uploadType=multipart&fields=id,name,modifiedTime", {
			headers: { "Content-Type": "multipart/related; boundary=" + boundary },
			body
		});
		return JSON.parse(res.body);
	}

	async update(id, content) {
		const res = await this.request("PATCH", UPLOAD + "/files/" + encodeURIComponent(id) + "?uploadType=media&fields=id,name,modifiedTime", {
			headers: { "Content-Type": "application/json; charset=UTF-8" },
			body: content
		});
		return JSON.parse(res.body);
	}

	async remove(id) {
		try {
			await this.request("DELETE", API + "/files/" + encodeURIComponent(id));
		} catch (e) {
			if (!(e.code === "drive" && /\b404\b/.test(e.message))) {
				throw e;
			}
		}
	}
}
