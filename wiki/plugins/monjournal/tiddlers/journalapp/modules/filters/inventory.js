/*\
title: $:/journalapp/modules/filters/inventory.js
type: application/javascript
module-type: filteroperator

Filtre partagé de l'inventaire Mon Journal.
L'opérande est le préfixe des tiddlers temporaires contenant l'état UI.
\*/

"use strict";

function textState(wiki,prefix,name) {
	return (wiki.getTiddlerText(prefix + "/" + name,"") || "").trim();
}

function lower(value) {
	return String(value == null ? "" : value).toLocaleLowerCase();
}

function getDateMs(tiddler,field) {
	if(!tiddler || !tiddler.fields[field]) {
		return null;
	}
	var value = tiddler.fields[field], date;
	if($tw.utils.isDate(value)) {
		date = value;
	} else {
		date = $tw.utils.parseDate(value);
	}
	return date && !isNaN(date.getTime()) ? date.getTime() : null;
}

function parseLocalDay(value,endOfDay) {
	var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
	if(!match) {
		return null;
	}
	var date = new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),0,0,0,0);
	if(endOfDay) {
		date.setHours(23,59,59,999);
	}
	return date.getTime();
}

function effectiveSize(tiddler) {
	var manual = lower(tiddler && tiddler.fields["card-size"]);
	if(manual === "small" || manual === "medium" || manual === "large") {
		return manual;
	}
	var length = String(tiddler && tiddler.fields.text || "").length;
	return length > 1800 ? "large" : (length > 650 ? "medium" : "small");
}

exports.jainventory = function(source,operator,options) {
	var wiki = options.wiki,
		prefix = operator.operand || "$:/temp/journalapp/inventory/default",
		search = textState(wiki,prefix,"search"),
		tag = textState(wiki,prefix,"tag"),
		kind = textState(wiki,prefix,"kind"),
		fieldName = textState(wiki,prefix,"field"),
		fieldValue = textState(wiki,prefix,"field-value"),
		dateField = textState(wiki,prefix,"date-field") || "modified",
		dateMode = textState(wiki,prefix,"date-mode"),
		dateFrom = textState(wiki,prefix,"date-from"),
		dateTo = textState(wiki,prefix,"date-to"),
		contentMode = textState(wiki,prefix,"content"),
		tagsMode = textState(wiki,prefix,"tags-presence"),
		sizeMode = textState(wiki,prefix,"card-size"),
		sortMode = textState(wiki,prefix,"sort"),
		items = [];

	/*
	Le source d'un opérateur est un itérateur. On garde toujours le titre,
	et on récupère le tiddler depuis le wiki si l'itérateur ne l'a pas fourni.
	*/
	source(function(tiddler,title) {
		var actualTiddler = tiddler || wiki.getTiddler(title);
		if(actualTiddler) {
			items.push({title: title,tiddler: actualTiddler});
		}
	});

	if(search) {
		var terms = lower(search).split(/\s+/).filter(Boolean);
		items = items.filter(function(item) {
			var f = item.tiddler.fields,
				haystack = [
					item.title,
					f.caption || "",
					f.text || "",
					Array.isArray(f.tags) ? f.tags.join(" ") : (f.tags || ""),
					f.kind || "",
					Array.isArray(f.people) ? f.people.join(" ") : (f.people || ""),
					Array.isArray(f.places) ? f.places.join(" ") : (f.places || ""),
					Array.isArray(f.projects) ? f.projects.join(" ") : (f.projects || "")
				].map(lower).join("\n");
			return terms.every(function(term) {
				return haystack.indexOf(term) !== -1;
			});
		});
	}

	if(tag) {
		items = items.filter(function(item) {
			return item.tiddler.getFieldList("tags").indexOf(tag) !== -1;
		});
	}

	if(kind) {
		items = items.filter(function(item) {
			return lower(item.tiddler.fields.kind) === lower(kind);
		});
	}

	if(fieldName) {
		items = items.filter(function(item) {
			if(!Object.prototype.hasOwnProperty.call(item.tiddler.fields,fieldName)) {
				return false;
			}
			if(!fieldValue) {
				return true;
			}
			var raw = item.tiddler.fields[fieldName];
			if(Array.isArray(raw)) {
				raw = raw.join(" ");
			}
			return lower(raw).indexOf(lower(fieldValue)) !== -1;
		});
	}

	if(contentMode === "with") {
		items = items.filter(function(item) {
			return String(item.tiddler.fields.text || "").trim().length > 0;
		});
	} else if(contentMode === "without") {
		items = items.filter(function(item) {
			return String(item.tiddler.fields.text || "").trim().length === 0;
		});
	}

	if(tagsMode === "with") {
		items = items.filter(function(item) {
			return item.tiddler.getFieldList("tags").length > 0;
		});
	} else if(tagsMode === "without") {
		items = items.filter(function(item) {
			return item.tiddler.getFieldList("tags").length === 0;
		});
	}

	if(sizeMode === "small" || sizeMode === "medium" || sizeMode === "large") {
		items = items.filter(function(item) {
			return effectiveSize(item.tiddler) === sizeMode;
		});
	}

	if(dateMode) {
		var now = new Date(), start = null, end = null;
		if(dateMode === "today") {
			start = new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0,0).getTime();
			end = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0).getTime()-1;
		} else if(dateMode === "7d" || dateMode === "30d") {
			var days = dateMode === "7d" ? 7 : 30,
				from = new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0,0);
			from.setDate(from.getDate()-(days-1));
			start = from.getTime();
			end = now.getTime();
		} else if(dateMode === "year") {
			start = new Date(now.getFullYear(),0,1,0,0,0,0).getTime();
			end = now.getTime();
		} else if(dateMode === "before") {
			end = parseLocalDay(dateTo,true);
		} else if(dateMode === "after") {
			start = parseLocalDay(dateFrom,false);
		} else if(dateMode === "between") {
			start = parseLocalDay(dateFrom,false);
			end = parseLocalDay(dateTo,true);
		}
		if(start !== null || end !== null) {
			items = items.filter(function(item) {
				var value = getDateMs(item.tiddler,dateField);
				if(value === null) {return false;}
				if(start !== null && value < start) {return false;}
				if(end !== null && value > end) {return false;}
				return true;
			});
		}
	}

	function titleCompare(a,b) {
		return a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:"base"});
	}

	function dateCompare(field,reverse) {
		return function(a,b) {
			var av = getDateMs(a.tiddler,field),
				bv = getDateMs(b.tiddler,field);
			if(av === null && bv === null) {return titleCompare(a,b);}
			if(av === null) {return 1;}
			if(bv === null) {return -1;}
			var diff = av-bv;
			return reverse ? -diff : diff;
		};
	}

	switch(sortMode) {
		case "title-asc": items.sort(titleCompare); break;
		case "title-desc": items.sort(function(a,b){return -titleCompare(a,b);}); break;
		case "created-asc": items.sort(dateCompare("created",false)); break;
		case "created-desc": items.sort(dateCompare("created",true)); break;
		case "modified-asc": items.sort(dateCompare("modified",false)); break;
		case "modified-desc": items.sort(dateCompare("modified",true)); break;
	}

	return items.map(function(item) {
		return item.title;
	});
};
