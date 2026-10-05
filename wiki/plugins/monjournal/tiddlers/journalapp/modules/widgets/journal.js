/*\
title: $:/journalapp/modules/widgets/journal.js
type: application/javascript
module-type: widget

Mon Journal — le Journal quotidien.
Trois modes : "day" (bannière + dashboard + timeline), "sidebar"
(mini-calendrier) et le formulaire d'entrée en modale.

Tout ce qui est configurable vit dans $:/journalapp/config/journal :
arbre d'humeur, échelles énergie/anxiété, tranches de bannière, marqueurs.
Rien n'est gravé ici.
\*/
(function(){
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;
var Entities = require("$:/journalapp/modules/lib/entities.js");
var RelationModes = require("$:/journalapp/modules/lib/relation-modes.js");
var JConfig = require("$:/journalapp/modules/lib/jconfig.js");
var Sky = require("$:/journalapp/modules/lib/jsky.js");
var Media = require("$:/journalapp/modules/lib/jmedia.js");
var Agenda = require("$:/journalapp/modules/lib/agenda.js");
var AgendaUI = require("$:/journalapp/modules/lib/agenda-ui.js");

var DATE_STATE = "$:/state/journalapp/journal-date";
var MONTH_STATE = "$:/state/journalapp/journal-month";
var YEAR_STATE = "$:/state/journalapp/journal-year";
var VIEW_STATE = "$:/state/journalapp/view";
var JOURNAL_VIEW = "$:/journalapp/views/journal/home";
var FOCUS_DAILY_STATE = "$:/state/journalapp/journal-focus-daily";
function agendaForms(){return require("$:/journalapp/modules/lib/agenda-forms.js");}
function agendaQuickMenu(widget,anchor,iso){
  var doc=widget.document,old=doc.querySelector(".ja-journal-agenda-popover");
  if(old){old.remove();return;}
  var r=anchor.getBoundingClientRect(),pop=mk(doc,doc.body,"div","ja-agenda-popover ja-journal-agenda-popover");
  pop.style.left=Math.max(8,Math.min(window.innerWidth-220,r.right-210))+"px";
  pop.style.top=Math.min(window.innerHeight-150,r.bottom+6)+"px";
  [["📅 Événement",function(){agendaForms().openEvent(widget,{date:iso});}],
   ["☑ To-do",function(){agendaForms().openTodo(widget,{date:iso});}]].forEach(function(x){
    btn(doc,pop,"ja-agenda-popover-item",x[0]).addEventListener("click",function(){pop.remove();x[1]();});
  });
  var away=function(e){if(!pop.contains(e.target)&&e.target!==anchor){pop.remove();doc.removeEventListener("mousedown",away,true);}};
  setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
}

/* ------------------------------------------------------------------ */
/* Utilitaires date                                                    */
/* ------------------------------------------------------------------ */
function pad(n){return String(n).padStart(2,"0");}
function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function timeNow(){var d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes());}
function parseISO(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");return m?new Date(+m[1],+m[2]-1,+m[3],12,0,0,0):null;}
function isoOf(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function addDays(iso,n){var d=parseISO(iso)||new Date();d.setDate(d.getDate()+n);return isoOf(d);}
function diffDays(a,b){var da=parseISO(a),db=parseISO(b);return (da&&db)?Math.round((da-db)/86400000):0;}
function validISO(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||"");}
function monthName(d){return new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(d);}
function prettyDate(iso){var d=parseISO(iso);return d?new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d):iso;}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function selectedDate(w){var s=w.wiki.getTiddlerText(DATE_STATE,"");return validISO(s)?s:todayISO();}
function setSelectedDate(w,iso){
  w.wiki.setText(DATE_STATE,"text",null,iso);
  w.wiki.setText(VIEW_STATE,"text",null,JOURNAL_VIEW);
}

/* ------------------------------------------------------------------ */
/* Utilitaires DOM                                                     */
/* ------------------------------------------------------------------ */
function mk(doc,parent,tag,cls,text){
  var e=doc.createElement(tag);
  if(cls){e.className=cls;}
  if(text!==undefined&&text!==null){e.textContent=text;}
  if(parent){parent.appendChild(e);}
  return e;
}
function btn(doc,parent,cls,text,title){
  var b=mk(doc,parent,"button",cls,text);
  b.type="button";
  if(title){b.title=title;b.setAttribute("aria-label",title);}
  return b;
}
function svgInto(parent,markup){parent.insertAdjacentHTML("beforeend",markup);}

function fieldValue(t,name,def){return (t&&t.fields&&t.fields[name]!=null)?String(t.fields[name]):(def||"");}
function parseList(v){return $tw.utils.parseStringArray(v||"")||[];}
function splitValues(v){
  var seen=Object.create(null),out=[];
  (v||"").split(",").map(function(s){return s.trim();}).filter(Boolean).forEach(function(x){
    if(!seen[x]){seen[x]=true;out.push(x);}
  });
  return out;
}
function makeList(v){return Entities.stringifyList(Array.isArray(v)?v:splitValues(v));}

/* ------------------------------------------------------------------ */
/* Données du jour                                                     */
/* ------------------------------------------------------------------ */
function isDaily(t){
  return !!(t&&t.fields&&Array.isArray(t.fields.tags)&&t.fields.tags.indexOf("Journal")!==-1&&String(t.fields.kind||"")==="Daily");
}
function dailyEntries(w,iso){
  var out=[];
  w.wiki.each(function(t,title){
    if(isDaily(t)&&String(t.fields.date||"")===iso){out.push({title:title,tiddler:t});}
  });
  out.sort(function(a,b){
    var at=String(a.tiddler.fields.time||""),bt=String(b.tiddler.fields.time||"");
    if(at!==bt){return bt.localeCompare(at);}
    return b.title.localeCompare(a.title);
  });
  return out;
}
function avgOf(list){return list.length?list.reduce(function(a,b){return a+b;},0)/list.length:null;}

function dayAgg(w,iso){
  var entries=dailyEntries(w,iso),
      moods=[],energies=[],stresses=[],codes=[],regles=false,markers=[];
  entries.forEach(function(e){
    var f=e.tiddler.fields,
        mv=parseFloat(f["mood-value"]),
        en=parseFloat(f.energy),
        st=parseFloat(f.stress);
    if(!isNaN(mv)){moods.push(mv);}
    if(!isNaN(en)){energies.push(en);}
    if(!isNaN(st)){stresses.push(st);}
    if(f["weather-code"]!==undefined&&String(f["weather-code"])!==""){codes.push(f["weather-code"]);}
    if(String(f.regles||"")==="yes"){regles=true;}
    if(f.marker){markers.push(String(f.marker));}
  });
  return {
    count:entries.length,
    entries:entries,
    mood:avgOf(moods),
    energy:avgOf(energies),
    stress:avgOf(stresses),
    weatherRank:Sky.dominantRank(codes),
    regles:regles,
    markers:markers
  };
}

/* Emoji d'humeur le plus représentatif du jour. */
function dominantMoodEmoji(entries,gm){
  var withMood=entries.filter(function(e){return e.tiddler.fields["mood-emoji"];});
  if(!withMood.length){return "";}
  var best=withMood[0],bd=Infinity;
  withMood.forEach(function(e){
    var d=Math.abs((parseFloat(e.tiddler.fields["mood-value"])||3)-gm);
    if(d<bd){bd=d;best=e;}
  });
  return String(best.tiddler.fields["mood-emoji"]||"");
}
function dominantMoodImage(entries,gm){
  var withImg=entries.filter(function(e){return e.tiddler.fields["mood-image"];});
  if(!withImg.length){return "";}
  var best=withImg[0],bd=Infinity;
  withImg.forEach(function(e){
    var d=Math.abs((parseFloat(e.tiddler.fields["mood-value"])||3)-gm);
    if(d<bd){bd=d;best=e;}
  });
  return String(best.tiddler.fields["mood-image"]||"");
}

/* ------------------------------------------------------------------ */
/* Météo Open-Meteo                                                    */
/* ------------------------------------------------------------------ */
function weatherInfo(code){
  code=+code;
  if(code===0){return {emoji:"☀️",label:"Ciel dégagé"};}
  if(code===1){return {emoji:"🌤️",label:"Plutôt dégagé"};}
  if(code===2){return {emoji:"⛅",label:"Partiellement nuageux"};}
  if(code===3){return {emoji:"☁️",label:"Couvert"};}
  if(code===45||code===48){return {emoji:"🌫️",label:"Brouillard"};}
  if([51,53,55,56,57].indexOf(code)!==-1){return {emoji:"🌦️",label:"Bruine"};}
  if([61,63,65,66,67,80,81,82].indexOf(code)!==-1){return {emoji:"🌧️",label:"Pluie"};}
  if([71,73,75,77,85,86].indexOf(code)!==-1){return {emoji:"🌨️",label:"Neige"};}
  if([95,96,99].indexOf(code)!==-1){return {emoji:"⛈️",label:"Orage"};}
  return {emoji:"🌤️",label:"Météo"};
}
function closestHourly(hourly,date,time){
  if(!hourly||!hourly.time||!hourly.time.length){return null;}
  var hh=(time||"12:00").slice(0,2),idx=hourly.time.indexOf(date+"T"+hh+":00");
  if(idx<0){
    var best=-1,bestD=999;
    for(var i=0;i<hourly.time.length;i++){
      if(hourly.time[i].slice(0,10)!==date){continue;}
      var d=Math.abs((+hourly.time[i].slice(11,13))-(+hh||12));
      if(d<bestD){bestD=d;best=i;}
    }
    idx=best;
  }
  if(idx<0){return null;}
  return {
    temperature:hourly.temperature_2m?hourly.temperature_2m[idx]:null,
    code:hourly.weather_code?hourly.weather_code[idx]:null,
    time:hourly.time[idx]
  };
}

/* ------------------------------------------------------------------ */
/* Jauges SVG                                                          */
/* ------------------------------------------------------------------ */
function moodRingSVG(value,color,emoji){
  var animate=false;
  var v=clamp(Number(value)/5,0,1),R=26,C=2*Math.PI*R,dash=(C*v).toFixed(1);
  return '<svg class="ja-ring'+(animate?" is-animated":"")+'" viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
    '<circle cx="34" cy="34" r="'+R+'" fill="none" stroke="var(--ja-border)" stroke-width="4.5" opacity="0.4"/>'+
    '<circle class="ja-ring-arc" cx="34" cy="34" r="'+R+'" fill="none" stroke="'+color+'" stroke-width="4.5" stroke-linecap="round" '+
      'stroke-dasharray="'+dash+' '+C.toFixed(1)+'" transform="rotate(-90 34 34)" style="--ja-ring-dash:'+dash+';--ja-ring-c:'+C.toFixed(1)+'"/>'+
    '<text x="34" y="33" text-anchor="middle" class="ja-ring-emo">'+(emoji||"")+'</text>'+
    '<text x="34" y="48" text-anchor="middle" class="ja-ring-val" fill="'+color+'">'+Number(value).toFixed(1)+'</text>'+
  '</svg>';
}
function arcPath(cx,cy,rad,from,to){
  var p=function(a){return [cx+rad*Math.cos(a),cy-rad*Math.sin(a)];},
      a=p(from),b=p(to),
      large=Math.abs(to-from)>Math.PI?1:0,
      sweep=to<from?1:0;
  return "M "+a[0].toFixed(1)+" "+a[1].toFixed(1)+" A "+rad+" "+rad+" 0 "+large+" "+sweep+" "+b[0].toFixed(1)+" "+b[1].toFixed(1);
}
function halfGaugeSVG(ratio,color){
  var r=clamp(ratio,0,1),a0=Math.PI,a1=Math.PI*(1-r);
  return '<svg class="ja-gauge ja-gauge-half" viewBox="0 0 104 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
    '<path d="'+arcPath(52,54,40,a0,0)+'" fill="none" stroke="var(--ja-border)" stroke-width="5" stroke-linecap="round" opacity="0.4"/>'+
    '<path class="ja-gauge-fill" d="'+arcPath(52,54,40,a0,a1)+'" fill="none" stroke="'+color+'" stroke-width="5" stroke-linecap="round"/>'+
  '</svg>';
}
function barsGaugeSVG(level,color){
  var lv=clamp(Math.round(level),0,5),bars=[],bw=8,gap=4,base=56;
  for(var i=0;i<6;i++){
    var h=10+i*7,x=5+i*(bw+gap),y=base-h,on=i<=lv;
    bars.push('<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="3" fill="'+(on?color:"var(--ja-border)")+'" opacity="'+(on?1:0.35)+'"/>');
  }
  return '<svg class="ja-gauge ja-gauge-bars" viewBox="0 0 78 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+bars.join("")+'</svg>';
}

/* Mini-jauge segmentée : remplace les chips dans les cartes d'entrée.
   Six barres croissantes, teintées par le niveau, libellé en title. */
function miniScale(doc,parent,icon,level,levels){
  var lv=levels[clamp(Math.round(level),0,5)]||{label:"",bg:"var(--ja-accent)"},
      wrap=mk(doc,parent,"span","ja-mini-scale");
  wrap.title=icon+" "+lv.label;
  mk(doc,wrap,"span","ja-mini-scale-ico",icon);
  var track=mk(doc,wrap,"span","ja-mini-scale-track");
  for(var i=0;i<6;i++){
    var b=mk(doc,track,"span","ja-mini-scale-bar"+(i<=level?" is-on":""));
    b.style.height=(3+i*1.6)+"px";
    if(i<=level){b.style.background=lv.bg;}
  }
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Images : modèle unique, migration des anciens réglages              */
/* ------------------------------------------------------------------ */
var IMG_DEFAULTS={
  src:"", back:false, gallery:"", caption:"",
  fit:"cover", posX:50, posY:50, opacity:85,
  fadeDir:"bottom", fadeStart:40, fadeEnd:95,
  fadeMode:"transparent", fadeColor:"#14161d",
  layout:"slides", pos:"left", flow:"column"
};

var GALLERY_LAYOUTS=[
  ["slides","Diaporama"],
  ["carousel","Défilant"],
  ["mosaic","Mosaïque"],
  ["grid","Grille"],
  ["hero","Vedette"],
  ["heroslides","Vedette + défilant"]
];

/* Huit directions, diagonales comprises. */
var FADE_ANGLES={
  top:"0deg", tr:"45deg", right:"90deg", br:"135deg",
  bottom:"180deg", bl:"225deg", left:"270deg", tl:"315deg"
};
var FADE_LABELS=[
  ["tl","↖"],["top","↑"],["tr","↗"],
  ["left","←"],["none","∅"],["right","→"],
  ["bl","↙"],["bottom","↓"],["br","↘"]
];

function hexToRgba(hex,alpha){
  var h=String(hex||"#000000").replace("#","");
  if(h.length===3){h=h.split("").map(function(c){return c+c;}).join("");}
  var v=parseInt(h,16);
  if(isNaN(v)){return "rgba(0,0,0,"+alpha+")";}
  return "rgba("+((v>>16)&255)+","+((v>>8)&255)+","+(v&255)+","+alpha+")";
}

function normalizeImage(raw){
  var item={};
  Object.keys(IMG_DEFAULTS).forEach(function(k){item[k]=IMG_DEFAULTS[k];});
  if(!raw||typeof raw!=="object"){return item;}
  Object.keys(IMG_DEFAULTS).forEach(function(k){
    if(raw[k]!==undefined&&raw[k]!==null){item[k]=raw[k];}
  });
  /* ancien nom : banner -> back */
  if(raw.banner!==undefined){item.back=!!raw.banner;}
  item._hasPos=raw.pos!==undefined;
  item._hasFlow=raw.flow!==undefined;
  /* ancien fondu : une simple direction */
  if(typeof raw.fade==="string"){
    item.fadeDir=raw.fade;
    if(raw.fade==="none"){item.fadeDir="none";}
  }
  if(item.fit==="square"){item.fit="cover";item.square=true;}
  return item;
}
function normalizeImages(rawList){
  return (rawList||[]).map(normalizeImage);
}

/*
  Le fondu, dans les deux régimes :
    · vers la transparence -> un masque, l'image disparaît
    · vers une couleur     -> un calque posé sur l'image, dans la même
                              couche donc à la même opacité qu'elle
*/
function fadeStops(item){
  var angle=FADE_ANGLES[item.fadeDir]||"180deg",
      a=Math.max(0,Math.min(100,+item.fadeStart)),
      b=Math.max(a+1,Math.min(100,+item.fadeEnd));
  return {angle:angle,a:a,b:b};
}
function fadeMask(item){
  if(item.fadeDir==="none"||item.fadeMode==="color"){return "";}
  var f=fadeStops(item);
  return "linear-gradient("+f.angle+", #000 0%, #000 "+f.a+"%, transparent "+f.b+"%)";
}
function fadeOverlay(item){
  if(item.fadeDir==="none"||item.fadeMode!=="color"){return "";}
  var f=fadeStops(item),c=item.fadeColor||"#14161d";
  return "linear-gradient("+f.angle+", "+hexToRgba(c,0)+" 0%, "+
         hexToRgba(c,0)+" "+f.a+"%, "+hexToRgba(c,1)+" "+f.b+"%)";
}

/* Pose les variables du fond sur n'importe quel élément. */
function backdropVars(wiki,el,item){
  var src=Media.src(wiki,item.src);
  if(!src){return false;}
  var overlay=fadeOverlay(item),
      image='url("'+src+'")';
  el.style.setProperty("--jtl-ban",overlay?overlay+", "+image:image);
  el.style.setProperty("--jtl-ban-size",
    overlay?("auto, "+(item.fit==="contain"?"contain":(item.fit==="fill"?"100% 100%":"cover")))
           :(item.fit==="contain"?"contain":(item.fit==="fill"?"100% 100%":"cover")));
  el.style.setProperty("--jtl-ban-pos",
    overlay?("center, "+item.posX+"% "+item.posY+"%"):(item.posX+"% "+item.posY+"%"));
  el.style.setProperty("--jtl-ban-opacity",(Math.max(0,Math.min(100,+item.opacity))/100).toFixed(2));
  var mask=fadeMask(item);
  el.style.setProperty("--jtl-ban-mask",mask||"none");
  return true;
}

/* Applique un fond d'entrée à une carte. */
function applyBackdrop(wiki,card,item){
  if(!backdropVars(wiki,card,item)){return false;}
  card.classList.add("has-backdrop");
  return true;
}

/* ------------------------------------------------------------------ */
/* Menu contextuel partagé                                             */
/* ------------------------------------------------------------------ */
var ICONS={person:"\u{1F464}",activity:"\u{1F3C3}",project:"\u{1F9E9}",
           event:"\u{1F4C5}",media:"\u{1F39E}\uFE0F",sleep:"\u{1F319}",place:"\u{1F4CD}"};

function jaPopover(doc,anchorEl,items,cleanups,direction){
  var old=doc.querySelector(".ja-pop");
  if(old){old.remove();}
  var pop=doc.createElement("div");
  pop.className="ja-pop";
  doc.body.appendChild(pop);
  items.forEach(function(item){
    if(item.sep){
      var sep=doc.createElement("div");
      sep.className="ja-pop-sep";
      pop.appendChild(sep);
      return;
    }
    var b=doc.createElement("button");
    b.type="button";
    b.className="ja-pop-item";
    b.textContent=item.label;
    b.addEventListener("click",function(){pop.remove();item.run();});
    pop.appendChild(b);
  });
  var rect=anchorEl.getBoundingClientRect(),
      w=doc.documentElement.clientWidth;
  pop.style.left=Math.max(8,Math.min(rect.left,w-210))+"px";
  if(direction==="up"){
    pop.style.top="";
    pop.style.bottom=(doc.documentElement.clientHeight-rect.top+6)+"px";
    pop.style.left=Math.max(8,Math.min(rect.right-190,w-198))+"px";
  }else{
    pop.style.top=(rect.bottom+5)+"px";
  }
  function away(ev){
    if(!pop.contains(ev.target)){pop.remove();document.removeEventListener("mousedown",away,true);}
  }
  setTimeout(function(){document.addEventListener("mousedown",away,true);},0);
  if(cleanups){cleanups.push(function(){pop.remove();document.removeEventListener("mousedown",away,true);});}
  return pop;
}

/* ------------------------------------------------------------------ */
/* Le widget                                                           */
/* ------------------------------------------------------------------ */
var JournalWidget=function(parseTreeNode,options){this.initialise(parseTreeNode,options);};
JournalWidget.prototype=new Widget();

JournalWidget.prototype.execute=function(){
  this.mode=this.getAttribute("mode","day");
  this.cfg=JConfig.read(this.wiki);
  if(!this.cursorMonth){
    var d=parseISO(selectedDate(this))||new Date();
    this.cursorMonth=new Date(d.getFullYear(),d.getMonth(),1,12);
  }
};

JournalWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;
  this.computeAttributes();
  this.execute();
  var root=mk(this.document,null,"div",this.mode==="sidebar"?"ja-journal-sidebar":"ja-journal-day");
  parent.insertBefore(root,nextSibling);
  this.domNodes.push(root);
  if(this.mode==="sidebar"){this.renderSidebar(root);}else{this.renderDay(root);}
};

JournalWidget.prototype.moodColor=function(v){return JConfig.moodColor(this.cfg,v);};

/* ---------------- Sidebar : mini-calendrier ---------------- */
JournalWidget.prototype.renderSidebar=function(root){
  var self=this,doc=this.document,selected=selectedDate(this);

  /* La hauteur ne peut pas dépendre d'un sélecteur CSS : la transclusion
     peut insérer un conteneur intermédiaire. On la pose en dur. */
  root.style.display="flex";
  root.style.flexDirection="column";
  root.style.minHeight="100%";
  var host=root.parentNode;
  while(host&&host.classList&&!host.classList.contains("ja-left-body")){
    host.style.display="flex";
    host.style.flexDirection="column";
    host.style.minHeight="100%";
    host=host.parentNode;
  }
  var nav=mk(doc,root,"div","ja-jcal-nav");
  var prev=btn(doc,nav,"ja-jcal-arrow","‹","Mois précédent");
  var label=mk(doc,nav,"div","ja-jcal-label");
  var y0=this.cursorMonth.getFullYear(),
      monthTxt=cap(new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(this.cursorMonth));
  var monthBtn=btn(doc,label,"ja-jcal-part",monthTxt,"Voir le mois de "+monthTxt);
  var yearBtn=btn(doc,label,"ja-jcal-part",String(y0),"Voir l’année "+y0);
  var jump=btn(doc,label,"ja-jcal-jump","🗓","Aller à un mois");
  var next=btn(doc,nav,"ja-jcal-arrow","›","Mois suivant");

  monthBtn.addEventListener("click",function(){
    self.wiki.setText(MONTH_STATE,"text",null,y0+"-"+pad(self.cursorMonth.getMonth()+1));
    self.wiki.setText(VIEW_STATE,"text",null,"$:/journalapp/views/journal/month");
  });
  yearBtn.addEventListener("click",function(){
    self.wiki.setText(YEAR_STATE,"text",null,String(y0));
    self.wiki.setText(VIEW_STATE,"text",null,"$:/journalapp/views/journal/year");
  });
  jump.addEventListener("click",function(ev){
    ev.stopPropagation();
    self.openMonthPicker(jump);
  });

  prev.addEventListener("click",function(){self.cursorMonth=new Date(self.cursorMonth.getFullYear(),self.cursorMonth.getMonth()-1,1,12);self.refreshSelf();});
  next.addEventListener("click",function(){self.cursorMonth=new Date(self.cursorMonth.getFullYear(),self.cursorMonth.getMonth()+1,1,12);self.refreshSelf();});

  var grid=mk(doc,root,"div","ja-jcal-grid");
  ["L","M","M","J","V","S","D"].forEach(function(x){mk(doc,grid,"div","ja-jcal-dow",x);});
  var y=this.cursorMonth.getFullYear(),m=this.cursorMonth.getMonth(),
      first=new Date(y,m,1,12),last=new Date(y,m+1,0,12),lead=(first.getDay()+6)%7;
  for(var i=0;i<lead;i++){mk(doc,grid,"span","ja-jcal-empty","");}
  for(var day=1;day<=last.getDate();day++){
    (function(dayNum){
      var iso=isoOf(new Date(y,m,dayNum,12)),agg=dayAgg(self,iso),
          cell=btn(doc,grid,"ja-jcal-day",String(dayNum),iso);
      if(iso===selected){cell.classList.add("is-selected");}
      if(iso===todayISO()){cell.classList.add("is-today");}
      if(agg.mood!=null){cell.classList.add("has-mood");cell.style.setProperty("--jcal-mood",self.moodColor(agg.mood));}
      if(agg.markers.length){cell.classList.add("has-marker");}
      if(agg.count){
        cell.title=iso+" · "+agg.count+" entrée"+(agg.count>1?"s":"")+(agg.mood!=null?" · humeur "+agg.mood.toFixed(1):"");
      }
      cell.addEventListener("click",function(){setSelectedDate(self,iso);});
    })(day);
  }
  var actions=mk(doc,root,"div","ja-jcal-actions");
  var today=btn(doc,actions,"ja-jcal-today","Aujourd’hui");
  var add=btn(doc,actions,"ja-journal-add","＋ Entrée");
  today.addEventListener("click",function(){
    var iso=todayISO();setSelectedDate(self,iso);
    var d=parseISO(iso);self.cursorMonth=new Date(d.getFullYear(),d.getMonth(),1,12);self.refreshSelf();
  });
  add.addEventListener("click",function(){self.openForm(null,selectedDate(self));});

  this.renderSkyCard(root);
};

/* Navigation rapide : une grille d'années, une grille de mois. */
JournalWidget.prototype.openMonthPicker=function(anchor){
  var self=this,doc=this.document,
      pop=mk(doc,doc.body,"div","ja-pop ja-monthpick"),
      rect=anchor.getBoundingClientRect(),
      year=this.cursorMonth.getFullYear();

  pop.style.left=Math.max(8,Math.min(rect.left-90,doc.documentElement.clientWidth-250))+"px";
  pop.style.top=(rect.bottom+6)+"px";
  function close(){pop.remove();document.removeEventListener("mousedown",away,true);}
  function away(ev){if(!pop.contains(ev.target)){close();}}
  setTimeout(function(){document.addEventListener("mousedown",away,true);},0);

  var head=mk(doc,pop,"div","ja-monthpick-head"),
      back=btn(doc,head,"ja-jcal-arrow","‹","Décennie précédente"),
      title=mk(doc,head,"span","ja-monthpick-title",String(year)),
      fwd=btn(doc,head,"ja-jcal-arrow","›","Décennie suivante");

  var years=mk(doc,pop,"div","ja-monthpick-years"),
      months=mk(doc,pop,"div","ja-monthpick-months");

  function drawYears(){
    years.innerHTML="";
    var start=Math.floor(year/10)*10-1;
    for(var i=0;i<12;i++){
      (function(y){
        var b=btn(doc,years,"ja-monthpick-cell"+(y===year?" is-on":""),String(y));
        if(y<Math.floor(year/10)*10||y>Math.floor(year/10)*10+9){b.classList.add("is-out");}
        b.addEventListener("click",function(){year=y;title.textContent=String(y);drawYears();});
      })(start+i);
    }
  }
  function drawMonths(){
    months.innerHTML="";
    for(var m=0;m<12;m++){
      (function(mm){
        var name=new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(new Date(2020,mm,1)),
            on=(mm===self.cursorMonth.getMonth()&&year===self.cursorMonth.getFullYear()),
            b=btn(doc,months,"ja-monthpick-cell"+(on?" is-on":""),cap(name.replace(".","")));
        b.addEventListener("click",function(){
          self.cursorMonth=new Date(year,mm,1,12);
          close();
          self.refreshSelf();
        });
      })(m);
    }
  }
  back.addEventListener("click",function(){year-=10;title.textContent=String(year);drawYears();});
  fwd.addEventListener("click",function(){year+=10;title.textContent=String(year);drawYears();});
  drawYears();drawMonths();

  var todayBtn=btn(doc,pop,"ja-monthpick-today","Aujourd’hui");
  todayBtn.addEventListener("click",function(){
    var d=new Date();
    self.cursorMonth=new Date(d.getFullYear(),d.getMonth(),1,12);
    close();setSelectedDate(self,todayISO());
  });
};

/* ---------------- Sidebar : la carte de ciel ---------------- */
JournalWidget.prototype.renderSkyCard=function(root){
  var self=this,doc=this.document,iso=selectedDate(this),agg=dayAgg(this,iso);
  if(!this.cfg.options.sky){return;}

  var card=mk(doc,root,"div","ja-skycard"),
      sky=mk(doc,card,"div","ja-sky"),
      top=mk(doc,card,"div","ja-skycard-top"),
      dateLine=mk(doc,top,"div","ja-skycard-date",cap(prettyDate(iso).replace(/\s\d{4}$/,""))),
      timeLine=mk(doc,top,"div","ja-skycard-time","—"),
      foot=mk(doc,card,"div","ja-skycard-foot"),
      footFace=mk(doc,foot,"span","ja-skycard-face",""),
      footLabel=mk(doc,foot,"span","ja-skycard-label",""),
      footTemp=mk(doc,foot,"span","ja-skycard-temp","");

  /* Ceinture et bretelles : le ciel est en position absolue, il DOIT rester
     dans sa carte même si la feuille de style n'est pas à jour. Sans ça, il
     s'échappe et recouvre toute l'application. */
  card.style.position="relative";
  card.style.overflow="hidden";
  card.style.minHeight="150px";
  card.style.flex="1 1 auto";
  card.style.isolation="isolate";
  sky.style.position="absolute";
  sky.style.inset="0";
  sky.style.overflow="hidden";
  sky.style.zIndex="0";
  top.style.position="relative";
  top.style.zIndex="3";
  foot.style.position="relative";
  foot.style.zIndex="3";

  var current={rank:-1,hour:-99};

  function apply(detail){
    var rank=detail.rank===undefined?-1:detail.rank,
        hour=detail.hour==null?new Date().getHours():detail.hour;
    if(rank!==current.rank||hour!==current.hour){
      current={rank:rank,hour:hour};
      Sky.paint(doc,sky,{rank:rank,hour:hour});
    }
    timeLine.textContent=detail.time||new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(new Date());
    footFace.textContent=detail.mood||"";
    footLabel.textContent=rank>=0?(detail.label||Sky.labelForRank(rank)):"Pas de météo";
    footTemp.textContent=(detail.temp!==undefined&&detail.temp!=="")?Math.round(+detail.temp)+"°":"";
  }

  apply({rank:agg.weatherRank,hour:null,label:"",time:""});

  var onFocus=function(ev){
    if(!ev.detail||ev.detail.iso!==selectedDate(self)){return;}
    apply(ev.detail);
  };
  document.addEventListener("ja-journal-focus",onFocus);
  this.skyCleanup=function(){document.removeEventListener("ja-journal-focus",onFocus);};
};

/* ---------------- Jour : bannière + dashboard + timeline ---------------- */
JournalWidget.prototype.renderDay=function(root){
  var self=this,doc=this.document,iso=selectedDate(this),agg=dayAgg(this,iso),
      cfg=this.cfg,opt=cfg.options;

  /* ---- bannière ---- */
  var hero=mk(doc,root,"header","ja-jhero");
  hero.style.setProperty("--ja-hero-h",(opt.bannerHeight||210)+"px");
  var pick=JConfig.pickBanner(cfg,agg.mood);
  var banner=mk(doc,hero,"div","ja-jhero-bg");
  if(pick.type==="image"){
    var src=JConfig.imageSrc(this.wiki,pick.image);
    if(src){
      banner.classList.add("has-image");
      banner.style.setProperty("--ja-hero-img",'url("'+src+'")');
    }else{
      banner.classList.add("has-color");
      banner.style.setProperty("--ja-hero-col",pick.color);
    }
  }else{
    banner.classList.add("has-color");
    banner.style.setProperty("--ja-hero-col",pick.color);
  }



  mk(doc,hero,"div","ja-jhero-scrim");

  /* ---- barre de date, dans la bannière ---- */
  var bar=mk(doc,hero,"div","ja-jhero-bar");
  var prev=btn(doc,bar,"ja-jday-arrow","‹","Jour précédent");
  var dateBox=mk(doc,bar,"div","ja-jhero-date");
  mk(doc,dateBox,"div","ja-jhero-kicker",iso===todayISO()?"Aujourd’hui":(agg.count?"Journal du jour":"Journée vierge"));
  var titleRow=mk(doc,dateBox,"div","ja-jhero-titlerow");
  var dTitle=mk(doc,titleRow,"h1","ja-jhero-title",cap(prettyDate(iso)));
  dTitle.title="Cliquer pour revenir à aujourd’hui";
  dTitle.addEventListener("click",function(){setSelectedDate(self,todayISO());});
  if(agg.regles){mk(doc,titleRow,"span","ja-jhero-flag","🩸").title="Règles";}
  (cfg.markers||[]).forEach(function(mk_){
    if(agg.markers.indexOf(mk_.id)===-1){return;}
    var s=mk(doc,titleRow,"span","ja-jhero-flag",mk_.emoji);
    s.title=mk_.label;
    if(mk_.color){s.style.setProperty("--ja-flag-col",mk_.color);}
  });
  var next=btn(doc,bar,"ja-jday-arrow","›","Jour suivant");
  prev.addEventListener("click",function(){setSelectedDate(self,addDays(iso,-1));});
  next.addEventListener("click",function(){setSelectedDate(self,addDays(iso,1));});

  /* ---- dashboard ---- */
  var dash=mk(doc,hero,"div","ja-jdash");
  var gauges=mk(doc,dash,"div","ja-jdash-gauges");
  if(agg.mood!=null){
    var cell=mk(doc,gauges,"div","ja-jdash-cell"),
        img=opt.moodDisplay==="image"?dominantMoodImage(agg.entries,agg.mood):"";
    if(img){
      var holder=mk(doc,cell,"div","ja-ring-imgwrap");
      svgInto(holder,moodRingSVG(agg.mood,this.moodColor(agg.mood),"",opt.moodAnim));
      var im=mk(doc,holder,"img","ja-ring-img");
      im.src=JConfig.imageSrc(this.wiki,img);
      im.alt="";
    }else{
      svgInto(cell,moodRingSVG(agg.mood,this.moodColor(agg.mood),dominantMoodEmoji(agg.entries,agg.mood),opt.moodAnim));
    }
    mk(doc,cell,"div","ja-jdash-name","Humeur");
  }
  if(agg.energy!=null){
    var lvE=cfg.energy[clamp(Math.round(agg.energy),0,5)]||{label:"",bg:"var(--ja-accent)"},
        cE=mk(doc,gauges,"div","ja-jdash-cell");
    svgInto(cE,halfGaugeSVG(agg.energy/5,lvE.bg));
    mk(doc,cE,"div","ja-jdash-val",lvE.label);
    mk(doc,cE,"div","ja-jdash-name","⚡ Énergie");
  }
  if(agg.stress!=null){
    var lvS=cfg.stress[clamp(Math.round(agg.stress),0,5)]||{label:"",bg:"var(--ja-accent)"},
        cS=mk(doc,gauges,"div","ja-jdash-cell");
    svgInto(cS,barsGaugeSVG(agg.stress,lvS.bg));
    mk(doc,cS,"div","ja-jdash-val",lvS.label);
    mk(doc,cS,"div","ja-jdash-name","🌪️ Anxiété");
  }
  if(opt.showWeatherGauge && agg.weatherRank>=0){
    var cW=mk(doc,gauges,"div","ja-jdash-cell");
    mk(doc,cW,"div","ja-jdash-meteo",Sky.emojiForRank(agg.weatherRank));
    mk(doc,cW,"div","ja-jdash-name","Météo");
  }
  if(!gauges.childNodes.length){gauges.remove();}

  var actions=mk(doc,dash,"div","ja-jdash-actions"),
      createGroup=mk(doc,actions,"div","ja-journal-create-group");
  var add=btn(doc,createGroup,"ja-journal-add ja-journal-create-main","✦ Ajouter une entrée");
  add.addEventListener("click",function(){self.openForm(null,iso);});
  var addAgenda=btn(doc,createGroup,"ja-journal-add ja-journal-agenda-plus","＋","Ajouter un événement ou une To-do");
  addAgenda.addEventListener("click",function(e){e.stopPropagation();agendaQuickMenu(self,addAgenda,iso);});

  /* ---- timeline : uniquement les Dailies. Les objets Agenda n'entrent
     jamais seuls dans le fil ; s'ils sont liés, ils vivent sous leur Daily. ---- */
  var body=mk(doc,root,"div","ja-jbody");
  if(!agg.count){
    var empty=mk(doc,body,"div","ja-jday-empty");
    mk(doc,empty,"div","ja-jday-empty-icon","✦");
    mk(doc,empty,"div","ja-jday-empty-title","Rien n’est encore écrit ici.");
    mk(doc,empty,"div","ja-jday-empty-sub","Une journée blanche, prête à être griffonnée.");
    var eb=btn(doc,empty,"ja-journal-add","＋ Ajouter la première entrée");
    eb.addEventListener("click",function(){self.openForm(null,iso);});
    return;
  }
  var capRow=mk(doc,body,"div","ja-jcap");
  mk(doc,capRow,"span","ja-jcap-orn","❖");
  mk(doc,capRow,"span","ja-jcap-txt","Timeline");
  mk(doc,capRow,"span","ja-jcap-orn","❖");

  var timeline=mk(doc,body,"div","ja-jtimeline");
  var line=mk(doc,timeline,"div","ja-jtl-line");
  this.dayContext={agg:agg,iso:iso,timeline:timeline};
  agg.entries.forEach(function(rec,index){
    var nextT=index<agg.entries.length-1?agg.entries[index+1].tiddler:null;
    self.renderEntry(timeline,rec.title,rec.tiddler,nextT);
  });
  this.drawTimelineLine(timeline,line,agg,iso);
  this.watchFocus(timeline,agg,iso);
  var focusTitle=this.wiki.getTiddlerText(FOCUS_DAILY_STATE,"");
  if(focusTitle){
    var fw=this;
    setTimeout(function(){
      var target=null;
      Array.prototype.some.call(timeline.querySelectorAll("[data-ja-entry]"),function(el){
        if(el.getAttribute("data-ja-entry")===focusTitle){target=el;return true;}return false;
      });
      if(target&&target.scrollIntoView){
        target.scrollIntoView({behavior:"smooth",block:"center"});
        target.classList.add("is-flash");
        setTimeout(function(){target.classList.remove("is-flash");},1400);
        fw.wiki.setText(FOCUS_DAILY_STATE,"text",null,"",{suppressTimestamp:true});
      }
    },40);
  }
};

/*
  Une seule ligne, du premier point au dernier, teintée par la suite des
  humeurs de la journée. C'est elle qui ouvre le menu des heures.
*/
JournalWidget.prototype.drawTimelineLine=function(timeline,line,agg,iso){
  var self=this,doc=this.document;

  function place(){
    var dots=timeline.querySelectorAll(".ja-jtl-dot");
    if(dots.length<1){line.style.display="none";return;}
    var first=dots[0],last=dots[dots.length-1],
        base=timeline.getBoundingClientRect(),
        a=first.getBoundingClientRect(),
        b=last.getBoundingClientRect();
    line.style.display="";
    line.style.top=(a.top-base.top+a.height/2)+"px";
    line.style.height=Math.max(0,(b.top-base.top+b.height/2)-(a.top-base.top+a.height/2))+"px";
    line.style.left=(a.left-base.left+a.width/2-1.5)+"px";
  }

  var stops=Array.prototype.map.call(timeline.querySelectorAll(".ja-jtl-dot"),function(dot){
    return dot.style.background||"var(--ja-border)";
  });
  line.style.background=stops.length>1
    ? "linear-gradient(180deg,"+stops.join(",")+")"
    : (stops[0]||"var(--ja-border)");

  place();
  if(typeof requestAnimationFrame==="function"){requestAnimationFrame(place);}
  if(typeof ResizeObserver==="function"){
    if(this.lineObserver){try{this.lineObserver.disconnect();}catch(e){}}
    this.lineObserver=new ResizeObserver(place);
    this.lineObserver.observe(timeline);
  }

};

/*
  Le menu des heures. Ouvert depuis le trait, une pastille ou une heure —
  jamais depuis la bannière.
*/
JournalWidget.prototype.openHourMenu=function(anchor){
  var self=this,doc=this.document,ctx=this.dayContext;
  if(!ctx||!ctx.agg.entries.length){return;}

  var items=ctx.agg.entries.map(function(rec){
    var f=rec.tiddler.fields,
        face=String(f["mood-emoji"]||"•"),
        txt=String(f.text||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
    return {
      label:face+"  "+String(f.time||"--:--")+(txt?"  ·  "+txt.slice(0,26):""),
      run:function(){
        var card=null;
        Array.prototype.some.call(ctx.timeline.querySelectorAll("[data-ja-entry]"),function(el){
          if(el.getAttribute("data-ja-entry")===rec.title){card=el;return true;}
          return false;
        });
        if(card&&card.scrollIntoView){
          card.scrollIntoView({behavior:"smooth",block:"center"});
          card.classList.add("is-flash");
          setTimeout(function(){card.classList.remove("is-flash");},1200);
        }
      }
    };
  });
  items.push({sep:true});
  items.push({label:"＋  Nouvelle entrée",run:function(){self.openForm(null,ctx.iso);}});
  jaPopover(doc,anchor,items);
};

/* Publie l'entrée la plus au centre de l'écran. Le ciel de la sidebar
   écoute et se repeint : on scrolle, le temps change. */
JournalWidget.prototype.watchFocus=function(timeline,agg,iso){
  var self=this;
  function announce(detail){
    try{
      document.dispatchEvent(new CustomEvent("ja-journal-focus",{detail:detail}));
    }catch(e){}
  }
  var daySummary={iso:iso,rank:agg.weatherRank,hour:null,label:"",time:""};

  if(typeof IntersectionObserver!=="function"){return;}
  if(this.focusObserver){try{this.focusObserver.disconnect();}catch(e){}}

  var visible=Object.create(null);
  this.focusObserver=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      var key=en.target.getAttribute("data-ja-entry");
      if(en.isIntersecting){visible[key]=en.intersectionRatio;}
      else{delete visible[key];}
    });
    var bestKey=null,bestRatio=-1;
    Object.keys(visible).forEach(function(k){
      if(visible[k]>bestRatio){bestRatio=visible[k];bestKey=k;}
    });
    if(!bestKey){announce(daySummary);return;}
    var rec=null;
    agg.entries.some(function(r){if(r.title===bestKey){rec=r;return true;}return false;});
    if(!rec){return;}
    var f=rec.tiddler.fields,
        code=f["weather-code"],
        rank=(code!==undefined&&String(code)!=="")?Sky.rankFromCode(code):agg.weatherRank,
        time=String(f.time||""),
        hour=/^\d{2}:/.test(time)?parseInt(time.slice(0,2),10):null;
    announce({
      iso:iso,rank:rank,hour:hour,time:time,
      label:String(f["weather-label"]||Sky.labelForRank(rank)),
      temp:f["weather-temp"]!==undefined?String(f["weather-temp"]):"",
      mood:String(f["mood-emoji"]||"")
    });
  },{root:null,threshold:[0.25,0.55,0.85]});

  Array.prototype.forEach.call(timeline.querySelectorAll("[data-ja-entry]"),function(el){
    self.focusObserver.observe(el);
  });
  announce(daySummary);
};

JournalWidget.prototype.codeForRank=function(agg){
  var found=null;
  agg.entries.forEach(function(e){
    var c=e.tiddler.fields["weather-code"];
    if(c!==undefined&&String(c)!==""&&Sky.rankFromCode(c)===agg.weatherRank&&found===null){found=c;}
  });
  return found===null?0:found;
};

/* ---------------- Une entrée de la timeline ---------------- */
function linkedAgendaType(w,item){
  var cfg=Agenda.readConfig(w.wiki),f=item&&item.tiddler&&item.tiddler.fields?item.tiddler.fields:{},id=String(item.typeId||f["event-type"]||"");
  if(item&&item.type){return item.type;}
  if(id){var direct=Agenda.eventType(cfg,id);if(direct){return direct;}}
  var ps=item&&item.projects||[];
  for(var i=0;i<ps.length;i++){
    var pt=w.wiki.getTiddler(ps[i]);if(!pt||!pt.fields){continue;}
    var pid=String(pt.fields["event-type"]||"");if(pid){var inherited=Agenda.eventType(cfg,pid);if(inherited){return inherited;}}
  }
  return null;
}
function linkedAgendaTypeIcon(w,parent,type){
  if(!type){return;}
  var src=type.image?Media.src(w.wiki,String(type.image)):"";
  if(src){var im=mk(w.document,parent,"img","ja-agenda-type-icon");im.src=src;im.alt="";return;}
  mk(w.document,parent,"span","ja-agenda-type-icon",String(type.icon||"•"));
}
function linkedAgendaBackdropRole(item){
  if(item.kind==="todo"){return "todo";}
  if(item.kind==="habit"){return "habit";}
  if(item.kind==="event"&&item.role==="slot"){return "slot";}
  if(item.kind==="event"){return "event";}
  return "";
}
function linkedAgendaBackdrop(w,item,type){
  var imgs=(item.images||[]).slice(),back=null;
  imgs.some(function(im){if(im&&(im.back||im.banner||im.baniere)){back=im;return true;}return false;});
  if(!back&&type&&type.backgrounds){
    var raw=type.backgrounds[linkedAgendaBackdropRole(item)];
    if(typeof raw==="string"&&raw){
      back={src:raw,back:true,autoType:true};
    }else if(raw&&typeof raw==="object"){
      back=Object.assign({},raw);
      if(raw.ref&&!back.src){back.src=raw.ref;}
      back.back=true;back.autoType=true;
    }
  }
  if(!back){
    var ps=item.projects||[];
    for(var i=0;i<ps.length&&!back;i++){
      var pt=w.wiki.getTiddler(ps[i]);if(!pt||!pt.fields){continue;}
      var pimgs=Agenda.parseJson(pt.fields.images,[])||[];
      pimgs.some(function(im){if(im&&(im.back||im.banner||im.baniere)){back=im;return true;}return false;});
    }
  }
  return back;
}
function applyLinkedAgendaBackdrop(w,card,item,type){
  var back=linkedAgendaBackdrop(w,item,type);if(!back){return false;}
  return Media.applyBackdropLayer(w.wiki,card,back,{
    hostClass:"ja-agenda-backdrop-host",layerClass:"ja-agenda-backdrop-layer"
  });
}
function linkedAgendaEdit(w,item,ref){
  var F=agendaForms();
  if(item.kind==="todo"){F.openTodo(w,{editTitle:ref,date:item.date});}
  else if(item.kind==="habit"){F.openHabit(w,{editTitle:ref,date:item.date});}
  else if(item.role==="slot"){F.openSlot(w,{editTitle:ref,date:item.date});}
  else{F.openEvent(w,{editTitle:ref,date:item.date});}
}
function linkedAgendaSetStatus(w,item,ref,status){
  var t=w.wiki.getTiddler(ref);if(!t){return;}
  w.wiki.addTiddler(new $tw.Tiddler(t,{status:status},{modified:new Date()}));
}
function linkedAgendaStatusMenu(w,anchor,item,ref){
  var opts=item.kind==="todo"?
    [["□ À faire","a_faire"],["◩ En cours","en_cours"],["✓ Fait","fait"],["→ Reporté","reporte"],["× Annulé","annule"]]:
    [["• Normal","normal"],["✓ Fait","fait"],["→ Reporté","reporte"],["× Annulé","annule"]];
  jaPopover(w.document,anchor,opts.map(function(x){return {label:x[0],run:function(){linkedAgendaSetStatus(w,item,ref,x[1]);}};}),[],"down");
}
function linkedAgendaAddProgress(w,ref){
  var t=w.wiki.getTiddler(ref);if(!t){return;}
  var text=window.prompt("Nouvelle note de progression :","");if(text===null||!String(text).trim()){return;}
  var list=Agenda.parseJson(t.fields.progress||t.fields.journal,[])||[],now=new Date();if(!Array.isArray(list)){list=[];}
  list.push({date:Agenda.todayIso(),time:String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0"),text:String(text).trim()});
  w.wiki.addTiddler(new $tw.Tiddler(t,{progress:JSON.stringify(list)},{modified:new Date()}));
}

JournalWidget.prototype.renderAgendaTimelineItem=function(parent,item){
  if(!item||item.role==="birthday"){return null;}
  var self=this,doc=this.document,t=item.tiddler||this.wiki.getTiddler(item.refTitle||item.title),
      f=t&&t.fields?t.fields:{},ref=item.refTitle||f.title||item.title,
      type=linkedAgendaType(this,item),col=(type&&type.color)||item.color||"var(--ja-accent)",
      cls="ja-agenda-card ja-jtl-linked-agenda-card is-"+item.kind+(item.done?" is-done":"")+
          ((item.status==="annule"||item.status==="cancelled")?" is-cancelled":""),
      card=mk(doc,parent,"article",cls);
  card.style.setProperty("--ja-item-color",col);
  applyLinkedAgendaBackdrop(this,card,item,type);

  var head=mk(doc,card,"div","ja-agenda-card-head"),
      st=String(f.status||item.status||"a_faire"),
      icon=item.kind==="todo"?({a_faire:"□",en_cours:"◩",fait:"✓",reporte:"→",annule:"×"}[st]||"□"):
           (item.kind==="habit"?"↻":(item.role==="slot"?"▥":"📅"));
  mk(doc,head,"span","ja-agenda-card-icon",icon);
  mk(doc,head,"strong","ja-agenda-card-title",item.title||String(f.label||ref));
  if(item.recurring){mk(doc,head,"span","ja-agenda-mini-badge","↻").title="Récurrent";}
  var tm=item.startTime||item.reminderTime||"";
  mk(doc,head,"span","ja-agenda-card-time",tm?(tm+(item.endTime?" – "+item.endTime:"")):"Journée");
  var edit=btn(doc,head,"ja-agenda-inline-edit","✎","Modifier");
  edit.addEventListener("click",function(e){e.stopPropagation();linkedAgendaEdit(self,item,ref);});

  var meta=mk(doc,card,"div","ja-agenda-card-meta");
  if(type){
    var tc=mk(doc,meta,"span","ja-agenda-chip ja-agenda-type-chip");
    linkedAgendaTypeIcon(this,tc,type);mk(doc,tc,"span","",String(type.label||type.id||""));
  }
  if(item.kind==="todo"){
    var sm={a_faire:["□","À faire"],en_cours:["◩","En cours"],fait:["✓","Fait"],reporte:["→","Reporté"],annule:["×","Annulé"]}[st]||["□","À faire"],
        sb=btn(doc,meta,"ja-agenda-chip ja-agenda-status-action",sm[0]+" "+sm[1],"Changer l’état");
    sb.addEventListener("click",function(e){e.stopPropagation();linkedAgendaStatusMenu(self,sb,item,ref);});
    if(item.deadline){mk(doc,meta,"span","ja-agenda-chip","Échéance "+item.deadline);}
    var effort=Agenda.todoEffortInfo(this.wiki,ref);if(effort.total){mk(doc,meta,"span","ja-agenda-chip ja-agenda-effort-chip","⏱ "+(effort.remaining<effort.total?effort.remaining+" min reste / ":"")+effort.total+" min");}
  }else if(item.kind==="event"&&item.role!=="slot"){
    var evLabel=st==="fait"?"✓ Fait":(st==="annule"||st==="cancelled"?"× Annulé":(st==="reporte"?"→ Reporté":"• Normal")),
        evb=btn(doc,meta,"ja-agenda-chip ja-agenda-status-action",evLabel,"Changer l’état");
    evb.addEventListener("click",function(e){e.stopPropagation();linkedAgendaStatusMenu(self,evb,item,ref);});
  }
  if(item.durationMinutes){mk(doc,meta,"span","ja-agenda-chip","⏱ "+item.durationMinutes+" min");}
  if(item.endDate&&item.date&&item.endDate!==item.date){mk(doc,meta,"span","ja-agenda-chip","⇥ "+item.date+" → "+item.endDate);}
  if(!meta.childNodes.length){meta.remove();}

  var tags=mk(doc,card,"div","ja-agenda-card-tags");
  [["projects","🧩"],["people","👤"],["places","📍"],["activities","🏃"],["events","📅"],["todos","☑"],["habits","↻"],["dreams","🌙"],["channels","◌"],["media","🎞️"],["sleep","🌙"]].forEach(function(g){
    var vals=item[g[0]]||[];if(!vals.length){return;}
    var grp=mk(doc,tags,"span","ja-agenda-tag-group");mk(doc,grp,"span","ja-agenda-tag-ic",g[1]);
    vals.forEach(function(v){mk(doc,grp,"span","ja-agenda-tag",String(v));});
  });
  if(!tags.childNodes.length){tags.remove();}

  if(item.note){var linkedNote=Agenda.noteToPlainText(item.note,doc);if(linkedNote){mk(doc,card,"div","ja-agenda-card-note",linkedNote);}}

  if(item.progress&&item.progress.length){
    var pg=mk(doc,card,"div","ja-agenda-card-progress-notes");
    item.progress.slice().reverse().forEach(function(p){if(!p){return;}var line=mk(doc,pg,"div","ja-agenda-progress-note");if(p.date){mk(doc,line,"span","ja-agenda-progress-date",String(p.date));}mk(doc,line,"span","ja-agenda-progress-text",String(p.text||p.note||""));});
  }

  if(item.checklist&&item.checklist.length){
    var list=item.checklist.map(function(x){return {text:String(x.text||x.texte||""),done:!!(x.done||x.fait)};}),
        cl=mk(doc,card,"div","ja-agenda-card-checklist"),clHead=mk(doc,cl,"div","ja-agenda-checklist-head"),clBody=mk(doc,cl,"div","ja-agenda-checklist-body");
    function saveChecklist(){var tt=self.wiki.getTiddler(ref);if(tt){self.wiki.addTiddler(new $tw.Tiddler(tt,{checklist:JSON.stringify(list)},{modified:new Date()}));}}
    function drawChecklist(){
      clHead.innerHTML="";clBody.innerHTML="";var dn=list.filter(function(x){return x.done;}).length;
      mk(doc,clHead,"span","ja-agenda-checklist-label","☑ Préparation");mk(doc,clHead,"span","ja-agenda-checklist-count",dn+"/"+list.length);
      list.forEach(function(x,i){var b=btn(doc,clBody,"ja-agenda-checkline"+(x.done?" is-done":""),"");mk(doc,b,"span","ja-agenda-checkline-box",x.done?"✓":"");mk(doc,b,"span","ja-agenda-checkline-text",x.text);b.addEventListener("click",function(e){e.stopPropagation();list[i].done=!list[i].done;drawChecklist();saveChecklist();});});
    }
    drawChecklist();
  }

  if(item.kind==="todo"){
    AgendaUI.renderTodoSubtasks(this,card,ref,item.date||fieldValue(t,"date",selectedDate(this)),{compact:false});
  }

  var imgs=(item.images||[]).filter(function(im){return im&&!im.back&&!im.banner&&!im.baniere&&Media.src(self.wiki,im.src||im.path||"");});
  if(imgs.length){var strip=mk(doc,card,"div","ja-jtl-linked-agenda-images");imgs.slice(0,6).forEach(function(im){var x=mk(doc,strip,"img","");x.src=Media.src(self.wiki,im.src||im.path||"");x.alt=im.caption||"";});}
  if(item.audios&&item.audios.length){var ab=mk(doc,card,"div","ja-jtl-linked-agenda-audios");item.audios.forEach(function(refa){var src=Media.src(self.wiki,refa);if(!src){return;}var a=mk(doc,ab,"audio","");a.controls=true;a.preload="metadata";a.src=src;});}
  if(item.links&&item.links.length){var lb=mk(doc,card,"div","ja-jtl-linked-agenda-links");item.links.forEach(function(l){if(!l||!l.url){return;}var a=mk(doc,lb,"a","ja-jtl-link",String(l.url));a.href=l.internal?"#":l.url;if(l.internal){a.addEventListener("click",function(e){e.preventDefault();self.dispatchEvent({type:"tm-navigate",navigateTo:l.url});});}else{a.target="_blank";a.rel="noopener";}});}

  var actions=mk(doc,card,"div","ja-agenda-card-actions");
  if(item.kind==="todo"||item.kind==="habit"){
    var doneBtn=btn(doc,actions,"ja-agenda-smallbtn",item.done?"↩ Rouvrir":"✓ Fait");
    doneBtn.addEventListener("click",function(e){e.stopPropagation();if(item.kind==="habit"){Agenda.toggleHabitOnDate(self.wiki,ref,item.date);}else{Agenda.toggleTodoOnDate(self.wiki,ref,item.date);}});
  }
  if(!item.done&&String(item.status||st||"")!=="fait"){
    var prog=btn(doc,actions,"ja-agenda-smallbtn","＋ Progression");prog.addEventListener("click",function(e){e.stopPropagation();linkedAgendaAddProgress(self,ref);});
  }
  return card;
};

JournalWidget.prototype.renderEntry=function(parent,title,t,nextT){
  var self=this,doc=this.document,f=t.fields,cfg=this.cfg,
      mv=parseFloat(f["mood-value"]),
      col=isNaN(mv)?"var(--ja-border)":this.moodColor(mv);

  var row=mk(doc,parent,"div","ja-jtl-row");
  var rail=mk(doc,row,"div","ja-jtl-rail");
  var stamp=btn(doc,rail,"ja-jtl-stamp","","Les heures de la journée");
  mk(doc,stamp,"span","ja-jtl-time",fieldValue(t,"time","—"));
  var dot=mk(doc,stamp,"span","ja-jtl-dot","");
  dot.style.background=col;
  stamp.addEventListener("click",function(ev){
    ev.stopPropagation();self.openHourMenu(stamp);
  });


  var stack=mk(doc,row,"div","ja-jtl-stack"),
      card=mk(doc,stack,"article","ja-jtl-card");
  card.setAttribute("data-ja-entry",title);
  card.style.setProperty("--jtl-mood",col);

  /* --- fond de l'entrée --- */
  var legacyPos=String(f["media-pos"]||""),
      legacyFlow=String(f["media-flow"]||""),
      images=normalizeImages(Media.parseJsonList(f.images)).map(function(item){
        if(legacyPos&&!item._hasPos){item.pos=legacyPos==="side"?"left":legacyPos;}
        if(legacyFlow&&!item._hasFlow){item.flow=legacyFlow;}
        return item;
      }),
      backdrop=images.filter(function(i){return i.back;})[0],
      gallery=images.filter(function(i){return !i.back;});
  if(backdrop){applyBackdrop(this.wiki,card,backdrop);}

  var head=mk(doc,card,"div","ja-jtl-head");
  var left=mk(doc,head,"div","ja-jtl-head-left");
  if(f["mood-image"]){
    var mi=mk(doc,left,"img","ja-jtl-mood-img");
    mi.src=JConfig.imageSrc(this.wiki,String(f["mood-image"]));
    mi.alt="";
  }else if(f["mood-emoji"]){
    mk(doc,left,"span","ja-jtl-mood",String(f["mood-emoji"]));
  }
  if(f.energy!==undefined&&f.energy!==""){miniScale(doc,left,"⚡",clamp(+f.energy,0,5),cfg.energy);}
  if(f.stress!==undefined&&f.stress!==""){miniScale(doc,left,"🌪️",clamp(+f.stress,0,5),cfg.stress);}
  if(String(f.regles||"")==="yes"){mk(doc,left,"span","ja-jtl-flag","🩸").title="Règles";}
  if(f["weather-emoji"]){mk(doc,left,"span","ja-jtl-weather",String(f["weather-emoji"]));}
  if(f["weather-temp"]!==undefined&&f["weather-temp"]!==""){mk(doc,left,"span","ja-jtl-temp",Math.round(+f["weather-temp"])+"°");}
  if(f.marker){
    var mm=(cfg.markers||[]).filter(function(x){return x.id===String(f.marker);})[0];
    if(mm){
      var ms=mk(doc,left,"span","ja-jtl-marker",mm.emoji);
      ms.title=mm.label;
      if(mm.color){ms.style.setProperty("--ja-flag-col",mm.color);}
    }
  }
  var edit=btn(doc,head,"ja-jtl-edit","✎","Modifier l’entrée");
  edit.addEventListener("click",function(){self.openForm(title,fieldValue(t,"date",selectedDate(self)));});

  /* Les étiquettes suivent immédiatement l'entête : on voit d'un coup
     d'œil qui, où et quoi, avant même de lire. */
  var chips=mk(doc,card,"div","ja-jtl-chips"),
      GROUPS=[["places","📍"],["people","👤"],["activities","🏃"],
              ["projects","🧩"],["events","📅"],["todos","☑"],["habits","↻"],["media","🎞️"],["sleep","🌙"]];
  GROUPS.forEach(function(g){
    parseList(fieldValue(t,g[0],"")).forEach(function(x){
      mk(doc,chips,"span","ja-jtl-chip",g[1]+" "+x);
    });
  });
  if(!chips.childNodes.length){chips.remove();}

  /*
    Chaque galerie choisit son côté. On assemble donc quatre zones autour
    du texte, et à l'intérieur d'une zone les galeries se rangent selon
    le sens demandé — côte à côte, elles se partagent la largeur à parts
    égales.
  */
  var form=cfg.form||{},
      groups=[],byGroup=Object.create(null);
  gallery.forEach(function(item){
    var key=String(item.gallery||"");
    if(!byGroup[key]){byGroup[key]=[];groups.push(key);}
    byGroup[key].push(item);
  });

  var zones={above:[],left:[],right:[],below:[]};
  groups.forEach(function(key){
    var items=byGroup[key],
        first=items[0],
        pos=String(first.pos||form.mediaPos||"left");
    if(!zones[pos]){pos="left";}
    zones[pos].push({key:key,items:items});
  });

  var main=mk(doc,card,"div","ja-jtl-main");

  function buildZone(name){
    var list=zones[name];
    if(!list.length){return null;}
    var flow=String(list[0].items[0].flow||form.mediaFlow||"column"),
        wide=(name==="above"||name==="below"),
        host=mk(doc,doc.createDocumentFragment(),"div",
          "ja-jtl-media ja-zone-"+name+" ja-flow-"+(wide?flow:"column"));
    list.forEach(function(g){
      var layout=String(g.items[0].layout||form.galleryLayout||"slides"),
          block=mk(doc,host,"div","ja-gallery ja-gal-"+layout);
      if(g.key){mk(doc,block,"div","ja-gallery-name",g.key);}
      self.renderGallery(block,g.items,layout);
    });
    return host;
  }

  var above=buildZone("above"),
      left=buildZone("left"),
      right=buildZone("right"),
      below=buildZone("below");

  if(above){main.appendChild(above);}
  var middle=mk(doc,main,"div","ja-jtl-middle");
  if(left){middle.appendChild(left);}
  var content=mk(doc,middle,"div","ja-jtl-content");
  if(right){middle.appendChild(right);}
  if(below){main.appendChild(below);}
  if(!left&&!right){middle.classList.add("is-plain");}

  if(f.text){
    var noteBox=mk(doc,content,"div","ja-jtl-note"),
        raw=Agenda.normalizeNoteHtml(f.text,doc);
    if(raw){
      noteBox.innerHTML=raw;
      noteBox.addEventListener("click",function(ev){
        if(!toggleTask(ev)){return;}
        var current=self.wiki.getTiddler(title);
        if(current){
          self.wiki.addTiddler(new $tw.Tiddler(current,{text:noteBox.innerHTML},{modified:new Date()}));
        }
      });
    }
  }

  /* --- audio --- */
  var audios=Media.parseJsonList(f.audios);
  if(audios.length){
    var audioBox=mk(doc,content,"div","ja-jtl-audio");
    audios.forEach(function(ref){
      var srcUrl=Media.src(self.wiki,ref);
      if(!srcUrl){return;}
      var player=doc.createElement("audio");
      player.controls=true;player.preload="none";player.src=srcUrl;
      audioBox.appendChild(player);
    });
  }

  /* --- liens & embeds --- */
  var links=Media.parseJsonList(f.links);
  if(links.length){
    var linkBox=mk(doc,content,"div","ja-jtl-links");
    links.forEach(function(link){self.renderLink(linkBox,link);});
  }

  /* Les objets Agenda ne sont visibles dans le Journal QUE parce que cette
     Daily les référence. Ils restent sous la carte de la Daily, hors du rail
     de timeline, avec leur contenu complet et leurs contrôles rapides. */
  var linkedAgenda=[],seenAgenda=Object.create(null),dailyDate=fieldValue(t,"date",selectedDate(this));
  [["events","event"],["todos","todo"],["habits","habit"]].forEach(function(pair){
    parseList(fieldValue(t,pair[0],"")).forEach(function(ref){
      var key=pair[1]+"::"+ref;if(seenAgenda[key]){return;}seenAgenda[key]=true;
      var item=Agenda.itemFromTitleOnDate(self.wiki,ref,dailyDate);
      if(item){item.linked=true;linkedAgenda.push(item);}
    });
  });
  if(linkedAgenda.length){
    var linkedHost=mk(doc,stack,"section","ja-jtl-linked-agenda ja-agenda-root");
    linkedAgenda.sort(function(a,b){return String(a.startTime||a.reminderTime||"").localeCompare(String(b.startTime||b.reminderTime||""));});
    linkedAgenda.forEach(function(item){self.renderAgendaTimelineItem(linkedHost,item);});
  }

};

/*
  Quatre façons de poser une galerie :
    mosaïque  — colonnes, hauteurs naturelles, rien n'est rogné
    grille    — carrés alignés
    défilant  — une seule ligne, flèches et accroche au défilement
    vedette   — la première en grand, les autres en vignettes
*/
JournalWidget.prototype.renderGallery=function(parent,items,layout){
  var self=this,doc=this.document;

  if(layout==="slides"){
    var box=mk(doc,parent,"div","ja-gal-frame ja-slides"),
        pane=mk(doc,box,"div","ja-slides-pane"),
        index=0;
    var img=mk(doc,pane,"img","ja-gimg");
    img.loading="lazy";
    var cap=mk(doc,parent,"div","ja-gcap ja-slides-cap","");
    var dots=items.length>1?mk(doc,parent,"div","ja-slides-dots"):null,
        bullets=[];
    if(dots){
      items.forEach(function(_,i){
        var d=mk(doc,dots,"span","ja-slides-dot","");
        d.addEventListener("click",function(ev){ev.stopPropagation();go(i);});
        bullets.push(d);
      });
    }
    function go(i){
      index=(i+items.length)%items.length;
      var item=items[index];
      img.src=Media.src(self.wiki,item.src);
      img.alt=item.caption||"";
      img.className="ja-gimg ja-fit-"+(item.fit||"cover");
      pane.classList.toggle("is-contain",(item.fit||"cover")==="contain");
      cap.textContent=item.caption||"";
      cap.style.display=item.caption?"":"none";
      bullets.forEach(function(d,j){d.classList.toggle("is-on",j===index);});
    }
    if(items.length>1){
      var back=btn(doc,box,"ja-gal-arrow ja-gal-prev","‹","Image précédente"),
          fwd=btn(doc,box,"ja-gal-arrow ja-gal-next","›","Image suivante");
      back.addEventListener("click",function(ev){ev.stopPropagation();go(index-1);});
      fwd.addEventListener("click",function(ev){ev.stopPropagation();go(index+1);});
      var counter=mk(doc,box,"span","ja-slides-count","");
      var baseGo=go;
      go=function(i){baseGo(i);counter.textContent=(index+1)+"/"+items.length;};
    }
    pane.addEventListener("click",function(){self.openLightbox(items,index);});
    var x0=null;
    pane.addEventListener("touchstart",function(ev){x0=ev.touches[0].clientX;},{passive:true});
    pane.addEventListener("touchend",function(ev){
      if(x0===null){return;}
      var dx=ev.changedTouches[0].clientX-x0;
      if(Math.abs(dx)>40){go(index+(dx<0?1:-1));}
      x0=null;
    });
    go(0);
    return;
  }

  if(layout==="carousel"){
    var frame=mk(doc,parent,"div","ja-gal-frame"),
        strip=mk(doc,frame,"div","ja-gallery-strip");
    items.forEach(function(item,index){self.renderImage(strip,item,items,index);});
    if(items.length>1){
      var prev=btn(doc,frame,"ja-gal-arrow ja-gal-prev","‹","Précédent"),
          next=btn(doc,frame,"ja-gal-arrow ja-gal-next","›","Suivant");
      function slide(dir){
        strip.scrollBy({left:dir*Math.max(160,strip.clientWidth*0.8),behavior:"smooth"});
      }
      prev.addEventListener("click",function(ev){ev.stopPropagation();slide(-1);});
      next.addEventListener("click",function(ev){ev.stopPropagation();slide(1);});
      function sync(){
        prev.classList.toggle("is-off",strip.scrollLeft<4);
        next.classList.toggle("is-off",strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-4);
      }
      strip.addEventListener("scroll",sync);
      if(typeof requestAnimationFrame==="function"){requestAnimationFrame(sync);}
    }
    return;
  }

  if(layout==="hero"||layout==="heroslides"){
    var head=mk(doc,parent,"div","ja-gal-hero-main");
    self.renderImage(head,items[0],items,0);
    if(items.length>1){
      var restCls=layout==="heroslides"
        ? "ja-gallery-strip ja-gal-hero-rest ja-gal-hero-scroll"
        : "ja-gallery-strip ja-gal-hero-rest";
      var restWrap=layout==="heroslides"?mk(doc,parent,"div","ja-gal-frame"):parent,
          rest=mk(doc,restWrap,"div",restCls);
      items.slice(1).forEach(function(item,index){
        self.renderImage(rest,item,items,index+1);
      });
      if(layout==="heroslides"&&items.length>3){
        var back=btn(doc,restWrap,"ja-gal-arrow ja-gal-prev ja-gal-arrow-sm","‹","Précédent"),
            fwd=btn(doc,restWrap,"ja-gal-arrow ja-gal-next ja-gal-arrow-sm","›","Suivant");
        function nudge(dir){
          rest.scrollBy({left:dir*Math.max(140,rest.clientWidth*0.7),behavior:"smooth"});
        }
        back.addEventListener("click",function(ev){ev.stopPropagation();nudge(-1);});
        fwd.addEventListener("click",function(ev){ev.stopPropagation();nudge(1);});
        function sync(){
          back.classList.toggle("is-off",rest.scrollLeft<4);
          fwd.classList.toggle("is-off",rest.scrollLeft+rest.clientWidth>=rest.scrollWidth-4);
        }
        rest.addEventListener("scroll",sync);
        if(typeof requestAnimationFrame==="function"){requestAnimationFrame(sync);}
      }
    }
    return;
  }

  var strip2=mk(doc,parent,"div","ja-gallery-strip");
  items.forEach(function(item,index){self.renderImage(strip2,item,items,index);});
};

/* Une vignette de galerie. Le clic ouvre la visionneuse sur cette image. */
JournalWidget.prototype.renderImage=function(parent,item,siblings,index){
  var self=this,doc=this.document,src=Media.src(this.wiki,item.src);
  if(!src){return null;}
  var cell=mk(doc,parent,"figure","ja-gcell"+((item.fit||"cover")==="contain"?" is-contain":""));
  var img=mk(doc,cell,"img","ja-gimg ja-fit-"+(item.fit||"cover"));
  img.src=src;
  img.alt=item.caption||"";
  img.loading="lazy";
  if(item.caption){mk(doc,cell,"figcaption","ja-gcap",item.caption);}
  cell.addEventListener("click",function(){
    self.openLightbox(siblings||[item],index||0);
  });
  return cell;
};

/*
  Visionneuse : flèches, clavier, pastilles, légende sous l'image.
*/
JournalWidget.prototype.openLightbox=function(items,startIndex){
  var self=this,doc=this.document,
      list=(items||[]).filter(function(i){return Media.src(self.wiki,i.src);});
  if(!list.length){return;}
  var index=Math.max(0,Math.min(list.length-1,startIndex||0));

  var overlay=mk(doc,doc.body,"div","ja-lightbox"),
      stage=mk(doc,overlay,"div","ja-lightbox-stage"),
      img=mk(doc,stage,"img","ja-lightbox-img"),
      cap=mk(doc,overlay,"div","ja-lightbox-cap",""),
      close=btn(doc,overlay,"ja-lightbox-close","×","Fermer"),
      prev=btn(doc,overlay,"ja-lightbox-nav ja-lightbox-prev","‹","Image précédente"),
      next=btn(doc,overlay,"ja-lightbox-nav ja-lightbox-next","›","Image suivante"),
      dots=mk(doc,overlay,"div","ja-lightbox-dots"),
      counter=mk(doc,overlay,"div","ja-lightbox-count","");

  var bullets=list.map(function(_,i){
    var d=mk(doc,dots,"span","ja-lightbox-dot","");
    d.addEventListener("click",function(ev){ev.stopPropagation();go(i);});
    return d;
  });
  if(list.length<2){prev.remove();next.remove();dots.remove();}

  function go(i){
    index=(i+list.length)%list.length;
    var item=list[index];
    img.src=Media.src(self.wiki,item.src);
    img.alt=item.caption||"";
    cap.textContent=item.caption||"";
    cap.style.visibility=item.caption?"visible":"hidden";
    counter.textContent=list.length>1?(index+1)+" / "+list.length:"";
    bullets.forEach(function(d,j){d.classList.toggle("is-on",j===index);});
  }
  function dismiss(){
    overlay.remove();
    document.removeEventListener("keydown",onKey,true);
  }
  function onKey(ev){
    if(ev.key==="Escape"){dismiss();}
    if(ev.key==="ArrowRight"){go(index+1);}
    if(ev.key==="ArrowLeft"){go(index-1);}
  }
  document.addEventListener("keydown",onKey,true);
  close.addEventListener("click",dismiss);
  prev.addEventListener("click",function(ev){ev.stopPropagation();go(index-1);});
  next.addEventListener("click",function(ev){ev.stopPropagation();go(index+1);});
  overlay.addEventListener("click",function(ev){
    if(ev.target===overlay||ev.target===stage){dismiss();}
  });

  /* balayage tactile */
  var x0=null;
  stage.addEventListener("touchstart",function(ev){x0=ev.touches[0].clientX;},{passive:true});
  stage.addEventListener("touchend",function(ev){
    if(x0===null){return;}
    var dx=ev.changedTouches[0].clientX-x0;
    if(Math.abs(dx)>45){go(index+(dx<0?1:-1));}
    x0=null;
  });

  go(index);
};

/* Un lien : brut, embarqué, ou renvoi interne au wiki. */
JournalWidget.prototype.renderLink=function(parent,link){
  var doc=this.document,url=String(link.url||"");
  if(!url){return;}
  var kind=link.embed?Media.embedKind(this.wiki,link):(link.internal?"internal-link":"link");

  if(kind==="internal"){
    var box=mk(doc,parent,"div","ja-jtl-embed");
    try{box.innerHTML=this.wiki.renderText("text/html","text/vnd.tiddlywiki","{{"+url+"}}");}
    catch(e){box.textContent=url;}
    return;
  }
  if(kind==="internal-link"){
    var wrapL=mk(doc,parent,"div","ja-jtl-link");
    try{wrapL.innerHTML=this.wiki.renderText("text/html","text/vnd.tiddlywiki","[["+url+"]]");}
    catch(e){wrapL.textContent=url;}
    return;
  }
  if(kind==="image"){
    var im=mk(doc,parent,"img","ja-jtl-embed-img");
    im.src=Media.src(this.wiki,url);im.alt="";im.loading="lazy";
    return;
  }
  if(kind==="audio"){
    var au=doc.createElement("audio");
    au.controls=true;au.preload="none";au.src=url;
    parent.appendChild(au);
    return;
  }
  if(kind==="video"){
    var vi=doc.createElement("video");
    vi.controls=true;vi.preload="none";vi.src=url;vi.className="ja-jtl-embed-video";
    parent.appendChild(vi);
    return;
  }
  if(kind==="iframe"){
    var frameSrc=Media.iframeSrc(url);
    if(frameSrc){
      var frameWrap=mk(doc,parent,"div","ja-jtl-embed-frame");
      var frame=doc.createElement("iframe");
      frame.src=frameSrc;
      frame.setAttribute("allowfullscreen","allowfullscreen");
      frame.setAttribute("loading","lazy");
      frame.setAttribute("referrerpolicy","strict-origin-when-cross-origin");
      frameWrap.appendChild(frame);
      return;
    }
  }
  var a=mk(doc,parent,"a","ja-jtl-link",Media.labelOf(this.wiki,url));
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";
};

/* ------------------------------------------------------------------ */
/* Lieux & météo                                                       */
/* ------------------------------------------------------------------ */
function placeFromTiddler(w,title){
  var t=w.wiki.getTiddler(title),f=t?t.fields:{};
  return {value:title,label:title,source:"local",existing:!!t,address:String(f.address||""),
    latitude:f.latitude!=null?f.latitude:f.lat,
    longitude:f.longitude!=null?f.longitude:(f.lon!=null?f.lon:f.lng)};
}

JournalWidget.prototype.resolvePlaceCoordinates=async function(placeTitle){
  var t=this.wiki.getTiddler(placeTitle),f=t?t.fields:{},
      lat=parseFloat(f.latitude!=null?f.latitude:f.lat),
      lon=parseFloat(f.longitude!=null?f.longitude:(f.lon!=null?f.lon:f.lng));
  if(!isNaN(lat)&&!isNaN(lon)){return {lat:lat,lon:lon,label:placeTitle};}
  var query=String(f["weather-query"]||f.address||f.city||placeTitle||"").trim();
  if(!query){throw new Error("Ce lieu n’a pas d’adresse météo.");}
  var res=await fetch("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(query)+"&count=1&language=fr&format=json");
  if(!res.ok){throw new Error("Géocodage indisponible.");}
  var data=await res.json();
  if(!data.results||!data.results.length){throw new Error("Lieu introuvable. Ajoute latitude/longitude à sa fiche.");}
  var r=data.results[0];
  if(t){this.wiki.addTiddler(new $tw.Tiddler(t,{latitude:String(r.latitude),longitude:String(r.longitude)}));}
  return {lat:r.latitude,lon:r.longitude,label:r.name||placeTitle};
};

JournalWidget.prototype.fetchWeatherAt=async function(lat,lon,date,time){
  var today=todayISO(),delta=diffDays(date,today),url,
      params="latitude="+encodeURIComponent(lat)+"&longitude="+encodeURIComponent(lon)+"&hourly=temperature_2m,weather_code&timezone=auto";
  if(delta<0&&Math.abs(delta)<=5){
    url="https://api.open-meteo.com/v1/forecast?"+params+"&past_days="+Math.abs(delta)+"&forecast_days=1";
  }else if(delta<0){
    url="https://archive-api.open-meteo.com/v1/archive?"+params+"&start_date="+encodeURIComponent(date)+"&end_date="+encodeURIComponent(date);
  }else{
    url="https://api.open-meteo.com/v1/forecast?"+params+"&start_date="+encodeURIComponent(date)+"&end_date="+encodeURIComponent(date);
  }
  var res=await fetch(url);
  if(!res.ok){throw new Error("Météo indisponible pour cette date.");}
  var data=await res.json();
  if(data.error){throw new Error(data.reason||"Météo indisponible.");}
  var hit=closestHourly(data.hourly,date,time);
  if(!hit){throw new Error("Aucune donnée météo pour cette heure.");}
  var info=weatherInfo(hit.code);
  return {code:hit.code,emoji:info.emoji,label:info.label,temp:hit.temperature,lat:+lat,lon:+lon,source:"Open-Meteo"};
};

JournalWidget.prototype.fetchWeather=async function(placeTitle,date,time){
  var c=await this.resolvePlaceCoordinates(placeTitle);
  return this.fetchWeatherAt(c.lat,c.lon,date,time);
};

/* ------------------------------------------------------------------ */
/* Formulaire                                                          */
/* ------------------------------------------------------------------ */
JournalWidget.prototype.openForm=function(editTitle,defaultDate,seed){
  seed=seed||{};
  var self=this,doc=this.document,cfg=this.cfg,
      t=editTitle?this.wiki.getTiddler(editTitle):null;

  var state={
    date:fieldValue(t,"date",defaultDate||selectedDate(this)),
    time:fieldValue(t,"time",timeNow()),
    moodValue:fieldValue(t,"mood-value",""),
    _seed:!editTitle,
    moodEmoji:fieldValue(t,"mood-emoji",""),
    moodImage:fieldValue(t,"mood-image",""),
    moodId:fieldValue(t,"mood-id",""),
    moodNuance:fieldValue(t,"mood-nuance",""),
    energy:fieldValue(t,"energy",editTitle?"":((cfg.form&&cfg.form.energy)||"")),
    stress:fieldValue(t,"stress",editTitle?"":((cfg.form&&cfg.form.stress)||"")),
    regles:fieldValue(t,"regles","")==="yes",
    places:parseList(fieldValue(t,"places","")),
    people:parseList(fieldValue(t,"people","")),
    relationModes:RelationModes.parse(fieldValue(t,RelationModes.FIELD,"")),
    activities:parseList(fieldValue(t,"activities","")),
    projects:parseList(fieldValue(t,"projects","")),
    events:parseList(fieldValue(t,"events","")),
    todos:parseList(fieldValue(t,"todos","")),
    habits:parseList(fieldValue(t,"habits","")),
    media:parseList(fieldValue(t,"media","")),
    sleep:parseList(fieldValue(t,"sleep","")),
    marker:fieldValue(t,"marker",editTitle?"":((cfg.form&&cfg.form.marker)||"")),
    note:fieldValue(t,"text",""),
    images:normalizeImages(Media.parseJsonList(t&&t.fields.images)),

    audios:Media.parseJsonList(t&&t.fields.audios),
    links:Media.parseJsonList(t&&t.fields.links),
    weather:(t&&t.fields["weather-code"]!==undefined&&String(t.fields["weather-code"])!=="")?{
      code:t.fields["weather-code"],emoji:fieldValue(t,"weather-emoji",""),
      label:fieldValue(t,"weather-label",""),temp:fieldValue(t,"weather-temp","")
    }:null
  };

  if(!editTitle){
    ["places","people","activities","projects","events","todos","habits","media","sleep"].forEach(function(k){
      if(seed[k]&&seed[k].length){state[k]=Entities.uniqueStrings((state[k]||[]).concat(seed[k]));}
    });
    if(seed.time){state.time=String(seed.time);}
    if(seed.note){state.note=String(seed.note);}
  }

  var overlay=mk(doc,doc.body,"div","ja-jform-overlay"),
      modal=mk(doc,overlay,"div","ja-jform-modal");

  /* ---------- entête : titre à gauche, actions à droite ---------- */
  var head=mk(doc,modal,"div","ja-jform-head");
  mk(doc,head,"h2","ja-jform-title",editTitle?"Modifier l’entrée":"Nouvelle entrée");
  var headActions=mk(doc,head,"div","ja-jform-headactions");
  if(editTitle){
    var del=btn(doc,headActions,"ja-jform-danger","Supprimer");
    del.addEventListener("click",function(){
      if(!window.confirm("Supprimer définitivement cette entrée ?")){return;}
      self.wiki.deleteTiddler(editTitle);
      closeModal();
    });
  }
  var cancel=btn(doc,headActions,"ja-jform-secondary","Annuler");
  var save=btn(doc,headActions,"ja-jform-save",editTitle?"Enregistrer":"Ajouter");

  var body=mk(doc,modal,"div","ja-jform-body");

  var cleanups=[];
  function closeModal(){
    cleanups.forEach(function(fn){try{fn();}catch(e){}});
    document.removeEventListener("keydown",onKey,true);
    overlay.remove();
  }
  var dirty=false;
  function markDirty(){dirty=true;}
  function askClose(){
    if(dirty&&!window.confirm("Fermer sans enregistrer ? Les modifications seront perdues.")){return;}
    closeModal();
  }
  function onKey(ev){
    if(ev.key==="Escape"){askClose();return;}
    if(ev.key==="Enter"&&(ev.metaKey||ev.ctrlKey)){ev.preventDefault();save.click();}
  }
  document.addEventListener("keydown",onKey,true);
  cancel.addEventListener("click",askClose);
  overlay.addEventListener("mousedown",function(ev){if(ev.target===overlay){askClose();}});
  ["input","change"].forEach(function(ev){body.addEventListener(ev,markDirty);});
  body.addEventListener("click",function(ev){
    if(ev.target.closest("button")){markDirty();}
  });
  save.title="Ctrl + Entrée";

  /* ================= 1. date · heure · marqueurs ================= */
  var line1=mk(doc,body,"div","ja-jform-line1");
  var dateInput=mk(doc,line1,"input","ja-jform-input ja-jform-date");
  dateInput.type="date";dateInput.value=state.date;
  var timeInput=mk(doc,line1,"input","ja-jform-input ja-jform-time");
  timeInput.type="time";timeInput.value=state.time;
  var markerRow=mk(doc,line1,"div","ja-jmarkers");
  (cfg.markers||[]).forEach(function(m){
    var b=btn(doc,markerRow,"ja-jmarker","",m.label);
    if(m.image){
      var im=mk(doc,b,"img","ja-jmarker-img");
      im.src=JConfig.imageSrc(self.wiki,m.image);im.alt="";
    }else{
      mk(doc,b,"span","",m.emoji||"•");
    }
    if(m.color){b.style.setProperty("--ja-flag-col",m.color);}
    if(state.marker===m.id){b.classList.add("is-selected");}
    b.addEventListener("click",function(){
      state.marker=state.marker===m.id?"":m.id;
      Array.prototype.slice.call(markerRow.children).forEach(function(x){x.classList.remove("is-selected");});
      if(state.marker){b.classList.add("is-selected");}
    });
  });

  /* ================= 2. humeur ================= */
  var moodSec=mk(doc,body,"div","ja-jform-mood"),
      moodMain=mk(doc,moodSec,"div","ja-jmood-main"),
      nuances=mk(doc,moodSec,"div","ja-jmood-nuances");
  function faceInto(parent,item,cls){
    if(item.image){
      var im=mk(doc,parent,"img",cls+"-img");
      im.src=JConfig.imageSrc(self.wiki,item.image);im.alt="";
      return;
    }
    mk(doc,parent,"span",cls,item.emoji||"");
  }
  function renderMood(){
    moodMain.innerHTML="";nuances.innerHTML="";
    JConfig.principals(cfg).forEach(function(p){
      var b=btn(doc,moodMain,"ja-jmood-btn","");
      faceInto(b,p,"ja-jmood-emoji");
      mk(doc,b,"span","ja-jmood-name",p.label||"");
      if(state.moodId?state.moodId===p.id:(+state.moodValue===+p.value)){
        b.classList.add("is-selected");
        b.style.setProperty("--jmood",p.color||self.moodColor(p.value));
      }
      b.addEventListener("click",function(){
        state.moodId=p.id;state.moodNuance="";
        state.moodValue=String(p.value);state.moodEmoji=p.emoji||"";state.moodImage=p.image||"";
        renderMood();
      });
    });
    var chosen=JConfig.principals(cfg).filter(function(p){
      return state.moodId?state.moodId===p.id:(+state.moodValue===+p.value);
    })[0];
    if(chosen){
      (chosen.children||[]).forEach(function(n){
        var b=btn(doc,nuances,"ja-jnuance","");
        faceInto(b,n,"ja-jnuance-face");
        if(state.moodNuance?state.moodNuance===n.id:(state.moodEmoji===n.emoji)){b.classList.add("is-selected");}
        b.addEventListener("click",function(){
          state.moodNuance=n.id;
          state.moodValue=String(n.value!=null?n.value:chosen.value);
          state.moodEmoji=n.emoji||"";state.moodImage=n.image||"";
          renderMood();
        });
      });
    }
  }
  renderMood();

  /* ================= 3. règles · énergie · anxiété · lieu ================= */
  var metrics=mk(doc,body,"div","ja-jmetrics");

  var reglesCell=mk(doc,metrics,"div","ja-jmetric");
  mk(doc,reglesCell,"span","ja-jmetric-lab","Règles");
  var reglesBtn=btn(doc,reglesCell,"ja-jregles","🩸","Règles");
  if(state.regles){reglesBtn.classList.add("is-selected");}
  reglesBtn.addEventListener("click",function(){
    state.regles=!state.regles;
    reglesBtn.classList.toggle("is-selected",state.regles);
  });

  function makeScale(name,key,levels){
    var cell=mk(doc,metrics,"div","ja-jmetric ja-jmetric-scale"),
        top=mk(doc,cell,"div","ja-jmetric-top");
    mk(doc,top,"span","ja-jmetric-lab",name);
    var lab=mk(doc,top,"span","ja-jscale-value","—"),
        track=mk(doc,cell,"div","ja-jscale-track");
    function draw(){
      track.innerHTML="";
      var cur=state[key]===""?null:+state[key];
      for(var i=0;i<6;i++){
        (function(v){
          var lv=levels[v]||{label:"",bg:"var(--ja-accent)"},
              seg=btn(doc,track,"ja-jscale-seg","",lv.label);
          seg.style.height=(9+v*2.4)+"px";
          if(cur!==null&&v<=cur){seg.classList.add("is-on");seg.style.background=lv.bg;}
          seg.addEventListener("click",function(){
            state[key]=state[key]===String(v)?"":String(v);
            draw();
          });
        })(i);
      }
      if(cur!==null&&levels[cur]){
        lab.textContent=levels[cur].label;
        lab.style.color=levels[cur].bg;
      }else{
        lab.textContent="—";lab.style.color="";
      }
    }
    draw();
  }
  makeScale("Énergie","energy",cfg.energy);
  makeScale("Anxiété","stress",cfg.stress);

  /* --- lieu : une pastille sobre, la météo se fait toute seule --- */
  var placeCell=mk(doc,metrics,"div","ja-jmetric ja-jmetric-place");
  mk(doc,placeCell,"span","ja-jmetric-lab","Lieu");
  var placeChip=btn(doc,placeCell,"ja-jplace-btn","");
  var placeIco=mk(doc,placeChip,"span","ja-jplace-ico","📍"),
      placeTxt=mk(doc,placeChip,"span","ja-jplace-txt","");
  function drawPlace(){
    placeTxt.textContent=state.places.length?state.places[0]:"Ajouter";
    placeChip.classList.toggle("is-empty",!state.places.length);
    placeChip.title=state.places.length>1?state.places.join(" · "):"";
  }
  drawPlace();

  function setPlace(value,extra){
    if(!value){return;}
    var rest=state.places.filter(function(p){return Entities.normalize(p)!==Entities.normalize(value);});
    state.places=[value].concat(rest);
    if(extra){Entities.ensureEntity(self.wiki,"place",value,extra);}
    drawPlace();
    loadWeather();
  }

  async function useCurrentPosition(){
    if(!navigator.geolocation){window.alert("Ce navigateur ne donne pas la position.");return;}
    placeIco.textContent="◌";
    navigator.geolocation.getCurrentPosition(async function(pos){
      var lat=pos.coords.latitude,lon=pos.coords.longitude,label=null;
      try{
        var res=await fetch("https://photon.komoot.io/reverse?lat="+lat+"&lon="+lon+"&lang=fr");
        if(res.ok){
          var data=await res.json(),f=data.features&&data.features[0];
          if(f&&f.properties){
            var pr=f.properties;
            label=pr.name||pr.street||pr.city||pr.county||null;
            if(label&&pr.city&&pr.city!==label){label+=", "+pr.city;}
          }
        }
      }catch(e){}
      if(!label){label=lat.toFixed(3)+", "+lon.toFixed(3);}
      placeIco.textContent="📍";
      setPlace(label,{latitude:String(lat),longitude:String(lon)});
    },function(){
      placeIco.textContent="📍";
      window.alert("Position refusée ou indisponible.");
    },{enableHighAccuracy:false,timeout:9000,maximumAge:300000});
  }

  function openPlaceSearch(){
    var pop=mk(doc,doc.body,"div","ja-pop ja-pop-search"),
        rect=placeChip.getBoundingClientRect();
    pop.style.left=Math.max(8,Math.min(rect.left,doc.documentElement.clientWidth-260))+"px";
    pop.style.top=(rect.bottom+5)+"px";
    var field=mk(doc,pop,"input","ja-pop-input");
    field.type="text";field.placeholder="Adresse, ville, lieu…";
    var list=mk(doc,pop,"div","ja-pop-list");
    var timer=null;
    function close(){pop.remove();document.removeEventListener("mousedown",away,true);}
    function away(ev){if(!pop.contains(ev.target)){close();}}
    setTimeout(function(){document.addEventListener("mousedown",away,true);},0);
    cleanups.push(close);

    function render(items){
      list.innerHTML="";
      items.slice(0,8).forEach(function(s){
        var b=btn(doc,list,"ja-pop-item",s.label);
        b.addEventListener("click",function(){
          close();
          setPlace(s.value,{
            address:s.address||"",
            latitude:s.latitude!=null?s.latitude:"",
            longitude:s.longitude!=null?s.longitude:""
          });
        });
      });
    }
    function schedule(){
      var q=field.value.trim();
      clearTimeout(timer);
      var local=Entities.localSuggestions(self.wiki,"place",q);
      render(q?local.concat([{value:q,label:"＋ "+q,address:q}]):local);
      if(q.length<2){return;}
      timer=setTimeout(async function(){
        var remote=await Entities.fetchPlaceSuggestions(q);
        if(field.value.trim()!==q){return;}
        render(Entities.mergeSuggestions([local,remote]).concat([{value:q,label:"＋ "+q,address:q}]));
      },240);
    }
    field.addEventListener("input",schedule);
    field.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"){ev.preventDefault();if(field.value.trim()){close();setPlace(field.value.trim(),{address:field.value.trim()});}}
      if(ev.key==="Escape"){close();}
    });
    schedule();
    field.focus();
  }

  placeChip.addEventListener("click",function(){
    var items=[
      {label:"🧭  Ma position",run:useCurrentPosition},
      {label:"🔎  Chercher…",run:openPlaceSearch}
    ];
    if(state.places.length){
      items.push({sep:true});
      state.places.slice(1).forEach(function(p){
        items.push({label:"📍  "+p,run:function(){setPlace(p);}});
      });
      items.push({label:"✕  Retirer",run:function(){
        state.places=[];state.weather=null;drawPlace();
      }});
    }
    jaPopover(doc,placeChip,items,cleanups);
  });

  /* météo silencieuse : elle ne s'affiche que dans la timeline */
  var weatherTimer=null;
  function loadWeather(){
    clearTimeout(weatherTimer);
    weatherTimer=setTimeout(async function(){
      if(!state.places.length){state.weather=null;return;}
      try{
        state.weather=await self.fetchWeather(state.places[0],state.date,state.time);
        placeChip.classList.add("has-weather");
        placeChip.title=(state.weather.emoji||"")+" "+(state.weather.label||"")+
          (state.weather.temp!=null?" · "+Math.round(+state.weather.temp)+"°":"");
      }catch(e){
        state.weather=null;
        placeChip.classList.remove("has-weather");
      }
    },350);
  }
  dateInput.addEventListener("change",function(){state.date=dateInput.value;loadWeather();});
  timeInput.addEventListener("change",function(){state.time=timeInput.value;loadWeather();});
  if(state.places.length&&!state.weather){loadWeather();}

  /* ================= 4. note ================= */
  var editor=this.buildNoteEditor(body,state);

  /* ================= 5. extras ================= */
  var extras=mk(doc,body,"div","ja-jextras");
  var openFields={};

  function extraBlock(icon,title){
    var block=mk(doc,extras,"div","ja-jextra is-open"),
        header=mk(doc,block,"div","ja-jextra-head"),
        fold=btn(doc,header,"ja-jextra-fold","›","Replier");
    mk(doc,header,"span","ja-jextra-ico",icon);
    mk(doc,header,"span","ja-jextra-title",title);
    var kill=btn(doc,header,"ja-jextra-x","×","Retirer ce champ");
    var body=mk(doc,block,"div","ja-jextra-body");
    function toggle(){block.classList.toggle("is-open");}
    fold.addEventListener("click",toggle);
    header.addEventListener("click",function(ev){
      if(ev.target===kill||kill.contains(ev.target)){return;}
      if(ev.target===fold){return;}
      toggle();
    });
    return {block:block,body:body,kill:kill};
  }

  function linkedField(type,initial){
    var def=Entities.DEFINITIONS[type],
        shell=extraBlock(ICONS[type]||"•",def.label),
        block=shell.block,
        kill=shell.kill,
        field=mk(doc,shell.body,"div","ja-jtokenfield"),
        chips=mk(doc,field,"div","ja-jtoken-chips"),
        input=mk(doc,field,"input","ja-jtoken-search"),
        menu=mk(doc,field,"div","ja-jtoken-menu"),
        tokens=Entities.uniqueStrings(initial||[]),
        suggestions=[],active=-1;
    input.type="text";input.placeholder=def.placeholder;

    function has(v){var n=Entities.normalize(v);return tokens.some(function(x){return Entities.normalize(x)===n;});}
    function closeMenu(){menu.innerHTML="";menu.classList.remove("is-open");suggestions=[];active=-1;}
    function renderTokens(){
      chips.innerHTML="";
      tokens.forEach(function(value,index){
        if(type==="person"){
          RelationModes.renderPerson(doc,chips,value,state.relationModes,function(){
            tokens.splice(index,1);
            renderTokens();
          });
          return;
        }
        var chip=mk(doc,chips,"span","ja-jtoken-chip");
        mk(doc,chip,"span","ja-jtoken-label",value);
        var x=btn(doc,chip,"ja-jtoken-x","×","Retirer");
        x.addEventListener("click",function(){tokens.splice(index,1);renderTokens();});
      });
    }
    function add(value){
      value=String(value||"").trim();
      if(!value||has(value)){input.value="";closeMenu();return;}
      tokens.push(value);input.value="";renderTokens();closeMenu();input.focus();
    }
    function renderMenu(){
      var q=input.value.trim(),
          items=Entities.localSuggestions(self.wiki,type,q).filter(function(x){return !has(x.value);});
      if(q&&!items.some(function(x){return Entities.normalize(x.value)===Entities.normalize(q);})&&!has(q)){
        items.push({value:q,label:"＋ "+q});
      }
      suggestions=items.slice(0,10);active=-1;menu.innerHTML="";
      suggestions.forEach(function(item,index){
        var b=btn(doc,menu,"ja-jtoken-suggestion",item.label);
        b.addEventListener("mousedown",function(ev){ev.preventDefault();});
        b.addEventListener("click",function(){add(item.value);});
      });
      menu.classList.toggle("is-open",suggestions.length>0);
    }
    function setActive(next){
      var buttons=menu.querySelectorAll(".ja-jtoken-suggestion"),n=buttons.length;
      if(!n){active=-1;return;}
      active=(next+n)%n;
      Array.prototype.forEach.call(buttons,function(b,i){b.classList.toggle("is-active",i===active);});
      buttons[active].scrollIntoView({block:"nearest"});
    }
    input.addEventListener("focus",renderMenu);
    input.addEventListener("input",renderMenu);
    input.addEventListener("keydown",function(ev){
      if(ev.key==="ArrowDown"){ev.preventDefault();setActive(active+1);return;}
      if(ev.key==="ArrowUp"){ev.preventDefault();setActive(active<0?suggestions.length-1:active-1);return;}
      if(ev.key==="Escape"){closeMenu();return;}
      if(ev.key==="Enter"){ev.preventDefault();if(active>=0&&suggestions[active]){add(suggestions[active].value);}else{add(input.value);}return;}
      if(ev.key===","||ev.key===";"){ev.preventDefault();add(input.value);return;}
      if(ev.key==="Backspace"&&!input.value&&tokens.length){var gone=tokens.pop();if(type==="person"){RelationModes.remove(state.relationModes,gone);}renderTokens();}
    });
    var away=function(ev){if(!field.contains(ev.target)){closeMenu();}};
    document.addEventListener("mousedown",away,true);
    cleanups.push(function(){document.removeEventListener("mousedown",away,true);});

    kill.addEventListener("click",function(){
      tokens.length=0;if(type==="person"){state.relationModes=RelationModes.empty();}block.remove();delete openFields[type];
    });
    renderTokens();
    return {values:function(){if(input.value.trim()){add(input.value);}return tokens.slice();}};
  }

  function mediaBlock(kind){
    var titles={images:["🖼️","Images"],audios:["🎙️","Audio"],links:["🔗","Liens"]},
        shell=extraBlock(titles[kind][0],titles[kind][1]);
    if(kind==="images"){self.buildImagesField(shell.body,state);}
    if(kind==="audios"){self.buildAudioField(shell.body,state);}
    if(kind==="links"){self.buildLinksField(shell.body,state);}
    shell.kill.addEventListener("click",function(){
      state[kind]=[];shell.block.remove();delete openFields[kind];
    });
  }

  var fieldApi={};
  function openField(key){
    if(openFields[key]){return;}
    openFields[key]=true;
    if(key==="images"||key==="audios"||key==="links"){mediaBlock(key);return;}
    fieldApi[key]=linkedField(key,state[Entities.DEFINITIONS[key].field]);
  }

  /* réglages par défaut : humeur, lieu repris, champs dépliés */
  if(state._seed){
    var seedForm=cfg.form||{};
    if(seedForm.mood&&!state.moodId){
      var seedMood=JConfig.principals(cfg).filter(function(p){return p.id===seedForm.mood;})[0];
      if(seedMood){
        state.moodId=seedMood.id;
        state.moodValue=String(seedMood.value);
        state.moodEmoji=seedMood.emoji||"";
        state.moodImage=seedMood.image||"";
        renderMood();
      }
    }
    if(seedForm.reusePlace&&!state.places.length){
      var recent=null;
      self.wiki.each(function(tid){
        var g=tid.fields;
        if(!g||String(g.kind||"")!=="Daily"||!g.places){return;}
        var stamp=String(g.date||"")+" "+String(g.time||"");
        if(!recent||stamp>recent.stamp){recent={stamp:stamp,places:g.places};}
      });
      if(recent){
        var firstPlace=parseList(recent.places)[0];
        if(firstPlace){state.places=[firstPlace];drawPlace();loadWeather();}
      }
    }
  }

  /* champs déjà remplis : on les ouvre d'office */
  ["person","activity","project","event","todo","habit","media","sleep"].forEach(function(type){
    var f=Entities.DEFINITIONS[type].field;
    if(state[f]&&state[f].length){openField(type);}
  });
  ["images","audios","links"].forEach(function(k){
    if(state[k]&&state[k].length){openField(k);}
  });
  if(state._seed){
    ((cfg.form&&cfg.form.openFields)||[]).forEach(function(k){openField(k);});
  }

  /* ---------- le bouton + ---------- */
  var fab=btn(doc,modal,"ja-jfab","＋","Ajouter un champ");
  fab.addEventListener("click",function(){
    var items=[];
    [["person","👤","Relations"],["activity","🏃","Activités"],["project","🧩","Projets"],
     ["event","📅","Événements"],["todo","☑","To-dos"],["habit","↻","Habitudes"],["media","🎞️","Média"],["sleep","🌙","Sommeil"]].forEach(function(row){
      if(openFields[row[0]]){return;}
      items.push({label:row[1]+"  "+row[2],run:function(){openField(row[0]);}});
    });
    var mediaItems=[["images","🖼️","Images"],["audios","🎙️","Audio"],["links","🔗","Liens"]]
      .filter(function(row){return !openFields[row[0]];});
    if(items.length&&mediaItems.length){items.push({sep:true});}
    mediaItems.forEach(function(row){
      items.push({label:row[1]+"  "+row[2],run:function(){openField(row[0]);}});
    });
    if(!items.length){items.push({label:"Tout est déjà là.",run:function(){}});}
    jaPopover(doc,fab,items,cleanups,"up");
  });

  /* ================= enregistrement ================= */
  save.addEventListener("click",function(){
    state.date=dateInput.value||state.date;
    state.time=timeInput.value||state.time;
    state.note=editor.value();
    ["person","activity","project","event","todo","habit","media","sleep"].forEach(function(type){
      var f=Entities.DEFINITIONS[type].field;
      if(fieldApi[type]){state[f]=fieldApi[type].values();}
    });

    function ensureAll(values,type){
      Entities.uniqueStrings(values||[]).forEach(function(title){Entities.ensureEntity(self.wiki,type,title);});
    }
    ensureAll(state.people,"person");
    ensureAll(state.activities,"activity");
    ensureAll(state.projects,"project");
    ensureAll(state.events,"event");
    ensureAll(state.todos,"todo");
    /* Une habitude créée directement depuis une Daily reçoit immédiatement
       un vrai rythme quotidien ; elle n'existe jamais comme pseudo-habitude
       ponctuelle en attente d'un futur passage dans le formulaire Agenda. */
    Entities.uniqueStrings(state.habits||[]).forEach(function(title){
      if(!self.wiki.getTiddler(title)){Entities.ensureEntity(self.wiki,"habit",title,{"start-date":state.date,"show-on-calendar":"no","habit-schedule":JSON.stringify({version:1,mode:"daily",start:state.date,end:"",interval:1,target:1,weekdays:[],dayOfMonth:+state.date.slice(8,10)||1,time:"",maxOccurrences:null})});}
      else{Entities.ensureEntity(self.wiki,"habit",title);}
    });
    ensureAll(state.media,"media");
    ensureAll(state.sleep,"sleep");
    state.places.forEach(function(p,index){
      var extra={};
      if(index===0&&state.weather){
        if(state.weather.lat!=null){extra.latitude=state.weather.lat;}
        if(state.weather.lon!=null){extra.longitude=state.weather.lon;}
      }
      Entities.ensureEntity(self.wiki,"place",p,extra);
    });

    var old=editTitle?self.wiki.getTiddler(editTitle):null,
        oldHabitLinks=old?Agenda.parseList(old.fields.habits||""):[],
        title=editTitle||("Daily — "+state.date+" "+state.time.replace(":","-")+" — "+Date.now()),
        fields={
          title:title,tags:["Journal"],kind:"Daily",
          date:state.date,time:state.time,text:state.note,
          "mood-value":state.moodValue,"mood-emoji":state.moodEmoji,
          "mood-image":state.moodImage,"mood-id":state.moodId,"mood-nuance":state.moodNuance,
          energy:state.energy,stress:state.stress,
          regles:state.regles?"yes":"",
          places:state.places.length?$tw.utils.stringifyList(state.places):"",
          people:makeList(state.people),"relation-modes":RelationModes.stringify(state.relationModes,state.people),activities:makeList(state.activities),
          projects:makeList(state.projects),events:makeList(state.events),todos:makeList(state.todos),
          habits:makeList(state.habits),media:makeList(state.media),sleep:makeList(state.sleep),
          marker:state.marker,
          images:Media.stringifyJsonList(state.images),

          audios:Media.stringifyJsonList(state.audios),
          links:Media.stringifyJsonList(state.links.filter(function(l){return l.url&&String(l.url).trim();}))
        };
    if(state.weather){
      fields["weather-code"]=String(state.weather.code);
      fields["weather-emoji"]=state.weather.emoji||"";
      fields["weather-label"]=state.weather.label||"";
      fields["weather-temp"]=state.weather.temp!=null?String(state.weather.temp):"";
      fields["weather-source"]="Open-Meteo";
    }else{
      ["weather-code","weather-emoji","weather-label","weather-temp","weather-source"].forEach(function(k){fields[k]="";});
    }
    var now=new Date();
    self.wiki.addTiddler(old?new $tw.Tiddler(old,fields,{modified:now})
                            :new $tw.Tiddler(fields,{created:now,modified:now}));
    /* Lier une habitude à une Daily est une réalisation réelle. La source
       Daily est identifiée, donc ré-enregistrer la même entrée ne recompte
       jamais deux fois et retirer le lien retire uniquement cette preuve. */
    Agenda.syncDailyHabitCompletions(self.wiki,title,state.date,oldHabitLinks,state.habits);
    setSelectedDate(self,state.date);
    closeModal();
  });
};

/* ------------------------------------------------------------------ */
/* Éditeur de note                                                     */
/* ------------------------------------------------------------------ */
/* Normalisation centralisée dans agenda.js. */

/* Remonte jusqu'à la balise demandée depuis la sélection courante. */
function closestTag(sel,tag){
  if(!sel||!sel.anchorNode){return null;}
  var node=sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentNode;
  while(node&&node.nodeName!==tag){
    if(node.classList&&node.classList.contains("ja-note-area")){return null;}
    node=node.parentNode;
  }
  return node&&node.nodeName===tag?node:null;
}

/* Coche/décoche si le clic tombe dans la gouttière de puce d'une tâche. */
function toggleTask(ev){
  var li=ev.target.closest?ev.target.closest(".ja-tasklist > li"):null;
  if(!li){return false;}
  var rect=li.getBoundingClientRect(),
      styles=(li.ownerDocument.defaultView||window).getComputedStyle(li),
      gutter=parseFloat(styles.paddingLeft)||24;
  if(ev.clientX<rect.left-4||ev.clientX>rect.left+gutter){return false;}
  li.setAttribute("data-done",li.getAttribute("data-done")==="1"?"0":"1");
  return true;
}

JournalWidget.prototype.buildNoteEditor=function(parent,state){
  var doc=this.document,
      wrap=mk(doc,parent,"div","ja-note"),
      bar=mk(doc,wrap,"div","ja-note-bar"),
      area=mk(doc,wrap,"div","ja-note-area");
  area.contentEditable="true";
  area.setAttribute("role","textbox");
  area.setAttribute("aria-label","Note");
  area.dataset.placeholder="Qu’est-ce qui se passe ?";

  area.innerHTML=Agenda.normalizeNoteHtml(state.note,doc);

  function exec(cmd,value){
    area.focus();
    try{doc.execCommand(cmd,false,value||null);}catch(e){}
    sync();
  }
  function sync(){
    Array.prototype.forEach.call(bar.querySelectorAll("[data-cmd]"),function(b){
      var c=b.getAttribute("data-cmd");
      var on=false;
      try{on=doc.queryCommandState(c);}catch(e){}
      b.classList.toggle("is-on",!!on);
    });
    wrap.classList.toggle("is-empty",!area.textContent.trim()&&!area.querySelector("img,hr,li"));
  }

  function tool(label,cmd,title,cls){
    var b=btn(doc,bar,"ja-note-btn"+(cls?" "+cls:""),label,title);
    if(cmd){b.setAttribute("data-cmd",cmd);}
    b.addEventListener("mousedown",function(ev){ev.preventDefault();});
    return b;
  }

  tool("B","bold","Gras","is-bold").addEventListener("click",function(){exec("bold");});
  tool("I","italic","Italique","is-italic").addEventListener("click",function(){exec("italic");});
  tool("S","strikeThrough","Barré","is-strike").addEventListener("click",function(){exec("strikeThrough");});
  tool("U","underline","Souligné","is-under").addEventListener("click",function(){exec("underline");});
  mk(doc,bar,"span","ja-note-sep","");
  tool("H","","Titre").addEventListener("click",function(){
    exec("formatBlock", doc.queryCommandValue("formatBlock")==="h3" ? "div" : "h3");
  });
  tool("❝","","Citation").addEventListener("click",function(){exec("formatBlock","blockquote");});
  tool("‹›","","Code").addEventListener("click",function(){
    var sel=doc.getSelection();
    if(sel&&String(sel)){
      exec("insertHTML","<code>"+String(sel).replace(/</g,"&lt;")+"</code>");
    }
  });
  mk(doc,bar,"span","ja-note-sep","");
  tool("•","insertUnorderedList","Liste").addEventListener("click",function(){exec("insertUnorderedList");});
  tool("1.","insertOrderedList","Liste numérotée").addEventListener("click",function(){exec("insertOrderedList");});
  tool("☑","","Case à cocher").addEventListener("click",function(){
    area.focus();
    try{doc.execCommand("insertUnorderedList",false,null);}catch(e){}
    var list=closestTag(doc.getSelection(),"UL");
    if(list){list.classList.toggle("ja-tasklist",!list.classList.contains("ja-tasklist"));}
    sync();
  });
  mk(doc,bar,"span","ja-note-sep","");
  tool("—","","Séparateur").addEventListener("click",function(){exec("insertHorizontalRule");});
  tool("🔗","","Lien").addEventListener("click",function(){
    var url=window.prompt("Adresse du lien");
    if(url){exec("createLink",url);}
  });

  var colorWrap=mk(doc,bar,"label","ja-note-color");
  mk(doc,colorWrap,"span","","A");
  var color=mk(doc,colorWrap,"input","");
  color.type="color";color.value="#c58bd8";
  color.addEventListener("input",function(){exec("foreColor",color.value);});

  var clear=tool("⌫","","Effacer la mise en forme");
  clear.addEventListener("click",function(){exec("removeFormat");});

  /* la puce d'une tâche fait office de case : on clique à gauche du texte */
  area.addEventListener("click",function(ev){toggleTask(ev);});
  area.addEventListener("input",sync);
  area.addEventListener("keyup",sync);
  area.addEventListener("mouseup",sync);


  sync();
  return {
    value:function(){
      var html=area.innerHTML.trim();
      if(!html||html==="<br>"||(!area.textContent.trim()&&!area.querySelector("img,hr,li"))){return "";}
      return html;
    }
  };
};

/* ------------------------------------------------------------------ */
/* Champs médias du formulaire                                         */
/* ------------------------------------------------------------------ */

/* Petit utilitaire commun : bouton d'import de fichier caché. */
JournalWidget.prototype.fileButton=function(parent,label,accept,kind,onDone){
  var self=this,doc=this.document,
      hidden=mk(doc,parent,"input","ja-jmedia-file");
  hidden.type="file";hidden.accept=accept;hidden.multiple=true;hidden.style.display="none";
  var b=btn(doc,parent,"ja-jmedia-btn",label);
  b.addEventListener("click",function(){hidden.click();});
  hidden.addEventListener("change",async function(){
    var files=Array.prototype.slice.call(hidden.files||[]);
    hidden.value="";
    for(var i=0;i<files.length;i++){
      try{ onDone(await Media.importFile(self.wiki,files[i],kind)); }
      catch(e){ window.alert(e&&e.message?e.message:"Import impossible."); }
    }
  });
  return b;
};

JournalWidget.prototype.buildImagesField=function(parent,state){
  var self=this,doc=this.document,
      wrap=mk(doc,parent,"div","ja-jmedia-block");
  state.images=normalizeImages(state.images);

  /* Les galeries existent en propre : on peut en ouvrir une vide. */
  if(!state.galleryNames){
    var seen=[];
    state.images.forEach(function(i){
      if(i.back){return;}
      var key=String(i.gallery||"");
      if(seen.indexOf(key)===-1){seen.push(key);}
    });
    if(!seen.length){seen.push("");}
    state.galleryNames=seen;
  }

  var backHost=mk(doc,wrap,"div","ja-backzone"),
      galleryHost=mk(doc,wrap,"div","ja-galzone"),
      actions=mk(doc,wrap,"div","ja-jmedia-actions");

  /* ---------- ajout d'images ---------- */
  var formDefaults=(self.cfg&&self.cfg.form)||{};
  function addTo(galleryName,ref){
    if(!ref){return;}
    var siblings=state.images.filter(function(i){
          return !i.back&&String(i.gallery||"")===galleryName;
        }),
        ref0=siblings[0]||{},
        item=normalizeImage({
          src:ref,
          gallery:galleryName,
          fit:formDefaults.imageFit||"cover",
          layout:ref0.layout||formDefaults.galleryLayout||"slides",
          pos:ref0.pos||formDefaults.mediaPos||"left",
          flow:ref0.flow||formDefaults.mediaFlow||"column"
        });
    state.images.push(item);
    draw();
  }
  function pickInto(anchor,galleryName,asBack){
    var items=[
      {label:"📁  Importer…",run:function(){
        self.pickFiles("image/*",true,async function(file){
          var ref=await Media.importFile(self.wiki,file,"image");
          if(asBack){setBack(ref);}else{addTo(galleryName,ref);}
        });
      }},
      {label:"🖼️  Du wiki",run:function(){
        Media.openWikiImagePicker(doc,self.wiki,anchor,function(title){
          if(asBack){setBack(title);}else{addTo(galleryName,title);}
        });
      }},
      {label:"🔗  Adresse externe",run:function(){
        var uri=window.prompt("Adresse de l’image (https://…)");
        if(!uri){return;}
        try{
          var ref=Media.linkExternal(self.wiki,uri,"",Media.typeOf(self.wiki,uri)||"image/png");
          if(asBack){setBack(ref);}else{addTo(galleryName,ref);}
        }catch(e){window.alert(e&&e.message?e.message:"Adresse invalide.");}
      }}
    ];
    jaPopover(doc,anchor,items);
  }
  function setBack(ref){
    var existing=state.images.filter(function(i){return i.back;})[0];
    if(existing){existing.src=ref;return draw();}
    var seed={src:ref,back:true};
    Object.keys(formDefaults.backdrop||{}).forEach(function(k){seed[k]=formDefaults.backdrop[k];});
    state.images.push(normalizeImage(seed));
    draw();
  }

  /* ---------- le fond : bande large, aperçu vivant ---------- */
  function drawBack(){
    backHost.innerHTML="";
    var item=state.images.filter(function(i){return i.back;})[0];

    var head=mk(doc,backHost,"div","ja-backhead");
    mk(doc,head,"span","ja-backhead-title","Fond de l’entrée");
    if(item){
      var swap=btn(doc,head,"ja-jmedia-btn ja-btn-xs","Remplacer");
      swap.addEventListener("click",function(){pickInto(swap,"",true);});
      var drop=btn(doc,head,"ja-jmedia-btn ja-btn-xs","Retirer");
      drop.addEventListener("click",function(){
        state.images=state.images.filter(function(i){return !i.back;});
        draw();
      });
    }else{
      var addBack=btn(doc,head,"ja-jmedia-btn ja-btn-xs","＋ Choisir une image");
      addBack.addEventListener("click",function(){pickInto(addBack,"",true);});
      mk(doc,backHost,"div","ja-jmedia-empty","Aucun fond.");
      return;
    }

    var preview=mk(doc,backHost,"div","ja-backpreview");
    var layer=mk(doc,preview,"div","ja-backpreview-img");
    mk(doc,preview,"div","ja-backpreview-text","Aperçu du rendu · le texte de l’entrée passera ici.");
    function repaint(){backdropVars(self.wiki,layer,item);}
    repaint();

    var opts=mk(doc,backHost,"div","ja-backopts");
    function row(label){
      var r=mk(doc,opts,"div","ja-imgset-row");
      mk(doc,r,"span","ja-imgset-lab",label);
      return mk(doc,r,"div","ja-imgset-ctl");
    }
    function seg(host,options,get,set){
      options.forEach(function(pair){
        var b=btn(doc,host,"ja-seg-sm"+(get()===pair[0]?" is-on":""),pair[1]);
        b.addEventListener("click",function(){
          set(pair[0]);
          Array.prototype.slice.call(host.children).forEach(function(x){x.classList.remove("is-on");});
          b.classList.add("is-on");
          repaint();
          if(pair[0]==="color"||pair[0]==="transparent"){drawBack();}
        });
      });
    }
    function slider(label,min,max,get,set,suffix){
      var ctl=row(label),
          input=mk(doc,ctl,"input","ja-imgset-range"),
          out=mk(doc,ctl,"span","ja-imgset-val",get()+(suffix||""));
      input.type="range";input.min=String(min);input.max=String(max);input.value=String(get());
      input.addEventListener("input",function(){
        set(parseInt(input.value,10));
        out.textContent=input.value+(suffix||"");
        repaint();
      });
    }

    seg(row("Cadrage"),[["cover","Remplir"],["contain","Entier"],["fill","Étirer"]],
        function(){return item.fit;},function(v){item.fit=v;});
    slider("Position ↔",0,100,function(){return item.posX;},function(v){item.posX=v;},"%");
    slider("Position ↕",0,100,function(){return item.posY;},function(v){item.posY=v;},"%");
    slider("Opacité",5,100,function(){return item.opacity;},function(v){item.opacity=v;},"%");

    /* rose des directions, diagonales comprises */
    var dirCtl=row("Fondu vers");
    var rose=mk(doc,dirCtl,"div","ja-fade-rose");
    FADE_LABELS.forEach(function(pair){
      var b=btn(doc,rose,"ja-fade-dir"+(item.fadeDir===pair[0]?" is-on":""),pair[1]);
      b.title=pair[0]==="none"?"Aucun fondu":"Fondu vers "+pair[1];
      b.addEventListener("click",function(){
        item.fadeDir=pair[0];
        Array.prototype.slice.call(rose.children).forEach(function(x){x.classList.remove("is-on");});
        b.classList.add("is-on");
        repaint();
      });
    });

    seg(row("Fondu"),[["transparent","Transparence"],["color","Couleur"]],
        function(){return item.fadeMode;},function(v){item.fadeMode=v;});

    if(item.fadeMode==="color"){
      var colCtl=row("Couleur"),
          col=mk(doc,colCtl,"input","ja-mini-color");
      col.type="color";col.value=item.fadeColor||"#14161d";
      col.addEventListener("input",function(){item.fadeColor=col.value;repaint();});
    }
    slider("Début",0,99,function(){return item.fadeStart;},function(v){item.fadeStart=v;},"%");
    slider("Fin",1,100,function(){return item.fadeEnd;},function(v){item.fadeEnd=v;},"%");
  }

  /* ---------- une galerie ---------- */
  function drawGallery(name,gIndex){
    var box=mk(doc,galleryHost,"div","ja-galbox"),
        head=mk(doc,box,"div","ja-galhead"),
        title=mk(doc,head,"input","ja-galname");
    title.type="text";
    title.placeholder="Galerie sans nom";
    title.value=name;
    title.addEventListener("change",function(){
      var next=title.value.trim();
      state.images.forEach(function(i){
        if(!i.back&&String(i.gallery||"")===name){i.gallery=next;}
      });
      state.galleryNames[gIndex]=next;
      draw();
    });

    var addBtn=btn(doc,head,"ja-jmedia-btn ja-btn-xs","＋ Image");
    addBtn.addEventListener("click",function(){pickInto(addBtn,name,false);});
    if(state.galleryNames.length>1){
      var killGal=btn(doc,head,"ja-galkill","×","Supprimer cette galerie");
      killGal.addEventListener("click",function(){
        state.images=state.images.filter(function(i){
          return i.back||String(i.gallery||"")!==name;
        });
        state.galleryNames.splice(gIndex,1);
        draw();
      });
    }

    /* disposition, côté et sens : tout vaut pour la galerie entière */
    var mine0=state.images.filter(function(i){return !i.back&&String(i.gallery||"")===name;}),
        first=mine0[0]||{},
        layout=String(first.layout||formDefaults.galleryLayout||"slides"),
        pos=String(first.pos||formDefaults.mediaPos||"left"),
        flow=String(first.flow||formDefaults.mediaFlow||"column");

    function applyAll(key,value){
      state.images.forEach(function(i){
        if(!i.back&&String(i.gallery||"")===name){i[key]=value;}
      });
    }
    function segLine(label,options,current,key,redrawAll){
      var line=mk(doc,box,"div","ja-galopt");
      mk(doc,line,"span","ja-imgset-lab",label);
      var ctl=mk(doc,line,"div","ja-imgset-ctl");
      options.forEach(function(pair){
        var b=btn(doc,ctl,"ja-seg-sm"+(current===pair[0]?" is-on":""),pair[1]);
        b.addEventListener("click",function(){
          applyAll(key,pair[0]);
          if(redrawAll){draw();return;}
          Array.prototype.slice.call(ctl.children).forEach(function(x){x.classList.remove("is-on");});
          b.classList.add("is-on");
        });
      });
      return line;
    }

    segLine("Disposition",GALLERY_LAYOUTS,layout,"layout");
    segLine("Placement",[["left","← Gauche"],["right","Droite →"],["above","↑ Dessus"],["below","↓ Dessous"]],
            pos,"pos",true);

    /* le sens n'a de sens qu'entre galeries qui partagent le même côté */
    var neighbours=[];
    state.galleryNames.forEach(function(other){
      if(other===name){return;}
      var g=state.images.filter(function(i){return !i.back&&String(i.gallery||"")===other;})[0];
      if(g&&String(g.pos||formDefaults.mediaPos||"left")===pos){neighbours.push(other);}
    });
    if(neighbours.length&&(pos==="above"||pos==="below")){
      segLine("Entre elles",[["column","L’une sous l’autre"],["row","Côte à côte"]],flow,"flow",true);
    }

    var strip=mk(doc,box,"div","ja-imglist"),
        mine=state.images.filter(function(i){return !i.back&&String(i.gallery||"")===name;});
    if(!mine.length){
      var empty=mk(doc,strip,"div","ja-galdrop","Dépose des images ici");
      wireDrop(empty,name);
      return;
    }
    mine.forEach(function(item){
      var index=state.images.indexOf(item),
          cell=mk(doc,strip,"div","ja-imgcell"),
          thumb=mk(doc,cell,"div","ja-imgthumb"),
          src=Media.src(self.wiki,item.src);
      if(src){
        var im=mk(doc,thumb,"img","");
        im.src=src;im.alt="";
        im.style.objectFit=item.fit==="contain"?"contain":(item.fit==="fill"?"fill":"cover");
      }else{
        mk(doc,thumb,"span","ja-jmedia-broken","?");
      }

      var tools=mk(doc,thumb,"div","ja-imgtools");
      var toBack=btn(doc,tools,"ja-imgtool","▣","Utiliser comme fond");
      toBack.addEventListener("click",function(){
        state.images.forEach(function(o){o.back=false;});
        item.back=true;item.gallery="";
        draw();
      });
      var left=btn(doc,tools,"ja-imgtool","‹","Reculer");
      left.addEventListener("click",function(){
        var prev=state.images.lastIndexOf(mine[mine.indexOf(item)-1]);
        if(mine.indexOf(item)===0){return;}
        state.images.splice(prev,0,state.images.splice(index,1)[0]);
        draw();
      });
      var right=btn(doc,tools,"ja-imgtool","›","Avancer");
      right.addEventListener("click",function(){
        if(mine.indexOf(item)===mine.length-1){return;}
        var nextItem=mine[mine.indexOf(item)+1],
            at=state.images.indexOf(nextItem);
        state.images.splice(at,0,state.images.splice(index,1)[0]);
        draw();
      });
      var rm=btn(doc,tools,"ja-imgtool ja-imgtool-danger","×","Retirer");
      rm.addEventListener("click",function(){state.images.splice(index,1);draw();});

      var capRow=mk(doc,cell,"div","ja-imgcap"),
          capBtn=btn(doc,capRow,"ja-imgcap-add","＋ légende","Ajouter une légende"),
          capInput=mk(doc,capRow,"input","ja-imgcap-input");
      capInput.type="text";capInput.placeholder="Légende…";capInput.value=item.caption||"";
      capInput.addEventListener("input",function(){item.caption=capInput.value;});
      function showCaption(on){
        capBtn.style.display=on?"none":"";
        capInput.style.display=on?"":"none";
      }
      showCaption(!!item.caption);
      capBtn.addEventListener("click",function(){showCaption(true);capInput.focus();});
      capInput.addEventListener("blur",function(){
        if(!capInput.value.trim()){item.caption="";showCaption(false);}
      });

      var fitRow=mk(doc,cell,"div","ja-imgset-ctl");
      [["cover","Remplir"],["contain","Entier"],["fill","Étirer"]].forEach(function(pair){
        var b=btn(doc,fitRow,"ja-seg-sm"+(item.fit===pair[0]?" is-on":""),pair[1]);
        b.addEventListener("click",function(){item.fit=pair[0];draw();});
      });
    });
    wireDrop(strip,name);
  }

  function wireDrop(el,name){
    ["dragenter","dragover"].forEach(function(ev){
      el.addEventListener(ev,function(e){e.preventDefault();el.classList.add("is-hover");});
    });
    ["dragleave","drop"].forEach(function(ev){
      el.addEventListener(ev,function(e){e.preventDefault();el.classList.remove("is-hover");});
    });
    el.addEventListener("drop",async function(e){
      var files=Array.prototype.slice.call((e.dataTransfer&&e.dataTransfer.files)||[]);
      for(var i=0;i<files.length;i++){
        if(!Media.isImageType(files[i].type)){continue;}
        try{ addTo(name,await Media.importFile(self.wiki,files[i],"image")); }
        catch(err){ window.alert(err&&err.message?err.message:"Import impossible."); }
      }
    });
  }

  function draw(){
    drawBack();
    galleryHost.innerHTML="";
    state.galleryNames.forEach(function(name,i){drawGallery(name,i);});
  }

  var newGal=btn(doc,actions,"ja-jmedia-btn","＋ Nouvelle galerie");
  newGal.addEventListener("click",function(){
    var base="Galerie "+(state.galleryNames.length+1),name=base,k=2;
    while(state.galleryNames.indexOf(name)!==-1){name=base+" "+(k++);}
    state.galleryNames.push(name);
    draw();
  });

  draw();
};

/* Ouvre un sélecteur de fichiers sans laisser d'input orphelin. */
JournalWidget.prototype.pickFiles=function(accept,multiple,onEach){
  var doc=this.document,input=doc.createElement("input");
  input.type="file";input.accept=accept;input.multiple=!!multiple;
  input.style.display="none";
  doc.body.appendChild(input);
  input.addEventListener("change",async function(){
    var files=Array.prototype.slice.call(input.files||[]);
    input.remove();
    for(var i=0;i<files.length;i++){
      try{ await onEach(files[i]); }
      catch(e){ window.alert(e&&e.message?e.message:"Import impossible."); }
    }
  });
  input.click();
};

JournalWidget.prototype.buildAudioField=function(parent,state){
  var self=this,doc=this.document,
      wrap=mk(doc,parent,"div","ja-jmedia-block");
  mk(doc,wrap,"div","ja-jform-label","Audio");
  var list=mk(doc,wrap,"div","ja-jmedia-list");
  var actions=mk(doc,wrap,"div","ja-jmedia-actions");
  var status=mk(doc,wrap,"div","ja-jmedia-status","");

  function add(ref){if(ref){state.audios.push(ref);draw();}}

  function draw(){
    list.innerHTML="";
    if(!state.audios.length){mk(doc,list,"div","ja-jmedia-empty","Aucun son.");return;}
    state.audios.forEach(function(ref,index){
      var rowEl=mk(doc,list,"div","ja-jmedia-row ja-jmedia-row-audio");
      var body=mk(doc,rowEl,"div","ja-jmedia-rowbody");
      var nameRow=mk(doc,body,"div","ja-jmedia-name");
      mk(doc,nameRow,"span","",Media.labelOf(self.wiki,ref));
      var kb=Media.weightKb(self.wiki,ref);
      mk(doc,nameRow,"span","ja-jmedia-weight"+(kb?"":" ja-is-linked"),kb?kb+" Ko":"lié");
      var player=doc.createElement("audio");
      player.controls=true;player.preload="none";player.src=Media.src(self.wiki,ref);
      body.appendChild(player);
      var rm=btn(doc,rowEl,"ja-jmedia-icon ja-jmedia-icon-danger","×","Retirer");
      rm.addEventListener("click",function(){state.audios.splice(index,1);draw();});
    });
  }

  if(Media.recorderSupported()){
    var recorder=null,
        recBtn=btn(doc,actions,"ja-jmedia-btn ja-jmedia-rec","● Enregistrer"),
        timer=null,started=0;
    function stopTimer(){if(timer){clearInterval(timer);timer=null;}}
    recBtn.addEventListener("click",async function(){
      if(recorder){
        recBtn.disabled=true;
        try{ add(await recorder.stop()); status.textContent="Mémo enregistré."; }
        catch(e){ status.textContent=e&&e.message?e.message:"Enregistrement perdu."; }
        recorder=null;stopTimer();
        recBtn.classList.remove("is-recording");
        recBtn.textContent="● Enregistrer";
        recBtn.disabled=false;
        return;
      }
      try{
        recorder=Media.createRecorder(self.wiki);
        await recorder.start();
        started=Date.now();
        recBtn.classList.add("is-recording");
        status.textContent="Enregistrement en cours…";
        timer=setInterval(function(){
          var s=Math.floor((Date.now()-started)/1000);
          recBtn.textContent="■ Arrêter · "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
        },500);
      }catch(e){
        recorder=null;
        status.textContent="Micro indisponible : "+(e&&e.message?e.message:"accès refusé.");
      }
    });
  }else{
    mk(doc,actions,"span","ja-jmedia-note","Enregistrement micro indisponible ici.");
  }

  this.fileButton(actions,"📁 Importer","audio/*","audio",add);

  var extBtn=btn(doc,actions,"ja-jmedia-btn","🔗 Adresse externe");
  extBtn.addEventListener("click",function(){
    var uri=window.prompt("Adresse du fichier audio (https://…)");
    if(!uri){return;}
    try{ add(Media.linkExternal(self.wiki,uri,"",Media.typeOf(self.wiki,uri)||"audio/mpeg")); }
    catch(e){ window.alert(e&&e.message?e.message:"Adresse invalide."); }
  });

  draw();
};

JournalWidget.prototype.buildLinksField=function(parent,state){
  var self=this,doc=this.document,
      wrap=mk(doc,parent,"div","ja-jmedia-block");
  mk(doc,wrap,"div","ja-jform-label","Liens");
  var list=mk(doc,wrap,"div","ja-jmedia-list");
  var actions=mk(doc,wrap,"div","ja-jmedia-actions");

  function draw(){
    list.innerHTML="";
    if(!state.links.length){mk(doc,list,"div","ja-jmedia-empty","Aucun lien.");return;}
    state.links.forEach(function(link,index){
      var rowEl=mk(doc,list,"div","ja-jmedia-row ja-jmedia-row-link");
      var body=mk(doc,rowEl,"div","ja-jmedia-rowbody");
      var url=mk(doc,body,"input","ja-jmedia-input");
      url.type="text";
      url.placeholder=link.internal?"Titre de la fiche":"https://…";
      url.value=link.url||"";
      url.addEventListener("input",function(){link.url=url.value;});

      var opts=mk(doc,body,"div","ja-jmedia-opts");
      var intBtn=btn(doc,opts,"ja-jmedia-chip"+(link.internal?" is-on":""),"Interne");
      intBtn.title="Pointe vers une fiche de ton journal";
      intBtn.addEventListener("click",function(){
        link.internal=!link.internal;
        intBtn.classList.toggle("is-on",link.internal);
        url.placeholder=link.internal?"Titre de la fiche":"https://…";
      });
      var embBtn=btn(doc,opts,"ja-jmedia-chip"+(link.embed?" is-on":""),"Embarquer");
      embBtn.title="Afficher le contenu au lieu du lien";
      embBtn.addEventListener("click",function(){
        link.embed=!link.embed;
        embBtn.classList.toggle("is-on",link.embed);
      });

      var rm=btn(doc,rowEl,"ja-jmedia-icon ja-jmedia-icon-danger","×","Retirer");
      rm.addEventListener("click",function(){state.links.splice(index,1);draw();});
    });
  }

  var add=btn(doc,actions,"ja-jmedia-btn","＋ Ajouter un lien");
  add.addEventListener("click",function(){
    state.links.push({url:"",internal:false,embed:false});draw();
  });

  var paste=btn(doc,actions,"ja-jmedia-btn","📋 Coller");
  paste.addEventListener("click",async function(){
    try{
      var text=await navigator.clipboard.readText();
      if(text&&text.trim()){
        state.links.push({url:text.trim(),internal:false,embed:/^https?:/.test(text.trim())});
        draw();
      }
    }catch(e){
      state.links.push({url:"",internal:false,embed:false});draw();
    }
  });

  draw();
};

JournalWidget.prototype.removeChildDomNodes=function(){
  if(this.skyCleanup){try{this.skyCleanup();}catch(e){}this.skyCleanup=null;}
  if(this.focusObserver){try{this.focusObserver.disconnect();}catch(e){}this.focusObserver=null;}
  if(this.lineObserver){try{this.lineObserver.disconnect();}catch(e){}this.lineObserver=null;}
  Widget.prototype.removeChildDomNodes.call(this);
};

JournalWidget.prototype.refresh=function(changedTiddlers){
  var changedAttributes=this.computeAttributes();
  if(Object.keys(changedAttributes).length){this.refreshSelf();return true;}
  if(changedTiddlers[DATE_STATE]||changedTiddlers[VIEW_STATE]||changedTiddlers[FOCUS_DAILY_STATE]||changedTiddlers[JConfig.CONFIG_TIDDLER]){
    this.refreshSelf();return true;
  }
  for(var title in changedTiddlers){
    var t=this.wiki.getTiddler(title);
    if(isDaily(t)||Agenda.isEvent(t)||Agenda.isTodo(t)||Agenda.isHabit(t)||Agenda.isVacation(t)||(t&&t.fields&&Array.isArray(t.fields.tags)&&t.fields.tags.indexOf("Lieux")!==-1)){
      this.refreshSelf();return true;
    }
  }
  return false;
};

exports.openDailyForm=function(host,opts){
  opts=opts||{};
  var inst=Object.create(JournalWidget.prototype);
  inst.document=host.document;
  inst.wiki=host.wiki;
  inst.parentWidget=host;
  inst.cfg=JConfig.read(host.wiki);
  return inst.openForm(opts.editTitle||null,opts.date||selectedDate(inst),opts.seed||{});
};
exports.jajournal=JournalWidget;

})();
