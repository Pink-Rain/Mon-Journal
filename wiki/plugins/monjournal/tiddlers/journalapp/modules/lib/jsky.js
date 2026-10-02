/*\
title: $:/journalapp/modules/lib/jsky.js
type: application/javascript
module-type: library

Mon Journal — le ciel animé.
Port du widget d'Obsidian : le rang météo porte toute la logique visuelle,
l'heure donne la phase. Fond dégradé, astre, nuages, pluie, neige, orage,
arc-en-ciel. Il vit dans une carte, pas en fond de page.
\*/
"use strict";

var CLOUD_MAX_RANK = 4;

/* Open-Meteo -> rang de l'échelle (0 dégagé … 8 orage, 9 arc-en-ciel) */
function rankFromCode(code){
  code = Number(code);
  if(isNaN(code)){return -1;}
  if(code === 0){return 0;}
  if(code === 1){return 1;}
  if(code === 2){return 2;}
  if(code === 45 || code === 48){return 3;}
  if(code === 3){return 4;}
  if([51,53,55,56,57].indexOf(code) !== -1){return 5;}
  if([61,63,65,66,67,80,81,82].indexOf(code) !== -1){return 6;}
  if([71,73,75,77,85,86].indexOf(code) !== -1){return 7;}
  if([95,96,99].indexOf(code) !== -1){return 8;}
  return 2;
}

var EMOJI_BY_RANK = ["☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","🌨️","⛈️","🌈"];
var LABEL_BY_RANK = ["Ciel dégagé","Plutôt dégagé","Nuageux","Brumeux","Couvert",
                     "Averses","Pluie","Neige","Orage","Éclaircie"];

function emojiForRank(rank){
  if(rank < 0){return "";}
  return EMOJI_BY_RANK[Math.max(0,Math.min(9,rank))] || "";
}
function labelForRank(rank){
  if(rank < 0){return "";}
  return LABEL_BY_RANK[Math.max(0,Math.min(9,rank))] || "";
}

/* Dominante d'une journée : rang max, adouci d'un cran si tout le monde
   est au même niveau nuageux. */
function dominantRank(codes){
  var ranks = (codes||[]).map(rankFromCode).filter(function(r){return r >= 0;});
  if(!ranks.length){return -1;}
  var max = Math.max.apply(null,ranks);
  if(max > 0 && max <= CLOUD_MAX_RANK && ranks.length >= 2){
    var atMax = ranks.filter(function(r){return r === max;}).length;
    if(atMax === ranks.length){return max - 1;}
  }
  return max;
}

function phaseForHour(h){
  if(h < 6 || h >= 21){return "night";}
  if(h < 8){return "dawn";}
  if(h >= 18){return "dusk";}
  return "day";
}

function features(rank){
  var f = {luminaryHidden:false, cloudMin:0, cloudMax:0, band:"all",
           rain:0, snow:false, storm:false, rainbow:false, wet:false};
  switch(rank){
    case 0: break;
    case 1: f.cloudMin=1; f.cloudMax=2; f.band="top"; break;
    case 2: f.cloudMin=2; f.cloudMax=4; f.band="upper"; break;
    case 3: f.cloudMin=4; f.cloudMax=6; f.luminaryHidden=true; break;
    case 4: f.cloudMin=6; f.cloudMax=9; f.luminaryHidden=true; break;
    case 5: f.cloudMin=4; f.cloudMax=6; f.rain=1; f.wet=true; break;
    case 6: f.cloudMin=6; f.cloudMax=9; f.rain=2; f.wet=true; f.luminaryHidden=true; break;
    case 7: f.cloudMin=6; f.cloudMax=9; f.snow=true; f.luminaryHidden=true; break;
    case 8: f.cloudMin=6; f.cloudMax=9; f.rain=2; f.storm=true; f.wet=true; f.luminaryHidden=true; break;
    case 9: f.cloudMin=2; f.cloudMax=5; f.rain=1; f.rainbow=true; f.wet=true; break;
    default: break;
  }
  return f;
}

function el(doc,parent,tag,cls,text){
  var n = doc.createElement(tag);
  if(cls){n.className = cls;}
  if(text != null){n.textContent = text;}
  if(parent){parent.appendChild(n);}
  return n;
}

function reducedMotion(){
  try{ return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch(e){ return false; }
}

var BANDS = {top:[2,22], upper:[2,46], all:[2,70]};

var BACKGROUNDS = {
  "day":        "linear-gradient(180deg, #7db4e0 0%, #aed3ec 55%, #cfe3f0 100%)",
  "dawn":       "linear-gradient(180deg, #48688f 0%, #c98d8a 55%, #f0c9a8 100%)",
  "dusk":       "linear-gradient(180deg, #3a4a72 0%, #a5688a 55%, #e39a6c 100%)",
  "night":      "linear-gradient(180deg, #0e1430 0%, #1b2547 55%, #29305a 100%)",
  "day-wet":    "linear-gradient(180deg, #4d7ba6 0%, #6f9dc4 55%, #96b8d1 100%)",
  "dawn-wet":   "linear-gradient(180deg, #354d6d 0%, #9a6f75 55%, #c39c85 100%)",
  "dusk-wet":   "linear-gradient(180deg, #2b3757 0%, #7f5270 55%, #b3785a 100%)",
  "night-wet":  "linear-gradient(180deg, #080d24 0%, #141c3a 55%, #1f2549 100%)"
};

/*
  Peint la scène dans `host`.
  opts : {rank, hour}
*/
function paint(doc,host,opts){
  opts = opts || {};
  var rank = opts.rank === undefined ? -1 : opts.rank,
      hour = opts.hour === undefined ? new Date().getHours() : opts.hour,
      phase = phaseForHour(hour),
      f = features(rank),
      still = reducedMotion();

  host.innerHTML = "";
  host.className = "ja-sky ja-sky-" + phase + (f.wet ? " ja-sky-wet" : "") + (still ? " ja-sky-still" : "");
  /* le fond en dur : il ne dépend pas de la feuille de style */
  host.style.background = BACKGROUNDS[phase + (f.wet ? "-wet" : "")] || BACKGROUNDS.day;

  var n = f.cloudMax > 0
    ? f.cloudMin + Math.floor(Math.random() * (f.cloudMax - f.cloudMin + 1))
    : 0;

  /* astre + étoiles */
  if(phase === "night"){
    var stars = el(doc,host,"div","ja-sky-stars"),
        starCount = n >= 6 ? 5 : (n >= 3 ? 9 : 14);
    for(var i = 0; i < starCount; i++){
      var s = el(doc,stars,"div","ja-star");
      s.style.left = (Math.random()*100).toFixed(1) + "%";
      s.style.top = (Math.random()*62).toFixed(1) + "%";
      s.style.animationDelay = (Math.random()*3).toFixed(2) + "s";
      s.style.setProperty("--ja-star-size",(1 + Math.random()*1.6).toFixed(1) + "px");
    }
    var moon = el(doc,host,"div","ja-sky-moon");
    if(f.luminaryHidden){moon.classList.add("is-hidden");}
  }else{
    var sun = el(doc,host,"div","ja-sky-sun ja-sky-sun-" + phase);
    if(f.luminaryHidden){sun.classList.add("is-hidden");}
  }

  /* nuages — trajet en px, recalculé une fois la largeur connue */
  if(n > 0){
    var skyW = host.offsetWidth || host.clientWidth || 260,
        range = BANDS[f.band] || BANDS.all,
        bTop = range[0], bH = range[1] - range[0],
        slots = [];
    for(var k = 0; k < n; k++){slots.push(k);}
    for(var a = slots.length - 1; a > 0; a--){
      var b = Math.floor(Math.random()*(a+1)), tmp = slots[a];
      slots[a] = slots[b]; slots[b] = tmp;
    }
    for(var c = 0; c < n; c++){
      var cloud = el(doc,host,"div","ja-cloud"),
          step = n > 1 ? bH/(n-1) : 0,
          top = bTop + slots[c]*step + (Math.random()*5 - 2.5);
      cloud.style.top = Math.max(0,Math.min(bTop+bH,top)).toFixed(1) + "%";
      var dur = 26 + Math.random()*34;
      cloud.style.animationDuration = dur.toFixed(1) + "s";
      cloud.style.animationDelay = (-((c + Math.random()*0.8)/n)*dur).toFixed(1) + "s";
      var scale = (0.6 + Math.random()*0.7).toFixed(2);
      cloud.style.setProperty("--ja-cloud-scale",scale);
      var pad = 150*parseFloat(scale) + 40;
      cloud.style.setProperty("--ja-cloud-from",(-pad).toFixed(0) + "px");
      cloud.style.setProperty("--ja-cloud-to",(skyW + pad).toFixed(0) + "px");
      cloud.style.zIndex = String(1 + Math.round(parseFloat(scale)*4));
      cloud.style.setProperty("--ja-cloud-alpha",(0.86 + Math.random()*0.14).toFixed(2));
    }
    /* la carte peut être encore repliée au premier rendu : on remesure */
    if(typeof requestAnimationFrame === "function"){
      requestAnimationFrame(function(){
        var w = host.offsetWidth;
        if(!w || Math.abs(w - skyW) <= 2){return;}
        Array.prototype.forEach.call(host.querySelectorAll(".ja-cloud"),function(cl){
          var sc = parseFloat(cl.style.getPropertyValue("--ja-cloud-scale")) || 1,
              p = 150*sc + 40;
          cl.style.setProperty("--ja-cloud-from",(-p).toFixed(0) + "px");
          cl.style.setProperty("--ja-cloud-to",(w + p).toFixed(0) + "px");
        });
      });
    }
  }

  /* pluie */
  if(f.rain > 0){
    var rain = el(doc,host,"div","ja-rain"),
        drops = f.rain >= 2 ? 30 : 16;
    for(var r = 0; r < drops; r++){
      var d = el(doc,rain,"div","ja-raindrop");
      d.style.left = (Math.random()*100).toFixed(1) + "%";
      d.style.animationDelay = (Math.random()*1.2).toFixed(2) + "s";
      d.style.animationDuration = (0.5 + Math.random()*0.4).toFixed(2) + "s";
    }
  }

  /* neige */
  if(f.snow){
    var snow = el(doc,host,"div","ja-snow");
    for(var sf = 0; sf < 16; sf++){
      var flake = el(doc,snow,"div","ja-snowflake","❄");
      flake.style.left = (Math.random()*100).toFixed(1) + "%";
      flake.style.animationDelay = (Math.random()*4).toFixed(2) + "s";
      flake.style.animationDuration = (4 + Math.random()*4).toFixed(2) + "s";
    }
  }

  /* orage */
  if(f.storm && !still){
    el(doc,host,"div","ja-storm-flash");
    var bolt = el(doc,host,"div","ja-bolt");
    bolt.innerHTML = '<svg viewBox="0 0 60 140" width="38" height="96" xmlns="http://www.w3.org/2000/svg" fill="none">'+
      '<path d="M34 2 L18 54 L32 58 L14 110 L40 50 L26 46 Z" fill="#fff7c8" opacity="0.9"/>'+
      '<path d="M34 2 L18 54 L32 58 L14 110 L40 50 L26 46 Z" fill="#ffffff"/>'+
      '<path d="M28 60 L36 74 L24 82" stroke="#fff7c8" stroke-width="1.4" fill="none" stroke-linecap="round"/>'+
      '</svg>';
  }

  /* arc-en-ciel : sous les nuages, pieds hors cadre */
  if(f.rainbow){
    var rb = el(doc,host,"div","ja-rainbow"),
        bands = ["#e88f8f","#eeb681","#ecd98c","#9ed09a","#8fbde4","#b099d6"],
        W = 300, H = 200, BW = 13, cx = W/2, cy = 250, R0 = 232,
        arcs = bands.map(function(col,i){
          var R = R0 - i*BW;
          return '<path d="M '+(cx-R)+' '+cy+' A '+R+' '+R+' 0 0 1 '+(cx+R)+' '+cy+
                 '" fill="none" stroke="'+col+'" stroke-width="'+(BW+1)+'" stroke-linecap="butt"/>';
        }).join("");
    rb.innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="100%" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">'+
      '<defs><filter id="ja-rb-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>'+
      '<linearGradient id="ja-rb-mask" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="#fff" stop-opacity="1"/>'+
      '<stop offset="70%" stop-color="#fff" stop-opacity="0.85"/>'+
      '<stop offset="100%" stop-color="#fff" stop-opacity="0.15"/></linearGradient>'+
      '<mask id="ja-rb-fade"><rect x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#ja-rb-mask)"/></mask></defs>'+
      '<g mask="url(#ja-rb-fade)" filter="url(#ja-rb-soft)">'+arcs+'</g></svg>';
  }

  return rank;
}

exports.rankFromCode = rankFromCode;
exports.dominantRank = dominantRank;
exports.emojiForRank = emojiForRank;
exports.labelForRank = labelForRank;
exports.phaseForHour = phaseForHour;
exports.features = features;
exports.paint = paint;
exports.reducedMotion = reducedMotion;
