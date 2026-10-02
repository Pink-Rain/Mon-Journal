/*\
title: $:/journalapp/modules/lib/agenda-forms.js
type: application/javascript
module-type: library

Mon Journal — formulaires Agenda.

Principe unique : tout ce qui existe déjà dans le formulaire Daily est
RÉUTILISÉ, pas réécrit. Les images/fonds, l'audio, les liens et la note
riche viennent littéralement des méthodes du widget Journal. Les champs
de contexte s'ouvrent un par un via le ＋, comme dans le Daily.
\*/
"use strict";

var Agenda=require("$:/journalapp/modules/lib/agenda.js");
var Entities=require("$:/journalapp/modules/lib/entities.js");
var JConfig=require("$:/journalapp/modules/lib/jconfig.js");
var Media=require("$:/journalapp/modules/lib/jmedia.js");
var RelationModes=require("$:/journalapp/modules/lib/relation-modes.js");

/* Le widget Journal est requis paresseusement : zéro risque d'ordre de chargement. */
var _JW=null;
function JW(){
  if(!_JW){try{_JW=require("$:/journalapp/modules/widgets/journal.js").jajournal;}catch(e){_JW=null;}}
  return _JW;
}
/* Hôte minimal pour emprunter les constructeurs de champs du Daily. */
/*
  Hôte minimal pour emprunter les constructeurs de champs du Daily.
  Les quatre méthodes empruntées ne touchent que ces cinq membres —
  vérifié en auditant leurs corps, pas en le supposant : buildImagesField
  veut cfg/document/pickFiles/wiki, buildAudioField veut document/
  fileButton/wiki, buildLinksField et buildNoteEditor seulement document.
  fileButton manquait, et l'ouverture du champ Audio plantait net.
*/
function dailyHost(widget){
  var W=JW(),host={
    wiki:widget.wiki,
    document:widget.document,
    cfg:JConfig.read(widget.wiki)
  };
  if(W){
    ["pickFiles","fileButton"].forEach(function(m){
      if(typeof W.prototype[m]==="function"){host[m]=W.prototype[m];}
    });
  }
  return host;
}
function borrow(widget,method,parent,state){
  var W=JW();
  if(!W||typeof W.prototype[method]!=="function"){return null;}
  try{
    return W.prototype[method].call(dailyHost(widget),parent,state);
  }catch(e){
    /* Un champ qui casse ne doit pas emporter le formulaire entier :
       on le dit à l'écran et le reste continue de fonctionner. */
    var doc=widget.document,box=doc.createElement("div");
    box.className="ja-agenda-form-hint";
    box.textContent="Ce champ n’a pas pu s’ouvrir ("+(e&&e.message?e.message:"erreur")+").";
    parent.appendChild(box);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Petits utilitaires                                                  */
/* ------------------------------------------------------------------ */
function mk(doc,p,tag,cls,text){var e=doc.createElement(tag);if(cls){e.className=cls;}if(text!==undefined){e.textContent=text;}if(p){p.appendChild(e);}return e;}
function btn(doc,p,cls,text,title){var b=mk(doc,p,"button",cls,text);b.type="button";if(title){b.title=title;b.setAttribute("aria-label",title);}return b;}
function list(v){return Agenda.parseList(v);}
function json(v,f){return Agenda.parseJson(v,f);}
function unique(v){return Entities.uniqueStrings(v||[]);}
function yes(v){return v===true||String(v||"").toLowerCase()==="yes"||String(v||"")==="1";}
function today(){return Agenda.todayIso();}
function iconFor(kind){return kind==="todo"?"☑":kind==="habit"?"↻":kind==="slot"?"▥":kind==="vacation"?"🌿":"📅";}
function fieldNameForDaily(kind){return kind==="todo"?"todos":kind==="habit"?"habits":"events";}
function displayTitle(t,title){return t&&t.fields?String(t.fields.label||t.fields.titre||title):title;}
function agendaTags(t){var a=t?Agenda.tagsOf(t):[];if(a.indexOf("Agenda")===-1){a.push("Agenda");}return a;}

/* ------------------------------------------------------------------ */
/* Coquille de modale (identique au Daily)                             */
/* ------------------------------------------------------------------ */
function cleanupModal(doc,overlay,cleanups){(cleanups||[]).forEach(function(fn){try{fn();}catch(e){}});overlay.remove();}

function shell(widget,title,kind,opts){
  opts=opts||{};
  var doc=widget.document,
      overlay=mk(doc,doc.body,"div","ja-jform-overlay ja-agenda-form-overlay"),
      modal=mk(doc,overlay,"div","ja-jform-modal ja-agenda-shared-form ja-agenda-form-"+kind),
      cleanups=[];
  if(opts.modalClass){String(opts.modalClass).split(/\s+/).filter(Boolean).forEach(function(cls){modal.classList.add(cls);});}
  var head=mk(doc,modal,"div","ja-jform-head"),left=mk(doc,head,"div","ja-agenda-form-heading"),
      kickerIcon=opts.icon===undefined?iconFor(kind):String(opts.icon||""),
      kickerText=opts.kicker===undefined?"Agenda":String(opts.kicker||"");
  mk(doc,left,"div","ja-agenda-form-kicker",(kickerIcon?kickerIcon+" ":"")+kickerText);
  mk(doc,left,"h2","ja-jform-title",title);
  var actions=mk(doc,head,"div","ja-jform-headactions"),
      close=btn(doc,actions,"ja-jform-secondary","Annuler"),
      save=btn(doc,actions,"ja-jform-save",opts.saveLabel||"Enregistrer");
  var body=mk(doc,modal,"div","ja-jform-body ja-agenda-form-body"),dirty=false;
  function askClose(){if(dirty&&!window.confirm("Fermer sans enregistrer ?")){return;}cleanupModal(doc,overlay,cleanups);}
  close.addEventListener("click",askClose);
  overlay.addEventListener("mousedown",function(e){if(e.target===overlay){askClose();}});
  body.addEventListener("input",function(){dirty=true;});
  body.addEventListener("change",function(){dirty=true;});
  body.addEventListener("click",function(e){if(e.target.closest("button")){dirty=true;}});
  var esc=function(e){
    if(e.key==="Escape"){askClose();}
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();save.click();}
  };
  doc.addEventListener("keydown",esc,true);
  cleanups.push(function(){doc.removeEventListener("keydown",esc,true);});
  return {doc:doc,overlay:overlay,modal:modal,body:body,head:head,headActions:actions,save:save,
          close:askClose,cleanups:cleanups,setClean:function(){dirty=false;}};
}

function formPopover(doc,anchor,items,cleanups){
  var old=doc.querySelector(".ja-pop.ja-agenda-form-pop");if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop ja-agenda-form-pop"),rect=anchor.getBoundingClientRect();
  (items||[]).forEach(function(item){
    if(item.sep){mk(doc,pop,"div","ja-pop-sep");return;}
    var b=btn(doc,pop,"ja-pop-item",item.label);
    b.addEventListener("click",function(){close();item.run();});
  });
  var w=doc.documentElement.clientWidth,h=doc.documentElement.clientHeight,
      left=Math.max(8,Math.min(rect.right-pop.offsetWidth,w-200)),
      top=rect.top-pop.offsetHeight-7;
  if(top<8){top=Math.min(h-pop.offsetHeight-8,rect.bottom+7);}
  pop.style.left=Math.max(8,left)+"px";pop.style.top=Math.max(8,top)+"px";
  function close(){if(pop&&pop.parentNode){pop.remove();}doc.removeEventListener("mousedown",away,true);}
  function away(e){if(pop&&!pop.contains(e.target)&&e.target!==anchor){close();}}
  setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
  if(cleanups){cleanups.push(close);}
  return pop;
}

/* Menu de type graphique.
   Contrairement au popover texte générique, il affiche réellement
   les SVG Lucide / images configurées dans Settings. */
function eventTypePopover(widget,anchor,items,onPick,cleanups){
  var doc=widget.document,
      old=doc.querySelector(".ja-pop.ja-agenda-form-pop");
  if(old){old.remove();}

  var pop=mk(doc,doc.body,"div","ja-pop ja-agenda-form-pop ja-eventtype-pop"),
      rect=anchor.getBoundingClientRect();

  (items||[]).forEach(function(item){
    var b=btn(doc,pop,"ja-pop-item ja-eventtype-pop-item","");
    var src=item.image?JConfig.imageSrc(widget.wiki,String(item.image||"")):"";

    if(src){
      var im=mk(doc,b,"img","ja-eventtype-pop-icon");
      im.src=src;im.alt="";
    }else{
      mk(doc,b,"span","ja-eventtype-pop-icon is-emoji",
         String(item.icon||"📅"));
    }

    mk(doc,b,"span","ja-eventtype-pop-label",String(item.label||"Sans type"));

    if(item.color){
      b.style.setProperty("--ja-type-color",item.color);
    }
    b.addEventListener("click",function(){
      close();
      onPick(item);
    });
  });

  var vw=doc.documentElement.clientWidth,
      vh=doc.documentElement.clientHeight,
      left=Math.max(8,Math.min(rect.left,vw-pop.offsetWidth-8)),
      top=rect.bottom+7;

  if(top+pop.offsetHeight>vh-8){
    top=Math.max(8,rect.top-pop.offsetHeight-7);
  }
  pop.style.left=Math.round(left)+"px";
  pop.style.top=Math.round(top)+"px";

  function close(){
    if(pop&&pop.parentNode){pop.remove();}
    doc.removeEventListener("mousedown",away,true);
  }
  function away(e){
    if(pop&&!pop.contains(e.target)&&e.target!==anchor){close();}
  }
  setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
  if(cleanups){cleanups.push(close);}
  return pop;
}


/* Bloc dépliable amovible — exactement celui du Daily. */
function extraBlock(doc,parent,icon,title){
  var block=mk(doc,parent,"div","ja-jextra is-open"),
      head=mk(doc,block,"div","ja-jextra-head"),
      fold=btn(doc,head,"ja-jextra-fold","›","Replier");
  mk(doc,head,"span","ja-jextra-ico",icon||"•");
  mk(doc,head,"span","ja-jextra-title",title);
  var kill=btn(doc,head,"ja-jextra-x","×","Retirer ce champ"),
      body=mk(doc,block,"div","ja-jextra-body");
  function toggle(){block.classList.toggle("is-open");}
  fold.addEventListener("click",toggle);
  head.addEventListener("click",function(e){
    if(e.target===kill||kill.contains(e.target)||e.target===fold){return;}
    toggle();
  });
  return {block:block,body:body,kill:kill};
}

/* ------------------------------------------------------------------ */
/* Contrôles de base                                                   */
/* ------------------------------------------------------------------ */
function input(doc,parent,label,type,value,placeholder){
  var w=mk(doc,parent,"label","ja-agenda-form-field");
  if(label){mk(doc,w,"span","ja-agenda-form-label",label);}
  var i=mk(doc,w,type==="textarea"?"textarea":"input","ja-jform-input ja-agenda-form-input");
  if(type!=="textarea"){i.type=type||"text";}
  i.value=value||"";
  if(placeholder){i.placeholder=placeholder;}
  return i;
}
function select(doc,parent,label,value,options){
  var w=mk(doc,parent,"label","ja-agenda-form-field");
  if(label){mk(doc,w,"span","ja-agenda-form-label",label);}
  var s=mk(doc,w,"select","ja-jform-input ja-agenda-form-input");
  (options||[]).forEach(function(o){var op=mk(doc,s,"option","",o[1]);op.value=o[0];if(String(o[0])===String(value||"")){op.selected=true;}});
  return s;
}
function check(doc,parent,label,value){
  var w=mk(doc,parent,"label","ja-agenda-form-check"),c=mk(doc,w,"input","");
  c.type="checkbox";c.checked=!!value;mk(doc,w,"span","",label);
  return c;
}
function row(doc,parent,cls){return mk(doc,parent,"div","ja-agenda-form-row"+(cls?" "+cls:""));}
function segmented(doc,parent,label,value,options,onChange){
  var wrap=mk(doc,parent,"div","ja-af-seg-field");
  if(label){mk(doc,wrap,"span","ja-agenda-form-label",label);}
  var host=mk(doc,wrap,"div","ja-af-seg"),cur=String(value||options[0][0]);
  function draw(){Array.prototype.forEach.call(host.children,function(c){c.classList.toggle("is-on",c.dataset.v===cur);});}
  options.forEach(function(o){
    var b=btn(doc,host,"ja-af-seg-item",o[1]);
    b.dataset.v=String(o[0]);
    b.addEventListener("click",function(){cur=String(o[0]);draw();if(onChange){onChange(cur);}});
  });
  draw();
  return {value:function(){return cur;},set:function(v){cur=String(v||"");draw();}};
}

/* Type d'événement en pastilles colorées, plus de <select> triste. */
function typePicker(widget,parent,value,onChange){
  var doc=widget.document,cfg=Agenda.readConfig(widget.wiki),
      wrap=mk(doc,parent,"div","ja-af-pickrow");
  mk(doc,wrap,"span","ja-agenda-form-label","Type");
  var host=mk(doc,wrap,"div","ja-af-pick"),cur=String(value||"");
  function draw(){Array.prototype.forEach.call(host.children,function(c){c.classList.toggle("is-on",String(c.dataset.id||"")===cur);});}
  [{id:"",label:"Sans type",icon:"∅"}].concat(cfg.eventTypes||[]).forEach(function(x){
    var b=btn(doc,host,"ja-af-pill",(x.icon?x.icon+" ":"")+x.label);
    b.dataset.id=x.id||"";
    if(x.color){b.style.setProperty("--ja-pill-col",x.color);}
    b.addEventListener("click",function(){cur=(cur===x.id)?"":String(x.id||"");draw();if(onChange){onChange(cur);}});
  });
  draw();
  return {value:function(){return cur;}};
}

/* Marqueurs — les mêmes glyphes que le Journal, même DA. */
function markerPicker(widget,parent,value,onChange,opts){
  opts=opts||{};
  var doc=widget.document,cfg=JConfig.read(widget.wiki),
      wrap=mk(doc,parent,"div","ja-af-pickrow"+(opts.compact?" ja-ae-marker-wrap":""));
  if(opts.label!==false){mk(doc,wrap,"span","ja-agenda-form-label","Marqueur");}
  var r=mk(doc,wrap,"div","ja-jmarkers ja-agenda-marker-picker"),cur=value||"";
  function draw(){Array.prototype.forEach.call(r.children,function(c){c.classList.toggle("is-selected",String(c.dataset.id||"")===String(cur));});}
  (cfg.markers||[]).forEach(function(m){
    var b=btn(doc,r,"ja-jmarker","",m.label||"");
    b.dataset.id=m.id;
    if(m.image){var im=mk(doc,b,"img","ja-jmarker-img");im.src=JConfig.imageSrc(widget.wiki,m.image);im.alt="";}
    else{mk(doc,b,"span","",m.emoji||"•");}
    if(m.color){b.style.setProperty("--ja-flag-col",m.color);}
    b.addEventListener("click",function(){cur=cur===m.id?"":m.id;draw();onChange(cur);});
  });
  draw();
  return {value:function(){return cur;}};
}

/* ------------------------------------------------------------------ */
/* Ligne de date : la date est là, le reste s'ajoute au ＋              */
/* ------------------------------------------------------------------ */
function dateLine(widget,parent,state,opts){
  opts=opts||{};
  var doc=widget.document,
      wrap=mk(doc,parent,"div","ja-af-dateline"),
      main=mk(doc,wrap,"div","ja-af-dateline-main"),
      addHost=mk(doc,wrap,"div","ja-af-dateline-add"),
      bits={},api={};

  mk(doc,main,"span","ja-agenda-form-label",opts.dateLabel||"Date");
  var date=mk(doc,main,"input","ja-jform-input ja-jform-date");
  date.type="date";date.value=state[opts.dateKey||"date"]||today();

  function bit(key,label,type,value,after){
    if(bits[key]){bits[key].input.focus();return bits[key];}
    var host=mk(doc,main,"span","ja-af-bit");
    if(label){mk(doc,host,"span","ja-af-bit-lab",label);}
    var i=mk(doc,host,"input","ja-jform-input "+(type==="time"?"ja-jform-time":"ja-jform-date"));
    i.type=type;i.value=value||"";
    btn(doc,host,"ja-af-bit-x","×","Retirer").addEventListener("click",function(){
      host.remove();delete bits[key];drawAdd();
    });
    bits[key]={host:host,input:i};
    drawAdd();
    if(after!==false){i.focus();}
    return bits[key];
  }

  var offers=opts.offers||[];
  function drawAdd(){
    addHost.innerHTML="";
    offers.forEach(function(o){
      if(bits[o.key]){return;}
      var b=btn(doc,addHost,"ja-af-add","＋ "+o.label,o.title||("Ajouter "+o.label));
      b.addEventListener("click",function(){bit(o.key,o.inlineLabel||"",o.type,o.seed?o.seed():"");});
    });
  }
  drawAdd();

  api.date=function(){return date.value||"";};
  api.get=function(key){return bits[key]?(bits[key].input.value||""):"";};
  api.open=function(key,value){
    var o=null;offers.forEach(function(x){if(x.key===key){o=x;}});
    if(!o){return;}
    bit(key,o.inlineLabel||"",o.type,value||"",false);
  };
  api.dateInput=date;
  return api;
}

/* ------------------------------------------------------------------ */
/* Champs liés — un par un, comme dans le Daily                        */
/* ------------------------------------------------------------------ */
function tokenField(widget,parent,type,initial,opts){
  opts=opts||{};
  var doc=widget.document,
      box=mk(doc,parent,"div","ja-jtokenfield"),
      chips=mk(doc,box,"div","ja-jtoken-chips"),
      inp=mk(doc,box,"input","ja-jtoken-search"),
      menu=mk(doc,box,"div","ja-jtoken-menu"),
      values=unique(initial||[]),
      meta=Object.create(null),
      items=[],active=-1,timer=null;
  inp.type="text";
  inp.placeholder=opts.placeholder||(Entities.DEFINITIONS[type]&&Entities.DEFINITIONS[type].placeholder)||"Rechercher…";

  function norm(v){return Entities.normalize(v);}
  function has(v){return values.some(function(x){return norm(x)===norm(v);});}
  function drawChips(){
    chips.innerHTML="";
    values.forEach(function(v,i){
      if(type==="person"&&opts.relationModes){
        RelationModes.renderPerson(doc,chips,v,opts.relationModes,function(){
          values.splice(i,1);
          drawChips();
        });
        return;
      }
      var c=mk(doc,chips,"span","ja-jtoken-chip");
      mk(doc,c,"span","ja-jtoken-label",opts.labelFor?opts.labelFor(v):v);
      btn(doc,c,"ja-jtoken-x","×","Retirer").addEventListener("click",function(){values.splice(i,1);drawChips();});
    });
  }
  function close(){menu.innerHTML="";menu.classList.remove("is-open");items=[];active=-1;}
  function add(v,extra){
    v=String(v||"").trim();
    if(!v||has(v)){inp.value="";close();return;}
    values.push(v);
    if(extra){meta[v]=extra;}
    drawChips();inp.value="";close();inp.focus();
  }
  function drawMenu(found,q){
    items=(found||[]).filter(function(x){return !has(x.value);});
    if(opts.free!==false&&q&&!items.some(function(x){return norm(x.value)===norm(q);})&&!has(q)){
      items.push({value:q,label:"＋ "+q});
    }
    items=items.slice(0,12);menu.innerHTML="";
    items.forEach(function(it){
      var b=btn(doc,menu,"ja-jtoken-suggestion",it.label||it.value);
      if(it.source){mk(doc,b,"span","ja-jtoken-src",it.source);}
      b.addEventListener("mousedown",function(e){e.preventDefault();});
      b.addEventListener("click",function(){
        var extra=null;
        if(it.address||it.latitude!=null||it.longitude!=null){
          extra={address:it.address||"",
                 latitude:it.latitude!=null?String(it.latitude):"",
                 longitude:it.longitude!=null?String(it.longitude):""};
        }
        add(it.value,extra);
      });
    });
    menu.classList.toggle("is-open",!!items.length);
  }
  function search(){
    var q=inp.value.trim();
    if(opts.search){Promise.resolve(opts.search(q)).then(function(r){drawMenu(r,q);});return;}
    var local=Entities.localSuggestions(widget.wiki,type,q);
    drawMenu(local,q);
    /* Recherche adresse en ligne : IGN + Photon, comme le lieu du Daily.
       (l'ancien code appelait mergeSuggestions(local,remote) — mauvaise
       signature, les résultats distants étaient purement jetés.) */
    if(type==="place"&&q.length>=2){
      clearTimeout(timer);
      timer=setTimeout(function(){
        Entities.fetchPlaceSuggestions(q).then(function(remote){
          if(inp.value.trim()!==q){return;}
          drawMenu(Entities.mergeSuggestions([local,remote]),q);
        }).catch(function(){});
      },200);
    }
  }
  inp.addEventListener("focus",search);
  inp.addEventListener("input",search);
  inp.addEventListener("keydown",function(e){
    if(e.key==="Escape"){close();return;}
    if(e.key==="Enter"||e.key===","||e.key===";"){
      e.preventDefault();
      if(active>=0&&items[active]){add(items[active].value);}else{add(inp.value);}
      return;
    }
    if(e.key==="Backspace"&&!inp.value&&values.length){var gone=values.pop();if(type==="person"&&opts.relationModes){RelationModes.remove(opts.relationModes,gone);}drawChips();return;}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      e.preventDefault();
      var bs=menu.querySelectorAll(".ja-jtoken-suggestion");
      if(!bs.length){return;}
      active=e.key==="ArrowDown"?(active+1)%bs.length:(active<=0?bs.length-1:active-1);
      Array.prototype.forEach.call(bs,function(b,i){b.classList.toggle("is-active",i===active);});
    }
  });
  var away=function(e){if(!box.contains(e.target)){close();}};
  widget.document.addEventListener("mousedown",away,true);
  if(opts.cleanups){opts.cleanups.push(function(){widget.document.removeEventListener("mousedown",away,true);});}

  drawChips();
  return {
    values:function(){if(inp.value.trim()){add(inp.value);}return values.slice();},
    meta:function(){return meta;},
    clear:function(){values.length=0;drawChips();}
  };
}

function freeListField(doc,parent,initial,placeholder){
  var vals=unique(initial||[]),
      tf=mk(doc,parent,"div","ja-jtokenfield"),
      chips=mk(doc,tf,"div","ja-jtoken-chips"),
      inp=mk(doc,tf,"input","ja-jtoken-search");
  inp.placeholder=placeholder||"Ajouter…";
  function draw(){
    chips.innerHTML="";
    vals.forEach(function(v,i){
      var c=mk(doc,chips,"span","ja-jtoken-chip");
      mk(doc,c,"span","ja-jtoken-label",v);
      btn(doc,c,"ja-jtoken-x","×").addEventListener("click",function(){vals.splice(i,1);draw();});
    });
  }
  function add(){var v=inp.value.trim();if(v&&vals.indexOf(v)===-1){vals.push(v);}inp.value="";draw();}
  inp.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key===","||e.key===";"){e.preventDefault();add();}
    if(e.key==="Backspace"&&!inp.value&&vals.length){vals.pop();draw();}
  });
  draw();
  return {values:function(){if(inp.value.trim()){add();}return vals.slice();}};
}

function dailyField(widget,parent,initial,cleanups){
  function search(q){
    var out=[],n=Entities.normalize(q);
    widget.wiki.each(function(t,title){
      if(!Agenda.isDaily(t)){return;}
      var f=t.fields,
          label=(f.date||"")+" "+(f.time||"")+" · "+Agenda.noteToPlainText(f.text||title,widget.document).slice(0,55);
      if(!n||Entities.normalize(label+" "+title).indexOf(n)!==-1){out.push({value:title,label:label});}
    });
    out.sort(function(a,b){return b.label.localeCompare(a.label);});
    return out.slice(0,40);
  }
  return tokenField(widget,parent,"daily",initial,{
    free:false,search:search,cleanups:cleanups,
    placeholder:"Chercher une entrée Daily…",
    labelFor:function(title){
      var t=widget.wiki.getTiddler(title);
      return t?(String(t.fields.date||"")+" "+String(t.fields.time||"")):title;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Répétition, effort, check-lists                                     */
/* ------------------------------------------------------------------ */
function recurrenceEditor(doc,parent,state,baseKey,opts){
  opts=opts||{};
  var box=parent,
      enabled=null,
      details=null,
      r=state.recurrence||{frequency:"week",interval:1,start:state[baseKey]||today(),weekdays:[]};
  if(!opts.force){enabled=check(doc,box,"Se répète",!!state.recurrence);}
  details=mk(doc,box,"div","ja-agenda-recurrence-editor");
  function on(){return opts.force?true:enabled.checked;}
  function render(){
    details.innerHTML="";
    details.classList.toggle("is-hidden",!on());
    if(!on()){state.recurrence=null;return;}
    state.recurrence=r;
    r.start=r.start||state[baseKey]||today();
    var rr=row(doc,details);
    var f=select(doc,rr,"Fréquence",r.frequency||"week",[["day","Jour"],["week","Semaine"],["month","Mois"],["year","Année"]]);
    var it=input(doc,rr,"Tous les","number",String(r.interval||1));
    it.min="1";
    f.addEventListener("change",function(){r.frequency=f.value;render();});
    it.addEventListener("input",function(){r.interval=Math.max(1,+it.value||1);});
    if((r.frequency||"week")==="week"){
      var days=mk(doc,details,"div","ja-agenda-weekdays"),chosen=(r.weekdays||[]).map(Number);
      ["L","M","M","J","V","S","D"].forEach(function(n,i){
        var b=btn(doc,days,"ja-agenda-weekday"+(chosen.indexOf(i)!==-1?" is-selected":""),n);
        b.addEventListener("click",function(){
          var x=chosen.indexOf(i);
          if(x===-1){chosen.push(i);}else{chosen.splice(x,1);}
          chosen.sort();r.weekdays=chosen;render();
        });
      });
    }
    var dr=row(doc,details),
        start=input(doc,dr,"Début de série","date",r.start||state[baseKey]||today()),
        end=input(doc,dr,"Fin (optionnelle)","date",r.end||"");
    start.addEventListener("input",function(){r.start=start.value;});
    end.addEventListener("input",function(){r.end=end.value;});
    var cnt=input(doc,details,"Nombre maximum d’occurrences","number",r.count==null?"":String(r.count));
    cnt.min="1";cnt.placeholder="Sans limite";
    cnt.addEventListener("input",function(){r.count=cnt.value?Math.max(1,+cnt.value||1):undefined;});
    if(opts.pauseVacations){
      var pv=check(doc,details,"Suspendre pendant les vacances",!!state.pauseOnVacations);
      pv.addEventListener("change",function(){state.pauseOnVacations=pv.checked;});
    }
  }
  if(enabled){enabled.addEventListener("change",render);}
  render();
  return {values:function(){return state.recurrence;}};
}

function formatMinutes(min){min=Math.max(0,+min||0);var h=Math.floor(min/60),m=min%60;if(!h){return m+" min";}return h+" h"+(m?" "+m+" min":"");}
function effortInput(doc,parent,minutes){
  var w=mk(doc,parent,"div","ja-agenda-form-field ja-agenda-effort-field");
  mk(doc,w,"span","ja-agenda-form-label","Effort estimé");
  var line=mk(doc,w,"div","ja-agenda-effort-input"),
      min=Math.max(0,parseInt(minutes||"0",10)||0),
      unit=(min>=60&&min%60===0)?"h":"min",
      inp=mk(doc,line,"input","ja-jform-input ja-agenda-form-input"),
      sel=mk(doc,line,"select","ja-jform-input ja-agenda-effort-unit");
  inp.type="number";inp.min="0";inp.step=unit==="h"?"0.25":"5";
  inp.value=min?String(unit==="h"?+(min/60).toFixed(2):min):"";
  [["min","min"],["h","h"]].forEach(function(o){var op=mk(doc,sel,"option","",o[1]);op.value=o[0];if(o[0]===unit){op.selected=true;}});
  function value(){var n=parseFloat(String(inp.value||"").replace(",","."));if(!isFinite(n)||n<=0){return "";}return String(Math.round(sel.value==="h"?n*60:n));}
  sel.addEventListener("change",function(){
    var cur=parseInt(value()||"0",10)||0;unit=sel.value;inp.step=unit==="h"?"0.25":"5";
    inp.value=cur?String(unit==="h"?+(cur/60).toFixed(2):cur):"";
  });
  return {wrap:w,input:inp,select:sel,value:value,
          setDisabled:function(v){inp.disabled=!!v;sel.disabled=!!v;w.classList.toggle("is-derived",!!v);}};
}

function checklistEditor(doc,parent,initial,label){
  var vals=(initial||[]).map(function(x){return {text:String(x.text||x.texte||""),done:!!(x.done||x.fait)};}),
      box=mk(doc,parent,"div","ja-agenda-checkedit");
  function draw(){
    box.innerHTML="";
    vals.forEach(function(it,i){
      var r=row(doc,box,"ja-agenda-checkedit-row"),c=mk(doc,r,"input","");
      c.type="checkbox";c.checked=it.done;
      var t=mk(doc,r,"input","ja-jform-input ja-agenda-form-input");
      t.type="text";t.value=it.text;
      var x=btn(doc,r,"ja-jform-danger","×","Retirer");
      c.addEventListener("change",function(){it.done=c.checked;});
      t.addEventListener("input",function(){it.text=t.value;});
      x.addEventListener("click",function(){vals.splice(i,1);draw();});
    });
    btn(doc,box,"ja-jform-secondary","＋ "+(label||"Ajouter")).addEventListener("click",function(){
      vals.push({text:"",done:false});draw();
      var ins=box.querySelectorAll("input[type=text]");
      if(ins.length){ins[ins.length-1].focus();}
    });
  }
  draw();
  return {values:function(){return vals.filter(function(x){return x.text.trim();});}};
}

function progressEditor(doc,parent,initial){
  var vals=(initial||[]).map(function(x){return {date:String(x.date||today()),text:String(x.text||x.texte||"")};}),
      box=mk(doc,parent,"div","ja-agenda-progressedit");
  function draw(){
    box.innerHTML="";
    vals.forEach(function(it,i){
      var r=row(doc,box),
          d=mk(doc,r,"input","ja-jform-input ja-agenda-form-input"),
          t=mk(doc,r,"input","ja-jform-input ja-agenda-form-input");
      d.type="date";d.value=it.date;t.type="text";t.value=it.text;t.placeholder="Progression…";
      btn(doc,r,"ja-jform-danger","×").addEventListener("click",function(){vals.splice(i,1);draw();});
      d.addEventListener("input",function(){it.date=d.value;});
      t.addEventListener("input",function(){it.text=t.value;});
    });
    btn(doc,box,"ja-jform-secondary","＋ Note de progression").addEventListener("click",function(){vals.push({date:today(),text:""});draw();});
  }
  draw();
  return {values:function(){return vals.filter(function(x){return x.text.trim();});}};
}

/* ------------------------------------------------------------------ */
/* Registre des champs optionnels — UNE seule définition pour tous     */
/* ------------------------------------------------------------------ */
var CATALOG={
  recurrence:{icon:"↻",label:"Répétition",group:"temps"},
  effort    :{icon:"⏱",label:"Effort estimé",group:"temps"},
  reminder  :{icon:"⏰",label:"Rappel",group:"temps"},
  countdown :{icon:"⏳",label:"Compte à rebours",group:"temps"},
  projects  :{icon:"🧩",label:"Projets",group:"liens",ent:"project"},
  people    :{icon:"👤",label:"Relations",group:"liens",ent:"person"},
  places    :{icon:"📍",label:"Lieux",group:"liens",ent:"place"},
  activities:{icon:"🏃",label:"Activités",group:"liens",ent:"activity"},
  events    :{icon:"📅",label:"Événements",group:"liens",ent:"event"},
  todos     :{icon:"☑",label:"To-dos",group:"liens",ent:"todo"},
  habits    :{icon:"↻",label:"Habitudes",group:"liens",ent:"habit"},
  media     :{icon:"🎞️",label:"Médias",group:"liens",ent:"media"},
  sleep     :{icon:"🌙",label:"Sommeil",group:"liens",ent:"sleep"},
  channels  :{icon:"📡",label:"Canaux",group:"liens"},
  dreams    :{icon:"💭",label:"Rêves",group:"liens"},
  dailyLinks:{icon:"↔",label:"Entrées Daily",group:"liens"},
  todoTags  :{icon:"🏷️",label:"Étiquettes",group:"liens"},
  note      :{icon:"📝",label:"Note",group:"contenu"},
  checklist :{icon:"☑",label:"Check-list",group:"contenu"},
  progress  :{icon:"✎",label:"Progression",group:"contenu"},
  subtasks  :{icon:"↳",label:"Sous-tâches",group:"contenu"},
  images    :{icon:"🖼️",label:"Images & fond",group:"media"},
  audios    :{icon:"🎙️",label:"Audio",group:"media"},
  links     :{icon:"🔗",label:"Liens",group:"media"}
};
var GROUP_ORDER=["temps","liens","contenu","media"];

/*
  Gestionnaire de champs : un bloc par champ, ajouté au ＋, retirable au ×.
  C'est le comportement du Daily, appliqué à TOUS les objets Agenda.
*/
function fieldManager(widget,sh,state,keys,ctx){
  ctx=ctx||{};
  var doc=sh.doc,
      host=mk(doc,sh.body,"div","ja-jextras ja-agenda-extras"),
      open=Object.create(null),
      api=Object.create(null);

  function build(key,body){
    var def=CATALOG[key];
    switch(key){
      case "recurrence":
        return recurrenceEditor(doc,body,state,ctx.recurrenceBase||"date",{force:!!ctx.forceRecurrence,pauseVacations:ctx.pauseVacations!==false});
      case "effort":
        var eff=effortInput(doc,body,state.duration);
        return {values:function(){return eff.value();}};
      case "reminder":
        var rem=input(doc,body,"Heure du rappel","time",state.reminderTime);
        return {values:function(){return rem.value||"";}};
      case "countdown":
        var cd=check(doc,body,"Afficher le compte à rebours dans les vues",state.countdown);
        return {values:function(){return !!cd.checked;}};
      case "note":
        var ed=borrow(widget,"buildNoteEditor",body,state);
        if(ed){return {values:function(){return ed.value();}};}
        var ta=input(doc,body,"","textarea",state.note,"Note…");
        return {values:function(){return ta.value;}};
      case "checklist":
        return checklistEditor(doc,body,state.checklist,ctx.checklistLabel||"Point");
      case "progress":
        return progressEditor(doc,body,state.progress);
      case "images":
        borrow(widget,"buildImagesField",body,state);
        return {values:function(){return state.images;}};
      case "audios":
        borrow(widget,"buildAudioField",body,state);
        return {values:function(){return state.audios;}};
      case "links":
        borrow(widget,"buildLinksField",body,state);
        return {values:function(){return state.links;}};
      case "dailyLinks":
        return dailyField(widget,body,state.dailyLinks,sh.cleanups);
      case "channels":
        return freeListField(doc,body,state.channels,"IRL, téléphone, Discord…");
      case "dreams":
        return freeListField(doc,body,state.dreams,"Rêve lié…");
      case "todoTags":
        return freeListField(doc,body,state.todoTags,"Maison, urgent…");
      case "subtasks":
        return ctx.buildSubtasks?ctx.buildSubtasks(body):{values:function(){return null;}};
      default:
        if(def&&def.ent){
          return tokenField(widget,body,def.ent,state[key],{cleanups:sh.cleanups,relationModes:key==="people"?state.relationModes:null});
        }
        return {values:function(){return null;}};
    }
  }

  function openField(key){
    if(open[key]||!CATALOG[key]||keys.indexOf(key)===-1){return;}
    var def=CATALOG[key],box=extraBlock(doc,host,def.icon,def.label);
    open[key]=box;
    api[key]=build(key,box.body);
    box.kill.addEventListener("click",function(){
      /* on vide vraiment la valeur : retirer le champ, c'est le supprimer */
      if(key==="images"||key==="audios"||key==="links"){state[key]=[];}
      else if(key==="note"){state.note="";}
      else if(key==="recurrence"){state.recurrence=null;state.pauseOnVacations=false;}
      else if(key==="countdown"){state.countdown=false;}
      else if(key==="effort"){state.duration="";}
      else if(key==="reminder"){state.reminderTime="";}
      else if(Array.isArray(state[key])){state[key]=[];}
      if(key==="people"){state.relationModes=RelationModes.empty();}
      box.block.remove();delete open[key];delete api[key];
    });
  }

  function mountFab(){
    var fab=btn(doc,sh.modal,"ja-jfab ja-af-fab","＋","Ajouter un champ");
    fab.addEventListener("click",function(){
      var items=[],lastGroup=null;
      GROUP_ORDER.forEach(function(g){
        keys.forEach(function(k){
          var def=CATALOG[k];
          if(!def||def.group!==g||open[k]){return;}
          if(lastGroup&&lastGroup!==g&&items.length){items.push({sep:true});lastGroup=g;}
          if(!lastGroup){lastGroup=g;}
          items.push({label:def.icon+"  "+def.label,run:function(){openField(k);}});
        });
      });
      if(!items.length){items.push({label:"Tout est déjà là.",run:function(){}});}
      formPopover(doc,fab,items,sh.cleanups);
    });
    return fab;
  }

  return {open:openField,api:api,mountFab:mountFab,isOpen:function(k){return !!open[k];}};
}

/* Récupère dans state tout ce que les champs ouverts contiennent. */
function pullFields(fm,state){
  Object.keys(fm.api).forEach(function(key){
    var got=fm.api[key];
    if(!got||typeof got.values!=="function"){return;}
    var v=got.values();
    if(v===null||v===undefined){return;}
    if(key==="effort"){state.duration=v;return;}
    if(key==="reminder"){state.reminderTime=v;return;}
    if(key==="countdown"){state.countdown=!!v;return;}
    if(key==="note"){state.note=v;return;}
    if(key==="recurrence"){state.recurrence=v;return;}
    if(key==="places"&&typeof got.meta==="function"){state._placeMeta=got.meta();}
    state[key]=v;
  });
  return state;
}

/* Ouvre d'office les champs qui contiennent déjà quelque chose. */
function autoOpen(fm,state,keys){
  keys.forEach(function(k){
    var v=state[k];
    if(k==="countdown"&&state.countdown){fm.open(k);return;}
    if(k==="recurrence"&&state.recurrence){fm.open(k);return;}
    if(k==="effort"&&state.duration){fm.open(k);return;}
    if(k==="reminder"&&state.reminderTime){fm.open(k);return;}
    if(k==="note"&&String(state.note||"").trim()){fm.open(k);return;}
    if(Array.isArray(v)&&v.length){fm.open(k);}
  });
}

/* ------------------------------------------------------------------ */
/* État et persistance                                                 */
/* ------------------------------------------------------------------ */
function linkedDailyTitles(wiki,title,kind){
  var out=[];
  wiki.each(function(t,tt){
    if(!Agenda.isDaily(t)){return;}
    if(list(t.fields[fieldNameForDaily(kind)]).indexOf(title)!==-1){out.push(tt);}
  });
  return out;
}
function updateDailyLinks(wiki,itemTitle,kind,desired){
  var want=Object.create(null);
  (desired||[]).forEach(function(x){want[x]=true;});
  var field=fieldNameForDaily(kind),now=new Date();
  wiki.each(function(t,title){
    if(!Agenda.isDaily(t)){return;}
    var vals=list(t.fields[field]),has=vals.indexOf(itemTitle)!==-1,should=!!want[title];
    if(kind==="habit"){Agenda.setHabitDailyCompletion(wiki,itemTitle,String(t.fields.date||""),title,should);}
    if(has===should){return;}
    if(should){vals.push(itemTitle);}else{vals=vals.filter(function(x){return x!==itemTitle;});}
    wiki.addTiddler(new $tw.Tiddler(t,(function(){var o={};o[field]=Agenda.stringifyList(vals);return o;})(),{modified:now}));
  });
}
function agendaLinksOfState(state){return {events:unique(state.events||[]),todos:unique(state.todos||[]),habits:unique(state.habits||[])};}
function agendaLinksFromTiddler(t){
  var f=t&&t.fields?t.fields:{};
  return {events:unique(list(f.events)),todos:unique(list(f.todos)),habits:unique(list(f.habits||f.habitudes))};
}
function ensureLinked(widget,state){
  [["person",state.people],["activity",state.activities],["project",state.projects],
   ["event",state.events],["todo",state.todos],["habit",state.habits],
   ["media",state.media],["sleep",state.sleep]].forEach(function(pair){
    unique(pair[1]).forEach(function(title){Entities.ensureEntity(widget.wiki,pair[0],title);});
  });
  var pmeta=state._placeMeta||{};
  unique(state.places).forEach(function(title){
    Entities.ensureEntity(widget.wiki,"place",title,pmeta[title]||null);
  });
}

function normalizeTodoStatus(value){
  var s=String(value||"").toLowerCase().trim()
    .replace(/[àáâä]/g,"a")
    .replace(/[éèêë]/g,"e")
    .replace(/\s+/g,"_")
    .replace(/-/g,"_");
  if(s==="done"||s==="termine"||s==="terminee"||s==="complete"||s==="completed"){return "fait";}
  if(s==="en_cours"||s==="encours"||s==="doing"||s==="in_progress"){return "en_cours";}
  if(s==="reporte"||s==="reportee"||s==="postponed"){return "reporte";}
  if(s==="annule"||s==="annulee"||s==="cancelled"||s==="canceled"){return "annule";}
  if(s==="fait"){return "fait";}
  return "a_faire";
}

function commonState(widget,t,title,kind){
  var f=t?t.fields:{};
  return {
    kind:kind,
    label:t?displayTitle(t,title):"",
    marker:String(f.marker||f.importance||""),
    eventType:String(f["event-type"]||f.typeId||""),
    status:kind==="todo"?normalizeTodoStatus(f.status||f.statut):String(f.status||f.statut||"normal"),
    people:list(f.people||f.relations),
    relationModes:RelationModes.parse(f[RelationModes.FIELD]),
    places:list(f.places||f.lieux),
    activities:list(f.activities||f.activites),
    projects:list(f.projects),
    events:list(f.events),
    todos:list(f.todos),
    habits:list(f.habits||f.habitudes),
    media:list(f.media),
    sleep:list(f.sleep),
    channels:list(f.channels||f.canaux),
    dreams:list(f.dreams||f.reves),
    todoTags:list(f["todo-tags"]),
    note:String(f.text||f.note||""),
    images:json(f.images,[])||[],
    audios:json(f.audios||f.audio,[])||[],
    links:json(f.links,[])||[],
    checklist:json(f.checklist,[])||[],
    progress:json(f.progress||f.journal,[])||[],
    recurrence:json(f.recurrence,null),
    duration:String(f["duration-minutes"]||""),
    reminderTime:String(f["reminder-time"]||""),
    pauseOnVacations:yes(f["pause-on-vacations"]||f.pauseSurVacances),
    countdown:yes(f.countdown||f.compteRebours),
    dailyLinks:title?linkedDailyTitles(widget.wiki,title,kind):[],
    occurrenceGroup:String(f["occurrence-group"]||"")
  };
}

/* En-tête commun : type, marqueur, titre. */
function headBlock(widget,sh,state,opts){
  opts=opts||{};
  var doc=sh.doc,head=mk(doc,sh.body,"div","ja-af-head"),api={};
  if(opts.type!==false){
    api.type=typePicker(widget,head,state.eventType,function(v){state.eventType=v;});
  }
  api.marker=markerPicker(widget,head,state.marker,function(v){state.marker=v;});
  api.title=input(doc,sh.body,opts.titleLabel||"Titre","text",state.label,opts.placeholder||"");
  api.title.parentNode.classList.add("ja-af-title-field");
  return api;
}

/* En-tête compact de l'Événement, inspiré du formulaire Obsidian :
   type rond + grand titre + marqueurs du Daily sur une seule ligne. */
function eventHeadBlock(widget,sh,state,opts){
  opts=opts||{};
  var doc=sh.doc,cfg=Agenda.readConfig(widget.wiki),
      statuses=opts.statuses===undefined?[
        {id:"normal",label:"Normal"},
        {id:"fait",label:"Fait"},
        {id:"annule",label:"Annulé"},
        {id:"reporte",label:"Reporté"},
        {id:"avance",label:"Avancé"}
      ]:opts.statuses,
      hasStatus=!!(statuses&&statuses.length),
      top=mk(doc,sh.body,"div","ja-ae-topline"+(hasStatus?"":" is-no-status")),
      cur=String(state.eventType||""),
      statusCur=String(state.status||(hasStatus?statuses[0].id:"")),
      typeBtn=null,statusBtn=null,
      title=null,api={};

  if(opts.fixedIcon){
    if(opts.editableEmoji){
      var fixedEmoji=String(opts.fixedIcon||"🌿");
      typeBtn=btn(doc,top,"ja-ae-typebtn is-fixed is-editable-emoji","","Changer l’emoji");
      function drawFixedEmoji(){
        typeBtn.textContent=fixedEmoji||"🌿";
        typeBtn.title=(opts.fixedIconTitle||"Icône")+" · cliquer pour changer";
        typeBtn.setAttribute("aria-label",typeBtn.title);
      }
      typeBtn.addEventListener("click",function(){
        var v=window.prompt("Emoji pour cette période",fixedEmoji||"🌿");
        if(v===null){return;}
        v=String(v||"").trim();
        if(!v){v="🌿";}
        fixedEmoji=v;
        state.vacationIcon=v;
        drawFixedEmoji();
      });
      drawFixedEmoji();
      api.icon={value:function(){return fixedEmoji||"🌿";}};
      api.iconButton=typeBtn;
    }else{
      typeBtn=mk(doc,top,"span","ja-ae-typebtn is-fixed",opts.fixedIcon);
      typeBtn.title=opts.fixedIconTitle||"";
    }
    if(opts.fixedColor){typeBtn.style.setProperty("--ja-ae-type-col",opts.fixedColor);}
  }else if(opts.type!==false){
    typeBtn=btn(doc,top,"ja-ae-typebtn","","Choisir le type");
    function types(){
      return [{id:"",label:"Sans type",icon:opts.defaultIcon||"📅",color:""}].concat(cfg.eventTypes||[]);
    }
    function typeMeta(){
      var found=types()[0];
      types().some(function(x){if(String(x.id||"")===cur){found=x;return true;}return false;});
      return found;
    }
    function drawType(){
      var m=typeMeta(),src=m.image?JConfig.imageSrc(widget.wiki,String(m.image||"")):"";
      typeBtn.innerHTML="";
      if(src){
        var im=mk(doc,typeBtn,"img","ja-ae-typebtn-img");
        im.src=src;im.alt="";
      }else{
        mk(doc,typeBtn,"span","ja-ae-typebtn-emoji",m.icon||opts.defaultIcon||"📅");
      }
      typeBtn.title=m.label||"Type";
      typeBtn.setAttribute("aria-label","Type : "+(m.label||"Sans type"));
      typeBtn.style.removeProperty("--ja-ae-type-col");
      if(m.color){typeBtn.style.setProperty("--ja-ae-type-col",m.color);}
    }
    typeBtn.addEventListener("click",function(){
      eventTypePopover(widget,typeBtn,types(),function(x){
        cur=String(x.id||"");
        state.eventType=cur;
        drawType();
      },sh.cleanups);
    });
    drawType();
    api.type={value:function(){return cur;}};
  }

  if(hasStatus){
    statusBtn=btn(doc,top,"ja-ae-statuschip","","Choisir le statut");
    function statusMeta(){
      var found=statuses[0];
      statuses.some(function(x){if(String(x.id)===statusCur){found=x;return true;}return false;});
      return found;
    }
    function drawStatus(){
      var m=statusMeta();
      statusCur=String(m.id);
      statusBtn.textContent=m.label;
      statusBtn.dataset.status=statusCur;
      statusBtn.dataset.value=statusCur;
      statusBtn.title="Statut : "+m.label;
      statusBtn.setAttribute("aria-label","Statut : "+m.label);
    }
    statusBtn.addEventListener("click",function(){
      formPopover(doc,statusBtn,statuses.map(function(x){
        return {
          label:x.label,
          run:function(){statusCur=String(x.id);statusBtn.dataset.value=statusCur;state.status=statusCur;drawStatus();}
        };
      }),sh.cleanups);
    });
    drawStatus();
    api.status={value:function(){return String(statusBtn.dataset.value||statusBtn.dataset.status||statusCur);}};
  }

  title=mk(doc,top,"input","ja-jform-input ja-agenda-form-input ja-ae-title");
  title.type="text";
  title.value=state.label||"";
  title.placeholder=opts.placeholder||"Titre";

  if(opts.marker!==false){
    api.marker=markerPicker(widget,top,state.marker,function(v){state.marker=v;},{label:false,compact:true});
  }
  api.title=title;
  return api;
}


/* Rappel : la checkbox vit dans la rangée principale.
   Le champ d'heure n'existe visuellement que lorsque le rappel est actif. */
function reminderInline(doc,parent,checkbox,state,opts){
  opts=opts||{};
  var wrap=mk(doc,parent,"div","ja-ae-reminderline"),
      label=mk(doc,wrap,"span","ja-ae-reminderlabel","⏰  Rappel à"),
      time=mk(doc,wrap,"input","ja-jform-input ja-agenda-form-input ja-ae-remindertime");

  time.type="time";
  time.value=state.reminderTime||"";

  function seed(){
    var v=opts.seed?opts.seed():"";
    return v||opts.defaultTime||"09:00";
  }
  function sync(){
    var on=!!checkbox.checked;
    wrap.classList.toggle("is-hidden",!on);
    if(on&&!time.value){time.value=seed();}
  }

  checkbox.addEventListener("change",sync);
  sync();

  return {
    value:function(){return checkbox.checked?(time.value||seed()):"";},
    input:time,
    sync:sync
  };
}

/* Temps de l'événement :
   Journée entière / Horaires, puis Date / Fin (plusieurs jours).
   L'API imite dateLine() pour ne rien casser dans la sauvegarde. */
function eventTiming(widget,parent,state){
  var doc=widget.document,
      wrap=mk(doc,parent,"div","ja-ae-timing"),
      modebar=mk(doc,wrap,"div","ja-ae-modebar"),
      mode=(state.startTime||state.endTime)?"hours":"all",
      seg=segmented(doc,modebar,"",mode,[["all","☼  Journée entière"],["hours","◷  Horaires"]],function(v){
        mode=v;drawTime();
      }),
      repeatCheck=check(doc,modebar,"Répétition",!!state.recurrence),
      countdownCheck=check(doc,modebar,"Compte à rebours",!!state.countdown),
      preparationCheck=check(doc,modebar,"Préparation",!!(state.checklist&&state.checklist.length)),
      reminderCheck=check(doc,modebar,"Rappel",!!state.reminderTime),
      dates=mk(doc,wrap,"div","ja-ae-dategrid"),
      d1=mk(doc,dates,"label","ja-ae-datefield"),
      d2=mk(doc,dates,"div","ja-ae-endfield"),
      date=mk(doc,d1,"input","ja-jform-input ja-agenda-form-input"),
      endInput=null,
      endHost=null,
      timeRow=mk(doc,wrap,"div","ja-ae-timerow"),
      start=mk(doc,timeRow,"label","ja-ae-timefield"),
      finish=mk(doc,timeRow,"label","ja-ae-timefield"),
      startInput=mk(doc,start,"input","ja-jform-input ja-agenda-form-input"),
      endTimeInput=mk(doc,finish,"input","ja-jform-input ja-agenda-form-input");

  repeatCheck.parentNode.classList.add("ja-ae-inlinecheck","is-repeat");
  countdownCheck.parentNode.classList.add("ja-ae-inlinecheck","is-countdown");
  preparationCheck.parentNode.classList.add("ja-ae-inlinecheck","is-preparation");
  reminderCheck.parentNode.classList.add("ja-ae-inlinecheck","is-reminder");

  mk(doc,d1,"span","ja-agenda-form-label","Date");
  d1.insertBefore(d1.lastChild,d1.firstChild);
  date.type="date";date.value=state.date||today();

  mk(doc,d2,"span","ja-agenda-form-label","Fin");
  mk(doc,start,"span","ja-agenda-form-label","Début");
  start.insertBefore(start.lastChild,start.firstChild);
  mk(doc,finish,"span","ja-agenda-form-label","Fin");
  finish.insertBefore(finish.lastChild,finish.firstChild);

  startInput.type="time";startInput.value=state.startTime||"09:00";
  endTimeInput.type="time";endTimeInput.value=state.endTime||"";
  finish.classList.add("is-optional");
  mk(doc,finish,"span","ja-ae-timehint","Optionnelle · 10 min si vide");

  function drawEnd(value){
    if(endHost){endHost.remove();endHost=null;endInput=null;}
    endHost=mk(doc,d2,"div","ja-ae-endctl");
    if(value){
      endInput=mk(doc,endHost,"input","ja-jform-input ja-agenda-form-input");
      endInput.type="date";endInput.value=value;
      btn(doc,endHost,"ja-ae-clearend","×","Retirer le dernier jour").addEventListener("click",function(){
        drawEnd("");
      });
    }else{
      btn(doc,endHost,"ja-ae-multiday","＋","Plusieurs jours ?").addEventListener("click",function(){
        drawEnd(Agenda.addDays(date.value||today(),1));
      });
      mk(doc,endHost,"span","ja-ae-multiday-text","plusieurs jours ?");
    }
  }
  function drawTime(){
    timeRow.classList.toggle("is-hidden",mode!=="hours");
  }
  drawEnd(state.dateEnd||"");
  drawTime();

  var reminderApi=reminderInline(doc,wrap,reminderCheck,state,{
    seed:function(){return mode==="hours"?(startInput.value||"09:00"):"09:00";}
  });

  return {
    date:function(){return date.value||"";},
    get:function(key){
      if(key==="startTime"){return mode==="hours"?(startInput.value||""):"";}
      if(key==="endTime"){return mode==="hours"?(endTimeInput.value||""):"";}
      if(key==="dateEnd"){return endInput?(endInput.value||""):"";}
      return "";
    },
    open:function(key,value){
      if(key==="dateEnd"){drawEnd(value||"");}
      if(key==="startTime"){mode="hours";seg.set("hours");startInput.value=value||"09:00";drawTime();}
      if(key==="endTime"){mode="hours";seg.set("hours");endTimeInput.value=value||"";drawTime();}
    },
    dateInput:date,
    repeatCheck:repeatCheck,
    countdownCheck:countdownCheck,
    preparationCheck:preparationCheck,
    reminderCheck:reminderCheck,
    reminderApi:reminderApi
  };
}

/* La checkbox active la répétition ; le détail reste dans une boîte
   indépendante et rétractable juste après les dates/heures. */
function eventRecurrencePanel(widget,parent,state,timing,opts){
  opts=opts||{};
  var doc=widget.document,
      checkbox=opts.check||(timing&&timing.repeatCheck)||null,
      always=!!opts.always,
      baseKey=opts.baseKey||"date",
      pauseVacations=opts.pauseVacations!==false,
      box=mk(doc,parent,"div","ja-ae-repeatbox"),
      head=btn(doc,box,"ja-ae-repeathead","","Réduire la répétition"),
      label=mk(doc,head,"span","ja-ae-repeat-title","↻  "+(opts.label||"Répétition")),
      arrow=mk(doc,head,"span","ja-ae-repeat-arrow","⌃"),
      body=mk(doc,box,"div","ja-ae-repeatbody"),
      built=false,collapsed=false,
      cached=state.recurrence||null;

  /* Cette boîte seule garde sa hauteur intrinsèque. On ne touche surtout pas
     aux autres enfants du formulaire. */
  box.style.flexShrink="0";

  function baseDate(){
    if(opts.baseDate){return opts.baseDate()||today();}
    if(timing&&timing.date){return timing.date()||today();}
    return state[baseKey]||today();
  }
  function defaultRecurrence(){
    return opts.defaultRecurrence?
      opts.defaultRecurrence():
      {frequency:"week",interval:1,start:baseDate(),weekdays:[]};
  }
  function ensureBuilt(){
    if(built){return;}
    if(!state.recurrence){state.recurrence=cached||defaultRecurrence();}
    if(!state.recurrence.start){state.recurrence.start=baseDate();}
    cached=state.recurrence;
    recurrenceEditor(doc,body,state,baseKey,{force:true,pauseVacations:pauseVacations});
    built=true;
  }
  function drawCollapse(){
    /* Le style inline garantit le repli sans dépendre d'une règle globale. */
    body.style.display=collapsed?"none":"";
    body.classList.toggle("is-hidden",collapsed);
    box.classList.toggle("is-collapsed",collapsed);
    arrow.textContent=collapsed?"⌄":"⌃";
    head.title=collapsed?"Déplier la répétition":"Réduire la répétition";
    head.setAttribute("aria-label",head.title);
  }
  function enabled(){return always||(checkbox&&checkbox.checked);}
  function sync(){
    if(enabled()){
      if(!state.recurrence){state.recurrence=cached||defaultRecurrence();}
      ensureBuilt();
      box.style.display="";
      box.classList.remove("is-hidden");
      drawCollapse();
    }else{
      if(state.recurrence){cached=state.recurrence;}
      state.recurrence=null;
      box.style.display="none";
      box.classList.add("is-hidden");
    }
  }
  if(checkbox){checkbox.addEventListener("change",sync);}
  head.addEventListener("click",function(){collapsed=!collapsed;drawCollapse();});
  sync();
  return {sync:sync};
}

/* Préparation : checkbox + boîte indépendante, rétractable et scrollable. */
function eventPreparationPanel(widget,parent,state,timing,opts){
  opts=opts||{};
  var doc=widget.document,
      checkbox=opts.check||(timing&&timing.preparationCheck),
      box=mk(doc,parent,"div","ja-ae-prepbox"),
      head=btn(doc,box,"ja-ae-prephead","","Réduire la préparation"),
      title=mk(doc,head,"span","ja-ae-prep-title","☑  "+(opts.label||"Préparation")),
      arrow=mk(doc,head,"span","ja-ae-prep-arrow","⌃"),
      body=mk(doc,box,"div","ja-ae-prepbody"),
      editor=null,collapsed=false,
      cached=(state.checklist||[]).slice();

  function ensureBuilt(){
    if(editor){return;}
    editor=checklistEditor(doc,body,cached,opts.itemLabel||"Point de préparation");
  }
  function drawCollapse(){
    body.classList.toggle("is-hidden",collapsed);
    box.classList.toggle("is-collapsed",collapsed);
    arrow.textContent=collapsed?"⌄":"⌃";
    head.title=collapsed?"Déplier la préparation":"Réduire la préparation";
    head.setAttribute("aria-label",head.title);
  }
  function sync(){
    if(checkbox&&checkbox.checked){
      ensureBuilt();
      box.classList.remove("is-hidden");
      drawCollapse();
    }else{
      box.classList.add("is-hidden");
    }
  }
  if(checkbox){checkbox.addEventListener("change",sync);}
  head.addEventListener("click",function(){collapsed=!collapsed;drawCollapse();});
  sync();

  return {
    values:function(){
      if(!checkbox||!checkbox.checked){return [];}
      ensureBuilt();
      return editor.values();
    }
  };
}

/* Note permanente en bas, mais rétractable. */
function eventNoteBlock(widget,parent,state){
  var doc=widget.document,
      box=mk(doc,parent,"section","ja-ae-note"),
      head=btn(doc,box,"ja-ae-note-head","","Replier la note"),
      title=mk(doc,head,"span","ja-ae-note-title","Note"),
      arrow=mk(doc,head,"span","ja-ae-note-arrow","⌃"),
      body=mk(doc,box,"div","ja-ae-note-body"),
      collapsed=false,
      ed=borrow(widget,"buildNoteEditor",body,state),
      ta=null;

  if(!ed){
    ta=mk(doc,body,"textarea","ja-jform-input ja-agenda-form-input ja-ae-note-fallback");
    ta.value=state.note||"";
    ta.placeholder="Note…";
  }

  function draw(){
    body.classList.toggle("is-hidden",collapsed);
    box.classList.toggle("is-collapsed",collapsed);
    arrow.textContent=collapsed?"⌄":"⌃";
    head.title=collapsed?"Déplier la note":"Replier la note";
    head.setAttribute("aria-label",head.title);
  }

  head.addEventListener("click",function(){
    collapsed=!collapsed;
    draw();
  });
  draw();

  return {
    value:function(){
      return ed?ed.value():(ta.value||"");
    }
  };
}

/* ------------------------------------------------------------------ */
/* Occurrences d'emploi du temps                                      */
/* ------------------------------------------------------------------ */
function cloneRecurrence(r){return r&&typeof r==="object"?JSON.parse(JSON.stringify(r)):null;}
function slotOccurrencesEditor(widget,parent,initial,seed){
  var doc=widget.document,
      vals=(initial||[]).map(function(x){return {
        name:String(x.name||"").trim(),
        date:String(x.date||seed.date||today()),
        startTime:String(x.startTime||"09:00"),
        endTime:String(x.endTime||"10:00"),
        timingMode:String(x.timingMode||"daily")==="continuous"?"continuous":"daily",
        endDate:String(x.endDate||x.date||seed.date||today()),
        reminderTime:String(x.reminderTime||""),
        recurrence:cloneRecurrence(x.recurrence),
        pauseOnVacations:!!x.pauseOnVacations
      };}),
      collapsedStates=[];

  if(!vals.length){
    vals=[{
      name:"",
      date:String(seed.date||today()),
      startTime:String(seed.startTime||"09:00"),
      endTime:String(seed.endTime||"10:00"),
      timingMode:"daily",
      endDate:String(seed.date||today()),
      reminderTime:String(seed.reminderTime||""),
      recurrence:cloneRecurrence(seed.recurrence),
      pauseOnVacations:seed.pauseOnVacations!==false
    }];
  }

  /* Quand on ouvre le formulaire, chaque vague est rangée dans son résumé.
     Une occurrence fraîchement ajoutée s'ouvre, elle, pour être éditée. */
  vals.forEach(function(){collapsedStates.push(true);});

  var box=mk(doc,parent,"section","ja-slot-occurrences"),
      head=mk(doc,box,"div","ja-slot-occurrences-head"),
      heading=mk(doc,head,"div","ja-slot-occurrences-heading","▥  Occurrences d’emploi du temps"),
      hint=mk(doc,head,"span","ja-slot-occurrences-hint","Une seule fiche, plusieurs vagues de planning."),
      arrow=mk(doc,head,"span","","⌃"),
      add=btn(doc,head,"ja-jform-secondary","＋ occurrence","Ajouter une occurrence dans ce même emploi du temps"),
      listHost=mk(doc,box,"div","ja-slot-occurrences-list"),
      collapsed=false;

  box.style.flexShrink="0";
  heading.style.cursor="pointer";
  hint.style.cursor="pointer";
  arrow.style.cursor="pointer";
  arrow.style.opacity=".52";

  function drawCollapse(){
    listHost.style.display=collapsed?"none":"";
    box.classList.toggle("is-collapsed",collapsed);
    arrow.textContent=collapsed?"⌄":"⌃";
    var label=collapsed?"Déplier les occurrences":"Replier les occurrences";
    heading.title=label;
    hint.title=label;
    arrow.title=label;
  }
  function toggleOccurrences(){
    collapsed=!collapsed;
    drawCollapse();
  }
  heading.addEventListener("click",toggleOccurrences);
  hint.addEventListener("click",toggleOccurrences);
  arrow.addEventListener("click",toggleOccurrences);

  function serialize(){
    return vals.map(function(v){
      var date=String(v.date||today()),
          rec=v.recurrence&&typeof v.recurrence==="object"?cloneRecurrence(v.recurrence):null;
      if(rec){rec.start=String(rec.start||date);}
      return {
        name:String(v.name||"").trim(),
        date:date,
        startTime:String(v.startTime||""),
        endTime:String(v.endTime||""),
        timingMode:String(v.timingMode||"daily")==="continuous"?"continuous":"daily",
        endDate:(function(){var e=String(v.endDate||date);return Agenda.cmp(e,date)<0?date:e;})(),
        reminderTime:String(v.reminderTime||""),
        recurrence:rec,
        pauseOnVacations:!!v.pauseOnVacations
      };
    });
  }

  function normalizeInPlace(){vals=serialize();}

  function defaultNext(){
    /* La prochaine vague se calcule depuis la date la plus récente, même si
       l’utilisateur a réordonné/édité les occurrences. Elle sera ensuite
       insérée tout en haut. */
    var last=vals[0]||{};
    vals.forEach(function(x){if(Agenda.cmp(String(x.date||""),String(last.date||""))>0){last=x;}});
    var date=Agenda.addDays(String(last.date||today()),7),
        oldEnd=String(last.endDate||last.date||today()),
        endDate=Agenda.addDays(oldEnd,7),
        rec=cloneRecurrence(last.recurrence);
    if(rec){
      if(rec.start){rec.start=Agenda.addDays(String(rec.start),7);}else{rec.start=date;}
      if(rec.end){rec.end=Agenda.addDays(String(rec.end),7);}
    }
    return {
      name:"",date:date,startTime:String(last.startTime||"09:00"),endTime:String(last.endTime||"10:00"),
      timingMode:String(last.timingMode||"daily")==="continuous"?"continuous":"daily",
      endDate:endDate,reminderTime:String(last.reminderTime||""),recurrence:rec,
      pauseOnVacations:last.pauseOnVacations!==false
    };
  }

  function occurrenceSummary(v,index){
    var bits=[String(v.name||"").trim()||("Occurrence "+(index+1))],continuous=String(v.timingMode||"daily")==="continuous";
    if(continuous){bits.push((v.date||"…")+" "+(v.startTime||"…")+" → "+(v.endDate||v.date||"…")+" "+(v.endTime||"…"));}
    else{if(v.date){bits.push(v.date);}if(v.startTime||v.endTime){bits.push((v.startTime||"…")+" → "+(v.endTime||"…"));}}
    return bits.join(" · ");
  }

  function draw(){
    normalizeInPlace();
    while(collapsedStates.length<vals.length){collapsedStates.push(true);}
    if(collapsedStates.length>vals.length){collapsedStates.length=vals.length;}
    listHost.innerHTML="";

    vals.forEach(function(v,index){
      var card=mk(doc,listHost,"article","ja-slot-occurrence"),
          ch=mk(doc,card,"div","ja-slot-occurrence-head"),
          toggle=btn(doc,ch,"ja-slot-occurrence-toggle","",collapsedStates[index]?"Déplier cette occurrence":"Replier cette occurrence"),
          number=mk(doc,toggle,"span","ja-slot-occurrence-number",occurrenceSummary(v,index)),
          chevron=mk(doc,toggle,"span","ja-slot-occurrence-chevron",collapsedStates[index]?"⌄":"⌃"),
          del=btn(doc,ch,"ja-vac-occurrence-del","×","Retirer cette occurrence"),
          body=mk(doc,card,"div","ja-slot-occurrence-body");

      toggle.style.display="flex";
      toggle.style.alignItems="center";
      toggle.style.gap="8px";
      toggle.style.flex="1 1 auto";
      toggle.style.minWidth="0";
      toggle.style.padding="0";
      toggle.style.margin="0";
      toggle.style.border="0";
      toggle.style.background="transparent";
      toggle.style.color="inherit";
      toggle.style.textAlign="left";
      chevron.style.marginLeft="auto";
      chevron.style.opacity=".52";

      function applyCardCollapse(){
        body.style.display=collapsedStates[index]?"none":"";
        card.classList.toggle("is-collapsed",collapsedStates[index]);
        chevron.textContent=collapsedStates[index]?"⌄":"⌃";
        toggle.title=collapsedStates[index]?"Déplier cette occurrence":"Replier cette occurrence";
        toggle.setAttribute("aria-expanded",collapsedStates[index]?"false":"true");
      }
      toggle.addEventListener("click",function(){
        collapsedStates[index]=!collapsedStates[index];
        applyCardCollapse();
      });

      del.disabled=vals.length===1;
      del.addEventListener("click",function(e){
        e.stopPropagation();
        if(vals.length<=1){return;}
        vals.splice(index,1);
        collapsedStates.splice(index,1);
        draw();
      });

      var naming=row(doc,body),
          name=input(doc,naming,"Nom de l’occurrence","text",v.name);
      name.placeholder="Ex. Horaires de rentrée, été 2027…";
      name.addEventListener("input",function(){
        v.name=name.value;
        number.textContent=occurrenceSummary(v,index);
      });

      var modeRow=row(doc,body,"ja-slot-occurrence-mode"),
          modeApi=segmented(doc,modeRow,"Organisation",v.timingMode||"daily",[
            ["daily","Chaque jour"],["continuous","En continu"]
          ],function(next){v.timingMode=next;if(next==="continuous"&&!v.endDate){v.endDate=v.date||today();}drawTiming();number.textContent=occurrenceSummary(v,index);}),
          timingHost=mk(doc,body,"div","ja-slot-occurrence-timing");

      function drawTiming(){
        timingHost.innerHTML="";
        var continuous=String(v.timingMode||"daily")==="continuous",
            timing=row(doc,timingHost),
            date=input(doc,timing,continuous?"Début · date":"Date","date",v.date),
            start=input(doc,timing,continuous?"Début · heure":"Début","time",v.startTime),
            endDate=null,end=null;
        if(continuous){endDate=input(doc,timing,"Fin · date","date",v.endDate||v.date||today());end=input(doc,timing,"Fin · heure","time",v.endTime);}
        else{end=input(doc,timing,"Fin","time",v.endTime);}
        date.addEventListener("input",function(){
          var before=String(v.date||today()),after=date.value||today(),span=0;
          if(continuous&&v.endDate){span=Math.max(0,Math.round((Agenda.parseIso(v.endDate)-Agenda.parseIso(before))/86400000));}
          v.date=after;if(continuous){v.endDate=Agenda.addDays(after,span);if(endDate){endDate.value=v.endDate;}}
          if(v.recurrence){v.recurrence.start=v.date;}number.textContent=occurrenceSummary(v,index);
        });
        start.addEventListener("input",function(){v.startTime=start.value;number.textContent=occurrenceSummary(v,index);});
        if(endDate){endDate.addEventListener("input",function(){v.endDate=endDate.value||v.date||today();if(Agenda.cmp(v.endDate,v.date)<0){v.endDate=v.date;endDate.value=v.date;}number.textContent=occurrenceSummary(v,index);});}
        end.addEventListener("input",function(){v.endTime=end.value;number.textContent=occurrenceSummary(v,index);});
      }
      drawTiming();

      var opts=mk(doc,body,"div","ja-slot-occurrence-options"),
          repeat=check(doc,opts,"Répétition",!!v.recurrence),
          pause=check(doc,opts,"Pause pendant les vacances",v.pauseOnVacations),
          rem=input(doc,opts,"Rappel","time",v.reminderTime);

      repeat.parentNode.classList.add("ja-ae-inlinecheck","is-repeat");
      pause.parentNode.classList.add("ja-ae-inlinecheck");

      rem.addEventListener("input",function(){v.reminderTime=rem.value;});
      pause.addEventListener("change",function(){v.pauseOnVacations=pause.checked;});

      var recHost=mk(doc,body,"div","ja-slot-occurrence-recurrence"),
          local={date:v.date,recurrence:v.recurrence};

      function syncRec(){
        recHost.innerHTML="";
        if(!repeat.checked){v.recurrence=null;return;}
        if(!v.recurrence){v.recurrence={frequency:"week",interval:1,start:v.date,weekdays:[]};}
        local.date=v.date;
        local.recurrence=v.recurrence;
        recurrenceEditor(doc,recHost,local,"date",{force:true,pauseVacations:false});
        v.recurrence=local.recurrence;
      }

      repeat.addEventListener("change",syncRec);
      syncRec();
      applyCardCollapse();
    });
  }

  function addOccurrence(){
    vals.unshift(defaultNext());
    collapsedStates.unshift(false);
    collapsed=false;
    draw();
    drawCollapse();
  }

  add.addEventListener("click",function(e){
    e.stopPropagation();
    addOccurrence();
  });

  draw();
  drawCollapse();

  return {
    values:function(){return serialize();},
    add:addOccurrence
  };
}

/* ------------------------------------------------------------------ */
/* ÉVÉNEMENT / CRÉNEAU                                                 */
/* ------------------------------------------------------------------ */
var EVENT_FIELDS=["projects","people","places","activities","events","todos","habits","media","sleep","dreams","dailyLinks","images","audios","links"];
var SLOT_FIELDS=["projects","people","places","activities","images","audios","links"];

function openEvent(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||null,
      sourceTitle=opts.copyFrom||null,
      t=editTitle?widget.wiki.getTiddler(editTitle):(sourceTitle?widget.wiki.getTiddler(sourceTitle):null),
      role=opts.role||((t&&t.fields["agenda-role"])||"event"),
      kind=role==="slot"?"slot":"event",
      state=commonState(widget,t,editTitle||sourceTitle,"event"),
      beforeLinks=agendaLinksFromTiddler(t),
      dateDefault=opts.date||String((t&&t.fields.date)||today()),
      initialSlotOccurrences=role==="slot"?Agenda.slotOccurrences(t||{}):null;

  state.date=sourceTitle&&!editTitle?(opts.date||Agenda.addDays(String(t.fields.date||today()),7)):dateDefault;
  state.dateEnd=sourceTitle&&!editTitle?"":String((t&&t.fields["date-end"])||"");
  state.startTime=opts.time||String((t&&t.fields["start-time"])||"");
  state.endTime=String((t&&t.fields["end-time"])||"");
  state.role=role;
  state.recurrence=sourceTitle&&!editTitle?null:state.recurrence;
  if(opts.project&&state.projects.indexOf(opts.project)===-1){state.projects.push(opts.project);}
  if(sourceTitle&&!editTitle){state.dailyLinks=[];state.occurrenceGroup=String(t.fields["occurrence-group"]||sourceTitle);}
  if(role==="slot"&&!state.startTime){state.startTime="09:00";}
  if(role==="slot"&&!state.endTime){state.endTime="10:00";}

  var sh=shell(widget,
        editTitle?(role==="slot"?"Modifier le créneau":"Modifier l’événement")
                 :(sourceTitle?"Nouvelle occurrence":(role==="slot"?"Nouveau créneau":"Nouvel événement")),
        kind,{saveLabel:editTitle?"Enregistrer":"Créer"}),
      doc=sh.doc,
      statuses=[
        {id:"normal",label:"Normal"},
        {id:"fait",label:"Fait"},
        {id:"annule",label:"Annulé"},
        {id:"reporte",label:"Reporté"},
        {id:"avance",label:"Avancé"}
      ];

  var head=role==="slot"?
    eventHeadBlock(widget,sh,state,{
      defaultIcon:"▥",
      statuses:statuses,placeholder:"Travail, cours, routine…"
    }):
    eventHeadBlock(widget,sh,state,{
      statuses:statuses,placeholder:"Titre de l’événement"
    });

  var dl,repeatCheck=null,recurrenceApi=null,preparationApi=null,slotApi=null;
  if(role==="slot"){
    slotApi=slotOccurrencesEditor(widget,sh.body,initialSlotOccurrences,{date:state.date,startTime:state.startTime,endTime:state.endTime,reminderTime:state.reminderTime,recurrence:state.recurrence,pauseOnVacations:state.pauseOnVacations!==false});
  }else{
    dl=eventTiming(widget,sh.body,state);
    recurrenceApi=eventRecurrencePanel(widget,sh.body,state,dl,{baseKey:"date",pauseVacations:true});
    preparationApi=eventPreparationPanel(widget,sh.body,state,dl);
  }

  var keys=role==="slot"?SLOT_FIELDS:EVENT_FIELDS,
      fm=fieldManager(widget,sh,state,keys,{});
  autoOpen(fm,state,keys);
  fm.mountFab();

  var noteApi=eventNoteBlock(widget,sh.body,state);

  if(editTitle){
    btn(doc,sh.headActions,"ja-jform-danger","Supprimer").addEventListener("click",function(){
      if(window.confirm("Supprimer cet élément Agenda ? Les liens associés seront nettoyés.")){
        Agenda.deleteAgendaObject(widget.wiki,editTitle,"event");sh.setClean();sh.close();
      }
    });
    btn(doc,sh.headActions,"ja-jform-secondary","＋ occurrence",role==="slot"?"Ajouter une occurrence à ce même emploi du temps":"Créer une occurrence indépendante")
      .addEventListener("click",function(){
        if(role==="slot"){slotApi.add();return;}
        sh.setClean();sh.close();openEvent(widget,{copyFrom:editTitle,date:Agenda.addDays(state.date||today(),7),role:role});
      });
  }

  sh.save.addEventListener("click",function(){
    state.label=head.title.value.trim();
    if(!state.label){head.title.focus();return;}
    var slotValues=null;
    if(role==="slot"){
      slotValues=slotApi.values();var firstSlot=slotValues[0]||{date:today(),startTime:"09:00",endTime:"10:00",reminderTime:"",recurrence:null,pauseOnVacations:true};
      state.date=firstSlot.date;state.startTime=firstSlot.startTime;state.endTime=firstSlot.endTime;state.dateEnd="";state.recurrence=firstSlot.recurrence;state.reminderTime=firstSlot.reminderTime;state.pauseOnVacations=firstSlot.pauseOnVacations;
    }else{
      state.date=dl.date()||today();state.startTime=dl.get("startTime");state.endTime=dl.get("endTime");state.dateEnd=dl.get("dateEnd");
    }
    if(head.type){state.eventType=head.type.value();}
    state.marker=head.marker.value();
    state.status=head.status?head.status.value():"normal";
    state.note=noteApi.value();
    if(role!=="slot"){
      state.countdown=!!dl.countdownCheck.checked;state.checklist=preparationApi.values();state.reminderTime=dl.reminderApi.value();
    }
    pullFields(fm,state);
    ensureLinked(widget,state);

    var finalTitle=editTitle||Agenda.uniqueTitle(widget.wiki,state.label+" · "+state.date),
        old=editTitle?widget.wiki.getTiddler(editTitle):null,
        fields={
          title:finalTitle,tags:agendaTags(old),kind:"event",label:state.label,
          date:state.date,"date-end":state.dateEnd,
          "start-time":state.startTime,"end-time":state.endTime,
          "agenda-role":role,marker:state.marker,"event-type":state.eventType,
          status:state.status||"normal",
          recurrence:state.recurrence?JSON.stringify(state.recurrence):"",
          "pause-on-vacations":state.pauseOnVacations?"yes":"",
          countdown:state.countdown?"yes":"",
          "reminder-time":state.reminderTime||"",
          "slot-occurrences":role==="slot"?JSON.stringify(slotValues||[]):"",
          projects:Agenda.stringifyList(state.projects),
          people:Agenda.stringifyList(state.people),
          "relation-modes":RelationModes.stringify(state.relationModes,state.people),
          places:Agenda.stringifyList(state.places),
          activities:Agenda.stringifyList(state.activities),
          events:Agenda.stringifyList(state.events),
          todos:Agenda.stringifyList(state.todos),
          habits:Agenda.stringifyList(state.habits),
          media:Agenda.stringifyList(state.media),
          sleep:Agenda.stringifyList(state.sleep),
          channels:Agenda.stringifyList(state.channels),
          dreams:Agenda.stringifyList(state.dreams),
          text:state.note,
          images:Media.stringifyJsonList(state.images),
          audios:Media.stringifyJsonList(state.audios),
          links:Media.stringifyJsonList(state.links),
          checklist:state.checklist.length?JSON.stringify(state.checklist):"",
          "occurrence-group":state.occurrenceGroup||""
        };
    widget.wiki.addTiddler(new $tw.Tiddler(old||{},fields,
      {created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));
    Agenda.syncAgendaLinks(widget.wiki,finalTitle,"event",beforeLinks,agendaLinksOfState(state));
    updateDailyLinks(widget.wiki,finalTitle,"event",state.dailyLinks);
    sh.setClean();sh.close();
  });
}


/* ------------------------------------------------------------------ */
/* To-do : effort compact + arbre de sous-tâches inline               */
/* ------------------------------------------------------------------ */

function todoRootEffort(doc,parent,minutes){
  var wrap=mk(doc,parent,"div","ja-todo-effort"),
      label=mk(doc,wrap,"span","ja-todo-effort-label","Effort"),
      ctl=mk(doc,wrap,"div","ja-todo-effort-ctl"),
      inp=mk(doc,ctl,"input","ja-jform-input ja-agenda-form-input"),
      sel=mk(doc,ctl,"select","ja-jform-input ja-todo-effort-unit"),
      hint=mk(doc,wrap,"span","ja-todo-effort-hint",""),
      manual=Math.max(0,parseInt(minutes||"0",10)||0),
      derived=false,
      derivedMinutes=0;

  inp.type="number";inp.min="0";
  [["min","min"],["h","h"]].forEach(function(o){
    var op=mk(doc,sel,"option","",o[1]);op.value=o[0];
  });

  function chooseUnit(min){
    return min>=60&&min%60===0?"h":"min";
  }
  function setInput(min){
    var unit=chooseUnit(min);
    sel.value=unit;
    inp.step=unit==="h"?"0.25":"5";
    inp.value=min?String(unit==="h"?+(min/60).toFixed(2):min):"";
  }
  function inputMinutes(){
    var n=parseFloat(String(inp.value||"").replace(",","."));
    if(!isFinite(n)||n<=0){return 0;}
    return Math.max(0,Math.round(sel.value==="h"?n*60:n));
  }
  function remember(){
    if(!derived){manual=inputMinutes();}
  }

  inp.addEventListener("input",remember);
  sel.addEventListener("change",function(){
    var cur=derived?derivedMinutes:manual;
    setInput(cur);
  });

  setInput(manual);

  return {
    value:function(){return String(derived?derivedMinutes:manual||"");},
    setDerived:function(active,min){
      active=!!active;min=Math.max(0,+min||0);
      if(active&&!derived){manual=inputMinutes();}
      derived=active;derivedMinutes=min;
      inp.disabled=active;sel.disabled=active;
      wrap.classList.toggle("is-derived",active);
      if(active){
        setInput(min);
        hint.textContent="Calculé automatiquement depuis les sous-tâches : "+formatMinutes(min);
      }else{
        setInput(manual);
        hint.textContent="";
      }
    },
    setHint:function(text){hint.textContent=text||"";}
  };
}

function todoSubtaskMarker(widget,parent,node,onChange){
  var doc=widget.document,cfg=JConfig.read(widget.wiki),
      b=btn(doc,parent,"ja-todo-sub-marker","","Marqueur de la sous-tâche");

  function all(){
    return [{id:"",label:"Aucun",emoji:"◇"}].concat(cfg.markers||[]);
  }
  function meta(){
    var found=all()[0];
    all().some(function(m){if(String(m.id||"")===String(node.marker||"")){found=m;return true;}return false;});
    return found;
  }
  function draw(){
    var m=meta();
    b.textContent=m.emoji||"◇";
    b.title="Marqueur : "+(m.label||"Aucun");
    b.setAttribute("aria-label",b.title);
  }
  b.addEventListener("click",function(){
    formPopover(doc,b,all().map(function(m){
      return {
        label:(m.emoji||"◇")+"  "+(m.label||"Aucun"),
        run:function(){
          node.marker=String(m.id||"");
          draw();
          if(onChange){onChange();}
        }
      };
    }),[]);
  });
  draw();
  return b;
}

/* Un arbre inline. Les nœuds existants restent de vraies To-dos en base,
   mais l'utilisateur n'a plus besoin d'ouvrir un autre formulaire. */
function todoSubtaskTree(widget,parent,rootTitle,onChange){
  var doc=widget.document,
      box=mk(doc,parent,"section","ja-todo-subtree"),
      head=mk(doc,box,"div","ja-todo-subtree-head"),
      body=mk(doc,box,"div","ja-todo-subtree-body"),
      loadedTitles=Object.create(null),
      nextId=1,
      focusId="";

  mk(doc,head,"span","ja-todo-subtree-title","Sous-tâches");

  function readNode(title){
    var t=widget.wiki.getTiddler(title),f=t?t.fields:{},
        n={
          id:"old-"+(nextId++),
          originalTitle:title,
          label:String(f.label||title),
          status:String(f.status||"a_faire"),
          duration:String(f["duration-minutes"]||""),
          marker:String(f.marker||""),
          children:[]
        };
    loadedTitles[title]=true;
    Agenda.todoChildrenTitles(widget.wiki,title).forEach(function(c){
      n.children.push(readNode(c));
    });
    return n;
  }

  var roots=[];
  if(rootTitle){
    Agenda.todoChildrenTitles(widget.wiki,rootTitle).forEach(function(c){
      roots.push(readNode(c));
    });
  }

  function newNode(){
    return {
      id:"new-"+(nextId++),originalTitle:"",
      label:"",status:"a_faire",duration:"",marker:"",children:[]
    };
  }

  function nodeOwnMinutes(n){
    return Math.max(0,parseInt(n.duration||"0",10)||0);
  }
  function nodeTreeInfo(n){
    var childInfos=n.children.map(nodeTreeInfo),
        childHas=childInfos.some(function(x){return x.has;}),
        childSum=childInfos.reduce(function(s,x){return s+x.total;},0),
        own=nodeOwnMinutes(n);
    if(childHas){return {has:true,total:childSum};}
    return {has:own>0,total:own};
  }
  function rootInfo(){
    var infos=roots.map(nodeTreeInfo);
    return {
      has:infos.some(function(x){return x.has;}),
      total:infos.reduce(function(s,x){return s+x.total;},0)
    };
  }

  function effortCtl(host,node){
    var wrap=mk(doc,host,"span","ja-todo-sub-effort"),
        inp=mk(doc,wrap,"input","ja-jform-input ja-agenda-form-input"),
        sel=mk(doc,wrap,"select","ja-jform-input ja-todo-sub-unit"),
        min=nodeOwnMinutes(node),
        unit=min>=60&&min%60===0?"h":"min";
    inp.type="number";inp.min="0";inp.step=unit==="h"?"0.25":"5";
    inp.value=min?String(unit==="h"?+(min/60).toFixed(2):min):"";
    [["min","min"],["h","h"]].forEach(function(o){
      var op=mk(doc,sel,"option","",o[1]);op.value=o[0];if(o[0]===unit){op.selected=true;}
    });
    function save(){
      var n=parseFloat(String(inp.value||"").replace(",","."));
      node.duration=(!isFinite(n)||n<=0)?"":String(Math.round(sel.value==="h"?n*60:n));
      if(onChange){onChange(rootInfo());}
    }
    inp.addEventListener("input",save);
    sel.addEventListener("change",function(){
      var cur=Math.max(0,parseInt(node.duration||"0",10)||0);
      inp.step=sel.value==="h"?"0.25":"5";
      inp.value=cur?String(sel.value==="h"?+(cur/60).toFixed(2):cur):"";
    });
    return wrap;
  }

  function addChild(list){
    var n=newNode();
    list.push(n);focusId=n.id;
    draw();
    if(onChange){onChange(rootInfo());}
  }

  function renderNode(host,node,depth,list,index){
    var branch=mk(doc,host,"div","ja-todo-subnode");
    branch.style.setProperty("--ja-sub-depth",String(depth));

    var line=mk(doc,branch,"div","ja-todo-subline"),
        done=mk(doc,line,"input","ja-todo-subcheck"),
        title=mk(doc,line,"input","ja-jform-input ja-agenda-form-input ja-todo-subtitle");
    done.type="checkbox";
    done.checked=node.status==="fait"||node.status==="done";
    done.title="Sous-tâche terminée";
    title.type="text";title.value=node.label;title.placeholder="Sous-tâche…";

    effortCtl(line,node);
    todoSubtaskMarker(widget,line,node,function(){});
    var add=btn(doc,line,"ja-todo-subadd","↳","Ajouter une sous-tâche à cette sous-tâche"),
        del=btn(doc,line,"ja-todo-subdel","×","Supprimer cette sous-tâche");

    done.addEventListener("change",function(){
      node.status=done.checked?"fait":"a_faire";
    });
    title.addEventListener("input",function(){node.label=title.value;});
    add.addEventListener("click",function(){addChild(node.children);});
    del.addEventListener("click",function(){
      list.splice(index,1);draw();
      if(onChange){onChange(rootInfo());}
    });

    if(node.children.length){
      var kids=mk(doc,branch,"div","ja-todo-subchildren");
      node.children.forEach(function(child,i){
        renderNode(kids,child,depth+1,node.children,i);
      });
    }

    if(focusId===node.id){
      focusId="";
      setTimeout(function(){try{title.focus();}catch(e){}},0);
    }
  }

  function draw(){
    body.innerHTML="";
    if(!roots.length){
      mk(doc,body,"div","ja-todo-subempty","Aucune sous-tâche pour l’instant.");
    }
    roots.forEach(function(n,i){renderNode(body,n,0,roots,i);});
    var add=btn(doc,body,"ja-todo-subrootadd","＋ Sous-tâche","Ajouter une sous-tâche");
    add.addEventListener("click",function(){addChild(roots);});
  }

  function collectOriginals(nodes,set){
    nodes.forEach(function(n){
      if(n.originalTitle){set[n.originalTitle]=true;}
      collectOriginals(n.children,set);
    });
  }

  function saveNode(node,parentTitle,kept){
    var label=String(node.label||"").trim();
    if(!label){return "";}
    var old=node.originalTitle?widget.wiki.getTiddler(node.originalTitle):null,
        title=node.originalTitle||Agenda.uniqueTitle(widget.wiki,label+" · sous-tâche"),
        fields={
          title:title,
          tags:agendaTags(old),
          kind:"todo",
          label:label,
          status:node.status||"a_faire",
          marker:node.marker||"",
          "duration-minutes":String(node.duration||""),
          "parent-todo":parentTitle,
          "show-on-calendar":"no"
        };
    widget.wiki.addTiddler(new $tw.Tiddler(old||{},fields,
      {created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));
    node.originalTitle=title;
    kept[title]=true;
    node.children.forEach(function(c){saveNode(c,title,kept);});
    return title;
  }

  draw();
  if(onChange){onChange(rootInfo());}

  return {
    info:rootInfo,
    hasNodes:function(){return roots.length>0;},
    save:function(parentTitle){
      var kept=Object.create(null);
      roots.forEach(function(n){saveNode(n,parentTitle,kept);});
      Object.keys(loadedTitles).forEach(function(title){
        if(!kept[title]&&widget.wiki.getTiddler(title)){
          Agenda.deleteAgendaObject(widget.wiki,title,"todo",{cascade:true});
        }
      });
      loadedTitles=Object.create(null);
      collectOriginals(roots,loadedTitles);
    }
  };
}

/* ------------------------------------------------------------------ */
/* TO-DO                                                               */
/* ------------------------------------------------------------------ */
var TODO_FIELDS=["projects","people","places","activities","events","todos","habits","media","sleep","dreams","dailyLinks","todoTags","progress","images","audios","links"];

function openTodo(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||null,
      t=editTitle?widget.wiki.getTiddler(editTitle):null,
      state=commonState(widget,t,editTitle,"todo"),
      beforeLinks=agendaLinksFromTiddler(t),
      seedDate=String((t&&t.fields["start-date"])||opts.date||today());

  state.startDate=String((t&&t.fields["start-date"])||"");
  state.deadline=String((t&&t.fields.deadline)||"");
  state.startTime=String((t&&t.fields["start-time"])||opts.time||"");
  state.showOnCalendar=t?yes(t.fields["show-on-calendar"]):false;
  state.parentTodo=String((t&&t.fields["parent-todo"])||opts.parentTodo||"");
  if(opts.project&&state.projects.indexOf(opts.project)===-1){state.projects.push(opts.project);}

  var existingChildren=editTitle?Agenda.todoChildrenTitles(widget.wiki,editTitle):[],
      sh=shell(widget,editTitle?"Modifier la to-do":"Nouvelle to-do","todo",
        {saveLabel:editTitle?"Enregistrer":"Créer"}),
      doc=sh.doc,
      statuses=[
        {id:"a_faire",label:"À faire"},
        {id:"en_cours",label:"En cours"},
        {id:"fait",label:"Fait"},
        {id:"reporte",label:"Reporté"},
        {id:"annule",label:"Annulé"}
      ];

  var head=eventHeadBlock(widget,sh,state,{
    statuses:statuses,defaultIcon:"☑",placeholder:"Ce qu’il faut faire…"
  });

  var optionBar=mk(doc,sh.body,"div","ja-ae-modebar ja-ae-optionbar"),
      repeatCheck=check(doc,optionBar,"Répétition",!!state.recurrence),
      prepCheck=check(doc,optionBar,"Préparation",!!(state.checklist&&state.checklist.length)),
      showCal=check(doc,optionBar,"Agenda",state.showOnCalendar),
      reminderCheck=check(doc,optionBar,"Rappel",!!state.reminderTime),
      subtasksCheck=check(doc,optionBar,"Séparer en sous-tâches",existingChildren.length>0);
  repeatCheck.parentNode.classList.add("ja-ae-inlinecheck","is-repeat");
  prepCheck.parentNode.classList.add("ja-ae-inlinecheck","is-preparation");
  showCal.parentNode.classList.add("ja-ae-inlinecheck","is-calendar");
  reminderCheck.parentNode.classList.add("ja-ae-inlinecheck","is-reminder");
  subtasksCheck.parentNode.classList.add("ja-ae-inlinecheck","is-subtasks");

  /* Agenda pilote uniquement la PLANIFICATION.
     L'échéance reste indépendante : une To-do peut être due vendredi
     sans pour autant occuper une case du calendrier. */
  var dateHost=mk(doc,sh.body,"div","ja-todo-datehost"),
      dl=dateLine(widget,dateHost,state,{
        dateKey:"startDate",dateLabel:"À partir du",
        offers:[
          {key:"startTime",label:"heure",inlineLabel:"à",type:"time",seed:function(){return "09:00";}}
        ]
      });
  if(!state.startDate){dl.dateInput.value=seedDate;}
  if(state.startTime){dl.open("startTime",state.startTime);}

  var deadlineRow=mk(doc,sh.body,"label","ja-todo-deadline"),
      deadlineLabel=mk(doc,deadlineRow,"span","ja-agenda-form-label","Échéance"),
      deadlineInput=mk(doc,deadlineRow,"input","ja-jform-input ja-agenda-form-input");
  deadlineInput.type="date";
  deadlineInput.value=state.deadline||"";

  function syncAgenda(){
    /* L'Agenda ne pilote que la planification. L'échéance reste visible et
       enregistrable même si la To-do n'occupe aucune case du calendrier. */
    dateHost.classList.toggle("is-hidden",!showCal.checked);
  }
  showCal.addEventListener("change",syncAgenda);
  syncAgenda();

  var todoReminderApi=reminderInline(doc,sh.body,reminderCheck,state,{
    seed:function(){return dl.get("startTime")||state.startTime||"09:00";}
  });

  var recurrenceApi=eventRecurrencePanel(widget,sh.body,state,null,{
        check:repeatCheck,baseKey:"startDate",
        baseDate:function(){
          return showCal.checked?(dl.date()||seedDate):(deadlineInput.value||seedDate);
        },
        pauseVacations:false
      }),
      preparationApi=eventPreparationPanel(widget,sh.body,state,null,{
        check:prepCheck,itemLabel:"Point de préparation"
      });

  /* Effort toujours visible. Les sous-tâches vivent dans une vraie boîte
     rétractable : elles font partie de la To-do, sans monopoliser le form. */
  var effortApi=todoRootEffort(doc,sh.body,state.duration),
      subtreeBox=mk(doc,sh.body,"section","ja-todo-subtasks-box"),
      subtreeHead=btn(doc,subtreeBox,"ja-todo-subtasks-head","","Déplier les sous-tâches"),
      subtreeTitle=mk(doc,subtreeHead,"span","ja-todo-subtasks-title","☑  Sous-tâches"),
      subtreeArrow=mk(doc,subtreeHead,"span","ja-todo-subtasks-arrow","⌄"),
      subtreeHost=mk(doc,subtreeBox,"div","ja-todo-subtree-host"),
      subtaskApi=null,subtreeCollapsed=existingChildren.length>0;

  function drawSubtreeCollapse(){subtreeHost.classList.toggle("is-hidden",subtreeCollapsed);subtreeBox.classList.toggle("is-collapsed",subtreeCollapsed);subtreeArrow.textContent=subtreeCollapsed?"⌄":"⌃";subtreeHead.title=subtreeCollapsed?"Déplier les sous-tâches":"Réduire les sous-tâches";}
  subtreeHead.addEventListener("click",function(){subtreeCollapsed=!subtreeCollapsed;drawSubtreeCollapse();});

  function updateEffort(info){
    info=info||{has:false,total:0};
    effortApi.setDerived(info.has,info.total);
    if(subtasksCheck.checked&&!info.has){
      effortApi.setHint("Aucun effort saisi dans les sous-tâches : l’effort de la To-do reste manuel.");
    }
  }

  subtaskApi=todoSubtaskTree(widget,subtreeHost,editTitle,updateEffort);

  function syncSubtasks(){
    subtreeBox.classList.toggle("is-hidden",!subtasksCheck.checked);
    if(subtasksCheck.checked&&subtaskApi&&!subtaskApi.hasNodes()){subtreeCollapsed=false;}
    drawSubtreeCollapse();updateEffort(subtaskApi.info());
  }
  subtasksCheck.addEventListener("change",syncSubtasks);syncSubtasks();

  var fm=fieldManager(widget,sh,state,TODO_FIELDS,{});
  autoOpen(fm,state,TODO_FIELDS);
  fm.mountFab();

  var noteApi=eventNoteBlock(widget,sh.body,state);

  if(editTitle){
    btn(doc,sh.headActions,"ja-jform-danger","Supprimer").addEventListener("click",function(){
      if(window.confirm("Supprimer cette to-do et toutes ses sous-tâches ?")){
        Agenda.deleteAgendaObject(widget.wiki,editTitle,"todo",{cascade:true});sh.setClean();sh.close();
      }
    });
  }

  sh.save.addEventListener("click",function(){
    state.label=head.title.value.trim();
    if(!state.label){head.title.focus();return;}

    state.showOnCalendar=showCal.checked;
    state.startDate=showCal.checked?(dl.date()||seedDate):"";
    state.startTime=showCal.checked?dl.get("startTime"):"";
    state.deadline=deadlineInput.value||"";
    state.eventType=head.type?head.type.value():state.eventType;
    state.marker=head.marker.value();
    state.status=normalizeTodoStatus(head.status?head.status.value():"a_faire");
    state.checklist=preparationApi.values();
    state.note=noteApi.value();
    state.duration=effortApi.value();
    state.reminderTime=todoReminderApi.value();

    pullFields(fm,state);
    ensureLinked(widget,state);

    var finalTitle=editTitle||Agenda.uniqueTitle(widget.wiki,state.label+((state.deadline||state.startDate)?" · "+(state.deadline||state.startDate):"")),
        old=editTitle?widget.wiki.getTiddler(editTitle):null,
        fields={
          title:finalTitle,tags:agendaTags(old),kind:"todo",label:state.label,status:state.status,
          "start-date":state.startDate,deadline:state.deadline,"start-time":state.startTime,
          "reminder-time":state.reminderTime,"duration-minutes":state.duration,
          "show-on-calendar":state.showOnCalendar?"yes":"no",
          recurrence:state.recurrence?JSON.stringify(state.recurrence):"",
          marker:state.marker,"event-type":state.eventType,
          projects:Agenda.stringifyList(state.projects),
          people:Agenda.stringifyList(state.people),
          "relation-modes":RelationModes.stringify(state.relationModes,state.people),
          places:Agenda.stringifyList(state.places),
          activities:Agenda.stringifyList(state.activities),
          events:Agenda.stringifyList(state.events),
          todos:Agenda.stringifyList(state.todos),
          habits:Agenda.stringifyList(state.habits),
          media:Agenda.stringifyList(state.media),
          sleep:Agenda.stringifyList(state.sleep),
          channels:Agenda.stringifyList(state.channels),
          dreams:Agenda.stringifyList(state.dreams),
          "todo-tags":Agenda.stringifyList(state.todoTags),
          "parent-todo":state.parentTodo,
          text:state.note,
          images:Media.stringifyJsonList(state.images),
          audios:Media.stringifyJsonList(state.audios),
          links:Media.stringifyJsonList(state.links),
          checklist:state.checklist.length?JSON.stringify(state.checklist):"",
          progress:state.progress.length?JSON.stringify(state.progress):"",
          completions:old?String(old.fields.completions||""):""
        };

    widget.wiki.addTiddler(new $tw.Tiddler(old||{},fields,
      {created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));

    /* Les enfants sont enregistrés APRÈS le parent : les nouveaux niveaux
       peuvent donc immédiatement pointer vers le bon title. */
    if(subtasksCheck.checked||subtaskApi.hasNodes()){
      subtaskApi.save(finalTitle);
    }

    Agenda.syncAgendaLinks(widget.wiki,finalTitle,"todo",beforeLinks,agendaLinksOfState(state));
    updateDailyLinks(widget.wiki,finalTitle,"todo",state.dailyLinks);
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* Rythme d'habitude                                                  */
/* ------------------------------------------------------------------ */
function habitScheduleEditor(widget,parent,initial){
  var doc=widget.document,s=Object.assign({},initial||{});s.weekdays=(s.weekdays||[]).map(Number);s.target=Math.max(1,+s.target||1);s.interval=Math.max(1,+s.interval||1);
  var box=mk(doc,parent,"section","ja-habit-schedule"),head=mk(doc,box,"div","ja-habit-schedule-head"),
      title=mk(doc,head,"div","ja-habit-schedule-title","↻  Rythme de l’habitude"),
      hint=mk(doc,head,"span","ja-habit-schedule-hint","Les habitudes se répètent toujours."),
      arrow=mk(doc,head,"span","","⌃"),body=mk(doc,box,"div","ja-habit-schedule-body"),collapsed=false;
  box.style.flexShrink="0";
  head.style.cursor="pointer";arrow.style.opacity=".55";
  function drawCollapse(){
    body.style.display=collapsed?"none":"";
    box.classList.toggle("is-collapsed",collapsed);
    arrow.textContent=collapsed?"⌄":"⌃";
    head.title=collapsed?"Déplier le rythme de l’habitude":"Replier le rythme de l’habitude";
  }
  head.addEventListener("click",function(e){
    /* Les contrôles du contenu sont dans body, donc le header seul replie. */
    collapsed=!collapsed;drawCollapse();
  });
  function preset(){if(s.mode==="daily"&&s.target>1){return "daily-multi";}return s.mode||"daily";}
  function draw(){
    body.innerHTML="";var top=row(doc,body),mode=select(doc,top,"Répétition",preset(),[
      ["daily","Tous les jours / tous les X jours"],["daily-multi","Plusieurs fois par jour"],["weekdays","Jours fixes de la semaine"],
      ["quota-week","X fois par semaine · jours libres"],["monthly","Un jour fixe du mois"],["quota-month","X fois par mois · jours libres"]
    ]);
    mode.addEventListener("change",function(){var v=mode.value;if(v==="daily-multi"){s.mode="daily";s.target=Math.max(2,s.target||2);}else{s.mode=v;if(v==="daily"||v==="weekdays"||v==="monthly"){s.target=1;}}draw();});
    var dates=row(doc,body),start=input(doc,dates,"À partir du","date",s.start||today()),end=input(doc,dates,"Fin (optionnelle)","date",s.end||"");
    start.addEventListener("input",function(){s.start=start.value||today();});end.addEventListener("input",function(){s.end=end.value;});
    var v=preset(),detail=row(doc,body);
    if(v==="daily"||v==="daily-multi"){
      var interval=input(doc,detail,"Tous les X jours","number",String(s.interval||1));interval.min="1";interval.addEventListener("input",function(){s.interval=Math.max(1,+interval.value||1);});
      if(v==="daily-multi"){var target=input(doc,detail,"Fois par jour","number",String(Math.max(2,s.target||2)));target.min="2";target.addEventListener("input",function(){s.target=Math.max(2,+target.value||2);});}
      var time=input(doc,detail,"Heure (optionnelle)","time",s.time||"");time.addEventListener("input",function(){s.time=time.value;});
    }else if(v==="weekdays"){
      var intervalW=input(doc,detail,"Toutes les X semaines","number",String(s.interval||1));intervalW.min="1";intervalW.addEventListener("input",function(){s.interval=Math.max(1,+intervalW.value||1);});
      var timeW=input(doc,detail,"Heure (optionnelle)","time",s.time||"");timeW.addEventListener("input",function(){s.time=timeW.value;});
      var days=mk(doc,body,"div","ja-agenda-weekdays ja-habit-weekdays"),chosen=(s.weekdays||[]).slice();
      ["L","M","M","J","V","S","D"].forEach(function(n,i){var b=btn(doc,days,"ja-agenda-weekday"+(chosen.indexOf(i)!==-1?" is-selected":""),n);b.addEventListener("click",function(){var x=chosen.indexOf(i);if(x===-1){chosen.push(i);}else{chosen.splice(x,1);}chosen.sort();s.weekdays=chosen;draw();});});
      if(!chosen.length){mk(doc,body,"div","ja-habit-schedule-warning","Choisis au moins un jour de la semaine.");}
    }else if(v==="quota-week"||v==="quota-month"){
      var unit=v==="quota-week"?"semaine":"mois",targetQ=input(doc,detail,"Fois par "+unit,"number",String(s.target||1)),intervalQ=input(doc,detail,"Tous les X "+unit+"s","number",String(s.interval||1));
      targetQ.min="1";intervalQ.min="1";targetQ.addEventListener("input",function(){s.target=Math.max(1,+targetQ.value||1);});intervalQ.addEventListener("input",function(){s.interval=Math.max(1,+intervalQ.value||1);});
      mk(doc,body,"div","ja-habit-schedule-note","Aucun jour imposé : le widget garde l’objectif visible jusqu’à ce que le quota de la période soit atteint.");
    }else if(v==="monthly"){
      var day=input(doc,detail,"Jour du mois","number",String(s.dayOfMonth||1)),intervalM=input(doc,detail,"Tous les X mois","number",String(s.interval||1)),timeM=input(doc,detail,"Heure (optionnelle)","time",s.time||"");
      day.min="1";day.max="31";intervalM.min="1";day.addEventListener("input",function(){s.dayOfMonth=Math.max(1,Math.min(31,+day.value||1));});intervalM.addEventListener("input",function(){s.interval=Math.max(1,+intervalM.value||1);});timeM.addEventListener("input",function(){s.time=timeM.value;});
    }
    var max=input(doc,body,"Nombre maximum d’occurrences","number",s.maxOccurrences==null?"":String(s.maxOccurrences));max.min="1";max.placeholder="Sans limite";max.addEventListener("input",function(){s.maxOccurrences=max.value?Math.max(1,+max.value||1):null;});
  }
  draw();drawCollapse();return {value:function(){if(s.mode==="weekdays"&&!(s.weekdays||[]).length){s.weekdays=[0];}return Object.assign({},s,{weekdays:(s.weekdays||[]).slice()});}};
}

/* ------------------------------------------------------------------ */
/* HABITUDE                                                            */
/* ------------------------------------------------------------------ */
var HABIT_FIELDS=["effort","projects","people","places","activities","events","todos","habits","media","sleep","dreams","dailyLinks","images","audios","links"];

function openHabit(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||null,t=editTitle?widget.wiki.getTiddler(editTitle):null,state=commonState(widget,t,editTitle,"habit"),beforeLinks=agendaLinksFromTiddler(t);
  state.startDate=String((t&&t.fields["start-date"])||opts.date||today());state.startTime=String((t&&t.fields["start-time"])||opts.time||"");
  state.habitSchedule=Agenda.habitSchedule(t||{"start-date":state.startDate,"start-time":state.startTime});
  if(!t){state.habitSchedule.start=state.startDate;state.habitSchedule.time=state.startTime;}
  if(opts.project&&state.projects.indexOf(opts.project)===-1){state.projects.push(opts.project);}

  var sh=shell(widget,editTitle?"Modifier l’habitude":"Nouvelle habitude","habit",{saveLabel:editTitle?"Enregistrer":"Créer"}),doc=sh.doc;
  var head=eventHeadBlock(widget,sh,state,{statuses:null,defaultIcon:"↻",placeholder:"Lecture, médicaments, sport…"});
  var habitOptionBar=mk(doc,sh.body,"div","ja-ae-modebar ja-ae-optionbar"),habitReminderCheck=check(doc,habitOptionBar,"Rappel",!!state.reminderTime);habitReminderCheck.parentNode.classList.add("ja-ae-inlinecheck","is-reminder");
  var scheduleApi=habitScheduleEditor(widget,sh.body,state.habitSchedule);
  var habitReminderApi=reminderInline(doc,sh.body,habitReminderCheck,state,{seed:function(){var v=scheduleApi.value();return v.time||"08:00";}});

  var fm=fieldManager(widget,sh,state,HABIT_FIELDS,{});autoOpen(fm,state,HABIT_FIELDS);fm.mountFab();var noteApi=eventNoteBlock(widget,sh.body,state);
  if(editTitle){btn(doc,sh.headActions,"ja-jform-danger","Supprimer").addEventListener("click",function(){if(window.confirm("Supprimer cette habitude ? Les liens associés seront nettoyés.")){Agenda.deleteAgendaObject(widget.wiki,editTitle,"habit");sh.setClean();sh.close();}});}

  sh.save.addEventListener("click",function(){
    state.label=head.title.value.trim();if(!state.label){head.title.focus();return;}
    var schedule=scheduleApi.value();state.startDate=schedule.start||today();state.startTime=schedule.time||"";state.eventType=head.type?head.type.value():state.eventType;state.marker=head.marker.value();state.note=noteApi.value();state.reminderTime=habitReminderApi.value();
    pullFields(fm,state);ensureLinked(widget,state);
    var finalTitle=editTitle||Agenda.uniqueTitle(widget.wiki,state.label+" · habitude"),old=editTitle?widget.wiki.getTiddler(editTitle):null,fields={
      title:finalTitle,tags:agendaTags(old),kind:"habit",label:state.label,
      "start-date":state.startDate,"start-time":state.startTime,"reminder-time":state.reminderTime||"","duration-minutes":state.duration,"show-on-calendar":"no",
      "habit-schedule":JSON.stringify(schedule),recurrence:"",marker:state.marker,"event-type":state.eventType,
      projects:Agenda.stringifyList(state.projects),people:Agenda.stringifyList(state.people),"relation-modes":RelationModes.stringify(state.relationModes,state.people),places:Agenda.stringifyList(state.places),activities:Agenda.stringifyList(state.activities),events:Agenda.stringifyList(state.events),todos:Agenda.stringifyList(state.todos),habits:Agenda.stringifyList(state.habits),media:Agenda.stringifyList(state.media),sleep:Agenda.stringifyList(state.sleep),channels:Agenda.stringifyList(state.channels),dreams:Agenda.stringifyList(state.dreams),
      text:state.note,images:Media.stringifyJsonList(state.images),audios:Media.stringifyJsonList(state.audios),links:Media.stringifyJsonList(state.links),completions:old?String(old.fields.completions||""):"","habit-completion-log":old?String(old.fields["habit-completion-log"]||""):""
    };
    widget.wiki.addTiddler(new $tw.Tiddler(old||{},fields,{created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));
    Agenda.syncAgendaLinks(widget.wiki,finalTitle,"habit",beforeLinks,agendaLinksOfState(state));updateDailyLinks(widget.wiki,finalTitle,"habit",state.dailyLinks);sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* VACANCES                                                            */
/* ------------------------------------------------------------------ */
var VACATION_FIELDS=["projects","people","places","activities","images","audios","links"];

function openVacation(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||null,
      t=editTitle?widget.wiki.getTiddler(editTitle):null,
      f=t?t.fields:{},
      state=commonState(widget,t,editTitle,"event"),
      occurrences=Agenda.vacationOccurrences(t||f);

  if(!occurrences.length){
    var seed=String(opts.date||today());
    occurrences=[{start:seed,end:Agenda.addDays(seed,7)}];
  }
  state.color=String(f.color||"#8fa3c8");
  state.vacationIcon=String(f["vacation-icon"]||f.icon||"🌿");

  var sh=shell(
        widget,
        editTitle?"Modifier les vacances":"Nouvelle période de vacances",
        "vacation",
        {saveLabel:editTitle?"Enregistrer":"Créer"}
      ),
      doc=sh.doc;

  var head=eventHeadBlock(widget,sh,state,{
    type:false,statuses:null,
    fixedIcon:state.vacationIcon,
    fixedIconTitle:"Emoji des vacances",
    editableEmoji:true,
    fixedColor:state.color,
    placeholder:"Vacances d’été…"
  });

  /* Une seule fiche Vacances contient toutes ses vagues annuelles.
     Chaque période est nommable et rangée dans un accordéon compact. */
  var occBox=mk(doc,sh.body,"section","ja-vac-occurrences"),
      occHead=mk(doc,occBox,"div","ja-vac-occurrences-head"),
      occTitle=mk(doc,occHead,"span","ja-agenda-form-label","Occurrences"),
      occHint=mk(doc,occHead,"span","ja-vac-occurrences-hint","Une seule fiche, autant de périodes que nécessaire."),
      occList=mk(doc,occBox,"div","ja-vac-occurrences-list"),
      addOcc=btn(doc,occHead,"ja-jform-secondary","＋ occurrence","Ajouter une nouvelle période à ces mêmes vacances"),
      vacCollapsed=[];

  occurrences=occurrences.map(function(x){
    return {name:String(x.name||"").trim(),start:String(x.start||""),end:String(x.end||x.start||"")};
  });
  occurrences.forEach(function(){vacCollapsed.push(true);});

  function sanitizeOccurrences(){
    return occurrences.map(function(x){
      var a=String(x.start||"")||today(),b=String(x.end||x.start||a)||a;
      if(Agenda.cmp(b,a)<0){b=a;}return {name:String(x.name||"").trim(),start:a,end:b};
    });
  }

  function vacationSummary(occ,index){
    var bits=[String(occ.name||"").trim()||("Occurrence "+(index+1))];
    if(occ.start||occ.end){bits.push((occ.start||"…")+" → "+(occ.end||occ.start||"…"));}
    return bits.join(" · ");
  }

  function drawOccurrences(){
    occurrences=sanitizeOccurrences();
    while(vacCollapsed.length<occurrences.length){vacCollapsed.push(true);}
    if(vacCollapsed.length>occurrences.length){vacCollapsed.length=occurrences.length;}
    occList.innerHTML="";

    occurrences.forEach(function(occ,index){
      var card=mk(doc,occList,"article","ja-vac-occurrence-card"),
          cardHead=mk(doc,card,"div","ja-vac-occurrence-card-head"),
          toggle=btn(doc,cardHead,"ja-vac-occurrence-toggle","",vacCollapsed[index]?"Déplier cette occurrence":"Replier cette occurrence"),
          summary=mk(doc,toggle,"span","ja-vac-occurrence-summary",vacationSummary(occ,index)),
          chevron=mk(doc,toggle,"span","ja-vac-occurrence-chevron",vacCollapsed[index]?"⌄":"⌃"),
          del=btn(doc,cardHead,"ja-vac-occurrence-del","×","Retirer cette occurrence"),
          body=mk(doc,card,"div","ja-vac-occurrence-body");

      function applyCollapse(){
        body.style.display=vacCollapsed[index]?"none":"";
        card.classList.toggle("is-collapsed",vacCollapsed[index]);
        chevron.textContent=vacCollapsed[index]?"⌄":"⌃";
        toggle.title=vacCollapsed[index]?"Déplier cette occurrence":"Replier cette occurrence";
        toggle.setAttribute("aria-expanded",vacCollapsed[index]?"false":"true");
      }
      toggle.addEventListener("click",function(){
        vacCollapsed[index]=!vacCollapsed[index];
        applyCollapse();
      });

      del.disabled=occurrences.length===1;
      del.addEventListener("click",function(e){
        e.stopPropagation();
        if(occurrences.length<=1){return;}
        occurrences.splice(index,1);
        vacCollapsed.splice(index,1);
        drawOccurrences();
      });

      var naming=row(doc,body),
          name=input(doc,naming,"Nom de l’occurrence","text",occ.name);
      name.placeholder="Ex. Halloween 2026, été 2027…";
      name.addEventListener("input",function(){
        occ.name=name.value;
        summary.textContent=vacationSummary(occ,index);
      });

      var dates=row(doc,body),
          a=input(doc,dates,"Début","date",occ.start),
          b=input(doc,dates,"Fin","date",occ.end);

      a.addEventListener("input",function(){
        occ.start=a.value||today();
        if(!b.value||Agenda.cmp(b.value,occ.start)<0){occ.end=occ.start;b.value=occ.start;}
        summary.textContent=vacationSummary(occ,index);
      });
      b.addEventListener("input",function(){
        occ.end=b.value||a.value||today();
        if(a.value&&Agenda.cmp(occ.end,a.value)<0){occ.end=a.value;b.value=a.value;}
        summary.textContent=vacationSummary(occ,index);
      });

      applyCollapse();
    });
  }

  addOcc.addEventListener("click",function(){
    occurrences=sanitizeOccurrences();
    var last=occurrences[0]||{start:today(),end:Agenda.addDays(today(),7)};
    occurrences.forEach(function(x){if(Agenda.cmp(x.start,last.start)>0){last=x;}});
    occurrences.unshift({name:"",start:Agenda.addYears(last.start,1),end:Agenda.addYears(last.end,1)});
    vacCollapsed.unshift(false);
    drawOccurrences();
  });
  drawOccurrences();

  var colorWrap=mk(doc,sh.body,"div","ja-af-pickrow ja-ae-vac-color");
  mk(doc,colorWrap,"span","ja-agenda-form-label","Couleur");
  var color=mk(doc,colorWrap,"input","ja-jform-input ja-af-color");
  color.type="color";
  color.value=state.color;
  color.addEventListener("input",function(){
    state.color=color.value;
    if(head.iconButton){head.iconButton.style.setProperty("--ja-ae-type-col",color.value);}
  });

  var fm=fieldManager(widget,sh,state,VACATION_FIELDS,{});
  autoOpen(fm,state,VACATION_FIELDS);

  var backShortcut=btn(doc,colorWrap,"ja-vac-backdrop-shortcut",
    state.images&&state.images.some(function(x){return x&&x.back;})?"🖼 Modifier le fond":"🖼 Ajouter un fond");
  backShortcut.addEventListener("click",function(){fm.open("images");backShortcut.textContent="🖼 Fond / images";});
  fm.mountFab();
  var noteApi=eventNoteBlock(widget,sh.body,state);

  if(editTitle){
    btn(doc,sh.headActions,"ja-jform-danger","Supprimer").addEventListener("click",function(){
      if(window.confirm("Supprimer ces vacances et toutes leurs occurrences ?")){widget.wiki.deleteTiddler(editTitle);sh.setClean();sh.close();}
    });
  }

  sh.save.addEventListener("click",function(){
    var name=head.title.value.trim()||"Vacances";
    state.marker=head.marker.value();
    state.vacationIcon=head.icon?head.icon.value():(state.vacationIcon||"🌿");
    state.note=noteApi.value();
    pullFields(fm,state);ensureLinked(widget,state);
    occurrences=sanitizeOccurrences();
    var first=occurrences[0]||{start:today(),end:today()},
        finalTitle=editTitle||Agenda.uniqueTitle(widget.wiki,name),
        old=editTitle?widget.wiki.getTiddler(editTitle):null;

    widget.wiki.addTiddler(new $tw.Tiddler(old||{}, {
      title:finalTitle,tags:agendaTags(old),kind:"vacation",label:name,
      "start-date":first.start,"end-date":first.end,
      "vacation-occurrences":JSON.stringify(occurrences),
      color:color.value||"#8fa3c8","vacation-icon":state.vacationIcon||"🌿",
      marker:state.marker,projects:Agenda.stringifyList(state.projects),
      people:Agenda.stringifyList(state.people),
      "relation-modes":RelationModes.stringify(state.relationModes,state.people),
      places:Agenda.stringifyList(state.places),activities:Agenda.stringifyList(state.activities),
      text:state.note,images:Media.stringifyJsonList(state.images),
      audios:Media.stringifyJsonList(state.audios),links:Media.stringifyJsonList(state.links)
    },{created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));
    sh.setClean();sh.close();
  });
}

/* ------------------------------------------------------------------ */
/* OCCURRENCE UNIQUE                                                   */
/* ------------------------------------------------------------------ */
function openOccurrenceEdit(widget,item){
  if(!item||!item.recurring||item.role==="birthday"){return;}
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,
      orig=item.originalDate||item.date,
      current=Agenda.getOccurrenceOverride(widget.wiki,ref,orig)||{},
      sh=shell(widget,"Occurrence du "+orig,"event",{saveLabel:"Enregistrer cette occurrence"}),
      doc=sh.doc,body=sh.body,
      state={marker:String(current.marker!==undefined?current.marker:item.marker||"")};
  mk(doc,body,"div","ja-agenda-form-hint","Tu modifies seulement cette occurrence. La série entière reste intacte.");
  var rr=row(doc,body),
      date=input(doc,rr,"Date","date",String(current.date||current.nouvelleDate||item.date||orig)),
      start=input(doc,rr,"Début","time",String(current["start-time"]||current.nouvelleHeureDebut||item.startTime||"")),
      end=input(doc,rr,"Fin","time",String(current["end-time"]||current.nouvelleHeureFin||item.endTime||""));
  var statusApi=segmented(doc,body,"Statut",String(current.status||current.statut||item.status||"normal"),
    [["normal","Normal"],["annule","Annulée"],["reporte","Reportée"],["avance","Avancée"]]);
  var markerApi=markerPicker(widget,body,state.marker,function(v){state.marker=v;});
  var note=input(doc,body,"Note de cette occurrence","textarea",
    current.note!==undefined?String(current.note||""):String(item.note||""));
  if(current&&Object.keys(current).length){
    btn(doc,sh.headActions,"ja-jform-secondary","Réinitialiser").addEventListener("click",function(){
      Agenda.clearOccurrenceOverride(widget.wiki,ref,orig);sh.setClean();sh.close();
    });
  }
  sh.save.addEventListener("click",function(){
    Agenda.setOccurrenceOverride(widget.wiki,ref,orig,{
      date:date.value||orig,"start-time":start.value||"","end-time":end.value||"",
      status:statusApi.value()||"normal",note:note.value||"",marker:markerApi.value()||""
    });
    sh.setClean();sh.close();
  });
}


/* ------------------------------------------------------------------ */
/* PROJET                                                              */
/* ------------------------------------------------------------------ */
/*
  Un projet n'était pas un objet : il n'existait que si un item citait son
  nom, et on ne pouvait ni le créer, ni lui donner une couleur, ni un type,
  sans éditer le tiddler à la main. Il devient une fiche à part entière —
  et son type, sa couleur et sa bannière descendent sur tout ce qui lui est
  rattaché, sauf si l'objet a déjà les siens.
*/
var PROJECT_FIELDS=["people","places","activities","note","images","audios","links"];

function openProject(widget,opts){
  opts=opts||{};
  var editTitle=opts.editTitle||null,
      t=editTitle?widget.wiki.getTiddler(editTitle):null,
      f=t?t.fields:{},
      state=commonState(widget,t,editTitle,"event");

  var sh=shell(widget,editTitle?"Modifier le projet":"Nouveau projet","event",{
        saveLabel:editTitle?"Enregistrer":"Créer",
        kicker:"Projet",
        icon:"🧩",
        modalClass:"ja-entity-form ja-project-form"
      }),
      doc=sh.doc;

  /* Ligne 1 : exactement la mécanique compacte de l'Événement :
     type rond, nom au centre, marqueurs du Journal à droite. */
  var head=eventHeadBlock(widget,sh,state,{
    statuses:[],
    defaultIcon:"🧩",
    placeholder:"Nom du projet…"
  });

  /* Ligne 2 : les dates sont facultatives. Elles n'occupent donc aucune
     place tant qu'on n'a pas demandé à les renseigner. */
  var dates=mk(doc,sh.body,"div","ja-entity-row ja-project-dates");

  function optionalDate(parent,label,value){
    var box=mk(doc,parent,"div","ja-project-date"),cur=String(value||""),
        ctl=mk(doc,box,"div","ja-project-date-control");
    mk(doc,box,"span","ja-agenda-form-label",label);
    function draw(){
      ctl.innerHTML="";
      if(cur){
        var input=mk(doc,ctl,"input","ja-jform-input ja-agenda-form-input");
        input.type="date";input.value=cur;
        input.addEventListener("change",function(){cur=input.value;});
        var rm=btn(doc,ctl,"ja-project-date-remove","×","Retirer "+label.toLowerCase());
        rm.addEventListener("click",function(){cur="";draw();});
      }else{
        var add=btn(doc,ctl,"ja-jform-secondary ja-project-date-add","＋ "+label);
        add.addEventListener("click",function(){
          cur=Agenda.todayIso();draw();
          var input=ctl.querySelector('input[type="date"]');if(input){input.focus();}
        });
      }
    }
    draw();
    return {value:function(){return cur;}};
  }

  var startDate=optionalDate(dates,"Date de début",String(f["start-date"]||f.start||"")),
      deadline=optionalDate(dates,"Deadline",String(f.deadline||""));

  /* Ligne 3 : le même éditeur riche que les notes Daily/Agenda. */
  var noteBlock=mk(doc,sh.body,"section","ja-entity-editor-block");
  mk(doc,noteBlock,"div","ja-agenda-form-label","Notes");
  var noteState={note:String(f.text||f.note||"")},
      noteEditor=borrow(widget,"buildNoteEditor",noteBlock,noteState),
      noteFallback=null;
  if(!noteEditor){
    noteFallback=input(doc,noteBlock,"","textarea",noteState.note,"Notes…");
  }else{
    var area=noteBlock.querySelector(".ja-note-area");
    if(area){area.dataset.placeholder="Notes du projet…";}
  }

  if(editTitle){
    btn(doc,sh.headActions,"ja-jform-danger","Supprimer").addEventListener("click",function(){
      if(!window.confirm("Supprimer ce projet ? Les to-dos et événements sont conservés, ils sont simplement détachés.")){return;}
      var now=new Date();
      widget.wiki.each(function(tt){
        if(!tt||!tt.fields){return;}
        var ps=list(tt.fields.projects);
        if(ps.indexOf(editTitle)===-1){return;}
        widget.wiki.addTiddler(new $tw.Tiddler(tt,
          {projects:Agenda.stringifyList(ps.filter(function(x){return x!==editTitle;}))},
          {modified:now}));
      });
      widget.wiki.deleteTiddler(editTitle);
      sh.setClean();sh.close();
    });
  }

  sh.save.addEventListener("click",function(){
    var name=head.title.value.trim();
    if(!name){head.title.focus();return;}
    state.eventType=head.type?head.type.value():state.eventType;
    state.marker=head.marker?head.marker.value():state.marker;

    var cfg=Agenda.readConfig(widget.wiki),
        typeMeta=Agenda.eventType(cfg,state.eventType),
        derivedColor=(typeMeta&&typeMeta.color)?String(typeMeta.color):String(f.color||"#8fa3c8"),
        finalTitle=editTitle||Agenda.uniqueTitle(widget.wiki,name),
        old=editTitle?widget.wiki.getTiddler(editTitle):null,
        tags=old?Agenda.tagsOf(old):[];
    if(tags.indexOf("Projet")===-1){tags.push("Projet");}

    widget.wiki.addTiddler(new $tw.Tiddler(old||{},{
      title:finalTitle,
      tags:tags,
      kind:"project",
      label:name,
      "event-type":state.eventType||"",
      marker:state.marker||"",
      color:derivedColor,
      "start-date":startDate.value()||undefined,
      deadline:deadline.value()||undefined,
      text:noteEditor?noteEditor.value():(noteFallback?noteFallback.value:"")
    },{created:old&&old.fields.created?old.fields.created:new Date(),modified:new Date()}));

    sh.setClean();sh.close();
  });
}

exports.openEvent=openEvent;
exports.openTodo=openTodo;
exports.openHabit=openHabit;
exports.openVacation=openVacation;
exports.openSlot=function(widget,opts){opts=opts||{};opts.role="slot";openEvent(widget,opts);};
exports.openOccurrence=function(widget,title,date){openEvent(widget,{copyFrom:title,date:date||Agenda.addDays(today(),7)});};
exports.openOccurrenceEdit=openOccurrenceEdit;
exports.openProject=openProject;

/* Primitives volontairement partagées avec les autres formulaires de Mon Journal.
   On exporte la vraie base au lieu de recopier sa DA dans chaque catégorie. */
exports.shared={
  shell:shell,
  input:input,
  select:select,
  check:check,
  row:row,
  segmented:segmented,
  typePicker:typePicker,
  markerPicker:markerPicker,
  eventHeadBlock:eventHeadBlock,
  popover:formPopover,
  button:btn,
  mk:mk,
  noteEditor:function(widget,parent,state){return borrow(widget,"buildNoteEditor",parent,state);},
  audioField:function(widget,parent,state){return borrow(widget,"buildAudioField",parent,state);}
};
