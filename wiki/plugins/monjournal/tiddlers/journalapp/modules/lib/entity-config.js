/*\
title: $:/journalapp/modules/lib/entity-config.js
type: application/javascript
module-type: library

Mon Journal — configuration partagée des formulaires Relations, Lieux, Média et Sommeil.
Les valeurs vivent dans des tiddlers JSON afin que les formulaires et les Settings
lisent exactement la même source.
\*/
"use strict";

var RELATIONS="$:/journalapp/config/relations",
    SLEEP="$:/journalapp/config/sleep",
    MEDIA="$:/journalapp/config/media",
    PLACES="$:/journalapp/config/places";

var DEFAULT_RELATIONS={
  relationTypes:[
    {id:"famille",label:"Famille",color:"#c77b83",emoji:"🏠",image:""},
    {id:"ami",label:"Ami·e",color:"#7a9e6c",emoji:"🤝",image:""},
    {id:"partenaire",label:"Partenaire",color:"#cb8bad",emoji:"♥",image:""},
    {id:"travail",label:"Travail",color:"#8da07e",emoji:"💼",image:""},
    {id:"connaissance",label:"Connaissance",color:"#6e9fa0",emoji:"◌",image:""},
    {id:"autre",label:"Autre",color:"#9a92a6",emoji:"•",image:""}
  ]
};

var DEFAULT_SLEEP={
  qualities:[
    {id:"terrible",label:"Terrible",emoji:"😵",image:"",color:"#b0787e",value:1},
    {id:"mauvaise",label:"Mauvaise",emoji:"😫",image:"",color:"#c77b83",value:2},
    {id:"correcte",label:"Correcte",emoji:"😐",image:"",color:"#d9b96b",value:3},
    {id:"bonne",label:"Bonne",emoji:"😮",image:"",color:"#9fb072",value:4},
    {id:"excellente",label:"Excellente",emoji:"😴",image:"",color:"#7a9e6c",value:5}
  ]
};

var DEFAULT_PLACES={
  types:[
    ["maison","Maison"],
    ["travail","Travail"],
    ["sante","Santé"],
    ["commerce","Commerce"],
    ["restauration","Restaurant / café"],
    ["loisirs","Loisirs"],
    ["nature","Nature"],
    ["transport","Transport"],
    ["ville","Ville / quartier"],
    ["hebergement","Hébergement"],
    ["autre","Autre"]
  ]
};

var DEFAULT_MEDIA={
  book:{
    formats:["Roman","Essai","Poésie","Théâtre","Nouvelles","Roman graphique / BD / Manga","Beau livre","Autre"],
    genres:["Contemporain","Fantasy","Science-fiction","Fantastique","Policier","Thriller","Horreur","Romance","Historique","Biographie","Philosophie","Sciences humaines","Poésie","Humour","Jeunesse"],
    statuses:["À lire","En cours","Lu","Abandonné"]
  },
  music:{
    formats:["Album","EP","Single","Morceau","Playlist","Bande originale","Live","Autre"],
    genres:["Pop","Rock","Indie","Rap / Hip-hop","R&B / Soul","Électro","Metal","Punk","Folk","Jazz","Classique","Country","Reggae","Ambient","Expérimental"],
    statuses:["À écouter","En écoute","Écouté"]
  },
  videogame:{
    formats:["Jeu complet","Extension / DLC","Jeu épisodique","Autre"],
    genres:["RPG","Action","Aventure","Action-aventure","Stratégie","Simulation","Gestion","Puzzle","Horreur","Plateforme","Roguelike","Survie","Visual novel","Course","Combat","MMO"],
    platforms:["PC","PlayStation 5","PlayStation 4","Xbox Series","Xbox One","Nintendo Switch","Steam Deck","Mobile","Web","Ancienne console"],
    statuses:["À jouer","En cours","Terminé","100 %","Abandonné"]
  },
  boardgame:{
    formats:["Jeu de plateau","Jeu de cartes","Jeu de rôle","Jeu d’ambiance","Jeu abstrait","Autre"],
    genres:["Coopératif","Compétitif","Deck-building","Placement d’ouvriers","Gestion","Déduction","Enquête","Narratif","Stratégie","Party game","Draft","Roll & write","Legacy"],
    statuses:["À découvrir","Joué","Régulier"]
  },
  series:{
    formats:["Série","Mini-série","Animation","Anime","Docu-série","Anthologie","Autre"],
    genres:["Drame","Comédie","Policier","Thriller","Science-fiction","Fantasy","Fantastique","Horreur","Romance","Historique","Documentaire","Animation"],
    statuses:["À voir","En cours","En pause","Terminée","Abandonnée"]
  },
  film:{
    formats:["Film","Animation","Documentaire","Court-métrage","Concert","Autre"],
    genres:["Drame","Comédie","Policier","Thriller","Science-fiction","Fantasy","Fantastique","Horreur","Romance","Historique","Documentaire","Animation","Action","Aventure"],
    statuses:["À voir","Vu","Abandonné"]
  },
  other:{
    formats:["Autre"],
    genres:[],
    statuses:["À découvrir","En cours","Terminé"]
  }
};

function clone(v){return JSON.parse(JSON.stringify(v));}
function readJson(wiki,title,defaults){
  var raw=wiki.getTiddlerText(title,""),data;
  try{data=raw?JSON.parse(raw):{};}catch(e){data={};}
  if(!data||typeof data!=="object"||Array.isArray(data)){data={};}
  var out=clone(defaults);
  Object.keys(data).forEach(function(k){out[k]=data[k];});
  return out;
}
function writeJson(wiki,title,value){
  wiki.addTiddler(new $tw.Tiddler({
    title:title,type:"application/json",text:JSON.stringify(value,null,2)
  },{modified:new Date()}));
}
function relationType(cfg,id){
  id=String(id||"");
  var out=null;
  ((cfg&&cfg.relationTypes)||[]).some(function(x){
    if(String(x.id||"")===id){out=x;return true;}return false;
  });
  return out;
}
function sleepQuality(cfg,id){
  id=String(id||"");
  var out=null;
  ((cfg&&cfg.qualities)||[]).some(function(x){
    if(String(x.id||"")===id){out=x;return true;}return false;
  });
  return out;
}
function slug(s){
  s=String(s||"").trim().toLowerCase();
  try{s=s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");}catch(e){}
  return s.replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||("type-"+Date.now().toString(36));
}

exports.RELATIONS=RELATIONS;
exports.SLEEP=SLEEP;
exports.MEDIA=MEDIA;
exports.PLACES=PLACES;
exports.DEFAULT_RELATIONS=DEFAULT_RELATIONS;
exports.DEFAULT_SLEEP=DEFAULT_SLEEP;
exports.DEFAULT_MEDIA=DEFAULT_MEDIA;
exports.DEFAULT_PLACES=DEFAULT_PLACES;
exports.readRelations=function(wiki){return readJson(wiki,RELATIONS,DEFAULT_RELATIONS);};
exports.writeRelations=function(wiki,v){writeJson(wiki,RELATIONS,v);};
exports.readSleep=function(wiki){return readJson(wiki,SLEEP,DEFAULT_SLEEP);};
exports.writeSleep=function(wiki,v){writeJson(wiki,SLEEP,v);};
exports.readMedia=function(wiki){return readJson(wiki,MEDIA,DEFAULT_MEDIA);};
exports.readPlaces=function(wiki){return readJson(wiki,PLACES,DEFAULT_PLACES);};
exports.relationType=relationType;
exports.sleepQuality=sleepQuality;
exports.slug=slug;
