/*\
title: $:/journalapp/modules/widgets/journal-settings.js
type: application/javascript
module-type: widget

Mon Journal — réglages.
  <$jacategories/>       : cartes de catégorie (couleur + icône cliquable)
  <$jamedialibrary/>     : bibliothèque d'images, groupes, import, Lucide
  <$jajournalsettings/>  : réglages du Journal, en accordéon

Même grammaire visuelle partout : la carte .ja-settings-card existante.
Rien n'est plus gros que nécessaire.
\*/
(function(){
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;
var JConfig = require("$:/journalapp/modules/lib/jconfig.js");
var Agenda = require("$:/journalapp/modules/lib/agenda.js");
var Media = require("$:/journalapp/modules/lib/jmedia.js");

var LUCIDE_CACHE = "$:/journalapp/cache/lucide-names";
var LUCIDE_CDN = "https://cdn.jsdelivr.net/npm/lucide-static@latest";
var LIB_FOLDER = "$:/journalapp/library";

/* ---------------- DOM ---------------- */
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
function inp(doc,parent,cls,type,value){
  var i=doc.createElement("input");
  if(cls){i.className=cls;}
  i.type=type;
  if(value!==undefined&&value!==null){i.value=value;}
  if(parent){parent.appendChild(i);}
  return i;
}
function slugify(s){
  return String(s||"x").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"x";
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,5);}

function readFile(file){
  return new Promise(function(resolve,reject){
    var r=new FileReader();
    r.onerror=function(){reject(new Error("Lecture impossible."));};
    r.onload=function(){resolve(String(r.result||""));};
    r.readAsDataURL(file);
  });
}
function b64(dataUrl){var c=dataUrl.indexOf(",");return c>=0?dataUrl.slice(c+1):dataUrl;}

async function writeImageTo(wiki,title,file){
  var d=await readFile(file);
  wiki.addTiddler(new $tw.Tiddler({
    title:title,type:file.type||"image/png",text:b64(d),"media-name":file.name||""
  },{modified:new Date()}));
}

/* ---------------- navigateur d'icônes Lucide ---------------- */
async function lucideNames(wiki){
  var cached=wiki.getTiddlerText(LUCIDE_CACHE,"");
  if(cached){
    try{var v=JSON.parse(cached);if(Array.isArray(v)&&v.length){return v;}}catch(e){}
  }
  var res=await fetch(LUCIDE_CDN+"/icon-nodes.json");
  if(!res.ok){throw new Error("Liste Lucide inaccessible.");}
  var data=await res.json(),names=Object.keys(data).sort();
  wiki.addTiddler(new $tw.Tiddler({
    title:LUCIDE_CACHE,type:"application/json",text:JSON.stringify(names)
  },{modified:new Date()}));
  return names;
}

async function lucideSvg(name,color){
  var res=await fetch(LUCIDE_CDN+"/icons/"+name+".svg");
  if(!res.ok){throw new Error("Icône introuvable.");}
  var svg=await res.text();
  return svg.replace(/stroke="currentColor"/g,'stroke="'+(color||"#e8e6ef")+'"');
}

function openIconBrowser(doc,wiki,opts){
  opts=opts||{};
  var overlay=mk(doc,doc.body,"div","ja-ib-overlay"),
      modal=mk(doc,overlay,"div","ja-ib-modal"),
      head=mk(doc,modal,"div","ja-ib-head");
  mk(doc,head,"span","ja-ib-title","Lucide");
  var color=inp(doc,head,"ja-ib-color","color",opts.color||"#e8e6ef");
  var search=inp(doc,head,"ja-ib-search","text","");
  search.placeholder="heart, book, moon…";
  var close=btn(doc,head,"ja-ib-close","×","Fermer");

  var grid=mk(doc,modal,"div","ja-ib-grid"),
      status=mk(doc,modal,"div","ja-ib-status","Chargement…"),
      names=[];

  function dismiss(){overlay.remove();document.removeEventListener("keydown",esc,true);}
  function esc(ev){if(ev.key==="Escape"){dismiss();}}
  document.addEventListener("keydown",esc,true);
  close.addEventListener("click",dismiss);
  overlay.addEventListener("mousedown",function(e){if(e.target===overlay){dismiss();}});

  function draw(){
    var q=search.value.trim().toLowerCase(),
        list=q?names.filter(function(n){return n.indexOf(q)!==-1;}):names;
    grid.innerHTML="";
    status.textContent=list.length+" icône"+(list.length>1?"s":"");
    list.slice(0,300).forEach(function(name){
      var cell=btn(doc,grid,"ja-ib-cell","");
      cell.title=name;
      var im=mk(doc,cell,"img","");
      im.src=LUCIDE_CDN+"/icons/"+name+".svg";
      im.alt="";im.loading="lazy";
      cell.addEventListener("click",async function(){
        cell.classList.add("is-busy");
        try{
          opts.onPick(await lucideSvg(name,color.value),name);
          dismiss();
        }catch(e){
          status.textContent=e&&e.message?e.message:"Téléchargement impossible.";
          cell.classList.remove("is-busy");
        }
      });
    });
  }
  search.addEventListener("input",draw);

  lucideNames(wiki).then(function(n){names=n;draw();search.focus();})
    .catch(function(e){status.textContent=(e&&e.message?e.message:"Erreur")+" — connexion ?";});
}

/*
  Saisie de tag ancrée au clic : champ + suggestions filtrées en direct.
  Rien de modal, on ferme au premier clic à côté.
*/
function tagPrompt(doc,anchor,opts){
  opts=opts||{};
  var old=doc.querySelector(".ja-pop");
  if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop ja-tagpop"),
      rect=anchor.getBoundingClientRect(),
      w=doc.documentElement.clientWidth,
      h=doc.documentElement.clientHeight;

  if(opts.title){mk(doc,pop,"div","ja-tagpop-title",opts.title);}
  var field=inp(doc,pop,"ja-tagpop-input","text",""),
      list=mk(doc,pop,"div","ja-tagpop-list");
  field.placeholder=opts.placeholder||"Tag…";

  function close(){pop.remove();document.removeEventListener("mousedown",away,true);}
  function away(ev){if(!pop.contains(ev.target)){close();}}
  setTimeout(function(){document.addEventListener("mousedown",away,true);},0);

  function commit(value){
    value=String(value||"").trim();
    if(!value){close();return;}
    close();
    opts.onPick(value);
  }
  function draw(){
    var q=field.value.trim().toLowerCase(),
        pool=(opts.suggestions||[]).filter(function(tag){
          return !q||tag.toLowerCase().indexOf(q)!==-1;
        });
    list.innerHTML="";
    pool.slice(0,10).forEach(function(tag){
      var b=btn(doc,list,"ja-pop-item",tag);
      b.addEventListener("mousedown",function(ev){ev.preventDefault();});
      b.addEventListener("click",function(){commit(tag);});
    });
    if(!pool.length&&field.value.trim()){
      var nb=btn(doc,list,"ja-pop-item","＋ "+field.value.trim());
      nb.addEventListener("mousedown",function(ev){ev.preventDefault();});
      nb.addEventListener("click",function(){commit(field.value);});
    }
  }
  field.addEventListener("input",draw);
  field.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"){ev.preventDefault();commit(field.value);}
    if(ev.key==="Escape"){close();}
  });
  draw();

  /* placement au point de clic, replié si ça sort de l'écran */
  pop.style.left=Math.max(8,Math.min(rect.left,w-232))+"px";
  var top=rect.bottom+5;
  if(top+220>h){top=Math.max(8,rect.top-220);}
  pop.style.top=top+"px";
  field.focus();
}

/* Menu contextuel ancré. */
function popover(doc,anchor,items){
  var old=doc.querySelector(".ja-pop");
  if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop"),
      rect=anchor.getBoundingClientRect();
  items.forEach(function(item){
    if(item.sep){mk(doc,pop,"div","ja-pop-sep","");return;}
    var b=btn(doc,pop,"ja-pop-item",item.label);
    b.addEventListener("click",function(){pop.remove();item.run();});
  });
  pop.style.left=Math.max(8,Math.min(rect.left,doc.documentElement.clientWidth-200))+"px";
  pop.style.top=(rect.bottom+5)+"px";
  setTimeout(function(){
    function away(ev){
      if(!pop.contains(ev.target)){pop.remove();document.removeEventListener("mousedown",away,true);}
    }
    document.addEventListener("mousedown",away,true);
  },0);
}

function normSearch(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function imageSearchTags(wiki,title,t){
  var tags=[],usage=usageTags(wiki),raw=[];
  if(t&&t.fields){
    raw=Array.isArray(t.fields.tags)?t.fields.tags:($tw.utils.parseStringArray(String(t.fields.tags||""))||[]);
    raw=raw.concat(parseTags(t.fields["media-tags"]));
  }
  raw.concat(folderTags(title),usage[title]||[]).forEach(function(x){if(x&&tags.indexOf(x)===-1){tags.push(x);}});
  return tags;
}
function openWikiImagePicker(doc,wiki,anchor,onPick,opts){
  return Media.openWikiImagePicker(doc,wiki,anchor,onPick,opts);
}

/* ================================================================== */
/* 1. Cartes de catégorie                                             */
/* ================================================================== */
var CategoriesWidget=function(p,o){this.initialise(p,o);};
CategoriesWidget.prototype=new Widget();

CategoriesWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  var root=mk(this.document,null,"div","ja-settings-grid");
  parent.insertBefore(root,nextSibling);
  this.domNodes.push(root);
  this.build(root);
};

CategoriesWidget.prototype.build=function(root){
  var doc=this.document,wiki=this.wiki,
      APPEARANCE="$:/journalapp/settings/appearance";

  wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/JournalApp/Category]]").forEach(function(title){
    var t=wiki.getTiddler(title);
    if(!t){return;}
    var s=String(t.fields.slug||""),
        caption=String(t.fields.caption||title),
        iconTitle="$:/journalapp/icons/"+s,
        card=mk(doc,root,"div","ja-settings-card");

    var iconBtn=btn(doc,card,"ja-settings-icon-wrap","");
    iconBtn.title="Changer l’icône";
    function drawIcon(){
      iconBtn.innerHTML="";
      var src=JConfig.imageSrc(wiki,iconTitle);
      if(src){
        var im=mk(doc,iconBtn,"img","ja-settings-icon-img");
        im.src=src;im.alt="";
      }else{
        mk(doc,iconBtn,"span","ja-settings-icon-emoji",String(t.fields["icon-text"]||"•"));
      }
    }
    drawIcon();

    var copy=mk(doc,card,"div","ja-settings-card-copy");
    mk(doc,copy,"div","ja-settings-card-title",caption);

    var hidden=inp(doc,card,"","file");
    hidden.accept="image/*";hidden.style.display="none";
    hidden.addEventListener("change",async function(){
      var f=hidden.files&&hidden.files[0];hidden.value="";
      if(!f){return;}
      try{await writeImageTo(wiki,iconTitle,f);drawIcon();}
      catch(e){window.alert(e.message||"Import impossible.");}
    });

    function accent(){
      var a=wiki.getTiddler(APPEARANCE);
      return (a&&a.fields[s])?String(a.fields[s]):"#e8e6ef";
    }
    function pickFromWiki(anchor){
      openWikiImagePicker(doc,wiki,anchor,function(tt){
        wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler(tt),{title:iconTitle},{modified:new Date()}));
        drawIcon();
      },{exclude:iconTitle});
    }
    function openMenu(anchor){
      popover(doc,anchor,[
        {label:"🙂  Emoji",run:function(){
          if(wiki.tiddlerExists(iconTitle)){wiki.deleteTiddler(iconTitle);}
          drawIcon();
        }},
        {label:"📁  Importer…",run:function(){hidden.click();}},
        {label:"🔗  Depuis une URL",run:function(){
          var uri=window.prompt("Adresse de l’image (https://…)");
          if(!uri){return;}
          wiki.addTiddler(new $tw.Tiddler({
            title:iconTitle,type:"image/png",text:"",_canonical_uri:uri.trim()
          },{modified:new Date()}));
          drawIcon();
        }},
        {label:"🖼️  Depuis le wiki",run:function(){pickFromWiki(anchor);}},
        {sep:true},
        {label:"✦  Lucide…",run:function(){
          openIconBrowser(doc,wiki,{color:accent(),onPick:function(svg){
            wiki.addTiddler(new $tw.Tiddler({
              title:iconTitle,type:"image/svg+xml",text:svg
            },{modified:new Date()}));
            drawIcon();
          }});
        }}
      ]);
    }
    iconBtn.addEventListener("click",function(){openMenu(iconBtn);});

    var controls=mk(doc,card,"div","ja-settings-controls");
    function current(){
      var a=wiki.getTiddler(APPEARANCE);
      return (a&&a.fields[s])?String(a.fields[s]):"#888888";
    }
    var col=inp(doc,controls,"ja-settings-color","color",current()),
        hex=inp(doc,controls,"ja-settings-hex","text",current());
    function apply(v){
      var a=wiki.getTiddler(APPEARANCE),f={title:APPEARANCE};
      f[s]=v;
      wiki.addTiddler(a?new $tw.Tiddler(a,f,{modified:new Date()}):new $tw.Tiddler(f));
      col.value=v;hex.value=v;
    }
    col.addEventListener("input",function(){apply(col.value);});
    hex.addEventListener("change",function(){apply(hex.value);});
  });
};
CategoriesWidget.prototype.refresh=function(){return false;};

/* ================================================================== */
/* 2. Bibliothèque d'images                                           */
/* ================================================================== */
var MediaLibraryWidget=function(p,o){this.initialise(p,o);};
MediaLibraryWidget.prototype=new Widget();

MediaLibraryWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  var root=mk(this.document,null,"div","ja-lib");
  parent.insertBefore(root,nextSibling);
  this.domNodes.push(root);
  this.query="";this.group="";
  this.build(root);
};

/* Tags déduits de l'emplacement du tiddler. */
function folderTags(title){
  if(title.indexOf("$:/journalapp/icons/")===0){return ["Catégorie"];}
  if(title.indexOf("$:/journalapp/banners/")===0){return ["Bannière"];}
  if(title.indexOf("$:/journalapp/moods/")===0){return ["Humeur"];}
  if(title.indexOf("$:/journalapp/markers/")===0){return ["Marqueur"];}
  if(title.indexOf("$:/journalapp/media/")===0){return ["Entrée"];}
  if(title.indexOf("$:/journalapp/library/lucide-")===0){return ["Lucide"];}
  if(title.indexOf("$:/journalapp/library/")===0){return [];}
  if(title.indexOf("$:/")===0){return ["Système"];}
  return [];
}

/*
  Tags déduits de l'usage réel : on ouvre chaque Daily et on regarde comment
  l'image y est employée. Une image posée en fond d'entrée devient « Fond ».
*/
function usageTags(wiki){
  var map=Object.create(null),agendaCfg=Agenda.readConfig(wiki),typeById=Object.create(null);
  (agendaCfg.eventTypes||[]).forEach(function(x){if(x&&x.id){typeById[String(x.id)]=x;}});
  function push(ref,tag){
    if(!ref||!tag){return;}ref=String(ref);tag=String(tag);
    if(!map[ref]){map[ref]=[];}if(map[ref].indexOf(tag)===-1){map[ref].push(tag);}
  }
  function list(v){return $tw.utils.parseStringArray(String(v||""))||[];}
  function contextTags(f){
    var out=[];
    ["places","people","activities","projects","events","todos","habits","media","sleep"].forEach(function(field){
      list(f[field]).forEach(function(v){if(v&&out.indexOf(v)===-1){out.push(v);}});
    });
    if(f.date){out.push(String(f.date).slice(0,4));}
    else if(f["start-date"]){out.push(String(f["start-date"]).slice(0,4));}
    return out;
  }
  function imageList(f,baseTags){
    var imgs=[];try{imgs=f.images?JSON.parse(String(f.images)):[];}catch(e){imgs=[];}
    if(!Array.isArray(imgs)){return;}
    var context=contextTags(f);
    imgs.forEach(function(item){
      if(!item){return;}var ref=item.src||item.path;if(!ref){return;}
      var isBack=!!(item.back||item.banner||item.baniere);
      (baseTags||[]).forEach(function(tag){push(ref,tag);});
      push(ref,isBack?"Fond":"Galerie");
      if(item.gallery){push(ref,item.gallery);}
      /* Relations, lieux, projets, etc. décrivent une galerie. Un fond reste
         un décor, il ne récupère donc pas tout le contexte relationnel. */
      if(!isBack){context.forEach(function(tag){push(ref,tag);});}
    });
  }
  wiki.each(function(t,title){
    var f=t&&t.fields;if(!f){return;}
    if(String(f.kind||"")==="Daily"){imageList(f,["Journal"]);}
    if(Agenda.isVacation(t)){imageList(f,["Vacances"]);}
    if(Agenda.isHabit(t)){imageList(f,["Habitudes"]);}
    if(Agenda.isTodo(t)){imageList(f,["To-do"]);}
    if(Agenda.isEvent(t)){
      var role=String(f["agenda-role"]||"event"),base=[role==="slot"?"Emploi du temps":"Événement"],
          ty=typeById[String(f["event-type"]||"")];
      if(ty&&ty.label){base.push(String(ty.label));}
      imageList(f,base);
    }
    if(f["mood-image"]){push(f["mood-image"],"Humeur");}
  });

  var raw=wiki.getTiddlerText("$:/journalapp/config/journal","");
  try{
    var cfg=JSON.parse(raw||"{}");
    ((cfg.banner&&cfg.banner.slices)||[]).forEach(function(sl){push(sl.image,"Bannière");});
    (cfg.moodTree||[]).forEach(function(pr){push(pr.image,"Humeur");(pr.children||[]).forEach(function(nu){push(nu.image,"Humeur");});});
    (cfg.markers||[]).forEach(function(m){push(m.image,"Marqueur");});
  }catch(e){}

  (agendaCfg.eventTypes||[]).forEach(function(ty){
    if(!ty){return;}var name=String(ty.label||ty.id||"Type");
    if(ty.image){push(ty.image,"Type");push(ty.image,name);push(ty.image,"Icône");}
    var backs=ty.backgrounds||{};
    [["event","Événement"],["todo","To-do"],["habit","Habitudes"],["slot","Emploi du temps"]].forEach(function(pair){
      var ref=backs[pair[0]];if(!ref){return;}push(ref,"Fond");push(ref,"Type");push(ref,name);push(ref,pair[1]);
    });
  });
  return map;
}

function usedImageMap(wiki){
  var images=[],used=Object.create(null);
  wiki.eachShadowPlusTiddlers(function(t,title){if(t&&t.fields&&/^image\//.test(String(t.fields.type||""))){images.push(title);}});
  wiki.each(function(t,title){
    if(!t||!t.fields){return;}
    var vals=[];Object.keys(t.fields).forEach(function(k){if(k==="title"){return;}var v=t.fields[k];if(v!==undefined&&v!==null){vals.push(Array.isArray(v)?v.join(" "):String(v));}});
    var hay=vals.join("\n");images.forEach(function(ref){if(title!==ref&&hay.indexOf(ref)!==-1){used[ref]=true;}});
  });
  /* Les icônes de catégories sont résolues dynamiquement à partir du slug. */
  wiki.eachShadowPlusTiddlers(function(t){
    if(!t||!t.fields){return;}var tags=Array.isArray(t.fields.tags)?t.fields.tags:($tw.utils.parseStringArray(String(t.fields.tags||""))||[]);
    if(tags.indexOf("$:/tags/JournalApp/Category")!==-1&&t.fields.slug){used["$:/journalapp/icons/"+String(t.fields.slug)]=true;}
  });
  return used;
}

function parseTags(v){
  return String(v||"").split(",").map(function(x){return x.trim();}).filter(Boolean);
}

MediaLibraryWidget.prototype.items=function(){
  var usage=usageTags(this.wiki),used=usedImageMap(this.wiki),out=[];
  this.wiki.each(function(t,title){
    if(!t.fields){return;}
    var type=String(t.fields.type||"");
    if(!/^image\//.test(type)&&!t.fields._canonical_uri){return;}
    if(t.fields._canonical_uri&&!/^image\//.test(type)){return;}

    var manual=parseTags(t.fields["media-tags"]),
        muted=parseTags(t.fields["media-tags-off"]),
        auto=folderTags(title).concat(usage[title]||[]).filter(function(tag){
          return muted.indexOf(tag)===-1;
        }),
        all=[];
    manual.concat(auto).forEach(function(tag){if(all.indexOf(tag)===-1){all.push(tag);}});
    out.push({
      title:title,
      name:String(t.fields["media-name"]||title.split("/").pop()),
      manual:manual,
      auto:auto,
      muted:muted,
      tags:all,
      locked:title.indexOf("$:/journalapp/icons/")===0,
      unused:!used[title]&&(title.indexOf("$:/journalapp/")===0||title.indexOf("$:/")!==0)
    });
  });
  return out.sort(function(a,b){return a.name.localeCompare(b.name);});
};

/* Écrit des tags sur un lot de tiddlers. */
MediaLibraryWidget.prototype.applyTags=function(titles,tags,remove){
  var wiki=this.wiki;
  titles.forEach(function(title){
    var t=wiki.getTiddler(title);
    if(!t){return;}
    var current=parseTags(t.fields["media-tags"]),
        off=parseTags(t.fields["media-tags-off"]);
    tags.forEach(function(tag){
      if(remove){
        current=current.filter(function(x){return x!==tag;});
        /* un tag automatique ne s'efface pas : on le met en sourdine */
        if(off.indexOf(tag)===-1){off.push(tag);}
      }else{
        if(current.indexOf(tag)===-1){current.push(tag);}
        off=off.filter(function(x){return x!==tag;});
      }
    });
    wiki.addTiddler(new $tw.Tiddler(t,{
      "media-tags":current.join(", "),
      "media-tags-off":off.join(", ")
    },{modified:new Date()}));
  });
};

MediaLibraryWidget.prototype.build=function(root){
  var self=this,doc=this.document,wiki=this.wiki;
  self.filters=self.filters||[];
  self.selection=self.selection||Object.create(null);

  /* ---------- barre : recherche texte + import ---------- */
  var bar=mk(doc,root,"div","ja-lib-bar"),
      search=inp(doc,bar,"ja-lib-search","text",this.query||"");
  search.placeholder="Filtrer par titre ou tag…";
  var file=inp(doc,bar,"","file");
  file.accept="image/*";file.multiple=true;file.style.display="none";
  var importBtn=btn(doc,bar,"ja-lib-btn","📁"),
      lucideBtn=btn(doc,bar,"ja-lib-btn","✦"),
      urlBtn=btn(doc,bar,"ja-lib-btn","🔗"),
      unusedBtn=btn(doc,bar,"ja-lib-btn ja-lib-unused"+(self.unusedOnly?" is-active":""),"♻ Images inutilisées","Afficher seulement les images stockées mais non utilisées"),
      count=mk(doc,bar,"span","ja-lib-count","");
  importBtn.title="Importer des fichiers";
  lucideBtn.title="Chercher une icône Lucide";
  urlBtn.title="Ajouter par adresse";
  unusedBtn.title="Afficher seulement les images stockées mais non utilisées";

  /* ---------- recherche de tags, à la façon des filtres de tiddlers ---------- */
  var tagZone=mk(doc,root,"div","ja-lib-tagzone"),
      chips=mk(doc,tagZone,"div","ja-lib-chips"),
      tagWrap=mk(doc,tagZone,"div","ja-lib-tagsearch"),
      tagInput=inp(doc,tagWrap,"ja-lib-taginput","text",""),
      tagMenu=mk(doc,tagWrap,"div","ja-lib-tagmenu");
  tagInput.placeholder="＋ tag…";

  /* ---------- barre de sélection ---------- */
  var selBar=mk(doc,root,"div","ja-lib-selbar");
  var selCount=mk(doc,selBar,"span","ja-lib-selcount","");
  var selAll=btn(doc,selBar,"ja-lib-btn-sm","Tout"),
      selNone=btn(doc,selBar,"ja-lib-btn-sm","Aucune"),
      selTag=btn(doc,selBar,"ja-lib-btn-sm","＋ Tag"),
      selUntag=btn(doc,selBar,"ja-lib-btn-sm","− Tag"),
      selDel=btn(doc,selBar,"ja-lib-btn-sm ja-is-danger","Supprimer");

  var grid=mk(doc,root,"div","ja-lib-grid"),
      visibleTitles=[];

  function selected(){return Object.keys(self.selection).filter(function(k){return self.selection[k];});}

  function allTags(items){
    var tags=[];
    items.forEach(function(i){
      i.tags.forEach(function(tag){if(tags.indexOf(tag)===-1){tags.push(tag);}});
    });
    return tags.sort();
  }

  function drawChips(){
    chips.innerHTML="";
    self.filters.forEach(function(tag,index){
      var chip=mk(doc,chips,"span","ja-lib-chip");
      mk(doc,chip,"span","",tag);
      var x=btn(doc,chip,"ja-lib-chip-x","×","Retirer ce filtre");
      x.addEventListener("click",function(){self.filters.splice(index,1);redraw();});
    });
  }

  function drawTagMenu(){
    var q=tagInput.value.trim().toLowerCase(),
        pool=allTags(self.items()).filter(function(tag){
          return self.filters.indexOf(tag)===-1&&(!q||tag.toLowerCase().indexOf(q)!==-1);
        });
    tagMenu.innerHTML="";
    pool.slice(0,14).forEach(function(tag){
      var b=btn(doc,tagMenu,"ja-lib-tagoption",tag);
      b.addEventListener("mousedown",function(ev){ev.preventDefault();});
      b.addEventListener("click",function(){
        self.filters.push(tag);tagInput.value="";tagMenu.classList.remove("is-open");redraw();
      });
    });
    tagMenu.classList.toggle("is-open",pool.length>0);
  }
  tagInput.addEventListener("focus",drawTagMenu);
  tagInput.addEventListener("input",drawTagMenu);
  tagInput.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"&&tagInput.value.trim()){
      ev.preventDefault();
      var v=tagInput.value.trim();
      if(self.filters.indexOf(v)===-1){self.filters.push(v);}
      tagInput.value="";tagMenu.classList.remove("is-open");redraw();
    }
    if(ev.key==="Escape"){tagMenu.classList.remove("is-open");}
    if(ev.key==="Backspace"&&!tagInput.value&&self.filters.length){
      self.filters.pop();redraw();
    }
  });
  var awayTags=function(ev){if(!tagWrap.contains(ev.target)){tagMenu.classList.remove("is-open");}};
  document.addEventListener("mousedown",awayTags,true);

  function redraw(){
    var all=self.items(),
        q=(self.query||"").toLowerCase(),
        list=all.filter(function(i){
          for(var k=0;k<self.filters.length;k++){
            if(i.tags.indexOf(self.filters[k])===-1){return false;}
          }
          if(self.unusedOnly&&!i.unused){return false;}
          if(q&&normSearch(i.name+" "+i.title+" "+i.tags.join(" ")).indexOf(normSearch(q))===-1){return false;}
          return true;
        });

    visibleTitles=list.map(function(i){return i.title;});
    drawChips();
    count.textContent=list.length+"/"+all.length;

    var sel=selected();
    selBar.classList.toggle("is-active",sel.length>0);
    selCount.textContent=sel.length?sel.length+" sélectionnée"+(sel.length>1?"s":""):"Rien de sélectionné";

    grid.innerHTML="";
    if(!list.length){mk(doc,grid,"div","ja-lib-empty","Rien ici.");return;}

    list.forEach(function(item){
      var cell=mk(doc,grid,"figure","ja-lib-cell"+(self.selection[item.title]?" is-picked":"")),
          thumb=mk(doc,cell,"div","ja-lib-thumb"),
          im=mk(doc,thumb,"img","");
      im.src=JConfig.imageSrc(wiki,item.title);im.alt="";im.loading="lazy";

      var pick=mk(doc,thumb,"span","ja-lib-pick"+(self.selection[item.title]?" is-on":""),"");
      pick.title="Sélectionner";
      pick.addEventListener("click",function(ev){
        ev.stopPropagation();
        self.selection[item.title]=!self.selection[item.title];
        redraw();
      });

      var del=btn(doc,thumb,"ja-lib-del","×","Supprimer");
      del.addEventListener("click",function(){
        if(!window.confirm("Supprimer « "+item.name+" » ?")){return;}
        wiki.deleteTiddler(item.title);delete self.selection[item.title];redraw();
      });

      var name=inp(doc,cell,"ja-lib-name","text",item.name);
      name.addEventListener("change",function(){
        wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler(item.title),
          {"media-name":name.value},{modified:new Date()}));
      });

      var tagRow=mk(doc,cell,"div","ja-lib-celltags");
      item.tags.forEach(function(tag){
        var auto=item.auto.indexOf(tag)!==-1,
            chip=mk(doc,tagRow,"span","ja-lib-celltag"+(auto?" is-auto":""));
        mk(doc,chip,"span","",tag);
        var x=btn(doc,chip,"ja-lib-celltag-x","×",auto?"Masquer ce tag automatique":"Retirer");
        x.addEventListener("click",function(){
          self.applyTags([item.title],[tag],true);redraw();
        });
      });
      var addTag=btn(doc,tagRow,"ja-lib-celltag-add","＋","Ajouter un tag");
      addTag.addEventListener("click",function(ev){
        ev.stopPropagation();
        tagPrompt(doc,addTag,{
          title:"Tag pour « "+item.name+" »",
          suggestions:allTags(self.items()).filter(function(tag){
            return item.tags.indexOf(tag)===-1;
          }),
          onPick:function(v){self.applyTags([item.title],[v],false);redraw();}
        });
      });
    });
  }

  search.addEventListener("input",function(){self.query=search.value;redraw();});
  unusedBtn.addEventListener("click",function(){self.unusedOnly=!self.unusedOnly;unusedBtn.classList.toggle("is-active",!!self.unusedOnly);redraw();});
  selAll.title="Sélectionner uniquement les images actuellement visibles";
  selAll.addEventListener("click",function(){
    self.selection=Object.create(null);
    visibleTitles.forEach(function(title){self.selection[title]=true;});
    redraw();
  });
  selNone.addEventListener("click",function(){self.selection=Object.create(null);redraw();});
  selTag.addEventListener("click",function(){
    var sel=selected();
    if(!sel.length){return;}
    tagPrompt(doc,selTag,{
      title:"Ajouter à "+sel.length+" image"+(sel.length>1?"s":""),
      suggestions:allTags(self.items()),
      onPick:function(v){self.applyTags(sel,[v],false);redraw();}
    });
  });
  selUntag.addEventListener("click",function(){
    var sel=selected();
    if(!sel.length){return;}
    var common=[];
    self.items().forEach(function(i){
      if(sel.indexOf(i.title)===-1){return;}
      i.tags.forEach(function(tag){if(common.indexOf(tag)===-1){common.push(tag);}});
    });
    tagPrompt(doc,selUntag,{
      title:"Retirer de "+sel.length+" image"+(sel.length>1?"s":""),
      suggestions:common.sort(),
      onPick:function(v){self.applyTags(sel,[v],true);redraw();}
    });
  });
  selDel.addEventListener("click",function(){
    var sel=selected();
    if(!sel.length){return;}
    if(!window.confirm("Supprimer définitivement "+sel.length+" image(s) ?")){return;}
    sel.forEach(function(title){wiki.deleteTiddler(title);});
    self.selection=Object.create(null);redraw();
  });

  importBtn.addEventListener("click",function(){file.click();});
  file.addEventListener("change",async function(){
    var files=Array.prototype.slice.call(file.files||[]);file.value="";
    for(var i=0;i<files.length;i++){
      var f=files[i];
      if(!/^image\//.test(f.type)){continue;}
      var d=await readFile(f);
      wiki.addTiddler(new $tw.Tiddler({
        title:LIB_FOLDER+"/"+slugify(f.name.replace(/\.[^.]+$/,""))+"-"+uid(),
        type:f.type,text:b64(d),
        "media-name":f.name.replace(/\.[^.]+$/,""),
        "media-tags":self.filters.join(", ")
      },{created:new Date(),modified:new Date()}));
    }
    redraw();
  });
  urlBtn.addEventListener("click",function(){
    var uri=window.prompt("Adresse de l’image (https://…)");
    if(!uri){return;}
    wiki.addTiddler(new $tw.Tiddler({
      title:LIB_FOLDER+"/lien-"+uid(),type:"image/png",text:"",
      _canonical_uri:uri.trim(),
      "media-name":uri.split("/").pop().split("?")[0]||"lien",
      "media-tags":self.filters.join(", ")
    },{created:new Date(),modified:new Date()}));
    redraw();
  });
  lucideBtn.addEventListener("click",function(){
    openIconBrowser(doc,wiki,{onPick:function(svg,name){
      wiki.addTiddler(new $tw.Tiddler({
        title:LIB_FOLDER+"/lucide-"+name,type:"image/svg+xml",text:svg,
        "media-name":name,"media-tags":["Lucide"].concat(self.filters).join(", ")
      },{created:new Date(),modified:new Date()}));
      redraw();
    }});
  });

  redraw();
};

MediaLibraryWidget.prototype.refresh=function(){return false;};

/* ================================================================== */
/* 3. Réglages du Journal — accordéon compact                         */
/* ================================================================== */
var JournalSettingsWidget=function(p,o){this.initialise(p,o);};
JournalSettingsWidget.prototype=new Widget();

JournalSettingsWidget.prototype.execute=function(){this.cfg=JConfig.read(this.wiki);};

JournalSettingsWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  var root=mk(this.document,null,"div","ja-jset");
  parent.insertBefore(root,nextSibling);
  this.domNodes.push(root);
  this.build(root);
};

JournalSettingsWidget.prototype.save=function(){JConfig.write(this.wiki,this.cfg);};

JournalSettingsWidget.prototype.fold=function(parent,icon,title,hint,onReset,open){
  var doc=this.document,
      sec=mk(doc,parent,"section","ja-fold"+(open?" is-open":"")),
      head=btn(doc,sec,"ja-fold-head","");
  mk(doc,head,"span","ja-fold-caret","›");
  mk(doc,head,"span","ja-fold-ico",icon);
  mk(doc,head,"span","ja-fold-title",title);
  if(hint){mk(doc,head,"span","ja-fold-hint",hint);}
  if(onReset){
    var r=btn(doc,head,"ja-fold-reset","↺","Réinitialiser");
    r.addEventListener("click",function(ev){ev.stopPropagation();onReset();});
  }
  head.addEventListener("click",function(){sec.classList.toggle("is-open");});
  return mk(doc,sec,"div","ja-fold-body");
};

JournalSettingsWidget.prototype.row=function(parent,label){
  var doc=this.document,r=mk(doc,parent,"div","ja-jset-row");
  if(label){mk(doc,r,"span","ja-jset-rowlab",label);}
  return mk(doc,r,"div","ja-jset-rowctl");
};

/*
  Sélecteur d'icône unique. L'objet porte `emoji` et `image` ; l'image,
  si elle existe, gagne toujours. Choisir un emoji efface l'image.
*/
JournalSettingsWidget.prototype.iconPicker=function(parent,item,onChange,folder){
  var self=this,doc=this.document,wiki=this.wiki,
      b=btn(doc,parent,"ja-icon-pick","");
  b.title="Emoji ou image";
  var hidden=inp(doc,parent,"","file");
  hidden.accept="image/*";hidden.style.display="none";

  function draw(){
    b.innerHTML="";
    var src=item.image?JConfig.imageSrc(wiki,item.image):"";
    if(src){
      var im=mk(doc,b,"img","");im.src=src;im.alt="";
      b.classList.add("is-image");
    }else{
      mk(doc,b,"span","ja-icon-pick-emo",item.emoji||"＋");
      b.classList.remove("is-image");
    }
  }
  function setImage(v){item.image=v||"";draw();onChange();}
  function setEmoji(v){item.emoji=v||"";item.image="";draw();onChange();}

  hidden.addEventListener("change",async function(){
    var f=hidden.files&&hidden.files[0];hidden.value="";
    if(!f){return;}
    var d=await readFile(f),
        title=(folder||LIB_FOLDER)+"/"+slugify(f.name.replace(/\.[^.]+$/,""))+"-"+uid();
    wiki.addTiddler(new $tw.Tiddler({
      title:title,type:f.type,text:b64(d),"media-name":f.name.replace(/\.[^.]+$/,"")
    },{created:new Date(),modified:new Date()}));
    setImage(title);
  });

  b.addEventListener("click",function(){
    var items=[
      {label:"🙂  Emoji…",run:function(){
        var v=window.prompt("Emoji ?",item.emoji||"");
        if(v!==null){setEmoji(v.trim());}
      }},
      {sep:true},
      {label:"📁  Importer une image…",run:function(){hidden.click();}},
      {label:"🔗  Image depuis une URL",run:function(){
        var uri=window.prompt("Adresse de l’image (https://…)");
        if(!uri){return;}
        var title=(folder||LIB_FOLDER)+"/lien-"+uid();
        wiki.addTiddler(new $tw.Tiddler({
          title:title,type:"image/png",text:"",_canonical_uri:uri.trim()
        },{created:new Date(),modified:new Date()}));
        setImage(title);
      }},
      {label:"🖼️  Image du wiki",run:function(){openWikiImagePicker(doc,wiki,b,function(tt){setImage(tt);});}},
      {label:"✦  Lucide…",run:function(){
        openIconBrowser(doc,wiki,{onPick:function(svg,name){
          var title=(folder||LIB_FOLDER)+"/lucide-"+name;
          wiki.addTiddler(new $tw.Tiddler({
            title:title,type:"image/svg+xml",text:svg,"media-name":name,"media-tags":"Lucide"
          },{modified:new Date()}));
          setImage(title);
        }});
      }}
    ];
    if(item.image){
      items.push({sep:true},{label:"✕  Revenir à l’emoji",run:function(){setImage("");}});
    }
    popover(doc,b,items);
  });

  draw();
};

JournalSettingsWidget.prototype.thumbPicker=function(parent,value,onChange,folder){
  var doc=this.document,wiki=this.wiki,current=value||"",
      b=btn(doc,parent,"ja-thumb","");
  b.title="Image";
  var hidden=inp(doc,parent,"","file");
  hidden.accept="image/*";hidden.style.display="none";

  function draw(){
    b.innerHTML="";
    var src=JConfig.imageSrc(wiki,current);
    if(src){var im=mk(doc,b,"img","");im.src=src;im.alt="";}
    else{mk(doc,b,"span","ja-thumb-none","＋");}
  }
  function set(v){current=v||"";draw();onChange(current);}

  hidden.addEventListener("change",async function(){
    var f=hidden.files&&hidden.files[0];hidden.value="";
    if(!f){return;}
    var d=await readFile(f),
        title=(folder||LIB_FOLDER)+"/"+slugify(f.name.replace(/\.[^.]+$/,""))+"-"+uid();
    wiki.addTiddler(new $tw.Tiddler({
      title:title,type:f.type,text:b64(d),"media-name":f.name.replace(/\.[^.]+$/,"")
    },{created:new Date(),modified:new Date()}));
    set(title);
  });

  b.addEventListener("click",function(){
    var items=[
      {label:"📁  Importer…",run:function(){hidden.click();}},
      {label:"🔗  Depuis une URL",run:function(){
        var uri=window.prompt("Adresse de l’image (https://…)");
        if(!uri){return;}
        var title=(folder||LIB_FOLDER)+"/lien-"+uid();
        wiki.addTiddler(new $tw.Tiddler({
          title:title,type:"image/png",text:"",_canonical_uri:uri.trim()
        },{created:new Date(),modified:new Date()}));
        set(title);
      }},
      {label:"🖼️  Depuis le wiki",run:function(){openWikiImagePicker(doc,wiki,b,function(tt){set(tt);});}},
      {label:"✦  Lucide…",run:function(){
        openIconBrowser(doc,wiki,{onPick:function(svg,name){
          var title=(folder||LIB_FOLDER)+"/lucide-"+name;
          wiki.addTiddler(new $tw.Tiddler({
            title:title,type:"image/svg+xml",text:svg,"media-name":name,"media-group":"Lucide"
          },{modified:new Date()}));
          set(title);
        }});
      }}
    ];
    if(current){items.push({sep:true},{label:"✕  Retirer",run:function(){set("");}});}
    popover(doc,b,items);
  });

  draw();
};

JournalSettingsWidget.prototype.build=function(root){
  var self=this,doc=this.document,cfg=this.cfg;

  function reset(section){
    JConfig.resetSection(self.wiki,section);
    self.cfg=JConfig.read(self.wiki);
    self.refreshSelf();
  }

  var rowA=mk(doc,root,"div","ja-jset-band ja-band-1"),
      rowB=mk(doc,root,"div","ja-jset-band ja-band-3"),
      rowC=mk(doc,root,"div","ja-jset-band ja-band-2"),
      rowD=mk(doc,root,"div","ja-jset-band ja-band-1");
  cfg.form=cfg.form||{};
  cfg.form.backdrop=cfg.form.backdrop||{};

  /* bannières */
  var b=this.fold(rowA,"🖼️","Bannières","par ressenti",function(){reset("banner");});
  var fbRow=this.row(b,"Sans humeur"),
      fb=inp(doc,fbRow,"ja-mini-color","color",cfg.banner.fallback);
  fb.addEventListener("input",function(){cfg.banner.fallback=fb.value;self.save();});

  var strip=mk(doc,b,"div","ja-slices");
  cfg.banner.slices.forEach(function(sl){
    var cell=mk(doc,strip,"div","ja-slice");
    mk(doc,cell,"span","ja-slice-lab",sl.label);
    var line=mk(doc,cell,"div","ja-slice-line"),
        c=inp(doc,line,"ja-mini-color","color",sl.color||"#2b2e37");
    c.addEventListener("input",function(){sl.color=c.value;self.save();});
    self.thumbPicker(line,sl.image,function(v){sl.image=v;self.save();},"$:/journalapp/banners");
  });

  /* humeur */
  var m=this.fold(rowB,"😊","Humeur","2 couches",function(){reset("moodTree");});
  var dRow=this.row(m,"Affichage");
  [["emoji","Emoji"],["image","Image"]].forEach(function(pair){
    var t=btn(doc,dRow,"ja-seg"+(cfg.options.moodDisplay===pair[0]?" is-on":""),pair[1]);
    t.addEventListener("click",function(){
      cfg.options.moodDisplay=pair[0];self.save();self.refreshSelf();
    });
  });
  cfg.moodTree.forEach(function(p){
    var line=mk(doc,m,"div","ja-mood-line");
    self.iconPicker(line,p,function(){self.save();},"$:/journalapp/moods");
    var l=inp(doc,line,"ja-mini-input","text",p.label||"");
    l.addEventListener("change",function(){p.label=l.value;self.save();});
    var v=inp(doc,line,"ja-mini-num","number",p.value);
    v.min="1";v.max="5";v.step="0.5";
    v.addEventListener("change",function(){p.value=parseFloat(v.value)||3;self.save();});
    var c=inp(doc,line,"ja-mini-color","color",p.color||"#8f8f8f");
    c.addEventListener("input",function(){p.color=c.value;self.save();});

    var nu=mk(doc,line,"div","ja-nu");
    (p.children||[]).forEach(function(n,ni){
      var pod=mk(doc,nu,"span","ja-nu-pod");
      self.iconPicker(pod,n,function(){self.save();},"$:/journalapp/moods");
      var x=btn(doc,pod,"ja-mini-x","\u00d7","Supprimer");
      x.addEventListener("click",function(){
        p.children.splice(ni,1);self.save();self.refreshSelf();
      });
    });
    var add=btn(doc,nu,"ja-mini-add","＋","Ajouter une nuance");
    add.addEventListener("click",function(){
      p.children=p.children||[];
      p.children.push({id:"n-"+uid(),emoji:"🙂",image:"",value:p.value});
      self.save();self.refreshSelf();
    });
  });

  /* échelles */
  function scale(key,icon,title,hint){
    var body=self.fold(rowC,icon,title,hint,function(){reset(key);}),
        grid=mk(doc,body,"div","ja-scalegrid");
    cfg[key].forEach(function(lv,i){
      var cell=mk(doc,grid,"div","ja-scalecell"),
          bar=mk(doc,cell,"div","ja-scalebar");
      bar.style.height=(9+i*4)+"px";
      bar.style.background=lv.bg;
      var l=inp(doc,cell,"ja-mini-input ja-mini-input-xs","text",lv.label);
      l.addEventListener("change",function(){lv.label=l.value;self.save();});
      var cRow=mk(doc,cell,"div","ja-scalecols"),
          bg=inp(doc,cRow,"ja-mini-color ja-mini-color-xs","color",lv.bg);
      bg.title="Fond";
      bg.addEventListener("input",function(){lv.bg=bg.value;bar.style.background=bg.value;self.save();});
      var fg=inp(doc,cRow,"ja-mini-color ja-mini-color-xs","color",lv.fg||"#111111");
      fg.title="Texte";
      fg.addEventListener("input",function(){lv.fg=fg.value;self.save();});
    });
    mk(doc,body,"div","ja-fold-note","À gauche le pire, à droite le mieux.");
  }
  scale("energy","⚡","Énergie","6 niveaux");
  scale("stress","🌪️","Anxiété","6 niveaux");

  /* marqueurs */
  var k=this.fold(rowB,"⭐","Marqueurs",null,function(){reset("markers");});
  var kRow=mk(doc,k,"div","ja-marks");
  cfg.markers.forEach(function(item,index){
    var cell=mk(doc,kRow,"div","ja-mark");
    self.iconPicker(cell,item,function(){self.save();},"$:/journalapp/markers");
    var l=inp(doc,cell,"ja-mini-input ja-mini-input-xs","text",item.label||"");
    l.addEventListener("change",function(){item.label=l.value;self.save();});
    var c=inp(doc,cell,"ja-mini-color ja-mini-color-xs","color",item.color||"#c58bd8");
    c.addEventListener("input",function(){item.color=c.value;self.save();});
    var x=btn(doc,cell,"ja-mini-x","\u00d7","Supprimer ce marqueur");
    x.addEventListener("click",function(){
      cfg.markers.splice(index,1);self.save();self.refreshSelf();
    });
  });
  var addMark=btn(doc,kRow,"ja-mini-add","\uff0b","Ajouter un marqueur");
  addMark.addEventListener("click",function(){
    cfg.markers.push({id:"m-"+uid(),emoji:"\u2726",image:"",label:"Marqueur",color:"#c58bd8"});
    self.save();self.refreshSelf();
  });

  /* affichage */
  var o=this.fold(rowB,"⚙️","Affichage",null,null);  function sw(label,key){
    var r=self.row(o,label),
        t=btn(doc,r,"ja-sw"+(cfg.options[key]?" is-on":""),"");
    mk(doc,t,"span","ja-sw-knob","");
    t.addEventListener("click",function(){
      cfg.options[key]=!cfg.options[key];
      t.classList.toggle("is-on",cfg.options[key]);
      self.save();
    });
  }
  sw("Ciel animé","sky");
  sw("Anneau animé","moodAnim");
  sw("Jauge météo séparée","showWeatherGauge");

  var iRow=this.row(o,"Densité du ciel");
  [["soft","Discret"],["full","Marqué"]].forEach(function(pair){
    var t=btn(doc,iRow,"ja-seg"+(cfg.options.skyIntensity===pair[0]?" is-on":""),pair[1]);
    t.addEventListener("click",function(){
      cfg.options.skyIntensity=pair[0];self.save();self.refreshSelf();
    });
  });

  /* ---------- valeurs par défaut du formulaire ---------- */
  var d=this.fold(rowD,"✦","Valeurs par défaut du formulaire","à l’ouverture d’une nouvelle entrée",function(){
    JConfig.resetSection(self.wiki,"form");self.cfg=JConfig.read(self.wiki);self.refreshSelf();
  });
  var form=cfg.form;

  function segRow(label,options,get,set,rerender){
    var ctl=self.row(d,label);
    options.forEach(function(pair){
      var b=btn(doc,ctl,"ja-seg"+(get()===pair[0]?" is-on":""),pair[1]);
      b.addEventListener("click",function(){
        set(pair[0]);self.save();
        if(rerender){self.refreshSelf();return;}
        Array.prototype.slice.call(ctl.children).forEach(function(x){x.classList.remove("is-on");});
        b.classList.add("is-on");
      });
    });
  }

  segRow("Humeur pré-choisie",
    [["","Aucune"]].concat(cfg.moodTree.map(function(p){return [p.id,p.emoji||p.label];})),
    function(){return form.mood||"";},function(v){form.mood=v;});

  function scaleDefault(label,key,levels){
    var ctl=self.row(d,label),
        none=btn(doc,ctl,"ja-seg"+(form[key]===""||form[key]===undefined?" is-on":""),"—");
    none.addEventListener("click",function(){
      form[key]="";self.save();self.refreshSelf();
    });
    levels.forEach(function(lv,i){
      var b=btn(doc,ctl,"ja-seg-dot"+(String(form[key])===String(i)?" is-on":""),"");
      b.style.background=lv.bg;
      b.title=lv.label;
      b.addEventListener("click",function(){form[key]=String(i);self.save();self.refreshSelf();});
    });
  }
  scaleDefault("Énergie","energy",cfg.energy);
  scaleDefault("Anxiété","stress",cfg.stress);

  segRow("Marqueur",
    [["","Aucun"]].concat(cfg.markers.map(function(m){return [m.id,m.emoji||m.label];})),
    function(){return form.marker||"";},function(v){form.marker=v;});

  var placeRow=this.row(d,"Reprendre le dernier lieu"),
      placeSw=btn(doc,placeRow,"ja-sw"+(form.reusePlace?" is-on":""),"");
  mk(doc,placeSw,"span","ja-sw-knob","");
  placeSw.addEventListener("click",function(){
    form.reusePlace=!form.reusePlace;
    placeSw.classList.toggle("is-on",form.reusePlace);
    self.save();
  });

  segRow("Placement des médias",
    [["left","← Gauche"],["right","Droite →"],["above","↑ Dessus"],["below","↓ Dessous"]],
    function(){return form.mediaPos;},function(v){form.mediaPos=v;});
  segRow("Galeries",
    [["column","L’une sous l’autre"],["row","Côte à côte"]],
    function(){return form.mediaFlow;},function(v){form.mediaFlow=v;});
  segRow("Disposition",
    [["slides","Diaporama"],["carousel","Défilant"],["mosaic","Mosaïque"],["grid","Grille"],["hero","Vedette"]],
    function(){return form.galleryLayout;},function(v){form.galleryLayout=v;});
  segRow("Cadrage des images",
    [["cover","Remplir"],["contain","Entier"],["fill","Étirer"]],
    function(){return form.imageFit;},function(v){form.imageFit=v;});

  /* champs dépliés dès l'ouverture */
  var fieldsCtl=this.row(d,"Champs ouverts d’office");
  [["person","Relations"],["activity","Activités"],["project","Projets"],
   ["event","Événements"],["media","Média"],["sleep","Sommeil"],
   ["images","Images"],["audios","Audio"],["links","Liens"]].forEach(function(pair){
    var on=(form.openFields||[]).indexOf(pair[0])!==-1,
        b=btn(doc,fieldsCtl,"ja-seg"+(on?" is-on":""),pair[1]);
    b.addEventListener("click",function(){
      form.openFields=form.openFields||[];
      var at=form.openFields.indexOf(pair[0]);
      if(at===-1){form.openFields.push(pair[0]);}else{form.openFields.splice(at,1);}
      b.classList.toggle("is-on",at===-1);
      self.save();
    });
  });

  /* fond par défaut */
  var bd=form.backdrop;
  mk(doc,d,"div","ja-fold-note","Réglages appliqués à chaque nouveau fond d’entrée.");
  segRow("Fond · cadrage",[["cover","Remplir"],["contain","Entier"],["fill","Étirer"]],
    function(){return bd.fit;},function(v){bd.fit=v;});
  segRow("Fond · fondu",[["transparent","Transparence"],["color","Couleur"]],
    function(){return bd.fadeMode;},function(v){bd.fadeMode=v;},true);
  if(bd.fadeMode==="color"){
    var colRow=this.row(d,"Fond · couleur"),
        bdCol=inp(doc,colRow,"ja-mini-color","color",bd.fadeColor||"#14161d");
    bdCol.addEventListener("input",function(){bd.fadeColor=bdCol.value;self.save();});
  }
  var dirRow=this.row(d,"Fond · direction"),
      rose=mk(doc,dirRow,"div","ja-fade-rose");
  [["tl","↖"],["top","↑"],["tr","↗"],["left","←"],["none","∅"],["right","→"],
   ["bl","↙"],["bottom","↓"],["br","↘"]].forEach(function(pair){
    var b=btn(doc,rose,"ja-fade-dir"+(bd.fadeDir===pair[0]?" is-on":""),pair[1]);
    b.addEventListener("click",function(){
      bd.fadeDir=pair[0];
      Array.prototype.slice.call(rose.children).forEach(function(x){x.classList.remove("is-on");});
      b.classList.add("is-on");
      self.save();
    });
  });
  function bdSlider(label,key,min,max){
    var ctl=self.row(d,label),
        r=inp(doc,ctl,"ja-mini-range","range",bd[key]),
        out=mk(doc,ctl,"span","ja-mini-val",bd[key]+"%");
    r.min=String(min);r.max=String(max);
    r.addEventListener("input",function(){
      bd[key]=parseInt(r.value,10);out.textContent=r.value+"%";self.save();
    });
  }
  bdSlider("Fond · opacité","opacity",5,100);
  bdSlider("Fond · début","fadeStart",0,99);
  bdSlider("Fond · fin","fadeEnd",1,100);

  var hRow=this.row(o,"Hauteur bannière"),
      h=inp(doc,hRow,"ja-mini-range","range",cfg.options.bannerHeight);
  h.min="110";h.max="280";h.step="10";
  var hv=mk(doc,hRow,"span","ja-mini-val",cfg.options.bannerHeight+"px");
  h.addEventListener("input",function(){
    cfg.options.bannerHeight=parseInt(h.value,10);
    hv.textContent=cfg.options.bannerHeight+"px";
    self.save();
  });
};
JournalSettingsWidget.prototype.refresh=function(){return false;};

/* ================================================================== */
/* 4. Réglages Agenda, dans la même page que Journal                  */
/* ================================================================== */
var AgendaSettingsWidget=function(p,o){this.initialise(p,o);};
AgendaSettingsWidget.prototype=new Widget();
AgendaSettingsWidget.prototype.execute=function(){this.cfg=Agenda.readConfig(this.wiki);};
AgendaSettingsWidget.prototype.render=function(parent,nextSibling){this.parentDomNode=parent;this.computeAttributes();this.execute();var root=mk(this.document,null,"div","ja-agenda-settings");parent.insertBefore(root,nextSibling);this.domNodes.push(root);this.build(root);};
AgendaSettingsWidget.prototype.save=function(){Agenda.writeConfig(this.wiki,this.cfg);};
AgendaSettingsWidget.prototype.build=function(root){
  var self=this,doc=this.document,wiki=this.wiki,cfg=this.cfg;

  /* Même composants que le Journal : plus de sous-page visuelle Agenda. */
  function fold(host,icon,title,hint,open){
    var sec=mk(doc,host,"section","ja-fold"+(open?" is-open":"")),
        head=btn(doc,sec,"ja-fold-head","");
    mk(doc,head,"span","ja-fold-caret","›");
    mk(doc,head,"span","ja-fold-ico",icon);
    mk(doc,head,"span","ja-fold-title",title);
    if(hint){mk(doc,head,"span","ja-fold-hint",hint);}
    head.addEventListener("click",function(){sec.classList.toggle("is-open");});
    return mk(doc,sec,"div","ja-fold-body");
  }

  function row(body,label){
    var r=mk(doc,body,"div","ja-jset-row");
    if(label){mk(doc,r,"span","ja-jset-rowlab",label);}
    return mk(doc,r,"div","ja-jset-rowctl");
  }

  function toggle(body,label,key){
    var ctl=row(body,label),
        b=btn(doc,ctl,"ja-sw"+(cfg[key]?" is-on":""),"");
    mk(doc,b,"span","ja-sw-knob","");
    b.addEventListener("click",function(){
      cfg[key]=!cfg[key];
      b.classList.toggle("is-on",cfg[key]);
      self.save();
    });
  }

  /* Icône d'un type d'événement : exactement la logique du Journal.
     emoji / import / URL / wiki / Lucide. */
  function eventTypeIconPicker(parent,item){
    var b=btn(doc,parent,"ja-icon-pick ja-eventtype-icon-pick","");
    b.title="Changer l’icône du type";

    var hidden=inp(doc,parent,"","file");
    hidden.accept="image/*";
    hidden.style.display="none";

    function draw(){
      b.innerHTML="";
      var src=item.image?JConfig.imageSrc(wiki,String(item.image||"")):"";
      if(src){
        var im=mk(doc,b,"img","");
        im.src=src;im.alt="";
        b.classList.add("is-image");
      }else{
        mk(doc,b,"span","ja-icon-pick-emo",item.icon||"＋");
        b.classList.remove("is-image");
      }
    }

    function setImage(v){
      item.image=v||"";
      draw();
      self.save();
    }

    function setEmoji(v){
      item.icon=v||"";
      item.image="";
      draw();
      self.save();
    }

    hidden.addEventListener("change",async function(){
      var f=hidden.files&&hidden.files[0];
      hidden.value="";
      if(!f){return;}
      try{
        var d=await readFile(f),
            title="$:/journalapp/event-type-icons/"+slugify(item.id||item.label)+"-"+uid();
        wiki.addTiddler(new $tw.Tiddler({
          title:title,type:f.type||"image/png",text:b64(d),
          "media-name":f.name||item.label||"Type"
        },{created:new Date(),modified:new Date()}));
        setImage(title);
      }catch(e){
        window.alert(e&&e.message?e.message:"Import impossible.");
      }
    });

    b.addEventListener("click",function(){
      var items=[
        {label:"🙂  Emoji…",run:function(){
          var v=window.prompt("Emoji ?",item.icon||"");
          if(v!==null){setEmoji(v.trim());}
        }},
        {sep:true},
        {label:"📁  Importer une image…",run:function(){hidden.click();}},
        {label:"🔗  Image depuis une URL",run:function(){
          var uri=window.prompt("Adresse de l’image (https://…)");
          if(!uri){return;}
          var title="$:/journalapp/event-type-icons/url-"+uid();
          wiki.addTiddler(new $tw.Tiddler({
            title:title,type:"image/png",text:"",_canonical_uri:uri.trim(),
            "media-name":item.label||"Type"
          },{created:new Date(),modified:new Date()}));
          setImage(title);
        }},
        {label:"🖼️  Image du wiki",run:function(){openWikiImagePicker(doc,wiki,b,function(tt){setImage(tt);});}},
        {label:"✦  Lucide…",run:function(){
          openIconBrowser(doc,wiki,{
            color:item.color||"#e8e6ef",
            onPick:function(svg,name){
              var title="$:/journalapp/event-type-icons/lucide-"+name+"-"+uid();
              wiki.addTiddler(new $tw.Tiddler({
                title:title,type:"image/svg+xml",text:svg,
                "media-name":name,"media-tags":"Lucide"
              },{created:new Date(),modified:new Date()}));
              setImage(title);
            }
          });
        }}
      ];

      if(item.image){
        items.push(
          {sep:true},
          {label:"✕  Revenir à l’emoji",run:function(){setImage("");}}
        );
      }
      popover(doc,b,items);
    });

    draw();
  }

  /* Fond automatique d'un type selon la nature de l'objet.
     Le choix est séparé pour Event / To-do / Habitude / Créneau. */
  function typeBackdropData(raw){
    if(typeof raw==="string"){return Media.normalizeBackdrop({src:raw});}
    if(raw&&typeof raw==="object"){return Media.normalizeBackdrop(raw);}
    return Media.normalizeBackdrop({});
  }

  function typeBackdropRef(raw){
    if(typeof raw==="string"){return raw;}
    if(raw&&typeof raw==="object"){return String(raw.src||raw.ref||raw.path||"");}
    return "";
  }

  /* Le petit formulaire reprend exactement les réglages d'un fond Journal :
     cadrage, position, opacité et fondu. Rien n'est enregistré avant Valider. */
  function openTypeBackdropEditor(item,role,label,onSaved){
    var raw=item.backgrounds&&item.backgrounds[role],draft=typeBackdropData(raw);
    if(!draft.src){return;}

    var overlay=mk(doc,doc.body,"div","ja-jform-overlay ja-agenda-auto-bg-overlay"),
        modal=mk(doc,overlay,"div","ja-jform-modal ja-agenda-auto-bg-modal"),
        head=mk(doc,modal,"div","ja-jform-head"),
        heading=mk(doc,head,"div","ja-jform-heading");
    mk(doc,heading,"div","ja-jform-kicker","Agenda · fond automatique");
    mk(doc,heading,"h2","ja-jform-title",String(item.label||"Type")+" · "+label);
    var close=btn(doc,head,"ja-jform-close","×","Fermer");

    var body=mk(doc,modal,"div","ja-jform-body ja-agenda-auto-bg-body"),
        preview=mk(doc,body,"div","ja-backpreview ja-agenda-auto-bg-preview");
    mk(doc,preview,"div","ja-backpreview-text","Aperçu du fond automatique · "+label);

    function repaint(){
      Media.applyBackdropLayer(wiki,preview,draft,{
        hostClass:"ja-media-backdrop-host",layerClass:"ja-agenda-auto-bg-preview-layer"
      });
    }
    repaint();

    var opts=mk(doc,body,"div","ja-backopts ja-agenda-auto-bg-opts");
    function editorRow(labelText){
      var r=mk(doc,opts,"div","ja-imgset-row");
      mk(doc,r,"span","ja-imgset-lab",labelText);
      return mk(doc,r,"div","ja-imgset-ctl");
    }
    function seg(host,options,key,after){
      function redraw(){
        Array.prototype.slice.call(host.children).forEach(function(x){x.classList.remove("is-on");});
        Array.prototype.slice.call(host.children).forEach(function(x){if(x.dataset.value===String(draft[key])){x.classList.add("is-on");}});
      }
      options.forEach(function(pair){
        var b=btn(doc,host,"ja-seg-sm"+(draft[key]===pair[0]?" is-on":""),pair[1]);
        b.dataset.value=pair[0];
        b.addEventListener("click",function(){draft[key]=pair[0];redraw();repaint();if(after){after();}});
      });
    }
    function slider(labelText,min,max,key){
      var ctl=editorRow(labelText),r=inp(doc,ctl,"ja-imgset-range","range",draft[key]),
          out=mk(doc,ctl,"span","ja-imgset-val",draft[key]+"%");
      r.min=String(min);r.max=String(max);
      r.addEventListener("input",function(){draft[key]=parseInt(r.value,10);out.textContent=r.value+"%";repaint();});
    }

    seg(editorRow("Cadrage"),[["cover","Remplir"],["contain","Entier"],["fill","Étirer"]],"fit");
    slider("Position ↔",0,100,"posX");
    slider("Position ↕",0,100,"posY");
    slider("Opacité",5,100,"opacity");

    var dirCtl=editorRow("Fondu vers"),rose=mk(doc,dirCtl,"div","ja-fade-rose");
    [["tl","↖"],["top","↑"],["tr","↗"],["left","←"],["none","∅"],["right","→"],["bl","↙"],["bottom","↓"],["br","↘"]].forEach(function(pair){
      var b=btn(doc,rose,"ja-fade-dir"+(draft.fadeDir===pair[0]?" is-on":""),pair[1]);
      b.addEventListener("click",function(){
        draft.fadeDir=pair[0];
        Array.prototype.slice.call(rose.children).forEach(function(x){x.classList.remove("is-on");});
        b.classList.add("is-on");repaint();
      });
    });

    var colorRow=null,colorInput=null;
    function syncColorRow(){
      if(colorRow){colorRow.style.display=draft.fadeMode==="color"?"":"none";}
    }
    seg(editorRow("Fondu"),[["transparent","Transparence"],["color","Couleur"]],"fadeMode",syncColorRow);
    colorRow=mk(doc,opts,"div","ja-imgset-row");
    mk(doc,colorRow,"span","ja-imgset-lab","Couleur");
    var colorCtl=mk(doc,colorRow,"div","ja-imgset-ctl");
    colorInput=inp(doc,colorCtl,"ja-mini-color","color",draft.fadeColor||"#14161d");
    colorInput.addEventListener("input",function(){draft.fadeColor=colorInput.value;repaint();});
    syncColorRow();
    slider("Début",0,99,"fadeStart");
    slider("Fin",1,100,"fadeEnd");

    var foot=mk(doc,modal,"div","ja-jform-footer"),sp=mk(doc,foot,"span","ja-jform-spacer"),
        cancel=btn(doc,foot,"ja-jform-secondary","Annuler"),
        save=btn(doc,foot,"ja-jform-save","Enregistrer");

    function shut(){overlay.remove();}
    close.addEventListener("click",shut);cancel.addEventListener("click",shut);
    overlay.addEventListener("click",function(e){if(e.target===overlay){shut();}});
    save.addEventListener("click",function(){
      draft=Media.normalizeBackdrop(draft);
      draft.src=typeBackdropRef(draft);
      item.backgrounds[role]=draft;
      self.save();shut();if(onSaved){onSaved();}
    });
  }

  /* Fond automatique d'un type selon la nature de l'objet.
     Le choix est séparé pour Event / To-do / Habitude / Créneau. */
  function eventTypeBackdropPicker(parent,item,role,label){
    item.backgrounds=item.backgrounds&&typeof item.backgrounds==="object"?
      item.backgrounds:{};

    var wrap=mk(doc,parent,"div","ja-type-backdrop-wrap"),
        b=btn(doc,wrap,"ja-type-backdrop-pick","");
    b.title="Fond automatique : "+label;
    var edit=btn(doc,wrap,"ja-type-backdrop-edit","✎","Modifier le fond "+label);

    function rawValue(){return item.backgrounds[role]||"";}
    function value(){return typeBackdropRef(rawValue());}

    function draw(){
      b.innerHTML="";
      var ref=value(),src=ref?JConfig.imageSrc(wiki,ref):"";

      if(src){
        var im=mk(doc,b,"img","ja-type-backdrop-thumb");
        im.src=src;im.alt="";b.classList.add("has-image");edit.style.display="";
      }else{
        mk(doc,b,"span","ja-type-backdrop-empty","＋");
        b.classList.remove("has-image");edit.style.display="none";
      }
      mk(doc,b,"span","ja-type-backdrop-label",label);
    }

    function setBack(ref){
      var old=rawValue();
      if(!ref){item.backgrounds[role]="";}
      else if(old&&typeof old==="object"){
        var next=Object.assign({},old);next.src=ref;delete next.ref;delete next.path;item.backgrounds[role]=next;
      }else{item.backgrounds[role]=ref;}
      self.save();draw();
    }

    var hidden=inp(doc,wrap,"","file");
    hidden.accept="image/*";hidden.style.display="none";
    hidden.addEventListener("change",async function(){
      var f=hidden.files&&hidden.files[0];hidden.value="";if(!f){return;}
      try{
        var d=await readFile(f),title="$:/journalapp/event-type-backgrounds/"+slugify(item.id||item.label)+"-"+role+"-"+uid();
        wiki.addTiddler(new $tw.Tiddler({title:title,type:f.type||"image/png",text:b64(d),"media-name":f.name||item.label||"Fond"},{created:new Date(),modified:new Date()}));
        setBack(title);
      }catch(e){window.alert(e&&e.message?e.message:"Import impossible.");}
    });

    b.addEventListener("click",function(){
      var items=[
        {label:"📁  Importer une image…",run:function(){hidden.click();}},
        {label:"🔗  Image depuis une URL",run:function(){
          var uri=window.prompt("Adresse de l’image (https://…)");if(!uri){return;}
          var title="$:/journalapp/event-type-backgrounds/url-"+uid();
          wiki.addTiddler(new $tw.Tiddler({title:title,type:"image/png",text:"",_canonical_uri:uri.trim(),"media-name":item.label+" · "+label},{created:new Date(),modified:new Date()}));
          setBack(title);
        }},
        {label:"🖼️  Image du wiki",run:function(){openWikiImagePicker(doc,wiki,b,function(tt){setBack(tt);});}}
      ];
      if(value()){items.push({sep:true},{label:"✕  Aucun fond automatique",run:function(){setBack("");}});}
      popover(doc,b,items);
    });

    edit.addEventListener("click",function(e){e.stopPropagation();openTypeBackdropEditor(item,role,label,draw);});
    draw();
  }

  /* Temps / vues */
  var views=fold(root,"📆","Vues & temps","navigation, semaine, organisation");

  var first=row(views,"Premier jour de la semaine");
  [[0,"Lundi"],[1,"Dimanche"]].forEach(function(x){
    var b=btn(doc,first,"ja-seg"+(+cfg.firstDayOfWeek===x[0]?" is-on":""),x[1]);
    b.addEventListener("click",function(){
      cfg.firstDayOfWeek=x[0];self.save();self.refreshSelf();
    });
  });

  var days=row(views,"Jours dans À venir"),
      di=inp(doc,days,"ja-mini-input ja-mini-input-xs","number",cfg.listDays);
  di.min="3";di.max="60";
  di.addEventListener("change",function(){
    cfg.listDays=Math.max(3,Math.min(60,parseInt(di.value,10)||14));
    self.save();
  });

  var order=row(views,"Ordre de À venir"),
      os=mk(doc,order,"select","ja-mini-input");
  [["soonest-first","Proche → lointain"],["farthest-first","Lointain → proche"]].forEach(function(x){
    var o=mk(doc,os,"option","",x[1]);
    o.value=x[0];
    if((cfg.listOrder||"soonest-first")===x[0]){o.selected=true;}
  });
  os.addEventListener("change",function(){cfg.listOrder=os.value;self.save();});

  var def=row(views,"Vue ouverte en cliquant Agenda"),
      ds=mk(doc,def,"select","ja-mini-input");
  [["home","Aperçu"],["upcoming","À venir"],["year","Année"],["month","Mois"],
   ["week","Semaine"],["day","Jour"],["organisation","Organisation"]].forEach(function(x){
    var o=mk(doc,ds,"option","",x[1]);
    o.value=x[0];
    if((cfg.defaultView||"home")===x[0]){o.selected=true;}
  });
  ds.addEventListener("change",function(){
    cfg.defaultView=ds.value;self.save();
    var cat=self.wiki.getTiddler("$:/journalapp/categories/agenda"),
        viewTitle="$:/journalapp/views/agenda/"+ds.value;
    if(cat){
      self.wiki.addTiddler(new $tw.Tiddler(cat,{"landing-view":viewTitle},{modified:new Date()}));
    }
  });

  var hrs=row(views,"Plage horaire Semaine"),
      h0=inp(doc,hrs,"ja-mini-input ja-mini-input-xs","number",cfg.weekStartHour),
      dash=mk(doc,hrs,"span","ja-mini-val","→"),
      h1=inp(doc,hrs,"ja-mini-input ja-mini-input-xs","number",cfg.weekEndHour);
  h0.min="0";h0.max="23";h1.min="1";h1.max="24";
  function saveHours(){
    cfg.weekStartHour=Math.max(0,Math.min(23,parseInt(h0.value,10)||7));
    cfg.weekEndHour=Math.max(cfg.weekStartHour+1,Math.min(24,parseInt(h1.value,10)||23));
    h0.value=cfg.weekStartHour;h1.value=cfg.weekEndHour;
    self.save();
  }
  h0.addEventListener("change",saveHours);
  h1.addEventListener("change",saveHours);

  toggle(views,"Afficher les vacances","showVacations");
  toggle(views,"Masquer les to-dos terminées dans Organisation","hideDoneTodos");
  toggle(views,"Ranger les to-dos terminées en bas","doneTodosAtBottom");
  toggle(views,"Organisation en accordéon","organizationAccordion");
  toggle(views,"Afficher le bandeau résumé de période","showSummary");
  toggle(views,"Afficher fonds, images, audio et liens dans les cartes","showMedia");

  /* Rappels + Types sur UNE ligne */
  var pair=mk(doc,root,"div","ja-agenda-settings-pair");

  var rems=fold(pair,"⏰","Rappels","to-dos, événements, créneaux & habitudes",false),
      rcfg=cfg.reminders||(cfg.reminders={enabled:true,system:false});

  var rr=row(rems,"Activer les rappels"),
      rb=btn(doc,rr,"ja-sw"+(rcfg.enabled!==false?" is-on":""),"");
  mk(doc,rb,"span","ja-sw-knob","");
  rb.addEventListener("click",function(){
    rcfg.enabled=rcfg.enabled===false;
    rb.classList.toggle("is-on",rcfg.enabled!==false);
    self.save();
  });

  var sr=row(rems,"Notifications système"),
      sb=btn(doc,sr,"ja-sw"+(rcfg.system?" is-on":""),"");
  mk(doc,sb,"span","ja-sw-knob","");
  sb.addEventListener("click",function(){
    rcfg.system=!rcfg.system;
    sb.classList.toggle("is-on",rcfg.system);
    self.save();
  });

  var perm=btn(doc,rems,"ja-settings-wide-action","Autoriser les notifications du navigateur");
  perm.addEventListener("click",function(){
    if(typeof Notification==="undefined"){
      perm.textContent="Non disponible dans ce navigateur";
      return;
    }
    Notification.requestPermission().then(function(p){
      perm.textContent=p==="granted"?"Notifications autorisées":"Permission : "+p;
    });
  });
  mk(doc,rems,"div","ja-fold-note",
     "Les heures de rappel sont définies directement dans les formulaires. Les notifications du navigateur nécessitent son autorisation.");

  /* Pas de panneau Anniversaires : la mécanique reste en place mais ce n'est
     plus un réglage utilisateur à exposer. */

  var types=fold(pair,"🏷️","Types d’événements","couleur + icône",false),
      list=mk(doc,types,"div","ja-agenda-settings-types");

  function drawTypes(){
    list.innerHTML="";

    (cfg.eventTypes||[]).forEach(function(t,i){
      var card=mk(doc,list,"div","ja-agenda-settings-typecard"),
          r=mk(doc,card,"div","ja-agenda-settings-type");

      eventTypeIconPicker(r,t);

      var lab=inp(doc,r,"ja-mini-input","text",t.label||"Type"),
          col=inp(doc,r,"ja-mini-color","color",t.color||"#9fb072"),
          protectedType=String(t.id||"")==="anniversaire",
          x=btn(
            doc,r,
            "ja-mini-x"+(protectedType?" is-locked":""),
            protectedType?"🔒":"×",
            protectedType?
              "Le type Anniversaire est requis par le système":
              "Supprimer"
          );

      lab.addEventListener("change",function(){
        t.label=lab.value||"Type";
        self.save();
      });

      col.addEventListener("input",function(){
        t.color=col.value;
        self.save();
      });

      if(!protectedType){
        x.addEventListener("click",function(){
          cfg.eventTypes.splice(i,1);
          self.save();
          drawTypes();
        });
      }else{
        x.disabled=true;
      }

      var backs=mk(doc,card,"div","ja-agenda-type-backgrounds");
      eventTypeBackdropPicker(backs,t,"slot","Créneau");
      eventTypeBackdropPicker(backs,t,"event","Event");
      eventTypeBackdropPicker(backs,t,"todo","To-do");
      eventTypeBackdropPicker(backs,t,"habit","Habitude");
    });
  }

  drawTypes();

  var typeActions=mk(doc,types,"div","ja-agenda-type-actions"),
      add=btn(doc,typeActions,"ja-settings-wide-action","＋ Ajouter un type"),
      reset=btn(doc,typeActions,"ja-settings-wide-action","↺ Types par défaut");

  add.addEventListener("click",function(){
    cfg.eventTypes=cfg.eventTypes||[];
    cfg.eventTypes.push({
      id:"type-"+uid(),label:"Nouveau type",
      color:"#9fb072",icon:"•",image:"",backgrounds:{}
    });
    self.save();
    drawTypes();
  });

  reset.addEventListener("click",function(){
    cfg.eventTypes=JSON.parse(JSON.stringify(Agenda.DEFAULT_CONFIG.eventTypes));
    self.save();
    drawTypes();
  });
};
AgendaSettingsWidget.prototype.refresh=function(){return false;};

exports.jacategories=CategoriesWidget;
exports.jamedialibrary=MediaLibraryWidget;
exports.jajournalsettings=JournalSettingsWidget;
exports.jaagendasettings=AgendaSettingsWidget;

})();
