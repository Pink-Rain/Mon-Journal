/*\
title: $:/plugins/pinkrain/monjournal/startup.js
type: application/javascript
module-type: startup

Mon Journal — relie l'interface à l'hôte de l'appli (compte Google,
synchronisation, mises à jour) et remplace tout ce qui afficherait
TiddlyWiki lui-même : fenêtre de tiddler, éditeur, panneau de contrôle,
messages d'erreur.
\*/
"use strict";

exports.name = "monjournal-host-bridge";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var Router = require("$:/plugins/pinkrain/monjournal/router.js"),
		NoteForm = require("$:/plugins/pinkrain/monjournal/note-form.js"),
		CreateMenu = require("$:/plugins/pinkrain/monjournal/create-menu.js"),
		Search = require("$:/plugins/pinkrain/monjournal/search.js"),
		Navigator = require("$:/core/modules/widgets/navigator.js").navigator,
		host = window.MonJournalHost,
		wiki = $tw.wiki;

	// ---- Navigation : chaque lien ouvre une page de l'appli -------------
	Navigator.prototype.handleNavigateEvent = function(event) {
		Router.open(this.wiki, event.navigateTo);
		return false;
	};
	Navigator.prototype.handleEditTiddlerEvent = function(event) {
		var title = event.param || event.tiddlerTitle,
			tiddler = this.wiki.getTiddler(title);
		if(tiddler && NoteForm.isRichEditable(tiddler) && !tiddler.fields.kind) {
			NoteForm.open(this.wiki, {editTitle: title});
		} else {
			Router.open(this.wiki, title);
		}
		return false;
	};
	Navigator.prototype.handleNewTiddlerEvent = function() {
		NoteForm.open(this.wiki, {});
		return false;
	};
	$tw.rootWidget.addEventListener("tm-navigate", function(event) {
		Router.open(wiki, event.navigateTo);
		return false;
	});

	// ---- Boutons de l'appli (data-mj-action) -----------------------------
	document.addEventListener("click", function(event) {
		var target = event.target && event.target.closest ? event.target.closest("[data-mj-action]") : null;
		if(!target) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		var action = target.getAttribute("data-mj-action");
		if(action === "create") {
			CreateMenu.open(wiki, target);
		} else if(action === "search") {
			Search.open(wiki);
		} else if(action === "settings") {
			wiki.setText("$:/temp/journalapp/mobile-left", "text", null, "closed", {suppressTimestamp: true});
			Router.goCategory(wiki, "settings");
		} else if(action === "edit-note") {
			NoteForm.open(wiki, {editTitle: target.getAttribute("data-mj-title")});
		} else if(action === "account" && host) {
			host.ui.openAccount();
		}
	}, true);

	// ---- Plus jamais les fenêtres d'erreur de TiddlyWiki -----------------
	var lastErrorToast = 0;
	function quietError(err) {
		console.error("[Mon Journal]", err);
		if(host && host.ui && Date.now() - lastErrorToast > 15000) {
			lastErrorToast = Date.now();
			host.ui.toast("Oups, un petit bug est survenu. Si quelque chose ne répond plus, ferme et rouvre l'appli.");
		}
	}
	$tw.utils.error = quietError;
	window.onerror = function(message) {
		quietError(message);
		return true;
	};
	$tw.utils.Logger.prototype.alert = function() {
		console.warn.apply(console, ["[Mon Journal]"].concat(Array.prototype.slice.call(arguments)));
	};

	if(!host) {
		return;
	}
	$tw.rootWidget.addEventListener("tm-monjournal-account", function() {
		host.ui.openAccount();
		return false;
	});
	$tw.rootWidget.addEventListener("tm-monjournal-sync", function() {
		host.sync.now("manual");
		return false;
	});
	host.attachWiki($tw);
};
