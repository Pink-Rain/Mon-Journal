/*\
title: $:/journalapp/modules/lib/entity-forms.js
type: application/javascript
module-type: library

Mon Journal — vrais formulaires Relations, Lieux, Activités, Média et Sommeil.
La coquille, le type Agenda, les marqueurs et les éditeurs riches sont empruntés
aux formulaires Journal/Agenda. Ici ne vit que la logique métier propre aux entités.
\*/
"use strict";

var Entities=require("$:/journalapp/modules/lib/entities.js"),
    Agenda=require("$:/journalapp/modules/lib/agenda.js"),
    AgendaForms=require("$:/journalapp/modules/lib/agenda-forms.js"),
    Shared=AgendaForms.shared,
    Media=require("$:/journalapp/modules/lib/jmedia.js"),
    JConfig=require("$:/journalapp/modules/lib/jconfig.js"),
    EConfig=require("$:/journalapp/modules/lib/entity-config.js"),
    Relations=require("$:/journalapp/modules/lib/relations.js");

function mk(doc,parent,tag,cls,text){
  var el=doc.createElement(tag);if(cls){el.className=cls;}
  if(text!==undefined&&text!==null){el.textContent=text;}
  if(parent){parent.appendChild(el);}return el;
}
function button(doc,parent,cls,text,title){
  var b=mk(doc,parent,"button",cls,text);b.type="button";
  if(title){b.title=title;b.setAttribute("aria-label",title);}return b;
}
function list(v){return Entities.parseList(v)||[];}
function json(v,def){try{var x=JSON.parse(String(v||""));return Array.isArray(x)?x:(def||[]);}catch(e){return def||[];}}
function uniqueTitle(wiki,base){
  base=String(base||"").trim()||"Sans titre";if(!wiki.tiddlerExists(base)){return base;}
  var n=2;while(wiki.tiddlerExists(base+" · "+n)){n++;}return base+" · "+n;
}
function today(){
  var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function addDays(iso,n){
  var p=String(iso||today()).split("-").map(Number),d=new Date(p[0],p[1]-1,p[2]);d.setDate(d.getDate()+n);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function minutes(hhmm){
  var m=String(hhmm||"").match(/^(\d{1,2}):(\d{2})$/);return m?(+m[1]*60+(+m[2])):null;
}
function fmtDuration(mins){
  mins=Math.max(0,Math.round(Number(mins)||0));var h=Math.floor(mins/60),m=mins%60;
  if(h&&m){return h+" h "+String(m).padStart(2,"0");}
  if(h){return h+" h";}return m+" min";
}
function addMinutesTime(hhmm,n){
  var m=minutes(hhmm);if(m===null){return "";}m=(m+Math.max(0,parseInt(n||"0",10)||0))%1440;
  return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
}
function carryAccent(el){
  var app=document.querySelector(".ja-app");if(!app||!window.getComputedStyle){return;}
  var cs=window.getComputedStyle(app);
  ["--ja-accent","--ja-accent-soft"].forEach(function(name){
    var v=cs.getPropertyValue(name);if(v){el.style.setProperty(name,v.trim());}
  });
}
function shell(widget,title,opts){
  opts=opts||{};
  var sh=Shared.shell(widget,title,"entity",{
    saveLabel:opts.saveLabel||"Enregistrer",
    kicker:opts.kicker||"",
    icon:opts.icon||"",
    modalClass:"ja-entity-form "+(opts.modalClass||"")
  });
  carryAccent(sh.overlay);return sh;
}
function editor(widget,parent,label,value,placeholder){
  var block=mk(widget.document,parent,"section","ja-entity-editor-block");
  mk(widget.document,block,"div","ja-agenda-form-label",label);
  var state={note:String(value||"")},api=Shared.noteEditor(widget,block,state),fallback=null;
  if(api){
    var area=block.querySelector(".ja-note-area");if(area&&placeholder){area.dataset.placeholder=placeholder;}
  }else{
    fallback=Shared.input(widget.document,block,"","textarea",state.note,placeholder||"");
  }
  return {value:function(){return api?api.value():(fallback?fallback.value:"");}};
}
function fieldSelect(doc,parent,label,value,options,cls){
  var s=Shared.select(doc,parent,label,value,options||[]);if(cls){s.parentNode.classList.add(cls);}return s;
}
function simpleInput(doc,parent,label,type,value,placeholder,cls){
  var i=Shared.input(doc,parent,label,type,value,placeholder);if(cls){i.parentNode.classList.add(cls);}return i;
}
function saveTiddler(wiki,old,title,fields,tag,kind){
  var tags=old?Entities.tagsOf(old):[];
  if(tags.indexOf(tag)===-1){tags.push(tag);}
  wiki.addTiddler(new $tw.Tiddler(old||{},fields,{
    title:title,tags:tags,kind:kind,
    created:old&&old.fields.created?old.fields.created:new Date(),
    modified:new Date()
  }));
}

function cleanupEntityReferences(wiki,title,field){
  if(!title||!field){return;}
  var now=new Date();
  wiki.each(function(t,tt){
    if(!t||!t.fields||tt===title){return;}
    var vals=list(t.fields[field]);
    if(vals.indexOf(title)===-1){return;}
    var patch={};
    patch[field]=$tw.utils.stringifyList(vals.filter(function(x){return x!==title;}));
    wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:now}));
  });
}
function leaveDeletedDetail(wiki,title){
  if(wiki.getTiddlerText("$:/state/journalapp/entity-detail","")!==title){return;}
  var back=wiki.getTiddlerText("$:/state/journalapp/entity-detail-return-view","");
  if(!back||back==="$:/journalapp/views/shared/entity-detail"){
    var cat=wiki.getTiddlerText("$:/state/journalapp/category",""),ct=cat?wiki.getTiddler(cat):null;
    back=ct&&ct.fields["landing-view"]?String(ct.fields["landing-view"]):"$:/journalapp/views/accueil/home";
  }
  wiki.setText("$:/state/journalapp/view","text",null,back,{suppressTimestamp:true});
  wiki.setText("$:/state/journalapp/entity-detail","text",null,"",{suppressTimestamp:true});
}
function attachDelete(widget,sh,editTitle,label,field){
  if(!editTitle){return;}
  button(widget.document,sh.headActions,"ja-jform-danger","Supprimer","Supprimer").addEventListener("click",function(){
    if(!window.confirm("Supprimer "+label+" ? Les liens vers cette fiche seront retirés.")){return;}
    cleanupEntityReferences(widget.wiki,editTitle,field);
    widget.wiki.deleteTiddler(editTitle);
    leaveDeletedDetail(widget.wiki,editTitle);
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Adresse partagée : suggestions locales + IGN Géoplateforme + Photon */
/* ------------------------------------------------------------------ */
function addressInput(widget,parent,label,value,opts){
  opts=opts||{};
  var doc=widget.document,wrap=mk(doc,parent,"label","ja-agenda-form-field ja-entity-address-field");
  mk(doc,wrap,"span","ja-agenda-form-label",label||"Adresse");
  var input=mk(doc,wrap,"input","ja-jform-input ja-agenda-form-input");
  input.type="text";input.value=value||"";input.placeholder=opts.placeholder||"Commence à taper une adresse…";input.autocomplete="off";
  var menu=mk(doc,wrap,"div","ja-qe-autocomplete-menu"),timer=null,ctrl=null,picked=opts.initialSuggestion||null;
  function close(){menu.innerHTML="";menu.classList.remove("is-open");}
  function choose(s){
    picked=s||null;input.value=String((s&&s.address)||(s&&s.value)||(s&&s.label)||"");close();
    input.dispatchEvent(new Event("change",{bubbles:true}));if(opts.onPick){opts.onPick(s);}
  }
  function render(items){
    menu.innerHTML="";
    (items||[]).slice(0,10).forEach(function(s){
      var b=button(doc,menu,"ja-qe-autocomplete-item","");
      mk(doc,b,"span","ja-entity-address-main",s.label||s.value||"");
      if(s.source){mk(doc,b,"span","ja-entity-address-source",s.existing?"Dans le wiki":s.source);}
      b.addEventListener("mousedown",function(e){e.preventDefault();});
      b.addEventListener("click",function(){choose(s);});
    });
    menu.classList.toggle("is-open",!!(items&&items.length));
  }
  function run(){
    var q=input.value.trim();picked=null;clearTimeout(timer);
    if(ctrl){try{ctrl.abort();}catch(e){}}
    if(q.length<2){close();return;}
    var local=Entities.localSuggestions(widget.wiki,"place",q);render(local);
    timer=setTimeout(async function(){
      ctrl=typeof AbortController!=="undefined"?new AbortController():null;
      var remote=await Entities.fetchPlaceSuggestions(q,ctrl?ctrl.signal:undefined);
      if(input.value.trim()!==q){return;}
      render(Entities.mergeSuggestions([local,remote]).slice(0,10));
    },220);
  }
  input.addEventListener("input",run);input.addEventListener("focus",run);
  var away=function(e){if(!wrap.contains(e.target)){close();}};
  doc.addEventListener("mousedown",away,true);
  return {
    input:input,
    value:function(){return input.value.trim();},
    suggestion:function(){return picked;},
    cleanup:function(){doc.removeEventListener("mousedown",away,true);if(ctrl){try{ctrl.abort();}catch(e){}}clearTimeout(timer);}
  };
}

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */
function openPerson(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      cfg=EConfig.readRelations(widget.wiki),
      sh=shell(widget,editTitle?"Modifier la relation":"Créer une relation",{
        kicker:"Relations",icon:"👤",saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-relation-form"
      }),doc=widget.document;
  attachDelete(widget,sh,editTitle,"cette relation","people");

  /* Ligne 1 : Prénom d'abord, puis nom, puis le petit + des variantes. */
  var line1=mk(doc,sh.body,"div","ja-entity-row ja-relation-name-row"),
      first=simpleInput(doc,line1,"Prénom","text",f["first-name"]||"","Prénom"),
      last=simpleInput(doc,line1,"Nom","text",f["last-name"]||"","Nom"),
      addName=button(doc,line1,"ja-entity-plus","＋","Ajouter un autre nom"),
      extras=mk(doc,sh.body,"div","ja-relation-name-extras"),
      nameData={
        nickname:list(f.nicknames),
        first:list(f["other-first-names"]),
        last:list(f["other-last-names"])
      };

  function extraRow(kind,value){
    var labels={nickname:"Surnom",first:"Autre prénom",last:"Autre nom"},
        row=mk(doc,extras,"div","ja-relation-name-extra"),inp=simpleInput(doc,row,labels[kind],"text",value||"",""),
        rm=button(doc,row,"ja-entity-mini-remove","×","Retirer");
    rm.addEventListener("click",function(){
      var arr=nameData[kind],idx=arr.indexOf(value);if(idx!==-1){arr.splice(idx,1);}
      row.remove();
    });
    inp.addEventListener("input",function(){value=inp.value;});
    row._read=function(){return {kind:kind,value:inp.value.trim()};};
  }
  function readExtras(){
    var out={nickname:[],first:[],last:[]};
    Array.prototype.forEach.call(extras.children,function(r){
      if(!r._read){return;}var x=r._read();if(x.value){out[x.kind].push(x.value);}
    });return out;
  }
  Object.keys(nameData).forEach(function(k){nameData[k].forEach(function(v){extraRow(k,v);});});
  addName.addEventListener("click",function(){
    Shared.popover(doc,addName,[
      {label:"Surnom",run:function(){extraRow("nickname","");}},
      {label:"Autre prénom",run:function(){extraRow("first","");}},
      {label:"Autre nom",run:function(){extraRow("last","");}}
    ],sh.cleanups);
  });

  /* Nom affiché : plusieurs morceaux peuvent être cochés en même temps.
     L'aperçu se met à jour en direct, on voit ce qu'on fabrique. */
  function nameSnapshot(){
    var e=readExtras();
    return {
      "first-name":first.value,"last-name":last.value,
      nicknames:$tw.utils.stringifyList(e.nickname),
      "other-first-names":$tw.utils.stringifyList(e.first),
      "other-last-names":$tw.utils.stringifyList(e.last),
      "relation-label":who?who.value:""
    };
  }
  var labelParts=Relations.partsField(doc,sh.body,nameSnapshot,list(f["label-parts"]));
  line1.addEventListener("input",labelParts.refresh);
  extras.addEventListener("input",labelParts.refresh);

  /* Ligne 2 */
  var line2=mk(doc,sh.body,"div","ja-entity-row ja-relation-meta-row"),
      who=simpleInput(doc,line2,"Qui est-ce ?","text",f["relation-label"]||"","ex. ami d’enfance, collègue…"),
      typeWrap=mk(doc,line2,"label","ja-agenda-form-field ja-relation-type-field");
  mk(doc,typeWrap,"span","ja-agenda-form-label","Type de relation");
  var typeSelect=mk(doc,typeWrap,"select","ja-jform-input ja-agenda-form-input");
  mk(doc,typeSelect,"option","","Sans type").value="";
  (cfg.relationTypes||[]).forEach(function(rt){
    var op=mk(doc,typeSelect,"option","",rt.label||rt.id);op.value=rt.id;if(String(f["relation-type"]||"")===String(rt.id)){op.selected=true;}
  });
  function drawRelationType(){
    var rt=EConfig.relationType(cfg,typeSelect.value);
    typeWrap.style.setProperty("--ja-reltype-color",(rt&&rt.color)||"var(--ja-accent)");
  }
  typeSelect.addEventListener("change",drawRelationType);drawRelationType();
  who.addEventListener("input",labelParts.refresh);
  var proxWrap=mk(doc,line2,"div","ja-relation-proximity-field");
  mk(doc,proxWrap,"span","ja-agenda-form-label","Proximité");
  var proxHost=mk(doc,proxWrap,"div","ja-relation-proximity"),proximity=parseInt(f.closeness||"0",10)||0;
  [-3,-2,-1,0,1,2,3].forEach(function(v){
    var b=button(doc,proxHost,"ja-relation-prox",v>0?"+"+v:String(v),v<0?"Plutôt distant":v>0?"Plutôt proche":"Neutre");
    b.dataset.value=String(v);
    b.addEventListener("click",function(){proximity=v;drawProx();});
  });
  function drawProx(){
    Array.prototype.forEach.call(proxHost.children,function(b){
      b.classList.toggle("is-on",parseInt(b.dataset.value,10)===proximity);
      b.classList.toggle("is-negative",parseInt(b.dataset.value,10)<0);
      b.classList.toggle("is-positive",parseInt(b.dataset.value,10)>0);
    });
  }drawProx();

  /* Ligne 3 */
  var line3=mk(doc,sh.body,"div","ja-entity-row ja-relation-details-row"),
      birthday=simpleInput(doc,line3,"Anniversaire","date",f.date_naissance||"",""),
      placeTitle=String((list(f.places)[0])||""),
      addr=addressInput(widget,line3,"Adresse",f.address||"",{
        onPick:function(s){if(s&&s.existing){placeTitle=s.value;}}
      }),
      pronouns=simpleInput(doc,line3,"Pronoms","text",f.pronouns||"","il/lui, elle, iel…");
  sh.cleanups.push(addr.cleanup);

  /* Ligne 4 : contacts répétables. */
  var contactsBlock=mk(doc,sh.body,"section","ja-relation-contacts"),
      contactsHead=mk(doc,contactsBlock,"div","ja-entity-section-head");
  mk(doc,contactsHead,"span","ja-agenda-form-label","Contacts");
  var addContact=button(doc,contactsHead,"ja-jform-secondary","＋ Ajouter un contact"),
      contactsList=mk(doc,contactsBlock,"div","ja-relation-contact-list"),
      contacts=json(f.contacts,[]);
  function contactRow(type,value){
    var row=mk(doc,contactsList,"div","ja-relation-contact-row"),
        typ=fieldSelect(doc,row,"",type,[["phone","Téléphone"],["email","Mail"],["discord","Discord"],["instagram","Instagram"]]),
        val=simpleInput(doc,row,"","text",value||"",type==="email"?"nom@…":""),
        rm=button(doc,row,"ja-entity-mini-remove","×","Retirer ce contact");
    rm.addEventListener("click",function(){row.remove();});
    row._read=function(){return {type:typ.value,value:val.value.trim()};};
  }
  contacts.forEach(function(c){contactRow(c.type||"phone",c.value||"");});
  addContact.addEventListener("click",function(){
    Shared.popover(doc,addContact,[
      {label:"☎ Téléphone",run:function(){contactRow("phone","");}},
      {label:"✉ Mail",run:function(){contactRow("email","");}},
      {label:"◈ Discord",run:function(){contactRow("discord","");}},
      {label:"◎ Instagram",run:function(){contactRow("instagram","");}}
    ],sh.cleanups);
  });

  /* Ses relations. Le lien est écrit des deux côtés à l'enregistrement :
     jamais à ressaisir sur la fiche d'en face. */
  var links=Relations.linksField(widget,sh.body,editTitle,Relations.parseLinks(f["relations-links"]),sh.cleanups);

  /* Lignes 5 et 6 : les éditeurs de texte du Journal. */
  var line5=mk(doc,sh.body,"div","ja-entity-row ja-relation-editor-row"),
      firstImpression=editor(widget,line5,"Première impression",f["first-impression"]||"","Ce que j’ai pensé au début…"),
      whyWrong=editor(widget,line5,"Pourquoi j’ai eu tort ?",f["why-wrong"]||"","Ce que j’avais mal compris…"),
      notes=editor(widget,sh.body,"Notes",f.text||"","Notes libres…");

  sh.save.addEventListener("click",async function(){
    var ln=last.value.trim(),fn=first.value.trim();
    if(!ln&&!fn){first.focus();return;}
    var extrasNow=readExtras(),labelBits=labelParts.value(),
        display=Relations.buildLabel(nameSnapshot(),labelBits)||[fn,ln].filter(Boolean).join(" "),
        title=editTitle||uniqueTitle(widget.wiki,display),
        rt=EConfig.relationType(cfg,typeSelect.value),
        contactOut=[];
    Array.prototype.forEach.call(contactsList.children,function(r){if(r._read){var c=r._read();if(c.value){contactOut.push(c);}}});

    var suggestion=addr.suggestion(),address=addr.value(),lat="",lon="";
    if(suggestion){lat=suggestion.latitude!=null?String(suggestion.latitude):"";lon=suggestion.longitude!=null?String(suggestion.longitude):"";}
    if(address){
      if(!placeTitle){placeTitle=(suggestion&&suggestion.existing)?suggestion.value:address;}
      try{await Entities.ensurePlace(widget.wiki,placeTitle,address,suggestion||{});}catch(e){}
    }

    saveTiddler(widget.wiki,old,title,{
      label:display,
      "label-parts":$tw.utils.stringifyList(labelBits),
      "first-name":fn,
      "last-name":ln,
      nicknames:$tw.utils.stringifyList(extrasNow.nickname),
      "other-first-names":$tw.utils.stringifyList(extrasNow.first),
      "other-last-names":$tw.utils.stringifyList(extrasNow.last),
      "relation-label":who.value.trim(),
      "relation-type":typeSelect.value||"",
      "relation-type-color":rt&&rt.color?String(rt.color):"",
      closeness:String(proximity),
      date_naissance:birthday.value||"",
      address:address,
      latitude:lat||String(f.latitude||""),
      longitude:lon||String(f.longitude||""),
      places:placeTitle?$tw.utils.stringifyList([placeTitle]):"",
      pronouns:pronouns.value.trim(),
      contacts:contactOut.length?JSON.stringify(contactOut):"",
      "first-impression":firstImpression.value(),
      "why-wrong":whyWrong.value(),
      text:notes.value()
    },"Relations","person");
    Relations.applyLinks(widget.wiki,title,links.value());
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Lieux                                                               */
/* ------------------------------------------------------------------ */
function openPlace(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      cfg=EConfig.readPlaces(widget.wiki),
      sh=shell(widget,editTitle?"Modifier le lieu":"Créer un lieu",{
        kicker:"Lieux",icon:"📍",saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-place-form"
      }),doc=widget.document,
      line1=mk(doc,sh.body,"div","ja-entity-row ja-place-name-row"),
      name=simpleInput(doc,line1,"Nom du lieu","text",String(f.label||editTitle||""),"Chez Emma, Parc, Maison…"),
      placeType=fieldSelect(doc,line1,"Type de lieu",f["place-type"]||"",[["","Sans type"]].concat(cfg.types||[])),
      line2=mk(doc,sh.body,"div","ja-entity-row"),
      addr=addressInput(widget,line2,"Adresse",f.address||"",{}),
      notes=editor(widget,sh.body,"Notes",f.text||"","Notes sur ce lieu…");
  attachDelete(widget,sh,editTitle,"ce lieu","places");
  sh.cleanups.push(addr.cleanup);

  sh.save.addEventListener("click",async function(){
    var label=name.value.trim();if(!label){name.focus();return;}
    var title=editTitle||uniqueTitle(widget.wiki,label),suggestion=addr.suggestion(),address=addr.value(),
        ensured=await Entities.ensurePlace(widget.wiki,title,address,suggestion||{}),
        current=ensured||widget.wiki.getTiddler(title);
    saveTiddler(widget.wiki,current,title,{
      label:label,
      "place-type":placeType.value||"",
      address:address,
      latitude:suggestion&&suggestion.latitude!=null?String(suggestion.latitude):String((current&&current.fields.latitude)||""),
      longitude:suggestion&&suggestion.longitude!=null?String(suggestion.longitude):String((current&&current.fields.longitude)||""),
      text:notes.value()
    },"Lieux","place");
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Activités                                                           */
/* ------------------------------------------------------------------ */
function openActivity(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      state={label:String(f.label||editTitle||""),eventType:String(f["event-type"]||""),marker:""},
      sh=shell(widget,editTitle?"Modifier l’activité":"Créer une activité",{
        kicker:"Activités",icon:"🏃",saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-activity-form"
      }),
      head=Shared.eventHeadBlock(widget,sh,state,{statuses:[],marker:false,defaultIcon:"🏃",placeholder:"Nom de l’activité…"});
  attachDelete(widget,sh,editTitle,"cette activité","activities");

  sh.save.addEventListener("click",function(){
    var label=head.title.value.trim();if(!label){head.title.focus();return;}
    var title=editTitle||uniqueTitle(widget.wiki,label),type=head.type?head.type.value():"";
    saveTiddler(widget.wiki,old,title,{label:label,"event-type":type},"Activité","activity");
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Média : mêmes gestes, champs adaptés au support                     */
/* ------------------------------------------------------------------ */
var MEDIA_META={
  book:{icon:"📚",title:"Livre",creator:"Auteur·ice",creatorField:"author"},
  music:{icon:"🎵",title:"Musique",creator:"Artiste",creatorField:"artist"},
  videogame:{icon:"🎮",title:"Jeu vidéo",creator:"Studio / éditeur",creatorField:"studio"},
  boardgame:{icon:"🎲",title:"Jeu de société",creator:"Auteur·ice / éditeur",creatorField:"creator"},
  series:{icon:"📺",title:"Série",creator:"Créateur·ice",creatorField:"creator"},
  film:{icon:"🎬",title:"Film",creator:"Réalisateur·ice",creatorField:"director"},
  other:{icon:"✦",title:"Autre média",creator:"Créateur·ice",creatorField:"creator"}
};

function tagPicker(doc,parent,label,values,suggestions,placeholder){
  var wrap=mk(doc,parent,"div","ja-media-tag-field"),lab=mk(doc,wrap,"span","ja-agenda-form-label",label),
      host=mk(doc,wrap,"div","ja-media-tagbox"),chips=mk(doc,host,"div","ja-media-tags"),
      input=mk(doc,host,"input","ja-media-tag-input"),menu=mk(doc,wrap,"div","ja-media-suggest"),
      selected=Entities.uniqueStrings(values||[]);
  input.type="text";input.placeholder=placeholder||"Ajouter…";
  function draw(){
    chips.innerHTML="";
    selected.forEach(function(v,idx){
      var c=button(doc,chips,"ja-media-tag","");mk(doc,c,"span","",v);mk(doc,c,"span","ja-media-tag-x","×");
      c.addEventListener("click",function(){selected.splice(idx,1);draw();});
    });
  }
  function close(){menu.innerHTML="";menu.classList.remove("is-open");}
  function add(v){v=String(v||"").trim();if(v&&selected.map(function(x){return x.toLowerCase();}).indexOf(v.toLowerCase())===-1){selected.push(v);draw();}input.value="";close();}
  function suggest(){
    var q=input.value.trim().toLowerCase(),pool=(suggestions||[]).filter(function(v){
      return selected.indexOf(v)===-1&&(!q||v.toLowerCase().indexOf(q)!==-1);
    }).slice(0,8);
    menu.innerHTML="";
    pool.forEach(function(v){var b=button(doc,menu,"ja-qe-autocomplete-item",v);b.addEventListener("mousedown",function(e){e.preventDefault();});b.addEventListener("click",function(){add(v);});});
    menu.classList.toggle("is-open",pool.length>0);
  }
  input.addEventListener("input",suggest);input.addEventListener("focus",suggest);
  input.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key===","){e.preventDefault();add(input.value.replace(/,$/,""));}
    if(e.key==="Escape"){close();}
  });
  draw();
  return {value:function(){return selected.slice();}};
}

function openMedia(widget,mediaType,opts){
  opts=opts||{};mediaType=MEDIA_META[mediaType]?mediaType:"other";
  var meta=MEDIA_META[mediaType],editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      cfg=EConfig.readMedia(widget.wiki),def=cfg[mediaType]||cfg.other||{},doc=widget.document,
      sh=shell(widget,editTitle?"Modifier · "+meta.title:"Créer · "+meta.title,{
        kicker:"Média",icon:meta.icon,saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-media-form ja-media-form-"+mediaType
      });
  attachDelete(widget,sh,editTitle,"ce média","media");

  var line1=mk(doc,sh.body,"div","ja-entity-row ja-media-main-row"),
      format=fieldSelect(doc,line1,"Type",f["media-format"]||"",[["","—"]].concat((def.formats||[]).map(function(x){return [x,x];}))),
      title=simpleInput(doc,line1,"Titre","text",String(f.label||editTitle||""),"Titre…"),
      creator=simpleInput(doc,line1,meta.creator,"text",f[meta.creatorField]||"","");

  var line2=mk(doc,sh.body,"div","ja-entity-row ja-media-info-row"),
      genres=tagPicker(doc,line2,"Genres",list(f.genres),def.genres||[],"Genre…"),
      year=simpleInput(doc,line2,"Année","number",f["release-year"]||"",""),
      status=fieldSelect(doc,line2,"Statut",f.status||"",[["","—"]].concat((def.statuses||[]).map(function(x){return [x,x];})));

  /* Une seule note à saisir. Le /20 est converti en 10 demi-pas,
     donc en cinq étoiles entières ou demi-étoiles. */
  var ratingRow=mk(doc,sh.body,"div","ja-media-rating-row"),
      rating=simpleInput(doc,ratingRow,"Note","number",f["rating-20"]||"","/20","ja-media-rating-input"),
      ratingVisual=mk(doc,ratingRow,"div","ja-media-rating-visual"),
      ratingStars=mk(doc,ratingVisual,"div","ja-media-rating-stars"),
      ratingCaption=mk(doc,ratingVisual,"span","ja-media-rating-caption","Pas encore noté");
  rating.min="0";rating.max="20";rating.step="0.5";
  function ratingData(){
    if(String(rating.value||"").trim()===""){return {value:null,halfSteps:0,stars:0};}
    var v=parseFloat(String(rating.value||"").replace(",","."));
    if(!isFinite(v)){return {value:null,halfSteps:0,stars:0};}
    v=Math.max(0,Math.min(20,v));
    var halfSteps=Math.max(0,Math.min(10,Math.round(v/2)));
    return {value:v,halfSteps:halfSteps,stars:halfSteps/2};
  }
  function drawRating(){
    var d=ratingData();ratingStars.innerHTML="";
    for(var i=0;i<5;i++){
      var star=mk(doc,ratingStars,"span","ja-media-rating-star"),
          base=mk(doc,star,"span","ja-media-rating-star-base","★"),
          fill=mk(doc,star,"span","ja-media-rating-star-fill","★"),
          left=d.halfSteps-(i*2),pct=left>=2?100:(left===1?50:0);
      fill.style.width=pct+"%";
    }
    ratingCaption.textContent=d.value===null?"Pas encore noté":(String(d.value).replace(".",",")+" / 20 · "+String(d.stars).replace(".",",")+" / 5");
  }
  rating.addEventListener("input",drawRating);rating.addEventListener("change",drawRating);drawRating();

  var extras=mk(doc,sh.body,"div","ja-entity-row ja-media-extra-row"),extraApis={};

  if(mediaType==="book"){
    extraApis.series=simpleInput(doc,extras,"Saga / série","text",f.series||"","");
    extraApis.volume=simpleInput(doc,extras,"Tome","number",f.volume||"","");
  }else if(mediaType==="videogame"){
    extraApis.platforms=tagPicker(doc,extras,"Plateformes",list(f.platforms),def.platforms||[],"Plateforme…");
  }else if(mediaType==="boardgame"){
    extraApis.playersMin=simpleInput(doc,extras,"Joueurs min.","number",f["players-min"]||"","");
    extraApis.playersMax=simpleInput(doc,extras,"Joueurs max.","number",f["players-max"]||"","");
    extraApis.duration=simpleInput(doc,extras,"Durée (min)","number",f["duration-minutes"]||"","");
  }else if(mediaType==="series"){
    extraApis.platform=simpleInput(doc,extras,"Plateforme","text",f["watch-platform"]||"","Netflix, Arte…");
    extraApis.seasons=simpleInput(doc,extras,"Saisons","number",f.seasons||"","");
  }else if(mediaType==="film"){
    extraApis.duration=simpleInput(doc,extras,"Durée (min)","number",f["duration-minutes"]||"","");
  }else if(mediaType==="music"){
    extraApis.collection=simpleInput(doc,extras,"Album / collection","text",f.collection||"","Facultatif");
  }else{
    extraApis.kind=simpleInput(doc,extras,"Nature","text",f["custom-media-kind"]||"","Podcast, spectacle…");
  }

  if(!extras.children.length){extras.remove();}
  var notes=editor(widget,sh.body,"Notes",f.text||"","Notes sur ce média…");

  sh.save.addEventListener("click",function(){
    var label=title.value.trim();if(!label){title.focus();return;}
    var tid=editTitle||uniqueTitle(widget.wiki,label),fields={
      label:label,"media-type":mediaType,"media-format":format.value||"",
      genres:$tw.utils.stringifyList(genres.value()),
      "release-year":year.value||"",status:status.value||"",
      "rating-20":ratingData().value===null?"":String(ratingData().value),
      text:notes.value()
    };
    fields[meta.creatorField]=creator.value.trim();
    if(extraApis.series){fields.series=extraApis.series.value.trim();}
    if(extraApis.volume){fields.volume=extraApis.volume.value||"";}
    if(extraApis.platforms){fields.platforms=$tw.utils.stringifyList(extraApis.platforms.value());}
    if(extraApis.playersMin){fields["players-min"]=extraApis.playersMin.value||"";}
    if(extraApis.playersMax){fields["players-max"]=extraApis.playersMax.value||"";}
    if(extraApis.duration){fields["duration-minutes"]=extraApis.duration.value||"";}
    if(extraApis.platform){fields["watch-platform"]=extraApis.platform.value.trim();}
    if(extraApis.seasons){fields.seasons=extraApis.seasons.value||"";}
    if(extraApis.collection){fields.collection=extraApis.collection.value.trim();}
    if(extraApis.kind){fields["custom-media-kind"]=extraApis.kind.value.trim();}
    saveTiddler(widget.wiki,old,tid,fields,"Média","media");
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Sommeil                                                             */
/* ------------------------------------------------------------------ */
function openSleep(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      cfg=EConfig.readSleep(widget.wiki),doc=widget.document,
      sh=shell(widget,editTitle?"Modifier le sommeil":"Enregistrer un sommeil",{
        kicker:"Sommeil",icon:"🌙",saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-sleep-form"
      }),
      type=String(f["sleep-type"]||"night"),
      wakeDate=String(f["wake-date"]||f.date||opts.date||today()),
      awakenings=json(f.awakenings,[]),
      quality=String(f["quality-id"]||"");
  attachDelete(widget,sh,editTitle,"ce sommeil","sleep");

  /* Ligne 1 */
  var line1=mk(doc,sh.body,"div","ja-entity-row ja-sleep-main-row"),
      typeApi=Shared.segmented(doc,line1,"Type",type,[["night","Nuit"],["nap","Sieste"],["fragment","Fragment"]]),
      bed=simpleInput(doc,line1,"Couché","time",f.bedtime||"23:00",""),
      wake=simpleInput(doc,line1,"Réveil","time",f["wake-time"]||"07:00","");

  /* Ligne 2 */
  var line2=mk(doc,sh.body,"div","ja-entity-row ja-sleep-latency-row"),
      fall=simpleInput(doc,line2,"Temps pour s’endormir","number",f["sleep-latency-minutes"]||"","min"),
      rise=simpleInput(doc,line2,"Temps pour se réveiller","number",f["wake-latency-minutes"]||"","min");
  fall.min="0";rise.min="0";

  /* Ligne 3 : la même logique visuelle que Mood, mais une échelle sommeil. */
  var qualityBlock=mk(doc,sh.body,"section","ja-sleep-quality-block");
  mk(doc,qualityBlock,"div","ja-agenda-form-label ja-sleep-center-label","Qualité du sommeil");
  var qualityHost=mk(doc,qualityBlock,"div","ja-sleep-quality");
  (cfg.qualities||[]).forEach(function(q){
    var b=button(doc,qualityHost,"ja-sleep-quality-item","",q.label||"");
    b.dataset.id=q.id;b.style.setProperty("--ja-sleep-quality-color",q.color||"var(--ja-accent)");
    var src=q.image?JConfig.imageSrc(widget.wiki,q.image):"";
    if(src){var im=mk(doc,b,"img","ja-sleep-quality-img");im.src=src;im.alt="";}
    else{mk(doc,b,"span","ja-sleep-quality-emoji",q.emoji||"•");}
    mk(doc,b,"span","ja-sleep-quality-label",q.label||q.id);
    b.addEventListener("click",function(){quality=quality===q.id?"":q.id;drawQuality();});
  });
  function drawQuality(){Array.prototype.forEach.call(qualityHost.children,function(b){b.classList.toggle("is-on",b.dataset.id===quality);});}
  drawQuality();

  /* Ligne 4 : réveils nocturnes. */
  var awakeBlock=mk(doc,sh.body,"section","ja-sleep-awake"),
      awakeHead=mk(doc,awakeBlock,"div","ja-entity-section-head");
  mk(doc,awakeHead,"span","ja-agenda-form-label","Réveils nocturnes");
  var addAwake=button(doc,awakeHead,"ja-jform-secondary","＋ Un réveil"),
      awakeList=mk(doc,awakeBlock,"div","ja-sleep-awake-list");
  function awakeRow(item){
    item=item||{};
    var row=mk(doc,awakeList,"div","ja-sleep-awake-row"),
        time=simpleInput(doc,row,"Heure","time",item.time||"",""),
        mins=simpleInput(doc,row,"Éveillé","number",item.minutes||"","min"),
        rm=button(doc,row,"ja-entity-mini-remove","×","Supprimer ce réveil");
    mins.min="0";rm.addEventListener("click",function(){row.remove();calc();});
    time.addEventListener("change",calc);mins.addEventListener("input",calc);
    row._read=function(){return {time:time.value||"",minutes:Math.max(0,parseInt(mins.value||"0",10)||0)};};
  }
  awakenings.forEach(awakeRow);addAwake.addEventListener("click",function(){awakeRow({});});

  /* Ligne 5 : résultat calculé, jamais un champ à corriger à la main. */
  var durationBlock=mk(doc,sh.body,"section","ja-sleep-duration"),
      durationLabel=mk(doc,durationBlock,"span","ja-sleep-duration-label","Durée effective"),
      durationValue=mk(doc,durationBlock,"strong","ja-sleep-duration-value","—"),
      durationHint=mk(doc,durationBlock,"span","ja-sleep-duration-hint","Hors endormissement et temps éveillé."),
      currentDuration=0;

  function readAwakenings(){
    var out=[];Array.prototype.forEach.call(awakeList.children,function(r){if(r._read){var x=r._read();if(x.time||x.minutes){out.push(x);}}});return out;
  }
  function calc(){
    var a=minutes(bed.value),b=minutes(wake.value);
    if(a===null||b===null){currentDuration=0;durationValue.textContent="—";return;}
    var span=b-a;if(span<=0){span+=1440;}
    var latency=Math.max(0,parseInt(fall.value||"0",10)||0),
        awake=readAwakenings().reduce(function(n,x){return n+(x.minutes||0);},0);
    currentDuration=Math.max(0,span-latency-awake);
    durationValue.textContent=fmtDuration(currentDuration);
    var afterWake=Math.max(0,parseInt(rise.value||"0",10)||0);
    durationHint.textContent="Au lit jusqu’au réveil : "+fmtDuration(span)+" · hors sommeil : "+fmtDuration(latency+awake)+
      (afterWake?" · "+fmtDuration(afterWake)+" après le réveil, non compté.":".");
  }
  [bed,wake,fall,rise].forEach(function(i){i.addEventListener("input",calc);i.addEventListener("change",calc);});
  calc();

  sh.save.addEventListener("click",function(){
    if(!bed.value){bed.focus();return;}if(!wake.value){wake.focus();return;}
    calc();
    var sleepType=typeApi.value(),bedDate=wakeDate,
        bm=minutes(bed.value),wm=minutes(wake.value);
    if(bm!==null&&wm!==null&&wm<=bm){bedDate=addDays(wakeDate,-1);}
    var q=EConfig.sleepQuality(cfg,quality),label=(sleepType==="night"?"Nuit":sleepType==="nap"?"Sieste":"Fragment")+" · "+wakeDate,
        title=editTitle||uniqueTitle(widget.wiki,label);
    saveTiddler(widget.wiki,old,title,{
      label:label,
      "sleep-type":sleepType,
      date:wakeDate,
      "wake-date":wakeDate,
      "bed-date":bedDate,
      "journal-close-date":addDays(wakeDate,-1),
      "journal-open-date":wakeDate,
      bedtime:bed.value,
      "wake-time":wake.value,
      "out-of-bed-time":addMinutesTime(wake.value,rise.value),
      "sleep-latency-minutes":String(Math.max(0,parseInt(fall.value||"0",10)||0)),
      "wake-latency-minutes":String(Math.max(0,parseInt(rise.value||"0",10)||0)),
      awakenings:JSON.stringify(readAwakenings()),
      "quality-id":quality,
      "quality-value":q?String(q.value):"",
      "quality-label":q?String(q.label||""):"",
      "quality-emoji":q?String(q.emoji||""):"",
      "quality-image":q?String(q.image||""):"",
      "duration-minutes":String(currentDuration)
    },"Sommeil","sleep-entry");
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Rêve : volontairement minimal pour cette étape                      */
/* ------------------------------------------------------------------ */
function openDream(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||"",old=editTitle?widget.wiki.getTiddler(editTitle):null,f=old?old.fields:{},
      doc=widget.document,
      sh=shell(widget,editTitle?"Modifier le rêve":"Nouveau rêve",{
        kicker:"Sommeil · Rêve",icon:"💭",saveLabel:editTitle?"Enregistrer":"Créer",modalClass:"ja-dream-form"
      }),
      line=mk(doc,sh.body,"div","ja-entity-row"),
      title=simpleInput(doc,line,"Titre","text",String(f.label||editTitle||""),"Titre du rêve…"),
      notes=editor(widget,sh.body,"Notes",f.text||"","Ce dont je me souviens…"),
      audioState={audios:Media.parseJsonList(f.audios||"")};
  attachDelete(widget,sh,editTitle,"ce rêve","sleep");

  var audioBlock=mk(doc,sh.body,"section","ja-dream-audio");
  Shared.audioField(widget,audioBlock,audioState);

  sh.save.addEventListener("click",function(){
    var label=title.value.trim();if(!label){title.focus();return;}
    var tid=editTitle||uniqueTitle(widget.wiki,label);
    saveTiddler(widget.wiki,old,tid,{
      label:label,date:String(f.date||opts.date||today()),
      text:notes.value(),audios:Media.stringifyJsonList(audioState.audios)
    },"Sommeil","dream");
    sh.setClean();sh.close();
  });
}

exports.openPerson=openPerson;
exports.openPlace=openPlace;
exports.openActivity=openActivity;
exports.openMedia=openMedia;
exports.openSleep=openSleep;
exports.openDream=openDream;
