// Synchronisation entre le stockage local et le Google Drive de la personne.
//
// Sur Drive, le dossier caché de l'appli contient :
//   monjournal-manifest.json : l'état de chaque tiddler (horodatage, empreinte)
//                              et le contenu des petits tiddlers ;
//   blob-*.json              : le contenu des gros tiddlers (images, audio…),
//                              un fichier par version, jamais modifié.
//
// Règle de fusion, tiddler par tiddler : la version la plus récente gagne
// (modification ou suppression). Chaque appareil garde ses changements tant
// qu'ils ne sont pas dans le manifeste, donc tout finit par converger.
import { AppError, hashString, delay } from "./util.js";

const MANIFEST = "monjournal-manifest.json";
const BLOB_THRESHOLD = 48 * 1024;
const TOMBSTONE_TTL = 120 * 24 * 3600 * 1000;
const BLOB_GRACE = 24 * 3600 * 1000;
const AUTO_DELAY = 4000;
const PERIODIC = 3 * 60 * 1000;

function emptyManifest() {
	return { schema: 1, app: "monjournal", updated: 0, tiddlers: {}, tombstones: {} };
}

export class Sync {
	constructor({ store, drive, deviceId, onStatus, onIncoming }) {
		this.store = store;
		this.drive = drive;
		this.deviceId = deviceId;
		this.onStatus = onStatus || (() => {});
		this.onIncoming = onIncoming || (() => {});
		this.running = null;
		this.again = false;
		this.timer = null;
		this.periodic = null;
		this.status = { state: "idle", lastSync: 0, error: "" };
		this.manifestId = null;
	}

	async init() {
		this.status.lastSync = await this.store.getMeta("lastSync", 0);
		this.manifestId = await this.store.getMeta("manifestId", null);
		this.store.onChange(() => {
			this.setStatus({ state: "pending" });
			this.schedule(AUTO_DELAY);
		});
	}

	start() {
		this.schedule(500);
		this.periodic = setInterval(() => this.schedule(0), PERIODIC);
	}

	stop() {
		clearInterval(this.periodic);
		clearTimeout(this.timer);
	}

	setStatus(patch) {
		Object.assign(this.status, patch);
		this.onStatus(Object.assign({}, this.status));
	}

	schedule(ms) {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.now("auto"), ms);
	}

	isDirty() {
		return this.store.lastLocalChange > this.status.lastSync || this.store.pendingWrites > 0;
	}

	// Lance une synchro ; si une synchro tourne déjà, en relance une juste après.
	now(reason) {
		clearTimeout(this.timer);
		if (this.running) {
			this.again = true;
			return this.running;
		}
		this.running = this.run(reason)
			.catch(() => {})
			.finally(() => {
				this.running = null;
				if (this.again) {
					this.again = false;
					this.schedule(300);
				}
			});
		return this.running;
	}

	async run(reason) {
		this.setStatus({ state: "syncing", error: "" });
		try {
			const changed = await this.syncOnce();
			const lastSync = Date.now();
			await this.store.setMeta("lastSync", lastSync);
			this.setStatus({ state: this.store.lastLocalChange > lastSync ? "pending" : "ok", lastSync, error: "" });
			if (changed) {
				this.onIncoming();
			}
		} catch (e) {
			console.warn("[sync]", reason, e);
			const state = e.code === "offline" ? "offline" : "error";
			this.setStatus({ state, error: e.message || String(e), errorCode: e.code || "" });
			if (state === "offline") {
				this.schedule(60 * 1000);
			}
			throw e;
		}
	}

	async readManifest(files) {
		// S'il existe plusieurs manifestes (deux appareils qui démarrent en même
		// temps la toute première fois), on prend le plus récent.
		const file = files
			.filter((f) => f.name === MANIFEST)
			.sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime))[0];
		if (!file) {
			this.manifestId = null;
			return emptyManifest();
		}
		this.manifestId = file.id;
		const text = await this.drive.download(file.id);
		try {
			const manifest = JSON.parse(text);
			if (manifest && manifest.app === "monjournal") {
				manifest.tiddlers = manifest.tiddlers || {};
				manifest.tombstones = manifest.tombstones || {};
				return manifest;
			}
		} catch (e) {
			console.warn("[sync] manifeste illisible", e);
		}
		throw new AppError("drive", "Le fichier de synchronisation sur Google Drive est illisible");
	}

	async syncOnce() {
		const files = await this.drive.listFiles();
		const filesByName = new Map(files.map((f) => [f.name, f]));
		const remote = await this.readManifest(files);
		const local = this.store.snapshot();
		const titles = new Set([
			...local.tiddlers.keys(),
			...local.tombstones.keys(),
			...Object.keys(remote.tiddlers),
			...Object.keys(remote.tombstones)
		]);
		let pulled = 0;
		let manifestDirty = false;

		for (const title of titles) {
			const L = local.tiddlers.get(title);
			const Lt = local.tombstones.get(title);
			const R = remote.tiddlers[title];
			const Rt = remote.tombstones[title];
			const localTs = L ? L.ts : Lt || 0;

			if (L && R && L.h === R.h) {
				continue;
			}
			const localWins = L
				? !R && !Rt ? true : R ? L.ts > R.ts || (L.ts === R.ts && L.h > R.h) : L.ts > Rt
				: false;
			const localDeleteWins = !L && Lt !== undefined
				? R ? Lt >= R.ts : Rt === undefined || Lt > Rt
				: false;

			if (localWins) {
				// Le local est plus récent : on le pousse.
				const record = await this.store.getRecord(title);
				if (!record) {
					continue;
				}
				remote.tiddlers[title] = await this.packEntry(record, filesByName);
				delete remote.tombstones[title];
				manifestDirty = true;
			} else if (localDeleteWins) {
				// Supprimé ici plus récemment : la suppression part sur Drive.
				if (R || Rt === undefined || Rt < Lt) {
					delete remote.tiddlers[title];
					remote.tombstones[title] = Lt;
					manifestDirty = true;
				}
			} else if (R) {
				// Drive est plus récent : on rapatrie.
				const fields = await this.unpackEntry(title, R, filesByName);
				if (fields && (await this.store.applyRemote(fields, R.ts, R.h, localTs))) {
					pulled++;
				}
			} else if (Rt !== undefined && L) {
				if (await this.store.applyRemoteDelete(title, Rt, localTs)) {
					pulled++;
				}
			}
		}

		// Nettoyage des vieilles suppressions, partout.
		const now = Date.now();
		const expired = [];
		for (const [title, ts] of Object.entries(remote.tombstones)) {
			if (now - ts > TOMBSTONE_TTL) {
				delete remote.tombstones[title];
				manifestDirty = true;
			}
		}
		for (const [title, ts] of this.store.tombstones) {
			if (now - ts > TOMBSTONE_TTL) {
				expired.push(title);
			}
		}
		await this.store.forgetTombstones(expired);

		if (manifestDirty || !this.manifestId) {
			remote.updated = now;
			remote.device = this.deviceId;
			const content = JSON.stringify(remote);
			if (this.manifestId) {
				await this.drive.update(this.manifestId, content);
			} else {
				const created = await this.drive.create(MANIFEST, content);
				this.manifestId = created.id;
			}
			await this.store.setMeta("manifestId", this.manifestId);
			await this.collectGarbage(remote, files);
		}
		return pulled > 0;
	}

	async packEntry(record, filesByName) {
		const json = JSON.stringify(record.fields);
		if (json.length <= BLOB_THRESHOLD) {
			return { ts: record.ts, h: record.h, f: record.fields };
		}
		const name = "blob-" + hashString(record.title) + "-" + record.h + ".json";
		if (!filesByName.has(name)) {
			const created = await this.drive.create(name, json);
			filesByName.set(name, created);
		}
		return { ts: record.ts, h: record.h, b: name };
	}

	async unpackEntry(title, entry, filesByName) {
		if (entry.f) {
			return entry.f;
		}
		const file = entry.b && filesByName.get(entry.b);
		if (!file) {
			console.warn("[sync] contenu manquant sur Drive pour", title);
			return null;
		}
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return JSON.parse(await this.drive.download(file.id));
			} catch (e) {
				if (attempt === 2) {
					throw e;
				}
				await delay(800 * (attempt + 1));
			}
		}
		return null;
	}

	// Supprime les blobs qui ne sont plus référencés (anciennes versions d'une
	// image…), avec un délai de grâce pour un appareil qui serait en train de
	// lire un manifeste plus ancien.
	async collectGarbage(manifest, files) {
		const used = new Set(Object.values(manifest.tiddlers).map((e) => e.b).filter(Boolean));
		const now = Date.now();
		for (const f of files) {
			if (f.name.startsWith("blob-") && !used.has(f.name) && now - Date.parse(f.modifiedTime) > BLOB_GRACE) {
				await this.drive.remove(f.id);
			}
		}
	}
}
