/*\
title: $:/journalapp/modules/startup/inventory-details.js
type: application/javascript
module-type: startup
\*/

"use strict";

exports.name = "journalapp-inventory-details";
exports.platforms = ["browser"];
exports.after = ["render"];
exports.synchronous = true;

exports.startup = function() {
	document.addEventListener("click",function(event) {
		var target = event.target && event.target.closest ? event.target.closest("[data-ja-details-action]") : null;
		if(!target) {return;}
		var center = target.closest(".ja-center") || document,
			open = target.getAttribute("data-ja-details-action") === "open";
		Array.prototype.forEach.call(center.querySelectorAll("details.ja-category-item"),function(details) {
			details.open = open;
		});
	});
};