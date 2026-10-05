import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';import {runInNewContext} from 'node:vm';import {webcrypto} from 'node:crypto';
import {memoryStorage} from './helpers/planning.js';import {createPlannerStore} from '../src/storage.js';import {defaultSettings} from '../src/planning-settings.js';
import {REMINDER_ACTIVE_KEY,REMINDER_REFRESH_ALARM,REMINDER_NEXT_ALARM} from '../src/reminder-service.js';
const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},fire(...args){for(const fn of this.listeners)fn(...args);}});
const until=async condition=>{for(let i=0;i<300;i++){if(condition())return;await new Promise(r=>setImmediate(r));}assert.fail('background did not finish');};
test('reminder manifest grants only alarms and notifications in addition to storage',async()=>{
 const manifest=JSON.parse(await readFile('manifest.json','utf8'));assert.deepEqual(manifest.permissions,['storage','alarms','notifications']);assert.deepEqual(manifest.host_permissions,['https://canvas.illinois.edu/*']);
 const icon=await readFile('assets/deadline-128.png');assert.equal(icon.readUInt32BE(16),128);assert.equal(icon.readUInt32BE(20),128);
});
test('bundled background runs without DOM and restores alarms while preserving planner services',async()=>{
 const result=await build({entryPoints:['src/background.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome114'});
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77),clock=Date.parse('2026-10-05T19:00Z');
 await store.setSettings({...defaultSettings(),reminders:{enabled:true,leadMinutes:[120]}});await store.setSelectedCalendars(['course_456']);await area.set({[REMINDER_ACTIVE_KEY]:{schemaVersion:1,hostname:'canvas.illinois.edu',userId:'77'}});
 const notices=[],alarmMap=new Map(),requests=[];
 const chrome={storage:{local:area,onChanged:event()},action:{onClicked:event()},runtime:{onMessage:event(),onConnect:event(),onStartup:event(),onInstalled:event(),getURL:path=>'chrome-extension://fictional/'+path},
 alarms:{onAlarm:event(),get:(name,cb)=>cb(alarmMap.get(name)),create:(name,info)=>alarmMap.set(name,{...info,scheduledTime:info.when}),clear:(name,cb)=>cb(alarmMap.delete(name))},
 notifications:{onClicked:event(),getPermissionLevel:cb=>cb('granted'),create:(id,options,cb)=>{notices.push({id,...options});cb(id);},clear:(_id,cb)=>cb(true)},tabs:{sendMessage:async()=>{},create:(_options,cb)=>cb({id:1})}};
 const fetch=async(url,options)=>{requests.push({url,options});const path=new URL(url).pathname;const body=path.endsWith('/profile')?{id:77,time_zone:'America/Chicago'}:path.endsWith('/courses')?[{id:456,name:'Fictional course',enrollments:[{type:'student'}]}]:path.endsWith('/groups')?[]:path.endsWith('/calendar_events')?[{id:'assignment_1',title:'Fictional task',context_code:'course_456',assignment:{due_at:'2026-10-05T20:00Z',user_submitted:false},html_url:'https://canvas.illinois.edu/courses/456/assignments/1'}]:[];return {ok:true,status:200,headers:{get:key=>key==='content-type'?'application/json':null},json:async()=>body};};
 class FixedDate extends Date{static now(){return clock;}}
 runInNewContext(result.outputFiles[0].text,{chrome,fetch,URL,Intl,Date:FixedDate,crypto:webcrypto,TextEncoder,structuredClone,setTimeout,clearTimeout,AbortController});
 assert.equal(chrome.alarms.onAlarm.listeners.length,1);assert.equal(chrome.notifications.onClicked.listeners.length,1);assert.equal(chrome.runtime.onStartup.listeners.length,1);assert.equal(chrome.runtime.onInstalled.listeners.length,1);
 assert.equal(chrome.runtime.onConnect.listeners.length,1);assert.equal(chrome.action.onClicked.listeners.length,1);
 try{await until(()=>notices.length===1&&alarmMap.has(REMINDER_NEXT_ALARM));}catch(error){assert.fail(JSON.stringify({runtime:area.entries,requests,notices,alarms:[...alarmMap]},null,2));}assert.equal(notices[0].type,'basic');assert.equal(notices[0].iconUrl,'chrome-extension://fictional/icons/deadline-128.png');assert.ok(requests.every(r=>new URL(r.url).origin==='https://canvas.illinois.edu'&&r.options.credentials==='include'));
 alarmMap.clear();chrome.runtime.onStartup.fire();await until(()=>alarmMap.has(REMINDER_REFRESH_ALARM));assert.equal(notices.length,1);
 const message=(value)=>new Promise(resolve=>{for(const fn of chrome.runtime.onMessage.listeners)fn(value,{url:'https://canvas.illinois.edu/calendar',frameId:0},resolve);});
 assert.equal((await message({type:'REMINDER_STATUS',userId:77})).ok,true);assert.equal((await message({type:'PLAN_SAVE',userId:77})).ok,false);
 chrome.alarms.onAlarm.fire({name:REMINDER_NEXT_ALARM});await message({type:'REMINDER_STATUS',userId:77});assert.equal(notices.length,1);
});
