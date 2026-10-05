/*\
title: $:/plugins/pinkrain/monjournal/create-menu.js
type: application/javascript
module-type: library

Mon Journal — menu du bouton « + » : crée directement une entrée, un
événement, une relation… avec les formulaires de l'appli.
\*/
"use strict";

function set(wiki, title, value) {
	wiki.setText(title, "text", null, value, {suppressTimestamp: true});
}

// Les formulaires Relations, Lieux, Média… s'ouvrent depuis n'importe quel
// élément portant data-ja-open-entity-form : on en pose un, invisible, à
// l'endroit du bouton, et on le clique.
function openEntityForm(anchor, type) {
	var rect = anchor.getBoundingClientRect(),
		launcher = document.createElement("button");
	launcher.type = "button";
	launcher.setAttribute("data-ja-open-entity-form", type);
	launcher.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:" + rect.width + "px;height:" + rect.height +
		"px;left:" + rect.left + "px;top:" + rect.top + "px;";
	document.body.appendChild(launcher);
	launcher.click();
	setTimeout(function() {
		launcher.remove();
	}, 1500);
}

function openJournalEntry(wiki) {
	set(wiki, "$:/state/journalapp/category", "$:/journalapp/categories/journal");
	set(wiki, "$:/state/journalapp/view", "$:/journalapp/views/journal/home");
	set(wiki, "$:/temp/journalapp/mobile-left", "closed");
	var tries = 0;
	(function attempt() {
		var add = document.querySelector(".ja-journal-add");
		if(add) {
			add.click();
		} else if(tries++ < 20) {
			setTimeout(attempt, 60);
		}
	})();
}

function today() {
	var d = new Date();
	return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

exports.open = function(wiki, anchor) {
	var AF = require("$:/journalapp/modules/lib/agenda-forms.js"),
		NoteForm = require("$:/plugins/pinkrain/monjournal/note-form.js"),
		host = {wiki: wiki, document: document},
		currentCategory = wiki.getTiddler(wiki.getTiddlerText("$:/state/journalapp/category", "")),
		categoryTag = currentCategory ? String(currentCategory.fields["category-tag"] || "") : "";
	AF.shared.popover(document, anchor, [
		{label: "📖 Entrée du journal", run: function() {openJournalEntry(wiki);}},
		{sep: true},
		{label: "📅 Événement", run: function() {AF.openEvent(host, {date: today()});}},
		{label: "✅ To-do", run: function() {AF.openTodo(host, {});}},
		{label: "↻ Habitude", run: function() {AF.openHabit(host, {});}},
		{label: "🌴 Vacances", run: function() {AF.openVacation(host, {});}},
		{sep: true},
		{label: "👤 Relation", run: function() {openEntityForm(anchor, "person");}},
		{label: "📍 Lieu", run: function() {openEntityForm(anchor, "place");}},
		{label: "🏃 Activité", run: function() {openEntityForm(anchor, "activity");}},
		{label: "🧩 Projet", run: function() {openEntityForm(anchor, "project");}},
		{label: "🎞️ Média", run: function() {openEntityForm(anchor, "media");}},
		{label: "🌙 Nuit", run: function() {openEntityForm(anchor, "sleep");}},
		{label: "💭 Rêve", run: function() {openEntityForm(anchor, "dream");}},
		{sep: true},
		{label: "📝 Note libre", run: function() {NoteForm.open(wiki, {category: categoryTag === "Settings" ? "" : categoryTag});}}
	]);
};
