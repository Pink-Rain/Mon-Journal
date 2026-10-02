/*\
title: $:/plugins/pinkrain/monjournal/syncadaptor.js
type: application/javascript
module-type: syncadaptor

Mon Journal — enregistre chaque modification dans le stockage local de
l'appli (IndexedDB, via MonJournalHost). La synchronisation avec Google
Drive est faite par l'hôte ; les changements venus du cloud reviennent ici
via getUpdatedTiddlers.
\*/
"use strict";

function host() {
	return (typeof window !== "undefined" && window.MonJournalHost) || null;
}

function MonJournalAdaptor(options) {
	this.wiki = options.wiki;
}

MonJournalAdaptor.prototype.name = "monjournal";
MonJournalAdaptor.prototype.supportsLazyLoading = false;

MonJournalAdaptor.prototype.isReady = function() {
	return !!host();
};

MonJournalAdaptor.prototype.getTiddlerInfo = function(tiddler) {
	return {};
};

MonJournalAdaptor.prototype.getTiddlerRevision = function(title) {
	var h = host();
	return h ? h.store.revisionOf(title) : undefined;
};

MonJournalAdaptor.prototype.getStatus = function(callback) {
	var h = host(),
		account = h && h.account();
	callback(null, !!account, account ? (account.name || account.email) : "", false, !account);
};

MonJournalAdaptor.prototype.saveTiddler = function(tiddler, callback, options) {
	host().store.save(tiddler.getFieldStrings()).then(function(rev) {
		callback(null, {}, rev);
	}, callback);
};

MonJournalAdaptor.prototype.loadTiddler = function(title, callback) {
	host().store.load(title).then(function(fields) {
		callback(null, fields || null);
	}, callback);
};

MonJournalAdaptor.prototype.deleteTiddler = function(title, callback, options) {
	host().store.remove(title).then(function() {
		callback(null);
	}, callback);
};

MonJournalAdaptor.prototype.getUpdatedTiddlers = function(syncer, callback) {
	callback(null, host().store.takeIncoming());
};

if($tw.browser) {
	exports.adaptorClass = MonJournalAdaptor;
}
