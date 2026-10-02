/*\
title: $:/journalapp/modules/startup/entity-pages.js
type: application/javascript
module-type: startup

Mon Journal — lanceurs des formulaires Relations, Lieux, Activités, Projet,
Média, Sommeil et Rêves. Les formulaires eux-mêmes vivent dans entity-forms.js
et le Projet réutilise directement le formulaire Agenda partagé.
\*/
"use strict";

var Forms=require("$:/journalapp/modules/lib/entity-forms.js"),
    AgendaForms=require("$:/journalapp/modules/lib/agenda-forms.js");

exports.name="journalapp-entity-pages";
exports.platforms=["browser"];
exports.after=["render"];
exports.synchronous=true;

exports.startup=function(){
  var MEDIA_TYPES=[
    {id:"book",icon:"📚",label:"Livres"},
    {id:"music",icon:"🎵",label:"Musiques"},
    {id:"videogame",icon:"🎮",label:"Jeux vidéo"},
    {id:"boardgame",icon:"🎲",label:"Jeux de société"},
    {id:"series",icon:"📺",label:"Séries"},
    {id:"film",icon:"🎬",label:"Films"},
    {id:"other",icon:"✦",label:"Autre"}
  ];

  function mk(parent,tag,cls,text){
    var e=document.createElement(tag);if(cls){e.className=cls;}
    if(text!==undefined){e.textContent=text;}if(parent){parent.appendChild(e);}return e;
  }
  function button(parent,cls,text){var b=mk(parent,"button",cls,text);b.type="button";return b;}
  function carryAccent(el){
    var app=document.querySelector(".ja-app");if(!app||!window.getComputedStyle){return;}
    var cs=window.getComputedStyle(app);
    ["--ja-accent","--ja-accent-soft"].forEach(function(name){
      var v=cs.getPropertyValue(name);if(v){el.style.setProperty(name,v.trim());}
    });
  }
  function closeMenu(){var old=document.querySelector(".ja-entity-media-pop");if(old){old.remove();}}
  function mediaMenu(anchor,host){
    closeMenu();
    var pop=mk(document.body,"div","ja-pop ja-entity-media-pop");carryAccent(pop);
    MEDIA_TYPES.forEach(function(mt){
      var b=button(pop,"ja-pop-item",mt.icon+" "+mt.label);
      b.addEventListener("click",function(){closeMenu();Forms.openMedia(host,mt.id,{});});
    });
    var r=anchor.getBoundingClientRect(),w=document.documentElement.clientWidth,h=document.documentElement.clientHeight;
    pop.style.left="8px";pop.style.top="8px";
    var pw=pop.offsetWidth||220,ph=pop.offsetHeight||270,
        left=Math.max(8,Math.min(r.left,w-pw-8)),top=r.bottom+6;
    if(top+ph>h-8){top=Math.max(8,r.top-ph-6);}
    pop.style.left=Math.round(left)+"px";pop.style.top=Math.round(top)+"px";
    function away(e){if(!pop.contains(e.target)&&e.target!==anchor){closeMenu();document.removeEventListener("mousedown",away,true);}}
    setTimeout(function(){document.addEventListener("mousedown",away,true);},0);
  }

  function openDetail(node){
    var title=node&&node.getAttribute?String(node.getAttribute("data-ja-detail-title")||""):"";
    if(!title||!$tw.wiki.getTiddler(title)){return;}
    var current=$tw.wiki.getTiddlerText("$:/state/journalapp/view","");
    if(current&&current!=="$:/journalapp/views/shared/entity-detail"){
      $tw.wiki.setText("$:/state/journalapp/entity-detail-return-view","text",null,current,{suppressTimestamp:true});
    }
    $tw.wiki.setText("$:/state/journalapp/entity-detail","text",null,title,{suppressTimestamp:true});
    $tw.wiki.setText("$:/state/journalapp/view","text",null,"$:/journalapp/views/shared/entity-detail",{suppressTimestamp:true});
    try{$tw.wiki.setText("$:/temp/journalapp/mobile-left","text",null,"closed",{suppressTimestamp:true});}catch(e){}
  }

  document.addEventListener("click",function(event){
    var launcher=event.target&&event.target.closest?event.target.closest("[data-ja-open-entity-form]"):null;
    if(!launcher){
      var detail=event.target&&event.target.closest?event.target.closest("[data-ja-open-entity-detail]"):null;
      if(detail){event.preventDefault();openDetail(detail);}
      return;
    }
    event.preventDefault();event.stopPropagation();
    try{$tw.wiki.setText("$:/temp/journalapp/mobile-left","text",null,"closed",{suppressTimestamp:true});}catch(e){}
    var type=launcher.getAttribute("data-ja-open-entity-form"),
        editTitle=launcher.getAttribute("data-ja-edit-title")||"",
        host={wiki:$tw.wiki,document:document},
        editOpts=editTitle?{editTitle:editTitle}:{};

    /* Les crayons des cards repassent par les mêmes formulaires que la création.
       Aucun second moteur d'édition : un formulaire, deux portes d'entrée. */
    if(type==="sleep-auto"&&editTitle){
      var sleepTid=$tw.wiki.getTiddler(editTitle);
      type=sleepTid&&String(sleepTid.fields.kind||"")==="dream"?"dream":"sleep";
    }

    if(type==="media"){
      if(editTitle){
        var mt=$tw.wiki.getTiddler(editTitle),mediaType=String((mt&&mt.fields["media-type"])||"other");
        Forms.openMedia(host,mediaType,editOpts);
      }else{mediaMenu(launcher,host);}
    }
    else if(type==="project"){AgendaForms.openProject(host,editOpts);}
    else if(type==="person"){Forms.openPerson(host,editOpts);}
    else if(type==="place"){Forms.openPlace(host,editOpts);}
    else if(type==="activity"){Forms.openActivity(host,editOpts);}
    else if(type==="sleep"){Forms.openSleep(host,editOpts);}
    else if(type==="dream"){Forms.openDream(host,editOpts);}
  },true);

  document.addEventListener("keydown",function(event){
    if(event.key!=="Enter"&&event.key!==" "){return;}
    var detail=event.target&&event.target.closest?event.target.closest("[data-ja-open-entity-detail]"):null;
    if(!detail||event.target.closest("[data-ja-open-entity-form]")){return;}
    event.preventDefault();openDetail(detail);
  },true);
};
