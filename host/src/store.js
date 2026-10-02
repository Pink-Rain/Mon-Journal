// Stockage local d'un compte : chaque tiddler est un enregistrement IndexedDB.
// C'est la source de vérité sur l'appareil ; Google Drive n'est qu'un miroir.
import { hashFields, nextTimestamp } from "./util.js";

const DB_VERSION = 1;

function promisify(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function txDone(tx) {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error || new Error("Transaction annulée"));
	});
}

export class Store {
	constructor(accountKey) {
		this.dbName = "monjournal-" + accountKey;
		this.db = null;
		// title → { ts, h } pour chaque tiddler vivant ; title → ts pour les suppressions.
		this.index = new Map();
		this.tombstones = new Map();
		this.incoming = { modifications: new Set(), deletions: new Set() };
		this.listeners = new Set();
		this.lastLocalChange = 0;
		this.pendingWrites = 0;
	}

	async open() {
		const request = indexedDB.open(this.dbName, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains("tiddlers")) {
				db.createObjectStore("tiddlers", { keyPath: "title" });
			}
			if (!db.objectStoreNames.contains("tombstones")) {
				db.createObjectStore("tombstones", { keyPath: "title" });
			}
			if (!db.objectStoreNames.contains("meta")) {
				db.createObjectStore("meta", { keyPath: "key" });
			}
		};
		this.db = await promisify(request);
	}

	// Charge tout pour le démarrage de TiddlyWiki et construit l'index.
	async loadAll() {
		const tx = this.db.transaction(["tiddlers", "tombstones"], "readonly");
		const records = await promisify(tx.objectStore("tiddlers").getAll());
		const tombs = await promisify(tx.objectStore("tombstones").getAll());
		this.index.clear();
		this.tombstones.clear();
		for (const r of records) {
			this.index.set(r.title, { ts: r.ts, h: r.h });
		}
		for (const t of tombs) {
			this.tombstones.set(t.title, t.ts);
		}
		return records.map((r) => r.fields);
	}

	async isEmpty() {
		const tx = this.db.transaction("tiddlers", "readonly");
		const count = await promisify(tx.objectStore("tiddlers").count());
		return count === 0;
	}

	onChange(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(kind) {
		for (const listener of this.listeners) {
			try {
				listener(kind);
			} catch (e) {
				console.error(e);
			}
		}
	}

	revisionOf(title) {
		const entry = this.index.get(title);
		return entry ? String(entry.ts) : undefined;
	}

	async track(promise) {
		this.pendingWrites++;
		try {
			return await promise;
		} finally {
			this.pendingWrites--;
		}
	}

	// ---- Appelé par le syncadaptor TiddlyWiki (modifications locales) ----

	save(fields) {
		return this.track(this._save(fields));
	}

	async _save(fields) {
		const title = fields.title;
		const h = hashFields(fields);
		const current = this.index.get(title);
		if (current && current.h === h) {
			return String(current.ts);
		}
		const ts = nextTimestamp(Math.max(current ? current.ts : 0, this.tombstones.get(title) || 0));
		const tx = this.db.transaction(["tiddlers", "tombstones"], "readwrite");
		tx.objectStore("tiddlers").put({ title, fields, ts, h });
		tx.objectStore("tombstones").delete(title);
		await txDone(tx);
		this.index.set(title, { ts, h });
		this.tombstones.delete(title);
		this.lastLocalChange = Date.now();
		this.emit("local");
		return String(ts);
	}

	async load(title) {
		const tx = this.db.transaction("tiddlers", "readonly");
		const record = await promisify(tx.objectStore("tiddlers").get(title));
		return record ? record.fields : null;
	}

	remove(title) {
		return this.track(this._remove(title));
	}

	async _remove(title) {
		const current = this.index.get(title);
		if (!current) {
			return;
		}
		const ts = nextTimestamp(current.ts);
		const tx = this.db.transaction(["tiddlers", "tombstones"], "readwrite");
		tx.objectStore("tiddlers").delete(title);
		tx.objectStore("tombstones").put({ title, ts });
		await txDone(tx);
		this.index.delete(title);
		this.tombstones.set(title, ts);
		this.lastLocalChange = Date.now();
		this.emit("local");
	}

	takeIncoming() {
		const result = {
			modifications: Array.from(this.incoming.modifications),
			deletions: Array.from(this.incoming.deletions)
		};
		this.incoming.modifications.clear();
		this.incoming.deletions.clear();
		return result;
	}

	// ---- Appelé par la synchronisation (changements venus du cloud) ----

	snapshot() {
		return {
			tiddlers: new Map(Array.from(this.index, ([title, e]) => [title, { ts: e.ts, h: e.h }])),
			tombstones: new Map(this.tombstones)
		};
	}

	async getRecord(title) {
		const tx = this.db.transaction("tiddlers", "readonly");
		return promisify(tx.objectStore("tiddlers").get(title));
	}

	// N'applique le changement que si le tiddler n'a pas bougé localement depuis
	// le début de la synchro (expectedTs) : une modification faite pendant la
	// synchro n'est jamais écrasée.
	async applyRemote(fields, ts, h, expectedTs) {
		const title = fields.title;
		const current = this.index.get(title);
		const currentTs = current ? current.ts : this.tombstones.get(title) || 0;
		if (expectedTs !== undefined && currentTs !== expectedTs) {
			return false;
		}
		const tx = this.db.transaction(["tiddlers", "tombstones"], "readwrite");
		tx.objectStore("tiddlers").put({ title, fields, ts, h });
		tx.objectStore("tombstones").delete(title);
		await txDone(tx);
		this.index.set(title, { ts, h });
		this.tombstones.delete(title);
		this.incoming.deletions.delete(title);
		this.incoming.modifications.add(title);
		return true;
	}

	async applyRemoteDelete(title, ts, expectedTs) {
		const current = this.index.get(title);
		const currentTs = current ? current.ts : this.tombstones.get(title) || 0;
		if (expectedTs !== undefined && currentTs !== expectedTs) {
			return false;
		}
		const tx = this.db.transaction(["tiddlers", "tombstones"], "readwrite");
		tx.objectStore("tiddlers").delete(title);
		tx.objectStore("tombstones").put({ title, ts });
		await txDone(tx);
		this.index.delete(title);
		this.tombstones.set(title, ts);
		this.incoming.modifications.delete(title);
		this.incoming.deletions.add(title);
		return true;
	}

	async forgetTombstones(titles) {
		if (!titles.length) {
			return;
		}
		const tx = this.db.transaction("tombstones", "readwrite");
		for (const title of titles) {
			tx.objectStore("tombstones").delete(title);
			this.tombstones.delete(title);
		}
		await txDone(tx);
	}

	async getMeta(key, fallback) {
		const tx = this.db.transaction("meta", "readonly");
		const record = await promisify(tx.objectStore("meta").get(key));
		return record ? record.value : fallback;
	}

	async setMeta(key, value) {
		const tx = this.db.transaction("meta", "readwrite");
		tx.objectStore("meta").put({ key, value });
		await txDone(tx);
	}

	async exportAll() {
		const tx = this.db.transaction("tiddlers", "readonly");
		const records = await promisify(tx.objectStore("tiddlers").getAll());
		return records.map((r) => r.fields);
	}

	close() {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
