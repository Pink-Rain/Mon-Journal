/*\
title: $:/journalapp/modules/lib/agenda.js
type: application/javascript
module-type: library

Mon Journal — noyau Agenda partagé.
Les données Agenda sont de vrais tiddlers. Ce module ne maintient aucune base parallèle.
Il résout événements, créneaux, vacances, to-dos, récurrences, exceptions et liens Daily.
\*/
"use strict";

var JConfig=require("$:/journalapp/modules/lib/jconfig.js"),
    EntityConfig=require("$:/journalapp/modules/lib/entity-config.js");

var CONFIG_TIDDLER="$:/journalapp/config/agenda";
var DEFAULT_CONFIG={
  firstDayOfWeek:0,
  listDays:14,
  weekStartHour:6,
  weekEndHour:22,
  dayStartHour:0,
  dayEndHour:24,
  showVacations:true,
  hideDoneTodos:false,
  doneTodosAtBottom:true,
  organizationAccordion:true,
  showMedia:true,
  showSummary:true,
  listOrder:"soonest-first",
  defaultView:"home",
  reminders:{enabled:true,system:false},
  birthdays:{enabled:true,field:"date_naissance",typeId:"anniversaire"},
  eventTypes:[
    {id:"travail",label:"Travail",color:"#7a9e6c",icon:"💼"},
    {id:"sante",label:"Santé",color:"#c77b83",icon:"🩺"},
    {id:"administratif",label:"Administratif",color:"#9fb072",icon:"📄"},
    {id:"plaisir",label:"Plaisir",color:"#d69a6a",icon:"✨"},
    {id:"anniversaire",label:"Anniversaire",color:"#d9b96b",icon:"🎂"},
    {id:"cours",label:"Cours",color:"#8fa3c8",icon:"📚"}
  ]
};

function clone(x){return JSON.parse(JSON.stringify(x));}

function ensureRequiredEventTypes(types){
  var out=Array.isArray(types)?types.slice():[],
      hasBirthday=out.some(function(x){
        return x&&String(x.id||"")==="anniversaire";
      });

  if(!hasBirthday){
    var def=DEFAULT_CONFIG.eventTypes.filter(function(x){
      return x.id==="anniversaire";
    })[0];
    if(def){out.push(clone(def));}
  }
  return out;
}

function readConfig(wiki){
  var out=clone(DEFAULT_CONFIG),raw=wiki.getTiddlerText(CONFIG_TIDDLER,"");
  try{
    var p=raw?JSON.parse(raw):null;
    if(p&&typeof p==="object"){
      Object.keys(out).forEach(function(k){if(p[k]!==undefined){out[k]=p[k];}});
      if(Array.isArray(p.eventTypes)){out.eventTypes=p.eventTypes;}
      out.birthdays=Object.assign({},DEFAULT_CONFIG.birthdays,(p.birthdays&&typeof p.birthdays==="object")?p.birthdays:{});
      out.reminders=Object.assign({},DEFAULT_CONFIG.reminders,(p.reminders&&typeof p.reminders==="object")?p.reminders:{});
    }
  }catch(e){}
  out.eventTypes=ensureRequiredEventTypes(out.eventTypes);
  return out;
}
function writeConfig(wiki,cfg){
  cfg=cfg||readConfig(wiki);
  cfg.eventTypes=ensureRequiredEventTypes(cfg.eventTypes);
  var old=wiki.getTiddler(CONFIG_TIDDLER),fields={title:CONFIG_TIDDLER,type:"application/json",text:JSON.stringify(cfg,null,2)};
  wiki.addTiddler(old?new $tw.Tiddler(old,fields,{modified:new Date()}):new $tw.Tiddler(fields,{created:new Date(),modified:new Date()}));
  return cfg;
}
function tagsOf(t){
  if(!t||!t.fields){return [];}
  if(Array.isArray(t.fields.tags)){return t.fields.tags.slice();}
  return $tw.utils.parseStringArray(String(t.fields.tags||""))||[];
}
function parseList(v){
  if(Array.isArray(v)){return v.slice();}
  return $tw.utils.parseStringArray(String(v||""))||[];
}
function stringifyList(v){return $tw.utils.stringifyList((v||[]).filter(Boolean));}
function parseJson(v,fallback){try{return v?JSON.parse(String(v)):fallback;}catch(e){return fallback;}}
function val(f,a,b,def){
  if(f&&f[a]!==undefined&&f[a]!==""){return f[a];}
  if(b&&f&&f[b]!==undefined&&f[b]!==""){return f[b];}
  return def;
}
function yes(v){return v===true||String(v||"").toLowerCase()==="yes"||String(v||"")==="true"||String(v||"")==="1";}
function isDaily(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="Daily"&&tagsOf(t).indexOf("Journal")!==-1);}
function isEvent(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="event"&&tagsOf(t).indexOf("Agenda")!==-1);}
function isTodo(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="todo"&&tagsOf(t).indexOf("Agenda")!==-1);}
function isVacation(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="vacation"&&tagsOf(t).indexOf("Agenda")!==-1);}
function isHabit(t){return !!(t&&t.fields&&String(t.fields.kind||"")==="habit"&&tagsOf(t).indexOf("Agenda")!==-1);}
function pad(n){return String(n).padStart(2,"0");}
function isoFrom(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function todayIso(){return isoFrom(new Date());}
function parseIso(iso){var p=String(iso||"").split("-").map(Number);return new Date(p[0]||1970,(p[1]||1)-1,p[2]||1,12);}
function addDays(iso,n){var d=parseIso(iso);d.setDate(d.getDate()+n);return isoFrom(d);}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function addMonths(iso,n){var d=parseIso(iso),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,daysInMonth(d.getFullYear(),d.getMonth())));return isoFrom(d);}
function addYears(iso,n){var d=parseIso(iso),day=d.getDate();d.setDate(1);d.setFullYear(d.getFullYear()+n);d.setDate(Math.min(day,daysInMonth(d.getFullYear(),d.getMonth())));return isoFrom(d);}
function cmp(a,b){return a<b?-1:a>b?1:0;}
function inRange(x,a,b){return cmp(x,a)>=0&&cmp(x,b)<=0;}
function dowMonday(iso){var d=parseIso(iso).getDay();return d===0?6:d-1;}
function daysBetween(a,b){return Math.round((parseIso(b)-parseIso(a))/86400000);}
function addSpan(date,span){return span>0?addDays(date,span):date;}
function startOfWeek(iso,firstDay){
  var d=parseIso(iso),dow=d.getDay(),offset=(+firstDay===1)?dow:(dow===0?6:dow-1);
  return addDays(iso,-offset);
}
function endOfWeek(iso,firstDay){return addDays(startOfWeek(iso,firstDay),6);}
function startOfMonth(iso){return String(iso||todayIso()).slice(0,7)+"-01";}
function endOfMonth(iso){var d=parseIso(iso);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(daysInMonth(d.getFullYear(),d.getMonth()));}
function minutesOf(h){
  if(!h||!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(h))){return null;}
  var p=String(h).split(":").map(Number);return p[0]*60+p[1];
}
function endMinutes(item){
  var s=minutesOf(item&&item.startTime),e=minutesOf(item&&item.endTime);
  if(s===null){return null;}
  if(e!==null){if(e<=s){e+=1440;}return e;}
  var dur=Math.max(0,+((item&&item.durationMinutes)||0)||0);
  if(dur){return s+dur;}
  if(item&&item.kind==="todo"){return s+30;}
  /* Un événement horaire sans fin explicite reste un vrai petit bloc :
     sa durée implicite est de dix minutes. */
  if(item&&item.kind==="event"){return s+10;}
  return s+60;
}
function inSlot(item,slot){
  var ss=minutesOf(slot&&slot.startTime),
      se=endMinutes(slot),
      is=minutesOf((item&&item.startTime)||(item&&item.reminderTime));
  if(ss===null||se===null||is===null){return false;}

  /*
    APPARTENANCE À UN CRÉNEAU = HEURE DE DÉBUT.

    L'ancienne règle exigeait que l'élément se TERMINE également avant la
    fin du créneau. Cela expulsait visuellement un événement qui commence
    bien dans son conteneur mais finit après sa borne, et le problème devient
    particulièrement visible avec les créneaux continus découpés par jour.

    La durée reste utilisée par les vues pour dessiner la hauteur/largeur de
    l'élément ; elle ne décide plus de son parent visuel.
  */
  return is>=ss&&is<se;
}
function groupIntoSlots(items){
  items=items||[];
  var slots=items.filter(function(x){return x&&x.kind==="event"&&x.role==="slot"&&x.startTime&&x.endTime;})
    .sort(function(a,b){return (a.startTime||"").localeCompare(b.startTime||"")||(endMinutes(b)||0)-(endMinutes(a)||0);});
  if(!slots.length){return {slots:[],free:items.slice()};}
  var groups=slots.map(function(s){return {slot:s,inside:[]};}),slotSet=new Set(slots),free=[];
  items.forEach(function(item){
    if(slotSet.has(item)){return;}
    var best=null,bestWidth=Infinity;
    groups.forEach(function(g){
      if(!inSlot(item,g.slot)){return;}
      var width=(endMinutes(g.slot)||0)-(minutesOf(g.slot.startTime)||0);
      if(width<bestWidth){best=g;bestWidth=width;}
    });
    if(best){best.inside.push(item);}else{free.push(item);}
  });
  groups.forEach(function(g){g.inside.sort(function(a,b){return ((a.startTime||a.reminderTime||"24:00").localeCompare(b.startTime||b.reminderTime||"24:00"))||a.title.localeCompare(b.title);});});
  return {slots:groups,free:free};
}

function normalizeRecurrence(raw,baseDate){
  var r=typeof raw==="string"?parseJson(raw,null):raw;
  if(!r||typeof r!=="object"){return null;}
  return {
    frequency:r.frequency||r.frequence||"week",
    interval:Math.max(1,parseInt(r.interval||r.intervalle||1,10)||1),
    weekdays:Array.isArray(r.weekdays)?r.weekdays:(Array.isArray(r.joursSemaine)?r.joursSemaine:null),
    start:r.start||r.dateDebut||baseDate,
    end:r.end||r.dateFin||"",
    count:r.count!=null?r.count:r.nbOccurrencesMax
  };
}
function recurrenceDates(raw,a,b,baseDate){
  var r=normalizeRecurrence(raw,baseDate),out=[],guard=0;
  if(!r||!r.start){return out;}
  var maxCount=r.count==null||r.count===""?null:Math.max(0,parseInt(r.count,10)||0);
  if(r.frequency==="week"||r.frequency==="semaine"){
    var weekdays=(r.weekdays&&r.weekdays.length?r.weekdays:[dowMonday(r.start)]).map(Number),
        cursor=addDays(r.start,-dowMonday(r.start)),week=0,count=0;
    while(guard++<5000){
      if(r.end&&cmp(cursor,r.end)>0){break;}
      if(cmp(cursor,b)>0){break;}
      if(week%r.interval===0){
        for(var j=0;j<weekdays.length;j++){
          var date=addDays(cursor,weekdays[j]);
          if(cmp(date,r.start)<0){continue;}
          if(r.end&&cmp(date,r.end)>0){continue;}
          if(maxCount!==null&&count>=maxCount){break;}
          count++;
          if(inRange(date,a,b)){out.push(date);}
        }
      }
      if(maxCount!==null&&count>=maxCount){break;}
      cursor=addDays(cursor,7);week++;
    }
  }else{
    var i=0;
    while(guard++<5000){
      if(maxCount!==null&&i>=maxCount){break;}
      var date;
      if(r.frequency==="day"||r.frequency==="jour"){date=addDays(r.start,i*r.interval);}
      else if(r.frequency==="month"||r.frequency==="mois"){date=addMonths(r.start,i*r.interval);}
      else if(r.frequency==="year"||r.frequency==="annee"){date=addYears(r.start,i*r.interval);}
      else{break;}
      if(r.end&&cmp(date,r.end)>0){break;}
      if(cmp(date,b)>0){break;}
      if(inRange(date,a,b)){out.push(date);}
      i++;
    }
  }
  return out.sort(cmp);
}
function markerMeta(wiki,id){
  var markers=JConfig.read(wiki).markers||[],m=null;
  markers.some(function(x){if(String(x.id)===String(id||"")){m=x;return true;}return false;});
  return m;
}
function eventType(cfg,id){
  var found=null;(cfg.eventTypes||[]).some(function(x){if(String(x.id)===String(id||"")){found=x;return true;}return false;});return found;
}
function vacationOccurrences(tOrFields){
  var f=tOrFields&&tOrFields.fields?tOrFields.fields:(tOrFields||{}),
      raw=f["vacation-occurrences"],list=parseJson(raw,[]),out=[];
  if(Array.isArray(list)){
    list.forEach(function(x){
      if(!x||typeof x!=="object"){return;}
      var a=String(x.start||x["start-date"]||""),
          b=String(x.end||x["end-date"]||a),
          name=String(x.name||x.label||"").trim();
      if(a){out.push({name:name,start:a,end:b||a});}
    });
  }
  if(!out.length){
    var a=String(val(f,"start-date","debut","")),
        b=String(val(f,"end-date","fin",a));
    if(a){out.push({name:"",start:a,end:b||a});}
  }
  /* L’ordre du tableau est volontairement conservé : le formulaire range
     désormais les occurrences les plus récemment ajoutées en premier.
     Les vues qui ont besoin d’un ordre chronologique trient leurs résultats. */
  return out;
}

/* Un emploi du temps est une seule fiche qui peut contenir plusieurs vagues
   de planification, exactement comme une fiche Vacances contient plusieurs
   périodes. Les anciens créneaux restent lisibles via les fields historiques. */
function slotOccurrences(tOrFields){
  var f=tOrFields&&tOrFields.fields?tOrFields.fields:(tOrFields||{}),
      raw=parseJson(f["slot-occurrences"],[]),out=[];
  if(Array.isArray(raw)){
    raw.forEach(function(x){
      if(!x||typeof x!=="object"){return;}
      var date=String(x.date||x.start||x["start-date"]||"");if(!date){return;}
      var rec=x.recurrence||null;if(typeof rec==="string"){rec=parseJson(rec,null);}
      var timingMode=String(x.timingMode||x["timing-mode"]||"daily");
      if(timingMode!=="continuous"){timingMode="daily";}
      var endDate=String(x.endDate||x["end-date"]||date);
      if(cmp(endDate,date)<0){endDate=date;}
      out.push({
        name:String(x.name||x.label||"").trim(),
        date:date,
        startTime:String(x.startTime||x["start-time"]||""),
        endTime:String(x.endTime||x["end-time"]||""),
        timingMode:timingMode,
        endDate:endDate||date,
        reminderTime:String(x.reminderTime||x["reminder-time"]||""),
        recurrence:rec&&typeof rec==="object"?rec:null,
        pauseOnVacations:x.pauseOnVacations===true||yes(x["pause-on-vacations"])
      });
    });
  }
  if(!out.length){
    var date=String(f.date||"");
    if(date){
      out.push({name:"",date:date,startTime:String(f["start-time"]||""),endTime:String(f["end-time"]||""),
        timingMode:"daily",endDate:date,
        reminderTime:String(f["reminder-time"]||""),recurrence:normalizeRecurrence(f.recurrence,date),
        pauseOnVacations:yes(f["pause-on-vacations"])});
    }
  }
  return out;
}
function vacationsForDate(wiki,iso){
  var out=[];wiki.each(function(t,title){
    if(!isVacation(t)){return;}
    var f=t.fields;
    vacationOccurrences(t).forEach(function(occ,index){
      if(inRange(iso,occ.start,occ.end)){
        out.push({title:title,refTitle:title,tiddler:t,start:occ.start,end:occ.end,occurrenceIndex:index,occurrenceName:String(occ.name||""),color:String(f.color||f.couleur||""),label:String(f.label||title)});
      }
    });
  });return out;
}
function isVacationDate(wiki,iso){return vacationsForDate(wiki,iso).length>0;}
function overridesOf(f){return parseJson(f["recurrence-overrides"]||f.overrides,"{}")||{};}
function commonItem(title,t,date){
  var f=t.fields;
  return {
    refTitle:title,title:String(f.label||f.titre||title),tiddler:t,date:date,
    marker:String(val(f,"marker","importance","")),
    status:String(val(f,"status","statut","normal")),
    projects:parseList(f.projects),people:parseList(f.people||f.relations),places:parseList(f.places||f.lieux),
    activities:parseList(f.activities||f.activites),events:parseList(f.events),todos:parseList(f.todos),
    habits:parseList(f.habits||f.habitudes),media:parseList(f.media),sleep:parseList(f.sleep),
    channels:parseList(f.channels||f.canaux),dreams:parseList(f.dreams||f.reves),
    note:String(f.text||f.note||""),
    images:parseJson(f.images,[])||[],audios:parseJson(f.audios||f.audio,[])||[],links:parseJson(f.links,[])||[],
    checklist:parseJson(f.checklist,[])||[],progress:parseJson(f.progress||f.journal,[])||[],
    occurrenceGroup:String(f["occurrence-group"]||""),color:String(f.color||f.couleur||"")
  };
}
function eventOccurrence(wiki,cfg,title,t,date,orig,override){
  var f=t.fields,o=override||{},base=String(val(f,"date",null,date)),baseEnd=String(val(f,"date-end","dateFin",base)),span=Math.max(0,daysBetween(base,baseEnd)),item=commonItem(title,t,o.date||o.nouvelleDate||date);
  item.kind="event";item.originalDate=orig||date;item.endDate=span?addSpan(item.date,span):item.date;
  item.startTime=String(o["start-time"]||o.nouvelleHeureDebut||val(f,"start-time","heureDebut",""));
  item.endTime=String(o["end-time"]||o.nouvelleHeureFin||val(f,"end-time","heureFin",""));
  item.status=String(o.status||o.statut||item.status||"normal");
  if(o.note!==undefined){item.note=String(o.note||"");}
  if(o.marker!==undefined){item.marker=String(o.marker||"");}
  if(o.checklist!==undefined){item.checklist=Array.isArray(o.checklist)?o.checklist:(parseJson(o.checklist,[])||[]);}
  item.role=String(val(f,"agenda-role",null,"event"));
  item.typeId=String(val(f,"event-type","typeId",""));
  item.type=eventType(cfg,item.typeId);item.recurring=!!f.recurrence;item.override=!!override;
  item.pauseOnVacations=yes(val(f,"pause-on-vacations","pauseSurVacances",""));
  item.countdown=yes(val(f,"countdown","compteRebours",""));
  return item;
}
function birthdayDateFromFields(f,cfg){
  var bc=(cfg&&cfg.birthdays)||DEFAULT_CONFIG.birthdays,keys=[bc.field,"date_naissance","birth-date","date-naissance","birthdate","birthday"],seen=Object.create(null);
  for(var i=0;i<keys.length;i++){
    var k=String(keys[i]||"").trim();if(!k||seen[k]){continue;}seen[k]=true;
    var raw=String(f[k]||"").trim(),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m){return m[1]+"-"+m[2]+"-"+m[3];}
  }
  return "";
}
function birthdayEventsForRange(wiki,a,b){
  var cfg=readConfig(wiki),bc=cfg.birthdays||{},relCfg=EntityConfig.readRelations(wiki);if(bc.enabled===false){return [];}
  var out=[],ya=parseIso(a).getFullYear(),yb=parseIso(b).getFullYear();
  wiki.each(function(t,title){
    if(!t||!t.fields){return;}var f=t.fields,tags=tagsOf(t),isPerson=String(f.kind||"")==="person"||tags.indexOf("Relations")!==-1;if(!isPerson){return;}
    var born=birthdayDateFromFields(f,cfg);if(!born){return;}var by=parseIso(born).getFullYear();
    for(var y=ya;y<=yb;y++){
      if(y<by){continue;}var date=addYears(born,y-by);if(!inRange(date,a,b)){continue;}
      var label=String(f.label||f.name||title),age=y-by,item={
        refTitle:title,title:label+(age>0?" — "+age+" ans":""),tiddler:t,date:date,endDate:date,originalDate:date,
        kind:"event",role:"birthday",virtual:true,birthday:true,recurring:true,override:false,status:"normal",
        marker:String(f.marker||""),typeId:String(bc.typeId||"anniversaire"),type:eventType(cfg,String(bc.typeId||"anniversaire")),
        relationTypeId:String(f["relation-type"]||f.relationType||""),
        relationTypeColor:(function(){
          var id=String(f["relation-type"]||f.relationType||""),meta=EntityConfig.relationType(relCfg,id);
          return String((meta&&meta.color)||f["relation-type-color"]||f.relationTypeColor||f["relation-color"]||"");
        })(),
        projects:[],people:[title],places:[],activities:[],events:[],todos:[],habits:[],media:[],sleep:[],channels:[],dreams:[],
        note:"",images:parseJson(f.images,[])||[],audios:[],links:[],checklist:[],progress:[],occurrenceGroup:"",color:String(f.color||"")
      };
      out.push(item);
    }
  });
  return out.sort(function(x,y){return cmp(x.date,y.date)||x.title.localeCompare(y.title);});
}

function eventsForRange(wiki,a,b,opts){
  opts=opts||{};var cfg=readConfig(wiki),out=[];
  wiki.each(function(t,title){
    if(!isEvent(t)){return;}var f=t.fields,role=String(val(f,"agenda-role",null,"event"));

    /* Les créneaux / emplois du temps possèdent leur propre liste de vagues.
       Chaque vague peut elle-même être ponctuelle ou récurrente, mais toutes
       partagent la même fiche, ses liens, son type, ses médias et son fond. */
    if(role==="slot"){
      slotOccurrences(t).forEach(function(occ,occIndex){
        var base=String(occ.date||"");if(!base){return;}
        var mode=String(occ.timingMode||"daily"),
            continuous=mode==="continuous",
            storedEnd=continuous?String(occ.endDate||base):base,
            span=continuous?Math.max(0,daysBetween(base,storedEnd)):0,
            scanA=span?addDays(a,-span):a,
            rec=normalizeRecurrence(occ.recurrence,base),
            dates=rec?recurrenceDates(rec,scanA,b,base):[base];

        dates.forEach(function(d){
          var occurrenceEnd=continuous?addDays(d,span):d;
          if(cmp(occurrenceEnd,a)<0||cmp(d,b)>0){return;}

          /* Mode historique : une ligne par jour avec les mêmes horaires. */
          if(!continuous){
            if(!inRange(d,a,b)){return;}
            var dailyItem=eventOccurrence(wiki,cfg,title,t,d,d,null);
            dailyItem.role="slot";dailyItem.date=d;dailyItem.endDate=d;dailyItem.originalDate=d;
            dailyItem.startTime=String(occ.startTime||"");dailyItem.endTime=String(occ.endTime||"");
            dailyItem.reminderTime=String(occ.reminderTime||"");dailyItem.pauseOnVacations=!!occ.pauseOnVacations;
            dailyItem.recurring=!!rec;dailyItem.slotOccurrenceIndex=occIndex;dailyItem.occurrenceName=String(occ.name||"");
            dailyItem.slotTimingMode="daily";
            if(dailyItem.pauseOnVacations&&isVacationDate(wiki,dailyItem.date)){return;}
            out.push(dailyItem);
            return;
          }

          /* Mode continu : une occurrence peut commencer lundi à 09:00 et
             finir mercredi à 17:00. On la découpe seulement pour l’affichage
             journalier afin que le moteur de conteneurs reste exactement le
             même : premier jour 09:00→23:59, jours centraux 00:00→23:59,
             dernier jour 00:00→17:00. */
          var first=inRange(d,a,b)?d:a,
              last=inRange(occurrenceEnd,a,b)?occurrenceEnd:b,
              seg=first;
          while(cmp(seg,last)<=0){
            var item=eventOccurrence(wiki,cfg,title,t,seg,d,null);
            item.role="slot";item.date=seg;item.endDate=seg;item.originalDate=d;
            item.startTime=seg===d?String(occ.startTime||"00:00"):"00:00";
            item.endTime=seg===occurrenceEnd?String(occ.endTime||"23:59"):"23:59";
            item.reminderTime=seg===d?String(occ.reminderTime||""):"";
            item.pauseOnVacations=!!occ.pauseOnVacations;item.recurring=!!rec;
            item.slotOccurrenceIndex=occIndex;item.occurrenceName=String(occ.name||"");
            item.slotTimingMode="continuous";item.slotSpanStart=d;item.slotSpanEnd=occurrenceEnd;
            item.slotSegmentStart=seg===d;item.slotSegmentEnd=seg===occurrenceEnd;
            if(!(item.pauseOnVacations&&isVacationDate(wiki,item.date))){out.push(item);}
            seg=addDays(seg,1);
          }
        });
      });
      return;
    }

    var base=String(f.date||"");if(!base){return;}
    var baseEnd=String(val(f,"date-end","dateFin",base)),span=Math.max(0,daysBetween(base,baseEnd)),rec=normalizeRecurrence(f.recurrence,base),scanA=span?addDays(a,-span):a,dates=rec?recurrenceDates(rec,scanA,b,base):[base],ovs=overridesOf(f),seenOrig=Object.create(null);
    dates.forEach(function(d){
      seenOrig[d]=true;
      var ov=ovs[d]||null,item=eventOccurrence(wiki,cfg,title,t,d,d,ov);
      if(item.status==="supprime"||item.status==="deleted"){return;}
      if(item.pauseOnVacations&&isVacationDate(wiki,item.date)){return;}
      if(cmp(item.endDate,a)<0||cmp(item.date,b)>0){return;}
      out.push(item);
    });
    /* Une exception peut déplacer une occurrence DANS la plage alors que sa date originale est hors plage. */
    Object.keys(ovs).forEach(function(orig){
      if(seenOrig[orig]){return;}var ov=ovs[orig]||{},moved=String(ov.date||ov.nouvelleDate||"");
      if(!moved||!inRange(moved,a,b)){return;}var item=eventOccurrence(wiki,cfg,title,t,orig,orig,ov);
      if(item.status!=="supprime"&&item.status!=="deleted"&&!(item.pauseOnVacations&&isVacationDate(wiki,item.date))){out.push(item);}
    });
  });
  if(opts.includeBirthdays!==false){out=out.concat(birthdayEventsForRange(wiki,a,b));}
  out.sort(function(x,y){return cmp(x.date,y.date)||(x.startTime||"").localeCompare(y.startTime||"")||x.title.localeCompare(y.title);});
  return out;
}

function todoOccurrence(title,t,date){
  var f=t.fields,item=commonItem(title,t,date),comp=parseList(f.completions),rec=!!f.recurrence;
  item.kind="todo";item.startDate=String(val(f,"start-date","dateDebut",""));item.deadline=String(f.deadline||"");
  item.startTime=String(val(f,"start-time","rappel",""));item.reminderTime=String(val(f,"reminder-time","rappel",item.startTime));
  item.durationMinutes=Math.max(0,parseInt(val(f,"duration-minutes","dureeEstimee","0"),10)||0);
  item.showOnCalendar=yes(val(f,"show-on-calendar","afficherSurCalendrier","yes"));item.recurring=rec;
  item.parentTodo=String(val(f,"parent-todo","parentId",""));item.completions=comp;
  item.done=rec?comp.indexOf(date)!==-1:(item.status==="fait"||item.status==="done"||comp.indexOf(date)!==-1);
  return item;
}
function todosForRange(wiki,a,b,opts){
  opts=opts||{};var out=[];
  wiki.each(function(t,title){
    if(!isTodo(t)){return;}var f=t.fields,rec=normalizeRecurrence(f.recurrence,String(val(f,"start-date","dateDebut",f.deadline||""))),dates=[];
    if(rec&&rec.start){dates=recurrenceDates(rec,a,b,rec.start);}else{
      var d=String(f.deadline||val(f,"start-date","dateDebut",""));if(d&&inRange(d,a,b)){dates=[d];}
    }
    dates.forEach(function(d){var item=todoOccurrence(title,t,d);if(opts.calendarOnly&& !item.showOnCalendar){return;}out.push(item);});
  });
  out.sort(function(x,y){return cmp(x.date,y.date)||(x.startTime||"").localeCompare(y.startTime||"")||x.title.localeCompare(y.title);});return out;
}

/* ------------------------------------------------------------------ */
/* Habitudes : moteur de rythme dédié                                 */
/* ------------------------------------------------------------------ */
function monthIndex(iso){var d=parseIso(iso);return d.getFullYear()*12+d.getMonth();}
function monthDay(iso){return parseIso(iso).getDate();}
function lastDayOfMonth(iso){var d=parseIso(startOfMonth(iso));d.setMonth(d.getMonth()+1);d.setDate(0);return d.getDate();}
function normalizeHabitSchedule(raw,legacyRecurrence,baseDate,startTime){
  var s=typeof raw==="string"?parseJson(raw,null):raw,base=String(baseDate||todayIso());
  if(s&&typeof s==="object"){
    var mode=String(s.mode||s.pattern||"daily"),target=Math.max(1,parseInt(s.target||s.times||s.countPerPeriod||1,10)||1);
    return {version:1,mode:mode,start:String(s.start||base),end:String(s.end||""),interval:Math.max(1,parseInt(s.interval||1,10)||1),
      target:target,weekdays:Array.isArray(s.weekdays)?s.weekdays.map(Number):[],dayOfMonth:Math.max(1,Math.min(31,parseInt(s.dayOfMonth||s.monthday||monthDay(base),10)||monthDay(base))),
      time:String(s.time||startTime||""),maxOccurrences:s.maxOccurrences==null||s.maxOccurrences===""?null:Math.max(1,parseInt(s.maxOccurrences,10)||1)};
  }
  var r=normalizeRecurrence(legacyRecurrence,base),out={version:1,mode:"daily",start:base,end:"",interval:1,target:1,weekdays:[],dayOfMonth:monthDay(base),time:String(startTime||""),maxOccurrences:null};
  if(!r){return out;}
  out.start=String(r.start||base);out.end=String(r.end||"");out.interval=Math.max(1,+r.interval||1);out.maxOccurrences=r.count==null||r.count===""?null:Math.max(1,+r.count||1);
  if(r.frequency==="week"||r.frequency==="semaine"){
    var days=(r.weekdays||[]).map(Number);
    if(days.length===7){out.mode="daily";}else{out.mode="weekdays";out.weekdays=days.length?days:[dowMonday(out.start)];}
  }else if(r.frequency==="day"||r.frequency==="jour"){out.mode="daily";}
  else if(r.frequency==="month"||r.frequency==="mois"){out.mode="monthly";out.dayOfMonth=monthDay(out.start);}
  else{out.mode="daily";}
  return out;
}
function habitSchedule(tOrFields){
  var f=tOrFields&&tOrFields.fields?tOrFields.fields:(tOrFields||{}),base=String(val(f,"start-date","dateDebut",f.date||todayIso()));
  return normalizeHabitSchedule(f["habit-schedule"],f.recurrence,base,String(val(f,"start-time","rappel","")));
}
function habitBaseTargetOnDate(s,date){
  if(!s||!date||cmp(date,s.start)<0||(s.end&&cmp(date,s.end)>0)){return 0;}
  var target=Math.max(1,+s.target||1),interval=Math.max(1,+s.interval||1),mode=s.mode||"daily";
  if(mode==="daily"){
    var dd=daysBetween(s.start,date);return dd>=0&&dd%interval===0?target:0;
  }
  if(mode==="weekdays"){
    var sw=startOfWeek(s.start,0),dw=startOfWeek(date,0),weeks=Math.floor(daysBetween(sw,dw)/7),wd=dowMonday(date);
    return weeks>=0&&weeks%interval===0&&(s.weekdays||[]).map(Number).indexOf(wd)!==-1?target:0;
  }
  if(mode==="quota-week"){
    var sw2=startOfWeek(s.start,0),dw2=startOfWeek(date,0),w=Math.floor(daysBetween(sw2,dw2)/7);
    return w>=0&&w%interval===0?target:0;
  }
  if(mode==="quota-month"){
    var md=monthIndex(date)-monthIndex(s.start);return md>=0&&md%interval===0?target:0;
  }
  if(mode==="monthly"){
    var m=monthIndex(date)-monthIndex(s.start),wanted=Math.min(Math.max(1,+s.dayOfMonth||1),lastDayOfMonth(date));
    return m>=0&&m%interval===0&&monthDay(date)===wanted?target:0;
  }
  return 0;
}
function habitPeriod(s,date){
  if((s.mode||"")==="quota-week"){return {start:startOfWeek(date,0),end:endOfWeek(date,0),label:"cette semaine"};}
  if((s.mode||"")==="quota-month"){return {start:startOfMonth(date),end:endOfMonth(date),label:"ce mois"};}
  return {start:date,end:date,label:"aujourd’hui"};
}
function habitScheduledBefore(s,date){
  var target=Math.max(1,+s.target||1),mode=s.mode||"daily",count=0;
  if(cmp(date,s.start)<=0){return 0;}
  if(mode==="quota-week"){
    var a=startOfWeek(s.start,0),b=startOfWeek(date,0),weeks=Math.max(0,Math.floor(daysBetween(a,b)/7));
    for(var w=0;w<weeks;w++){if(w%Math.max(1,+s.interval||1)===0){count+=target;}}return count;
  }
  if(mode==="quota-month"){
    var months=Math.max(0,monthIndex(date)-monthIndex(s.start));for(var m=0;m<months;m++){if(m%Math.max(1,+s.interval||1)===0){count+=target;}}return count;
  }
  var d=s.start,guard=0;while(cmp(d,date)<0&&guard++<20000){count+=habitBaseTargetOnDate(s,d);d=addDays(d,1);}return count;
}
function habitPlannedTarget(s,date){
  var base=habitBaseTargetOnDate(s,date);if(!base){return 0;}
  if(s.maxOccurrences==null){return base;}
  var left=Math.max(0,+s.maxOccurrences-habitScheduledBefore(s,date));return Math.min(base,left);
}
function habitCompletionLog(t,schedule){
  var f=t&&t.fields?t.fields:(t||{}),raw=parseJson(f["habit-completion-log"],null),out=[];
  if(Array.isArray(raw)){
    raw.forEach(function(x){
      if(!x||!x.date){return;}
      var status=String(x.status||"done").toLowerCase();
      if(status==="late"||status==="done-late"||status==="fait_en_retard"){status="done_late";}
      if(status!=="done_late"){status="done";}
      var completedAt=String(x.completedAt||x["completed-at"]||""),performedDate=String(x.performedDate||x["performed-date"]||"");
      if(!performedDate){
        if(status==="done"){performedDate=String(x.date);}
        else if(completedAt){var cm=/^(\d{4})-(\d{2})-(\d{2})/.exec(completedAt);if(cm){performedDate=cm[1]+"-"+cm[2]+"-"+cm[3];}}
      }
      out.push({
        id:String(x.id||("manual:"+x.date+":"+out.length)),
        date:String(x.date),
        source:String(x.source||"manual"),
        status:status,
        completedAt:completedAt,
        performedDate:performedDate
      });
    });
    return out;
  }
  /* Les anciennes validations ne contenaient pas l'instant de validation :
     on les conserve comme faites à l'heure, sans inventer un retard historique. */
  parseList(f.completions).forEach(function(d){out.push({id:"legacy:"+d,date:d,source:"legacy",status:"done",completedAt:"",performedDate:d});});return out;
}
function newHabitCompletionRecord(id,date,source,status){
  status=String(status||"done").toLowerCase();if(status!=="done_late"){status="done";}
  return {
    id:String(id),date:String(date),source:String(source||"manual"),status:status,
    completedAt:(new Date()).toISOString(),performedDate:status==="done_late"?todayIso():String(date)
  };
}
function habitStatusLog(t){
  var f=t&&t.fields?t.fields:(t||{}),raw=parseJson(f["habit-status-log"],null),out=[];
  if(!Array.isArray(raw)){return out;}
  raw.forEach(function(x){
    if(!x||!x.date){return;}
    var status=String(x.status||"").toLowerCase();
    if(status==="echec"||status==="échoué"||status==="echoue"){status="failed";}
    if(status==="annule"||status==="annulé"||status==="canceled"){status="cancelled";}
    if(status!=="failed"&&status!=="cancelled"){return;}
    out.push({id:String(x.id||("status:"+x.date+":"+out.length)),date:String(x.date),status:status,source:String(x.source||"manual")});
  });
  return out;
}
function habitCompletionsInPeriod(log,period){return (log||[]).filter(function(x){return x&&x.date&&inRange(x.date,period.start,period.end);});}
function habitStatusesInPeriod(log,period){return (log||[]).filter(function(x){return x&&x.date&&inRange(x.date,period.start,period.end);});}
function habitPeriodClosed(schedule,date,period){
  /* Un quota reste ouvert jusqu'à la fin de sa semaine / de son mois.
     Les rythmes attachés à un jour précis ferment, eux, à minuit. */
  var end=(schedule&&((schedule.mode||"")==="quota-week"||(schedule.mode||"")==="quota-month"))?period.end:date;
  return cmp(end,todayIso())<0;
}
function habitDueInfo(tOrFields,date){
  var t=tOrFields&&tOrFields.fields?tOrFields:{fields:tOrFields||{}},
      s=habitSchedule(t),target=habitPlannedTarget(s,date),period=habitPeriod(s,date),
      clog=habitCompletionLog(t,s),hits=habitCompletionsInPeriod(clog,period),completed=Math.min(target,hits.length),
      completedLate=Math.min(completed,hits.filter(function(x){return x.status==="done_late";}).length),completedOnTime=Math.max(0,completed-completedLate),
      slog=habitStatusLog(t),statusHits=habitStatusesInPeriod(slog,period),available=Math.max(0,target-completed),
      considered=statusHits.slice(0,available),explicitFailed=considered.filter(function(x){return x.status==="failed";}).length,
      cancelled=considered.filter(function(x){return x.status==="cancelled";}).length,closed=target>0&&habitPeriodClosed(s,date,period),
      unresolved=Math.max(0,target-completed-explicitFailed-cancelled),autoFailed=closed?unresolved:0,
      failed=explicitFailed+autoFailed,remaining=closed?0:unresolved,done=target>0&&completed>=target,state="pending";
  if(done){state="done";}
  else if(remaining>0){state="pending";}
  else if(failed>0){state="failed";}
  else if(cancelled>0){state="cancelled";}
  return {
    due:target>0,target:target,completed:completed,completedOnTime:completedOnTime,completedLate:completedLate,failed:failed,explicitFailed:explicitFailed,autoFailed:autoFailed,cancelled:cancelled,
    resolved:Math.min(target,completed+failed+cancelled),remaining:remaining,done:done,state:state,closed:closed,
    schedule:s,period:period,time:String(s.time||t.fields["start-time"]||""),records:hits,statusRecords:considered
  };
}
function habitScheduleLabel(tOrFields){
  var s=habitSchedule(tOrFields),n=Math.max(1,+s.target||1),i=Math.max(1,+s.interval||1),txt="";
  if(s.mode==="daily"){txt=n>1?n+"× par jour":(i>1?"Tous les "+i+" jours":"Tous les jours");}
  else if(s.mode==="weekdays"){var ds=["L","M","M","J","V","S","D"];txt=(s.weekdays||[]).map(function(x){return ds[+x]||"";}).join(" · ")||"Jours fixes";if(i>1){txt+=" · toutes les "+i+" sem.";}}
  else if(s.mode==="quota-week"){txt=n+"× / semaine"+(i>1?" · toutes les "+i+" sem.":"");}
  else if(s.mode==="quota-month"){txt=n+"× / mois"+(i>1?" · tous les "+i+" mois":"");}
  else if(s.mode==="monthly"){txt="Le "+s.dayOfMonth+(i>1?" · tous les "+i+" mois":" de chaque mois");}
  else{txt="Récurrent";}
  if(s.time){txt+=" · "+s.time;}if(s.end){txt+=" · jusqu’au "+s.end;}if(s.maxOccurrences!=null){txt+=" · max "+s.maxOccurrences;}return txt;
}
function habitCompletionFields(log){
  var dates=[];(log||[]).forEach(function(x){if(x&&x.date&&dates.indexOf(x.date)===-1){dates.push(x.date);}});dates.sort();
  return {"habit-completion-log":JSON.stringify(log||[]),completions:stringifyList(dates)};
}
function writeHabitTracking(wiki,t,completionLog,statusLog){
  var fields=habitCompletionFields(completionLog);
  if(statusLog!==undefined){fields["habit-status-log"]=(statusLog&&statusLog.length)?JSON.stringify(statusLog):"";}
  wiki.addTiddler(new $tw.Tiddler(t,fields,{modified:new Date()}));
}
function writeHabitCompletionLog(wiki,t,log){writeHabitTracking(wiki,t,log,undefined);}
function writeHabitStatusLog(wiki,t,log){
  wiki.addTiddler(new $tw.Tiddler(t,{"habit-status-log":log&&log.length?JSON.stringify(log):""},{modified:new Date()}));
}
function setHabitDailyCompletion(wiki,title,date,dailyTitle,linked){
  var t=wiki.getTiddler(title);if(!isHabit(t)){return false;}var s=habitSchedule(t),log=habitCompletionLog(t,s),id="daily:"+String(dailyTitle||""),wantedDate=String(date||todayIso()),existing=null;
  log.some(function(x){if(x.id===id){existing=x;return true;}return false;});
  if(linked&&existing&&existing.date===wantedDate){return true;}
  if(!linked&&!existing){return true;}
  log=log.filter(function(x){return x.id!==id;});if(linked){log.push(newHabitCompletionRecord(id,wantedDate,"daily","done"));}
  writeHabitCompletionLog(wiki,t,log);return true;
}
function syncDailyHabitCompletions(wiki,dailyTitle,date,before,after){
  before=parseList(before);after=parseList(after);var all=before.concat(after).filter(function(x,i,a){return x&&a.indexOf(x)===i;});
  all.forEach(function(title){setHabitDailyCompletion(wiki,title,date,dailyTitle,after.indexOf(title)!==-1);});return true;
}
function habitOccurrence(title,t,date){
  var f=t.fields,item=commonItem(title,t,date),info=habitDueInfo(t,date);
  item.kind="habit";item.startDate=String(val(f,"start-date","dateDebut",f.date||""));item.startTime=String(info.time||"");item.reminderTime=String(val(f,"reminder-time","rappel",item.startTime));
  item.durationMinutes=Math.max(0,parseInt(val(f,"duration-minutes","dureeEstimee","0"),10)||0);item.showOnCalendar=false;item.recurring=true;
  var anyCompletion=habitCompletionLog(t,info.schedule).some(function(x){return x.date===date;});
  item.completions=parseList(f.completions);
  /* Pour une habitude multi-occurrences, une seule validation ne suffit pas à
     déclarer toute la journée « faite ». Hors jour planifié, une validation
     liée à une Daily reste néanmoins une réalisation réelle. */
  item.done=info.target>0?info.done:anyCompletion;item.habitTarget=info.target;item.habitCompleted=info.completed;item.habitFailed=info.failed;item.habitCancelled=info.cancelled;item.habitAutoFailed=info.autoFailed;item.habitResolved=info.resolved;item.habitRemaining=info.remaining;item.habitState=info.state;item.habitSchedule=info.schedule;item.habitPeriod=info.period;
  item.typeId=String(val(f,"event-type","typeId",""));item.type=null;return item;
}
function habitsForRange(wiki,a,b,opts){
  opts=opts||{};if(opts.calendarOnly){return [];}var out=[],cfg=readConfig(wiki),cursor=a,guard=0;
  while(cmp(cursor,b)<=0&&guard++<20000){
    wiki.each(function(t,title){if(!isHabit(t)){return;}var info=habitDueInfo(t,cursor);if(!info.due){return;}var item=habitOccurrence(title,t,cursor);item.type=eventType(cfg,item.typeId);out.push(item);});
    cursor=addDays(cursor,1);
  }
  out.sort(function(x,y){return cmp(x.date,y.date)||(x.startTime||"").localeCompare(y.startTime||"")||x.title.localeCompare(y.title);});return out;
}

function dailyEntriesForDate(wiki,iso){var out=[];wiki.each(function(t,title){if(isDaily(t)&&String(t.fields.date||"")===iso){out.push({title:title,tiddler:t});}});return out;}
function linkedDailiesForItem(wiki,itemTitle,kind,iso){
  var field=kind==="todo"?"todos":(kind==="habit"?"habits":"events"),out=[];wiki.each(function(t,title){if(!isDaily(t)){return;}if(iso&&String(t.fields.date||"")!==iso){return;}if(parseList(t.fields[field]).indexOf(itemTitle)!==-1){out.push({title:title,tiddler:t});}});return out;
}
function itemFromTitleOnDate(wiki,title,iso){
  var t=wiki.getTiddler(title);if(!t){return null;}var cfg=readConfig(wiki);
  if(isEvent(t)){return eventOccurrence(wiki,cfg,title,t,iso,iso,null);}
  if(isTodo(t)){return todoOccurrence(title,t,iso);}
  if(isHabit(t)){var h=habitOccurrence(title,t,iso);h.type=eventType(cfg,h.typeId);return h;}
  return null;
}
function itemsForDay(wiki,iso,opts){
  opts=opts||{};var events=eventsForRange(wiki,iso,iso),todos=todosForRange(wiki,iso,iso,{calendarOnly:opts.calendarOnly!==false}),habits=habitsForRange(wiki,iso,iso,{calendarOnly:opts.calendarOnly!==false}),out=[],seen=Object.create(null);
  function add(item){var key=item.kind+"::"+item.title+"::"+(item.originalDate||item.date);if(seen[key]){if(item.linked){seen[key].linked=true;}return;}seen[key]=item;out.push(item);}
  events.forEach(function(x){x.linked=linkedDailiesForItem(wiki,x.refTitle||x.title,"event",iso).length>0;add(x);});
  todos.forEach(function(x){x.linked=linkedDailiesForItem(wiki,x.refTitle||x.title,"todo",iso).length>0;add(x);});
  habits.forEach(function(x){x.linked=linkedDailiesForItem(wiki,x.refTitle||x.title,"habit",iso).length>0;add(x);});
  if(opts.includeLinked!==false){
    dailyEntriesForDate(wiki,iso).forEach(function(rec){
      [["events","event"],["todos","todo"],["habits","habit"]].forEach(function(pair){
        /* Les habitudes vivent dans leur widget de sidebar et, si elles sont
           liées, sous la Daily du Journal. Elles ne reviennent jamais dans
           une vue calendrier Agenda, même par la porte des liens Daily. */
        if(pair[1]==="habit"&&opts.calendarOnly!==false){return;}
        parseList(rec.tiddler.fields[pair[0]]).forEach(function(title){var item=itemFromTitleOnDate(wiki,title,iso);if(item){item.linked=true;item.linkedOnly=true;add(item);}});
      });
    });
  }
  out.sort(function(a,b){
    var at=a.startTime||a.reminderTime||"24:00",bt=b.startTime||b.reminderTime||"24:00";
    return bt.localeCompare(at)||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title);
  });return out;
}
function getOccurrenceOverride(wiki,title,originalDate){
  var t=wiki.getTiddler(title);if(!t||!isEvent(t)){return null;}var ovs=overridesOf(t.fields);return ovs[String(originalDate||"")]||null;
}
function setOccurrenceOverride(wiki,title,originalDate,patch){
  var t=wiki.getTiddler(title);if(!t||!isEvent(t)||!originalDate){return false;}var ovs=overridesOf(t.fields),key=String(originalDate),old=ovs[key]||{},next=Object.assign({},old,patch||{});
  Object.keys(next).forEach(function(k){if(next[k]===undefined||next[k]===null){delete next[k];}});ovs[key]=next;
  wiki.addTiddler(new $tw.Tiddler(t,{"recurrence-overrides":JSON.stringify(ovs)},{modified:new Date()}));return true;
}
function clearOccurrenceOverride(wiki,title,originalDate){
  var t=wiki.getTiddler(title);if(!t||!isEvent(t)||!originalDate){return false;}var ovs=overridesOf(t.fields),key=String(originalDate);if(!Object.prototype.hasOwnProperty.call(ovs,key)){return false;}delete ovs[key];
  wiki.addTiddler(new $tw.Tiddler(t,{"recurrence-overrides":Object.keys(ovs).length?JSON.stringify(ovs):""},{modified:new Date()}));return true;
}

function toggleTodoOnDate(wiki,title,iso){
  var t=wiki.getTiddler(title);if(!isTodo(t)){return false;}var f=t.fields,list=parseList(f.completions),i=list.indexOf(iso);
  if(i===-1){list.push(iso);}else{list.splice(i,1);}list.sort();var now=new Date(),fields={completions:stringifyList(list)};
  if(!f.recurrence){fields.status=i===-1?"fait":"a_faire";}
  wiki.addTiddler(new $tw.Tiddler(t,fields,{modified:now}));return true;
}
function setHabitCompletionOnDate(wiki,title,iso,status){
  var t=wiki.getTiddler(title);if(!isHabit(t)){return false;}
  status=String(status||"done").toLowerCase();if(status!=="done_late"){status="done";}
  var s=habitSchedule(t),info=habitDueInfo(t,iso);if(!info.due){return false;}
  var log=habitCompletionLog(t,s),statusLog=habitStatusLog(t),period=info.period,
      hits=habitCompletionsInPeriod(log,period),manual=hits.filter(function(x){return x.source==="manual";}),
      statuses=habitStatusesInPeriod(statusLog,period);
  if(hits.length<info.target){
    /* Une vraie réalisation remplace une décision explicite qui occupait déjà
       la dernière place du quota. L'échec automatique, lui, est dérivé et
       disparaît tout seul dès qu'une réalisation existe. */
    if(hits.length+statuses.length>=info.target&&statuses.length){
      var statusId=statuses[statuses.length-1].id;
      statusLog=statusLog.filter(function(x){return x.id!==statusId;});
    }
    log.push(newHabitCompletionRecord("manual:"+Date.now()+":"+Math.random().toString(36).slice(2,7),iso,"manual",status));
  }else if(manual.length){
    /* Si l'occurrence est déjà faite, le menu permet de corriger a posteriori
       « fait » <-> « fait en retard » sans créer une seconde réalisation. */
    var rec=manual[manual.length-1],nowIso=(new Date()).toISOString();
    log=log.map(function(x){
      if(x.id!==rec.id){return x;}
      return {id:x.id,date:String(iso),source:"manual",status:status,completedAt:nowIso,performedDate:status==="done_late"?todayIso():String(iso)};
    });
  }else{return false;}
  writeHabitTracking(wiki,t,log,statusLog);return true;
}
function toggleHabitOnDate(wiki,title,iso){
  var t=wiki.getTiddler(title);if(!isHabit(t)){return false;}var s=habitSchedule(t),info=habitDueInfo(t,iso);if(!info.due){return false;}
  var log=habitCompletionLog(t,s),period=info.period,hits=habitCompletionsInPeriod(log,period),manual=hits.filter(function(x){return x.source==="manual";});
  if(hits.length<info.target){return setHabitCompletionOnDate(wiki,title,iso,"done");}
  if(manual.length){var removeId=manual[manual.length-1].id;log=log.filter(function(x){return x.id!==removeId;});writeHabitCompletionLog(wiki,t,log);return true;}
  return false;
}
function setHabitStatusOnDate(wiki,title,iso,status){
  var t=wiki.getTiddler(title);if(!isHabit(t)){return false;}
  status=String(status||"").toLowerCase();if(status!=="failed"&&status!=="cancelled"){return false;}
  var info=habitDueInfo(t,iso);if(!info.due||info.done){return false;}
  var log=habitStatusLog(t),period=info.period,statuses=habitStatusesInPeriod(log,period),
      completions=habitCompletionsInPeriod(habitCompletionLog(t,info.schedule),period),occupied=completions.length+statuses.length;
  if(occupied<info.target){
    log.push({id:"status:"+Date.now()+":"+Math.random().toString(36).slice(2,7),date:iso,status:status,source:"manual"});
  }else if(statuses.length){
    /* Quand la période est déjà résolue par un échec/une annulation, choisir
       l'autre état remplace la dernière décision au lieu d'ajouter un doublon. */
    var last=statuses[statuses.length-1],id=last.id;
    log=log.map(function(x){return x.id===id?{id:x.id,date:iso,status:status,source:"manual"}:x;});
  }else{return false;}
  writeHabitStatusLog(wiki,t,log);return true;
}
function clearHabitStatusOnDate(wiki,title,iso){
  var t=wiki.getTiddler(title);if(!isHabit(t)){return false;}var info=habitDueInfo(t,iso);if(!info.due){return false;}
  var log=habitStatusLog(t),hits=habitStatusesInPeriod(log,info.period);if(!hits.length){return false;}
  var id=hits[hits.length-1].id;log=log.filter(function(x){return x.id!==id;});writeHabitStatusLog(wiki,t,log);return true;
}
function vacationsForRange(wiki,a,b){var out=[];wiki.each(function(t,title){if(!isVacation(t)){return;}var f=t.fields;vacationOccurrences(t).forEach(function(occ,index){if(cmp(occ.end,a)<0||cmp(occ.start,b)>0){return;}out.push({title:title,refTitle:title,tiddler:t,start:occ.start,end:occ.end,occurrenceIndex:index,occurrenceName:String(occ.name||""),color:String(f.color||f.couleur||""),label:String(f.label||title)});});});return out.sort(function(x,y){return cmp(x.start,y.start)||cmp(x.end,y.end)||String(x.title).localeCompare(String(y.title));});}
function agendaLinkField(kind){return kind==="todo"?"todos":(kind==="habit"?"habits":"events");}
function agendaLinksSnapshot(t){var f=t&&t.fields?t.fields:{};return {events:parseList(f.events),todos:parseList(f.todos),habits:parseList(f.habits)};}
function syncAgendaLinks(wiki,sourceTitle,sourceKind,before,after){
  before=before||{events:[],todos:[],habits:[]};after=after||{events:[],todos:[],habits:[]};var reciprocal=agendaLinkField(sourceKind),now=new Date();
  [["events",before.events||[],after.events||[]],["todos",before.todos||[],after.todos||[]],["habits",before.habits||[],after.habits||[]]].forEach(function(group){
    var old=group[1],next=group[2],all=old.concat(next).filter(function(x,i,a){return x&&a.indexOf(x)===i;});all.forEach(function(target){if(!target||target===sourceTitle){return;}var t=wiki.getTiddler(target);if(!t||!(isEvent(t)||isTodo(t)||isHabit(t))){return;}var vals=parseList(t.fields[reciprocal]),has=vals.indexOf(sourceTitle)!==-1,should=next.indexOf(target)!==-1;if(has===should){return;}if(should){vals.push(sourceTitle);}else{vals=vals.filter(function(x){return x!==sourceTitle;});}var patch={};patch[reciprocal]=stringifyList(vals);wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:now}));});
  });return true;
}
function cleanupAgendaReferences(wiki,title,kind){
  var dailyField=agendaLinkField(kind),now=new Date();wiki.each(function(t,tt){if(!t||!t.fields||tt===title){return;}var patch=null;
    if(isDaily(t)){var dv=parseList(t.fields[dailyField]);if(dv.indexOf(title)!==-1){patch=patch||{};patch[dailyField]=stringifyList(dv.filter(function(x){return x!==title;}));}}
    if(isEvent(t)||isTodo(t)||isHabit(t)){["events","todos","habits"].forEach(function(field){var vals=parseList(t.fields[field]);if(vals.indexOf(title)!==-1){patch=patch||{};patch[field]=stringifyList(vals.filter(function(x){return x!==title;}));}});if(kind==="todo"&&String(val(t.fields,"parent-todo","parentId","")||"")===title){patch=patch||{};patch["parent-todo"]="";}}
    if(patch){wiki.addTiddler(new $tw.Tiddler(t,patch,{modified:now}));}
  });
}
function todoDescendantTitles(wiki,title,seen){seen=seen||Object.create(null);if(seen[title]){return [];}seen[title]=true;var out=[];todoChildrenTitles(wiki,title).forEach(function(c){out=out.concat(todoDescendantTitles(wiki,c,seen));out.push(c);});return out;}
function deleteAgendaObject(wiki,title,kind,opts){opts=opts||{};var t=wiki.getTiddler(title);if(!t){return false;}kind=kind||(isTodo(t)?"todo":(isHabit(t)?"habit":(isEvent(t)?"event":"")));var titles=(kind==="todo"&&opts.cascade!==false)?todoDescendantTitles(wiki,title).concat([title]):[title];titles.forEach(function(x){var tx=wiki.getTiddler(x),kx=tx?(isTodo(tx)?"todo":(isHabit(tx)?"habit":(isEvent(tx)?"event":kind))):kind;cleanupAgendaReferences(wiki,x,kx);wiki.deleteTiddler(x);});return true;}

function todoChildrenTitles(wiki,title){
  var out=[];wiki.each(function(t,tt){if(isTodo(t)&&String(val(t.fields,"parent-todo","parentId","")||"")===String(title||"")){out.push(tt);}});return out.sort();
}
function todoEffort(wiki,title,remaining,seen){
  seen=seen||Object.create(null);title=String(title||"");if(!title||seen[title]){return 0;}seen[title]=true;
  var t=wiki.getTiddler(title);if(!isTodo(t)){return 0;}var children=todoChildrenTitles(wiki,title);
  if(children.length){var sum=0;children.forEach(function(c){sum+=todoEffort(wiki,c,remaining,seen);});return sum;}
  var st=String(t.fields.status||t.fields.statut||"");if(remaining&&(st==="fait"||st==="done")){return 0;}
  return Math.max(0,parseInt(val(t.fields,"duration-minutes","dureeEstimee","0"),10)||0);
}
function todoEffortInfo(wiki,title){var total=todoEffort(wiki,title,false),remaining=todoEffort(wiki,title,true);return {total:total,remaining:remaining,done:Math.max(0,total-remaining)};}

function reminderItemsForMinute(wiki,iso,hhmm){
  var out=[];
  wiki.each(function(t,title){
    if(!t||!t.fields){return;}
    var kind=isTodo(t)?"todo":(isHabit(t)?"habit":""),f=t.fields;if(!kind){return;}
    var rem=String(val(f,"reminder-time","rappel","")||"");if(rem!==hhmm){return;}
    if(kind==="habit"){
      var info=habitDueInfo(t,iso);if(!info.due||info.remaining<=0){return;}
      out.push({kind:"habit",refTitle:title,title:String(f.label||f.titre||title),date:iso,time:hhmm,marker:String(f.marker||f.importance||""),projects:parseList(f.projects),habitTarget:info.target,habitCompleted:info.completed});
      return;
    }
    var base=String(val(f,"start-date","dateDebut",f.deadline||f.date||"")),rec=normalizeRecurrence(f.recurrence,base),occurs=false;
    if(rec&&rec.start){occurs=recurrenceDates(rec,iso,iso,rec.start).length>0;}else{var target=String(f.deadline||base||"");occurs=target===iso;}
    if(!occurs){return;}var completions=parseList(f.completions),done=rec?completions.indexOf(iso)!==-1:(String(f.status||f.statut||"")==="fait"||String(f.status||f.statut||"")==="done"||completions.indexOf(iso)!==-1);
    if(done){return;}out.push({kind:"todo",refTitle:title,title:String(f.label||f.titre||title),date:iso,time:hhmm,marker:String(f.marker||f.importance||""),projects:parseList(f.projects)});
  });
  return out.sort(function(a,b){return a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title);});
}



/* ------------------------------------------------------------------ */
/* Notes riches — source commune Agenda + Journal                      */
/* ------------------------------------------------------------------ */
var NOTE_TAGS="br|div|p|ul|ol|li|h[1-6]|b|i|u|s|em|strong|font|span|a|hr|blockquote|code|img|table";
var NOTE_HTML_TAG=new RegExp("<(?:(?:"+NOTE_TAGS+"))\\b[^>]*>","i");
var NOTE_ESCAPED_TAG=new RegExp("&lt;(/?)("+NOTE_TAGS+")(\\b[\\s\\S]*?)&gt;","gi");
function noteEscapeText(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function noteDecodeTextEntities(v){return String(v||"").replace(/&nbsp;/gi,"\u00a0").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,"&");}
function repairEscapedNoteMarkup(text){return String(text||"").replace(NOTE_ESCAPED_TAG,function(_,slash,tag,attrs){attrs=String(attrs||"").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,"&");return "<"+slash+tag+attrs+">";});}
function repairLegacyNoteTasks(text){
  text=String(text||"").replace(/<div class="ja-task" data-done="([01])">\s*(?:<span class="ja-task-box">\s*<\/span>)?\s*(?:<span class="ja-task-txt">)?([\s\S]*?)(?:<\/span>)?\s*<\/div>/g,function(_,done,inner){return '<ul class="ja-tasklist"><li data-done="'+done+'">'+String(inner||"").replace(/^(?:<br>|\u200b|\s)+|(?:<br>|\u200b|\s)+$/g,"")+"</li></ul>";});
  return text.replace(/<\/ul>\s*<ul class="ja-tasklist">/g,"");
}
function normalizeNoteHtml(raw,doc){
  var text=String(raw||"");if(!text.trim()){return "";}
  text=repairEscapedNoteMarkup(text);
  if(!NOTE_HTML_TAG.test(text)){
    text=noteDecodeTextEntities(text);
    return text.split(/\n{2,}/).map(function(block){return "<div>"+noteEscapeText(block).replace(/\n/g,"<br>")+"</div>";}).join("");
  }
  text=repairLegacyNoteTasks(text);
  if(doc){try{var box=doc.createElement("div");box.innerHTML=text;return box.innerHTML;}catch(e){}}
  return text;
}
function noteToPlainText(raw,doc){
  var html=normalizeNoteHtml(raw,doc);if(!html){return "";}
  if(doc){try{var box=doc.createElement("div");box.innerHTML=html;return String(box.textContent||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();}catch(e){}}
  var known=new RegExp("</?(?:"+NOTE_TAGS+")\\b[^>]*>","gi");
  return noteDecodeTextEntities(html.replace(known," ")).replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

function uniqueTitle(wiki,base){base=String(base||"").trim()||"Sans titre";if(!wiki.getTiddler(base)){return base;}var n=2;while(wiki.getTiddler(base+" ("+n+")")){n++;}return base+" ("+n+")";}

exports.CONFIG_TIDDLER=CONFIG_TIDDLER;
exports.DEFAULT_CONFIG=DEFAULT_CONFIG;
exports.readConfig=readConfig;exports.writeConfig=writeConfig;
exports.tagsOf=tagsOf;exports.parseList=parseList;exports.stringifyList=stringifyList;exports.parseJson=parseJson;
exports.isDaily=isDaily;exports.isEvent=isEvent;exports.isTodo=isTodo;exports.isVacation=isVacation;exports.isHabit=isHabit;
exports.todayIso=todayIso;exports.parseIso=parseIso;exports.addDays=addDays;exports.addMonths=addMonths;exports.addYears=addYears;exports.cmp=cmp;exports.inRange=inRange;
exports.startOfWeek=startOfWeek;exports.endOfWeek=endOfWeek;exports.startOfMonth=startOfMonth;exports.endOfMonth=endOfMonth;exports.minutesOf=minutesOf;exports.endMinutes=endMinutes;exports.inSlot=inSlot;exports.groupIntoSlots=groupIntoSlots;
exports.normalizeRecurrence=normalizeRecurrence;exports.recurrenceDates=recurrenceDates;
exports.markerMeta=markerMeta;exports.eventType=eventType;exports.vacationOccurrences=vacationOccurrences;exports.slotOccurrences=slotOccurrences;exports.vacationsForDate=vacationsForDate;exports.vacationsForRange=vacationsForRange;exports.isVacationDate=isVacationDate;exports.birthdayEventsForRange=birthdayEventsForRange;
exports.eventsForRange=eventsForRange;exports.todosForRange=todosForRange;exports.habitsForRange=habitsForRange;exports.itemsForDay=itemsForDay;exports.itemFromTitleOnDate=itemFromTitleOnDate;exports.dailyEntriesForDate=dailyEntriesForDate;exports.linkedDailiesForItem=linkedDailiesForItem;
exports.getOccurrenceOverride=getOccurrenceOverride;exports.setOccurrenceOverride=setOccurrenceOverride;exports.clearOccurrenceOverride=clearOccurrenceOverride;exports.toggleTodoOnDate=toggleTodoOnDate;exports.toggleHabitOnDate=toggleHabitOnDate;exports.setHabitCompletionOnDate=setHabitCompletionOnDate;exports.setHabitStatusOnDate=setHabitStatusOnDate;exports.clearHabitStatusOnDate=clearHabitStatusOnDate;exports.normalizeHabitSchedule=normalizeHabitSchedule;exports.habitSchedule=habitSchedule;exports.habitScheduleLabel=habitScheduleLabel;exports.habitDueInfo=habitDueInfo;exports.habitCompletionLog=habitCompletionLog;exports.habitStatusLog=habitStatusLog;exports.setHabitDailyCompletion=setHabitDailyCompletion;exports.syncDailyHabitCompletions=syncDailyHabitCompletions;exports.agendaLinkField=agendaLinkField;exports.agendaLinksSnapshot=agendaLinksSnapshot;exports.syncAgendaLinks=syncAgendaLinks;exports.cleanupAgendaReferences=cleanupAgendaReferences;exports.todoDescendantTitles=todoDescendantTitles;exports.deleteAgendaObject=deleteAgendaObject;exports.todoChildrenTitles=todoChildrenTitles;exports.todoEffort=todoEffort;exports.todoEffortInfo=todoEffortInfo;exports.reminderItemsForMinute=reminderItemsForMinute;exports.normalizeNoteHtml=normalizeNoteHtml;exports.noteToPlainText=noteToPlainText;exports.uniqueTitle=uniqueTitle;
