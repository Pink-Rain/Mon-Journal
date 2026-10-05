/*\
title: $:/plugins/pinkrain/monjournal/note-form.js
type: application/javascript
module-type: library

Mon Journal — formulaire « Note libre », construit avec les mêmes briques que
les formulaires de l'Agenda (même fenêtre, même éditeur de texte riche).
\*/
"use strict";

var CATEGORIES = [
	["", "Sans catégorie"], ["Accueil", "Accueil"], ["Journal", "Journal"], ["Agenda", "Agenda"],
	["Projet", "Projet"], ["Sommeil", "Sommeil"], ["Relations", "Relations"], ["Lieux", "Lieux"],
	["Activité", "Activité"], ["Média", "Média"]
];
var CATEGORY_TAGS = CATEGORIES.map(function(c) {return c[0];}).filter(Boolean);

// Une note créée ou modifiable dans l'appli : texte vide, simple ou HTML.
// Les textes écrits en syntaxe TiddlyWiki (tableaux, titres « ! », macros…)
// restent en lecture seule pour ne jamais les abîmer.
function isRichEditable(tiddler) {
	if(!tiddler) {
		return true;
	}
	var f = tiddler.fields,
		text = String(f.text || "");
	if(f.type && f.type !== "text/vnd.tiddlywiki" && f.type !== "text/html") {
		return false;
	}
	if(String(f.kind || "") === "note" && !/^\s*[!|*#;:>]|<<|\{\{|\[\[|<\$|\\define|''|\/\/|^```/m.test(text)) {
		return true;
	}
	return !/^\s*[!|*#;:>]|<<|\{\{|\[\[|<\$|\\define|''|\/\/|^```|^---/m.test(text);
}

function tagsOf(tiddler) {
	if(!tiddler) {
		return [];
	}
	var tags = tiddler.fields.tags;
	return Array.isArray(tags) ? tags.slice() : ($tw.utils.parseStringArray(String(tags || "")) || []);
}

function open(wiki, opts) {
	opts = opts || {};
	var AF = require("$:/journalapp/modules/lib/agenda-forms.js"),
		Router = require("$:/plugins/pinkrain/monjournal/router.js"),
		S = AF.shared,
		doc = document,
		host = {wiki: wiki, document: doc},
		t = opts.editTitle ? wiki.getTiddler(opts.editTitle) : null,
		tags = tagsOf(t),
		currentCategory = tags.filter(function(tag) {return CATEGORY_TAGS.indexOf(tag) !== -1;})[0] || opts.category || "";

	var form = S.shell(host, t ? "Modifier la note" : "Nouvelle note", "note", {
		icon: "📝",
		kicker: "Note",
		saveLabel: t ? "Enregistrer" : "Créer"
	});
	var titleInput = S.input(doc, form.body, "Titre", "text", t ? t.fields.title : "", "Donne-lui un titre…");
	var categorySelect = S.select(doc, form.body, "Catégorie", currentCategory, CATEGORIES);
	var state = {note: t ? String(t.fields.text || "") : ""};
	var editor = S.noteEditor(host, form.body, state);

	if(t) {
		var footer = S.mk(doc, form.body, "div", "mj-note-footer");
		var remove = S.button(doc, footer, "ja-jform-secondary mj-note-delete", "Supprimer la note");
		remove.addEventListener("click", function() {
			if(!window.confirm("Supprimer « " + t.fields.title + " » ?")) {
				return;
			}
			wiki.deleteTiddler(t.fields.title);
			form.setClean();
			form.close();
			wiki.setText("$:/state/journalapp/content-tiddler", "text", null, "", {suppressTimestamp: true});
		});
	}

	form.save.addEventListener("click", function() {
		var wanted = titleInput.value.trim() ||
			"Note du " + new Date().toLocaleDateString("fr-FR", {day: "numeric", month: "long", year: "numeric"});
		var oldTitle = t ? t.fields.title : null,
			newTitle = wanted;
		if(newTitle !== oldTitle && wiki.tiddlerExists(newTitle)) {
			var n = 2;
			while(wiki.tiddlerExists(wanted + " (" + n + ")")) {
				n++;
			}
			newTitle = wanted + " (" + n + ")";
		}
		var newTags = tags.filter(function(tag) {return CATEGORY_TAGS.indexOf(tag) === -1;});
		if(categorySelect.value) {
			newTags.push(categorySelect.value);
		}
		var fields = {
			title: newTitle,
			text: editor ? editor.value() : state.note,
			tags: newTags,
			kind: (t && t.fields.kind) || "note"
		};
		wiki.addTiddler(new $tw.Tiddler(wiki.getCreationFields(), t ? t.fields : {}, fields, wiki.getModificationFields()));
		if(oldTitle && oldTitle !== newTitle) {
			wiki.deleteTiddler(oldTitle);
		}
		form.setClean();
		form.close();
		Router.open(wiki, newTitle);
	});
	if(!t) {
		setTimeout(function() {
			titleInput.focus();
		}, 50);
	}
}

exports.open = open;
exports.isRichEditable = isRichEditable;
