// Test de la synchronisation dans un vrai navigateur (IndexedDB) avec un
// faux Google Drive en mémoire. Lancé par tests/run-sync-test.mjs.
import { Store } from "../host/src/store.js";
import { Sync } from "../host/src/sync.js";

class FakeDrive {
	constructor() {
		this.files = new Map();
		this.uploads = 0;
		this.seq = 0;
	}
	async listFiles() {
		return Array.from(this.files.values()).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
	}
	async download(id) {
		return this.files.get(id).content;
	}
	async create(name, content) {
		const id = "f" + ++this.seq;
		this.files.set(id, { id, name, content, modifiedTime: new Date().toISOString() });
		this.uploads++;
		return { id, name };
	}
	async update(id, content) {
		const f = this.files.get(id);
		f.content = content;
		f.modifiedTime = new Date().toISOString();
		this.uploads++;
		return { id };
	}
	async remove(id) {
		this.files.delete(id);
	}
}

const results = [];
function check(name, cond, detail) {
	results.push({ name, ok: !!cond, detail: cond ? "" : JSON.stringify(detail) });
}

async function device(name, drive) {
	indexedDB.deleteDatabase("monjournal-" + name);
	const store = new Store(name);
	await store.open();
	await store.loadAll();
	const sync = new Sync({ store, drive, deviceId: name });
	await sync.init();
	return { store, sync, run: () => sync.syncOnce() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.runSyncTests = async function () {
	const drive = new FakeDrive();
	const A = await device("test-a", drive);
	const B = await device("test-b", drive);

	await A.store.save({ title: "Daily 1", text: "bonjour", kind: "Daily" });
	await A.store.save({ title: "Daily 2", text: "deuxième" });
	await A.store.save({ title: "$:/journalapp/config/journal", text: '{"x":1}' });
	await A.run();
	const manifest = () => JSON.parse(Array.from(drive.files.values()).find((f) => f.name === "monjournal-manifest.json").content);
	check("A pousse ses tiddlers", Object.keys(manifest().tiddlers).length === 3, manifest());

	const pulled = await B.run();
	check("B récupère tout", pulled && (await B.store.load("Daily 1")).text === "bonjour" && B.store.index.size === 3, Array.from(B.store.index.keys()));
	const incoming = B.store.takeIncoming();
	check("B signale les arrivées à TiddlyWiki", incoming.modifications.length === 3, incoming);

	const uploadsBefore = drive.uploads;
	await A.run();
	await B.run();
	check("Synchro sans changement : aucun envoi", drive.uploads === uploadsBefore, { before: uploadsBefore, after: drive.uploads });

	await sleep(5);
	await B.store.save({ title: "Daily 1", text: "modifié sur B", kind: "Daily" });
	await B.store.remove("Daily 2");
	await B.run();
	await A.run();
	check("A reçoit la modification de B", (await A.store.load("Daily 1")).text === "modifié sur B");
	check("A reçoit la suppression de B", !A.store.index.has("Daily 2") && (await A.store.load("Daily 2")) === null);
	const inA = A.store.takeIncoming();
	check("A signale la suppression à TiddlyWiki", inA.deletions.includes("Daily 2"), inA);

	// Conflit : les deux modifient, le plus récent gagne partout.
	await A.store.save({ title: "Conflit", text: "version A" });
	await sleep(10);
	await B.store.save({ title: "Conflit", text: "version B (plus récente)" });
	await A.run();
	await B.run();
	await A.run();
	check("Conflit : la plus récente gagne sur A", (await A.store.load("Conflit")).text === "version B (plus récente)");
	check("Conflit : la plus récente gagne sur B", (await B.store.load("Conflit")).text === "version B (plus récente)");

	// Suppression puis modification plus récente ailleurs : la modification gagne.
	await A.store.save({ title: "Revenant", text: "v1" });
	await A.run();
	await B.run();
	await A.store.remove("Revenant");
	await sleep(10);
	await B.store.save({ title: "Revenant", text: "v2 modifiée après" });
	await A.run();
	await B.run();
	await A.run();
	check("Modif plus récente qu'une suppression : gardée", (await A.store.load("Revenant") || {}).text === "v2 modifiée après" && (await B.store.load("Revenant") || {}).text === "v2 modifiée après");

	// Gros tiddler (image) : stocké à part, récupéré intact.
	const big = "data:" + "x".repeat(200 * 1024);
	await A.store.save({ title: "$:/journalapp/media/image/photo", type: "image/png", text: big });
	await A.run();
	const blobs = Array.from(drive.files.values()).filter((f) => f.name.startsWith("blob-"));
	check("Gros tiddler envoyé dans un fichier à part", blobs.length === 1 && manifest().tiddlers["$:/journalapp/media/image/photo"].b === blobs[0].name, blobs.map((b) => b.name));
	await B.run();
	check("Gros tiddler récupéré intact", (await B.store.load("$:/journalapp/media/image/photo")).text === big);

	// Modification locale pendant une synchro : jamais écrasée.
	await A.store.save({ title: "Pendant", text: "A1" });
	await A.run();
	await B.run();
	await sleep(5);
	await B.store.save({ title: "Pendant", text: "B distant" });
	await B.run();
	const snapshotTs = A.store.index.get("Pendant").ts;
	await sleep(5);
	await A.store.save({ title: "Pendant", text: "A local récent" });
	const applied = await A.store.applyRemote({ title: "Pendant", text: "B distant" }, 1, "h", snapshotTs);
	check("Modif faite pendant la synchro protégée", applied === false && (await A.store.load("Pendant")).text === "A local récent");

	// Rechargement : l'index est reconstruit depuis IndexedDB.
	const A2 = new Store("test-a");
	await A2.open();
	const all = await A2.loadAll();
	check("Données relues après redémarrage", all.length === A.store.index.size, { reloaded: all.length, live: A.store.index.size });

	return results;
};
