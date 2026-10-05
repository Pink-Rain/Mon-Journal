/*\
title: $:/plugins/pinkrain/monjournal/filters.js
type: application/javascript
module-type: filteroperator

[<titre>mjdisplay[]]   → nom lisible d'un élément
[<kind>mjkindlabel[]]  → type en français
\*/
"use strict";

var Display = require("$:/plugins/pinkrain/monjournal/display.js");

exports.mjdisplay = function(source, operator, options) {
	var results = [];
	source(function(tiddler, title) {
		results.push(Display.displayTitle(options.wiki, title));
	});
	return results;
};

exports.mjkindlabel = function(source, operator, options) {
	var results = [];
	source(function(tiddler, title) {
		results.push(Display.kindLabel(title));
	});
	return results;
};
