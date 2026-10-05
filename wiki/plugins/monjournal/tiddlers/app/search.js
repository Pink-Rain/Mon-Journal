/*\
title: $:/plugins/pinkrain/monjournal/search.js
type: application/javascript
module-type: library

Mon Journal — recherche dans tout le journal (titres, noms, textes).
Chaque résultat s'ouvre dans la bonne page de l'appli.
\*/
"use strict";

var Display = require("$:/plugins/pinkrain/monjournal/display.js"),
	Router = require("$:/plugins/pinkrain/monjournal/router.js");

var MAX_RESULTS = 60;

function normalize(s) {
	s = String(s || "");
	try {
		s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
	} catch(e) {}
	return s.toLowerCase();
}

function plain(text) {
	return String(text || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function mk(parent, tag, cls, text) {
	var el = document.createElement(tag);
	if(cls) {
		el.className = cls;
	}
	if(text !== undefined) {
		el.textContent = text;
	}
	if(parent) {
		parent.appendChild(el);
	}
	return el;
}

function candidates(wiki) {
	var out = [];
	wiki.each(function(tiddler, title) {
		if(wiki.isSystemTiddler(title) || tiddler.fields["draft.of"] || /^image\/|^audio\//.test(String(tiddler.fields.type || ""))) {
			return;
		}
		var f = tiddler.fields,
			name = Display.displayTitle(wiki, title),
			body = plain(f.text);
		out.push({
			title: title,
			name: name,
			kind: String(f.kind || ""),
			date: String(f.date || ""),
			modified: f.modified ? f.modified.getTime() : 0,
			body: body,
			hay: normalize(name + " " + title + " " + body + " " + [f.people, f.places, f.activities, f.address].join(" "))
		});
	});
	return out;
}

function snippet(body, query) {
	if(!body) {
		return "";
	}
	var i = normalize(body).indexOf(query);
	if(i < 0) {
		return body.slice(0, 120);
	}
	var start = Math.max(0, i - 40);
	return (start ? "…" : "") + body.slice(start, start + 140) + (start + 140 < body.length ? "…" : "");
}

exports.open = function(wiki) {
	var old = document.querySelector(".mj-search-overlay");
	if(old) {
		old.remove();
	}
	var overlay = mk(document.body, "div", "ja-jform-overlay mj-search-overlay"),
		modal = mk(overlay, "div", "ja-jform-modal mj-search-modal"),
		head = mk(modal, "div", "ja-jform-head"),
		heading = mk(head, "div", "ja-agenda-form-heading");
	mk(heading, "div", "ja-agenda-form-kicker", "🔎 Journal");
	mk(heading, "h2", "ja-jform-title", "Rechercher");
	var actions = mk(head, "div", "ja-jform-headactions"),
		closeBtn = mk(actions, "button", "ja-jform-secondary", "Fermer");
	closeBtn.type = "button";
	var body = mk(modal, "div", "ja-jform-body mj-search-body"),
		input = mk(body, "input", "ja-jform-input mj-search-input");
	input.type = "search";
	input.placeholder = "Un mot, un prénom, un lieu…";
	var info = mk(body, "div", "mj-search-info"),
		list = mk(body, "div", "mj-search-results"),
		pool = candidates(wiki);

	function close() {
		document.removeEventListener("keydown", onKey, true);
		overlay.remove();
	}
	function onKey(e) {
		if(e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}
	function render() {
		var q = normalize(input.value.trim());
		list.textContent = "";
		var results = q ? pool.filter(function(c) {return c.hay.indexOf(q) !== -1;}) : pool.slice();
		results.sort(function(a, b) {
			var an = normalize(a.name).indexOf(q) !== -1 ? 0 : 1,
				bn = normalize(b.name).indexOf(q) !== -1 ? 0 : 1;
			return q && an !== bn ? an - bn : (b.date || "").localeCompare(a.date || "") || b.modified - a.modified;
		});
		info.textContent = q
			? (results.length ? results.length + " résultat" + (results.length > 1 ? "s" : "") : "Aucun résultat.")
			: "Derniers éléments modifiés";
		results.slice(0, MAX_RESULTS).forEach(function(r) {
			var row = mk(list, "button", "mj-search-row");
			row.type = "button";
			mk(row, "span", "mj-search-icon", Display.kindIcon(r.kind));
			var main = mk(row, "span", "mj-search-main");
			mk(main, "span", "mj-search-name", r.name);
			var meta = [Display.kindLabel(r.kind), r.date && r.kind !== "Daily" ? Display.formatDate(r.date) : ""].filter(Boolean).join(" · ");
			if(meta) {
				mk(main, "span", "mj-search-meta", meta);
			}
			var snip = q ? snippet(r.body, q) : "";
			if(snip) {
				mk(main, "span", "mj-search-snippet", snip);
			}
			row.addEventListener("click", function() {
				close();
				Router.open(wiki, r.title);
			});
		});
	}
	closeBtn.addEventListener("click", close);
	overlay.addEventListener("mousedown", function(e) {
		if(e.target === overlay) {
			close();
		}
	});
	document.addEventListener("keydown", onKey, true);
	input.addEventListener("input", render);
	render();
	setTimeout(function() {
		input.focus();
	}, 30);
};
