// Écrans de l'hôte, en dehors de TiddlyWiki : connexion, chargement,
// notifications et panneau « Compte & synchronisation ».
import { formatRelative } from "./util.js";
import { parseWikiFile, summarize } from "./importer.js";

const GOOGLE_G =
	'<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function el(tag, attrs, children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (k === "class") {
			node.className = v;
		} else if (k === "html") {
			node.innerHTML = v;
		} else if (k.startsWith("on")) {
			node.addEventListener(k.slice(2), v);
		} else if (v !== undefined && v !== null && v !== false) {
			node.setAttribute(k, v === true ? "" : v);
		}
	}
	for (const child of [].concat(children || [])) {
		if (child !== null && child !== undefined && child !== false) {
			node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
		}
	}
	return node;
}

const STATE_LABELS = {
	idle: "Synchronisation prête",
	syncing: "Synchronisation en cours…",
	pending: "Modifications en attente d'envoi",
	ok: "Tout est synchronisé",
	offline: "Hors ligne — tes modifications sont gardées sur l'appareil",
	error: "La synchronisation a échoué",
	local: "Données sur cet appareil uniquement"
};

export function statusLabel(status) {
	return STATE_LABELS[status.state] || STATE_LABELS.idle;
}

export class UI {
	constructor(host) {
		this.host = host;
		this.gateNode = null;
		this.modal = null;
		this.toastHost = null;
	}

	// ---------- Connexion ----------

	showGate({ onSignIn, message, version }) {
		this.hideGate();
		const error = el("p", { class: "mj-gate-error", role: "alert" }, message || "");
		const hint = el("p", { class: "mj-gate-note mj-gate-hint" }, "");
		const label = el("span", {}, "Se connecter avec Google");
		const button = el("button", { class: "mj-google-btn", type: "button" }, [
			el("span", { class: "mj-google-g", html: GOOGLE_G }),
			label
		]);
		// Le bouton reste cliquable : sur Windows, si l'onglet du navigateur a
		// été fermé, un nouveau clic relance simplement la connexion.
		let attempt = 0;
		button.addEventListener("click", async () => {
			const mine = ++attempt;
			label.textContent = "Connexion…";
			error.textContent = "";
			hint.textContent = this.host.platformName() === "windows"
				? "Termine la connexion dans la page Google qui vient de s'ouvrir dans ton navigateur."
				: "";
			try {
				await onSignIn();
			} catch (e) {
				if (mine !== attempt) {
					return;
				}
				error.textContent = e && e.code === "cancelled" ? "" : (e && e.message) || "La connexion a échoué.";
				hint.textContent = "";
				label.textContent = "Se connecter avec Google";
			}
		});
		this.gateNode = el("div", { class: "mj-gate" }, [
			el("div", { class: "mj-gate-card" }, [
				el("img", { class: "mj-gate-icon", src: "icon.png", alt: "" }),
				el("h1", {}, "Mon Journal"),
				el("p", { class: "mj-gate-kicker" }, "Journal · Agenda · Relations"),
				button,
				hint,
				error,
				el("p", { class: "mj-gate-note" }, "Ton journal est enregistré dans ton propre Google Drive, dans un dossier réservé à l'application. Personne d'autre n'y a accès.")
			]),
			el("p", { class: "mj-gate-version" }, version ? "Version " + version : "")
		]);
		document.body.appendChild(this.gateNode);
	}

	showLoading(text) {
		this.hideGate();
		this.gateNode = el("div", { class: "mj-gate" }, [
			el("div", { class: "mj-gate-card" }, [
				el("img", { class: "mj-gate-icon mj-pulse", src: "icon.png", alt: "" }),
				el("p", { class: "mj-gate-loading" }, text || "Ouverture du journal…")
			])
		]);
		document.body.appendChild(this.gateNode);
	}

	hideGate() {
		if (this.gateNode) {
			this.gateNode.remove();
			this.gateNode = null;
		}
	}

	// ---------- Notifications ----------

	toast(message, { action, onAction, timeout = 6000, id } = {}) {
		if (!this.toastHost) {
			this.toastHost = el("div", { class: "mj-toasts", "aria-live": "polite" });
			document.body.appendChild(this.toastHost);
		}
		if (id) {
			const existing = this.toastHost.querySelector('[data-id="' + id + '"]');
			if (existing) {
				existing.remove();
			}
		}
		const node = el("div", { class: "mj-toast", "data-id": id || "" }, [el("span", {}, message)]);
		const close = () => node.remove();
		if (action) {
			node.appendChild(el("button", { type: "button", class: "mj-toast-action", onclick: () => { close(); onAction && onAction(); } }, action));
		}
		node.appendChild(el("button", { type: "button", class: "mj-toast-close", "aria-label": "Fermer", onclick: close }, "×"));
		this.toastHost.appendChild(node);
		if (timeout) {
			setTimeout(close, timeout);
		}
		return close;
	}

	// ---------- Compte & synchronisation ----------

	openAccount() {
		this.closeModal();
		const body = el("div", { class: "mj-modal-body" });
		const panel = el("div", { class: "mj-modal", role: "dialog", "aria-modal": "true", "aria-label": "Compte et synchronisation" }, [
			el("header", { class: "mj-modal-head" }, [
				el("h2", {}, "Compte & synchronisation"),
				el("button", { type: "button", class: "mj-btn", onclick: () => this.closeModal() }, "Fermer")
			]),
			body
		]);
		const backdrop = el("div", { class: "mj-backdrop", onclick: (e) => { if (e.target === backdrop) { this.closeModal(); } } }, panel);
		this.modal = { node: backdrop, body, view: "main" };
		document.body.appendChild(backdrop);
		this.renderAccount();
	}

	closeModal() {
		if (this.modal) {
			this.modal.node.remove();
			this.modal = null;
		}
	}

	refresh() {
		if (this.modal && this.modal.view === "main") {
			this.renderAccount();
		}
	}

	renderAccount() {
		const host = this.host;
		const body = this.modal.body;
		body.textContent = "";
		const account = host.account();
		const status = host.syncStatus();
		const update = host.updateState();

		const avatar = account && account.photo
			? el("img", { class: "mj-avatar", src: account.photo, alt: "", referrerpolicy: "no-referrer" })
			: el("div", { class: "mj-avatar mj-avatar-letter" }, ((account && (account.name || account.email)) || "?").slice(0, 1).toUpperCase());
		body.appendChild(el("section", { class: "mj-section mj-account" }, [
			avatar,
			el("div", {}, [
				el("strong", {}, account ? account.name || account.email : "Mode local"),
				el("div", { class: "mj-muted" }, account ? account.email : "Pas de compte Google : les données restent dans ce navigateur.")
			])
		]));

		if (account && account.cloud) {
			body.appendChild(el("section", { class: "mj-section" }, [
				el("h3", {}, "Synchronisation"),
				el("p", { class: "mj-sync-line mj-state-" + status.state }, statusLabel(status)),
				status.error ? el("p", { class: "mj-muted mj-small" }, status.error) : null,
				el("p", { class: "mj-muted mj-small" }, "Dernière synchronisation : " + formatRelative(status.lastSync)),
				el("div", { class: "mj-row" }, [
					status.errorCode === "auth"
						? el("button", { type: "button", class: "mj-btn mj-btn-primary", onclick: () => host.reconnect() }, "Se reconnecter à Google")
						: el("button", { type: "button", class: "mj-btn mj-btn-primary", disabled: status.state === "syncing", onclick: () => host.sync.now("manual") }, "Synchroniser maintenant")
				])
			]));
		}

		const fileInput = el("input", { type: "file", accept: ".html,.htm,.json", hidden: true });
		fileInput.addEventListener("change", () => {
			const file = fileInput.files && fileInput.files[0];
			if (file) {
				this.prepareImport(file);
			}
		});
		body.appendChild(el("section", { class: "mj-section" }, [
			el("h3", {}, "Données"),
			el("p", { class: "mj-muted mj-small" }, "Récupère les entrées d'un ancien wiki TiddlyWiki (fichier .html ou export .json), ou garde une copie de sécurité de ton journal."),
			el("div", { class: "mj-row" }, [
				el("button", { type: "button", class: "mj-btn", onclick: () => fileInput.click() }, "Importer depuis TiddlyWiki…"),
				el("button", { type: "button", class: "mj-btn", onclick: () => host.exportBackup() }, "Exporter une copie"),
				fileInput
			])
		]));

		const updateRow = [];
		if (update.supported) {
			if (update.state === "downloaded" || update.state === "available-android") {
				updateRow.push(el("button", { type: "button", class: "mj-btn mj-btn-primary", onclick: () => host.installUpdate() }, update.state === "downloaded" ? "Redémarrer pour mettre à jour" : "Installer la version " + update.version));
			} else {
				updateRow.push(el("button", { type: "button", class: "mj-btn", disabled: update.state === "checking" || update.state === "downloading", onclick: () => host.checkUpdate(true) }, "Rechercher une mise à jour"));
			}
		}
		body.appendChild(el("section", { class: "mj-section" }, [
			el("h3", {}, "Application"),
			el("p", { class: "mj-muted mj-small" }, "Mon Journal " + host.version() + (update.message ? " — " + update.message : "")),
			updateRow.length ? el("div", { class: "mj-row" }, updateRow) : null
		]));

		if (account && account.cloud) {
			body.appendChild(el("section", { class: "mj-section mj-section-end" }, [
				el("button", { type: "button", class: "mj-btn mj-btn-danger", onclick: () => this.confirmSignOut() }, "Se déconnecter")
			]));
		}
	}

	confirmSignOut() {
		const body = this.modal.body;
		this.modal.view = "signout";
		body.textContent = "";
		body.appendChild(el("section", { class: "mj-section" }, [
			el("h3", {}, "Se déconnecter ?"),
			el("p", {}, "Ton journal reste dans ton Google Drive. Sur cet appareil, il faudra te reconnecter pour l'ouvrir."),
			el("div", { class: "mj-row" }, [
				el("button", { type: "button", class: "mj-btn", onclick: () => { this.modal.view = "main"; this.renderAccount(); } }, "Annuler"),
				el("button", { type: "button", class: "mj-btn mj-btn-danger", onclick: () => this.host.signOut() }, "Se déconnecter")
			])
		]));
	}

	async prepareImport(file) {
		const body = this.modal.body;
		this.modal.view = "import";
		body.textContent = "";
		body.appendChild(el("p", { class: "mj-muted" }, "Lecture de « " + file.name + " »…"));
		let summary;
		try {
			summary = summarize(parseWikiFile(await file.text()));
		} catch (e) {
			body.textContent = "";
			body.appendChild(el("section", { class: "mj-section" }, [
				el("h3", {}, "Fichier illisible"),
				el("p", {}, (e && e.message) || String(e)),
				el("div", { class: "mj-row" }, el("button", { type: "button", class: "mj-btn", onclick: () => { this.modal.view = "main"; this.renderAccount(); } }, "Retour"))
			]));
			return;
		}
		body.textContent = "";
		body.appendChild(el("section", { class: "mj-section" }, [
			el("h3", {}, "Importer « " + file.name + " »"),
			el("p", {}, summary.kept.length + " éléments seront importés : " + summary.entries + " entrées du journal, " + summary.media + " images et sons, " + summary.settings + " réglages, et le reste (agenda, relations, lieux…)."),
			el("p", { class: "mj-muted mj-small" }, summary.skipped + " éléments techniques de l'ancien wiki sont ignorés : l'appli a déjà sa propre version de l'interface. Un élément qui existe déjà avec le même nom sera remplacé."),
			el("div", { class: "mj-row" }, [
				el("button", { type: "button", class: "mj-btn", onclick: () => { this.modal.view = "main"; this.renderAccount(); } }, "Annuler"),
				el("button", {
					type: "button",
					class: "mj-btn mj-btn-primary",
					onclick: async (e) => {
						e.target.disabled = true;
						e.target.textContent = "Import…";
						const count = await this.host.importTiddlers(summary.kept);
						this.closeModal();
						this.toast(count + " éléments importés. Ils partent maintenant vers ton Google Drive.", { timeout: 8000 });
					}
				}, "Importer")
			])
		]));
	}
}
