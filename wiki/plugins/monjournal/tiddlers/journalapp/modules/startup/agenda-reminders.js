/*\
title: $:/journalapp/modules/startup/agenda-reminders.js
type: application/javascript
module-type: startup

Mon Journal — rappels Agenda côté navigateur.
Pas de base parallèle : lit directement les to-dos/habitudes et leur récurrence.
\*/
"use strict";
var Agenda=require("$:/journalapp/modules/lib/agenda.js");
exports.name="journalapp-agenda-reminders";
exports.platforms=["browser"];
exports.after=["render"];
exports.synchronous=true;
exports.startup=function(){
  var fired=Object.create(null),lastDay="";
  function pad(n){return String(n).padStart(2,"0");}
  function stack(){var s=document.querySelector(".ja-agenda-reminder-stack");if(!s){s=document.createElement("div");s.className="ja-agenda-reminder-stack";document.body.appendChild(s);}return s;}
  function navigate(title){try{$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:title});}catch(e){}}
  function toast(item){var host=stack(),el=document.createElement("div");el.className="ja-agenda-reminder-toast";var ic=document.createElement("div");ic.className="ja-agenda-reminder-icon";ic.textContent=item.kind==="habit"?"↻":"⏰";el.appendChild(ic);var main=document.createElement("div");main.className="ja-agenda-reminder-main";var t=document.createElement("div");t.className="ja-agenda-reminder-title";t.textContent=item.title;main.appendChild(t);var m=document.createElement("div");m.className="ja-agenda-reminder-meta";m.textContent=item.time+" · "+(item.kind==="habit"?"Habitude":"To-do");main.appendChild(m);el.appendChild(main);var x=document.createElement("button");x.type="button";x.className="ja-agenda-reminder-close";x.textContent="×";x.addEventListener("click",function(e){e.stopPropagation();el.remove();});el.appendChild(x);el.addEventListener("click",function(){navigate(item.refTitle);el.remove();});host.appendChild(el);window.setTimeout(function(){if(!el.isConnected){return;}el.classList.add("is-leaving");window.setTimeout(function(){el.remove();},220);},12000);}
  function system(item,cfg){if(!cfg.reminders||!cfg.reminders.system||typeof Notification==="undefined"||Notification.permission!=="granted"){return;}try{var n=new Notification((item.kind==="habit"?"Habitude : ":"To-do : ")+item.title,{body:item.time+" · Mon Journal — Agenda",tag:"ja-agenda-"+item.kind+"-"+item.refTitle+"-"+item.date});n.onclick=function(){window.focus();navigate(item.refTitle);try{n.close();}catch(e){}};}catch(e){}}
  function check(){var cfg=Agenda.readConfig($tw.wiki);if(!cfg.reminders||cfg.reminders.enabled===false){return;}var now=new Date(),iso=Agenda.todayIso(),hh=pad(now.getHours())+":"+pad(now.getMinutes());if(lastDay!==iso){fired=Object.create(null);lastDay=iso;}Agenda.reminderItemsForMinute($tw.wiki,iso,hh).forEach(function(item){var key=item.kind+"::"+item.refTitle+"::"+iso+"::"+hh;if(fired[key]){return;}fired[key]=true;toast(item);system(item,cfg);});}
  window.setTimeout(check,1200);if(window.__jaAgendaReminderTimer){window.clearInterval(window.__jaAgendaReminderTimer);}window.__jaAgendaReminderTimer=window.setInterval(check,30000);
};
