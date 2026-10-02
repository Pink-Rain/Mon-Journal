/*\
title: $:/journalapp/modules/startup/journal-migrate-scales.js
type: application/javascript
module-type: startup

Migration ponctuelle : l'échelle d'anxiété passe de « 0 = calme » à
« 0 = meltdown », pour suivre la même direction que l'énergie
(0 = le pire, 5 = le mieux). Les valeurs déjà enregistrées sont
retournées une seule fois, puis un drapeau empêche toute rejouée.
\*/
"use strict";

var FLAG = "$:/journalapp/config/migrations";

exports.name = "journalapp-migrate-scales";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function(){
  var flags = $tw.wiki.getTiddler(FLAG),
      done = flags && String(flags.fields["stress-inverted"] || "") === "yes";
  if(done){return;}

  var touched = 0;
  $tw.wiki.each(function(tiddler,title){
    var f = tiddler && tiddler.fields;
    if(!f || String(f.kind || "") !== "Daily"){return;}
    var raw = f.stress;
    if(raw === undefined || raw === null || String(raw) === ""){return;}
    var v = parseFloat(raw);
    if(isNaN(v)){return;}
    $tw.wiki.addTiddler(new $tw.Tiddler(tiddler,{stress:String(Math.max(0,Math.min(5,5-v)))}));
    touched++;
  });

  $tw.wiki.addTiddler(new $tw.Tiddler(
    flags || {title:FLAG},
    {title:FLAG,"stress-inverted":"yes","stress-inverted-count":String(touched),text:
      "Drapeaux de migration de Mon Journal. Ne pas supprimer : c'est ce qui\n" +
      "empêche une migration de se rejouer et d'abîmer des données."},
    {modified:new Date()}
  ));
};
