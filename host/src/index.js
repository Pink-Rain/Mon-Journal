// Point d'entrée de l'hôte : chargé dans <head>, avant TiddlyWiki.
// Ordre : connexion Google → ouverture du stockage local → (première fois :
// récupération depuis Drive) → démarrage de TiddlyWiki avec les données →
// synchronisation en continu et vérification des mises à jour.
import { createPlatform } from "./platform.js";
import { Store } from "./store.js";
import { Drive } from "./drive.js";
import { Sync } from "./sync.js";
import { UI, statusLabel } from "./ui.js";
import { delay, withTimeout } from "./util.js";

// TiddlyWiki ne doit pas démarrer seul : il attend que les données soient prêtes.
window.$tw = window.$tw || {};
window.$tw.boot = window.$tw.boot || {};
window.$tw.boot.suppressBoot = true;

const LOCAL_SESSION = { key: "local", name: "", email: "", cloud: false };
const UPDATE_INTERVAL = 6 * 3600 * 1000;

const state = {
	platform: null,
	session: null,
	store: null,
	sync: null,
	tw: null,
	status: { state: "idle", lastSync: 0, error: "" },
	update: { supported: false, state: "idle", message: "", version: "" },
	lastUpdateCheck: 0,
	authToast: null
};

const noSync = { now: () => Promise.resolve(), isDirty: () => false };

const Host = {
	ui: null,
	get store() {
		return state.store;
	},
	get sync() {
		return state.sync || noSync;
	},
	account: () => state.session,
	syncStatus: () => state.status,
	updateState: () => state.update,
	version: () => (state.platform ? state.platform.version : ""),

	// Appelé par $:/plugins/pinkrain/monjournal/startup.js une fois le wiki prêt.
	attachWiki(tw) {
		state.tw = tw;
		writeStatusTiddler();
	},

	async importTiddlers(list) {
		const tw = state.tw;
		let count = 0;
		for (const fields of list) {
			tw.wiki.addTiddler(new tw.Tiddler(fields));
			count++;
		}
		return count;
	},

	async exportBackup() {
		const all = await state.store.exportAll();
		const day = new Date().toISOString().slice(0, 10);
		try {
			const saved = await state.platform.saveFile("mon-journal-" + day + ".json", JSON.stringify(all));
			if (saved) {
				Host.ui.toast("Copie de ton journal enregistrée.");
			}
		} catch (e) {
			Host.ui.toast("Impossible d'enregistrer la copie : " + ((e && e.message) || e));
		}
	},

	async reconnect() {
		try {
			const session = await state.platform.auth.signIn();
			if (session.key !== state.session.key) {
				// Autre compte Google : on recharge pour ouvrir son propre journal.
				location.reload();
				return;
			}
			state.session = Object.assign({ cloud: true }, session);
			Host.ui.closeModal();
			state.sync.now("reconnect");
		} catch (e) {
			if (!e || e.code !== "cancelled") {
				Host.ui.toast("La connexion a échoué : " + ((e && e.message) || e));
			}
		}
	},

	async signOut() {
		await flush("signout");
		await state.platform.auth.signOut();
		location.reload();
	},

	async checkUpdate(manual) {
		const updater = state.platform.updater;
		if (!updater.supported || ["checking", "downloading", "downloaded", "available-android"].includes(state.update.state)) {
			if (manual && state.update.state === "downloaded") {
				Host.installUpdate();
			}
			return;
		}
		state.lastUpdateCheck = Date.now();
		setUpdate({ state: "checking", message: "recherche de mise à jour…" });
		try {
			const result = await updater.check();
			if (state.platform.name === "android") {
				if (result.available) {
					setUpdate({ state: "available-android", version: result.version, message: "version " + result.version + " disponible" });
					Host.ui.toast("Une nouvelle version de Mon Journal est disponible (" + result.version + ").", {
						id: "update", action: "Installer", onAction: () => Host.installUpdate(), timeout: 0
					});
				} else {
					setUpdate({ state: "idle", message: "à jour" });
					if (manual) {
						Host.ui.toast("Tu as déjà la dernière version.");
					}
				}
			} else if (manual && result && !result.available) {
				setUpdate({ state: "idle", message: "à jour" });
				Host.ui.toast("Tu as déjà la dernière version.");
			}
		} catch (e) {
			setUpdate({ state: "idle", message: "" });
			if (manual) {
				Host.ui.toast((e && e.message) || "Impossible de vérifier les mises à jour.");
			}
		}
	},

	async installUpdate() {
		await flush("update");
		try {
			if (state.platform.name === "android") {
				setUpdate({ state: "downloading", message: "téléchargement de la mise à jour…" });
				Host.ui.toast("Téléchargement de la mise à jour…", { id: "update", timeout: 0 });
			}
			await state.platform.updater.install();
		} catch (e) {
			setUpdate({ state: state.platform.name === "android" ? "available-android" : "idle", message: "" });
			Host.ui.toast("La mise à jour a échoué : " + ((e && e.message) || e), { id: "update" });
		}
	}
};
window.MonJournalHost = Host;

function setUpdate(patch) {
	Object.assign(state.update, patch);
	Host.ui && Host.ui.refresh();
}

function onUpdateEvent(ev) {
	switch (ev.type) {
		case "available":
			if (state.platform.name !== "android") {
				setUpdate({ state: "downloading", version: ev.version, message: "téléchargement de la version " + ev.version + "…" });
			}
			break;
		case "progress":
			setUpdate({ message: "téléchargement… " + Math.round(ev.percent || 0) + " %" });
			break;
		case "downloaded":
			setUpdate({ state: "downloaded", version: ev.version, message: "version " + ev.version + " prête" });
			Host.ui.toast("La version " + ev.version + " de Mon Journal est prête.", {
				id: "update", action: "Redémarrer", onAction: () => Host.installUpdate(), timeout: 0
			});
			break;
		case "none":
			setUpdate({ state: "idle", message: "à jour" });
			break;
		case "error":
			setUpdate({ state: "idle", message: "" });
			break;
	}
}

function setStatus(patch) {
	state.status = Object.assign({}, state.status, patch);
	writeStatusTiddler();
	if (Host.ui) {
		Host.ui.refresh();
		if (state.status.errorCode === "auth" && state.status.state === "error" && !state.authToast) {
			state.authToast = Host.ui.toast("Reconnecte-toi à Google pour synchroniser ton journal.", {
				id: "auth", action: "Se reconnecter", onAction: () => { state.authToast = null; Host.reconnect(); }, timeout: 0
			});
		}
		if (state.status.state === "ok" && state.authToast) {
			state.authToast();
			state.authToast = null;
		}
	}
}

function writeStatusTiddler() {
	const tw = state.tw;
	if (!tw || !tw.wiki) {
		return;
	}
	tw.wiki.addTiddler(new tw.Tiddler({
		title: "$:/temp/monjournal/sync",
		text: state.status.state,
		label: statusLabel(state.status)
	}));
}

function refreshWiki() {
	if (state.tw && state.tw.syncer) {
		state.tw.syncer.handleRefreshEvent();
	}
}

function deviceId() {
	let id = localStorage.getItem("monjournal-device");
	if (!id) {
		id = Math.random().toString(36).slice(2) + Date.now().toString(36);
		localStorage.setItem("monjournal-device", id);
	}
	return id;
}

// Attend que tout soit écrit sur l'appareil, puis tente un dernier envoi.
async function flush(reason) {
	const tw = state.tw;
	const t0 = Date.now();
	while (Date.now() - t0 < 3000) {
		const twDirty = tw && tw.syncer && tw.syncer.isDirty();
		if (!twDirty && (!state.store || state.store.pendingWrites === 0)) {
			break;
		}
		if (tw && tw.syncer) {
			tw.syncer.processTaskQueue();
		}
		await delay(100);
	}
	if (state.sync && state.sync.isDirty()) {
		await withTimeout(state.sync.now(reason), 6000).catch(() => {});
	}
}

function askForAccount(message) {
	const p = state.platform;
	return new Promise((resolve) => {
		Host.ui.showGate({
			version: p.version,
			message,
			onSignIn: async () => {
				const session = await p.auth.signIn();
				resolve(Object.assign({ cloud: true }, session));
			}
		});
	});
}

async function openSession(session) {
	const p = state.platform;
	state.session = session;
	Host.ui.showLoading("Ouverture du journal…");
	const store = new Store(session.key);
	await store.open();
	state.store = store;

	if (session.cloud) {
		state.sync = new Sync({
			store,
			drive: new Drive(p),
			deviceId: deviceId(),
			onStatus: setStatus,
			onIncoming: refreshWiki
		});
		await state.sync.init();
		if (await store.isEmpty()) {
			Host.ui.showLoading("Récupération de ton journal depuis Google Drive…");
			await withTimeout(state.sync.now("initial"), 180000).catch(() => {});
		}
	} else {
		setStatus({ state: "local" });
	}

	const tiddlers = await store.loadAll();
	store.takeIncoming();
	window.$tw.preloadTiddlers = (window.$tw.preloadTiddlers || []).concat(tiddlers);
	window.$tw.boot.boot(() => {
		Host.ui.hideGate();
		afterBoot();
	});
}

function afterBoot() {
	const p = state.platform;
	if (state.sync) {
		state.sync.start();
	}
	p.onResume(() => {
		if (state.sync && Date.now() - (state.status.lastSync || 0) > 20000) {
			state.sync.now("resume");
		}
		if (Date.now() - state.lastUpdateCheck > UPDATE_INTERVAL) {
			Host.checkUpdate(false);
		}
	});
	p.onPause(() => {
		flush("pause");
	});
	p.onCloseRequest(() => flush("close"));
	if (p.onBack) {
		p.onBack(handleBack);
	}
	if (p.updater.supported) {
		state.update.supported = true;
		p.updater.onEvent(onUpdateEvent);
		setTimeout(() => Host.checkUpdate(false), 8000);
		setInterval(() => Host.checkUpdate(false), UPDATE_INTERVAL);
	}
}

// Bouton « retour » d'Android : ferme d'abord ce qui est ouvert (panneau
// Compte, fenêtres de l'appli, tiroirs du mode téléphone), sinon met l'appli
// en arrière-plan au lieu de la quitter.
function handleBack() {
	if (Host.ui.modal) {
		Host.ui.closeModal();
		return;
	}
	const before = document.body.childElementCount;
	document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	setTimeout(() => {
		if (document.body.childElementCount < before) {
			return;
		}
		const tw = state.tw;
		const open = (t) => tw && tw.wiki.getTiddlerText(t, "closed") === "open";
		if (tw && (open("$:/temp/journalapp/mobile-left") || open("$:/temp/journalapp/mobile-right"))) {
			tw.wiki.addTiddler({ title: "$:/temp/journalapp/mobile-left", text: "closed" });
			tw.wiki.addTiddler({ title: "$:/temp/journalapp/mobile-right", text: "closed" });
			return;
		}
		if (tw && tw.wiki.getTiddlerText("$:/state/journalapp/more-menu", "") === "open") {
			tw.wiki.addTiddler({ title: "$:/state/journalapp/more-menu", text: "closed" });
			return;
		}
		state.platform.minimize();
	}, 60);
}

function showFatal(error) {
	console.error(error);
	const div = document.createElement("div");
	div.className = "mj-gate";
	div.innerHTML = '<div class="mj-gate-card"><h1>Mon Journal</h1><p class="mj-gate-error"></p></div>';
	div.querySelector(".mj-gate-error").textContent = "Impossible de démarrer : " + ((error && error.message) || error);
	document.body.appendChild(div);
}

async function start() {
	try {
		state.platform = await createPlatform();
		Host.ui = new UI(Host);
		const p = state.platform;
		let session = LOCAL_SESSION;
		if (p.auth.available) {
			session = await p.auth.getSession().catch(() => null);
			session = session ? Object.assign({ cloud: true }, session) : await askForAccount();
		}
		await openSession(session);
	} catch (e) {
		showFatal(e);
	}
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", start);
} else {
	start();
}
