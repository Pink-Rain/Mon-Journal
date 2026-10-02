/*\
title: $:/journalapp/modules/lib/agenda-ui.js
type: application/javascript
module-type: library

Mon Journal — primitives d’interface Agenda partagées.
Les sous-tâches sont une partie de la To-do parente : un seul rendu, utilisé
par Agenda et par les cartes Agenda liées au Journal. Elles se cochent ici,
mais ne possèdent jamais leur propre bouton Modifier.
\*/
"use strict";
var Agenda=require("$:/journalapp/modules/lib/agenda.js");
function mk(doc,p,tag,cls,text){var e=doc.createElement(tag);if(cls){e.className=cls;}if(text!==undefined&&text!==null){e.textContent=text;}if(p){p.appendChild(e);}return e;}
function btn(doc,p,cls,text,title){var b=mk(doc,p,"button",cls,text);b.type="button";if(title){b.title=title;b.setAttribute("aria-label",title);}return b;}
function doneOf(t){var s=String((t&&t.fields&&t.fields.status)||"");return s==="fait"||s==="done";}
function renderTodoSubtasks(widget,parent,rootTitle,iso,opts){
  opts=opts||{};var wiki=widget.wiki,doc=widget.document,roots=Agenda.todoChildrenTitles(wiki,rootTitle);
  if(!roots.length){return null;}
  var box=mk(doc,parent,"section","ja-agenda-subtasks ja-todo-subtree"+(opts.compact?" is-compact":""));
  if(opts.header!==false){var head=mk(doc,box,"div","ja-agenda-subtasks-head");mk(doc,head,"span","ja-agenda-subtasks-label","Sous-tâches");mk(doc,head,"span","ja-agenda-subtasks-count",String(Agenda.todoDescendantTitles(wiki,rootTitle).length));}
  var tree=mk(doc,box,"div","ja-todo-subtree-root");
  function renderNode(host,title){
    var t=wiki.getTiddler(title);if(!t){return;}var f=t.fields||{},done=doneOf(t),kids=Agenda.todoChildrenTitles(wiki,title),node=mk(doc,host,"div","ja-todo-subnode"+(done?" is-done":"")+(kids.length?" has-children":"")),row=mk(doc,node,"div","ja-todo-subrow");
    mk(doc,row,"span","ja-todo-subbranch",kids.length?"⌄":"");
    var cb=btn(doc,row,"ja-agenda-subtask-check",done?"✓":"",done?"Rouvrir la sous-tâche":"Terminer la sous-tâche");
    cb.addEventListener("click",function(e){e.stopPropagation();Agenda.toggleTodoOnDate(wiki,title,iso||Agenda.todayIso());});
    mk(doc,row,"span","ja-agenda-subtask-title",String(f.label||title));
    var mins=Math.max(0,parseInt(f["duration-minutes"]||"0",10)||0);if(mins){mk(doc,row,"span","ja-agenda-subtask-effort","⏱ "+mins+" min");}
    if(kids.length){var directDone=0;kids.forEach(function(k){if(doneOf(wiki.getTiddler(k))){directDone++;}});mk(doc,row,"span","ja-todo-subcount",directDone+"/"+kids.length);var children=mk(doc,node,"div","ja-todo-subchildren");kids.forEach(function(k){renderNode(children,k);});}
  }
  roots.forEach(function(t){renderNode(tree,t);});
  return box;
}
exports.renderTodoSubtasks=renderTodoSubtasks;
