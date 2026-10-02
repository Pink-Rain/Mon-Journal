/*\
title: $:/journalapp/modules/widgets/entity-settings.js
type: application/javascript
module-type: widget

Mon Journal — Settings Relations et Sommeil.
Même accordéon compact que Journal & Agenda, fermé par défaut.
\*/
(function(){
"use strict";

var Widget=require("$:/core/modules/widgets/widget.js").widget,
    EConfig=require("$:/journalapp/modules/lib/entity-config.js"),
    JConfig=require("$:/journalapp/modules/lib/jconfig.js"),
    Media=require("$:/journalapp/modules/lib/jmedia.js");

function mk(doc,parent,tag,cls,text){
  var e=doc.createElement(tag);if(cls){e.className=cls;}
  if(text!==undefined&&text!==null){e.textContent=text;}if(parent){parent.appendChild(e);}return e;
}
function btn(doc,parent,cls,text,title){
  var b=mk(doc,parent,"button",cls,text);b.type="button";
  if(title){b.title=title;b.setAttribute("aria-label",title);}return b;
}
function inp(doc,parent,cls,type,value){
  var i=mk(doc,parent,"input",cls);i.type=type||"text";i.value=value||"";return i;
}
function readFile(file){
  return new Promise(function(resolve,reject){
    var r=new FileReader();r.onload=function(){resolve(String(r.result||""));};r.onerror=function(){reject(r.error||new Error("Lecture impossible."));};r.readAsDataURL(file);
  });
}
function b64(dataUrl){var p=String(dataUrl||"").indexOf(",");return p===-1?dataUrl:dataUrl.slice(p+1);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function popover(doc,anchor,items){
  var old=doc.querySelector(".ja-pop.ja-entity-settings-pop");if(old){old.remove();}
  var pop=mk(doc,doc.body,"div","ja-pop ja-entity-settings-pop");
  (items||[]).forEach(function(it){
    if(it.sep){mk(doc,pop,"div","ja-pop-sep");return;}
    var b=btn(doc,pop,"ja-pop-item",it.label);b.addEventListener("click",function(){close();it.run();});
  });
  var r=anchor.getBoundingClientRect(),w=doc.documentElement.clientWidth,h=doc.documentElement.clientHeight;
  pop.style.left="8px";pop.style.top="8px";
  var pw=pop.offsetWidth||220,ph=pop.offsetHeight||240,
      left=Math.max(8,Math.min(r.left,w-pw-8)),top=r.bottom+6;
  if(top+ph>h-8){top=Math.max(8,r.top-ph-6);}
  pop.style.left=Math.round(left)+"px";pop.style.top=Math.round(top)+"px";
  function close(){if(pop){pop.remove();pop=null;}doc.removeEventListener("mousedown",away,true);}
  function away(e){if(pop&&!pop.contains(e.target)&&e.target!==anchor){close();}}
  setTimeout(function(){doc.addEventListener("mousedown",away,true);},0);
}
function fold(doc,parent,icon,title,hint){
  var sec=mk(doc,parent,"section","ja-fold"),
      head=btn(doc,sec,"ja-fold-head","");
  mk(doc,head,"span","ja-fold-caret","›");
  mk(doc,head,"span","ja-fold-ico",icon);
  mk(doc,head,"span","ja-fold-title",title);
  if(hint){mk(doc,head,"span","ja-fold-hint",hint);}
  head.addEventListener("click",function(){sec.classList.toggle("is-open");});
  return mk(doc,sec,"div","ja-fold-body");
}

var EntitySettingsWidget=function(parseTreeNode,options){this.initialise(parseTreeNode,options);};
EntitySettingsWidget.prototype=new Widget();

EntitySettingsWidget.prototype.execute=function(){
  this.mode=this.getAttribute("mode","relations");
};

EntitySettingsWidget.prototype.render=function(parent,nextSibling){
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  var root=mk(this.document,null,"div","ja-jset ja-entity-settings");
  parent.insertBefore(root,nextSibling);this.domNodes.push(root);
  if(this.mode==="sleep"){this.buildSleep(root);}else{this.buildRelations(root);}
};

EntitySettingsWidget.prototype.iconPicker=function(parent,item,onChange,folder){
  var self=this,doc=this.document,wiki=this.wiki,b=btn(doc,parent,"ja-icon-pick",""),hidden=inp(doc,parent,"","file","");
  hidden.accept="image/*";hidden.style.display="none";
  function draw(){
    b.innerHTML="";var src=item.image?JConfig.imageSrc(wiki,item.image):"";
    if(src){var im=mk(doc,b,"img","");im.src=src;im.alt="";b.classList.add("is-image");}
    else{mk(doc,b,"span","ja-icon-pick-emo",item.emoji||"＋");b.classList.remove("is-image");}
  }
  function setImage(v){item.image=v||"";draw();onChange();}
  function setEmoji(v){item.emoji=v||"";item.image="";draw();onChange();}
  hidden.addEventListener("change",async function(){
    var f=hidden.files&&hidden.files[0];hidden.value="";if(!f){return;}
    try{
      var data=await readFile(f),title=folder+"/"+EConfig.slug(f.name.replace(/\.[^.]+$/,""))+"-"+uid();
      wiki.addTiddler(new $tw.Tiddler({title:title,type:f.type||"image/png",text:b64(data),"media-name":f.name},{created:new Date(),modified:new Date()}));
      setImage(title);
    }catch(e){window.alert(e&&e.message?e.message:"Import impossible.");}
  });
  b.addEventListener("click",function(){
    var items=[
      {label:"🙂 Emoji…",run:function(){var v=window.prompt("Emoji ?",item.emoji||"");if(v!==null){setEmoji(String(v).trim());}}},
      {sep:true},
      {label:"📁 Importer une image…",run:function(){hidden.click();}},
      {label:"🔗 Image depuis une URL",run:function(){
        var uri=window.prompt("Adresse de l’image (https://…)");if(!uri){return;}
        var title=folder+"/lien-"+uid();
        wiki.addTiddler(new $tw.Tiddler({title:title,type:"image/png",text:"",_canonical_uri:String(uri).trim()},{created:new Date(),modified:new Date()}));
        setImage(title);
      }},
      {label:"🖼️ Image du wiki",run:function(){Media.openWikiImagePicker(doc,wiki,b,function(tt){setImage(tt);});}}
    ];
    if(item.image){items.push({sep:true},{label:"✕ Revenir à l’emoji",run:function(){setImage("");}});}
    popover(doc,b,items);
  });
  draw();
};

EntitySettingsWidget.prototype.buildRelations=function(root){
  var self=this,doc=this.document,cfg=EConfig.readRelations(this.wiki),
      band=mk(doc,root,"div","ja-jset-band ja-band-1"),
      body=fold(doc,band,"👤","Types de relation","couleur · icône · ordre"),
      head=mk(doc,body,"div","ja-entity-settings-intro");
  mk(doc,head,"p","", "Ces couleurs servent notamment aux anniversaires dans l’Agenda.");
  var add=btn(doc,head,"ja-jform-secondary","＋ Ajouter un type"),
      list=mk(doc,body,"div","ja-entity-settings-list");

  function save(){EConfig.writeRelations(self.wiki,cfg);}
  function draw(){
    list.innerHTML="";
    (cfg.relationTypes||[]).forEach(function(rt,index){
      var row=mk(doc,list,"div","ja-entity-settings-row");
      self.iconPicker(row,rt,save,"$:/journalapp/relation-type-icons");
      var label=inp(doc,row,"ja-jform-input ja-entity-settings-label","text",rt.label||"");
      var color=inp(doc,row,"ja-mini-color ja-entity-settings-color","color",rt.color||"#9a92a6");
      var up=btn(doc,row,"ja-entity-settings-move","↑","Monter"),
          down=btn(doc,row,"ja-entity-settings-move","↓","Descendre"),
          del=btn(doc,row,"ja-entity-settings-delete","×","Supprimer");
      label.addEventListener("change",function(){rt.label=label.value.trim()||rt.id;save();});
      color.addEventListener("input",function(){rt.color=color.value;save();});
      up.disabled=index===0;down.disabled=index===(cfg.relationTypes.length-1);
      up.addEventListener("click",function(){if(index>0){var x=cfg.relationTypes.splice(index,1)[0];cfg.relationTypes.splice(index-1,0,x);save();draw();}});
      down.addEventListener("click",function(){if(index<cfg.relationTypes.length-1){var x=cfg.relationTypes.splice(index,1)[0];cfg.relationTypes.splice(index+1,0,x);save();draw();}});
      del.addEventListener("click",function(){
        if(!window.confirm("Supprimer le type « "+(rt.label||rt.id)+" » ? Les relations existantes garderont son identifiant, mais n’auront plus de couleur configurée.")){return;}
        cfg.relationTypes.splice(index,1);save();draw();
      });
    });
  }
  add.addEventListener("click",function(){
    var label=window.prompt("Nom du nouveau type de relation ?","");if(!label){return;}
    var id=EConfig.slug(label),base=id,n=2;while((cfg.relationTypes||[]).some(function(x){return x.id===id;})){id=base+"-"+n++;}
    cfg.relationTypes.push({id:id,label:String(label).trim(),color:"#9a92a6",emoji:"•",image:""});save();draw();
  });
  draw();
};

EntitySettingsWidget.prototype.buildSleep=function(root){
  var self=this,doc=this.document,cfg=EConfig.readSleep(this.wiki),
      band=mk(doc,root,"div","ja-jset-band ja-band-1"),
      body=fold(doc,band,"🌙","Qualité du sommeil","5 niveaux · image ou emoji"),
      intro=mk(doc,body,"div","ja-entity-settings-intro");
  mk(doc,intro,"p","","Chaque niveau garde sa valeur de 1 à 5 ; tu peux changer son nom, sa couleur et son visuel.");
  var list=mk(doc,body,"div","ja-entity-settings-list");
  function save(){EConfig.writeSleep(self.wiki,cfg);}
  (cfg.qualities||[]).forEach(function(q){
    var row=mk(doc,list,"div","ja-entity-settings-row ja-sleep-settings-row");
    self.iconPicker(row,q,save,"$:/journalapp/sleep-quality-icons");
    mk(doc,row,"span","ja-sleep-settings-value",String(q.value||""));
    var label=inp(doc,row,"ja-jform-input ja-entity-settings-label","text",q.label||""),
        color=inp(doc,row,"ja-mini-color ja-entity-settings-color","color",q.color||"#9a92a6");
    label.addEventListener("change",function(){q.label=label.value.trim()||q.id;save();});
    color.addEventListener("input",function(){q.color=color.value;save();});
  });
};

EntitySettingsWidget.prototype.refresh=function(){return false;};
exports.jaentitysettings=EntitySettingsWidget;
})();
