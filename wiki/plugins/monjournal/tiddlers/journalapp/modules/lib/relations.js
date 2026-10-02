/*\
title: $:/journalapp/modules/lib/relations.js
type: application/javascript
module-type: library

Mon Journal — modèle partagé des fiches Relations.

Trois choses vivent ici, et une seule fois : la composition du nom affiché,
les liens personne ↔ personne (avec leur réciproque automatique) et le
portrait. Le formulaire et la fiche lisent cette source, jamais deux règles
parallèles. Les briques d'interface réutilisent les classes de formulaire
existantes (ja-agenda-form-*, ja-af-seg, ja-relation-contact-row) : rien de
neuf n'est inventé côté style.
\*/
"use strict";

var Media=require("$:/journalapp/modules/lib/jmedia.js");

var LINKS_FIELD="relations-links",
    PARTS_FIELD="label-parts",
    PORTRAIT_FIELD="portrait";

/* Morceaux de nom combinables pour composer le libellé affiché. */
var LABEL_PARTS=[
  {id:"first",label:"Prénom",field:"first-name"},
  {id:"last",label:"Nom",field:"last-name"},
  {id:"nickname",label:"Surnom",field:"nicknames",listed:true},
  {id:"other-first",label:"Autre prénom",field:"other-first-names",listed:true},
  {id:"other-last",label:"Autre nom",field:"other-last-names",listed:true},
  {id:"who",label:"Qui c’est",field:"relation-label"}
];

/* D'où vient le lien, vu depuis la fiche courante.
   L'inverse est ce qui sera écrit sur la fiche d'en face. */
var ORIGINS=[
  {id:"theirs",label:"Sa relation",hint:"Je l’ai connu·e par cette personne",icon:"↗",inverse:"mine"},
  {id:"together",label:"En même temps",hint:"Rencontré·es ensemble",icon:"⇄",inverse:"together"},
  {id:"mine",label:"Ma relation",hint:"C’était déjà ma relation",icon:"↖",inverse:"theirs"}
];

function mk(doc,p,tag,cls,text){
  var e=doc.createElement(tag);if(cls){e.className=cls;}
  if(text!==undefined&&text!==null){e.textContent=text;}if(p){p.appendChild(e);}return e;
}
function btn(doc,p,cls,text,title){
  var b=mk(doc,p,"button",cls,text);b.type="button";
  if(title){b.title=title;b.setAttribute("aria-label",title);}return b;
}
function list(v){return $tw.utils.parseStringArray(String(v||""))||[];}
function partById(id){var out=null;LABEL_PARTS.some(function(p){if(p.id===id){out=p;return true;}return false;});return out;}
function originMeta(id){
  var out=null;ORIGINS.some(function(o){if(o.id===String(id||"")){out=o;return true;}return false;});
  return out||ORIGINS[0];
}

/* ------------------------------------------------------------------ */
/* Nom affiché                                                         */
/* ------------------------------------------------------------------ */
function parts(f){
  var raw=list(f&&f[PARTS_FIELD]).filter(function(id){return !!partById(id);});
  return raw.length?raw:["first","last"];
}
function partValue(f,id){
  var p=partById(id);if(!p||!f){return "";}
  if(p.listed){var a=list(f[p.field]);return a.length?String(a[0]).trim():"";}
  return String(f[p.field]||"").trim();
}
function buildLabel(f,selected){
  var sel=(selected&&selected.length)?selected:parts(f),out=[];
  LABEL_PARTS.forEach(function(p){
    if(sel.indexOf(p.id)===-1){return;}
    var v=partValue(f,p.id);if(v){out.push(v);}
  });
  if(!out.length){
    out=[String((f&&f["first-name"])||"").trim(),String((f&&f["last-name"])||"").trim()].filter(Boolean);
  }
  return out.join(" ").trim();
}
function displayOf(wiki,title){
  var t=wiki.getTiddler(title);
  return String((t&&t.fields&&t.fields.label)||title||"");
}

/* ------------------------------------------------------------------ */
/* Liens personne ↔ personne                                           */
/* ------------------------------------------------------------------ */
function parseLinks(raw){
  var src=raw,out=[],seen=Object.create(null);
  if(!src){return out;}
  if(typeof src==="string"){try{src=JSON.parse(src);}catch(e){return out;}}
  if(!Array.isArray(src)){return out;}
  src.forEach(function(x){
    if(!x){return;}
    var title=String((typeof x==="string"?x:x.title)||"").trim();
    if(!title||seen[title]){return;}
    seen[title]=true;
    out.push({
      title:title,
      origin:originMeta(x&&x.origin).id,
      label:String((x&&x.label)||"").trim()
    });
  });
  return out;
}
function stringifyLinks(arr){
  var clean=(arr||[]).filter(function(x){return x&&x.title;}).map(function(x){
    var o={title:String(x.title),origin:originMeta(x.origin).id};
    if(x.label){o.label=String(x.label);}
    return o;
  });
  return clean.length?JSON.stringify(clean):"";
}
/* Lecture tolérante : une fiche supprimée disparaît d'elle-même. */
function linksOf(wiki,title){
  var t=title?wiki.getTiddler(title):null;
  if(!t){return [];}
  return parseLinks(t.fields[LINKS_FIELD]).filter(function(l){return wiki.tiddlerExists(l.title);});
}
function writeLinks(wiki,title,links){
  var t=wiki.getTiddler(title);if(!t){return;}
  var patch={};patch[LINKS_FIELD]=stringifyLinks(links);
  wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:new Date()}));
}
/* Écrit les liens d'une fiche ET tient à jour la fiche d'en face.
   Un lien n'est jamais à saisir deux fois. */
function applyLinks(wiki,title,nextLinks){
  if(!title||!wiki.tiddlerExists(title)){return;}
  var before=linksOf(wiki,title),
      next=parseLinks(stringifyLinks(nextLinks)).filter(function(l){
        return l.title!==title&&wiki.tiddlerExists(l.title);
      });
  writeLinks(wiki,title,next);
  next.forEach(function(l){
    var other=linksOf(wiki,l.title),found=false,inverse=originMeta(l.origin).inverse;
    other=other.map(function(o){
      if(o.title!==title){return o;}
      found=true;return {title:title,origin:inverse,label:o.label};
    });
    if(!found){other.push({title:title,origin:inverse,label:""});}
    writeLinks(wiki,l.title,other);
  });
  before.forEach(function(old){
    if(next.some(function(l){return l.title===old.title;})){return;}
    writeLinks(wiki,old.title,linksOf(wiki,old.title).filter(function(o){return o.title!==title;}));
  });
}
function addLink(wiki,title,otherTitle,origin,label){
  var links=linksOf(wiki,title).filter(function(l){return l.title!==otherTitle;});
  links.push({title:otherTitle,origin:originMeta(origin).id,label:label||""});
  applyLinks(wiki,title,links);
}
function removeLink(wiki,title,otherTitle){
  applyLinks(wiki,title,linksOf(wiki,title).filter(function(l){return l.title!==otherTitle;}));
}
function people(wiki,exclude){
  var out=[];
  wiki.each(function(t,title){
    if(!t||!t.fields||title===exclude){return;}
    var tags=$tw.utils.parseStringArray(String(t.fields.tags||""))||[];
    if(String(t.fields.kind||"")!=="person"&&tags.indexOf("Relations")===-1){return;}
    if(t.fields["draft.of"]){return;}
    out.push({title:title,label:String(t.fields.label||title)});
  });
  out.sort(function(a,b){return a.label.localeCompare(b.label,"fr");});
  return out;
}

/* ------------------------------------------------------------------ */
/* Portrait — même grammaire que les fonds d'image du Journal          */
/* ------------------------------------------------------------------ */
function portrait(f){
  var raw=f?f[PORTRAIT_FIELD]:"";
  if(typeof raw==="string"){try{raw=JSON.parse(raw||"{}");}catch(e){raw={};}}
  return Media.normalizeBackdrop(raw||{});
}
function portraitString(item){
  var p=Media.normalizeBackdrop(item||{});
  return p.src?JSON.stringify({src:p.src,fit:p.fit,posX:p.posX,posY:p.posY,opacity:p.opacity}):"";
}
function savePortrait(wiki,title,item){
  var t=wiki.getTiddler(title);if(!t){return;}
  var patch={};patch[PORTRAIT_FIELD]=portraitString(item);
  wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:new Date()}));
}
function paintPortrait(wiki,el,item){
  var p=Media.normalizeBackdrop(item||{}),url=Media.src(wiki,p.src||"");
  el.classList.toggle("is-empty",!url);
  if(!url){el.style.backgroundImage="";return false;}
  el.style.backgroundImage='url("'+String(url).replace(/"/g,"%22")+'")';
  el.style.backgroundSize=p.fit==="contain"?"contain":(p.fit==="fill"?"100% 100%":"cover");
  el.style.backgroundPosition=p.posX+"% "+p.posY+"%";
  el.style.backgroundRepeat="no-repeat";
  el.style.opacity=String(Math.max(10,p.opacity)/100);
  return true;
}
function initials(label){
  return String(label||"").split(/\s+/).filter(Boolean).slice(0,2).map(function(w){
    return w.charAt(0).toUpperCase();
  }).join("")||"?";
}

/* ------------------------------------------------------------------ */
/* Briques d'interface partagées formulaire ↔ fiche                    */
/* ------------------------------------------------------------------ */

/* Cases à cocher : de quoi est fait le nom affiché. */
function partsField(doc,parent,getFields,initial){
  var wrap=mk(doc,parent,"section","ja-relation-labelparts"),
      head=mk(doc,wrap,"div","ja-entity-section-head");
  mk(doc,head,"span","ja-agenda-form-label","Nom affiché");
  var preview=mk(doc,head,"span","ja-agenda-form-hint",""),
      host=mk(doc,wrap,"div","ja-relation-labelparts-row"),
      sel=(initial&&initial.length)?initial.slice():["first","last"];
  function value(){
    var out=[];
    Array.prototype.forEach.call(host.querySelectorAll("input"),function(c){
      if(c.checked){out.push(c.dataset.id);}
    });
    return out.length?out:["first","last"];
  }
  function draw(){preview.textContent=buildLabel(getFields(),value())||"—";}
  LABEL_PARTS.forEach(function(p){
    var lab=mk(doc,host,"label","ja-agenda-form-check"),c=mk(doc,lab,"input","");
    c.type="checkbox";c.checked=sel.indexOf(p.id)!==-1;c.dataset.id=p.id;
    mk(doc,lab,"span","",p.label);
    c.addEventListener("change",draw);
  });
  draw();
  return {value:value,refresh:draw};
}

/* Popover de choix d'une personne, puis de l'origine du lien.
   Réutilise .ja-pop / .ja-pop-input / .ja-pop-item comme les autres menus. */
function pickPerson(widget,anchor,exclude,onPick,cleanups){
  var doc=widget.document,old=doc.querySelector(".ja-pop.ja-relation-pick");
  if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop ja-relation-pick ja-pop-search"),
      search=mk(doc,pop,"input","ja-pop-input"),
      listHost=mk(doc,pop,"div","ja-pop-list"),
      all=people(widget.wiki,exclude.self).filter(function(p){
        return (exclude.taken||[]).indexOf(p.title)===-1;
      });
  search.type="search";search.placeholder="Chercher une personne…";
  function close(){if(pop.parentNode){pop.remove();}doc.removeEventListener("mousedown",away,true);}
  function away(e){if(!pop.contains(e.target)&&e.target!==anchor){close();}}
  function step2(person){
    listHost.innerHTML="";search.style.display="none";
    mk(doc,listHost,"div","ja-pop-title",person.label);
    ORIGINS.forEach(function(o){
      var b=btn(doc,listHost,"ja-pop-item",o.icon+"  "+o.label,o.hint);
      b.addEventListener("click",function(){close();onPick(person,o.id);});
    });
  }
  function draw(){
    var q=String(search.value||"").trim().toLowerCase(),shown=0;
    listHost.innerHTML="";
    all.forEach(function(p){
      if(shown>=40||(q&&p.label.toLowerCase().indexOf(q)===-1)){return;}
      shown++;
      var b=btn(doc,listHost,"ja-pop-item",p.label);
      b.addEventListener("click",function(){step2(p);});
    });
    if(!shown){mk(doc,listHost,"div","ja-pop-empty","Aucune autre relation.");}
  }
  search.addEventListener("input",draw);draw();
  var r=anchor.getBoundingClientRect(),vw=doc.documentElement.clientWidth,vh=doc.documentElement.clientHeight;
  pop.style.left=Math.max(8,Math.min(r.left,vw-268))+"px";
  var top=r.bottom+6;if(top+300>vh){top=Math.max(8,r.top-300);}
  pop.style.top=top+"px";
  setTimeout(function(){doc.addEventListener("mousedown",away,true);try{search.focus();}catch(e){}},0);
  if(cleanups){cleanups.push(close);}
  return {close:close};
}

/* Bloc « Ses relations » du formulaire : lignes + origine segmentée. */
function linksField(widget,parent,selfTitle,initial,cleanups){
  var doc=widget.document,
      block=mk(doc,parent,"section","ja-relation-links-field"),
      head=mk(doc,block,"div","ja-entity-section-head");
  mk(doc,head,"span","ja-agenda-form-label","Ses relations");
  var add=btn(doc,head,"ja-jform-secondary","＋ Lier une personne"),
      host=mk(doc,block,"div","ja-relation-contact-list"),
      data=parseLinks(stringifyLinks(initial||[]));
  function taken(){return data.map(function(l){return l.title;});}
  function row(link){
    var line=mk(doc,host,"div","ja-relation-contact-row ja-relation-link-row");
    mk(doc,line,"span","ja-relation-link-name",displayOf(widget.wiki,link.title));
    var seg=mk(doc,line,"div","ja-af-seg");
    ORIGINS.forEach(function(o){
      var b=btn(doc,seg,"ja-af-seg-item",o.icon+" "+o.label,o.hint);
      b.dataset.v=o.id;
      b.addEventListener("click",function(){
        link.origin=o.id;
        Array.prototype.forEach.call(seg.children,function(c){c.classList.toggle("is-on",c.dataset.v===link.origin);});
      });
    });
    Array.prototype.forEach.call(seg.children,function(c){c.classList.toggle("is-on",c.dataset.v===link.origin);});
    btn(doc,line,"ja-entity-mini-remove","×","Retirer ce lien").addEventListener("click",function(){
      data=data.filter(function(l){return l!==link;});line.remove();
      if(!data.length){empty();}
    });
  }
  function empty(){
    if(host.children.length){return;}
    mk(doc,host,"div","ja-agenda-form-hint","Personne pour l’instant.");
  }
  function redraw(){host.innerHTML="";data.forEach(row);empty();}
  add.addEventListener("click",function(){
    pickPerson(widget,add,{self:selfTitle,taken:taken()},function(person,origin){
      data.push({title:person.title,origin:origin,label:""});redraw();
    },cleanups);
  });
  redraw();
  return {value:function(){return data.slice();}};
}

exports.LINKS_FIELD=LINKS_FIELD;
exports.PARTS_FIELD=PARTS_FIELD;
exports.PORTRAIT_FIELD=PORTRAIT_FIELD;
exports.LABEL_PARTS=LABEL_PARTS;
exports.ORIGINS=ORIGINS;
exports.originMeta=originMeta;
exports.parts=parts;
exports.buildLabel=buildLabel;
exports.displayOf=displayOf;
exports.parseLinks=parseLinks;
exports.stringifyLinks=stringifyLinks;
exports.linksOf=linksOf;
exports.applyLinks=applyLinks;
exports.addLink=addLink;
exports.removeLink=removeLink;
exports.people=people;
exports.portrait=portrait;
exports.portraitString=portraitString;
exports.savePortrait=savePortrait;
exports.paintPortrait=paintPortrait;
exports.initials=initials;
exports.partsField=partsField;
exports.linksField=linksField;
exports.pickPerson=pickPerson;
