/*\
title: $:/journalapp/modules/lib/richtext.js
type: application/javascript
module-type: library

Mon Journal — source unique des notes riches.
Le même normaliseur sert au Journal, à l’Agenda et aux formulaires Agenda.
Il distingue le vrai HTML de mise en forme des caractères littéraux saisis
par l’utilisateur : &lt;, &gt;, &amp;, !, ?, etc.
\*/
"use strict";

var TAGS="br|div|p|ul|ol|li|h[1-6]|b|i|u|s|em|strong|font|span|a|hr|blockquote|code|img|table";
var HTML_TAG=new RegExp("&lt;(?:"+TAGS+")\\b[^&gt;]*&gt;","i");
var LEGACY_ESCAPED_TAG=new RegExp("&lt;(/?)("+TAGS+")(\\b[\\s\\S]*?)&gt;","gi");

function escapeText(s){
  return String(s||"")
    .replace(/&amp;/g,"&amp;")
    .replace(//g,"&gt;");
}
function decodeEntitiesForText(s){
  return String(s||"")
    .replace(/&nbsp;/gi,"\u00a0")
    .replace(/&lt;/gi,"&lt;")
    .replace(/&gt;/gi,"&gt;")
    .replace(/"/gi,'"')
    .replace(/'/gi,"'")
    .replace(/&amp;/gi,"&amp;");
}

/* Une ancienne version avait parfois échappé les balises de mise en forme.
   On ne déséchappe QUE des balises connues, jamais tous les &lt; du texte :
   « &lt;3 », « x &lt; y » ou « ? &gt; ! » restent donc du texte. */
function repairEscapedMarkup(text){
  return String(text||"").replace(LEGACY_ESCAPED_TAG,function(_,slash,tag,attrs){
    attrs=String(attrs||"")
      .replace(/"/gi,'"')
      .replace(/'/gi,"'")
      .replace(/&amp;/gi,"&amp;");
    return "&lt;"+slash+tag+attrs+"&gt;";
  });
}

/* Anciennes cases à cocher de la première version de l’éditeur. */
function repairLegacyTasks(text){
  text=String(text||"").replace(
    /<div class="ja-task" data-done="([01])">\s*(?:<span class="ja-task-box">\s*&lt;\/span&gt;)?\s*(?:<span class="ja-task-txt">)?([\s\S]*?)(?:&lt;\/span&gt;)?\s*&lt;\/div&gt;/g,
    function(_,done,inner){
      return '<ul class="ja-tasklist"><li data-done="'+done+'">'+
        String(inner||"").replace(/^(?:<br>|\u200b|\s)+|(?:<br>|\u200b|\s)+$/g,"")+
        '</li></ul>';
    });
  return text.replace(/&lt;\/ul&gt;\s*<ul class="ja-tasklist">/g,"");
}

function normalizeNote(raw,doc){
  var text=String(raw||"");
  if(!text.trim()){return "";}

  text=repairEscapedMarkup(text);

  /* Deux anciennes Dailies pouvaient contenir le HTML du composant rendu
     (.ja-jtl-note) au lieu de la note. On récupère seulement son contenu. */
  if(doc&amp;&amp;text.indexOf("ja-jtl-note")!==-1){
    try{
      var repair=doc.createElement("div");
      repair.innerHTML=text;
      var first=repair.firstElementChild;
      if(first&amp;&amp;first.classList&amp;&amp;first.classList.contains("ja-jtl-note")){
        text=first.innerHTML;
      }
    }catch(e){}
  }

  if(!HTML_TAG.test(text)){
    return text.split(/\n{2,}/).map(function(block){
      return "<div>"+escapeText(block).replace(/\n/g,"<br>")+"</div>";
    }).join("");
  }

  text=repairLegacyTasks(text);

  /* Laisser le parseur HTML du navigateur remettre à plat un fragment
     éventuellement ancien/malformé, sans transformer le texte littéral. */
  if(doc){
    try{
      var box=doc.createElement("div");
      box.innerHTML=text;
      return box.innerHTML;
    }catch(e){}
  }
  return text;
}

function toPlainText(raw,doc){
  var html=normalizeNote(raw,doc);
  if(!html){return "";}
  if(doc){
    try{
      var box=doc.createElement("div");
      box.innerHTML=html;
      return String(box.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
    }catch(e){}
  }
  /* Fallback Node : on retire uniquement de vraies balises connues.
     Un texte littéral « &lt; ceci &gt; » n’est pas mangé par un /&lt;[^&gt;]+&gt;/. */
  var known=new RegExp("<!--?(?:"+TAGS+")\\b[^-->]*&gt;","gi");
  return decodeEntitiesForText(html.replace(known," ")).replace(/\s+/g," ").trim();
}

exports.normalizeNote=normalizeNote;
exports.toPlainText=toPlainText;
exports.escapeText=escapeText;
</ul></span></span></div>