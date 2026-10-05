/*\
title: $:/journalapp/modules/lib/relation-modes.js
type: application/javascript
module-type: library

Mon Journal — modes d'interaction attachés à chaque Relation.
Field persistant :
  relation-modes: {"Alex":["irl","msg"],"Sam":["vocal"]}
\*/
"use strict";

var FIELD="relation-modes";
var MODES=[
  {id:"irl",label:"IRL"},
  {id:"vocal",label:"Vocal"},
  {id:"msg",label:"Msg"}
];

function empty(){return Object.create(null);}

function parse(raw){
  var src=raw, out=empty();
  if(!src){return out;}
  if(typeof src==="string"){
    try{src=JSON.parse(src);}catch(e){return out;}
  }
  if(!src||typeof src!=="object"||Array.isArray(src)){return out;}
  Object.keys(src).forEach(function(person){
    var vals=Array.isArray(src[person])?src[person]:[];
    vals=vals.map(String).filter(function(v){
      return MODES.some(function(m){return m.id===v;});
    });
    vals=vals.filter(function(v,i,a){return a.indexOf(v)===i;});
    if(vals.length){out[String(person)]=vals;}
  });
  return out;
}

function remove(map,person){
  if(map&&Object.prototype.hasOwnProperty.call(map,person)){delete map[person];}
}

function selected(map,person,mode){
  return !!(map&&Array.isArray(map[person])&&map[person].indexOf(mode)!==-1);
}

function toggle(map,person,mode){
  map=map||empty();
  var vals=Array.isArray(map[person])?map[person].slice():[],
      i=vals.indexOf(mode);
  if(i===-1){vals.push(mode);}else{vals.splice(i,1);}
  if(vals.length){map[person]=vals;}else{remove(map,person);}
  return map;
}

function prune(map,people){
  map=map||empty();
  var keep=Object.create(null);
  (people||[]).forEach(function(p){keep[String(p)]=true;});
  Object.keys(map).forEach(function(p){
    if(!keep[p]){delete map[p];return;}
    var vals=(map[p]||[]).filter(function(v){
      return MODES.some(function(m){return m.id===v;});
    });
    vals=vals.filter(function(v,i,a){return a.indexOf(v)===i;});
    if(vals.length){map[p]=vals;}else{delete map[p];}
  });
  return map;
}

function stringify(map,people){
  prune(map,people);
  var plain={};
  Object.keys(map||{}).forEach(function(k){
    if(map[k]&&map[k].length){plain[k]=map[k].slice();}
  });
  return Object.keys(plain).length?JSON.stringify(plain):"";
}

function renderPerson(doc,parent,person,map,onRemove){
  var row=doc.createElement("span");
  row.className="ja-relperson";
  row.dataset.person=person;

  var name=doc.createElement("span");
  name.className="ja-relperson-name";
  name.textContent=person;
  row.appendChild(name);

  var modes=doc.createElement("span");
  modes.className="ja-relmodes";
  row.appendChild(modes);

  function draw(){
    Array.prototype.forEach.call(modes.children,function(b){
      b.classList.toggle("is-on",selected(map,person,b.dataset.mode));
      b.setAttribute("aria-pressed",selected(map,person,b.dataset.mode)?"true":"false");
    });
  }

  MODES.forEach(function(m){
    var b=doc.createElement("button");
    b.type="button";
    b.className="ja-relmode";
    b.dataset.mode=m.id;
    b.textContent=m.label;
    b.title=m.label+" avec "+person;
    b.setAttribute("aria-label",m.label+" avec "+person);
    b.addEventListener("click",function(){
      toggle(map,person,m.id);
      draw();
    });
    modes.appendChild(b);
  });

  var x=doc.createElement("button");
  x.type="button";
  x.className="ja-relperson-x";
  x.textContent="×";
  x.title="Retirer "+person;
  x.setAttribute("aria-label","Retirer "+person);
  x.addEventListener("click",function(){
    remove(map,person);
    if(onRemove){onRemove();}
  });
  row.appendChild(x);

  draw();
  parent.appendChild(row);
  return row;
}

exports.FIELD=FIELD;
exports.MODES=MODES;
exports.empty=empty;
exports.parse=parse;
exports.remove=remove;
exports.selected=selected;
exports.toggle=toggle;
exports.prune=prune;
exports.stringify=stringify;
exports.renderPerson=renderPerson;
