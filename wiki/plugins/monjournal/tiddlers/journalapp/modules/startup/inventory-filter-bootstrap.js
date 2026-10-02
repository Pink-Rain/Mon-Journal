/*\
title: $:/journalapp/modules/startup/inventory-filter-bootstrap.js
type: application/javascript
module-type: startup

Enregistre explicitement l'opérateur jainventory avant le premier rendu.
TiddlyWiki met en cache sa table d'opérateurs de filtre; ce bootstrap évite
que notre opérateur ajouté comme tiddler ordinaire soit traité comme un field inconnu.
\*/

"use strict";

exports.name = "journalapp-inventory-filter-bootstrap";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.before = ["render"];
exports.synchronous = true;

exports.startup = function() {
	var inventory = require("$:/journalapp/modules/filters/inventory.js"),
		operators = $tw.wiki.getFilterOperators();

	if(inventory && typeof inventory.jainventory === "function") {
		operators.jainventory = inventory.jainventory;
		$tw.Wiki.prototype.filterOperators = operators;

		/* Les expressions de filtre peuvent avoir été compilées plus tôt. */
		$tw.wiki.filterCache = Object.create(null);
		$tw.wiki.filterCacheCount = 0;
	}
};
