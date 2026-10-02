/*\
title: $:/journalapp/modules/startup/entity-sync.js
type: application/javascript
module-type: startup

Mon Journal — intégrité des liaisons.
Toute Daily qui référence une fiche absente crée/répare cette fiche de catégorie.
Aucune interface ici : uniquement les données.
\*/
"use strict";

var Entities=require("$:/journalapp/modules/lib/entities.js");
exports.name="journalapp-entity-sync";
exports.platforms=["browser"];
exports.after=["startup"];
exports.synchronous=true;

exports.startup=function(){
  function isDaily(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="Daily"&&Entities.tagsOf(t).indexOf("Journal")!==-1);}
  function sync(t){
    if(!isDaily(t)){return;}
    Object.keys(Entities.DEFINITIONS).forEach(function(type){
      var def=Entities.DEFINITIONS[type];
      Entities.parseList(t.fields[def.field]).forEach(function(title){Entities.ensureEntity($tw.wiki,type,title);});
    });
  }
  $tw.wiki.each(function(t){sync(t);});
  $tw.wiki.addEventListener("change",function(changes){
    Object.keys(changes||{}).forEach(function(title){sync($tw.wiki.getTiddler(title));});
  });
};
