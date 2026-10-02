/*\
title: $:/journalapp/modules/lib/jmedia.js
type: application/javascript
module-type: library

Mon Journal — médias.
Import de fichiers (image, audio, pièce jointe), enregistrement micro,
résolution des sources et détection des embeds.

Deux façons de stocker un fichier :
  • intégré   — le binaire vit dans un tiddler base64. Autonome, mais lourd.
  • référencé — le tiddler ne porte qu'un _canonical_uri. Léger, mais le
                fichier doit rester accessible à cette adresse.
\*/
"use strict";

var MEDIA_FOLDER = "$:/journalapp/media";

function slugify(s){
  return String(s || "fichier").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "fichier";
}

function uid(){return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,6);}

/* Titre libre dans le dossier média, jamais en collision. */
function newTitle(name,kind){
  return MEDIA_FOLDER + "/" + (kind || "file") + "/" + slugify(String(name || "").replace(/\.[^.]+$/,"")) + "-" + uid();
}

/* ---------------- lecture ---------------- */

function isImageType(type){return /^image\//.test(String(type || ""));}
function isAudioType(type){return /^audio\//.test(String(type || ""));}
function isVideoType(type){return /^video\//.test(String(type || ""));}

/* Résout une référence (titre de tiddler, data URI, URL) en src utilisable. */
function src(wiki,ref){
  if(!ref){return "";}
  ref = String(ref);
  if(/^(data:|blob:|https?:|\/\/)/.test(ref)){return ref;}
  var t = wiki.getTiddler(ref);
  if(!t){return "";}
  if(t.fields._canonical_uri){return String(t.fields._canonical_uri);}
  var type = String(t.fields.type || "application/octet-stream"),
      text = String(t.fields.text || "");
  if(type === "image/svg+xml" && text.indexOf("<") === 0){
    try{ return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text))); }
    catch(e){ return ""; }
  }
  return "data:" + type + ";base64," + text.replace(/\s+/g,"");
}

function typeOf(wiki,ref){
  if(!ref){return "";}
  ref = String(ref);
  var m = /^data:([^;,]+)/.exec(ref);
  if(m){return m[1];}
  var t = wiki.getTiddler(ref);
  if(t){return String(t.fields.type || "");}
  if(/\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i.test(ref)){return "image/*";}
  if(/\.(mp3|ogg|wav|m4a|webm)(\?|#|$)/i.test(ref)){return "audio/*";}
  if(/\.(mp4|webm|mov)(\?|#|$)/i.test(ref)){return "video/*";}
  return "";
}

function labelOf(wiki,ref){
  if(!ref){return "";}
  ref = String(ref);
  if(ref.indexOf(MEDIA_FOLDER) === 0){return ref.slice(MEDIA_FOLDER.length + 1);}
  if(/^https?:/.test(ref)){
    try{ return decodeURIComponent(ref.split("/").pop().split("?")[0]) || ref; }
    catch(e){ return ref; }
  }
  return ref.replace(/^\$:\//,"");
}

/* ---------------- écriture ---------------- */

function readAsDataURL(file){
  return new Promise(function(resolve,reject){
    var reader = new FileReader();
    reader.onerror = function(){reject(new Error("Lecture du fichier impossible."));};
    reader.onload = function(){resolve(String(reader.result || ""));};
    reader.readAsDataURL(file);
  });
}

function base64Of(dataUrl){
  var comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/* Crée le tiddler d'un fichier importé. kind sert juste à ranger. */
async function importFile(wiki,file,kind){
  if(!file){throw new Error("Aucun fichier.");}
  var dataUrl = await readAsDataURL(file),
      title = newTitle(file.name,kind || "file"),
      fields = {
        title: title,
        type: file.type || "application/octet-stream",
        text: base64Of(dataUrl),
        "media-name": file.name || "",
        "media-size": String(file.size || "")
      };
  wiki.addTiddler(new $tw.Tiddler(fields,{created:new Date(),modified:new Date()}));
  return title;
}

/* Crée un tiddler qui ne fait que pointer vers une adresse externe. */
function linkExternal(wiki,uri,name,type){
  uri = String(uri || "").trim();
  if(!uri){throw new Error("Adresse vide.");}
  var title = newTitle(name || uri,"lien");
  wiki.addTiddler(new $tw.Tiddler({
    title: title,
    type: type || typeOf(wiki,uri) || "image/png",
    text: "",
    _canonical_uri: uri,
    "media-name": name || ""
  },{created:new Date(),modified:new Date()}));
  return title;
}

/* Poids approximatif d'un tiddler média intégré, en Ko. */
function weightKb(wiki,ref){
  var t = wiki.getTiddler(String(ref || ""));
  if(!t || t.fields._canonical_uri){return 0;}
  return Math.round(String(t.fields.text || "").length * 0.75 / 1024);
}


/* ---------------- sélecteur d’images partagé ----------------
   Une seule source pour Settings, Daily ET formulaires Agenda.
   Recherche sur titre, nom et tags + miniature. */
function normSearch(s){
  try{return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  catch(e){return String(s||"").toLowerCase();}
}
function tagTokens(raw){
  if(Array.isArray(raw)){return raw.filter(Boolean).map(String);}
  raw=String(raw||"").trim();if(!raw){return [];}
  var list=[];
  if(typeof $tw!=="undefined"&&$tw.utils&&$tw.utils.parseStringArray){
    try{list=$tw.utils.parseStringArray(raw)||[];}catch(e){}
  }
  raw.split(/\s*[,;]\s*/).forEach(function(x){if(x&&list.indexOf(x)===-1){list.push(x);}});
  return list;
}
function imageFolderTags(title){
  title=String(title||"");
  if(title.indexOf("$:/journalapp/icons/")===0){return ["Catégorie"];}
  if(title.indexOf("$:/journalapp/banners/")===0){return ["Bannière"];}
  if(title.indexOf("$:/journalapp/moods/")===0){return ["Humeur"];}
  if(title.indexOf("$:/journalapp/markers/")===0){return ["Marqueur"];}
  if(title.indexOf("$:/journalapp/media/")===0){return ["Entrée"];}
  if(title.indexOf("$:/journalapp/library/lucide-")===0){return ["Lucide"];}
  if(title.indexOf("$:/")===0){return ["Système"];}
  return [];
}
function imageUsageTags(wiki){
  var map=Object.create(null),Agenda;
  try{Agenda=require("$:/journalapp/modules/lib/agenda.js");}catch(e){Agenda=null;}
  function push(ref,tag){if(!ref||!tag){return;}ref=String(ref);tag=String(tag);if(!map[ref]){map[ref]=[];}if(map[ref].indexOf(tag)===-1){map[ref].push(tag);}}
  function list(v){if(typeof $tw!=="undefined"&&$tw.utils&&$tw.utils.parseStringArray){try{return $tw.utils.parseStringArray(String(v||""))||[];}catch(e){}}return tagTokens(v);}
  function contextTags(f){var out=[];["places","people","activities","projects","events","todos","habits","media","sleep"].forEach(function(field){list(f[field]).forEach(function(v){if(v&&out.indexOf(v)===-1){out.push(v);}});});if(f.date){out.push(String(f.date).slice(0,4));}else if(f["start-date"]){out.push(String(f["start-date"]).slice(0,4));}return out;}
  function imageList(f,baseTags){var imgs=[];try{imgs=f.images?JSON.parse(String(f.images)):[];}catch(e){imgs=[];}if(!Array.isArray(imgs)){return;}var context=contextTags(f);imgs.forEach(function(item){if(!item){return;}var ref=item.src||item.path;if(!ref){return;}var isBack=!!(item.back||item.banner||item.baniere);(baseTags||[]).forEach(function(tag){push(ref,tag);});push(ref,isBack?"Fond":"Galerie");if(item.gallery){push(ref,item.gallery);}if(!isBack){context.forEach(function(tag){push(ref,tag);});}});}
  var agendaCfg=Agenda?Agenda.readConfig(wiki):{},typeById=Object.create(null);((agendaCfg&&agendaCfg.eventTypes)||[]).forEach(function(x){if(x&&x.id){typeById[String(x.id)]=x;}});
  wiki.each(function(t){var f=t&&t.fields;if(!f){return;}if(String(f.kind||"")==="Daily"){imageList(f,["Journal"]);}if(Agenda&&Agenda.isVacation(t)){imageList(f,["Vacances"]);}if(Agenda&&Agenda.isHabit(t)){imageList(f,["Habitudes"]);}if(Agenda&&Agenda.isTodo(t)){imageList(f,["To-do"]);}if(Agenda&&Agenda.isEvent(t)){var role=String(f["agenda-role"]||"event"),base=[role==="slot"?"Emploi du temps":"Événement"],ty=typeById[String(f["event-type"]||"")];if(ty&&ty.label){base.push(String(ty.label));}imageList(f,base);}if(f["mood-image"]){push(f["mood-image"],"Humeur");}});
  try{var cfg=JSON.parse(wiki.getTiddlerText("$:/journalapp/config/journal","")||"{}");((cfg.banner&&cfg.banner.slices)||[]).forEach(function(sl){push(sl.image,"Bannière");});(cfg.moodTree||[]).forEach(function(pr){push(pr.image,"Humeur");(pr.children||[]).forEach(function(nu){push(nu.image,"Humeur");});});(cfg.markers||[]).forEach(function(m){push(m.image,"Marqueur");});}catch(e){}
  ((agendaCfg&&agendaCfg.eventTypes)||[]).forEach(function(ty){if(!ty){return;}var name=String(ty.label||ty.id||"Type");if(ty.image){push(ty.image,"Type");push(ty.image,name);push(ty.image,"Icône");}var backs=ty.backgrounds||{};[["event","Événement"],["todo","To-do"],["habit","Habitudes"],["slot","Emploi du temps"]].forEach(function(pair){var raw=backs[pair[0]],ref=typeof raw==="string"?raw:(raw&&typeof raw==="object"?String(raw.src||raw.ref||raw.path||""):"");if(!ref){return;}push(ref,"Fond");push(ref,"Type");push(ref,name);push(ref,pair[1]);});});
  return map;
}
function imageSearchTags(t,title,usage){
  var out=[],f=t&&t.fields?t.fields:{};
  function add(x){x=String(x||"").trim();if(x&&out.indexOf(x)===-1){out.push(x);}}
  tagTokens(f.tags).concat(tagTokens(f["media-tags"]),imageFolderTags(title),(usage&&usage[title])||[]).forEach(add);
  String(title||"").replace(/^\$:\//,"").split("/").forEach(function(x){if(x&&x!=="journalapp"&&x!=="media"&&x!=="library"){add(x);}});
  return out;
}
function openWikiImagePicker(doc,wiki,anchor,onPick,opts){
  opts=opts||{};
  var old=doc.querySelector(".ja-imagepick-pop");if(old){old.remove();}
  var pop=doc.createElement("div");pop.className="ja-pop ja-imagepick-pop";doc.body.appendChild(pop);
  var search=doc.createElement("input");search.type="search";search.className="ja-imagepick-search";search.placeholder="Rechercher par titre ou tag…";pop.appendChild(search);
  var list=doc.createElement("div");list.className="ja-imagepick-list";pop.appendChild(list);
  var all=[],usage=imageUsageTags(wiki);
  wiki.eachShadowPlusTiddlers(function(t,title){
    if(!t||!t.fields||!isImageType(t.fields.type)){return;}
    if(opts.exclude&&String(opts.exclude)===String(title)){return;}
    all.push({
      title:title,t:t,
      name:String(t.fields["media-name"]||labelOf(wiki,title)||title),
      tags:imageSearchTags(t,title,usage)
    });
  });
  all.sort(function(a,b){return a.name.localeCompare(b.name,"fr");});
  var closed=false;
  function close(){if(closed){return;}closed=true;if(pop.parentNode){pop.remove();}doc.removeEventListener("mousedown",away,true);doc.removeEventListener("keydown",esc,true);}
  function away(ev){if(!pop.contains(ev.target)&&ev.target!==anchor){close();}}
  function esc(ev){if(ev.key==="Escape"){close();}}
  function draw(){
    var q=normSearch(search.value),shown=0;list.innerHTML="";
    all.forEach(function(it){
      if(shown>=120){return;}
      var hay=normSearch(it.title+" "+it.name+" "+it.tags.join(" "));
      if(q&&hay.indexOf(q)===-1){return;}
      shown++;
      var b=doc.createElement("button");b.type="button";b.className="ja-imagepick-item";
      var thumb=doc.createElement("span");thumb.className="ja-imagepick-thumb";b.appendChild(thumb);
      var im=doc.createElement("img");im.src=src(wiki,it.title);im.alt="";im.loading="lazy";thumb.appendChild(im);
      var copy=doc.createElement("span");copy.className="ja-imagepick-copy";b.appendChild(copy);
      var nm=doc.createElement("strong");nm.className="ja-imagepick-name";nm.textContent=it.name;copy.appendChild(nm);
      if(it.tags.length){var tg=doc.createElement("span");tg.className="ja-imagepick-tags";tg.textContent=it.tags.slice(0,8).join(" · ");copy.appendChild(tg);}
      b.addEventListener("click",function(){close();onPick(it.title,it.t);});
      list.appendChild(b);
    });
    if(!shown){var e=doc.createElement("div");e.className="ja-imagepick-empty";e.textContent="Aucune image ne correspond.";list.appendChild(e);}
  }
  search.addEventListener("input",draw);draw();
  var rect=anchor.getBoundingClientRect(),vw=doc.documentElement.clientWidth,vh=doc.documentElement.clientHeight;
  pop.style.left=Math.max(8,Math.min(rect.left,vw-368))+"px";
  var top=rect.bottom+5;if(top+420>vh){top=Math.max(8,rect.top-420);}pop.style.top=top+"px";
  setTimeout(function(){doc.addEventListener("mousedown",away,true);doc.addEventListener("keydown",esc,true);try{search.focus();}catch(e){}},0);
  return {close:close,element:pop};
}

/* ---------------- micro ---------------- */

function recorderSupported(){
  return typeof MediaRecorder !== "undefined" &&
         !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function pickAudioMime(){
  if(typeof MediaRecorder === "undefined"){return "";}
  var candidates = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"];
  for(var i = 0; i < candidates.length; i++){
    try{ if(MediaRecorder.isTypeSupported(candidates[i])){return candidates[i];} }catch(e){}
  }
  return "";
}

/*
  Enregistreur minimal.
  start() -> Promise, stop() -> Promise<titre du tiddler créé>, cancel().
*/
function createRecorder(wiki){
  var stream = null, recorder = null, chunks = [];
  return {
    async start(){
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      var mime = pickAudioMime();
      recorder = mime ? new MediaRecorder(stream,{mimeType:mime}) : new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = function(ev){if(ev.data && ev.data.size){chunks.push(ev.data);}};
      recorder.start();
    },
    stop(){
      return new Promise(function(resolve,reject){
        if(!recorder){reject(new Error("Aucun enregistrement en cours."));return;}
        recorder.onstop = async function(){
          try{
            var blob = new Blob(chunks,{type:recorder.mimeType || "audio/webm"}),
                dataUrl = await readAsDataURL(blob),
                title = newTitle("memo","audio");
            wiki.addTiddler(new $tw.Tiddler({
              title: title,
              type: blob.type || "audio/webm",
              text: base64Of(dataUrl),
              "media-name": "Mémo vocal",
              "media-size": String(blob.size || "")
            },{created:new Date(),modified:new Date()}));
            resolve(title);
          }catch(e){reject(e);}
          finally{
            if(stream){stream.getTracks().forEach(function(t){t.stop();});}
            stream = null; recorder = null; chunks = [];
          }
        };
        recorder.stop();
      });
    },
    cancel(){
      try{ if(recorder && recorder.state !== "inactive"){recorder.onstop = null; recorder.stop();} }catch(e){}
      if(stream){stream.getTracks().forEach(function(t){t.stop();});}
      stream = null; recorder = null; chunks = [];
    }
  };
}

/* ---------------- liens & embeds ---------------- */

var YOUTUBE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
var VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;

/* Décrit comment afficher un lien : "internal" | "image" | "audio" | "video"
   | "iframe" | "link". */
function embedKind(wiki,link){
  if(!link || !link.url){return "link";}
  if(link.internal){return "internal";}
  var url = String(link.url);
  if(YOUTUBE.test(url) || VIMEO.test(url)){return "iframe";}
  var type = typeOf(wiki,url);
  if(isImageType(type)){return "image";}
  if(isAudioType(type)){return "audio";}
  if(isVideoType(type)){return "video";}
  return "link";
}

function iframeSrc(url){
  var y = YOUTUBE.exec(url);
  if(y){return "https://www.youtube-nocookie.com/embed/" + y[1];}
  var v = VIMEO.exec(url);
  if(v){return "https://player.vimeo.com/video/" + v[1];}
  return "";
}


/* ---------------- fonds d'entrée partagés ----------------
   Une seule interprétation des réglages de fond pour le Journal et l'Agenda.
   L'Agenda utilise un calque DOM dédié afin que l'opacité et le masque de
   fondu ne touchent jamais le texte ni les contrôles de la carte. */
var BACKDROP_DEFAULTS={
  src:"",back:false,fit:"cover",posX:50,posY:50,opacity:85,
  fadeDir:"bottom",fadeStart:40,fadeEnd:95,
  fadeMode:"transparent",fadeColor:"#14161d"
};
var BACKDROP_ANGLES={
  top:"0deg",tr:"45deg",right:"90deg",br:"135deg",
  bottom:"180deg",bl:"225deg",left:"270deg",tl:"315deg"
};
function clampBackdrop(v,min,max,def){
  v=Number(v);return isFinite(v)?Math.max(min,Math.min(max,v)):def;
}
function normalizeBackdrop(raw){
  raw=raw&&typeof raw==="object"?raw:{};
  var out={};Object.keys(BACKDROP_DEFAULTS).forEach(function(k){out[k]=BACKDROP_DEFAULTS[k];});
  Object.keys(BACKDROP_DEFAULTS).forEach(function(k){if(raw[k]!==undefined&&raw[k]!==null){out[k]=raw[k];}});
  if(raw.path&&!out.src){out.src=raw.path;}
  if(raw.banner!==undefined){out.back=!!raw.banner;}
  if(raw.baniere!==undefined){out.back=!!raw.baniere;}
  if(typeof raw.fade==="string"){out.fadeDir=raw.fade;}
  if(["cover","contain","fill"].indexOf(String(out.fit))===-1){out.fit="cover";}
  if(!BACKDROP_ANGLES[out.fadeDir]&&out.fadeDir!=="none"){out.fadeDir="bottom";}
  if(out.fadeMode!=="color"){out.fadeMode="transparent";}
  out.posX=clampBackdrop(out.posX,0,100,50);
  out.posY=clampBackdrop(out.posY,0,100,50);
  out.opacity=clampBackdrop(out.opacity,0,100,85);
  out.fadeStart=clampBackdrop(out.fadeStart,0,99,40);
  out.fadeEnd=clampBackdrop(out.fadeEnd,1,100,95);
  if(out.fadeEnd<=out.fadeStart){out.fadeEnd=Math.min(100,out.fadeStart+1);}
  return out;
}
function hexBackdrop(hex,alpha){
  var h=String(hex||"#14161d").replace(/^#/,"");
  if(h.length===3){h=h.split("").map(function(c){return c+c;}).join("");}
  if(!/^[0-9a-f]{6}$/i.test(h)){h="14161d";}
  return "rgba("+parseInt(h.slice(0,2),16)+","+parseInt(h.slice(2,4),16)+","+parseInt(h.slice(4,6),16)+","+alpha+")";
}
function backdropFade(raw){
  var item=normalizeBackdrop(raw),angle=BACKDROP_ANGLES[item.fadeDir]||"180deg",
      a=item.fadeStart,b=item.fadeEnd,mask="",overlay="";
  if(item.fadeDir!=="none"){
    if(item.fadeMode==="color"){
      overlay="linear-gradient("+angle+","+hexBackdrop(item.fadeColor,0)+" 0%,"+
              hexBackdrop(item.fadeColor,0)+" "+a+"%,"+hexBackdrop(item.fadeColor,1)+" "+b+"%)";
    }else{
      mask="linear-gradient("+angle+",#000 0%,#000 "+a+"%,transparent "+b+"%)";
    }
  }
  return {item:item,mask:mask,overlay:overlay};
}
function applyBackdropLayer(wiki,host,raw,options){
  options=options||{};
  var f=backdropFade(raw),item=f.item,url=src(wiki,item.src||item.path||"");
  if(!host||!url){return false;}
  var hostClass=options.hostClass||"ja-media-backdrop-host",
      layerClass=options.layerClass||"ja-media-backdrop-layer";
  Array.prototype.slice.call(host.children||[]).forEach(function(ch){
    if(ch.classList&&ch.classList.contains(layerClass)){ch.remove();}
  });
  host.classList.add("has-backdrop",hostClass);
  try{
    var view=(host.ownerDocument||document).defaultView;
    if(view&&view.getComputedStyle(host).position==="static"){host.style.position="relative";}
  }catch(e){}
  host.style.isolation="isolate";
  var layer=(host.ownerDocument||document).createElement("span");
  layer.className=layerClass;layer.setAttribute("aria-hidden","true");
  layer.style.position="absolute";layer.style.inset="0";layer.style.zIndex="-1";
  layer.style.pointerEvents="none";layer.style.borderRadius="inherit";
  var image='url("'+String(url).replace(/"/g,"%22")+'")',
      fit=item.fit==="contain"?"contain":(item.fit==="fill"?"100% 100%":"cover"),
      pos=item.posX+"% "+item.posY+"%";
  layer.style.backgroundImage=f.overlay?f.overlay+", "+image:image;
  layer.style.backgroundSize=f.overlay?"100% 100%, "+fit:fit;
  layer.style.backgroundPosition=f.overlay?"center, "+pos:pos;
  layer.style.backgroundRepeat=f.overlay?"no-repeat, no-repeat":"no-repeat";
  layer.style.opacity=(item.opacity/100).toFixed(2);
  layer.style.webkitMaskImage=f.mask||"none";
  layer.style.maskImage=f.mask||"none";
  layer.style.webkitMaskRepeat="no-repeat";layer.style.maskRepeat="no-repeat";
  layer.style.webkitMaskSize="100% 100%";layer.style.maskSize="100% 100%";
  if(host.firstChild){host.insertBefore(layer,host.firstChild);}else{host.appendChild(layer);}
  return true;
}

/* ---------------- listes stockées en JSON ---------------- */

function parseJsonList(raw){
  if(!raw){return [];}
  if(Array.isArray(raw)){return raw;}
  try{
    var v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : [];
  }catch(e){ return []; }
}
function stringifyJsonList(list){
  return (list && list.length) ? JSON.stringify(list) : "";
}

exports.MEDIA_FOLDER = MEDIA_FOLDER;
exports.src = src;
exports.typeOf = typeOf;
exports.labelOf = labelOf;
exports.isImageType = isImageType;
exports.isAudioType = isAudioType;
exports.isVideoType = isVideoType;
exports.importFile = importFile;
exports.linkExternal = linkExternal;
exports.weightKb = weightKb;
exports.recorderSupported = recorderSupported;
exports.createRecorder = createRecorder;
exports.embedKind = embedKind;
exports.iframeSrc = iframeSrc;
exports.parseJsonList = parseJsonList;
exports.stringifyJsonList = stringifyJsonList;
exports.newTitle = newTitle;
exports.normalizeBackdrop = normalizeBackdrop;
exports.backdropFade = backdropFade;
exports.applyBackdropLayer = applyBackdropLayer;
exports.openWikiImagePicker = openWikiImagePicker;
exports.imageSearchTags = imageSearchTags;
exports.imageUsageTags = imageUsageTags;
