/*\
title: $:/plugins/pinkrain/monjournal/router.js
type: application/javascript
module-type: library

Mon Journal — ouvre n'importe quel élément dans la bonne page de l'appli
(entrée → Journal, événement → Agenda, relation → sa fiche…), à la place de
la fenêtre TiddlyWiki.
\*/
"use strict";

var VIEW = "$:/state/journalapp/view",
	CATEGORY = "$:/state/journalapp/category",
	CONTENT = "$:/state/journalapp/content-tiddler";

var ENTITY_CATEGORY = {
	person: "relations", place: "lieux", activity: "activite", project: "projet", media: "media"
};
var AGENDA_KINDS = {event: true, todo: true, habit: true, vacation: true, slot: true};

function set(wiki, title, value) {
	wiki.setText(title, "text", null, value, {suppressTimestamp: true});
}

function toast(message) {
	var host = typeof window !== "undefined" && window.MonJournalHost;
	if(host && host.ui) {
		host.ui.toast(message);
	}
}

function category(slug) {
	return "$:/journalapp/categories/" + slug;
}

function goCategory(wiki, slug, view) {
	var cat = category(slug),
		t = wiki.getTiddler(cat);
	set(wiki, CATEGORY, cat);
	set(wiki, VIEW, view || (t && t.fields["landing-view"]) || "");
}

function closePanels(wiki) {
	set(wiki, "$:/temp/journalapp/mobile-left", "closed");
	set(wiki, "$:/temp/journalapp/mobile-right", "closed");
	wiki.setText("$:/temp/journalapp/story", "list", null, "");
}

function isUserMedia(title) {
	return /^\$:\/journalapp\/(media|banners|event-type-icons|event-type-backgrounds|library)\//.test(title);
}

function isoOf(value) {
	var m = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
	return m ? m[0] : "";
}

function openEntity(wiki, title, slug) {
	var current = wiki.getTiddlerText(VIEW, "");
	if(current && current !== "$:/journalapp/views/shared/entity-detail") {
		set(wiki, "$:/state/journalapp/entity-detail-return-view", current);
	}
	set(wiki, CATEGORY, category(slug));
	set(wiki, "$:/state/journalapp/entity-detail", title);
	set(wiki, VIEW, "$:/journalapp/views/shared/entity-detail");
}

// Renvoie true quand la navigation a été prise en charge (toujours, en
// pratique : rien ne doit jamais ouvrir la fenêtre TiddlyWiki).
exports.goCategory = goCategory;

exports.open = function(wiki, title) {
	title = String(title || "");
	if(!title) {
		return true;
	}
	var t = wiki.getTiddler(title);
	if(wiki.isSystemTiddler(title) && !isUserMedia(title)) {
		return true;
	}
	if(!t) {
		toast("« " + title + " » n'existe pas (encore).");
		return true;
	}
	closePanels(wiki);
	var kind = String(t.fields.kind || "");
	if(kind === "Daily") {
		goCategory(wiki, "journal", "$:/journalapp/views/journal/home");
		var day = isoOf(t.fields.date);
		if(day) {
			set(wiki, "$:/state/journalapp/journal-date", day);
		}
		set(wiki, "$:/state/journalapp/journal-focus-daily", title);
		return true;
	}
	if(AGENDA_KINDS[kind]) {
		goCategory(wiki, "agenda", "$:/journalapp/views/agenda/day");
		var date = isoOf(t.fields.date || t.fields.deadline || t.fields.due);
		if(date) {
			set(wiki, "$:/state/journalapp/agenda-date", date);
		}
		return true;
	}
	if(ENTITY_CATEGORY[kind]) {
		openEntity(wiki, title, ENTITY_CATEGORY[kind]);
		return true;
	}
	if(kind === "sleep-entry" || kind === "dream") {
		goCategory(wiki, "sommeil");
		var Forms = require("$:/journalapp/modules/lib/entity-forms.js"),
			host = {wiki: wiki, document: document};
		(kind === "dream" ? Forms.openDream : Forms.openSleep)(host, {editTitle: title});
		return true;
	}
	set(wiki, CONTENT, title);
	set(wiki, VIEW, "$:/journalapp/views/shared/content-tiddler");
	return true;
};
