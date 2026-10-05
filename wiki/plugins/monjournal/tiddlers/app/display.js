/*\
title: $:/plugins/pinkrain/monjournal/display.js
type: application/javascript
module-type: library

Mon Journal — noms lisibles pour l'interface : « Entrée du 10 août 2026 à
05:37 » au lieu du titre technique d'une entrée, types en français, etc.
\*/
"use strict";

var KIND_LABELS = {
	Daily: "Entrée", event: "Événement", todo: "To-do", habit: "Habitude",
	vacation: "Vacances", slot: "Créneau", person: "Relation", place: "Lieu",
	activity: "Activité", project: "Projet", media: "Média", "sleep-entry": "Nuit",
	dream: "Rêve", note: "Note", Aide: "Aide"
};

var KIND_ICONS = {
	Daily: "📖", event: "📅", todo: "✅", habit: "↻", vacation: "🌴", slot: "🕒",
	person: "👤", place: "📍", activity: "🏃", project: "🧩", media: "🎞️",
	"sleep-entry": "🌙", dream: "💭", note: "📝", Aide: "🗝️"
};

function formatDate(iso) {
	var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if(!m) {
		return String(iso || "");
	}
	try {
		return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("fr-FR", {day: "numeric", month: "long", year: "numeric"});
	} catch(e) {
		return String(iso);
	}
}

function displayTitle(wiki, title) {
	var t = wiki.getTiddler(title);
	if(!t) {
		return String(title || "");
	}
	var f = t.fields,
		kind = String(f.kind || "");
	if(kind === "Daily") {
		var day = f.date ? formatDate(f.date) : "";
		return "Entrée" + (day ? " du " + day : "") + (f.time ? " à " + f.time : "");
	}
	if(f.label) {
		return String(f.label);
	}
	if(wiki.isSystemTiddler(title) && (f["media-name"] || f.caption)) {
		return String(f["media-name"] || f.caption);
	}
	return String(title);
}

function kindLabel(kind) {
	return KIND_LABELS[kind] || String(kind || "");
}

function kindIcon(kind) {
	return KIND_ICONS[kind] || "•";
}

exports.formatDate = formatDate;
exports.displayTitle = displayTitle;
exports.kindLabel = kindLabel;
exports.kindIcon = kindIcon;
exports.KIND_LABELS = KIND_LABELS;
