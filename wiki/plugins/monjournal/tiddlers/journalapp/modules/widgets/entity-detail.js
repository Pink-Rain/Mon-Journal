/*\
title: $:/journalapp/modules/widgets/entity-detail.js
type: application/javascript
module-type: widget

Mon Journal - fiche detaillee partagee pour Relations, Lieux, Activites,
Projets et Medias. Elle lit les memes fields que les formulaires et ne
maintient donc aucune seconde source de verite.
\*/
(function(){
"use strict";

var Widget=require("$:/core/modules/widgets/widget.js").widget,
    Agenda=require("$:/journalapp/modules/lib/agenda.js"),
    EConfig=require("$:/journalapp/modules/lib/entity-config.js"),
    JConfig=require("$:/journalapp/modules/lib/jconfig.js"),
    Media=require("$:/journalapp/modules/lib/jmedia.js"),
    Relations=require("$:/journalapp/modules/lib/relations.js");

function mk(doc,parent,tag,cls,text){
  var e=doc.createElement(tag);if(cls){e.className=cls;}
  if(text!==undefined&&text!==null){e.textContent=text;}if(parent){parent.appendChild(e);}return e;
}
function btn(doc,parent,cls,text,title){var b=mk(doc,parent,"button",cls,text);b.type="button";if(title){b.title=title;b.setAttribute("aria-label",title);}return b;}
function list(v){return $tw.utils.parseStringArray(String(v||""))||[];}
function json(v){try{var x=JSON.parse(String(v||""));return Array.isArray(x)?x:[];}catch(e){return [];}}
function has(v){return v!==undefined&&v!==null&&String(v).trim()!=="";}
function display(t,title){return String((t&&t.fields&&(t.fields.label||t.fields.titre))||title||"");}
function fmtDate(v){
  if(!has(v)){return "";}var m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m){return String(v);}
  try{return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});}catch(e){return String(v);}
}
function ratingData(v){
  if(!has(v)){return null;}var n=parseFloat(String(v).replace(",","."));if(!isFinite(n)){return null;}
  n=Math.max(0,Math.min(20,n));var half=Math.max(0,Math.min(10,Math.round(n/2)));return {value:n,half:half,stars:half/2};
}
function stars(doc,parent,v,withCaption){
  var d=ratingData(v),wrap=mk(doc,parent,"div","ja-media-rating-visual ja-entity-detail-rating"),host=mk(doc,wrap,"div","ja-media-rating-stars");
  for(var i=0;i<5;i++){
    var star=mk(doc,host,"span","ja-media-rating-star"),base=mk(doc,star,"span","ja-media-rating-star-base","★"),fill=mk(doc,star,"span","ja-media-rating-star-fill","★"),left=d?d.half-(i*2):0;
    fill.style.width=(left>=2?100:(left===1?50:0))+"%";
  }
  if(withCaption){mk(doc,wrap,"span","ja-media-rating-caption",d?(String(d.value).replace(".",",")+" / 20 · "+String(d.stars).replace(".",",")+" / 5"):"Pas encore noté");}
  return wrap;
}
function tile(doc,parent,label,value,cls){if(!has(value)){return null;}var x=mk(doc,parent,"div","ja-entity-detail-tile "+(cls||""));mk(doc,x,"span","ja-entity-detail-label",label);mk(doc,x,"strong","ja-entity-detail-value",String(value));return x;}
function chip(doc,parent,text,color,icon,imageSrc){if(!has(text)){return null;}var c=mk(doc,parent,"span","ja-entity-detail-chip");if(color){c.style.setProperty("--ja-chip-color",color);}if(imageSrc){var im=mk(doc,c,"img","ja-entity-detail-chip-image");im.src=imageSrc;im.alt="";}else if(icon){mk(doc,c,"span","ja-entity-detail-chip-icon",icon);}mk(doc,c,"span","",text);return c;}
function section(doc,parent,title){var s=mk(doc,parent,"section","ja-entity-detail-section");mk(doc,s,"h2","ja-entity-detail-section-title",title);return s;}
function note(doc,parent,title,raw){if(!has(raw)){return;}var s=section(doc,parent,title),body=mk(doc,s,"div","ja-entity-detail-note");body.innerHTML=Agenda.normalizeNoteHtml(raw,doc);}
function proximity(doc,parent,value){
  var n=Math.max(-3,Math.min(3,parseInt(value||"0",10)||0)),wrap=mk(doc,parent,"div","ja-entity-detail-proximity");
  [-3,-2,-1,0,1,2,3].forEach(function(v){var d=mk(doc,wrap,"span","ja-entity-detail-prox-dot",v>0?"+"+v:String(v));if(v===n){d.classList.add("is-on");}if(v<0){d.classList.add("is-negative");}if(v>0){d.classList.add("is-positive");}});
  return wrap;
}
function typeInfo(t){
  var f=t.fields,tags=Array.isArray(f.tags)?f.tags:list(f.tags),kind=String(f.kind||"");
  if(kind==="person"||tags.indexOf("Relations")!==-1){return {id:"person",label:"Relation",icon:"👤",form:"person"};}
  if(kind==="place"||tags.indexOf("Lieux")!==-1){return {id:"place",label:"Lieu",icon:"📍",form:"place"};}
  if(kind==="activity"||tags.indexOf("Activité")!==-1){return {id:"activity",label:"Activité",icon:"🏃",form:"activity"};}
  if(kind==="project"||tags.indexOf("Projet")!==-1){return {id:"project",label:"Projet",icon:"🧩",form:"project"};}
  if(kind==="media"||tags.indexOf("Média")!==-1){return {id:"media",label:"Média",icon:"🎞️",form:"media"};}
  return {id:"other",label:"Fiche",icon:"✦",form:""};
}
function mediaMeta(id){return {
  book:{label:"Livre",icon:"📚",creator:"Auteur·ice",field:"author"},music:{label:"Musique",icon:"🎵",creator:"Artiste",field:"artist"},videogame:{label:"Jeu vidéo",icon:"🎮",creator:"Studio / éditeur",field:"studio"},boardgame:{label:"Jeu de société",icon:"🎲",creator:"Auteur·ice / éditeur",field:"creator"},series:{label:"Série",icon:"📺",creator:"Créateur·ice",field:"creator"},film:{label:"Film",icon:"🎬",creator:"Réalisateur·ice",field:"director"},other:{label:"Autre média",icon:"✦",creator:"Créateur·ice",field:"creator"}
}[id]||null;}

var EntityDetailWidget=function(parseTreeNode,options){this.initialise(parseTreeNode,options);};
EntityDetailWidget.prototype=new Widget();
EntityDetailWidget.prototype.execute=function(){this.detailTitle=this.wiki.getTiddlerText("$:/state/journalapp/entity-detail","");};
EntityDetailWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  var doc=this.document,root=mk(doc,null,"div","ja-entity-detail"),title=this.detailTitle,t=title?this.wiki.getTiddler(title):null;
  parent.insertBefore(root,nextSibling);this.domNodes.push(root);
  var self=this;
  function back(){
    var v=self.wiki.getTiddlerText("$:/state/journalapp/entity-detail-return-view","");
    if(!v||v==="$:/journalapp/views/shared/entity-detail"){
      var cat=self.wiki.getTiddlerText("$:/state/journalapp/category",""),ct=cat?self.wiki.getTiddler(cat):null;
      v=ct&&ct.fields["landing-view"]?String(ct.fields["landing-view"]):"$:/journalapp/views/accueil/home";
    }
    self.wiki.setText("$:/state/journalapp/view","text",null,v,{suppressTimestamp:true});
  }
  if(!t){
    var empty=mk(doc,root,"div","ja-empty");mk(doc,empty,"div","","Cette fiche n’existe plus.");var bb=btn(doc,empty,"ja-jform-secondary","← Retour");bb.addEventListener("click",back);return;
  }
  var info=typeInfo(t);
  /* Les Relations ont leur propre fiche : en-tete a onglets, portrait,
     edition sur place. Les autres entites gardent la fiche generique. */
  if(info.id==="person"){this.renderRelationSheet(root,t,title,back);return;}
  var f=t.fields,head=mk(doc,root,"header","ja-entity-detail-head"),top=mk(doc,head,"div","ja-entity-detail-topline"),backBtn=btn(doc,top,"ja-entity-detail-back","← Retour"),actions=mk(doc,top,"div","ja-entity-detail-actions");
  backBtn.addEventListener("click",back);
  if(info.form){var edit=btn(doc,actions,"ja-agenda-inline-edit ja-entity-detail-edit","✎ Modifier","Modifier");edit.setAttribute("data-ja-open-entity-form",info.form);edit.setAttribute("data-ja-edit-title",title);}
  var hero=mk(doc,head,"div","ja-entity-detail-hero"),ico=mk(doc,hero,"div","ja-entity-detail-icon",info.icon),heading=mk(doc,hero,"div","ja-entity-detail-heading");
  mk(doc,heading,"div","ja-entity-detail-kicker",info.label);mk(doc,heading,"h1","ja-entity-detail-title",display(t,title));
  var subtitle="";
  if(info.id==="person"){subtitle=String(f["relation-label"]||"");}
  if(info.id==="place"){subtitle=String(f.address||"");}
  if(info.id==="media"){var mm=mediaMeta(String(f["media-type"]||"other"));subtitle=mm?mm.label:"Média";ico.textContent=mm?mm.icon:info.icon;}
  if(subtitle){mk(doc,heading,"p","ja-entity-detail-subtitle",subtitle);}
  var chips=mk(doc,head,"div","ja-entity-detail-chips");

  if(info.id==="person"){this.renderPerson(root,chips,t);}
  else if(info.id==="place"){this.renderPlace(root,chips,t);}
  else if(info.id==="activity"){this.renderActivity(root,chips,t);}
  else if(info.id==="project"){this.renderProject(root,chips,t);}
  else if(info.id==="media"){this.renderMedia(root,chips,t);}
};

EntityDetailWidget.prototype.renderPerson=function(root,chips,t,opts){
  var doc=this.document,f=t.fields,cfg=EConfig.readRelations(this.wiki),rt=EConfig.relationType(cfg,f["relation-type"]),icon=rt&&rt.image?"":((rt&&rt.emoji)||""),grid=mk(doc,root,"div","ja-entity-detail-grid");
  if(rt){chip(doc,chips,rt.label||rt.id,rt.color||"",icon,rt.image?JConfig.imageSrc(this.wiki,rt.image):"");}
  var aliases=[].concat(list(f.nicknames),list(f["other-first-names"]),list(f["other-last-names"]));if(aliases.length){chip(doc,chips,aliases.join(" · "),"", "✦");}
  if(has(f.closeness)){var p=mk(doc,grid,"div","ja-entity-detail-tile ja-entity-detail-proximity-tile");mk(doc,p,"span","ja-entity-detail-label","Proximité");proximity(doc,p,f.closeness);}
  tile(doc,grid,"Anniversaire",fmtDate(f.date_naissance));tile(doc,grid,"Pronoms",f.pronouns);tile(doc,grid,"Adresse",f.address,"is-wide");
  var contacts=json(f.contacts);if(contacts.length){var sec=section(doc,root,"Contacts"),host=mk(doc,sec,"div","ja-entity-detail-contacts"),names={phone:"Téléphone",email:"Mail",discord:"Discord",instagram:"Instagram"};contacts.forEach(function(c){var card=mk(doc,host,"div","ja-entity-contact-card");mk(doc,card,"span","ja-entity-detail-label",names[c.type]||c.type||"Contact");mk(doc,card,"strong","ja-entity-detail-value",c.value||"");});}
  if(!opts||opts.notes!==false){note(doc,root,"Première impression",f["first-impression"]);note(doc,root,"Pourquoi j’ai eu tort ?",f["why-wrong"]);note(doc,root,"Notes",f.text);}
};
EntityDetailWidget.prototype.renderPlace=function(root,chips,t){
  var doc=this.document,f=t.fields,cfg=EConfig.readPlaces(this.wiki),label="";(cfg.types||[]).some(function(x){if(String(x[0])===String(f["place-type"]||"")){label=x[1];return true;}return false;});if(label){chip(doc,chips,label,"","⌖");}
  var grid=mk(doc,root,"div","ja-entity-detail-grid");tile(doc,grid,"Adresse",f.address,"is-wide");note(doc,root,"Notes",f.text);
};
EntityDetailWidget.prototype.renderActivity=function(root,chips,t){
  var doc=this.document,f=t.fields,cfg=Agenda.readConfig(this.wiki),tm=Agenda.eventType(cfg,f["event-type"]);if(tm){chip(doc,chips,tm.label||tm.id,tm.color||"",tm.emoji||"");}
  if(!chips.children.length){chip(doc,chips,"Sans type","","○");}
};
EntityDetailWidget.prototype.renderProject=function(root,chips,t){
  var doc=this.document,f=t.fields,cfg=Agenda.readConfig(this.wiki),tm=Agenda.eventType(cfg,f["event-type"]),mm=f.marker?Agenda.markerMeta(this.wiki,f.marker):null;
  if(tm){chip(doc,chips,tm.label||tm.id,tm.color||"",tm.emoji||"");}if(mm){chip(doc,chips,mm.label||f.marker,mm.color||"",mm.emoji||"◆");}
  var grid=mk(doc,root,"div","ja-entity-detail-grid");tile(doc,grid,"Date de début",fmtDate(f["start-date"]));tile(doc,grid,"Deadline",fmtDate(f.deadline));note(doc,root,"Notes",f.text||f.note);
};
EntityDetailWidget.prototype.renderMedia=function(root,chips,t){
  var doc=this.document,f=t.fields,id=String(f["media-type"]||"other"),mm=mediaMeta(id)||mediaMeta("other");chip(doc,chips,mm.label,"",mm.icon);if(has(f["media-format"])){chip(doc,chips,f["media-format"],"","◌");}if(has(f.status)){chip(doc,chips,f.status,"","✓");}
  var ratingSec=null;if(has(f["rating-20"])){ratingSec=section(doc,root,"Ma note");stars(doc,ratingSec,f["rating-20"],true);}
  var grid=mk(doc,root,"div","ja-entity-detail-grid");tile(doc,grid,mm.creator,f[mm.field]);tile(doc,grid,"Année",f["release-year"]);var genres=list(f.genres);if(genres.length){tile(doc,grid,"Genres",genres.join(" · "),"is-wide");}
  if(id==="book"){tile(doc,grid,"Saga / série",f.series);tile(doc,grid,"Tome",f.volume);}
  else if(id==="videogame"){var ps=list(f.platforms);if(ps.length){tile(doc,grid,"Plateformes",ps.join(" · "),"is-wide");}}
  else if(id==="boardgame"){var players="";if(has(f["players-min"])||has(f["players-max"])){players=(f["players-min"]||"?")+" à "+(f["players-max"]||"?");}tile(doc,grid,"Joueurs",players);tile(doc,grid,"Durée",has(f["duration-minutes"])?f["duration-minutes"]+" min":"");}
  else if(id==="series"){tile(doc,grid,"Plateforme",f["watch-platform"]);tile(doc,grid,"Saisons",f.seasons);}
  else if(id==="film"){tile(doc,grid,"Durée",has(f["duration-minutes"])?f["duration-minutes"]+" min":"");}
  else if(id==="music"){tile(doc,grid,"Album / collection",f.collection);}
  else{tile(doc,grid,"Nature",f["custom-media-kind"]);}
  note(doc,root,"Notes",f.text);
};

/* ------------------------------------------------------------------ */
/* Fiche Relation : en-tete a onglets et mise en page editoriale.      */
/* Les onglets sont la structure ; certains sont encore des pieces     */
/* vides, volontairement, prets a recevoir leur contenu.               */
/* ------------------------------------------------------------------ */
var REL_TABS=[
  {id:"apercu",icon:"♡",label:"Aperçu"},
  {id:"mots",icon:"✎",label:"Petits mots"},
  {id:"journal",icon:"📖",label:"Journal"},
  {id:"annees",icon:"❧",label:"Années"},
  {id:"souvenirs",icon:"✂",label:"Souvenirs"},
  {id:"plus",icon:"✦",label:"Détails"},
  {id:"liens",icon:"👥",label:"Relations"}
];
var TAB_STATE="$:/state/journalapp/entity-tab",
    CONTACT_ICONS={phone:"📞",email:"✉️",discord:"👾",instagram:"📸"},
    CONTACT_NAMES={phone:"Téléphone",email:"Mail",discord:"Discord",instagram:"Instagram"},
    KIND_ICONS={Daily:"📖",event:"🗓",todo:"✓",habit:"↻",vacation:"☀",slot:"🗓","sleep-entry":"🌙",dream:"💤"};

function shared(){try{return require("$:/journalapp/modules/lib/agenda-forms.js").shared;}catch(e){return null;}}
function carryAccent(el){
  var app=document.querySelector(".ja-app");if(!app||!window.getComputedStyle){return;}
  var cs=window.getComputedStyle(app);
  ["--ja-accent","--ja-accent-soft"].forEach(function(n){var v=cs.getPropertyValue(n);if(v){el.style.setProperty(n,v.trim());}});
}
function ageOf(v){
  var m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m){return "";}
  var b=new Date(+m[1],+m[2]-1,+m[3]),n=new Date(),a=n.getFullYear()-b.getFullYear(),
      before=(n.getMonth()<b.getMonth())||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate());
  if(before){a--;}
  return (a>=0&&a<130)?(a+" ans"):"";
}
function shortDate(v){
  var m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?(m[3]+"/"+m[2]+"/"+m[1]):String(v||"");
}
function relLine(doc,parent,label,value){
  if(!has(value)){return null;}
  var l=mk(doc,parent,"div","ja-rel-line");
  mk(doc,l,"span","ja-rel-line-lab",label);
  mk(doc,l,"span","ja-rel-line-val",String(value));
  return l;
}
function relCol(doc,parent,title,cls){
  var c=mk(doc,parent,"section","ja-rel-col"+(cls?" "+cls:"")),h=mk(doc,c,"div","ja-rel-col-head");
  mk(doc,h,"span","ja-rel-col-title",title||"");
  mk(doc,h,"span","ja-rel-col-dash","—");
  return mk(doc,c,"div","ja-rel-lines");
}
function relAdd(doc,parent,text,onClick,cls){
  var b=btn(doc,parent,"ja-rel-add"+(cls?" "+cls:""),"＋ "+text,text);
  b.addEventListener("click",onClick);return b;
}
function relBlank(doc,parent,icon,text,sub){
  var z=mk(doc,parent,"div","ja-rel-blank");
  mk(doc,z,"div","ja-rel-blank-ico",icon);
  mk(doc,z,"div","ja-rel-blank-title",text);
  if(sub){mk(doc,z,"div","ja-rel-blank-sub",sub);}
  return z;
}

EntityDetailWidget.prototype.relPatch=function(title,patch){
  var t=this.wiki.getTiddler(title);if(!t){return;}
  this.wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:new Date()}));
};
EntityDetailWidget.prototype.openForm=function(title){
  var a=this.document.createElement("button");
  a.setAttribute("data-ja-open-entity-form","person");
  a.setAttribute("data-ja-edit-title",title);
  a.style.display="none";this.document.body.appendChild(a);
  a.click();setTimeout(function(){a.remove();},0);
};
/* Editeur de note isole : la meme coquille et le meme editeur riche
   que les formulaires, ouverts sur un seul champ. */
EntityDetailWidget.prototype.openNote=function(title,field,label,placeholder){
  var Shared=shared();if(!Shared){this.openForm(title);return;}
  var self=this,t=this.wiki.getTiddler(title);if(!t){return;}
  var sh=Shared.shell(this,label,"entity",{
        kicker:"Relations",icon:"👤",saveLabel:"Enregistrer",
        modalClass:"ja-entity-form ja-relation-form ja-rel-note-form"
      }),
      state={note:String(t.fields[field]||"")},
      api=Shared.noteEditor(this,sh.body,state),fallback=null;
  carryAccent(sh.overlay);
  if(api){
    var area=sh.body.querySelector(".ja-note-area");
    if(area&&placeholder){area.dataset.placeholder=placeholder;}
  }else{
    fallback=Shared.input(this.document,sh.body,label,"textarea",state.note,placeholder||"");
  }
  sh.save.addEventListener("click",function(){
    var patch={};patch[field]=api?api.value():(fallback?fallback.value:"");
    self.relPatch(title,patch);sh.setClean();sh.close();
  });
};
/* Reglages du portrait : bibliotheque, import, cadrage, position,
   opacite. Memes primitives visuelles que les images du Journal. */
EntityDetailWidget.prototype.openPortrait=function(anchor,imgEl,title,item){
  var doc=this.document,wiki=this.wiki,self=this,
      old=doc.querySelector(".ja-pop.ja-rel-portrait-pop");
  if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop ja-rel-portrait-pop"),cur=item,closed=false;
  carryAccent(pop);
  function repaint(){Relations.paintPortrait(wiki,imgEl,cur);}
  function commit(){Relations.savePortrait(wiki,title,cur);}
  function close(){
    if(closed){return;}closed=true;
    if(pop.parentNode){pop.remove();}
    doc.removeEventListener("mousedown",away,true);commit();
  }
  function away(e){
    if(pop.contains(e.target)||e.target===anchor){return;}
    if(e.target.closest&&e.target.closest(".ja-imagepick-pop")){return;}
    close();
  }
  var acts=mk(doc,pop,"div","ja-rel-portrait-acts"),
      libBtn=btn(doc,acts,"ja-jform-secondary","🖼 Bibliothèque"),
      impBtn=btn(doc,acts,"ja-jform-secondary","⤓ Importer"),
      file=mk(doc,pop,"input","");
  file.type="file";file.accept="image/*";file.style.display="none";
  libBtn.addEventListener("click",function(){
    Media.openWikiImagePicker(doc,wiki,libBtn,function(imgTitle){
      cur.src=imgTitle;repaint();commit();
    },{});
  });
  impBtn.addEventListener("click",function(){file.click();});
  file.addEventListener("change",function(){
    var f0=file.files&&file.files[0];if(!f0){return;}
    Media.importFile(wiki,f0,"portrait").then(function(tt){cur.src=tt;repaint();commit();}).catch(function(){});
  });
  var fitRow=mk(doc,pop,"div","ja-imgset-row");
  mk(doc,fitRow,"span","ja-imgset-lab","Cadrage");
  var fitHost=mk(doc,fitRow,"div","ja-imgset-ctl");
  [["cover","Remplir"],["contain","Entier"],["fill","Étirer"]].forEach(function(o){
    var b=btn(doc,fitHost,"ja-seg-sm",o[1]);b.dataset.v=o[0];
    b.addEventListener("click",function(){
      cur.fit=o[0];repaint();
      Array.prototype.forEach.call(fitHost.children,function(c){c.classList.toggle("is-on",c.dataset.v===cur.fit);});
    });
  });
  Array.prototype.forEach.call(fitHost.children,function(c){c.classList.toggle("is-on",c.dataset.v===cur.fit);});
  [["posX","Horizontal",0,100],["posY","Vertical",0,100],["opacity","Opacité",10,100]].forEach(function(o){
    var row=mk(doc,pop,"div","ja-imgset-row");
    mk(doc,row,"span","ja-imgset-lab",o[1]);
    var ctl=mk(doc,row,"div","ja-imgset-ctl"),
        range=mk(doc,ctl,"input","ja-imgset-range"),
        val=mk(doc,ctl,"span","ja-imgset-val",String(cur[o[0]]));
    range.type="range";range.min=String(o[2]);range.max=String(o[3]);range.value=String(cur[o[0]]);
    range.addEventListener("input",function(){
      cur[o[0]]=parseInt(range.value,10);val.textContent=range.value;repaint();
    });
  });
  var kill=btn(doc,pop,"ja-jform-danger","Retirer le portrait");
  kill.addEventListener("click",function(){cur.src="";repaint();close();});
  var r=anchor.getBoundingClientRect(),vw=doc.documentElement.clientWidth,vh=doc.documentElement.clientHeight;
  pop.style.left=Math.max(8,Math.min(r.left,vw-278))+"px";
  var top=r.bottom+6;if(top+300>vh){top=Math.max(8,r.top-300);}
  pop.style.top=top+"px";
  setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
  self.relCleanups.push(close);
};

EntityDetailWidget.prototype.renderRelationSheet=function(root,t,title,back){
  var doc=this.document,self=this,f=t.fields;
  root.classList.add("ja-rel-sheet");
  this.relCleanups=[];
  var head=mk(doc,root,"header","ja-entity-detail-head ja-rel-head"),
      top=mk(doc,head,"div","ja-entity-detail-topline"),
      backBtn=btn(doc,top,"ja-entity-detail-back","← Retour"),
      actions=mk(doc,top,"div","ja-entity-detail-actions");
  backBtn.addEventListener("click",back);
  var edit=btn(doc,actions,"ja-agenda-inline-edit ja-entity-detail-edit","✎ Modifier","Modifier");
  edit.setAttribute("data-ja-open-entity-form","person");
  edit.setAttribute("data-ja-edit-title",title);
  var nav=mk(doc,head,"nav","ja-rel-tabs"),
      body=mk(doc,root,"div","ja-rel-body"),
      current=this.wiki.getTiddlerText(TAB_STATE,"apercu")||"apercu";
  if(!REL_TABS.some(function(x){return x.id===current;})){current="apercu";}
  function drawBody(){
    body.innerHTML="";
    Array.prototype.forEach.call(nav.children,function(b){b.classList.toggle("ja-active",b.dataset.tab===current);});
    var fresh=self.wiki.getTiddler(title);if(!fresh){return;}
    if(current==="apercu"){self.relApercu(body,fresh,title);}
    else if(current==="mots"){self.relMots(body,fresh,title);}
    else if(current==="journal"){self.relJournal(body,title);}
    else if(current==="plus"){self.relPlus(body,fresh,title);}
    else if(current==="liens"){self.relLiens(body,title);}
    else if(current==="annees"){relBlank(doc,body,"❧","Les années","Chronologie de la relation : rencontres, périodes, ce qui a changé. Prête à être construite.");}
    else{relBlank(doc,body,"✂","Souvenirs","Anecdotes, photos et petits moments épinglés. Prête à être construite.");}
  }
  REL_TABS.forEach(function(tab){
    var b=btn(doc,nav,"ja-rel-tab","",tab.label);
    b.dataset.tab=tab.id;
    mk(doc,b,"span","ja-rel-tab-ico",tab.icon);
    mk(doc,b,"span","ja-rel-tab-lab",tab.label);
    b.addEventListener("click",function(){
      current=tab.id;
      self.wiki.setText(TAB_STATE,"text",null,tab.id,{suppressTimestamp:true});
      drawBody();
    });
  });
  drawBody();
};

/* Onglet Aperçu — la vraie mise en page de la fiche. */
EntityDetailWidget.prototype.relApercu=function(host,t,title){
  var doc=this.document,self=this,f=t.fields,
      cfg=EConfig.readRelations(this.wiki),rt=EConfig.relationType(cfg,f["relation-type"]),
      card=mk(doc,host,"div","ja-rel-card");
  if(rt&&rt.color){card.style.setProperty("--ja-rel-color",rt.color);}
  this.relPortrait(card,t,title);
  var main=mk(doc,card,"div","ja-rel-main"),
      namebar=mk(doc,main,"div","ja-rel-namebar");
  mk(doc,namebar,"span","ja-rel-rule");
  mk(doc,namebar,"h1","ja-rel-name",String(f.label||title));
  mk(doc,namebar,"span","ja-rel-rule");
  var cols=mk(doc,main,"div","ja-rel-cols"),
      who=String(f["relation-label"]||(rt?rt.label:"")||"Qui c’est"),
      left=relCol(doc,cols,who),
      nick=list(f.nicknames)[0]||"";
  relLine(doc,left,"Surnom",nick);
  relLine(doc,left,"Pronoms",f.pronouns);
  relLine(doc,left,"Âge",ageOf(f.date_naissance));
  if(rt&&!f["relation-label"]){relLine(doc,left,"Type",rt.label||rt.id);}
  if(!left.children.length){
    relAdd(doc,left,"compléter la fiche",function(){self.openForm(title);});
  }
  var right=relCol(doc,cols,"Contact","ja-rel-col-contact"),contacts=json(f.contacts);
  contacts.forEach(function(c){
    if(!has(c&&c.value)){return;}
    var l=mk(doc,right,"div","ja-rel-line ja-rel-contact");
    mk(doc,l,"span","ja-rel-contact-ico",CONTACT_ICONS[c.type]||"◌");
    mk(doc,l,"span","ja-rel-line-val",String(c.value));
  });
  if(!right.children.length){
    relAdd(doc,right,"ajouter un contact",function(){self.openForm(title);});
  }

  /* Bandeau de faits : anniversaire et lieux, façon marginalia. */
  var strip=mk(doc,host,"div","ja-rel-strip"),
      facts=mk(doc,strip,"div","ja-rel-facts");
  if(has(f.date_naissance)){
    var fb=mk(doc,facts,"div","ja-rel-fact");
    mk(doc,fb,"span","ja-rel-fact-ico","🎂");
    mk(doc,fb,"span","ja-rel-fact-val",shortDate(f.date_naissance));
  }
  var places=list(f.places),placeIcons=["📍","🏡","🗺"];
  places.forEach(function(p,i){
    var pf=mk(doc,facts,"div","ja-rel-fact ja-rel-fact-place");
    mk(doc,pf,"span","ja-rel-fact-ico",placeIcons[i]||"📍");
    var b=btn(doc,pf,"ja-rel-fact-link",Relations.displayOf(self.wiki,p));
    b.setAttribute("data-ja-open-entity-detail","yes");
    b.setAttribute("data-ja-detail-title",p);
    mk(doc,pf,"span","ja-rel-fact-home","⌂");
  });
  if(!facts.children.length){
    relAdd(doc,facts,"anniversaire, lieux…",function(){self.openForm(title);});
  }
  this.relNoteCard(strip,f,title,"first-impression","Première impression","Ce que j’ai pensé au début…");
  this.relNoteCard(strip,f,title,"why-wrong","Pourquoi j’ai eu tort","Ce que j’avais mal compris…");
  var linkBox=mk(doc,strip,"div","ja-rel-linkbox"),
      links=Relations.linksOf(this.wiki,title);
  mk(doc,linkBox,"span","ja-rel-linkbox-ico","👥");
  var linkList=mk(doc,linkBox,"div","ja-rel-linklist");
  links.slice(0,6).forEach(function(l,i){
    var o=Relations.originMeta(l.origin),
        b=btn(doc,linkList,"ja-rel-linkname",Relations.displayOf(self.wiki,l.title),o.hint);
    b.addEventListener("click",function(){
      self.wiki.setText("$:/state/journalapp/entity-detail","text",null,l.title,{suppressTimestamp:true});
    });
    mk(doc,linkList,"span","ja-rel-linkorigin",o.icon);
  });
  var addLink=btn(doc,linkList,"ja-rel-add ja-rel-add-inline","＋","Lier une personne");
  addLink.addEventListener("click",function(){
    Relations.pickPerson(self,addLink,{self:title,taken:links.map(function(l){return l.title;})},function(p,origin){
      Relations.addLink(self.wiki,title,p.title,origin);
    },self.relCleanups);
  });

  /* Des petits mots : la note libre, éditable sans ouvrir le formulaire. */
  var mots=mk(doc,host,"div","ja-rel-mots");
  mk(doc,mots,"span","ja-rel-mots-ico","✎");
  mk(doc,mots,"span","ja-rel-mots-lab","Des petits mots");
  if(has(f.text)){
    var body=mk(doc,mots,"div","ja-rel-mots-body");
    body.innerHTML=Agenda.normalizeNoteHtml(f.text,doc);
  }else{
    mk(doc,mots,"span","ja-rel-mots-empty","Rien d’écrit pour l’instant.");
  }
  var eb=btn(doc,mots,"ja-rel-mini-edit","✎","Modifier les petits mots");
  eb.addEventListener("click",function(){self.openNote(title,"text","Des petits mots","Ce qu’on garde d’elle ou de lui…");});
};

EntityDetailWidget.prototype.relPortrait=function(parent,t,title){
  var doc=this.document,self=this,
      wrap=mk(doc,parent,"div","ja-rel-portrait"),
      frame=mk(doc,wrap,"div","ja-rel-portrait-frame");
  mk(doc,frame,"span","ja-rel-portrait-initials",Relations.initials(t.fields.label||title));
  var img=mk(doc,frame,"span","ja-rel-portrait-img"),item=Relations.portrait(t.fields);
  Relations.paintPortrait(this.wiki,img,item);
  var e=btn(doc,wrap,"ja-rel-portrait-edit","✎","Portrait et réglages d’image");
  e.addEventListener("click",function(){self.openPortrait(e,img,title,item);});
};

EntityDetailWidget.prototype.relNoteCard=function(host,f,title,field,label,placeholder){
  var doc=this.document,self=this,box=mk(doc,host,"section","ja-rel-notecard"),
      head=mk(doc,box,"div","ja-rel-notecard-head");
  mk(doc,head,"span","ja-rel-notecard-title",label);
  var e=btn(doc,head,"ja-rel-mini-edit","✎","Modifier");
  e.addEventListener("click",function(){self.openNote(title,field,label,placeholder);});
  if(has(f[field])){
    var body=mk(doc,box,"div","ja-rel-notebody");
    body.innerHTML=Agenda.normalizeNoteHtml(f[field],doc);
  }else{
    relAdd(doc,box,"écrire",function(){self.openNote(title,field,label,placeholder);});
  }
  return box;
};

/* Onglet Petits mots : les trois textes, en grand. */
EntityDetailWidget.prototype.relMots=function(host,t,title){
  var doc=this.document,f=t.fields,grid=mk(doc,host,"div","ja-rel-notes-grid");
  this.relNoteCard(grid,f,title,"first-impression","Première impression","Ce que j’ai pensé au début…");
  this.relNoteCard(grid,f,title,"why-wrong","Pourquoi j’ai eu tort","Ce que j’avais mal compris…");
  this.relNoteCard(host,f,title,"text","Des petits mots","Ce qu’on garde d’elle ou de lui…");
};

/* Onglet Journal : partout où cette personne est liée. */
EntityDetailWidget.prototype.relJournal=function(host,title){
  var doc=this.document,self=this,rows=[];
  this.wiki.each(function(t,tt){
    if(!t||!t.fields||tt===title){return;}
    if(list(t.fields.people).indexOf(title)===-1){return;}
    rows.push({title:tt,f:t.fields,date:String(t.fields.date||t.fields["start-date"]||t.fields["bed-date"]||"")});
  });
  rows.sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
  if(!rows.length){
    relBlank(doc,host,"📖","Aucune trace pour l’instant","Dès qu’une Daily ou un événement mentionne cette personne, tout apparaît ici.");
    return;
  }
  var listHost=mk(doc,host,"div","ja-rel-journal");
  rows.slice(0,120).forEach(function(r){
    var kind=String(r.f.kind||""),card=mk(doc,listHost,"div","ja-basic-card ja-rel-journal-row");
    mk(doc,card,"span","ja-basic-card-icon",KIND_ICONS[kind]||"✦");
    var txt=mk(doc,card,"div","ja-basic-card-text");
    mk(doc,txt,"div","ja-basic-card-title",String(r.f.label||r.title));
    mk(doc,txt,"div","ja-basic-card-meta",[fmtDate(r.date),kind==="Daily"?"Journal":(r.f["event-type"]||kind)].filter(Boolean).join(" · "));
    if(kind==="Daily"&&r.date){
      var go=btn(doc,card,"ja-rel-mini-edit","→","Ouvrir ce jour");
      go.addEventListener("click",function(){
        self.wiki.setText("$:/state/journalapp/journal-date","text",null,r.date,{suppressTimestamp:true});
        self.wiki.setText("$:/state/journalapp/category","text",null,"$:/journalapp/categories/journal",{suppressTimestamp:true});
        self.wiki.setText("$:/state/journalapp/view","text",null,"$:/journalapp/views/journal/home",{suppressTimestamp:true});
      });
    }
  });
};

/* Onglet Détails : tout le reste, dans la présentation d'origine. */
EntityDetailWidget.prototype.relPlus=function(host,t,title){
  var doc=this.document,chips=mk(doc,host,"div","ja-entity-detail-chips");
  this.renderPerson(host,chips,t,{notes:false});
  if(!host.querySelector(".ja-entity-detail-grid").children.length&&!chips.children.length){
    relBlank(doc,host,"✦","Rien à afficher ici","Anniversaire, adresse, alias et contacts viendront s’y ranger.");
  }
};

/* Onglet Relations : les liens, leur origine, et de quoi en ajouter. */
EntityDetailWidget.prototype.relLiens=function(host,title){
  var doc=this.document,self=this,links=Relations.linksOf(this.wiki,title),
      head=mk(doc,host,"div","ja-entity-section-head");
  mk(doc,head,"span","ja-rel-notecard-title","Ses relations");
  var add=btn(doc,head,"ja-jform-secondary","＋ Lier une personne");
  add.addEventListener("click",function(){
    Relations.pickPerson(self,add,{self:title,taken:links.map(function(l){return l.title;})},function(p,origin){
      Relations.addLink(self.wiki,title,p.title,origin);
    },self.relCleanups);
  });
  if(!links.length){
    relBlank(doc,host,"👥","Aucune personne liée","Une relation peut venir d’elle, de moi, ou d’une rencontre commune.");
    return;
  }
  var listHost=mk(doc,host,"div","ja-rel-links");
  links.forEach(function(l){
    var o=Relations.originMeta(l.origin),row=mk(doc,listHost,"div","ja-rel-linkrow");
    mk(doc,row,"span","ja-rel-linkrow-ico",o.icon);
    var open=btn(doc,row,"ja-rel-linkrow-name",Relations.displayOf(self.wiki,l.title));
    open.addEventListener("click",function(){
      self.wiki.setText("$:/state/journalapp/entity-detail","text",null,l.title,{suppressTimestamp:true});
    });
    mk(doc,row,"span","ja-rel-linkrow-origin",o.hint);
    btn(doc,row,"ja-entity-mini-remove","×","Retirer ce lien").addEventListener("click",function(){
      Relations.removeLink(self.wiki,title,l.title);
    });
  });
};

EntityDetailWidget.prototype.refresh=function(changedTiddlers){
  var next=this.wiki.getTiddlerText("$:/state/journalapp/entity-detail","");
  if(next!==this.detailTitle||(this.detailTitle&&changedTiddlers[this.detailTitle])){this.refreshSelf();return true;}return false;
};
exports.jaentitydetail=EntityDetailWidget;
})();
