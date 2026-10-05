/*\
title: $:/journalapp/modules/widgets/agenda.js
type: application/javascript
module-type: widget

Mon Journal — Agenda natif TiddlyWiki, vues partagées.
V2 : mois, semaine horaire et créneaux-conteneurs sur le noyau Agenda commun.
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var Agenda=require("$:/journalapp/modules/lib/agenda.js");
var JConfig=require("$:/journalapp/modules/lib/jconfig.js");
var Forms=require("$:/journalapp/modules/lib/agenda-forms.js");
var Media=require("$:/journalapp/modules/lib/jmedia.js");
var AgendaUI=require("$:/journalapp/modules/lib/agenda-ui.js");

var DATE_STATE="$:/state/journalapp/agenda-date";
var FILTER_STATE_PREFIX="$:/state/journalapp/agenda-filter-";
var FILTER_OPEN_PREFIX="$:/state/journalapp/agenda-filter-open-";
var ORG_OPEN_STATE="$:/state/journalapp/agenda-organisation-open";
var ORG_PROJECT_STATE="$:/state/journalapp/agenda-project-open";
var ORG_UNSORTED_STATE="$:/state/journalapp/agenda-organisation-unsorted";
var SEL_STATE="$:/state/journalapp/agenda-selection";
var DAY_PICK_STATE="$:/state/journalapp/agenda-day-pick";
var OVERVIEW_FOCUS_STATE="$:/temp/journalapp/agenda-overview-focus";
var HABIT_SIDEBAR_OPEN_STATE="$:/state/journalapp/agenda-habits-open";
var HABIT_SIDEBAR_PERIOD_OPEN_STATE="$:/state/journalapp/agenda-habits-period-open";
var JOURNAL_CATEGORY_STATE="$:/state/journalapp/category";
var JOURNAL_CATEGORY="$:/journalapp/categories/journal";
var JOURNAL_VIEW_STATE="$:/state/journalapp/view";
var JOURNAL_VIEW="$:/journalapp/views/journal/home";
var JOURNAL_DATE_STATE="$:/state/journalapp/journal-date";
var JOURNAL_FOCUS_STATE="$:/state/journalapp/journal-focus-daily";
var DOW_MONDAY=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
var DOW_SUNDAY=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
function mk(doc,p,tag,cls,text){var e=doc.createElement(tag);if(cls){e.className=cls;}if(text!==undefined){e.textContent=text;}if(p){p.appendChild(e);}return e;}
function button(doc,p,cls,text,title){var b=mk(doc,p,"button",cls,text);b.type="button";if(title){b.title=title;b.setAttribute("aria-label",title);}return b;}
function dateValue(w){var v=w.wiki.getTiddlerText(DATE_STATE,"");return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:Agenda.todayIso();}
function setDate(w,iso){w.wiki.setText(DATE_STATE,"text",null,iso,{suppressTimestamp:true});}
function pretty(iso){var d=Agenda.parseIso(iso);return new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);}
function prettyMonth(iso){var d=Agenda.parseIso(iso),s=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(d);return s.charAt(0).toUpperCase()+s.slice(1);}
function prettyWeek(iso,first){var a=Agenda.startOfWeek(iso,first),b=Agenda.endOfWeek(iso,first),da=Agenda.parseIso(a),db=Agenda.parseIso(b);if(da.getMonth()===db.getMonth()){return da.getDate()+" – "+db.getDate()+" "+new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(db);}return da.getDate()+" "+new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(da)+" – "+db.getDate()+" "+new Intl.DateTimeFormat("fr-FR",{month:"short",year:"numeric"}).format(db);}
function markerOf(w,id){var list=JConfig.read(w.wiki).markers||[],m=null;list.some(function(x){if(String(x.id)===String(id||"")){m=x;return true;}return false;});return m;}
function closeOnEsc(doc,overlay,fn){var h=function(e){if(e.key==="Escape"){doc.removeEventListener("keydown",h,true);overlay.remove();if(fn){fn();}}};doc.addEventListener("keydown",h,true);return h;}
function itemColor(w,item){var marker=markerOf(w,item.marker),type=effectiveType(w,item);
  /* Une couleur de TYPE configurée est la source de vérité.
     Un ancien champ color sur l'item ne doit pas gagner sur Settings. */
  if(type&&type.color){return type.color;}
  if(item&&item.color){return item.color;}
  if(marker&&marker.color){return marker.color;}
  var ps=item&&item.projects||[];for(var i=0;i<ps.length;i++){var pt=w.wiki.getTiddler(ps[i]);if(pt&&pt.fields&&pt.fields.color){return String(pt.fields.color);}}
  /* Sans type, sans marqueur, sans projet, la couleur retombait sur "" et
     l'élément se retrouvait gris sur gris : rien ne le distinguait d'un
     autre dans une case de vue mois. Une teinte de repli par nature d'objet
     vaut mieux que pas de couleur du tout. */
  if(item){
    if(item.kind==="todo"){return "#b98cc4";}
    if(item.kind==="habit"){return "#6fae9c";}
    if(item.role==="slot"){return "#8aa2c8";}
    if(item.role==="birthday"){return "#d99a6c";}
    if(item.kind==="event"){return "#8e8fd7";}
  }
  return "";}
function timeOf(item){return item.startTime||item.reminderTime||"";}
function itemKey(item){return item.kind+"::"+item.title+"::"+(item.originalDate||item.date||"");}
/*
  LE FOND D'UN ÉLÉMENT D'AGENDA.

  Diagnostic, parce qu'il a fallu le démêler : l'image vivait dans un
  ::before en z-index:-1, le voile de lisibilité dans un ::after au MÊME
  z-index. À égalité, CSS départage par ordre de déclaration — le voile
  gagnait et se peignait par-dessus la photo. Pire : n'importe quel enfant
  au fond opaque (la tête d'un créneau, une carte fille) repassait devant
  et enterrait l'image. Elle ne survivait que sur le liseré du bord.

  On arrête d'arbitrer des calques. L'image devient le `background-image`
  de l'élément lui-même, le dégradé listé EN PREMIER dans la même
  déclaration : il se peint devant la photo, dans le même calque, sans
  qu'aucun z-index n'ait son mot à dire. Les enfants opaques passent en
  translucide, explicitement, côté CSS.
*/
/* La couleur d'un élément, posée EN LIGNE et non via une variable CSS que
   trois feuilles se disputent. Une pastille de vue mois doit porter sa
   couleur de type ; c'est le seul repère dont on dispose à cette taille. */
function hexRgb(hex){
  hex=String(hex||"").trim();
  var m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if(!m){return null;}
  var h=m[1];
  if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];}
  return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)].join(",");
}
function paintPill(w,el,item,fill){
  var col=itemColor(w,item);
  if(!col){return;}
  el.style.setProperty("--ja-item-color",col);
  var rgb=hexRgb(col);
  if(rgb){
    el.style.backgroundColor="rgba("+rgb+","+(fill==null?0.30:fill)+")";
    el.style.borderLeft="2px solid "+col;
  }
}
/* Sélectionne le fond effectif : objet > type automatique > projet. */
function backdropRole(item){
  if(!item){return "";}
  if(item.kind==="todo"){return "todo";}
  if(item.kind==="habit"){return "habit";}
  if(item.kind==="event"&&item.role==="slot"){return "slot";}
  if(item.kind==="event"&&item.role!=="birthday"){return "event";}
  return "";
}
function backdropOf(w,item){
  var imgs=(item&&item.images||[]).slice(),back=null;
  imgs.some(function(im){
    if(im&&(im.back||im.banner||im.baniere)){back=im;return true;}
    return false;
  });
  if(!back){
    var role=backdropRole(item),ty=role?effectiveType(w,item):null,
        raw=ty&&ty.backgrounds?ty.backgrounds[role]:null;
    if(raw){
      /* Compatibilité descendante : les anciens fonds automatiques ne
         stockaient qu'un titre d'image. Les nouveaux peuvent conserver
         tout le réglage d'un vrai fond (opacité, cadrage, position, fondu). */
      if(typeof raw==="string"){
        back={src:raw,back:true,autoType:true};
      }else if(typeof raw==="object"){
        back=Object.assign({},raw);
        if(raw.ref&&!back.src){back.src=raw.ref;}
        back.back=true;
        back.autoType=true;
      }
    }
  }
  if(!back){
    var ps=item&&item.projects||[];
    for(var i=0;i<ps.length&&!back;i++){
      var pt=w.wiki.getTiddler(ps[i]);if(!pt||!pt.fields){continue;}
      var pimgs=Agenda.parseJson(pt.fields.images,[])||[];
      pimgs.some(function(im){if(im&&(im.back||im.banner||im.baniere)){back=im;return true;}return false;});
    }
  }
  return back;
}
function applyBackdrop(w,el,item,scale){
  var back=backdropOf(w,item);if(!back){return false;}
  var ok=Media.applyBackdropLayer(w.wiki,el,back,{
    hostClass:"ja-agenda-backdrop-host",layerClass:"ja-agenda-backdrop-layer"
  });
  if(ok&&scale){el.classList.add("is-"+scale);}
  return ok;
}

function dayItemsFromRange(events,todos,habits,iso){
  if(typeof habits==="string"){iso=habits;habits=[];}habits=habits||[];var out=[];
  events.forEach(function(e){var end=e.endDate||e.date;if(Agenda.inRange(iso,e.date,end)){out.push(e);}});
  todos.forEach(function(t){if(t.date===iso){out.push(t);}});
  habits.forEach(function(h){if(h.date===iso){out.push(h);}});
  out.sort(function(a,b){return (timeOf(a)||"24:00").localeCompare(timeOf(b)||"24:00")||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title);});
  return out;
}
function lanesFor(items){
  var lanes=[];
  items.forEach(function(it){var lane=-1;for(var i=0;i<lanes.length;i++){if(lanes[i]<=it.start){lane=i;break;}}if(lane<0){lane=lanes.length;lanes.push(it.end);}else{lanes[lane]=it.end;}it.lane=lane;});
  return Math.max(1,lanes.length);
}

function readJsonState(wiki,title,fallback){try{var raw=wiki.getTiddlerText(title,"");return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
function writeJsonState(wiki,title,value){wiki.setText(title,"text",null,JSON.stringify(value),{suppressTimestamp:true});}
function filterKind(item){if(item&&item.role==="birthday"){return "birthday";}if(item&&item.kind==="event"&&item.role==="slot"){return "slot";}return item&&item.kind||"event";}
/*
  SÉLECTION MULTI-GRANULARITÉ.
  L'agenda ne connaissait qu'une chose : un jour. On ne pouvait donc rien
  demander d'autre qu'un jour — cliquer « Février » ne faisait rien, et le
  détail sous la grille ne savait afficher qu'une date. Une sélection est
  maintenant un couple {kind, iso} : jour, semaine, mois ou année.
*/
function readSel(w){
  var raw=w.wiki.getTiddlerText(SEL_STATE,"");
  var sel=Agenda.parseJson(raw,null);
  if(sel&&sel.kind&&sel.iso){return sel;}
  return null;
}
function writeSel(w,sel){
  w.wiki.setText(SEL_STATE,"text",null,sel?JSON.stringify(sel):"",{suppressTimestamp:true});
}
function selRange(sel,first){
  if(!sel){return null;}
  switch(sel.kind){
    case "semaine": return [Agenda.startOfWeek(sel.iso,first),Agenda.endOfWeek(sel.iso,first)];
    case "mois":    return [Agenda.startOfMonth(sel.iso),Agenda.endOfMonth(sel.iso)];
    case "annee":   return [sel.iso.slice(0,4)+"-01-01",sel.iso.slice(0,4)+"-12-31"];
    default:        return [sel.iso,sel.iso];
  }
}
function selTitle(sel,first){
  if(!sel){return "";}
  var d=Agenda.parseIso(sel.iso);
  if(sel.kind==="mois"){return prettyMonth(sel.iso);}
  if(sel.kind==="annee"){return "Année "+d.getFullYear();}
  if(sel.kind==="semaine"){return "Semaine du "+prettyWeek(sel.iso,first);}
  return pretty(sel.iso);
}
/* La date « cible » d'un ajout : le jour choisi, sinon aujourd'hui s'il
   tombe dans la période, sinon son premier jour. */
function selTarget(sel,first){
  if(!sel){return Agenda.todayIso();}
  if(sel.kind==="jour"){return sel.iso;}
  var r=selRange(sel,first),t=Agenda.todayIso();
  return (Agenda.cmp(t,r[0])>=0&&Agenda.cmp(t,r[1])<=0)?t:r[0];
}
function relativeDay(iso){
  var n=Agenda.cmp(iso,Agenda.todayIso());
  if(n===0){return "aujourd'hui";}
  var days=Math.round((Agenda.parseIso(iso)-Agenda.parseIso(Agenda.todayIso()))/86400000);
  if(days===1){return "demain";}
  if(days===-1){return "hier";}
  if(days>0){return "dans "+days+" jours";}
  return "il y a "+Math.abs(days)+" jours";
}

/*
  HÉRITAGE DU PROJET.
  La couleur et la bannière descendaient déjà du projet vers ses items ;
  le type, non. Un événement « Refonte du site » restait donc « sans type »
  alors que son projet est marqué Travail — et disparaissait dès qu'on
  filtrait sur Travail. On résout le type EFFECTIF : le sien d'abord, celui
  de son premier projet ensuite.
*/
function effectiveType(w,item){
  if(item&&item.type){return item.type;}
  var cfg=Agenda.readConfig(w.wiki);

  /* Certaines vues travaillent avec rawFilterItem(), qui conserve typeId
     mais ne construit pas item.type. Avant, ce cas tombait directement sur
     la couleur de secours de l'objet (bleu pour un créneau). */
  if(item&&item.typeId){
    var direct=Agenda.eventType(cfg,String(item.typeId||""));
    if(direct){return direct;}
  }

  var ps=(item&&item.projects)||[];
  for(var i=0;i<ps.length;i++){
    var pt=w.wiki.getTiddler(ps[i]);
    if(!pt||!pt.fields){continue;}
    var id=String(pt.fields["event-type"]||"");
    if(id){var ty=Agenda.eventType(cfg,id);if(ty){return ty;}}
  }
  return null;
}
function effectiveTypeId(w,item){var ty=effectiveType(w,item);return ty?String(ty.id||""):"";}
function sameEffectiveType(w,a,b){
  var aa=effectiveTypeId(w,a),bb=effectiveTypeId(w,b);
  return !!aa&&!!bb&&aa===bb;
}
function slotContaining(groups,item){
  var found=null;
  (groups&&groups.slots||[]).some(function(g){
    if(g.inside.indexOf(item)!==-1){found=g;return true;}
    return false;
  });
  return found;
}

function configuredIconSrc(w,obj){
  return obj&&obj.image?JConfig.imageSrc(w.wiki,String(obj.image||"")):"";
}
function appendConfiguredIcon(w,parent,obj,cls){
  var src=configuredIconSrc(w,obj);
  if(src){
    var im=mk(w.document,parent,"img",cls||"ja-agenda-config-icon");
    im.src=src;im.alt="";
    return im;
  }
  return mk(w.document,parent,"span",(cls||"ja-agenda-config-icon")+" is-emoji",
            String((obj&&(obj.icon||obj.emoji))||""));
}


/*
  MARQUEURS AFFICHÉS PAR VUE.
  Tous les marqueurs s'affichaient dans toutes les vues. En vue mois, une
  pastille fait douze pixels de haut : trois emojis y mangent la place du
  titre. On peut désormais choisir, vue par vue, lesquels méritent d'y
  figurer. Rien de configuré = tout s'affiche, comme avant.
*/
function markersShownIn(w,mode){
  var cfg=Agenda.readConfig(w.wiki),m=cfg.markersPerView;
  if(!m||typeof m!=="object"){return null;}
  var v=m[mode||w.mode];
  return Array.isArray(v)?v:null;
}
/* Le glyphe se masque ; la COULEUR du marqueur, elle, continue de teinter
   l'élément. Masquer un signe ne doit pas faire perdre son information. */
function markerShown(w,id){
  if(!id){return false;}
  var allowed=markersShownIn(w,null);
  return !allowed||allowed.indexOf(String(id))!==-1;
}
function markerGlyph(w,item){
  if(!item||!item.marker||!markerShown(w,item.marker)){return null;}
  return markerOf(w,item.marker);
}

/*
  ORDRE DU FIL.
  En vue liste, on veut parfois voir venir (le plus proche d'abord) et
  parfois relire (le plus récent d'abord). C'était figé.
*/
function listOrderOf(w){
  var cfg=Agenda.readConfig(w.wiki);
  return String(cfg.listOrder||cfg.timelineOrder||"nearest-first");
}

/*
  LA FENÊTRE HORAIRE.
  Afficher 07:00–23:00 quand la journée tient entre 9h et 18h, c'est faire
  défiler seize rangées pour en lire neuf : la semaine paraît interminable
  et chaque bloc est écrasé. On cadre donc sur ce qu'il y a réellement,
  avec une heure de marge de chaque côté et un minimum de huit heures pour
  qu'une journée vide garde une allure de journée.

  Même fenêtre et même échelle pour la semaine et le jour : les deux vues
  se lisent à la même hauteur, on passe de l'une à l'autre sans se
  réhabituer.
*/
/*
  LA FENÊTRE HORAIRE : 06:00 → 22:00, point.
  J'avais fait une fenêtre qui se calait sur le contenu. C'était plus malin
  que demandé et surtout imprévisible : la grille changeait de hauteur à
  chaque ajout d'événement, on ne pouvait pas s'y repérer. Une amplitude
  fixe, la même partout, réglable dans la config si besoin.
*/
function hourWindow(w,items,cfg){
  var H0=Math.max(0,+cfg.weekStartHour||6),
      H1=Math.min(24,+cfg.weekEndHour||22);
  if(H1<=H0){H0=6;H1=22;}
  return {H0:H0,H1:H1};
}
function hourScale(w,hours){
  var doc=w.document,
      viewportH=(doc.defaultView&&doc.defaultView.innerHeight)||800;
  /* Une seule échelle pour les deux vues : le juste milieu entre une
     semaine qui n'en finissait pas et un jour trop tassé. */
  /* Seize rangées doivent tenir sans faire défiler tout l'écran. */
  /* Sur 24 rangées, coller à la hauteur d'écran donnerait des lignes de
     20px où plus rien ne tient. On accepte de défiler : le plancher prime. */
  var px=Math.floor((viewportH-250)/Math.max(hours,1));
  return hours>18?Math.max(34,Math.min(46,px+14)):Math.max(26,Math.min(40,px));
}

/*
  L'ÉLÉMENT MIS EN AVANT DANS LA VUE JOUR.
  Cliquer ouvrait aussitôt le formulaire d'édition : pour simplement
  regarder ce qu'on avait prévu, il fallait ouvrir une modale et la
  refermer. Le clic sélectionne désormais, le panneau se met à jour, et
  l'édition reste à une action de là.
*/
function readDayPick(w){
  var raw=w.wiki.getTiddlerText(DAY_PICK_STATE,"");
  var p=Agenda.parseJson(raw,null);
  return (p&&p.ref)?p:null;
}
function writeDayPick(w,pick){
  w.wiki.setText(DAY_PICK_STATE,"text",null,pick?JSON.stringify(pick):"",{suppressTimestamp:true});
}

function projectTitles(wiki){var out=[];wiki.each(function(t,title){if(!t||!t.fields){return;}var tags=Agenda.tagsOf(t);if(String(t.fields.kind||"")==="project"||tags.indexOf("Projet")!==-1){out.push(title);}});return out.sort(function(a,b){return a.localeCompare(b,"fr");});}
function rawFilterItem(title,t){var f=t.fields||{},kind=String(f.kind||"");return {refTitle:title,title:String(f.label||title),tiddler:t,kind:kind==="event"?"event":kind,role:String(f["agenda-role"]||""),marker:String(f.marker||""),typeId:String(f["event-type"]||""),projects:Agenda.parseList(f.projects)};}
function vacationVisual(w,v){
  var t=v&&v.tiddler?v.tiddler:null,
      f=t&&t.fields?t.fields:{};
  return {
    refTitle:(v&&v.refTitle)||(v&&v.title)||String(f.title||""),
    title:String((v&&v.label)||f.label||f.title||"Vacances"),
    label:String((v&&v.label)||f.label||f.title||"Vacances"),
    tiddler:t,
    kind:"vacation",
    role:"vacation",
    color:String((v&&v.color)||f.color||"#8fa3c8"),
    icon:String(f["vacation-icon"]||f.icon||"🌿"),
    marker:String(f.marker||""),
    projects:Agenda.parseList(f.projects),
    images:Media.parseJsonList(f.images||"")
  };
}

function openDailyInJournal(w,rec){
  if(!rec){return;}
  var f=rec.tiddler&&rec.tiddler.fields?rec.tiddler.fields:{},date=String(f.date||w.date||Agenda.todayIso());
  w.wiki.setText(JOURNAL_CATEGORY_STATE,"text",null,JOURNAL_CATEGORY,{suppressTimestamp:true});
  w.wiki.setText(JOURNAL_VIEW_STATE,"text",null,JOURNAL_VIEW,{suppressTimestamp:true});
  w.wiki.setText(JOURNAL_DATE_STATE,"text",null,date,{suppressTimestamp:true});
  w.wiki.setText(JOURNAL_FOCUS_STATE,"text",null,rec.title||"",{suppressTimestamp:true});
}
function openLinkedDailyForm(w,item){
  if(!item||item.role==="birthday"){return;}
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields&&item.tiddler.fields.title)||item.title,
      field=Agenda.agendaLinkField(item.kind),seed={};
  seed[field]=[ref];
  try{
    require("$:/journalapp/modules/widgets/journal.js").openDailyForm(w,{
      date:String(item.date||w.date||Agenda.todayIso()),
      seed:seed
    });
  }catch(err){
    if(window&&window.console){console.error("Impossible d’ouvrir la Daily liée",err);}
  }
}
function addInlineEdit(w,parent,item,extraClass){
  if(!item||item.role==="birthday"){return null;}
  var cls=extraClass?" "+extraClass:"",
      tools=mk(w.document,parent,"span","ja-agenda-inline-tools"+cls),
      link=button(w.document,tools,"ja-agenda-inline-daily"+cls,"☺","Créer une entrée Journal liée"),
      edit=button(w.document,tools,"ja-agenda-inline-edit"+cls,"✎","Modifier");
  link.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openLinkedDailyForm(w,item);});
  edit.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();w.editItem(item);});
  return edit;
}
function dailySummary(w,parent,rec){
  var doc=w.document,f=rec.tiddler.fields,card=mk(doc,parent,"article","ja-agenda-daily-detail"),
      head=mk(doc,card,"div","ja-agenda-daily-detail-head");
  mk(doc,head,"span","ja-agenda-daily-detail-mood",String(f["mood-emoji"]||"✎"));
  mk(doc,head,"strong","ja-agenda-daily-detail-title",String(f.time||"Entrée Daily"));
  if(f["weather-emoji"]){mk(doc,head,"span","ja-agenda-daily-detail-weather",String(f["weather-emoji"])+(f["weather-temp"]!==undefined&&f["weather-temp"]!==""?" "+Math.round(+f["weather-temp"])+"°":""));}
  var scales=mk(doc,card,"div","ja-agenda-daily-detail-meta");
  if(f.energy!==undefined&&String(f.energy)!==""){mk(doc,scales,"span","ja-agenda-chip","⚡ "+f.energy+"/5");}
  if(f.stress!==undefined&&String(f.stress)!==""){mk(doc,scales,"span","ja-agenda-chip","🌪️ "+f.stress+"/5");}
  if(String(f.regles||"")==="yes"){mk(doc,scales,"span","ja-agenda-chip","🩸");}
  [["places","📍"],["people","👤"],["activities","🏃"],["projects","🧩"],["events","📅"],["todos","☑"],["habits","↻"],["media","🎞️"],["sleep","🌙"]].forEach(function(g){
    Agenda.parseList(f[g[0]]).forEach(function(v){mk(doc,scales,"span","ja-agenda-chip",g[1]+" "+v);});
  });
  if(!scales.childNodes.length){scales.remove();}
  var txt=Agenda.noteToPlainText(f.text,doc);
  if(txt){mk(doc,card,"div","ja-agenda-daily-detail-note",txt);}
  var imgs=Media.parseJsonList(f.images||"").filter(function(x){return x&&!x.back&&!x.banner&&Media.src(w.wiki,x.src||x.path||"");});
  if(imgs.length){var strip=mk(doc,card,"div","ja-agenda-daily-detail-images");imgs.forEach(function(x){var im=mk(doc,strip,"img","");im.src=Media.src(w.wiki,x.src||x.path||"");im.alt=x.caption||"";});}
  var da=Media.parseJsonList(f.audios||"");
  if(da.length){var ab=mk(doc,card,"div","ja-agenda-daily-detail-audios");da.forEach(function(ref){var src=Media.src(w.wiki,ref);if(!src){return;}var a=mk(doc,ab,"audio","");a.controls=true;a.preload="metadata";a.src=src;a.addEventListener("click",function(e){e.stopPropagation();});});}
  var dl=Media.parseJsonList(f.links||"");
  if(dl.length){var lb=mk(doc,card,"div","ja-agenda-daily-detail-links");dl.forEach(function(l){if(!l||!l.url){return;}var a=mk(doc,lb,"a","ja-agenda-card-link",String(l.url));a.href=l.internal?"#":l.url;if(l.internal){a.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();w.dispatchEvent({type:"tm-navigate",navigateTo:l.url});});}else{a.target="_blank";a.rel="noopener";a.addEventListener("click",function(e){e.stopPropagation();});}});}
  card.title="Ouvrir cette entrée dans le Journal";
  card.addEventListener("click",function(e){if(e.target.closest("button,a,input,audio")){return;}openDailyInJournal(w,rec);});
  return card;
}

function todoStatus(t){
  var s=String((t&&t.fields&&(t.fields.status||t.fields.statut))||"a_faire").toLowerCase();
  if(s==="done"){return "fait";}
  if(s==="encours"||s==="en-cours"){return "en_cours";}
  if(["a_faire","en_cours","fait","reporte","annule"].indexOf(s)===-1){return "a_faire";}
  return s;
}
function todoClosed(t){var s=todoStatus(t);return s==="fait"||s==="annule";}
function fmtEffort(min){min=Math.max(0,+min||0);if(!min){return "0 min";}var h=Math.floor(min/60),m=min%60;if(!h){return m+" min";}return h+" h"+(m?" "+m+" min":"");}
function recurrenceLabel(raw,base){var r=Agenda.normalizeRecurrence(raw,base);if(!r){return "Ponctuel";}var freq={day:"jour",week:"semaine",month:"mois",year:"année"}[r.frequency]||r.frequency,txt=(r.interval>1?"Tous les "+r.interval+" "+freq+"s":"Chaque "+freq);if(r.frequency==="week"&&r.weekdays&&r.weekdays.length){var ds=["L","M","M","J","V","S","D"];txt+=" · "+r.weekdays.map(function(i){return ds[+i]||"";}).join(" ");}if(r.end){txt+=" · jusqu’au "+r.end;}return txt;}

function AgendaWidget(parseTreeNode,options){this.initialise(parseTreeNode,options);}
AgendaWidget.prototype=new Widget();

/*
  API PUBLIQUE.
  De quoi piloter l'Agenda depuis un bouton wikitext, une macro ou la
  console, sans dépendre des rouages internes. Exposée une seule fois, sur
  la première instance rendue ; elle retrouve le widget vivant à chaque
  appel plutôt que d'en capturer un qui aura disparu au prochain rendu.
*/
function publishApi(w){
  if(typeof window==="undefined"){return;}
  var root=window;
  if(root.MonJournalAgenda&&root.MonJournalAgenda._v===2){root.MonJournalAgenda._w=w;return;}
  var api={
    _v:2,_w:w,
    /* Navigation */
    goTo:function(iso){setDate(api._w,String(iso||Agenda.todayIso()));},
    today:function(){setDate(api._w,Agenda.todayIso());},
    select:function(kind,iso){api._w.select({kind:String(kind||"jour"),iso:String(iso||Agenda.todayIso())});},
    close:function(){api._w.closeDetail();},
    selection:function(){return api._w.selection();},
    /* Création */
    newEvent:function(o){Forms.openEvent(api._w,o||{date:api._w.date});},
    newTodo:function(o){Forms.openTodo(api._w,o||{date:api._w.date});},
    newHabit:function(o){Forms.openHabit(api._w,o||{date:api._w.date});},
    newSlot:function(o){Forms.openSlot(api._w,o||{date:api._w.date});},
    newVacation:function(o){Forms.openVacation(api._w,o||{date:api._w.date});},
    newProject:function(o){Forms.openProject(api._w,o||{});},
    edit:function(title){
      var t=api._w.wiki.getTiddler(title);
      if(!t){return false;}
      if(Agenda.isTodo(t)){Forms.openTodo(api._w,{editTitle:title});}
      else if(Agenda.isHabit(t)){Forms.openHabit(api._w,{editTitle:title});}
      else if(Agenda.isVacation(t)){Forms.openVacation(api._w,{editTitle:title});}
      else{Forms.openEvent(api._w,{editTitle:title});}
      return true;
    },
    /* Lecture — des données nues, pas du DOM */
    itemsOn:function(iso){return Agenda.itemsForDay(api._w.wiki,String(iso||Agenda.todayIso()));},
    itemsBetween:function(a,b){
      a=String(a);b=String(b||a);
      return [].concat(
        Agenda.eventsForRange(api._w.wiki,a,b),
        Agenda.todosForRange(api._w.wiki,a,b,{}),
        Agenda.habitsForRange(api._w.wiki,a,b,{}));
    },
    vacationsOn:function(iso){return Agenda.vacationsForDate(api._w.wiki,String(iso||Agenda.todayIso()));},
    /* Config */
    config:function(){return Agenda.readConfig(api._w.wiki);},
    setConfig:function(patch){
      var cfg=Agenda.readConfig(api._w.wiki);
      Object.keys(patch||{}).forEach(function(k){cfg[k]=patch[k];});
      Agenda.writeConfig(api._w.wiki,cfg);
      return cfg;
    }
  };
  root.MonJournalAgenda=api;
}

AgendaWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.mode=this.getAttribute("mode","day");this.date=dateValue(this);
  var root=mk(this.document,null,"div","ja-agenda-root ja-agenda-mode-"+this.mode);parent.insertBefore(root,nextSibling);this.domNodes.push(root);
  if(this.mode==="habits-sidebar"){this.renderHabitsSidebar(root);publishApi(this);return;}
  var agendaHead=this.renderToolbar(root);
  if(this.mode!=="organisation"){this.renderSummary(agendaHead||root);}
  if(this.mode==="overview"){this.renderOverview(root);}
  else if(this.mode==="upcoming"){this.renderUpcoming(root);}
  else if(this.mode==="month"){this.renderMonth(root);}
  else if(this.mode==="week"){this.renderWeek(root);}
  else if(this.mode==="year"){this.renderYear(root);}
  else if(this.mode==="organisation"){this.renderOrganisation(root);}
  else{this.renderDay(root);}
  /* Le panneau de détail n'a de sens que sous une GRILLE : dans « Aperçu »
     et « À venir », qui sont déjà des listes chronologiques, il affichait
     une seconde fois exactement le même contenu. */
  if(this.mode==="month"||this.mode==="week"||this.mode==="year"){this.renderDetail(root);}
  publishApi(this);
};
AgendaWidget.prototype.refresh=function(changedTiddlers){
  var attrs=this.computeAttributes();if(Object.keys(attrs).length){this.refreshSelf();return true;}
  if(changedTiddlers[OVERVIEW_FOCUS_STATE]||changedTiddlers[DAY_PICK_STATE]||changedTiddlers[SEL_STATE]||changedTiddlers[DATE_STATE]||changedTiddlers[Agenda.CONFIG_TIDDLER]||changedTiddlers["$:/journalapp/config/journal"]||changedTiddlers[ORG_OPEN_STATE]||changedTiddlers[ORG_PROJECT_STATE]||changedTiddlers[ORG_UNSORTED_STATE]||changedTiddlers[HABIT_SIDEBAR_OPEN_STATE]||changedTiddlers[HABIT_SIDEBAR_PERIOD_OPEN_STATE]){this.refreshSelf();return true;}
  var stateChanged=Object.keys(changedTiddlers).some(function(title){return title.indexOf(FILTER_STATE_PREFIX)===0||title.indexOf(FILTER_OPEN_PREFIX)===0;});
  if(stateChanged){this.refreshSelf();return true;}
  var refresh=false,self=this;Object.keys(changedTiddlers).some(function(title){var t=self.wiki.getTiddler(title);if(!t){refresh=true;return true;}var tags=Agenda.tagsOf(t),kind=String(t.fields.kind||"");if(Agenda.isEvent(t)||Agenda.isTodo(t)||Agenda.isHabit(t)||Agenda.isVacation(t)||Agenda.isDaily(t)||kind==="person"||kind==="project"||tags.indexOf("Relations")!==-1||tags.indexOf("Projet")!==-1){refresh=true;return true;}return false;});
  if(refresh){this.refreshSelf();return true;}return false;
};
AgendaWidget.prototype.renderHabitsSidebar=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),date=this.date,
      types=Object.create(null),
      defs=[
        {id:"day",label:"Jour"},
        {id:"week",label:"Semaine"},
        {id:"month",label:"Mois"}
      ],
      periods=Object.create(null);

  defs.forEach(function(d){periods[d.id]={def:d,groups:Object.create(null),order:[],items:0};});
  (cfg.eventTypes||[]).forEach(function(t){types[String(t.id)]=t;});

  function periodForSchedule(s){
    var mode=String((s&&s.mode)||"daily");
    if(mode==="quota-week"){return "week";}
    if(mode==="quota-month"||mode==="monthly"){return "month";}
    return "day";
  }

  this.wiki.each(function(t,title){
    if(!Agenda.isHabit(t)){return;}
    var info=Agenda.habitDueInfo(t,date);
    if(!info.due){return;}

    var periodId=periodForSchedule(info.schedule),
        period=periods[periodId],
        id=String(t.fields["event-type"]||"__none"),
        meta=types[id]||{id:id,label:id==="__none"?"Sans catégorie":id,icon:"↻",color:""};

    if(!period.groups[id]){
      period.groups[id]={meta:meta,items:[]};
      period.order.push(id);
    }
    period.groups[id].items.push({title:title,tiddler:t,info:info});
    period.items++;
  });

  defs.forEach(function(d){
    var p=periods[d.id];
    p.order.sort(function(a,b){
      var aa=p.groups[a].meta,bb=p.groups[b].meta;
      return String(aa.label||a).localeCompare(String(bb.label||b),"fr");
    });
  });

  var wrap=mk(doc,root,"div","ja-habit-sidebar-widget"),
      top=mk(doc,wrap,"div","ja-habit-sidebar-top");
  mk(doc,top,"span","ja-habit-sidebar-kicker","HABITUDES");
  mk(doc,top,"strong","ja-habit-sidebar-date",pretty(date));

  var savedPeriods=readJsonState(this.wiki,HABIT_SIDEBAR_PERIOD_OPEN_STATE,null),
      periodOpen=Array.isArray(savedPeriods)?new Set(savedPeriods):new Set(defs.map(function(d){return d.id;})),
      savedTypes=readJsonState(this.wiki,HABIT_SIDEBAR_OPEN_STATE,null),
      typeOpen=new Set();

  /* Compatibilité avec l'ancien état qui ne contenait que l'id du type. */
  if(Array.isArray(savedTypes)){
    savedTypes.forEach(function(key){
      key=String(key||"");
      if(key.indexOf("::")!==-1){
        typeOpen.add(key);
      }else{
        defs.forEach(function(d){
          if(periods[d.id].groups[key]){typeOpen.add(d.id+"::"+key);}
        });
      }
    });
  }else{
    defs.forEach(function(d){
      periods[d.id].order.forEach(function(id){typeOpen.add(d.id+"::"+id);});
    });
  }

  function savePeriods(){
    writeJsonState(self.wiki,HABIT_SIDEBAR_PERIOD_OPEN_STATE,Array.from(periodOpen));
  }
  function saveTypes(){
    writeJsonState(self.wiki,HABIT_SIDEBAR_OPEN_STATE,Array.from(typeOpen));
  }
  function settledMark(items){
    var failed=(items||[]).some(function(x){return (x.info.failed||0)>0;}),
        cancelled=(items||[]).some(function(x){return (x.info.cancelled||0)>0;});
    return failed?"×":(cancelled?"–":"✓");
  }

  defs.forEach(function(def){
    var p=periods[def.id],
        sec=mk(doc,wrap,"section","ja-habit-sidebar-period"+(periodOpen.has(def.id)?" is-open":"")),
        head=button(doc,sec,"ja-habit-sidebar-period-head","","Réduire / déplier "+def.label),
        chev=mk(doc,head,"span","ja-habit-sidebar-period-chevron",periodOpen.has(def.id)?"⌄":"›"),
        title=mk(doc,head,"span","ja-habit-sidebar-period-title",def.label),
        left=0,totalItems=0;

    p.order.forEach(function(id){
      var g=p.groups[id];
      totalItems+=g.items.length;
      left+=g.items.reduce(function(n,x){return n+x.info.remaining;},0);
    });

    var settledItems=[];p.order.forEach(function(id){settledItems=settledItems.concat(p.groups[id].items);});
    mk(doc,head,"span","ja-habit-sidebar-period-count",
      left?String(left)+" à faire":(totalItems?settledMark(settledItems):"0")
    );

    head.addEventListener("click",function(){
      periodOpen.has(def.id)?periodOpen.delete(def.id):periodOpen.add(def.id);
      savePeriods();
    });

    if(!periodOpen.has(def.id)){return;}

    var periodBody=mk(doc,sec,"div","ja-habit-sidebar-period-body");
    if(!p.order.length){
      mk(doc,periodBody,"div","ja-habit-sidebar-period-empty","Rien à faire");
      return;
    }

    p.order.forEach(function(id){
      var g=p.groups[id],meta=g.meta,key=def.id+"::"+id,isOpen=typeOpen.has(key);
      g.items.sort(function(a,b){
        var at=a.info.time||"24:00",bt=b.info.time||"24:00";
        return at.localeCompare(bt)||String(a.tiddler.fields.label||a.title).localeCompare(String(b.tiddler.fields.label||b.title),"fr");
      });

      var group=mk(doc,periodBody,"section","ja-habit-sidebar-group"+(isOpen?" is-open":""));
      if(meta.color){group.style.setProperty("--ja-habit-color",String(meta.color));}

      var groupHead=button(doc,group,"ja-habit-sidebar-group-head","","Réduire / déplier "+String(meta.label||id));
      mk(doc,groupHead,"span","ja-habit-sidebar-chevron",isOpen?"⌄":"›");
      if(meta.image){appendConfiguredIcon(self,groupHead,meta,"ja-habit-sidebar-typeicon");}
      else{mk(doc,groupHead,"span","ja-habit-sidebar-typeicon",String(meta.icon||"↻"));}
      mk(doc,groupHead,"span","ja-habit-sidebar-group-title",String(meta.label||id));

      var groupLeft=g.items.reduce(function(n,x){return n+x.info.remaining;},0);
      mk(doc,groupHead,"span","ja-habit-sidebar-group-count",groupLeft?String(groupLeft)+" à faire":settledMark(g.items));

      groupHead.addEventListener("click",function(){
        typeOpen.has(key)?typeOpen.delete(key):typeOpen.add(key);
        saveTypes();
      });
      if(!isOpen){return;}

      var body=mk(doc,group,"div","ja-habit-sidebar-group-body");
      g.items.forEach(function(rec){
        var t=rec.tiddler,info=rec.info,label=String(t.fields.label||rec.title),
            stateClass=info.state==="failed"?" is-failed":(info.state==="cancelled"?" is-cancelled":(info.done?" is-done":"")),
            lateClass=info.completedLate>0?" is-late":"",
            card=mk(doc,body,"div","ja-habit-sidebar-card"+stateClass+lateClass),
            suppressToggleUntil=0;

        var glyph=info.done?"✓":(info.state==="failed"?"×":(info.state==="cancelled"?"–":(info.completed?String(info.completed):""))),
            actionLabel=info.done?(info.completedLate>0?"Faite en retard":"Réalisée"):(info.state==="failed"?"Échouée":(info.state==="cancelled"?"Annulée":"Noter une réalisation")),
            checkBtn=button(doc,card,"ja-habit-sidebar-check",glyph,actionLabel),
            content=button(doc,card,"ja-habit-sidebar-main","",actionLabel+" · "+label),
            line=mk(doc,content,"span","ja-habit-sidebar-line");

        card.title="Clic : fait · clic droit / appui long : fait, fait en retard, échouer ou annuler";
        mk(doc,line,"strong","ja-habit-sidebar-label",label);
        if(info.time){mk(doc,line,"span","ja-habit-sidebar-time",info.time);}

        var metaLine=mk(doc,content,"span","ja-habit-sidebar-meta");
        if(info.target>1){
          var progress=info.completed+" / "+info.target+" "+info.period.label;
          if(info.completedLate){progress+=" · "+info.completedLate+" retard"+(info.completedLate>1?"s":"");}
          if(info.failed){progress+=" · "+info.failed+" éch.";}
          if(info.cancelled){progress+=" · "+info.cancelled+" ann.";}
          mk(doc,metaLine,"span","ja-habit-sidebar-progress",progress);
        }else{
          var statusText=info.done?(info.completedLate>0?"Faite en retard":"Réalisée"):(info.state==="failed"?(info.autoFailed?"Échouée automatiquement":"Échouée"):(info.state==="cancelled"?"Annulée":Agenda.habitScheduleLabel(t)));
          mk(doc,metaLine,"span","ja-habit-sidebar-progress",statusText);
        }

        var dur=Math.max(0,parseInt(t.fields["duration-minutes"]||"0",10)||0);
        if(dur){mk(doc,metaLine,"span","ja-habit-sidebar-effort","◷ "+fmtEffort(dur));}

        var dailyHits=(info.records||[]).filter(function(x){return x.source==="daily";}).length;
        if(dailyHits){mk(doc,metaLine,"span","ja-habit-sidebar-daily","↔ Daily");}

        function toggle(e){
          if(e){e.stopPropagation();}
          if(Date.now()<suppressToggleUntil){return;}
          Agenda.toggleHabitOnDate(self.wiki,rec.title,date);
        }
        checkBtn.addEventListener("click",toggle);
        content.addEventListener("click",toggle);

        /* Même geste que sur les cartes Agenda : clic droit sur ordinateur,
           appui long sur téléphone. Le clic normal reste la validation. */
        (function bindStatusMenu(){
          var timer=null,moved=false,sx=0,sy=0;
          function menuAt(x,y){
            suppressToggleUntil=Date.now()+750;
            var item=Agenda.itemFromTitleOnDate(self.wiki,rec.title,date);
            if(item){self.openItemMenu(item,x,y);}
          }
          card.addEventListener("contextmenu",function(e){e.preventDefault();e.stopPropagation();menuAt(e.clientX,e.clientY);});
          card.addEventListener("touchstart",function(e){
            var p=e.touches&&e.touches[0];if(!p){return;}
            moved=false;sx=p.clientX;sy=p.clientY;clearTimeout(timer);
            timer=setTimeout(function(){if(moved){return;}if(window.navigator&&window.navigator.vibrate){try{window.navigator.vibrate(8);}catch(err){}}menuAt(sx,sy);},480);
          },{passive:true});
          card.addEventListener("touchmove",function(e){
            var p=e.touches&&e.touches[0];if(!p){return;}
            if(Math.abs(p.clientX-sx)>9||Math.abs(p.clientY-sy)>9){moved=true;clearTimeout(timer);}
          },{passive:true});
          ["touchend","touchcancel"].forEach(function(ev){card.addEventListener(ev,function(){clearTimeout(timer);},{passive:true});});
        })();

        var edit=button(doc,card,"ja-habit-sidebar-edit","✎","Modifier l’habitude");
        edit.addEventListener("click",function(e){
          e.stopPropagation();
          Forms.openHabit(self,{editTitle:rec.title});
        });
      });
    });
  });
};

AgendaWidget.prototype.renderToolbar=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),bar=mk(doc,root,"header","ja-agenda-toolbar"),nav=mk(doc,bar,"div","ja-agenda-nav");
  var stepPrev,stepNext,label,prevTitle="Précédent",nextTitle="Suivant";
  if(this.mode==="month"||this.mode==="organisation"){stepPrev=Agenda.addMonths(this.date,-1);stepNext=Agenda.addMonths(this.date,1);label=this.mode==="organisation"?"Organisation · "+prettyMonth(this.date):prettyMonth(this.date);prevTitle="Mois précédent";nextTitle="Mois suivant";}
  else if(this.mode==="week"){stepPrev=Agenda.addDays(this.date,-7);stepNext=Agenda.addDays(this.date,7);label=prettyWeek(this.date,cfg.firstDayOfWeek);prevTitle="Semaine précédente";nextTitle="Semaine suivante";}
  else if(this.mode==="year"){stepPrev=Agenda.addYears(this.date,-1);stepNext=Agenda.addYears(this.date,1);label=String(Agenda.parseIso(this.date).getFullYear());prevTitle="Année précédente";nextTitle="Année suivante";}
  else{stepPrev=Agenda.addDays(this.date,-1);stepNext=Agenda.addDays(this.date,1);label=pretty(this.date);prevTitle="Jour précédent";nextTitle="Jour suivant";}
  /* Chaque élément de navigation possède désormais SA case.
     Le texte de date ne peut donc plus pousser les flèches. */
  var prevSlot=mk(doc,nav,"span","ja-agenda-navslot is-prev"),
      dateSlot=mk(doc,nav,"span","ja-agenda-navslot is-date"),
      pickSlot=null,
      nextSlot=null,
      prev=button(doc,prevSlot,"ja-jday-arrow ja-agenda-iconbtn","‹",prevTitle),
      date=button(doc,dateSlot,"ja-agenda-datebtn",label,"Revenir à aujourd’hui"),
      datePick=null,
      next=null;

  if(this.mode!=="organisation"){
    pickSlot=mk(doc,nav,"span","ja-agenda-navslot is-picker");
    datePick=button(doc,pickSlot,"ja-agenda-datepick-btn","🗓","Choisir rapidement une date");
  }
  nextSlot=mk(doc,nav,"span","ja-agenda-navslot is-next");
  next=button(doc,nextSlot,"ja-jday-arrow ja-agenda-iconbtn","›",nextTitle);

  prev.addEventListener("click",function(){setDate(self,stepPrev);});
  date.addEventListener("click",function(){setDate(self,Agenda.todayIso());});
  if(datePick){
    datePick.addEventListener("click",function(ev){
      ev.stopPropagation();
      self.openDatePicker(datePick);
    });
  }
  next.addEventListener("click",function(){setDate(self,stepNext);});
  var actions=mk(doc,bar,"div","ja-agenda-actions"),filterBtn=button(doc,actions,"ja-journal-add ja-agenda-filter-toggle","Filtrer","Filtrer cette vue"),ev=button(doc,actions,"ja-journal-add ja-agenda-add","＋ Événement"),td=button(doc,actions,"ja-journal-add ja-agenda-add ja-agenda-add-todo","＋ To-do"),more=button(doc,actions,"ja-journal-add ja-agenda-add-more","＋","Habitude, créneau ou vacances");
  var fc=self.filterCount();if(fc){filterBtn.classList.add("is-active");filterBtn.textContent="Filtrer · "+fc;}
  filterBtn.addEventListener("click",function(){var st=FILTER_OPEN_PREFIX+self.mode,open=self.wiki.getTiddlerText(st,"")==="yes";self.wiki.setText(st,"text",null,open?"no":"yes",{suppressTimestamp:true});});
  ev.addEventListener("click",function(){self.openEventForm(self.date);});td.addEventListener("click",function(){self.openTodoForm(self.date);});more.addEventListener("click",function(e){e.stopPropagation();self.openCreateMenu(more);});
  if(self.wiki.getTiddlerText(FILTER_OPEN_PREFIX+self.mode,"")==="yes"){self.renderFilters(bar);}
  return bar;
};

/* Sélecteur rapide de date.
   Même vocabulaire visuel que le mini-calendrier du Journal :
   années, mois, puis jour précis. */
AgendaWidget.prototype.openDatePicker=function(anchor){
  var self=this,doc=this.document,
      old=doc.querySelector(".ja-pop.ja-agenda-datepick");
  if(old){old.remove();}

  var current=Agenda.parseIso(this.date||dateValue(this)),
      year=current.getFullYear(),
      month=current.getMonth(),
      selectedDay=current.getDate(),
      pop=mk(doc,doc.body,"div","ja-pop ja-monthpick ja-agenda-datepick"),
      rect=anchor.getBoundingClientRect(),
      head=mk(doc,pop,"div","ja-monthpick-head"),
      back=button(doc,head,"ja-jcal-arrow","‹","Décennie précédente"),
      title=mk(doc,head,"span","ja-monthpick-title",String(year)),
      fwd=button(doc,head,"ja-jcal-arrow","›","Décennie suivante"),
      years=mk(doc,pop,"div","ja-monthpick-years"),
      months=mk(doc,pop,"div","ja-monthpick-months"),
      days=mk(doc,pop,"div","ja-agenda-datepick-days");

  var w=doc.documentElement.clientWidth,
      h=doc.documentElement.clientHeight;

  /* On laisse le navigateur calculer la taille avant le placement. */
  pop.style.left="8px";
  pop.style.top="8px";
  var pw=pop.offsetWidth||260,
      ph=pop.offsetHeight||360,
      left=Math.max(8,Math.min(rect.left-pw/2+rect.width/2,w-pw-8)),
      top=rect.bottom+6;
  if(top+ph>h-8){top=Math.max(8,rect.top-ph-6);}
  pop.style.left=Math.round(left)+"px";
  pop.style.top=Math.round(top)+"px";

  function close(){
    if(pop&&pop.parentNode){pop.remove();}
    doc.removeEventListener("mousedown",away,true);
    doc.removeEventListener("keydown",esc,true);
  }
  function away(ev){
    if(pop&&!pop.contains(ev.target)&&ev.target!==anchor){close();}
  }
  function esc(ev){
    if(ev.key==="Escape"){close();}
  }
  setTimeout(function(){
    doc.addEventListener("mousedown",away,true);
    doc.addEventListener("keydown",esc,true);
  },0);

  function capMonth(mm,longName){
    var s=new Intl.DateTimeFormat("fr-FR",{month:longName?"long":"short"})
      .format(new Date(2020,mm,1,12)).replace(".","");
    return s.charAt(0).toUpperCase()+s.slice(1);
  }

  function isoFor(y,m,d){
    var mm=String(m+1).padStart(2,"0"),
        dd=String(d).padStart(2,"0");
    return y+"-"+mm+"-"+dd;
  }

  function drawYears(){
    years.innerHTML="";
    title.textContent=String(year);
    var decade=Math.floor(year/10)*10,
        start=decade-1;
    for(var i=0;i<12;i++){
      (function(y){
        var b=button(doc,years,"ja-monthpick-cell"+(y===year?" is-on":""),String(y),"Année "+y);
        if(y<decade||y>decade+9){b.classList.add("is-out");}
        b.addEventListener("click",function(){
          year=y;
          /* Si le jour n'existe pas dans ce mois/année, on le borne. */
          selectedDay=Math.min(selectedDay,new Date(year,month+1,0,12).getDate());
          drawYears();drawMonths();drawDays();
        });
      })(start+i);
    }
  }

  function drawMonths(){
    months.innerHTML="";
    for(var m=0;m<12;m++){
      (function(mm){
        var b=button(
          doc,months,
          "ja-monthpick-cell"+(mm===month?" is-on":""),
          capMonth(mm,false),
          capMonth(mm,true)+" "+year
        );
        b.addEventListener("click",function(){
          month=mm;
          selectedDay=Math.min(selectedDay,new Date(year,month+1,0,12).getDate());
          drawMonths();drawDays();
        });
      })(m);
    }
  }

  function drawDays(){
    days.innerHTML="";
    var week=mk(doc,days,"div","ja-agenda-datepick-week");
    ["L","M","M","J","V","S","D"].forEach(function(x){
      mk(doc,week,"span","ja-agenda-datepick-dow",x);
    });

    var grid=mk(doc,days,"div","ja-agenda-datepick-grid"),
        first=new Date(year,month,1,12),
        last=new Date(year,month+1,0,12),
        lead=(first.getDay()+6)%7,
        selectedIso=self.date||dateValue(self),
        todayIso=Agenda.todayIso();

    for(var z=0;z<lead;z++){mk(doc,grid,"span","ja-agenda-datepick-empty","");}

    for(var d=1;d<=last.getDate();d++){
      (function(day){
        var iso=isoFor(year,month,day),
            b=button(doc,grid,"ja-agenda-datepick-day",String(day),iso);
        if(iso===selectedIso){b.classList.add("is-selected");}
        if(iso===todayIso){b.classList.add("is-today");}
        b.addEventListener("click",function(){
          selectedDay=day;
          close();
          setDate(self,iso);
        });
      })(d);
    }
  }

  back.addEventListener("click",function(){
    year-=10;drawYears();drawMonths();drawDays();
  });
  fwd.addEventListener("click",function(){
    year+=10;drawYears();drawMonths();drawDays();
  });

  drawYears();drawMonths();drawDays();

  var todayBtn=button(doc,pop,"ja-monthpick-today","Aujourd’hui","Aller à aujourd’hui");
  todayBtn.addEventListener("click",function(){
    close();setDate(self,Agenda.todayIso());
  });
};

AgendaWidget.prototype.filterState=function(){var f=readJsonState(this.wiki,FILTER_STATE_PREFIX+this.mode,{kinds:null,types:null,markers:null,projects:null});return f&&typeof f==="object"?f:{kinds:null,types:null,markers:null,projects:null};};
AgendaWidget.prototype.writeFilterState=function(f){["kinds","types","markers","projects"].forEach(function(k){if(Array.isArray(f[k])&&!f[k].length){f[k]=null;}});writeJsonState(this.wiki,FILTER_STATE_PREFIX+this.mode,f);};
AgendaWidget.prototype.filterCount=function(){var f=this.filterState(),n=0;["kinds","types","markers","projects"].forEach(function(k){n+=Array.isArray(f[k])?f[k].length:0;});return n;};
AgendaWidget.prototype.passesFilters=function(item){var f=this.filterState(),k=filterKind(item),type=item.typeId||effectiveTypeId(this,item)||"__none",marker=item.marker||"__none",projects=item.projects||[];
  if(Array.isArray(f.kinds)&&f.kinds.length&&f.kinds.indexOf(k)===-1){return false;}
  if(Array.isArray(f.types)&&f.types.length&&f.types.indexOf(type)===-1){return false;}
  if(Array.isArray(f.markers)&&f.markers.length&&f.markers.indexOf(marker)===-1){return false;}
  if(Array.isArray(f.projects)&&f.projects.length){var ok=false;if(!projects.length&&f.projects.indexOf("__none")!==-1){ok=true;}projects.some(function(p){if(f.projects.indexOf(p)!==-1){ok=true;return true;}return false;});if(!ok){return false;}}
  return true;
};
AgendaWidget.prototype.applyFilters=function(items){var self=this;return (items||[]).filter(function(x){return self.passesFilters(x);});};
AgendaWidget.prototype.vacationsVisible=function(){var cfg=Agenda.readConfig(this.wiki),f=this.filterState();if(cfg.showVacations===false){return false;}if(Array.isArray(f.kinds)&&f.kinds.length&&f.kinds.indexOf("vacation")===-1){return false;}if(Array.isArray(f.types)&&f.types.length&&f.types.indexOf("__none")===-1){return false;}if(Array.isArray(f.markers)&&f.markers.length&&f.markers.indexOf("__none")===-1){return false;}if(Array.isArray(f.projects)&&f.projects.length&&f.projects.indexOf("__none")===-1){return false;}return true;};
AgendaWidget.prototype.renderFilters=function(root){
  var self=this,doc=this.document,f=this.filterState(),
      cfg=Agenda.readConfig(this.wiki),jcfg=JConfig.read(this.wiki),
      panel=mk(doc,root,"div","ja-agenda-filter-panel");

  function group(label,key,values){
    var g=mk(doc,panel,"div","ja-agenda-filter-group");
    mk(doc,g,"span","ja-agenda-filter-label",label);

    var all=button(doc,g,"ja-agenda-filter-pill"+(!f[key]?" is-on":""),"Tout");
    all.addEventListener("click",function(){f[key]=null;self.writeFilterState(f);});

    values.forEach(function(v){
      var on=Array.isArray(f[key])&&f[key].indexOf(v.id)!==-1,
          b=button(doc,g,"ja-agenda-filter-pill"+(on?" is-on":""),"");

      if(v.image){
        appendConfiguredIcon(self,b,v,"ja-agenda-filter-icon");
      }else if(v.icon){
        mk(doc,b,"span","ja-agenda-filter-icon is-emoji",String(v.icon));
      }
      mk(doc,b,"span","ja-agenda-filter-pill-label",v.label);

      if(v.color){b.style.setProperty("--ja-filter-color",v.color);}
      b.addEventListener("click",function(){
        var s=new Set(f[key]||[]);
        s.has(v.id)?s.delete(v.id):s.add(v.id);
        f[key]=Array.from(s);
        self.writeFilterState(f);
      });
    });
  }

  var kindChoices=[
    {id:"event",label:"Événements",icon:"📅"},
    {id:"todo",label:"To-dos",icon:"☑"},
    {id:"slot",label:"Créneaux",icon:"▥"},
    {id:"vacation",label:"Vacances",icon:"🌿"},
    {id:"birthday",label:"Anniversaires",icon:"🎂"}
  ];
  if(this.mode==="organisation"){kindChoices.splice(2,0,{id:"habit",label:"Habitudes",icon:"↻"});}
  group("Quoi","kinds",kindChoices);

  group("Types","types",(cfg.eventTypes||[]).map(function(x){
    return {id:x.id,label:x.label,icon:x.icon,image:x.image,color:x.color};
  }).concat([{id:"__none",label:"Sans type",icon:"∅"}]));

  group("Marqueurs","markers",(jcfg.markers||[]).map(function(x){
    return {id:x.id,label:x.label,icon:x.emoji||"•",color:x.color};
  }).concat([{id:"__none",label:"Sans marqueur",icon:"∅"}]));

  var ps=projectTitles(this.wiki).map(function(x){return {id:x,label:x,icon:"🧩"};});
  if(ps.length){group("Projets","projects",ps.concat([{id:"__none",label:"Sans projet",icon:"∅"}]));}

  if(this.filterCount()){
    var reset=button(doc,panel,"ja-agenda-filter-reset","↺ Tout réafficher");
    reset.addEventListener("click",function(){
      self.writeFilterState({kinds:null,types:null,markers:null,projects:null});
    });
  }
};

AgendaWidget.prototype.summaryRange=function(){
  var cfg=Agenda.readConfig(this.wiki),d=Agenda.parseIso(this.date),y=d.getFullYear();
  if(this.mode==="upcoming"){var a=Agenda.todayIso();return [a,Agenda.addDays(a,Math.max(1,+cfg.listDays||14)-1)];}
  if(this.mode==="week"){return [Agenda.startOfWeek(this.date,cfg.firstDayOfWeek),Agenda.endOfWeek(this.date,cfg.firstDayOfWeek)];}
  if(this.mode==="month"){return [Agenda.startOfMonth(this.date),Agenda.endOfMonth(this.date)];}
  if(this.mode==="year"){return [String(y)+"-01-01",String(y)+"-12-31"];}
  return [this.date,this.date];
};
AgendaWidget.prototype.renderSummary=function(root){
  var cfg=Agenda.readConfig(this.wiki);if(cfg.showSummary===false){return;}var range=this.summaryRange(),a=range[0],b=range[1],ev=this.applyFilters(Agenda.eventsForRange(this.wiki,a,b)),td=this.applyFilters(Agenda.todosForRange(this.wiki,a,b,{calendarOnly:false}).filter(function(x){return !x.parentTodo;})),daily=0,over=0,today=Agenda.todayIso();
  this.wiki.each(function(t){if(Agenda.isDaily(t)&&Agenda.inRange(String(t.fields.date||""),a,b)){daily++;}});
  this.wiki.each(function(t){if(!Agenda.isTodo(t)||String(t.fields["parent-todo"]||"")){return;}var dl=String(t.fields.deadline||"");if(dl&&Agenda.cmp(dl,today)<0&&!todoClosed(t)){over++;}});
  var normal=ev.filter(function(x){return x.role!=="birthday"&&x.role!=="slot";}).length,slots=ev.filter(function(x){return x.role==="slot";}).length,births=ev.filter(function(x){return x.role==="birthday";}).length;
  if(!normal&&!slots&&!births&&!td.length&&!daily&&!over){return;}var doc=this.document,host=root.querySelector(".ja-agenda-toolbar")||root,bar=mk(doc,host,"div","ja-agenda-summary");
  function bit(n,one,many,cls){if(!n){return;}var c=mk(doc,bar,"span","ja-agenda-summary-bit"+(cls?" "+cls:""));mk(doc,c,"strong","",String(n));mk(doc,c,"span","",n===1?one:many);}
  bit(normal,"événement","événements");bit(slots,"créneau","créneaux");bit(births,"anniversaire","anniversaires");bit(td.length,"to-do","to-dos");bit(daily,"entrée Daily","entrées Daily");bit(over,"en retard","en retard","is-overdue");
};

/*
  APERÇU.
  C'était le copier-coller de la vue Jour. Deux entrées de menu, un seul
  écran — impossible de deviner ce qui les distinguait, puisque rien ne les
  distinguait. « Jour » montre désormais une journée à l'heure près ;
  « Aperçu » répond à une autre question : où j'en suis, là, maintenant.
*/
AgendaWidget.prototype.renderOverview=function(root){
  var self=this,doc=this.document,today=Agenda.todayIso(),iso=this.date,
      focus=this.wiki.getTiddlerText(OVERVIEW_FOCUS_STATE,"");
  if(["day","todo","upcoming"].indexOf(focus)===-1){focus="";}

  var head=mk(doc,root,"div","ja-agenda-section-head");
  mk(doc,head,"div","ja-agenda-kicker","Aperçu");
  mk(doc,head,"h1","ja-agenda-title",iso===today?"Aujourd’hui":pretty(iso));

  function focusTitle(host,key,label,alignClass){
    var isOpen=focus===key,
        title=button(
          doc,
          host,
          "ja-agenda-ovtitle "+alignClass+(isOpen?" is-active":""),
          label,
          isOpen ? "Réafficher les trois colonnes" : "Afficher « "+label+" » en grand"
        );
    title.setAttribute("data-ja-overview-title",key);
    title.setAttribute("aria-pressed",isOpen?"true":"false");
    title.addEventListener("click",function(){
      self.wiki.setText(
        OVERVIEW_FOCUS_STATE,
        "text",
        null,
        isOpen ? "" : key,
        {suppressTimestamp:true}
      );
    });
  }

  /*
  La ligne de titres est AVANT la zone de contenu.
  Elle reste toujours visible et ne dépend jamais des colonnes.
  */
  var nav=mk(doc,root,"div","ja-agenda-ovnav");
  focusTitle(nav,"day","La journée","is-left");
  focusTitle(nav,"todo","À traiter","is-center");
  focusTitle(nav,"upcoming","Ça vient","is-right");

  var cols=mk(doc,root,"div","ja-agenda-overview"+(focus?" is-focused":""));
  if(focus){cols.setAttribute("data-ja-focus",focus);}

  function compactShell(col,count,label){
    var box=mk(doc,col,"div","ja-agenda-ovcompact"),
        top=mk(doc,box,"div","ja-agenda-ovcompact-count");
    mk(doc,top,"strong","",String(count));
    mk(doc,top,"span","",label);
    return box;
  }

  function compactLine(box,meta,label,cls,item){
    var row=mk(doc,box,"div","ja-agenda-ovcompact-line"+(cls?" "+cls:""));
    if(item){
      var col=itemColor(self,item);
      if(col){
        row.classList.add("has-item-color");
        row.style.setProperty("--ja-item-color",col);
      }
      if(applyBackdrop(self,row,item,"pill")){
        row.classList.add("has-item-backdrop");
      }
    }
    if(meta){mk(doc,row,"span","ja-agenda-ovcompact-meta",meta);}
    mk(doc,row,"span","ja-agenda-ovcompact-label",label);if(item){addInlineEdit(self,row,item,"is-mini");}
    return row;
  }

  function shortDate(d){
    var x=Agenda.parseIso(d);
    return new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric"}).format(x).replace(".","");
  }

  function relativeFrom(d,reference){
    var days=Math.round((Agenda.parseIso(d)-Agenda.parseIso(reference))/86400000);
    if(days===0){return "aujourd’hui";}
    if(days===1){return "demain";}
    if(days===-1){return "hier";}
    if(days>0){return "dans "+days+" jours";}
    return "il y a "+Math.abs(days)+" jours";
  }

  /* ── La journée ── */
  var c1=mk(doc,cols,"section","ja-agenda-ovcol");
  c1.setAttribute("data-ja-overview","day");

  var jour=this.applyFilters(Agenda.itemsForDay(this.wiki,iso,{includeLinked:true,calendarOnly:true})),
      mini1=compactShell(c1,jour.length,jour.length===1?"élément":"éléments");
  if(jour.length){
    jour.slice(0,2).forEach(function(x){
      compactLine(mini1,timeOf(x)||"",x.title||"Sans titre","",x);
    });
    if(jour.length>2){compactLine(mini1,"","+"+(jour.length-2)+" autre"+(jour.length-2>1?"s":""),"is-more");}
  }else{
    compactLine(mini1,"","Rien aujourd’hui","is-empty");
  }

  var full1=mk(doc,c1,"div","ja-agenda-ovfull");
  this.renderVacationBanner(full1,iso);
  if(jour.length){this.renderDaySchedule(full1,jour,"");}
  else{mk(doc,full1,"div","ja-agenda-empty","Rien de programmé.");}

  /* ── À traiter ── */
  var c2=mk(doc,cols,"section","ja-agenda-ovcol");
  c2.setAttribute("data-ja-overview","todo");

  /*
    RÈGLE MÉTIER DE LA COLONNE À TRAITER

    - start-date = quand la To-do commence à devoir être traitée.
      Avant cette date, elle n'apparaît PAS ici.
    - deadline = quand elle doit être terminée.
      Le lendemain de l'échéance, elle devient "En retard".
    - Reporté reste Reporté même si son ancienne échéance est dépassée.
    - Fait / Annulé sortent de cette colonne.
    - Les sous-tâches inline ne sont pas répétées ici : le parent représente
      son arbre dans l'Aperçu.
  */
  var reference=iso,
      limite=Agenda.addDays(reference,7),
      late=[],soon=[],active=[],postponed=[];

  function todoOverviewInfo(t,title,it){
    var f=t.fields||{},
        st=todoStatus(t),
        startDate=String(f["start-date"]||""),
        deadline=String(f.deadline||""),
        parentTodo=String(f["parent-todo"]||""),
        startTime=String(f["start-time"]||f["reminder-time"]||"");

    if(st==="fait"||st==="annule"){return null;}
    if(parentTodo){return null;}

    /* Une date de début future signifie : pas encore à traiter. */
    if(startDate&&Agenda.cmp(reference,startDate)<0){return null;}

    var row={
      title:title,t:t,item:it,
      status:st,startDate:startDate,deadline:deadline,startTime:startTime,
      bucket:"active",stateLabel:"À faire",stateClass:"is-active",icon:"□"
    };

    if(st==="reporte"){
      row.bucket="postponed";
      row.stateLabel="Reporté";
      row.stateClass="is-postponed";
      row.icon="→";
      return row;
    }

    /* L'échéance n'est dépassée qu'À PARTIR DU JOUR SUIVANT. */
    if(deadline&&Agenda.cmp(deadline,reference)<0){
      row.bucket="late";
      row.stateLabel=st==="en_cours"?"En cours · En retard":"En retard";
      row.stateClass="is-late";
      row.icon="!";
      return row;
    }

    if(st==="en_cours"){
      row.stateLabel="En cours";
      row.stateClass="is-progress";
      row.icon="◩";
    }

    if(deadline&&Agenda.cmp(deadline,limite)<=0){
      row.bucket="soon";
      return row;
    }

    row.bucket="active";
    return row;
  }

  this.wiki.each(function(t,title){
    if(!Agenda.isTodo(t)){return;}
    var it=rawFilterItem(title,t);
    if(!self.passesFilters(it)){return;}
    var info=todoOverviewInfo(t,title,it);
    if(!info){return;}
    if(info.bucket==="late"){late.push(info);}
    else if(info.bucket==="soon"){soon.push(info);}
    else if(info.bucket==="postponed"){postponed.push(info);}
    else{active.push(info);}
  });

  function sortDeadline(a,b){
    var ad=a.deadline||"9999-99-99",bd=b.deadline||"9999-99-99";
    return Agenda.cmp(ad,bd)||String(a.t.fields.label||a.title).localeCompare(String(b.t.fields.label||b.title));
  }
  late.sort(sortDeadline);
  soon.sort(sortDeadline);
  active.sort(sortDeadline);
  postponed.sort(sortDeadline);

  var allTodos=late.concat(soon,active,postponed),
      todoTotal=allTodos.length,
      mini2=compactShell(c2,todoTotal,"à traiter");

  /* Mini-dashboard téléphone : le statut réel devient le petit méta. */
  allTodos.slice(0,2).forEach(function(r){
    compactLine(
      mini2,
      (r.startTime?r.startTime+" · ":"")+r.stateLabel,
      String(r.t.fields.label||r.title),
      r.stateClass,
      r.item
    );
  });
  if(!todoTotal){compactLine(mini2,"","Tout est calme","is-empty");}
  if(todoTotal>2){compactLine(mini2,"","+"+(todoTotal-2)+" autre"+(todoTotal-2>1?"s":""),"is-more");}

  var full2=mk(doc,c2,"div","ja-agenda-ovfull");

  function dateMeta(row){
    var bits=[];
    if(row.startTime){bits.push(row.startTime);}
    if(row.startDate){
      if(row.startDate===reference){bits.push("à traiter dès aujourd’hui");}
      else if(Agenda.cmp(row.startDate,reference)<0){bits.push("depuis "+shortDate(row.startDate));}
    }
    if(row.deadline){
      if(Agenda.cmp(row.deadline,reference)<0){
        bits.push("échéance "+relativeFrom(row.deadline,reference));
      }else if(row.deadline===reference){
        bits.push("échéance aujourd’hui");
      }else{
        bits.push("échéance "+relativeFrom(row.deadline,reference));
      }
    }
    return bits.join(" · ");
  }

  function ligne(host,row){
    var wrap=mk(doc,host,"div","ja-agenda-ovtodo"),
        r=mk(doc,wrap,"div","ja-agenda-ovrow "+row.stateClass);
    var ocb=button(doc,r,"ja-agenda-ovrow-ic ja-agenda-mini-check",row.icon,row.item.done?"Rouvrir":"Marquer fait");ocb.addEventListener("click",function(e){e.stopPropagation();Agenda.toggleTodoOnDate(self.wiki,row.title,reference);});
    var main=mk(doc,r,"span","ja-agenda-ovrow-main");
    mk(doc,main,"span","ja-agenda-ovrow-title",String(row.t.fields.label||row.title));
    addInlineEdit(self,r,row.item,"is-mini");
    var os=button(doc,main,"ja-agenda-ovrow-state ja-agenda-status-action",row.stateLabel,"Changer l’état");os.addEventListener("click",function(e){e.stopPropagation();self.openInlineStatusMenu(os,row.item);});
    var meta=dateMeta(row);
    if(meta){mk(doc,r,"span","ja-agenda-ovrow-when",meta);}
    if(Agenda.todoChildrenTitles(self.wiki,row.title).length){
      self.renderTodoSubtasks(wrap,row.title,reference);
    }
  }

  function group(label,rows,cls){
    if(!rows.length){return;}
    var g=mk(doc,full2,"section","ja-agenda-todo-group "+(cls||""));
    mk(doc,g,"div","ja-agenda-todo-group-title",label);
    var max=focus==="todo"?rows.length:Math.min(rows.length,6);
    rows.slice(0,max).forEach(function(r){ligne(g,r);});
    if(max<rows.length){
      mk(doc,g,"div","ja-agenda-todo-more","+"+(rows.length-max)+" autre"+(rows.length-max>1?"s":""));
    }
  }

  if(!todoTotal){
    mk(doc,full2,"div","ja-agenda-empty","Rien à traiter pour cette date.");
  }else{
    group("En retard",late,"is-late");
    group("Échéance proche",soon,"is-soon");
    group("À faire",active,"is-active");
    group("Reporté",postponed,"is-postponed");
  }

  /* ── Ça vient ── */
  var c3=mk(doc,cols,"section","ja-agenda-ovcol");
  c3.setAttribute("data-ja-overview","upcoming");

  var a=Agenda.addDays(iso,1),b=Agenda.addDays(iso,14),
      ev=this.applyFilters(Agenda.eventsForRange(this.wiki,a,b)),
      td=this.applyFilters(Agenda.todosForRange(this.wiki,a,b,{calendarOnly:true})),
      hb=this.applyFilters(Agenda.habitsForRange(this.wiki,a,b,{calendarOnly:true})),
      upcomingCount=0,upcomingFirst=[];

  for(var scan=a;Agenda.cmp(scan,b)<=0;scan=Agenda.addDays(scan,1)){
    var scanItems=dayItemsFromRange(ev,td,hb,scan);
    upcomingCount+=scanItems.length;
    scanItems.forEach(function(x){
      if(upcomingFirst.length<2){upcomingFirst.push({item:x,date:scan});}
    });
  }

  var mini3=compactShell(c3,upcomingCount,upcomingCount===1?"à venir":"à venir");
  upcomingFirst.forEach(function(rec){
    compactLine(mini3,shortDate(rec.date),rec.item.title||"Sans titre","",rec.item);
  });
  if(!upcomingCount){compactLine(mini3,"","Rien bientôt","is-empty");}
  if(upcomingCount>2){compactLine(mini3,"","+"+(upcomingCount-2)+" autre"+(upcomingCount-2>1?"s":""),"is-more");}

  var full3=mk(doc,c3,"div","ja-agenda-ovfull"),
      vus=0,
      maxDays=focus==="upcoming"?Infinity:5;
  for(var cur=a;Agenda.cmp(cur,b)<=0&&vus<maxDays;cur=Agenda.addDays(cur,1)){
    var its=dayItemsFromRange(ev,td,hb,cur);
    if(!its.length){continue;}
    vus++;
    this.renderDayHeader(full3,cur,{count:its.length});
    /* Même composition que Mois : les éléments compris dans un créneau
       restent enfants de ce créneau, y compris dans la vue focus mobile. */
    self.renderMonthMiniGroup(full3,its,cur,focus==="upcoming"?Infinity:3);
  }
  if(!vus){mk(doc,full3,"div","ja-agenda-empty","Rien dans les deux semaines qui viennent.");}
};

AgendaWidget.prototype.pickInDay=function(item){
  if(!item){writeDayPick(this,null);return;}
  writeDayPick(this,{
    ref:item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,
    date:item.date||this.date,
    at:timeOf(item)||""
  });
};
AgendaWidget.prototype.renderDay=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),iso=this.date,
      today=Agenda.todayIso(),
      all=this.applyFilters(Agenda.itemsForDay(this.wiki,iso,{includeLinked:true,calendarOnly:true})),
      timed=all.filter(function(x){return timeOf(x);}),
      untimed=all.filter(function(x){return !timeOf(x);}),
      /* La vue jour couvre la journée entière : minuit à minuit. Elle a la
         place de le faire, et une nuit blanche ou un réveil à 4h ne doit pas
         disparaître du seul écran censé tout montrer. La semaine, elle,
         reste sur sa fenêtre resserrée : sept colonnes de 24 heures ne
         seraient plus lisibles. */
      H0=Math.max(0,+cfg.dayStartHour||0),
      H1=Math.min(24,+cfg.dayEndHour||24),
      hours=(H1>H0?H1:24)-H0,hourPx=hourScale(this,hours);
  if(H1<=H0){H0=0;H1=24;hours=24;}

  var _pick=readDayPick(this);
  function pickMatch(x){
    if(!_pick||_pick.date!==iso){return false;}
    var ref=x.refTitle||(x.tiddler&&x.tiddler.fields.title)||x.title;
    return ref===_pick.ref&&(!_pick.at||timeOf(x)===_pick.at);
  }

  this.renderVacationBanner(root,iso);

  /* Les événements/créneaux sans heure décrivent la journée entière. Ils ne
     doivent jamais tomber sous 23:00 ou dans « Sans heure » : on leur réserve
     le bandeau supérieur, comme dans la semaine. Une To-do sans heure reste,
     elle, une tâche non planifiée et n'est donc pas promue ici. */
  var allDay=untimed.filter(function(x){return x.kind==="event";});
  if(allDay.length){
    var allDayBand=mk(doc,root,"section","ja-agenda-day-allday"),
        allDayLabel=mk(doc,allDayBand,"div","ja-agenda-day-allday-label","Toute la journée"),
        allDayItems=mk(doc,allDayBand,"div","ja-agenda-day-allday-items");
    allDay.forEach(function(item){self.renderWeekAllDayPill(allDayItems,item,iso);});
  }

  var dayTools=mk(doc,root,"div","ja-agenda-day-window"),
      dayLab=mk(doc,dayTools,"span","ja-agenda-day-window-label","Afficher"),
      fromSel=mk(doc,dayTools,"select","ja-agenda-day-window-select"),
      arrow=mk(doc,dayTools,"span","ja-agenda-day-window-arrow","→"),
      toSel=mk(doc,dayTools,"select","ja-agenda-day-window-select");
  for(var wh=0;wh<=24;wh++){
    if(wh<24){var fo=mk(doc,fromSel,"option","",String(wh).padStart(2,"0")+":00");fo.value=String(wh);}
    if(wh>0){var to=mk(doc,toSel,"option","",String(wh).padStart(2,"0")+":00");to.value=String(wh);}
  }
  fromSel.value=String(H0);toSel.value=String(H1);
  function saveWindow(){
    var a=+fromSel.value,b=+toSel.value;if(b<=a){b=Math.min(24,a+1);toSel.value=String(b);}
    var nc=Agenda.readConfig(self.wiki);nc.dayStartHour=a;nc.dayEndHour=b;Agenda.writeConfig(self.wiki,nc);
  }
  fromSel.addEventListener("change",saveWindow);toSel.addEventListener("change",saveWindow);
  var frame=mk(doc,root,"div","ja-agenda-dayview"+(iso===today?" is-today":""));

  /* ── La colonne horaire ── */
  var main=mk(doc,frame,"div","ja-agenda-dayview-main"),
      body=mk(doc,main,"div","ja-agenda-dayview-body"),
      hoursCol=mk(doc,body,"div","ja-agenda-week-hours");
  for(var h=H0;h<H1;h++){
    var hh=mk(doc,hoursCol,"div","ja-agenda-week-hour",String(h).padStart(2,"0")+":00");
    hh.style.height=hourPx+"px";
  }
  hoursCol.style.height=(hours*hourPx)+"px";
  var col=mk(doc,body,"div","ja-agenda-dayview-col");
  col.style.height=(hours*hourPx)+"px";
  for(var k=0;k<hours;k++){
    var line=mk(doc,col,"div","ja-agenda-week-line");
    line.style.top=(k*hourPx)+"px";line.style.height=hourPx+"px";
  }
  col.addEventListener("dblclick",function(e){
    /* Double-clic dans le vide : on crée à l'heure visée, pas à midi. */
    var r=col.getBoundingClientRect(),
        mins=H0*60+Math.round(((e.clientY-r.top)/hourPx)*60/15)*15;
    mins=Math.max(H0*60,Math.min(H1*60-15,mins));
    self.openEventForm(iso,String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0"));
  });
  if(iso===today){
    var now=new Date(),mins=now.getHours()*60+now.getMinutes();
    if(mins>=H0*60&&mins<=H1*60){
      var nl=mk(doc,col,"div","ja-agenda-week-now");
      nl.style.top=(((mins-H0*60)/60)*hourPx)+"px";
    }
  }

  var grouped=Agenda.groupIntoSlots(timed),
      contained=new Set();

  grouped.slots.forEach(function(g){
    var sl=g.slot,sm=Agenda.minutesOf(sl.startTime),em=Agenda.endMinutes(sl);
    if(sm===null||em===null){return;}

    contained.add(sl);
    g.inside.forEach(function(x){contained.add(x);});

    var top=Math.max(sm,H0*60),bottom=Math.min(em,H1*60);
    if(bottom<=top){return;}

    var zone=mk(doc,col,"div","ja-agenda-week-slot-zone ja-agenda-day-slot-container");
    zone.style.setProperty("--ja-item-color",itemColor(self,sl)||"var(--ja-accent)");
    zone.style.top=(((top-H0*60)/60)*hourPx)+"px";
    zone.style.height=Math.max(20,((bottom-top)/60)*hourPx)+"px";
    applyBackdrop(self,zone,sl,"zone");

    if(pickMatch(sl)){zone.classList.add("is-picked");}

    var lab=mk(doc,zone,"div","ja-agenda-week-slot-label"),
        dst=effectiveType(self,sl),
        slotTypeId=effectiveTypeId(self,sl);

    if(dst){appendConfiguredIcon(self,lab,dst,"ja-slot-type-icon");}
    else{mk(doc,lab,"span","","\u25a5");}

    mk(doc,lab,"span","ja-agenda-week-slot-title",sl.title);
    addInlineEdit(self,lab,sl,"is-slot");
    if(g.inside.length){
      mk(doc,lab,"span","ja-agenda-week-slot-count",String(g.inside.length));
    }

    /* Les éléments inclus sont positionnés RELATIVEMENT au créneau.
       09:00 dans un créneau 08:00–17:00 est donc réellement dedans. */
    var inner=mk(doc,zone,"div","ja-agenda-day-slot-inside"),
        span=Math.max(1,em-sm);

    g.inside.forEach(function(item){
      var is=Agenda.minutesOf(timeOf(item)),
          ie=Agenda.endMinutes(item);

      if(is===null){return;}
      if(ie===null||ie<=is){ie=is+(item.kind==="todo"?30:60);}

      var relTop=Math.max(0,Math.min(1,(is-sm)/span)),
          relBottom=Math.max(relTop,Math.min(1,(ie-sm)/span)),
          same=sameEffectiveType(self,sl,item),
          child=mk(doc,inner,"div","ja-agenda-day-slot-child"+(same?" is-same-type":"")+
                   (item.done?" is-done":""));

      child.style.top="calc("+(relTop*100)+"% + 2px)";
      child.style.height="calc("+Math.max(0.04,(relBottom-relTop))*100+"% - 4px)";
      child.style.setProperty("--ja-item-color",itemColor(self,item)||itemColor(self,sl)||"var(--ja-accent)");

      /* Même type = on masque uniquement l'information TYPE.
         L'objet, son titre, son horaire, son statut et SON fond propre
         restent entièrement visibles. */
      paintPill(self,child,item,same?0.18:0.34);
      applyBackdrop(self,child,item,"pill");

      if(pickMatch(item)){child.classList.add("is-picked");}

      var line=mk(doc,child,"div","ja-agenda-day-slot-child-head"),
          it=effectiveType(self,item);

      if(it&&!same){
        appendConfiguredIcon(self,line,it,"ja-slot-child-type-icon");
      }

      if(item.kind==="todo"||item.kind==="habit"){
        var dcb=button(doc,line,"ja-agenda-day-slot-kind ja-agenda-mini-check",item.done?"✓":(item.kind==="habit"?"↻":"□"),item.done?"Rouvrir":"Marquer fait");
        dcb.addEventListener("click",function(e){e.stopPropagation();var ref=item.refTitle||item.title;if(item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,ref,item.date);}else{Agenda.toggleTodoOnDate(self.wiki,ref,item.date);}});
      }

      mk(doc,line,"strong","ja-agenda-day-slot-child-title",item.title);
      addInlineEdit(self,line,item,"is-mini");

      if((ie-is)>=30){
        mk(doc,child,"div","ja-agenda-day-slot-child-time",
           timeOf(item)+(item.endTime?" – "+item.endTime:""));
      }

      self.bindItemGestures(child,item,{
        onPrimary:function(){self.pickInDay(item);}
      });
    });

    self.bindItemGestures(zone,sl,{
      onPrimary:function(){self.pickInDay(sl);}
    });
  });

  /* Seuls les éléments HORS créneau passent dans les lanes libres.
     Avant, les enfants du créneau étaient dessinés une seconde fois ici,
     d'où les deux grands blocs côte à côte visibles sur ta capture. */
  var placed=[];
  timed.forEach(function(x){
    if(contained.has(x)){return;}
    var sm=Agenda.minutesOf(timeOf(x));
    if(sm===null){return;}
    var em=Agenda.endMinutes(x);
    if(em===null||em<=sm){em=sm+30;}
    placed.push({item:x,a:sm,b:em});
  });
  placed.sort(function(p,q){return p.a-q.a||p.b-q.b;});
  placed.forEach(function(p){
    p.lane=0;
    var voisins=placed.filter(function(q){return q!==p&&q.a<p.b&&p.a<q.b;});
    while(voisins.some(function(q){return q.lane===p.lane;})){p.lane++;}
    p.lanes=1+voisins.reduce(function(n,q){return Math.max(n,q.lane||0);},p.lane);
  });
  placed.forEach(function(p){
    var top=Math.max(p.a,H0*60),bottom=Math.min(p.b,H1*60);
    if(bottom<=top){return;}
    var el=mk(doc,col,"div","ja-agenda-week-block"+(p.item.done?" is-done":"")+
              (p.item.status==="annule"?" is-cancelled":"")),
        lanes=Math.max(1,p.lanes||1),w=100/lanes;
    el.style.setProperty("--ja-item-color",itemColor(self,p.item)||"var(--ja-accent)");
    el.style.top=(((top-H0*60)/60)*hourPx)+"px";
    el.style.height=Math.max(18,((bottom-top)/60)*hourPx-2)+"px";
    el.style.left="calc("+(p.lane*w)+"% + 3px)";
    el.style.width="calc("+w+"% - 6px)";
    paintPill(self,el,p.item,0.38);
    applyBackdrop(self,el,p.item,"pill");
    if(pickMatch(p.item)){el.classList.add("is-picked");}
    var freeHead=mk(doc,el,"div","ja-agenda-week-block-title");if(p.item.kind==="todo"||p.item.kind==="habit"){var fcb=button(doc,freeHead,"ja-agenda-mini-check",p.item.done?"✓":(p.item.kind==="habit"?"↻":"□"),p.item.done?"Rouvrir":"Marquer fait");fcb.addEventListener("click",function(e){e.stopPropagation();var ref=p.item.refTitle||p.item.title;if(p.item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,ref,p.item.date);}else{Agenda.toggleTodoOnDate(self.wiki,ref,p.item.date);}});}mk(doc,freeHead,"span","",p.item.title);addInlineEdit(self,freeHead,p.item,"is-mini");
    mk(doc,el,"div","ja-agenda-week-block-time",
       timeOf(p.item)+(p.item.endTime?" \u2013 "+p.item.endTime:""));
    self.bindItemGestures(el,p.item,{onPrimary:function(){self.pickInDay(p.item);}});
  });

  /*
    LES ENTRÉES DAILY.
    Elles portent une heure et racontent la journée ; les cacher de la seule
    vue qui montre la journée heure par heure n'avait aucun sens. Elles se
    posent sur le fil comme le reste, mais dans une écriture à part : ce sont
    des traces de ce qui a eu lieu, pas des choses à faire. Elles ne se
    mélangent donc pas aux blocs d'agenda et gardent leur propre couloir,
    étroit, contre le bord droit de la colonne.
  */
  var dailies=Agenda.dailyEntriesForDate(this.wiki,iso),
      dailyLibres=[];
  dailies.forEach(function(rec){
    var f=rec.tiddler.fields,
        heure=String(f.time||""),
        mn=Agenda.minutesOf(heure);
    if(mn===null||mn<H0*60||mn>H1*60){dailyLibres.push(rec);return;}
    var el=mk(doc,col,"div","ja-agenda-daily-mark");
    el.style.top=(((mn-H0*60)/60)*hourPx)+"px";
    var pastille=mk(doc,el,"span","ja-agenda-daily-dot");
    if(f["mood-emoji"]){pastille.textContent=String(f["mood-emoji"]);}
    mk(doc,el,"span","ja-agenda-daily-time",heure);
    var extrait=Agenda.noteToPlainText(f.text,doc);
    mk(doc,el,"span","ja-agenda-daily-text",extrait.slice(0,60)||"Entrée Daily");
    el.title=heure+" · "+(extrait.slice(0,140)||"Entrée Daily");
    el.addEventListener("click",function(e){
      e.stopPropagation();
      openDailyInJournal(self,rec);
    });
  });

  /* ── Panneau de détails : UNE chronologie, tous types confondus. ──
     Les Dailies et les objets Agenda sont mélangés selon leur heure. Aucun
     sous-groupe « événements / to-dos / Dailies » : l'heure est le seul axe. */
  var side=mk(doc,frame,"aside","ja-agenda-dayview-side"),choisi=null;
  all.some(function(x){if(pickMatch(x)){choisi=x;return true;}return false;});
  var sideHead=mk(doc,side,"div","ja-agenda-daydetail-head");
  mk(doc,sideHead,"span","ja-agenda-kicker","Chronologie du jour · "+(all.length+dailies.length));
  if(choisi){
    button(doc,sideHead,"ja-agenda-pick-back","×","Désélectionner")
      .addEventListener("click",function(){self.pickInDay(null);});
  }

  var details=[];
  all.forEach(function(item){
    var at=timeOf(item)||"",isAllDay=!at&&item.kind==="event";
    details.push({kind:"agenda",at:at,rank:isAllDay?0:(at?1:2),group:isAllDay?"Toute la journée":(at||"Sans heure"),item:item});
  });
  dailies.forEach(function(rec){
    var at=String(rec.tiddler.fields.time||"");
    details.push({kind:"daily",at:at,rank:at?1:2,group:at||"Sans heure",rec:rec});
  });
  details.sort(function(a,b){
    if(a.rank!==b.rank){return a.rank-b.rank;}
    var aa=a.at||"",bb=b.at||"";
    return aa.localeCompare(bb)||(a.kind==="daily"?-1:1);
  });
  if(!details.length){mk(doc,side,"div","ja-agenda-empty","Rien à afficher ce jour-là.");}
  var lastHour=null;
  details.forEach(function(entry){
    var hour=entry.group;
    if(hour!==lastHour){mk(doc,side,"div","ja-agenda-daydetail-hour"+(entry.rank===0?" is-allday":""),hour);lastHour=hour;}
    if(entry.kind==="daily"){
      dailySummary(self,side,entry.rec);
    }else{
      var grp=slotContaining(grouped,entry.item),ct=grp?effectiveTypeId(self,grp.slot):"",
          c=self.renderItem(side,entry.item,false,ct);
      if(c&&choisi===entry.item){c.classList.add("is-picked");}
    }
  });

  var addBox=mk(doc,side,"div","ja-agenda-dayview-add");
  [["\ud83d\udcc5 Événement",function(){Forms.openEvent(self,{date:iso});}],
   ["\u2611 To-do",function(){Forms.openTodo(self,{date:iso});}],
   ["\u25a5 Créneau",function(){Forms.openSlot(self,{date:iso});}]].forEach(function(x){
    button(doc,addBox,"ja-agenda-detail-act",x[0]).addEventListener("click",x[1]);
  });
};

AgendaWidget.prototype.renderUpcoming=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),today=Agenda.todayIso();
  /* « À venir », c'est l'agenda du présent : on ne démarre jamais avant
     aujourd'hui — sauf si on a explicitement navigué avec les flèches, qui
     jusqu'ici ne faisaient rien du tout dans cette vue. */
  var start=Agenda.cmp(this.date,today)!==0?this.date:today,
      n=Math.max(1,+cfg.listDays||14),
      end=Agenda.addDays(start,n-1),
      ev=Agenda.eventsForRange(this.wiki,start,end),
      td=Agenda.todosForRange(this.wiki,start,end,{calendarOnly:true}),
      hb=Agenda.habitsForRange(this.wiki,start,end,{calendarOnly:true});

  var head=mk(doc,root,"div","ja-agenda-section-head");
  mk(doc,head,"div","ja-agenda-kicker","À venir");
  mk(doc,head,"h1","ja-agenda-title",
     start===today?("Les "+n+" prochains jours"):("À partir du "+pretty(start)));

  var days=[];
  for(var cur=start;Agenda.cmp(cur,end)<=0;cur=Agenda.addDays(cur,1)){days.push(cur);}
  if(listOrderOf(self)==="farthest-first"||listOrderOf(self)==="recent-first"){days.reverse();}

  var shown=false;
  days.forEach(function(iso){
    var items=self.applyFilters(dayItemsFromRange(ev,td,hb,iso)),
        vac=self.vacationsVisible()?Agenda.vacationsForDate(self.wiki,iso):[],
        edge=vac.some(function(v){return v.start===iso||v.end===iso;});
    if(!items.length&&!edge){return;}
    shown=true;
    var sec=mk(doc,root,"section","ja-agenda-daygroup"+(iso===today?" is-today":""));
    self.renderDayHeader(sec,iso,{count:items.length});
    self.renderDaySchedule(sec,items,"");
  });

  if(!shown){
    var e=mk(doc,root,"div","ja-agenda-emptystate");
    mk(doc,e,"div","ja-agenda-emptystate-ic","🗓");
    mk(doc,e,"div","ja-agenda-emptystate-txt",
       self.filterCount()?"Rien ne correspond aux filtres sur cette période."
                         :"Rien de prévu sur la période affichée.");
    /* Un écran vide sans porte de sortie est un cul-de-sac. */
    button(doc,e,"ja-agenda-smallbtn","＋ Ajouter un événement")
      .addEventListener("click",function(){self.openEventForm(start);});
  }
};

AgendaWidget.prototype.renderDayHeader=function(parent,iso,opts){
  opts=opts||{};
  var self=this,doc=this.document,d=Agenda.parseIso(iso),today=Agenda.todayIso(),
      head=mk(doc,parent,"div","ja-agenda-dayhead"+(iso===today?" is-today":""));
  var num=mk(doc,head,"div","ja-agenda-dayhead-num");
  mk(doc,num,"span","ja-agenda-dayhead-dow",
     new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d).replace(".",""));
  mk(doc,num,"span","ja-agenda-dayhead-fig",String(d.getDate()));

  var info=mk(doc,head,"div","ja-agenda-dayhead-info");
  var mname=new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(d);
  mk(doc,info,"div","ja-agenda-dayhead-month",mname.charAt(0).toUpperCase()+mname.slice(1));
  var sub=mk(doc,info,"div","ja-agenda-dayhead-sub");
  if(iso===today){mk(doc,sub,"span","ja-agenda-badge-today","aujourd\u2019hui");}
  else{mk(doc,sub,"span","ja-agenda-dayhead-rel",relativeDay(iso));}
  if(this.vacationsVisible()){
    Agenda.vacationsForDate(this.wiki,iso).slice(0,2).forEach(function(v){
      var vi=vacationVisual(self,v),
          b=mk(doc,sub,"span","ja-agenda-badge-vac",vi.icon+" "+vi.label);
      if(vi.color){b.style.setProperty("--ja-vac-color",vi.color);}
    });
  }
  if(opts.count){mk(doc,head,"span","ja-agenda-dayhead-count",String(opts.count));}
  if(opts.clickable!==false){
    head.classList.add("is-clickable");
    head.setAttribute("role","button");
    head.setAttribute("tabindex","0");
    head.title="Ouvrir cette journée";
    head.addEventListener("click",function(){self.openDay(iso);});
    head.addEventListener("keydown",function(e){
      if(e.key==="Enter"||e.key===" "){e.preventDefault();self.openDay(iso);}
    });
  }
  return head;
};

AgendaWidget.prototype.renderVacationBanner=function(parent,iso){
  if(!this.vacationsVisible()){return;}
  var self=this,doc=this.document,vac=Agenda.vacationsForDate(this.wiki,iso);
  if(!vac.length){return;}
  var list=mk(doc,parent,"div","ja-agenda-vac-banner-list");
  vac.forEach(function(v){
    var vi=vacationVisual(self,v),
        card=mk(doc,list,"div","ja-agenda-vac-banner");
    if(vi.color){card.style.setProperty("--ja-vac-color",vi.color);}
    applyBackdrop(self,card,vi,"pill");
    mk(doc,card,"span","ja-agenda-vac-banner-icon",vi.icon);
    mk(doc,card,"span","ja-agenda-vac-banner-label",vi.label);
    var vb=button(doc,card,"ja-agenda-inline-edit is-mini","✎","Modifier");vb.addEventListener("click",function(e){e.stopPropagation();Forms.openVacation(self,{editTitle:vi.refTitle});});
  });
};
AgendaWidget.prototype.renderDaySchedule=function(parent,items,empty){
  var self=this,doc=this.document;items=this.applyFilters(items);if(!items.length){if(empty){mk(doc,parent,"div","ja-agenda-empty",empty);}return;}
  var grouped=Agenda.groupIntoSlots(items),entries=[];
  grouped.slots.forEach(function(g){entries.push({kind:"slot",at:g.slot.startTime||"",group:g});});
  grouped.free.forEach(function(item){entries.push({kind:"item",at:timeOf(item)||"",item:item});});
  /* Tout ce qui n'a pas d'heure était renvoyé en bloc à la fin. Or un
     événement « journée entière » n'est pas un reliquat : c'est le cadre du
     jour, il se lit en premier. Ce qui n'a pas d'heure PARCE QUE ce n'est
     pas planifié — une to-do sans rappel — descend, lui, en fin de journée. */
  entries.forEach(function(e){
    var timed=e.kind==="slot"?!!e.group.slot.startTime:!!timeOf(e.item);
    if(timed){e.rank=1;e.at=e.kind==="slot"?e.group.slot.startTime:timeOf(e.item);return;}
    var isTodoish=e.kind==="item"&&(e.item.kind==="todo"||e.item.kind==="habit");
    e.rank=isTodoish?2:0;e.at="";
  });
  entries.sort(function(a,b){
    if(a.rank!==b.rank){return a.rank-b.rank;}
    return a.at.localeCompare(b.at)||(a.kind==="slot"?-1:1);
  });
  var list=mk(doc,parent,"div","ja-agenda-list");entries.forEach(function(e){if(e.kind==="slot"){self.renderSlotContainer(list,e.group);}else{self.renderItem(list,e.item);}});
};
AgendaWidget.prototype.renderSlotContainer=function(parent,group){
  var self=this,doc=this.document,slot=group.slot,box=mk(doc,parent,"section","ja-agenda-slot-container"),col=itemColor(this,slot);if(col){box.style.setProperty("--ja-item-color",col);}applyBackdrop(this,box,slot);box.addEventListener("contextmenu",function(e){e.preventDefault();self.openItemMenu(slot,e.clientX,e.clientY);});
  var h=mk(doc,box,"div","ja-agenda-slot-head"),
      slotType=effectiveType(this,slot);
  if(slotType){appendConfiguredIcon(this,h,slotType,"ja-agenda-slot-icon ja-slot-type-icon");}
  else{mk(doc,h,"span","ja-agenda-slot-icon","▥");}
  mk(doc,h,"strong","ja-agenda-slot-title",slot.title);addInlineEdit(self,h,slot);if(slot.marker){var m=markerGlyph(this,slot);if(m){mk(doc,h,"span","ja-agenda-marker",m.emoji||"•").title=m.label||"";}}
  mk(doc,h,"span","ja-agenda-slot-time",slot.startTime+(slot.endTime?" – "+slot.endTime:""));if(group.inside.length){mk(doc,h,"span","ja-agenda-slot-count",String(group.inside.length));}
  if(slot.note){mk(doc,box,"div","ja-agenda-slot-note",Agenda.noteToPlainText(slot.note,doc).slice(0,220));}
  var body=mk(doc,box,"div","ja-agenda-slot-body");if(!group.inside.length){mk(doc,body,"div","ja-agenda-slot-empty","Créneau libre.");return;}
  /* Une carte fille du même type que son créneau n'a rien à réaffirmer :
     le cadre dit déjà la couleur, elle peut renoncer à son fond plein et
     laisser passer le décor. Ce qui est d'un AUTRE type garde le sien —
     c'est précisément l'intrus qu'on veut repérer d'un coup d'œil. */
  var slotTypeId=effectiveTypeId(self,slot);
  group.inside.forEach(function(item){
    var card=self.renderItem(body,item,true,slotTypeId);
    if(card&&sameEffectiveType(self,slot,item)){
      card.classList.add("is-same-type");
    }
  });
};
AgendaWidget.prototype.renderTodoSubtasks=function(parent,rootTitle,iso){
  return AgendaUI.renderTodoSubtasks(this,parent,rootTitle,iso||this.date||Agenda.todayIso(),{compact:false});
};
AgendaWidget.prototype.renderItem=function(parent,item,nested,containerTypeId){
  var self=this,doc=this.document,t=item.tiddler,f=t.fields,ref=item.refTitle||t.fields.title||item.title,cfg=Agenda.readConfig(this.wiki),cls="ja-agenda-card is-"+item.kind+(item.role==="birthday"?" is-birthday":"")+(nested?" is-nested":"")+(item.done?" is-done":"")+(item.status==="annule"||item.status==="cancelled"?" is-cancelled":""),card=mk(doc,parent,"article",cls),marker=markerGlyph(this,item),type=item.type||null,col=itemColor(this,item);if(col){card.style.setProperty("--ja-item-color",col);}if(cfg.showMedia!==false){applyBackdrop(this,card,item);}self.bindItemGestures(card,item,{onPrimary:function(){if(item.role==="birthday"){self.dispatchEvent({type:"tm-navigate",navigateTo:ref});}}});
  var top=mk(doc,card,"div","ja-agenda-card-head"),todoSt=item.kind==="todo"?todoStatus(t):"",icon=item.role==="birthday"?"🎂":(item.kind==="todo"?({a_faire:"□",en_cours:"◩",fait:"✓",reporte:"→",annule:"×"}[todoSt]||"□"):(item.kind==="habit"?"↻":"📅"));mk(doc,top,"span","ja-agenda-card-icon",icon);var title=mk(doc,top,"strong","ja-agenda-card-title",item.title);if(item.done){title.classList.add("is-done");}
  if(marker){var m=mk(doc,top,"span","ja-agenda-marker",marker.emoji||"•");m.title=marker.label||"";}if(item.recurring){mk(doc,top,"span","ja-agenda-mini-badge","↻").title="Récurrent";}if(item.linked){mk(doc,top,"span","ja-agenda-mini-badge","↔").title="Lié à une entrée Daily";}
  var time=timeOf(item)?(item.endTime?timeOf(item)+" – "+item.endTime:timeOf(item)):"Journée";mk(doc,top,"span","ja-agenda-card-time",time);if(!item.parentTodo){addInlineEdit(self,top,item);}
  var meta=mk(doc,card,"div","ja-agenda-card-meta"),
      effType=type||effectiveType(this,item),
      effTypeId=effType?String(effType.id||""):"";
  if(effType&&(!containerTypeId||effTypeId!==String(containerTypeId))){
    var tc=mk(doc,meta,"span","ja-agenda-chip ja-agenda-type-chip"+(type?"":" is-inherited"));
    appendConfiguredIcon(this,tc,effType,"ja-agenda-type-icon");
    mk(doc,tc,"span","",effType.label);
    if(!type){tc.title="Type hérité du projet";}
  }
  if(item.kind==="todo"){
    var ts=todoStatus(t),tm={
      a_faire:["□","À faire",""],
      en_cours:["◩","En cours"," is-progress"],
      fait:["✓","Fait"," is-ok"],
      reporte:["→","Reporté",""],
      annule:["×","Annulé"," is-off"]
    }[ts]||["□","À faire",""];
    var tsc=button(doc,meta,"ja-agenda-chip ja-todo-status-chip ja-agenda-status-action"+tm[2],tm[0]+" "+tm[1],"Changer l’état");tsc.addEventListener("click",function(e){e.stopPropagation();self.openInlineStatusMenu(tsc,item);});
  }else if(item.kind==="event"&&item.role!=="slot"){var evLabel=item.status==="fait"?"✓ Fait":((item.status==="annule"||item.status==="cancelled")?"✕ Annulé":(item.status==="reporte"?"→ Reporté":(item.status==="avance"?"← Avancé":"• Normal"))),evs=button(doc,meta,"ja-agenda-chip ja-agenda-status-action"+((item.status==="fait")?" is-ok":((item.status==="annule"||item.status==="cancelled")?" is-off":"")),evLabel,"Changer l’état");evs.addEventListener("click",function(e){e.stopPropagation();self.openInlineStatusMenu(evs,item);});}if(item.dateEnd&&Agenda.cmp(String(item.dateEnd),String(item.date))>0){var da=Agenda.parseIso(item.date),db=Agenda.parseIso(item.dateEnd),mfmt=new Intl.DateTimeFormat("fr-FR",{month:"short"});mk(doc,meta,"span","ja-agenda-chip","⇥ "+da.getDate()+" → "+db.getDate()+" "+mfmt.format(db));}if(item.kind==="todo"&&item.deadline){mk(doc,meta,"span","ja-agenda-chip","Échéance "+item.deadline);}if(item.kind==="todo"){var effort=Agenda.todoEffortInfo(this.wiki,ref);if(effort.total){mk(doc,meta,"span","ja-agenda-chip ja-agenda-effort-chip","⏱ "+(effort.remaining<effort.total?fmtEffort(effort.remaining)+" reste / ":"")+fmtEffort(effort.total));}}else if(item.durationMinutes){mk(doc,meta,"span","ja-agenda-chip","⏱ "+fmtEffort(item.durationMinutes));}if(item.countdown&&item.date){var dd=Math.round((Agenda.parseIso(item.date)-Agenda.parseIso(Agenda.todayIso()))/86400000),txt=dd===0?"aujourd’hui":(dd>0?"dans "+dd+" j":"il y a "+(-dd)+" j"),ccls=dd<0?" is-past":(dd<=3?" is-urgent":" is-countdown");mk(doc,meta,"span","ja-agenda-chip"+ccls,(dd<0?"⏱ ":"⌛ ")+txt);}
  if(!meta.childNodes.length){meta.remove();}var tags=mk(doc,card,"div","ja-agenda-card-tags");[["projects","🧩"],["people","👤"],["places","📍"],["activities","🏃"],["events","📅"],["todos","☑"],["habits","↻"],["dreams","🌙"],["channels","◌"],["media","🎞️"],["sleep","🌙"]].forEach(function(g){var vals=item[g[0]]||[];if(!vals.length){return;}var grp=mk(doc,tags,"span","ja-agenda-tag-group");mk(doc,grp,"span","ja-agenda-tag-ic",g[1]);vals.forEach(function(v){mk(doc,grp,"span","ja-agenda-tag",v);});});if(!tags.childNodes.length){tags.remove();}
  if(item.note){mk(doc,card,"div","ja-agenda-card-note",Agenda.noteToPlainText(item.note,doc));}
  if(item.progress&&item.progress.length){var pg=mk(doc,card,"div","ja-agenda-card-progress-notes");item.progress.slice().reverse().forEach(function(p){if(!p){return;}var line=mk(doc,pg,"div","ja-agenda-progress-note");if(p.date){mk(doc,line,"span","ja-agenda-progress-date",String(p.date));}mk(doc,line,"span","ja-agenda-progress-text",String(p.text||p.note||""));});}
  if(item.checklist&&item.checklist.length){
    /* La préparation était une barre de progression morte : on voyait 2/5
       sans pouvoir cocher la troisième. Cocher est le geste le plus fréquent
       sur une check-list ; il ne doit pas passer par le formulaire. */
    var cl=mk(doc,card,"div","ja-agenda-card-checklist"),
        clHead=mk(doc,cl,"div","ja-agenda-checklist-head"),
        clBody=mk(doc,cl,"div","ja-agenda-checklist-body");
    (function(){
      var listItems=item.checklist.map(function(x){return {text:String(x.text||x.texte||""),done:!!(x.done||x.fait)};});
      function persist(){
        var tt=self.wiki.getTiddler(ref);
        if(!tt){return;}
        self.wiki.addTiddler(new $tw.Tiddler(tt,{checklist:JSON.stringify(listItems)},{modified:new Date()}));
      }
      function draw(){
        var doneN=listItems.filter(function(x){return x.done;}).length;
        clHead.innerHTML="";
        mk(doc,clHead,"span","ja-agenda-checklist-label","\u2611 Préparation");
        mk(doc,clHead,"span","ja-agenda-checklist-count",doneN+"/"+listItems.length);
        var bar=mk(doc,clHead,"span","ja-agenda-card-progress"),fill=mk(doc,bar,"i","");
        fill.style.width=((doneN/listItems.length)*100)+"%";
        cl.classList.toggle("is-complete",doneN===listItems.length);
        clBody.innerHTML="";
        listItems.forEach(function(it,i){
          var line=button(doc,clBody,"ja-agenda-checkline"+(it.done?" is-done":""),"");
          mk(doc,line,"span","ja-agenda-checkline-box",it.done?"\u2713":"");
          mk(doc,line,"span","ja-agenda-checkline-text",it.text);
          line.addEventListener("click",function(e){
            e.stopPropagation();
            listItems[i].done=!listItems[i].done;
            draw();persist();
          });
        });
      }
      draw();
    })();
  }
  if(item.kind==="todo"){
    this.renderTodoSubtasks(card,ref,item.date||this.date);
  }
  /*
    MÉDIA : carrousel latéral, pas vignettes en bas.
    Quatre carrés alignés sous le texte cassaient la lecture et poussaient
    tout ce qui suit vers le bas. Un seul carré à gauche, feuilletable :
    la carte garde sa hauteur quel que soit le nombre d'images.
  */
  var gallery=cfg.showMedia===false?[]:(item.images||[]).filter(function(im){
    return !(im.back||im.banner||im.baniere);
  }).filter(function(im){return !!Media.src(self.wiki,im.src||im.path||"");});
  if(gallery.length){
    card.classList.add("has-media");
    var med=mk(doc,card,"div","ja-agenda-media"),idx=0,
        img=mk(doc,med,"img","ja-agenda-media-img");
    img.alt="";
    function show(){
      var im=gallery[idx],src=Media.src(self.wiki,im.src||im.path||"");
      img.src=src;
      img.style.objectFit=im.fit||"cover";
      img.alt=im.caption||"";
      Array.prototype.forEach.call(med.querySelectorAll(".ja-agenda-dot"),function(d,i){
        d.classList.toggle("is-on",i===idx);
      });
    }
    img.addEventListener("click",function(e){
      e.stopPropagation();
      var src=Media.src(self.wiki,gallery[idx].src||gallery[idx].path||"");
      if(src){window.open(src,"_blank");}
    });
    if(gallery.length>1){
      [["prev",-1,"\u2039"],["next",1,"\u203a"]].forEach(function(x){
        var b=button(doc,med,"ja-agenda-media-nav ja-agenda-media-"+x[0],x[2],
                     x[1]<0?"Image pr\u00e9c\u00e9dente":"Image suivante");
        b.addEventListener("click",function(e){
          e.stopPropagation();
          idx=(idx+x[1]+gallery.length)%gallery.length;
          show();
        });
      });
      var dots=mk(doc,med,"div","ja-agenda-media-dots");
      gallery.forEach(function(im,i){
        var d=mk(doc,dots,"span","ja-agenda-dot");
        d.addEventListener("click",function(e){e.stopPropagation();idx=i;show();});
      });
    }
    show();
  }
  if(cfg.showMedia!==false&&item.audios&&item.audios.length){var audioBox=mk(doc,card,"div","ja-agenda-card-audios");item.audios.forEach(function(ref){var src=Media.src(self.wiki,ref);if(!src){return;}var a=mk(doc,audioBox,"audio","ja-agenda-card-audio");a.controls=true;a.preload="metadata";a.src=src;a.addEventListener("click",function(e){e.stopPropagation();});});}
  if(cfg.showMedia!==false&&item.links&&item.links.length){var links=mk(doc,card,"div","ja-agenda-card-links");item.links.forEach(function(l){if(!l||!l.url){return;}var a=mk(doc,links,"a","ja-agenda-card-link",String(l.url).replace(/^https?:\/\/(www\.)?/,"").slice(0,42));if(l.internal){a.href="#";a.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();self.dispatchEvent({type:"tm-navigate",navigateTo:l.url});});}else{a.href=l.url;a.target="_blank";a.rel="noopener";a.addEventListener("click",function(e){e.stopPropagation();});}});}
  var foot=mk(doc,card,"div","ja-agenda-card-actions");if(item.kind==="todo"||item.kind==="habit"){var check=button(doc,foot,"ja-agenda-smallbtn",item.done?"↩ Rouvrir":"✓ Fait");check.addEventListener("click",function(e){e.stopPropagation();if(item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,ref,item.date);}else{Agenda.toggleTodoOnDate(self.wiki,ref,item.date);}});}if(item.role!=="birthday"&&!item.done&&String(item.status||"")!=="fait"){var prog=button(doc,foot,"ja-agenda-smallbtn","＋ Progression","Ajouter une note de progression");prog.addEventListener("click",function(e){e.stopPropagation();self.addProgress(item);});}
  var linked=item.role==="birthday"?[]:Agenda.linkedDailiesForItem(this.wiki,ref,item.kind,item.date);if(linked.length){var linksBox=mk(doc,card,"div","ja-agenda-linked-dailies");mk(doc,linksBox,"span","ja-agenda-linked-label","↔ Entrées Daily");linked.forEach(function(rec){var f=rec.tiddler.fields,label=String(f.date||"")+(f.time?" · "+f.time:"");var b=button(doc,linksBox,"ja-agenda-daily-chip",label||"Daily");b.addEventListener("click",function(e){e.stopPropagation();openDailyInJournal(self,rec);});});}
  /* Le média est bâti au milieu du flux mais doit s'afficher à gauche de
     TOUT le contenu. On range donc en fin de construction : le carré passe
     devant, le reste s'assemble dans une colonne à sa droite. */
  var mediaBox=card.querySelector(":scope > .ja-agenda-media");
  if(mediaBox){
    var content=doc.createElement("div");
    content.className="ja-agenda-card-content";
    while(card.firstChild){
      if(card.firstChild===mediaBox){card.removeChild(mediaBox);continue;}
      content.appendChild(card.firstChild);
    }
    card.appendChild(mediaBox);
    card.appendChild(content);
  }
  return card;
};
AgendaWidget.prototype.renderMonthMini=function(parent,item,nested,displayDate,containerTypeId){
  var self=this,doc=this.document,
      same=nested&&containerTypeId&&effectiveTypeId(this,item)===String(containerTypeId),
      p=mk(doc,parent,"div","ja-agenda-month-item"+(nested?" is-nested":"")+
           (same?" is-same-type":"")+
           (item.kind==="todo"?" is-todo":(item.kind==="habit"?" is-habit":""))+
           (item.done?" is-done":""));
  /* Même règle qu'en Jour : "même type" ne supprime jamais
     l'objet ni son fond automatique spécifique à son genre. */
  paintPill(this,p,item,same?0.14:(nested?0.17:0.30));
  applyBackdrop(this,p,item,"pill");
  var marker=markerGlyph(this,item);
  if(item.kind==="todo"||item.kind==="habit"){var mic=button(doc,p,"ja-agenda-month-icon ja-agenda-mini-check",item.kind==="habit"?(item.done?"✓":"↻"):(item.done?"✓":"□"),item.done?"Rouvrir":"Marquer fait");mic.addEventListener("click",function(e){e.stopPropagation();var ref=item.refTitle||item.title;if(item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,ref,displayDate||item.date);}else{Agenda.toggleTodoOnDate(self.wiki,ref,displayDate||item.date);}});}else if(item.role==="slot"){
    var mt=effectiveType(this,item);
    if(mt){appendConfiguredIcon(this,p,mt,"ja-agenda-month-icon ja-slot-type-icon");}
    else{mk(doc,p,"span","ja-agenda-month-icon","▥");}
  }else{mk(doc,p,"span","ja-agenda-month-icon","•");}
  if(timeOf(item)){mk(doc,p,"span","ja-agenda-month-time",timeOf(item));}mk(doc,p,"span","ja-agenda-month-title",item.title);if(marker){mk(doc,p,"span","ja-agenda-month-marker",marker.emoji||"•");}addInlineEdit(self,p,item,"is-mini");
  self.bindItemGestures(p,item,{onPrimary:function(){setDate(self,displayDate||item.date);}});return p;
};

/* Une seule règle de composition compacte pour Mois ET les listes détaillées
   de l'Aperçu : un élément compris dans un créneau reste visuellement dedans. */
AgendaWidget.prototype.renderMonthMiniGroup=function(parent,items,displayDate,maxItems){
  var self=this,doc=this.document,grouped=Agenda.groupIntoSlots(items||[]),used=0,
      limit=(maxItems===undefined||maxItems===null)?Infinity:maxItems;

  grouped.slots.forEach(function(g){
    if(used>=limit){return;}
    var s=mk(doc,parent,"div","ja-agenda-month-slot"),
        col=itemColor(self,g.slot);
    if(col){s.style.setProperty("--ja-item-color",col);}
    applyBackdrop(self,s,g.slot,"pill");

    var sh=mk(doc,s,"div","ja-agenda-month-slot-head");
    paintPill(self,sh,g.slot,0.30);
    var mst=effectiveType(self,g.slot);
    if(mst){appendConfiguredIcon(self,sh,mst,"ja-agenda-month-icon ja-slot-type-icon");}
    else{mk(doc,sh,"span","ja-agenda-month-icon","▥");}
    if(g.slot.startTime){mk(doc,sh,"span","ja-agenda-month-time",g.slot.startTime);}
    mk(doc,sh,"span","ja-agenda-month-title",g.slot.title);
    if(g.inside.length){mk(doc,sh,"span","ja-agenda-month-slot-count",String(g.inside.length));}
    used++;

    if(g.inside.length&&used<limit){
      var inside=mk(doc,s,"div","ja-agenda-month-slot-inside");
      g.inside.forEach(function(x){
        if(used>=limit){return;}
        self.renderMonthMini(inside,x,true,displayDate,effectiveTypeId(self,g.slot));
        used++;
      });
    }
  });

  grouped.free.forEach(function(x){
    if(used>=limit){return;}
    self.renderMonthMini(parent,x,false,displayDate);
    used++;
  });

  if((items||[]).length>used&&limit!==Infinity){
    mk(doc,parent,"div","ja-agenda-month-more","+ "+((items||[]).length-used)+" autre"+(((items||[]).length-used)>1?"s":""));
  }
  return used;
};

AgendaWidget.prototype.renderMonth=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),monthStart=Agenda.startOfMonth(this.date),monthEnd=Agenda.endOfMonth(this.date),gridStart=Agenda.startOfWeek(monthStart,cfg.firstDayOfWeek),gridEnd=Agenda.addDays(gridStart,41),events=Agenda.eventsForRange(this.wiki,gridStart,gridEnd),todos=Agenda.todosForRange(this.wiki,gridStart,gridEnd,{calendarOnly:true}),habits=Agenda.habitsForRange(this.wiki,gridStart,gridEnd,{calendarOnly:true}),today=Agenda.todayIso();
  var grid=mk(doc,root,"div","ja-agenda-month-grid"),labels=+cfg.firstDayOfWeek===1?DOW_SUNDAY:DOW_MONDAY;labels.forEach(function(l){mk(doc,grid,"div","ja-agenda-month-dow",l);});
  for(var i=0;i<42;i++){
    (function(){var iso=Agenda.addDays(gridStart,i),d=Agenda.parseIso(iso),items=self.applyFilters(dayItemsFromRange(events,todos,habits,iso)),cell=mk(doc,grid,"div","ja-agenda-month-cell"+(iso.slice(0,7)!==monthStart.slice(0,7)?" is-out":"")+(iso===today?" is-today":"")+(iso===self.date?" is-selected":""));cell.dataset.date=iso;
      var vac=self.vacationsVisible()?Agenda.vacationsForDate(self.wiki,iso):[];if(vac.length){cell.classList.add("is-vacation");if(vac[0].color){cell.style.setProperty("--ja-vac-color",vac[0].color);}if(iso===vac[0].start){mk(doc,cell,"div","ja-agenda-month-vac",vac[0].label);}}
      var ch=mk(doc,cell,"div","ja-agenda-month-cell-head");mk(doc,ch,"span","ja-agenda-month-num",String(d.getDate()));if(items.length){mk(doc,ch,"span","ja-agenda-month-count",String(items.length));}
      var zone=mk(doc,cell,"div","ja-agenda-month-items");
      self.renderMonthMiniGroup(zone,items,iso,4);
      cell.addEventListener("click",function(){self.openDay(iso);});cell.addEventListener("dblclick",function(e){e.stopPropagation();self.openEventForm(iso);});
    })();
  }
  
};
AgendaWidget.prototype.renderWeekAllDayPill=function(parent,item,iso){
  var self=this,doc=this.document,p=mk(doc,parent,"div","ja-agenda-week-allday-pill"+(item.kind==="todo"?" is-todo":(item.kind==="habit"?" is-habit":""))+(item.done?" is-done":""));paintPill(this,p,item,0.28);applyBackdrop(this,p,item,"pill");if(item.kind==="todo"||item.kind==="habit"){var cb=button(doc,p,"ja-agenda-week-check",item.done?"✓":"□",item.done?"Rouvrir":"Marquer fait");cb.addEventListener("click",function(e){e.stopPropagation();if(item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,item.refTitle||item.title,iso);}else{Agenda.toggleTodoOnDate(self.wiki,item.refTitle||item.title,iso);}});}mk(doc,p,"span","ja-agenda-week-allday-title",item.title);addInlineEdit(self,p,item,"is-mini");self.bindItemGestures(p,item,{onPrimary:function(){setDate(self,iso);}});
};
AgendaWidget.prototype.renderWeek=function(root){
  var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),start=Agenda.startOfWeek(this.date,cfg.firstDayOfWeek),end=Agenda.endOfWeek(this.date,cfg.firstDayOfWeek),days=[],events=Agenda.eventsForRange(this.wiki,start,end),todos=Agenda.todosForRange(this.wiki,start,end,{calendarOnly:true}),habits=Agenda.habitsForRange(this.wiki,start,end,{calendarOnly:true}),today=Agenda.todayIso();var _tous=[].concat(this.applyFilters(events),this.applyFilters(todos),this.applyFilters(habits));var _f=hourWindow(this,_tous,cfg),H0=_f.H0,H1=_f.H1,hours=H1-H0,hourPx=hourScale(this,hours);
  events=this.applyFilters(events);todos=this.applyFilters(todos);habits=this.applyFilters(habits);for(var di=0;di<7;di++){days.push(Agenda.addDays(start,di));}
  var scroll=mk(doc,root,"div","ja-agenda-week-scroll"),frame=mk(doc,scroll,"div","ja-agenda-week-frame");frame.style.setProperty("--ja-week-hours",String(hours));frame.style.setProperty("--ja-week-hour-px",hourPx+"px");
  var wh=mk(doc,frame,"div","ja-agenda-week-head");mk(doc,wh,"div","ja-agenda-week-corner","");days.forEach(function(iso){var d=Agenda.parseIso(iso),h=mk(doc,wh,"button","ja-agenda-week-day"+(iso===today?" is-today":"")+(iso===self.date?" is-selected":""));h.type="button";mk(doc,h,"span","ja-agenda-week-dow",DOW_MONDAY[(d.getDay()+6)%7]);mk(doc,h,"span","ja-agenda-week-num",String(d.getDate()));var vac=self.vacationsVisible()?Agenda.vacationsForDate(self.wiki,iso):[];if(vac.length){h.classList.add("is-vacation");if(vac[0].color){h.style.setProperty("--ja-vac-color",vac[0].color);}}h.addEventListener("click",function(){self.openDay(iso);});});
  var ad=mk(doc,frame,"div","ja-agenda-week-allday"),al=mk(doc,ad,"div","ja-agenda-week-allday-label","Toute la journée");days.forEach(function(iso){var cell=mk(doc,ad,"div","ja-agenda-week-allday-cell"),items=dayItemsFromRange(events,todos,habits,iso).filter(function(x){return !timeOf(x);});items.forEach(function(x){self.renderWeekAllDayPill(cell,x,iso);});cell.addEventListener("dblclick",function(e){e.stopPropagation();self.openEventForm(iso);});});
  var body=mk(doc,frame,"div","ja-agenda-week-body"),hoursCol=mk(doc,body,"div","ja-agenda-week-hours");/*
    LES ÉTIQUETTES D'HEURE DOIVENT SUIVRE LA COLONNE.
    agenda-core fige .ja-agenda-week-hour à 52px, alors que la colonne est
    dimensionnée en JS. Tant que l'échelle valait ~45px l'écart passait
    inaperçu ; à 30px, la colonne des heures devient bien plus haute que la
    grille et celle-ci semble s'arrêter vers 15h alors qu'elle va jusqu'à
    22h. On impose donc la même hauteur des deux côtés.
  */
  for(var h=H0;h<H1;h++){
    var lab=mk(doc,hoursCol,"div","ja-agenda-week-hour",String(h).padStart(2,"0")+":00");
    lab.style.height=hourPx+"px";
  }
  hoursCol.style.height=(hours*hourPx)+"px";
  days.forEach(function(iso){
    var col=mk(doc,body,"div","ja-agenda-week-col"+(iso===today?" is-today":""));col.style.height=(hours*hourPx)+"px";for(var h=0;h<hours;h++){var line=mk(doc,col,"div","ja-agenda-week-line");line.style.top=(h*hourPx)+"px";}
    if(iso===today){var now=new Date(),mins=now.getHours()*60+now.getMinutes();if(mins>=H0*60&&mins<=H1*60){var nl=mk(doc,col,"div","ja-agenda-week-now");nl.style.top=(((mins-H0*60)/60)*hourPx)+"px";}}
    var timed=dayItemsFromRange(events,todos,habits,iso).filter(function(x){return timeOf(x);}),grouped=Agenda.groupIntoSlots(timed),slotSet=new Set(grouped.slots.map(function(g){return g.slot;}));
    grouped.slots.forEach(function(g){var s=g.slot,sm=Agenda.minutesOf(s.startTime),em=Agenda.endMinutes(s);if(sm===null||em===null){return;}var top=Math.max(sm,H0*60),bottom=Math.min(em,H1*60);if(bottom<=top){return;}var zone=mk(doc,col,"div","ja-agenda-week-slot-zone"),color=itemColor(self,s);if(color){zone.style.setProperty("--ja-item-color",color);}applyBackdrop(self,zone,s,"zone");zone.style.top=(((top-H0*60)/60)*hourPx)+"px";zone.style.height=Math.max(18,((bottom-top)/60)*hourPx)+"px";var lab=mk(doc,zone,"div","ja-agenda-week-slot-label"),wst=effectiveType(self,s);if(wst){appendConfiguredIcon(self,lab,wst,"ja-slot-type-icon");}else{mk(doc,lab,"span","","▥");}mk(doc,lab,"span","ja-agenda-week-slot-title",s.title);if(g.inside.length){mk(doc,lab,"span","ja-agenda-week-slot-count",String(g.inside.length));}zone.title=(s.startTime||"")+(s.endTime?"–"+s.endTime:"")+" "+s.title;zone.addEventListener("click",function(e){e.stopPropagation();setDate(self,iso);});});
    var blocks=[];timed.forEach(function(x){if(slotSet.has(x)){return;}var sm=Agenda.minutesOf(timeOf(x));if(sm===null){return;}var em=Agenda.endMinutes(x);if(em===null){em=sm+(x.kind==="todo"?30:(x.kind==="event"?10:60));}em=Math.max(sm+(x.kind==="event"?10:15),em);var top=Math.max(sm,H0*60),bottom=Math.min(em,H1*60);if(bottom<=top){return;}blocks.push({item:x,start:sm,end:em,top:top,bottom:bottom});});blocks.sort(function(a,b){return a.start-b.start||a.end-b.end;});var nlanes=lanesFor(blocks);
    blocks.forEach(function(b){var x=b.item,el=mk(doc,col,"div","ja-agenda-week-block"+(x.kind==="todo"?" is-todo":(x.kind==="habit"?" is-habit":""))+(x.done?" is-done":"")),color=itemColor(self,x);if(color){el.style.setProperty("--ja-item-color",color);}paintPill(self,el,x,0.38);applyBackdrop(self,el,x,"pill");(function(){
      var host=null;
      grouped.slots.forEach(function(g){if(g.inside.indexOf(x)!==-1){host=g.slot;}});
      if(host&&(itemColor(self,host)||"")+"|"+String(host.typeId||"")===(itemColor(self,x)||"")+"|"+String(x.typeId||"")){
        el.classList.add("is-same-type");
      }
    })();el.style.top=(((b.top-H0*60)/60)*hourPx)+"px";el.style.height=Math.max(18,((b.bottom-b.top)/60)*hourPx)+"px";el.style.left="calc("+((b.lane/nlanes)*100)+"% + 2px)";el.style.width="calc("+(100/nlanes)+"% - 4px)";var row=mk(doc,el,"div","ja-agenda-week-block-title");if(x.kind==="todo"||x.kind==="habit"){var cb=button(doc,row,"ja-agenda-week-block-check",x.done?"✓":"□",x.done?"Rouvrir":"Marquer fait");cb.addEventListener("click",function(e){e.stopPropagation();if(x.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,x.refTitle||x.title,iso);}else{Agenda.toggleTodoOnDate(self.wiki,x.refTitle||x.title,iso);}});}mk(doc,row,"span","",x.title);addInlineEdit(self,row,x,"is-mini");if((b.bottom-b.top)>=38){mk(doc,el,"div","ja-agenda-week-block-time",timeOf(x)+(x.endTime?"–"+x.endTime:""));}var marker=markerGlyph(self,x);if(marker){mk(doc,el,"span","ja-agenda-week-block-marker",marker.emoji||"•");}self.bindItemGestures(el,x,{onPrimary:function(){setDate(self,iso);}});});
    col.addEventListener("click",function(){self.openDay(iso);});col.addEventListener("dblclick",function(e){e.stopPropagation();var r=col.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),mins=Math.min(H1*60-15,Math.round((H0*60+ratio*hours*60)/15)*15),hh=String(Math.floor(mins/60)).padStart(2,"0"),mm=String(mins%60).padStart(2,"0");self.openEventForm(iso,hh+":"+mm);});
  });
  
};
AgendaWidget.prototype.renderYear=function(root){
  var self=this,
      doc=this.document,
      cfg=Agenda.readConfig(this.wiki),
      year=Agenda.parseIso(this.date).getFullYear(),
      a=year+"-01-01",
      b=year+"-12-31",
      events=Agenda.eventsForRange(this.wiki,a,b),
      todos=Agenda.todosForRange(this.wiki,a,b,{calendarOnly:true}),
      habits=Agenda.habitsForRange(this.wiki,a,b,{calendarOnly:true}),
      vacations=Agenda.vacationsForRange(this.wiki,a,b),
      today=Agenda.todayIso();

  events=this.applyFilters(events);
  todos=this.applyFilters(todos);
  habits=this.applyFilters(habits);
  if(!this.vacationsVisible()){vacations=[];}

  var head=mk(doc,root,"div","ja-agenda-section-head");
  mk(doc,head,"div","ja-agenda-kicker","Année");
  mk(doc,head,"h1","ja-agenda-title",String(year));

  var grid=mk(doc,root,"div","ja-agenda-year-grid"),
      labels=+cfg.firstDayOfWeek===1?DOW_SUNDAY:DOW_MONDAY;

  function vacs(iso){
    return vacations.filter(function(v){
      return Agenda.inRange(iso,v.start,v.end);
    });
  }

  function uniqueEventTypeColors(items){
    var out=[],
        seen=Object.create(null);

    items.forEach(function(x){
      /* Seulement Event + Créneau. Les anniversaires ont leur propre
         gommette, les To-dos/Habitudes ne teintent pas le fond annuel. */
      if(x.kind!=="event"||x.role==="birthday"){return;}

      var ty=effectiveType(self,x),
          key=ty?String(ty.id||""):"",
          col=ty&&ty.color?String(ty.color):itemColor(self,x);

      if(!col){return;}
      key=key||col;

      if(!seen[key]){
        seen[key]=true;
        out.push(col);
      }
    });

    return out;
  }

  function translucent(col,alpha){
    var rgb=hexRgb(col);
    return rgb?"rgba("+rgb+","+alpha+")":"rgba(255,255,255,0)";
  }

  function applyYearMosaic(cell,colors){
    colors=(colors||[]).slice(0,6);

    /* Au-delà de six types, on garde simplement les six premiers. */
    if(!colors.length){return;}

    var c=colors.map(function(x){return translucent(x,0.32);}),
        imgs=[],
        sizes=[],
        poss=[];

    function layer(color,size,pos){
      imgs.push("linear-gradient("+color+","+color+")");
      sizes.push(size);
      poss.push(pos);
    }

    if(c.length===1){
      layer(c[0],"100% 100%","0 0");
    }else if(c.length===2){
      layer(c[0],"50% 100%","0 0");
      layer(c[1],"50% 100%","100% 0");
    }else if(c.length===3){
      layer(c[0],"33.334% 100%","0 0");
      layer(c[1],"33.334% 100%","50% 0");
      layer(c[2],"33.334% 100%","100% 0");
    }else if(c.length===4){
      layer(c[0],"50% 50%","0 0");
      layer(c[1],"50% 50%","100% 0");
      layer(c[2],"50% 50%","0 100%");
      layer(c[3],"50% 50%","100% 100%");
    }else if(c.length===5){
      /* Premier calque = peint au-dessus : le cinquième devient
         le petit carré central. */
      layer(c[4],"34% 34%","50% 50%");
      layer(c[0],"50% 50%","0 0");
      layer(c[1],"50% 50%","100% 0");
      layer(c[2],"50% 50%","0 100%");
      layer(c[3],"50% 50%","100% 100%");
    }else if(c.length===6){
      layer(c[0],"33.334% 50%","0 0");
      layer(c[1],"33.334% 50%","50% 0");
      layer(c[2],"33.334% 50%","100% 0");
      layer(c[3],"33.334% 50%","0 100%");
      layer(c[4],"33.334% 50%","50% 100%");
      layer(c[5],"33.334% 50%","100% 100%");
    }

    cell.classList.add("has-type-mosaic");
    cell.style.setProperty("background-image",imgs.join(","),"important");
    cell.style.setProperty("background-size",sizes.join(","),"important");
    cell.style.setProperty("background-position",poss.join(","),"important");
    cell.style.setProperty(
      "background-repeat",
      new Array(imgs.length).fill("no-repeat").join(","),
      "important"
    );
  }

  for(var m=0;m<12;m++){
    (function(){
      var ms=year+"-"+String(m+1).padStart(2,"0")+"-01",
          gs=Agenda.startOfWeek(ms,cfg.firstDayOfWeek),
          box=mk(doc,grid,"section","ja-agenda-year-month"),
          mh=button(doc,box,"ja-agenda-year-month-title","");

      mk(
        doc,mh,"span","ja-agenda-year-month-name",
        new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(Agenda.parseIso(ms))
      );

      var monthCount=0;

      mh.addEventListener("click",function(){
        self.select({kind:"mois",iso:ms});
        setDate(self,ms);
      });

      var dows=mk(doc,box,"div","ja-agenda-year-dows");
      labels.forEach(function(x){
        mk(doc,dows,"span","",x.charAt(0));
      });

      var days=mk(doc,box,"div","ja-agenda-year-days");

      for(var i=0;i<42;i++){
        (function(){
          var iso=Agenda.addDays(gs,i),
              d=Agenda.parseIso(iso),
              inside=iso.slice(0,7)===ms.slice(0,7),
              cell=button(
                doc,days,
                "ja-agenda-year-day"+
                  (inside?"":" is-out")+
                  (iso===today?" is-today":"")+
                  (iso===self.date?" is-selected":""),
                inside?String(d.getDate()):""
              );

          if(!inside){
            cell.disabled=true;
            return;
          }

          var items=dayItemsFromRange(events,todos,habits,iso),
              vv=vacs(iso),
              birthdays=items.filter(function(x){return x.role==="birthday";}),
              colors=uniqueEventTypeColors(items);

          if(items.length){
            cell.classList.add("has-content");
          }

          monthCount+=items.length;

          /* 1–6 types Event/Créneau = mosaïque faible en fond. */
          applyYearMosaic(cell,colors);

          /* Vacances : un petit contour arrondi autour du haut du jour, comme en Mois. */
          if(vv.length){
            var vacLine=mk(doc,cell,"span","ja-agenda-year-vacline");
            vacLine.style.setProperty(
              "--ja-vac-color",
              String(vv[0].color||"#8fa3c8")
            );
            vacLine.title=vv.map(function(v){
              return String(v.label||"Vacances");
            }).join(" · ");
          }

          /* Anniversaire : petite gommette.
             Quand les Types de Relations existeront, relation-type-color
             prendra automatiquement le relais. En attendant, fallback sur
             la couleur du type Anniversaire. */
          birthdays.slice(0,3).forEach(function(bd,n){
            var dot=mk(doc,cell,"span","ja-agenda-year-birthday-dot"),
                col=String(
                  bd.relationTypeColor||
                  (bd.type&&bd.type.color)||
                  itemColor(self,bd)||
                  "#d9b96b"
                );

            dot.style.setProperty("--ja-birthday-color",col);
            dot.style.setProperty("--ja-birthday-index",String(n));
            dot.title=bd.title;
          });

          cell.title=
            (items.length?
              items.length+" élément"+(items.length>1?"s":""):"")+
            (vv.length?
              (items.length?" · ":"")+vv.map(function(v){
                return v.label;
              }).join(", "):"");

          cell.addEventListener("click",function(){
            self.openDay(iso);
          });

          cell.addEventListener("dblclick",function(e){
            e.stopPropagation();
            self.openEventForm(iso);
          });
        })();
      }

      if(monthCount){
        mk(doc,mh,"span","ja-agenda-year-cpt",String(monthCount));
      }
    })();
  }
};

/* ===================== V5 : Organisation complète ===================== */
AgendaWidget.prototype.orgOpen=function(){var v=readJsonState(this.wiki,ORG_OPEN_STATE,["todos"]);return Array.isArray(v)?v:["todos"];};
AgendaWidget.prototype.toggleOrg=function(id){var cfg=Agenda.readConfig(this.wiki),open=this.orgOpen(),at=open.indexOf(id);if(at!==-1){open.splice(at,1);}else if(cfg.organizationAccordion===false){open.push(id);}else{open=[id];}writeJsonState(this.wiki,ORG_OPEN_STATE,open);};
AgendaWidget.prototype.renderOrgSection=function(root,id,title,icon,render,add){var self=this,doc=this.document,open=this.orgOpen().indexOf(id)!==-1,sec=mk(doc,root,"section","ja-agenda-org-section"+(open?" is-open":"")),head=mk(doc,sec,"div","ja-agenda-org-head");head.dataset.org=id;mk(doc,head,"span","ja-agenda-org-chevron",open?"⌄":"›");mk(doc,head,"span","ja-agenda-org-icon",icon);mk(doc,head,"h2","ja-agenda-org-title",title);mk(doc,head,"span","ja-agenda-spacer","");if(add){var b=button(doc,head,"ja-agenda-org-add","＋ Ajouter");b.addEventListener("click",function(e){e.stopPropagation();add();});}head.addEventListener("click",function(){self.toggleOrg(id);});if(open){var body=mk(doc,sec,"div","ja-agenda-org-body");render(body);}return sec;};
AgendaWidget.prototype.renderTodoTree=function(parent,title,depth){var self=this,t=this.wiki.getTiddler(title);if(!t||!Agenda.isTodo(t)){return;}var f=t.fields,item=rawFilterItem(title,t);if(!this.passesFilters(item)){return;}var st=todoStatus(t),row=mk(this.document,parent,"div","ja-agenda-org-todo"+(todoClosed(t)?" is-done":"")+" is-status-"+st);row.style.setProperty("--ja-depth",String(depth||0));var statusGlyph={a_faire:"□",en_cours:"◩",fait:"✓",reporte:"→",annule:"×"}[st]||"□",cb=button(this.document,row,"ja-agenda-org-check",statusGlyph);cb.addEventListener("click",function(e){e.stopPropagation();Agenda.toggleTodoOnDate(self.wiki,title,self.date);});var lab=mk(this.document,row,"span","ja-agenda-org-todo-title",String(f.label||title));if(!(depth||0)){addInlineEdit(this,row,item,"is-mini");}var m=markerOf(this,String(f.marker||""));if(m){mk(this.document,row,"span","ja-agenda-marker",m.emoji||"•");}var ps=Agenda.parseList(f.projects);if(ps.length){mk(this.document,row,"span","ja-agenda-chip","🧩 "+ps[0]);}if(f.deadline){var c=mk(this.document,row,"span","ja-agenda-chip"+(Agenda.cmp(String(f.deadline),Agenda.todayIso())<0&&!todoClosed(t)?" is-overdue":""),"Échéance "+f.deadline);}var ef=Agenda.todoEffortInfo(this.wiki,title);if(ef.total){mk(this.document,row,"span","ja-agenda-chip ja-agenda-effort-chip","⏱ "+(ef.remaining<ef.total?fmtEffort(ef.remaining)+" / ":"")+fmtEffort(ef.total));}var children=[];this.wiki.each(function(tt,ct){if(Agenda.isTodo(tt)&&String(tt.fields["parent-todo"]||"")===title){children.push(ct);}});children.sort();children.forEach(function(ct){self.renderTodoTree(parent,ct,(depth||0)+1);});};
AgendaWidget.prototype.openProject=function(title){this.wiki.setText(ORG_PROJECT_STATE,"text",null,title||"",{suppressTimestamp:true});};
AgendaWidget.prototype.renderProjectDetail=function(root,title){var self=this,doc=this.document,pt=this.wiki.getTiddler(title);if(!pt){this.openProject("");return this.renderOrganisation(root);}var pf=pt.fields,head=mk(doc,root,"div","ja-agenda-project-detail-head"),back=button(doc,head,"ja-agenda-smallbtn","‹ Organisation");back.addEventListener("click",function(){self.openProject("");});mk(doc,head,"span","ja-agenda-project-bigicon","🧩");mk(doc,head,"h1","ja-agenda-title",String(pf.label||title));mk(doc,head,"span","ja-agenda-spacer","");var edit=button(doc,head,"ja-agenda-smallbtn","✎ Modifier");edit.addEventListener("click",function(){Forms.openProject(self,{editTitle:title});});var open=button(doc,head,"ja-agenda-smallbtn","Ouvrir la fiche");open.addEventListener("click",function(){self.dispatchEvent({type:"tm-navigate",navigateTo:title});});
  var todos=[],events=[],habits=[],slots=[];this.wiki.each(function(t,tt){if(!t||!t.fields||Agenda.parseList(t.fields.projects).indexOf(title)===-1){return;}if(Agenda.isTodo(t)){todos.push(tt);}else if(Agenda.isHabit(t)){habits.push(tt);}else if(Agenda.isEvent(t)){String(t.fields["agenda-role"]||"")==="slot"?slots.push(tt):events.push(tt);}});
  var stats=mk(doc,root,"div","ja-agenda-project-stats"),done=todos.filter(function(x){return todoClosed(self.wiki.getTiddler(x));}).length,projectRoots=todos.filter(function(x){var p=String(self.wiki.getTiddler(x).fields["parent-todo"]||"");return !p||todos.indexOf(p)===-1;}),effTot=0,effRem=0;projectRoots.forEach(function(x){var e=Agenda.todoEffortInfo(self.wiki,x);effTot+=e.total;effRem+=e.remaining;});[["☑",done+"/"+todos.length,"to-dos"],["📅",events.length,"événements"],["▥",slots.length,"créneaux"],["↻",habits.length,"habitudes"]].forEach(function(x){if(x[1]===0||x[1]==="0/0"){return;}var c=mk(doc,stats,"span","ja-agenda-summary-chip");mk(doc,c,"span","",x[0]);mk(doc,c,"strong","",String(x[1]));mk(doc,c,"span","",x[2]);});if(effTot){var ec=mk(doc,stats,"span","ja-agenda-summary-chip ja-agenda-effort-chip");mk(doc,ec,"span","","⏱");mk(doc,ec,"strong","",fmtEffort(effRem));mk(doc,ec,"span","","restant / "+fmtEffort(effTot));}if(todos.length){var p=mk(doc,root,"div","ja-agenda-project-progress"),fill=mk(doc,p,"i","");fill.style.width=Math.round((done/todos.length)*100)+"%";}
  var acts=mk(doc,root,"div","ja-agenda-project-actions");[["＋ To-do",function(){Forms.openTodo(self,{date:self.date,project:title});}],["＋ Événement",function(){Forms.openEvent(self,{date:self.date,project:title});}],["＋ Habitude",function(){Forms.openHabit(self,{date:self.date,project:title});}],["＋ Créneau",function(){Forms.openSlot(self,{date:self.date,project:title});}]].forEach(function(x){button(doc,acts,"ja-agenda-smallbtn",x[0]).addEventListener("click",x[1]);});
  function sec(label,icon,items,render){if(!items.length){return;}var s=mk(doc,root,"section","ja-agenda-project-section"),h=mk(doc,s,"div","ja-agenda-project-section-head");mk(doc,h,"span","",icon);mk(doc,h,"h2","",label+" ("+items.length+")");var body=mk(doc,s,"div","ja-agenda-project-section-body");items.forEach(function(x){render(body,x);});}
  var roots=todos.filter(function(x){var p=String(self.wiki.getTiddler(x).fields["parent-todo"]||"");return !p||todos.indexOf(p)===-1;}),openTodos=roots.filter(function(x){return !todoClosed(self.wiki.getTiddler(x));}),closed=roots.filter(function(x){return todoClosed(self.wiki.getTiddler(x));});sec("À faire","☑",openTodos,function(b,x){self.renderTodoTree(b,x,0);});sec("Terminées","✓",closed,function(b,x){self.renderTodoTree(b,x,0);});
  function renderDef(body,x,kind){var t=self.wiki.getTiddler(x),f=t.fields,row=mk(doc,body,"div","ja-agenda-org-simple"),item=rawFilterItem(x,t);mk(doc,row,"span","",kind==="slot"?"▥":kind==="habit"?"↻":"📅");mk(doc,row,"span","ja-agenda-org-simple-title",String(f.label||x));addInlineEdit(self,row,item,"is-mini");var base=kind==="habit"?String(f["start-date"]||""):String(f.date||"");mk(doc,row,"span","ja-agenda-chip",kind==="habit"?Agenda.habitScheduleLabel(t):recurrenceLabel(f.recurrence,base));if(f["start-time"]){mk(doc,row,"span","ja-agenda-chip",String(f["start-time"])+(f["end-time"]?" – "+f["end-time"]:""));}}
  sec("Événements","📅",events,function(b,x){renderDef(b,x,"event");});sec("Emploi du temps","▥",slots,function(b,x){renderDef(b,x,"slot");});sec("Habitudes","↻",habits,function(b,x){renderDef(b,x,"habit");});
};
AgendaWidget.prototype.renderOrganisation=function(root){var self=this,doc=this.document,cfg=Agenda.readConfig(this.wiki),project=this.wiki.getTiddlerText(ORG_PROJECT_STATE,"");if(project&&this.wiki.getTiddler(project)){return this.renderProjectDetail(root,project);}var head=mk(doc,root,"div","ja-agenda-section-head");mk(doc,head,"div","ja-agenda-kicker","Organisation");mk(doc,head,"h1","ja-agenda-title","Tout ce qui fait tourner ton agenda");var host=mk(doc,root,"div","ja-agenda-organisation");
  this.renderOrgSection(host,"todos","To-dos","☑",function(body){var toolbar=mk(doc,body,"div","ja-agenda-org-tools"),all=[];self.wiki.each(function(t,title){if(Agenda.isTodo(t)&&!String(t.fields["parent-todo"]||"")){all.push(title);}});var unsorted=all.filter(function(x){return Agenda.parseList(self.wiki.getTiddler(x).fields.projects).length===0;}),onlyUnsorted=self.wiki.getTiddlerText(ORG_UNSORTED_STATE,"")==="yes",toggle=button(doc,toolbar,"ja-agenda-smallbtn"+(onlyUnsorted?" is-active":""),"À trier · "+unsorted.length);toggle.addEventListener("click",function(){self.wiki.setText(ORG_UNSORTED_STATE,"text",null,onlyUnsorted?"":"yes",{suppressTimestamp:true});});var add=button(doc,toolbar,"ja-agenda-smallbtn","＋ To-do");add.addEventListener("click",function(){Forms.openTodo(self,{date:self.date});});var roots=(onlyUnsorted?unsorted:all).filter(function(x){return self.passesFilters(rawFilterItem(x,self.wiki.getTiddler(x)));});roots.sort(function(a,b){var ta=self.wiki.getTiddler(a),tb=self.wiki.getTiddler(b),da=String(ta.fields.deadline||ta.fields["start-date"]||"9999"),db=String(tb.fields.deadline||tb.fields["start-date"]||"9999");if(cfg.doneTodosAtBottom!==false){var ca=todoClosed(ta)?1:0,cb=todoClosed(tb)?1:0;if(ca!==cb){return ca-cb;}}return da.localeCompare(db)||a.localeCompare(b,"fr");});var openRoots=roots.filter(function(x){return !todoClosed(self.wiki.getTiddler(x));}),doneRoots=roots.filter(function(x){return todoClosed(self.wiki.getTiddler(x));});if(!openRoots.length&&!doneRoots.length){mk(doc,body,"div","ja-agenda-empty",onlyUnsorted?"Rien à trier.":"Aucune to-do.");}openRoots.forEach(function(x){self.renderTodoTree(body,x,0);});if(!cfg.hideDoneTodos&&doneRoots.length){var details=mk(doc,body,"details","ja-agenda-org-done"),sum=mk(doc,details,"summary","","Terminées · "+doneRoots.length),box=mk(doc,details,"div","ja-agenda-org-done-body");doneRoots.forEach(function(x){self.renderTodoTree(box,x,0);});}},null);
  this.renderOrgSection(host,"projects","Projets","🧩",function(body){var ps=projectTitles(self.wiki);if(!ps.length){mk(doc,body,"div","ja-agenda-empty","Aucun projet.");return;}var grid=mk(doc,body,"div","ja-agenda-org-projects");ps.forEach(function(p){var pt=self.wiki.getTiddler(p),card=mk(doc,grid,"article","ja-agenda-org-project"),col=String(pt.fields.color||"");if(col){card.style.setProperty("--ja-item-color",col);}var h=mk(doc,card,"div","ja-agenda-org-project-head");mk(doc,h,"span","","🧩");var open=button(doc,h,"ja-agenda-org-project-title",String(pt.fields.label||p));open.addEventListener("click",function(){self.openProject(p);});var edit=button(doc,h,"ja-agenda-iconbtn","✎","Modifier le projet");edit.addEventListener("click",function(e){e.stopPropagation();Forms.openProject(self,{editTitle:p});});var counts={todo:0,event:0,habit:0,slot:0};self.wiki.each(function(t){if(!t||!t.fields||Agenda.parseList(t.fields.projects).indexOf(p)===-1){return;}if(Agenda.isTodo(t)){counts.todo++;}else if(Agenda.isHabit(t)){counts.habit++;}else if(Agenda.isEvent(t)){String(t.fields["agenda-role"]||"")==="slot"?counts.slot++:counts.event++;}});var meta=mk(doc,card,"div","ja-agenda-org-project-meta");if(counts.todo){mk(doc,meta,"span","ja-agenda-chip","☑ "+counts.todo);}if(counts.event){mk(doc,meta,"span","ja-agenda-chip","📅 "+counts.event);}if(counts.slot){mk(doc,meta,"span","ja-agenda-chip","▥ "+counts.slot);}if(counts.habit){mk(doc,meta,"span","ja-agenda-chip","↻ "+counts.habit);}var acts=mk(doc,card,"div","ja-agenda-card-actions"),td=button(doc,acts,"ja-agenda-smallbtn","＋ To-do"),ev=button(doc,acts,"ja-agenda-smallbtn","＋ Événement"),sheet=button(doc,acts,"ja-agenda-smallbtn","Fiche");td.addEventListener("click",function(){Forms.openTodo(self,{date:self.date,project:p});});ev.addEventListener("click",function(){Forms.openEvent(self,{date:self.date,project:p});});sheet.addEventListener("click",function(){self.dispatchEvent({type:"tm-navigate",navigateTo:p});});});},function(){Forms.openProject(self,{});});
  this.renderOrgSection(host,"habits","Habitudes","↻",function(body){var list=[];self.wiki.each(function(t,title){if(Agenda.isHabit(t)){list.push(title);}});list.sort();if(!list.length){mk(doc,body,"div","ja-agenda-empty","Aucune habitude.");}list.forEach(function(title){var t=self.wiki.getTiddler(title),item=rawFilterItem(title,t);if(!self.passesFilters(item)){return;}var card=mk(doc,body,"div","ja-agenda-org-simple"),m=markerOf(self,String(t.fields.marker||""));mk(doc,card,"span","","↻");mk(doc,card,"span","ja-agenda-org-simple-title",String(t.fields.label||title));addInlineEdit(self,card,item,"is-mini");if(m){mk(doc,card,"span","ja-agenda-marker",m.emoji||"•");}mk(doc,card,"span","ja-agenda-chip",recurrenceLabel(t.fields.recurrence,String(t.fields["start-date"]||"")));});},function(){Forms.openHabit(self,{date:self.date});});
  this.renderOrgSection(host,"slots","Créneaux / emploi du temps","▥",function(body){var list=[];self.wiki.each(function(t,title){if(Agenda.isEvent(t)&&String(t.fields["agenda-role"]||"")==="slot"){list.push(title);}});list.sort();if(!list.length){mk(doc,body,"div","ja-agenda-empty","Aucun créneau.");}list.forEach(function(title){var t=self.wiki.getTiddler(title),item=rawFilterItem(title,t);if(!self.passesFilters(item)){return;}var card=mk(doc,body,"div","ja-agenda-org-simple"),ost=effectiveType(self,item);if(ost){appendConfiguredIcon(self,card,ost,"ja-slot-type-icon");}else{mk(doc,card,"span","","▥");}mk(doc,card,"span","ja-agenda-org-simple-title",String(t.fields.label||title));addInlineEdit(self,card,item,"is-mini");mk(doc,card,"span","ja-agenda-chip",String(t.fields["start-time"]||"…")+(t.fields["end-time"]?" – "+t.fields["end-time"]:""));mk(doc,card,"span","ja-agenda-chip",recurrenceLabel(t.fields.recurrence,String(t.fields.date||"")));});},function(){Forms.openSlot(self,{date:self.date});});
  this.renderOrgSection(host,"vacations","Vacances","🌿",function(body){var list=[];self.wiki.each(function(t,title){if(Agenda.isVacation(t)){list.push(title);}});list.sort(function(a,b){return String(self.wiki.getTiddler(a).fields["start-date"]||"").localeCompare(String(self.wiki.getTiddler(b).fields["start-date"]||""));});if(!list.length){mk(doc,body,"div","ja-agenda-empty","Aucune période de vacances.");}list.forEach(function(title){var t=self.wiki.getTiddler(title),f=t.fields,vi=vacationVisual(self,{title:title,label:String(f.label||title),color:String(f.color||""),tiddler:t}),row=mk(doc,body,"div","ja-agenda-org-simple ja-agenda-org-vac");if(vi.color){row.style.setProperty("--ja-vac-color",vi.color);}applyBackdrop(self,row,vi,"pill");var dot=mk(doc,row,"span","ja-agenda-vac-dot",vi.icon);if(vi.color){dot.style.color=vi.color;}mk(doc,row,"span","ja-agenda-org-simple-title",vi.label);var occs=Agenda.vacationOccurrences(t);mk(doc,row,"span","ja-agenda-chip",occs.length+" occurrence"+(occs.length>1?"s":""));var ve=button(doc,row,"ja-agenda-inline-edit is-mini","✎","Modifier");ve.addEventListener("click",function(e){e.stopPropagation();Forms.openVacation(self,{editTitle:title});});});},function(){Forms.openVacation(self,{date:self.date});});
};

/* ===================== V3 : formulaires partagés + menus ===================== */
AgendaWidget.prototype.openCreateMenu=function(anchor){
  var self=this,doc=this.document,old=doc.querySelector(".ja-agenda-popover");if(old){old.remove();return;}var r=anchor.getBoundingClientRect(),pop=mk(doc,doc.body,"div","ja-agenda-popover");pop.style.left=Math.max(8,Math.min(window.innerWidth-230,r.right-220))+"px";pop.style.top=Math.min(window.innerHeight-230,r.bottom+6)+"px";
  [["✦ Entrée Journal",function(){require("$:/journalapp/modules/widgets/journal.js").openDailyForm(self,{date:self.date});}],
   ["↻ Habitude",function(){Forms.openHabit(self,{date:self.date});}],
   ["▥ Créneau / emploi du temps",function(){Forms.openSlot(self,{date:self.date});}],
   ["🌿 Vacances",function(){Forms.openVacation(self,{date:self.date});}]].forEach(function(x){button(doc,pop,"ja-agenda-popover-item",x[0]).addEventListener("click",function(){pop.remove();x[1]();});});var away=function(e){if(!pop.contains(e.target)&&e.target!==anchor){pop.remove();doc.removeEventListener("mousedown",away,true);}};setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
};
/*
  Gestes sur un élément d'agenda.
  Le clic principal peut sélectionner/naviguer selon la vue, mais il n’ouvre
  jamais le formulaire. L’édition passe uniquement par le crayon explicite.
  Appui long / clic droit conserve le menu d’actions rapides.
*/
AgendaWidget.prototype.bindItemGestures=function(el,item,opts){
  opts=opts||{};
  var self=this,timer=null,moved=false,sx=0,sy=0,longFired=false;
  el.classList.add("ja-agenda-actionable");
  el.setAttribute("tabindex","0");
  el.setAttribute("role","button");
  el.title=(el.title?el.title+" · ":"")+"Clic : sélectionner · appui long : plus d’actions";

  function menuAt(x,y){self.openItemMenu(item,x,y);}
  function primary(){
    if(opts.onPrimary){opts.onPrimary();}
  }

  el.addEventListener("click",function(e){
    if(e.target.closest("button")&&e.target!==el){return;}
    e.stopPropagation();
    if(longFired){longFired=false;return;}
    primary();
  });
  el.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();primary();}
  });
  el.addEventListener("contextmenu",function(e){
    e.preventDefault();e.stopPropagation();menuAt(e.clientX,e.clientY);
  });
  el.addEventListener("touchstart",function(e){
    var t=e.touches&&e.touches[0];if(!t){return;}
    moved=false;longFired=false;sx=t.clientX;sy=t.clientY;
    clearTimeout(timer);
    timer=setTimeout(function(){
      if(moved){return;}
      longFired=true;
      if(window.navigator&&window.navigator.vibrate){try{window.navigator.vibrate(8);}catch(err){}}
      menuAt(sx,sy);
    },480);
  },{passive:true});
  el.addEventListener("touchmove",function(e){
    var t=e.touches&&e.touches[0];if(!t){return;}
    if(Math.abs(t.clientX-sx)>9||Math.abs(t.clientY-sy)>9){moved=true;clearTimeout(timer);}
  },{passive:true});
  ["touchend","touchcancel"].forEach(function(ev){
    el.addEventListener(ev,function(){clearTimeout(timer);},{passive:true});
  });
  return el;
};

/*
  LE PANNEAU DE DÉTAIL.
  Le détail glisse par-dessus la grille au lieu de s'empiler dessous. Il sait
  afficher une sélection de n'importe quelle granularité : un jour, une
  semaine, un mois, une année — groupé date par date, créneaux compris.
*/
AgendaWidget.prototype.selection=function(){return readSel(this);};
AgendaWidget.prototype.select=function(sel){writeSel(this,sel);};
AgendaWidget.prototype.openDay=function(iso){writeSel(this,{kind:"jour",iso:iso});setDate(this,iso);};
AgendaWidget.prototype.closeDetail=function(){writeSel(this,null);};

AgendaWidget.prototype.renderDetail=function(root){
  var self=this,doc=this.document,sel=readSel(this);
  if(!sel){return;}
  var cfg=Agenda.readConfig(this.wiki),first=cfg.firstDayOfWeek,
      r=selRange(sel,first),a=r[0],b=r[1];

  /* Le détail se lit SOUS la grille, dans le flux. Un panneau latéral
     recouvre le calendrier au moment précis où on veut garder les deux
     sous les yeux. */
  var dr=mk(doc,root,"section","ja-agenda-detail is-"+sel.kind);

  /* — Tête — */
  var head=mk(doc,dr,"div","ja-agenda-detail-head");
  if(sel.kind==="jour"){
    var nav=mk(doc,head,"div","ja-agenda-detail-nav");
    button(doc,nav,"ja-agenda-iconbtn","‹","Jour précédent")
      .addEventListener("click",function(){self.openDay(Agenda.addDays(sel.iso,-1));});
    button(doc,nav,"ja-agenda-iconbtn","›","Jour suivant")
      .addEventListener("click",function(){self.openDay(Agenda.addDays(sel.iso,1));});
  }
  var titles=mk(doc,head,"div","ja-agenda-detail-titles");
  mk(doc,titles,"div","ja-agenda-kicker",
     sel.kind==="jour"?"Jour":sel.kind==="semaine"?"Semaine":sel.kind==="mois"?"Mois":"Année");
  mk(doc,titles,"h2","ja-agenda-detail-title",selTitle(sel,first));
  if(sel.kind==="jour"){mk(doc,titles,"div","ja-agenda-detail-sub",relativeDay(sel.iso));}
  button(doc,head,"ja-agenda-detail-close","×","Fermer")
    .addEventListener("click",function(){self.closeDetail();});

  /* — Granularité : on élargit ou on resserre sans changer de vue — */
  var gran=mk(doc,dr,"div","ja-agenda-detail-gran");
  [["jour","Jour"],["semaine","Semaine"],["mois","Mois"],["annee","Année"]].forEach(function(g){
    var bb=button(doc,gran,"ja-af-seg-item"+(sel.kind===g[0]?" is-on":""),g[1]);
    bb.addEventListener("click",function(){self.select({kind:g[0],iso:sel.iso});});
  });

  /* — Actions rapides — */
  var iso=selTarget(sel,first),acts=mk(doc,dr,"div","ja-agenda-detail-acts");
  [["📅 Événement",function(){Forms.openEvent(self,{date:iso});}],
   ["☑ To-do",function(){Forms.openTodo(self,{date:iso});}],
   ["↻ Habitude",function(){Forms.openHabit(self,{date:iso});}],
   ["▥ Créneau",function(){Forms.openSlot(self,{date:iso});}]].forEach(function(x){
    button(doc,acts,"ja-agenda-detail-act",x[0]).addEventListener("click",x[1]);
  });

  var body=mk(doc,dr,"div","ja-agenda-detail-body");

  /* — Vacances de la période — */
  if(this.vacationsVisible()){
    Agenda.vacationsForRange(this.wiki,a,b).forEach(function(v){
      var vi=vacationVisual(self,v),
          c=mk(doc,body,"div","ja-agenda-vac-carte");
      if(vi.color){c.style.setProperty("--ja-vac-color",vi.color);}
      applyBackdrop(self,c,vi,"pill");
      mk(doc,c,"span","ja-agenda-chip-ic",vi.icon);
      mk(doc,c,"span","ja-agenda-vac-nom",vi.label);
      var ved=button(doc,c,"ja-agenda-inline-edit is-mini","✎","Modifier ces vacances");ved.addEventListener("click",function(e){e.stopPropagation();Forms.openVacation(self,{editTitle:vi.refTitle});});
    });
  }

  /* — Le contenu, groupé DATE PAR DATE.
       Grouper par date et non en vrac, sinon le cours du lundi 6 se
       retrouverait mélangé à celui du lundi 13. — */
  var events=this.applyFilters(Agenda.eventsForRange(this.wiki,a,b)),
      todos=this.applyFilters(Agenda.todosForRange(this.wiki,a,b,{calendarOnly:true})),
      habits=this.applyFilters(Agenda.habitsForRange(this.wiki,a,b,{calendarOnly:true})),
      any=false,cursor=a,guard=0,shown=0,truncated=0;

  while(Agenda.cmp(cursor,b)<=0&&guard++<400){
    var items=dayItemsFromRange(events,todos,habits,cursor);
    if(items.length){
      any=true;shown++;
      /* Une année entière ferait 300+ sections : on s'arrête et on le dit. */
      if(shown>60){truncated++;cursor=Agenda.addDays(cursor,1);continue;}
      if(sel.kind!=="jour"){
        this.renderDayHeader(body,cursor,{count:items.length});
      }else{
        this.renderVacationBanner(body,cursor);
      }
      this.renderDaySchedule(body,items,"Rien ce jour-là.");
    }
    cursor=Agenda.addDays(cursor,1);
  }
  if(!any){mk(doc,body,"div","ja-agenda-empty","Rien sur cette période.");}
  if(truncated){mk(doc,body,"div","ja-agenda-empty","… et "+truncated+" autre"+(truncated>1?"s":"")+" jour"+(truncated>1?"s":"")+" chargé"+(truncated>1?"s":"")+". Resserre la granularité pour les voir.");}

  /* — To-dos sans date de la période : elles existent, elles doivent se voir — */
  var loose=[];
  this.wiki.each(function(t,title){
    if(!Agenda.isTodo(t)){return;}
    var f=t.fields;
    if(f["start-date"]||f.deadline){return;}
    if(todoClosed(t)){return;}
    var it=rawFilterItem(title,t);
    if(!self.passesFilters(it)){return;}
    loose.push({title:title,t:t});
  });
  if(loose.length){
    mk(doc,body,"div","ja-agenda-detail-loose").appendChild(
      doc.createTextNode("Sans date · "+loose.length));
    loose.slice(0,12).forEach(function(x){
      var rr=mk(doc,body,"div","ja-agenda-org-simple");
      mk(doc,rr,"span","","☑");
      mk(doc,rr,"span","ja-agenda-org-simple-title",String(x.t.fields.label||x.title));addInlineEdit(self,rr,rawFilterItem(x.title,x.t),"is-mini");
    });
  }
};

/*
  DÉPLACER / DUPLIQUER / CHANGER LE STATUT.
  Le menu ne proposait que « modifier » et « supprimer ». Reporter un rendez-vous
  d'un jour demandait donc d'ouvrir un formulaire, changer une date, enregistrer.
  Sur une occurrence de série, on ne touche évidemment pas à la série : on pose
  une exception ponctuelle, comme le fait déjà « annuler cette occurrence ».
*/
AgendaWidget.prototype.moveItem=function(item,targetIso){
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,
      t=this.wiki.getTiddler(ref);
  if(!t||!targetIso){return;}
  if(item.recurring&&item.kind==="event"){
    var orig=item.originalDate||item.date,
        cur=Agenda.getOccurrenceOverride(this.wiki,ref,orig)||{};
    cur.date=targetIso;
    Agenda.setOccurrenceOverride(this.wiki,ref,orig,cur);
    return;
  }
  var f={};
  if(item.kind==="todo"){
    if(t.fields.deadline){f.deadline=targetIso;}
    else{f["start-date"]=targetIso;}
  }else if(item.kind==="habit"){f["start-date"]=targetIso;}
  else{
    f.date=targetIso;
    /* Un événement multi-jours garde sa durée : on translate la fin d'autant. */
    var de=String(t.fields["date-end"]||"");
    if(de){
      var span=Math.round((Agenda.parseIso(de)-Agenda.parseIso(String(t.fields.date||targetIso)))/86400000);
      f["date-end"]=Agenda.addDays(targetIso,span);
    }
  }
  this.wiki.addTiddler(new $tw.Tiddler(t,f,{modified:new Date()}));
};
AgendaWidget.prototype.shiftItem=function(item,days){
  var base=item.date||this.date;
  this.moveItem(item,Agenda.addDays(base,days));
};
AgendaWidget.prototype.promptMove=function(item){
  var self=this,doc=this.document,
      overlay=mk(doc,doc.body,"div","ja-jform-overlay"),
      modal=mk(doc,overlay,"div","ja-jform-modal ja-agenda-shared-form ja-agenda-move-modal"),
      head=mk(doc,modal,"div","ja-jform-head"),
      left=mk(doc,head,"div","ja-agenda-form-heading");
  mk(doc,left,"div","ja-agenda-form-kicker","📅 Agenda");
  mk(doc,left,"h2","ja-jform-title","Déplacer");
  var acts=mk(doc,head,"div","ja-jform-headactions"),
      cancel=button(doc,acts,"ja-jform-secondary","Annuler"),
      ok=button(doc,acts,"ja-jform-save","Déplacer"),
      body=mk(doc,modal,"div","ja-jform-body");
  mk(doc,body,"div","ja-agenda-form-hint","« "+String(item.title||"")+" » — actuellement le "+pretty(item.date||this.date));
  var lab=mk(doc,body,"label","ja-agenda-form-field");
  mk(doc,lab,"span","ja-agenda-form-label","Nouvelle date");
  var inp=mk(doc,lab,"input","ja-jform-input ja-agenda-form-input");
  inp.type="date";inp.value=item.date||this.date;
  function close(){overlay.remove();doc.removeEventListener("keydown",key,true);}
  function key(e){if(e.key==="Escape"){close();}if(e.key==="Enter"){e.preventDefault();ok.click();}}
  doc.addEventListener("keydown",key,true);
  overlay.addEventListener("mousedown",function(e){if(e.target===overlay){close();}});
  cancel.addEventListener("click",close);
  ok.addEventListener("click",function(){
    if(inp.value){self.moveItem(item,inp.value);}
    close();
  });
  setTimeout(function(){inp.focus();},0);
};
AgendaWidget.prototype.duplicateItem=function(item){
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,
      t=this.wiki.getTiddler(ref);
  if(!t){return;}
  var label=String(t.fields.label||ref)+" (copie)",
      title=Agenda.uniqueTitle(this.wiki,label),
      now=new Date();
  this.wiki.addTiddler(new $tw.Tiddler(t,{
    title:title,label:label,
    /* une copie ne traîne ni l'historique de la série ni les cases cochées */
    "occurrence-group":"",overrides:"",completions:""
  },{created:now,modified:now}));
};
AgendaWidget.prototype.setEventStatus=function(item,status){
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,
      t=this.wiki.getTiddler(ref);
  if(!t){return;}
  if(item.recurring&&item.kind==="event"){
    var orig=item.originalDate||item.date,
        cur=Agenda.getOccurrenceOverride(this.wiki,ref,orig)||{};
    cur.status=(String(cur.status||item.status||"normal")===status)?"normal":status;
    cur.date=cur.date||item.date;
    Agenda.setOccurrenceOverride(this.wiki,ref,orig,cur);
    return;
  }
  var next=String(t.fields.status||"normal")===status?"normal":status;
  this.wiki.addTiddler(new $tw.Tiddler(t,{status:next},{modified:new Date()}));
};

AgendaWidget.prototype.setTodoStatus=function(item,status){
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,t=this.wiki.getTiddler(ref);
  if(!t){return;}
  this.wiki.addTiddler(new $tw.Tiddler(t,{status:status},{modified:new Date()}));
};
AgendaWidget.prototype.openInlineStatusMenu=function(anchor,item){
  var self=this,doc=this.document,old=doc.querySelector(".ja-agenda-status-pop");if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-agenda-context ja-agenda-status-pop"),r=anchor.getBoundingClientRect();
  pop.style.left=Math.max(8,Math.min(window.innerWidth-220,r.left))+"px";pop.style.top=Math.min(window.innerHeight-260,r.bottom+5)+"px";
  function option(label,status,run){button(doc,pop,"ja-agenda-context-item",label).addEventListener("click",function(){pop.remove();run(status);});}
  if(item.kind==="todo"){
    [["□ À faire","a_faire"],["◩ En cours","en_cours"],["✓ Fait","fait"],["→ Reporté","reporte"],["× Annulé","annule"]].forEach(function(x){option(x[0],x[1],function(st){self.setTodoStatus(item,st);});});
  }else if(item.kind==="event"&&item.role!=="slot"){
    [["• Normal","normal"],["✓ Fait","fait"],["→ Reporté","reporte"],["× Annulé","annule"]].forEach(function(x){option(x[0],x[1],function(st){self.setEventStatus(item,st);});});
  }else if(item.kind==="habit"){
    option(item.done?"↩ Rouvrir":"✓ Fait",item.done?"open":"done",function(){Agenda.toggleHabitOnDate(self.wiki,item.refTitle||item.title,item.date||self.date);});
  }
  var away=function(e){if(!pop.contains(e.target)&&e.target!==anchor){pop.remove();doc.removeEventListener("mousedown",away,true);}};setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
};
AgendaWidget.prototype.addProgress=function(item){
  var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title,t=this.wiki.getTiddler(ref);if(!t){return;}
  var text=window.prompt("Nouvelle note de progression :","");if(text===null||!String(text).trim()){return;}
  var list=Agenda.parseJson(t.fields.progress||t.fields.journal,[])||[],now=new Date();
  if(!Array.isArray(list)){list=[];}
  list.push({date:Agenda.todayIso(),time:String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0"),text:String(text).trim()});
  this.wiki.addTiddler(new $tw.Tiddler(t,{progress:JSON.stringify(list)},{modified:new Date()}));
};

AgendaWidget.prototype.openItemMenu=function(item,x,y){
  var self=this,doc=this.document,old=doc.querySelector(".ja-agenda-context");if(old){old.remove();}var pop=mk(doc,doc.body,"div","ja-agenda-context"),ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title;pop.style.left=Math.max(8,Math.min(window.innerWidth-250,x))+"px";pop.style.top=Math.max(8,Math.min(window.innerHeight-300,y))+"px";
  function add(label,run,cls){button(doc,pop,"ja-agenda-context-item"+(cls?" "+cls:""),label).addEventListener("click",function(){pop.remove();run();});}
  if(item.kind==="habit"){
    var habitDate=item.date||self.date,habitT=self.wiki.getTiddler(ref),hi=Agenda.habitDueInfo(habitT,habitDate),today=Agenda.todayIso(),isPast=Agenda.cmp(habitDate,today)<0,isFuture=Agenda.cmp(habitDate,today)>0;
    if(isPast){
      /* Une date passée ne permet pas de déduire si l'action a réellement été
         faite en retard ou simplement enregistrée en retard. On laisse le choix. */
      add("✓ Fait · oublié de noter",function(){Agenda.setHabitCompletionOnDate(self.wiki,ref,habitDate,"done");});
      add("◷ Fait en retard",function(){Agenda.setHabitCompletionOnDate(self.wiki,ref,habitDate,"done_late");});
      if(hi.completed>0){add("↩ Retirer une validation",function(){Agenda.toggleHabitOnDate(self.wiki,ref,habitDate);});}
    }else{
      add(hi.done?"↩ Retirer une validation":"✓ Marquer fait",function(){Agenda.toggleHabitOnDate(self.wiki,ref,habitDate);});
    }
    if(!hi.done&&!isFuture){add("× Échouer",function(){Agenda.setHabitStatusOnDate(self.wiki,ref,habitDate,"failed");},"is-danger");}
    if(!hi.done){add("– Annuler",function(){Agenda.setHabitStatusOnDate(self.wiki,ref,habitDate,"cancelled");});}
    if(!isPast&&(hi.explicitFailed||hi.cancelled)){add("↩ Remettre à faire",function(){Agenda.clearHabitStatusOnDate(self.wiki,ref,habitDate);});}
    add("✎ Modifier l’habitude",function(){Forms.openHabit(self,{editTitle:ref});});
    add("↗ Ouvrir la fiche",function(){self.dispatchEvent({type:"tm-navigate",navigateTo:ref});});
    add("🗑 Supprimer",function(){if(window.confirm("Supprimer « "+item.title+" » ?")){Agenda.deleteAgendaObject(self.wiki,ref,"habit");}},"is-danger");
  }else if(item.role==="birthday"){add("👤 Ouvrir la relation",function(){self.dispatchEvent({type:"tm-navigate",navigateTo:ref});});add("ℹ Anniversaire virtuel",function(){});}
  else{
    if(item.kind==="todo"){add(item.done?"↩ Rouvrir ce jour":"✓ Marquer fait ce jour",function(){Agenda.toggleTodoOnDate(self.wiki,ref,item.date||self.date);});}
    if(item.kind==="todo"){add("◩ Changer l’état…",function(){self.setTodoStatus(item,"en_cours");});}
    var isFinished=item.done||item.status==="fait"||item.status==="done";
    if(!isFinished&&item.role!=="slot"){add("＋ Progression…",function(){self.addProgress(item);});}
    if(item.role==="slot"){
      /* Une occurrence de créneau appartient à la fiche d’emploi du temps.
         On modifie donc la fiche et ses vagues, jamais une occurrence détachée. */
      add("✎ Modifier l’emploi du temps",function(){self.editItem(item);});
      add("⧉ Dupliquer l’emploi du temps",function(){self.duplicateItem(item);});
    }else{
      add(item.recurring&&item.kind==="event"?"✎ Modifier la série":"✎ Modifier",function(){self.editItem(item);});
      if(item.kind==="event"){add((item.status==="fait"?"↩ Rouvrir":"✓ Marquer fait"),function(){self.setEventStatus(item,"fait");});add((item.status==="annule"?"↩ Rétablir":"✕ Marquer annulé"),function(){self.setEventStatus(item,"annule");});}
      add("→ Reporter d\u2019un jour",function(){self.shiftItem(item,1);});add("← Avancer d\u2019un jour",function(){self.shiftItem(item,-1);});add("📅 Déplacer à une date…",function(){self.promptMove(item);});add("⧉ Dupliquer",function(){self.duplicateItem(item);});
      if(item.kind==="todo"){add("＋ Sous-tâche…",function(){Forms.openTodo(self,{parentTodo:ref,date:item.date||self.date,project:(item.projects||[])[0]||""});});}
      if(item.kind==="event"){add("＋ Nouvelle occurrence indépendante…",function(){Forms.openOccurrence(self,ref,Agenda.addDays(item.date||self.date,7));});}
      if(item.kind==="event"&&item.recurring){add("◉ Modifier cette occurrence…",function(){Forms.openOccurrenceEdit(self,item);});add("✕ Annuler cette occurrence",function(){Agenda.setOccurrenceOverride(self.wiki,ref,item.originalDate||item.date,{status:"annule",date:item.date});});if(item.override){add("↺ Réinitialiser cette occurrence",function(){Agenda.clearOccurrenceOverride(self.wiki,ref,item.originalDate||item.date);});}}
    }
    add("↗ Ouvrir la fiche",function(){self.dispatchEvent({type:"tm-navigate",navigateTo:ref});});add("🗑 Supprimer",function(){var cascade=item.kind==="todo",msg=cascade?"Supprimer « "+item.title+" » et toutes ses sous-tâches ?":"Supprimer « "+item.title+" » ?";if(window.confirm(msg)){Agenda.deleteAgendaObject(self.wiki,ref,item.kind,{cascade:cascade});}},"is-danger");
  }
  var away=function(e){if(!pop.contains(e.target)){pop.remove();doc.removeEventListener("mousedown",away,true);}};setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
};
AgendaWidget.prototype.editItem=function(item){if(item&&item.role==="birthday"){this.dispatchEvent({type:"tm-navigate",navigateTo:item.refTitle});return;}var ref=item.refTitle||(item.tiddler&&item.tiddler.fields.title)||item.title;if(item.kind==="todo"){Forms.openTodo(this,{editTitle:ref});}else if(item.kind==="habit"){Forms.openHabit(this,{editTitle:ref});}else if(item.kind==="event"){if(item.role==="slot"){Forms.openSlot(this,{editTitle:ref});}else{Forms.openEvent(this,{editTitle:ref});}}};
AgendaWidget.prototype.openEventForm=function(defaultDate,defaultTime){Forms.openEvent(this,{date:defaultDate||this.date,time:defaultTime||""});};
AgendaWidget.prototype.openTodoForm=function(defaultDate,defaultTime){Forms.openTodo(this,{date:defaultDate||this.date,time:defaultTime||""});};

exports.jaagenda=AgendaWidget;
})();
