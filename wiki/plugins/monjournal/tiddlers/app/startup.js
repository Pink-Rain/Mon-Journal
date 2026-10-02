/*\
title: $:/plugins/pinkrain/monjournal/startup.js
type: application/javascript
module-type: startup

Mon Journal — relie l'interface TiddlyWiki à l'hôte de l'appli
(compte Google, synchronisation, mises à jour).
\*/
"use strict";

exports.name = "monjournal-host-bridge";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function() {
	var host = window.MonJournalHost;
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
