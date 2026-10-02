/*\
title: $:/journalapp/modules/lib/entities.js
type: application/javascript
module-type: library

Mon Journal — noyau partagé des entités liées.
Une seule source de vérité pour : définitions, création des fiches,
recherche locale et autocomplétion géographique.
\*/
"use strict";

var DEFINITIONS = {
  person:   {tag:"Relations",kind:"person",field:"people",label:"Personnes",placeholder:"Emma, Julian…"},
  activity: {tag:"Activité",kind:"activity",field:"activities",label:"Activités",placeholder:"Lecture, Balade…"},
  project:  {tag:"Projet",kind:"project",field:"projects",label:"Projets",placeholder:"Mon Journal, Projet X…"},
  event:    {tag:"Agenda",kind:"event",field:"events",label:"Événements",placeholder:"Road to Agde, Rendez-vous…"},
  todo:     {tag:"Agenda",kind:"todo",field:"todos",label:"To-dos",placeholder:"Appeler, dossier, tâche…"},
  habit:    {tag:"Agenda",kind:"habit",field:"habits",label:"Habitudes",placeholder:"Lecture, sport, médicaments…"},
  media:    {tag:"Média",kind:"media",field:"media",label:"Médias",placeholder:"Film, livre, musique…"},
  sleep:    {tag:"Sommeil",kind:"sleep-entry",field:"sleep",label:"Sommeil",placeholder:"Nuit du 10 août, Sieste…"},
  place:    {tag:"Lieux",kind:"place",field:"places",label:"Lieux",placeholder:"Adresse, ville, lieu…"}
};

function tagsOf(t) {
  if(!t || !t.fields) {return [];}
  if(Array.isArray(t.fields.tags)) {return t.fields.tags.slice();}
  return $tw.utils.parseStringArray(String(t.fields.tags || "")) || [];
}
function isDraftTiddler(t,title) {
  return !!(t && t.fields && (t.fields["draft.of"] || String(title || t.fields.title || "").indexOf("Draft of ") === 0));
}
function normalize(s) {
  s=String(s||"");
  try{s=s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");}catch(e){}
  return s.toLowerCase();
}
function uniqueStrings(arr) {
  var out=[],seen=Object.create(null);
  (arr||[]).forEach(function(value){
    value=String(value||"").trim();
    if(!value){return;}
    var key=normalize(value);
    if(!seen[key]){seen[key]=true;out.push(value);}
  });
  return out;
}
function parseList(value) {
  if(Array.isArray(value)){return uniqueStrings(value);}
  if(value===undefined || value===null || value===""){return [];}
  return uniqueStrings($tw.utils.parseStringArray(String(value)) || []);
}
function stringifyList(values) {return $tw.utils.stringifyList(uniqueStrings(values||[]));}
function defOf(typeOrDef) {return typeof typeOrDef === "string" ? DEFINITIONS[typeOrDef] : typeOrDef;}

function ensureEntity(wiki,typeOrDef,title,extraFields) {
  var def=defOf(typeOrDef);
  title=String(title||"").trim();
  if(!wiki || !def || !title || title.indexOf("$:/")===0 || title.indexOf("Draft of ")===0){return null;}
  var old=wiki.getTiddler(title),now=new Date(),fields={},tags;
  if(old) {
    if(isDraftTiddler(old,title)){return null;}
    tags=tagsOf(old);
    if(tags.indexOf(def.tag)===-1){tags.push(def.tag);fields.tags=tags;}
    if(!old.fields.kind){fields.kind=def.kind;}
    Object.keys(extraFields||{}).forEach(function(k){
      var v=extraFields[k];
      if(v!==undefined && v!==null && String(v)!=="" && String(old.fields[k]||"")!==String(v)){fields[k]=String(v);}
    });
    if(Object.keys(fields).length){wiki.addTiddler(new $tw.Tiddler(old,fields,{modified:now}));}
    return wiki.getTiddler(title);
  }
  fields={title:title,tags:[def.tag],kind:def.kind,text:""};
  Object.keys(extraFields||{}).forEach(function(k){var v=extraFields[k];if(v!==undefined&&v!==null&&String(v)!==""){fields[k]=String(v);}});
  wiki.addTiddler(new $tw.Tiddler(fields,{created:now,modified:now}));
  return wiki.getTiddler(title);
}

function localSuggestions(wiki,typeOrDef,query) {
  var def=defOf(typeOrDef),q=normalize(query),out=[];
  if(!wiki||!def){return out;}
  wiki.each(function(t,title){
    if(!t||!t.fields||title.indexOf("$:/")===0||isDraftTiddler(t,title)){return;}
    if(tagsOf(t).indexOf(def.tag)===-1){return;}
    var address=String(t.fields.address||""),nt=normalize(title),hay=nt+" "+normalize(address),score=3;
    if(q){
      if(nt===q){score=0;}
      else if(nt.indexOf(q)===0){score=1;}
      else if(hay.indexOf(q)!==-1){score=2;}
      else{return;}
    }
    out.push({value:title,label:title,existing:true,source:"local",address:address,
      latitude:t.fields.latitude!=null?t.fields.latitude:t.fields.lat,
      longitude:t.fields.longitude!=null?t.fields.longitude:(t.fields.lon!=null?t.fields.lon:t.fields.lng),score:score});
  });
  out.sort(function(a,b){return a.score-b.score||a.label.localeCompare(b.label,"fr",{sensitivity:"base"});});
  return out.slice(0,10);
}

function cleanParts(parts){var out=[],seen=Object.create(null);(parts||[]).forEach(function(p){p=String(p||"").trim();if(!p){return;}var k=normalize(p);if(!seen[k]){seen[k]=true;out.push(p);}});return out;}
function parseIGN(r){
  r=r||{};var full=String(r.fulltext||r.label||r.name||"").trim();
  if(!full){full=cleanParts([r.street,r.zipcode,r.city]).join(", ");}
  if(!full){return null;}
  return {value:full,label:full,source:"IGN Géoplateforme",existing:false,address:full,
    latitude:r.y!=null?r.y:(r.latitude!=null?r.latitude:null),longitude:r.x!=null?r.x:(r.longitude!=null?r.longitude:null)};
}
function parsePhoton(feature){
  if(!feature||!feature.properties){return null;}
  var p=feature.properties||{},c=feature.geometry&&feature.geometry.coordinates||[],street=String(p.street||"").trim(),number=String(p.housenumber||"").trim(),name=String(p.name||"").trim(),city=String(p.city||p.locality||p.county||"").trim(),postcode=String(p.postcode||"").trim(),region=String(p.state||"").trim(),country=String(p.country||"").trim(),primary="";
  if(street){primary=(number?number+" ":"")+street;}else{primary=name||city||region||country;}
  if(!primary){return null;}
  var context=cleanParts([postcode&&city?postcode+" "+city:(city||postcode),region,country]),label=cleanParts([primary].concat(context)).join(", ");
  return {value:label,label:label,source:"Photon / OpenStreetMap",existing:false,address:label,latitude:c.length>1?c[1]:null,longitude:c.length>1?c[0]:null};
}
function mergeSuggestions(groups){
  var out=[],seen=Object.create(null);
  (groups||[]).forEach(function(group){(group||[]).forEach(function(s){if(!s||!s.value){return;}var k=normalize(s.value);if(seen[k]){return;}seen[k]=true;out.push(s);});});
  return out;
}
async function fetchPlaceSuggestions(query,signal) {
  query=String(query||"").trim();if(query.length<2){return [];}
  async function ign(){
    try{var u="https://data.geopf.fr/geocodage/completion/?text="+encodeURIComponent(query)+"&type=StreetAddress,PositionOfInterest&maximumResponses=8",r=await fetch(u,{signal:signal,headers:{"Accept":"application/json"}});if(!r.ok){return [];}var d=await r.json();return ((d&&d.results)||[]).map(parseIGN).filter(Boolean);}catch(e){return [];}
  }
  async function photon(){
    try{var u="https://photon.komoot.io/api/?q="+encodeURIComponent(query)+"&limit=8&lang=fr",r=await fetch(u,{signal:signal,headers:{"Accept":"application/json"}});if(!r.ok){return [];}var d=await r.json();return ((d&&d.features)||[]).map(parsePhoton).filter(Boolean);}catch(e){return [];}
  }
  var both=await Promise.all([ign(),photon()]);return mergeSuggestions(both).slice(0,10);
}
async function ensurePlace(wiki,title,address,suggestion) {
  title=String(title||"").trim();address=String(address||"").trim();suggestion=suggestion||{};
  if(!title){return null;}
  var extra={},lat=suggestion.latitude,lon=suggestion.longitude;
  if(address||suggestion.address){extra.address=address||suggestion.address;}
  if(lat!=null&&String(lat)!==""){extra.latitude=lat;}
  if(lon!=null&&String(lon)!==""){extra.longitude=lon;}
  var current=ensureEntity(wiki,"place",title,extra),f=current?current.fields:{};
  var curLat=parseFloat(f.latitude!=null?f.latitude:f.lat),curLon=parseFloat(f.longitude!=null?f.longitude:(f.lon!=null?f.lon:f.lng));
  if(!isNaN(curLat)&&!isNaN(curLon)){return current;}
  var q=address||String(f.address||"")||title,remote=await fetchPlaceSuggestions(q);
  if(remote.length){var hit=remote[0],add={address:hit.address||q};if(hit.latitude!=null){add.latitude=hit.latitude;}if(hit.longitude!=null){add.longitude=hit.longitude;}current=ensureEntity(wiki,"place",title,add);}
  return current;
}

exports.DEFINITIONS=DEFINITIONS;
exports.tagsOf=tagsOf;
exports.isDraftTiddler=isDraftTiddler;
exports.normalize=normalize;
exports.uniqueStrings=uniqueStrings;
exports.parseList=parseList;
exports.stringifyList=stringifyList;
exports.ensureEntity=ensureEntity;
exports.ensurePlace=ensurePlace;
exports.localSuggestions=localSuggestions;
exports.fetchPlaceSuggestions=fetchPlaceSuggestions;
exports.mergeSuggestions=mergeSuggestions;
