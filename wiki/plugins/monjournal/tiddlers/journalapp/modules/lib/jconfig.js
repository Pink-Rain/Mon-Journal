/*\
title: $:/journalapp/modules/lib/jconfig.js
type: application/javascript
module-type: library

Mon Journal — configuration du Journal.
Source de vérité unique pour : arbre d'humeur, échelles énergie/anxiété,
tranches de bannière, marqueurs, options d'affichage.
Tout est donnée : rien d'ici ne doit être gravé ailleurs dans le code.

Convention d'échelle (appliquée partout) :
  index 0 = le plus mauvais, index 5 = le meilleur.
  L'anxiété suit donc la même direction que l'énergie.
\*/
"use strict";

var CONFIG_TIDDLER = "$:/journalapp/config/journal";

var DEFAULT_MOOD_TREE = [
  {id:"m5", label:"Youhouu", emoji:"😀", image:"", value:5, color:"#7a9e6c", children:[
    {id:"m5a",emoji:"😀",image:"",value:5},{id:"m5b",emoji:"😍",image:"",value:5},
    {id:"m5c",emoji:"🤩",image:"",value:5},{id:"m5d",emoji:"😂",image:"",value:5},
    {id:"m5e",emoji:"😎",image:"",value:4.5}
  ]},
  {id:"m4", label:"Yay", emoji:"😊", image:"", value:4, color:"#9fb072", children:[
    {id:"m4a",emoji:"😊",image:"",value:4},{id:"m4b",emoji:"😌",image:"",value:4},
    {id:"m4c",emoji:"🤗",image:"",value:4},{id:"m4d",emoji:"🥰",image:"",value:4},
    {id:"m4e",emoji:"😏",image:"",value:4},{id:"m4f",emoji:"😉",image:"",value:4}
  ]},
  {id:"m3", label:"Okay", emoji:"😐", image:"", value:3, color:"#d9b96b", children:[
    {id:"m3a",emoji:"😐",image:"",value:3},{id:"m3b",emoji:"🙄",image:"",value:3},
    {id:"m3c",emoji:"🤨",image:"",value:3},{id:"m3d",emoji:"🙃",image:"",value:3},
    {id:"m3e",emoji:"🫠",image:"",value:3},{id:"m3f",emoji:"😴",image:"",value:3},
    {id:"m3g",emoji:"👽",image:"",value:3}
  ]},
  {id:"m2", label:"Mh", emoji:"😞", image:"", value:2, color:"#d69a6a", children:[
    {id:"m2a",emoji:"😞",image:"",value:2},{id:"m2b",emoji:"😣",image:"",value:2},
    {id:"m2c",emoji:"😒",image:"",value:2},{id:"m2d",emoji:"🥺",image:"",value:2},
    {id:"m2e",emoji:"😤",image:"",value:2},{id:"m2f",emoji:"💩",image:"",value:2}
  ]},
  {id:"m1", label:"Nope", emoji:"😩", image:"", value:1, color:"#c77b83", children:[
    {id:"m1a",emoji:"😩",image:"",value:1},{id:"m1b",emoji:"😭",image:"",value:1},
    {id:"m1c",emoji:"😱",image:"",value:1},{id:"m1d",emoji:"🤬",image:"",value:1},
    {id:"m1e",emoji:"🤮",image:"",value:1},{id:"m1f",emoji:"☠️",image:"",value:1}
  ]}
];

/* index 0 = pire, index 5 = mieux */
var DEFAULT_ENERGY = [
  {label:"épuisé",          bg:"#c77b83", fg:"#1b1218"},
  {label:"très fatigué",    bg:"#cf8f7d", fg:"#1b1218"},
  {label:"fatigué",         bg:"#d6a878", fg:"#1b1218"},
  {label:"un peu fatigué",  bg:"#d5bd7d", fg:"#1b1218"},
  {label:"reposé",          bg:"#a8b878", fg:"#141a12"},
  {label:"en pleine forme", bg:"#7a9e6c", fg:"#101710"}
];

/* index 0 = pire (meltdown), index 5 = mieux (calme) — inversion demandée */
var DEFAULT_STRESS = [
  {label:"meltdown",       bg:"#c0616a", fg:"#1b1218"},
  {label:"anxieux",        bg:"#d07f68", fg:"#1b1218"},
  {label:"stressé",        bg:"#dc9a63", fg:"#1b1218"},
  {label:"un peu stressé", bg:"#dfb96a", fg:"#1b1218"},
  {label:"plutôt calme",   bg:"#aebb74", fg:"#141a12"},
  {label:"calme",          bg:"#7fae72", fg:"#101710"}
];

/* Tranches de bannière — libellées par ressenti, jamais par numéro.
   Ordre : du plus haut moral au plus bas. */
var DEFAULT_BANNER_SLICES = [
  {min:4.5, max:5.0,  label:"Au top",     color:"#4a5b46", image:""},
  {min:4.0, max:4.5,  label:"Très bien",  color:"#55603f", image:""},
  {min:3.5, max:4.0,  label:"Bien",       color:"#63603c", image:""},
  {min:3.0, max:3.5,  label:"Correct",    color:"#6b5b3f", image:""},
  {min:2.5, max:3.0,  label:"Mitigé",     color:"#6b4f42", image:""},
  {min:2.0, max:2.5,  label:"Bof",        color:"#653f42", image:""},
  {min:1.5, max:2.0,  label:"Difficile",  color:"#5b3742", image:""},
  {min:1.0, max:1.5,  label:"Au fond",    color:"#4c2f3d", image:""}
];

var DEFAULT_MARKERS = [
  {id:"coeur",       emoji:"❤️", label:"Cœur",      color:"#c77b83"},
  {id:"etoile",      emoji:"⭐", label:"Étoile",    color:"#d9b96b"},
  {id:"exclamation", emoji:"❗", label:"Important", color:"#d69a6a"}
];

/* Ce que le formulaire propose d'emblée, avant que tu ne touches à rien. */
var DEFAULT_FORM = {
  mediaPos: "left",          // left | right | above | below
  mediaFlow: "column",       // column (l'une sous l'autre) | row (côte à côte)
  galleryLayout: "slides",   // slides | carousel | mosaic | grid | hero
  imageFit: "cover",
  backdrop: {
    fit: "cover", opacity: 85, posX: 50, posY: 50,
    fadeDir: "right", fadeMode: "transparent", fadeColor: "#14161d",
    fadeStart: 40, fadeEnd: 95
  },
  openFields: [],            // champs dépliés dès l'ouverture
  reusePlace: true,          // reprendre le lieu de la dernière entrée
  mood: "",                  // identifiant d'humeur pré-sélectionné
  energy: "",
  stress: "",
  marker: ""
};

var DEFAULT_OPTIONS = {
  sky: true,              // ciel animé sur la bannière
  skyIntensity: "soft",   // soft | full
  moodAnim: true,         // anneau d'humeur animé
  bannerHeight: 150,      // px
  moodDisplay: "emoji",   // emoji | image
  showWeatherGauge: false // jauge météo séparée (redondante avec le ciel)
};

var DEFAULTS = {
  form: DEFAULT_FORM,
  moodTree: DEFAULT_MOOD_TREE,
  energy: DEFAULT_ENERGY,
  stress: DEFAULT_STRESS,
  banner: {fallback:"#2b2e37", slices: DEFAULT_BANNER_SLICES},
  markers: DEFAULT_MARKERS,
  options: DEFAULT_OPTIONS
};

function deepClone(x){return JSON.parse(JSON.stringify(x));}

function read(wiki){
  var raw = wiki.getTiddlerText(CONFIG_TIDDLER,"");
  var parsed = null;
  try{ parsed = raw ? JSON.parse(raw) : null; }catch(e){ parsed = null; }
  var cfg = deepClone(DEFAULTS);
  if(parsed && typeof parsed === "object"){
    if(Array.isArray(parsed.moodTree) && parsed.moodTree.length){cfg.moodTree = parsed.moodTree;}
    if(Array.isArray(parsed.energy) && parsed.energy.length === 6){cfg.energy = parsed.energy;}
    if(Array.isArray(parsed.stress) && parsed.stress.length === 6){cfg.stress = parsed.stress;}
    if(Array.isArray(parsed.markers) && parsed.markers.length){cfg.markers = parsed.markers;}
    if(parsed.banner && typeof parsed.banner === "object"){
      if(parsed.banner.fallback){cfg.banner.fallback = parsed.banner.fallback;}
      if(Array.isArray(parsed.banner.slices) && parsed.banner.slices.length){cfg.banner.slices = parsed.banner.slices;}
    }
    if(parsed.options && typeof parsed.options === "object"){
      Object.keys(DEFAULT_OPTIONS).forEach(function(k){
        if(parsed.options[k] !== undefined){cfg.options[k] = parsed.options[k];}
      });
    }
    if(parsed.form && typeof parsed.form === "object"){
      Object.keys(DEFAULT_FORM).forEach(function(k){
        if(parsed.form[k] === undefined){return;}
        if(k === "backdrop" && typeof parsed.form.backdrop === "object"){
          Object.keys(DEFAULT_FORM.backdrop).forEach(function(b){
            if(parsed.form.backdrop[b] !== undefined){cfg.form.backdrop[b] = parsed.form.backdrop[b];}
          });
          return;
        }
        cfg.form[k] = parsed.form[k];
      });
    }
  }
  return cfg;
}

function write(wiki,cfg){
  var old = wiki.getTiddler(CONFIG_TIDDLER),
      fields = {title:CONFIG_TIDDLER, type:"application/json", text:JSON.stringify(cfg,null,2)};
  wiki.addTiddler(old ? new $tw.Tiddler(old,fields,{modified:new Date()})
                      : new $tw.Tiddler(fields,{created:new Date(),modified:new Date()}));
}

function resetSection(wiki,section){
  var cfg = read(wiki);
  cfg[section] = deepClone(DEFAULTS[section]);
  write(wiki,cfg);
  return cfg;
}

/* ---------- couleurs d'humeur ---------- */

function principals(cfg){return (cfg.moodTree||[]).slice();}

function moodStops(cfg){
  /* Renvoie [{value,color}] trié par valeur croissante, dédoublonné. */
  var out=[], seen=Object.create(null);
  principals(cfg).forEach(function(p){
    var v = Number(p.value);
    if(isNaN(v) || seen[v]) {return;}
    seen[v]=true;
    out.push({value:v, color:p.color || "#8f8f8f"});
  });
  out.sort(function(a,b){return a.value-b.value;});
  return out;
}

function hexRgb(hex){
  var h=String(hex||"#888888").replace("#","");
  if(h.length===3){h=h.split("").map(function(c){return c+c;}).join("");}
  var n=parseInt(h,16);
  if(isNaN(n)){return [136,136,136];}
  return [(n>>16)&255,(n>>8)&255,n&255];
}

function moodColor(cfg,value){
  if(value===null || value===undefined || isNaN(value)){return "var(--ja-border)";}
  var stops = moodStops(cfg);
  if(!stops.length){return "var(--ja-border)";}
  var v = Number(value);
  if(v <= stops[0].value){return stops[0].color;}
  if(v >= stops[stops.length-1].value){return stops[stops.length-1].color;}
  for(var i=0;i<stops.length-1;i++){
    var a=stops[i], b=stops[i+1];
    if(v>=a.value && v<=b.value){
      var t=(v-a.value)/(b.value-a.value||1), ca=hexRgb(a.color), cb=hexRgb(b.color);
      return "rgb("+Math.round(ca[0]+(cb[0]-ca[0])*t)+","+
                    Math.round(ca[1]+(cb[1]-ca[1])*t)+","+
                    Math.round(ca[2]+(cb[2]-ca[2])*t)+")";
    }
  }
  return stops[stops.length-1].color;
}

function findMood(cfg,principalId,nuanceId){
  var res={principal:null,nuance:null};
  principals(cfg).forEach(function(p){
    if(p.id===principalId){res.principal=p;}
    (p.children||[]).forEach(function(c){
      if(c.id===nuanceId){res.nuance=c; if(!res.principal){res.principal=p;}}
    });
  });
  return res;
}

/* Retrouve le principal le plus proche d'une valeur (pour les entrées
   anciennes qui ne stockent qu'un mood-value). */
function principalForValue(cfg,value){
  var best=null,bd=Infinity;
  principals(cfg).forEach(function(p){
    var d=Math.abs(Number(p.value)-Number(value));
    if(d<bd){bd=d;best=p;}
  });
  return best;
}

/* ---------- bannière ---------- */

function pickBanner(cfg,globalMood){
  var slices=(cfg.banner&&cfg.banner.slices)||[],
      fallback=(cfg.banner&&cfg.banner.fallback)||"#2b2e37";
  if(globalMood===null||globalMood===undefined||isNaN(globalMood)){
    return {type:"color", color:fallback, slice:null};
  }
  var v=Math.max(1,Math.min(5,Number(globalMood))), hit=null;
  for(var i=0;i<slices.length;i++){
    if(v>=slices[i].min && v<=slices[i].max){hit=slices[i];break;}
  }
  if(!hit){
    var bd=Infinity;
    slices.forEach(function(s){
      var d = v<s.min ? s.min-v : (v>s.max ? v-s.max : 0);
      if(d<bd){bd=d;hit=s;}
    });
  }
  if(!hit){return {type:"color", color:fallback, slice:null};}
  if(hit.image){return {type:"image", image:hit.image, color:hit.color||fallback, slice:hit};}
  return {type:"color", color:hit.color||fallback, slice:hit};
}

/* Résout une référence d'image : titre de tiddler -> data URI. */
function imageSrc(wiki,ref){
  if(!ref){return "";}
  if(/^(data:|https?:|\.\/|\/)/.test(ref)){return ref;}
  var t=wiki.getTiddler(ref);
  if(!t){return "";}
  var type=String(t.fields.type||"image/png"), text=String(t.fields.text||"");
  if(type==="image/svg+xml" && text.indexOf("<")===0){
    return "data:image/svg+xml;base64,"+(typeof btoa==="function"?btoa(unescape(encodeURIComponent(text))):"");
  }
  if(t.fields._canonical_uri){return String(t.fields._canonical_uri);}
  return "data:"+type+";base64,"+text.replace(/\s+/g,"");
}

exports.CONFIG_TIDDLER = CONFIG_TIDDLER;
exports.DEFAULTS = DEFAULTS;
exports.read = read;
exports.write = write;
exports.resetSection = resetSection;
exports.deepClone = deepClone;
exports.moodColor = moodColor;
exports.moodStops = moodStops;
exports.principals = principals;
exports.findMood = findMood;
exports.principalForValue = principalForValue;
exports.pickBanner = pickBanner;
exports.imageSrc = imageSrc;
