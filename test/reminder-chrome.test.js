import test from 'node:test';import assert from 'node:assert/strict';
import {createReminderChrome} from '../src/reminder-chrome.js';
const stub=()=>{
 const calls=[];
 const chromeApi={runtime:{lastError:null},alarms:{get:(name,cb)=>cb({name}),create:(name,info)=>calls.push({name,info}),clear:(name,cb)=>cb(true)},notifications:{getPermissionLevel:cb=>cb('granted'),create:(id,options,cb)=>{calls.push({id,options});cb(id);},clear:(id,cb)=>cb(true)},tabs:{create:(options,cb)=>{calls.push(options);cb({id:1});}}};
 return {calls,chromeApi};
};
test('callback notifications work without Chrome 116 Promise support',async()=>{
 const f=stub(),api=createReminderChrome({...f,iconUrl:'chrome-extension://test/icons/deadline-128.png'});
 assert.equal(await api.notifications.permission(),'granted');assert.equal(await api.notifications.create({id:'test',title:'DDL',message:'Soon'}),'test');
 assert.equal(f.calls[0].options.type,'basic');assert.match(f.calls[0].options.iconUrl,/deadline-128.png$/);
 assert.equal(await api.notifications.clear('test'),true);await api.alarms.set('refresh',{periodInMinutes:15});assert.equal((await api.alarms.get('refresh')).name,'refresh');assert.equal(await api.alarms.remove('refresh'),true);
});
test('callback errors and unavailable extension context reject promises',async()=>{
 const f=stub(),api=createReminderChrome({...f,iconUrl:'icon.png'});f.chromeApi.notifications.create=(id,options,cb)=>{f.chromeApi.runtime.lastError={message:'denied'};cb();f.chromeApi.runtime.lastError=null;};
 await assert.rejects(api.notifications.create({id:'t',title:'T',message:'M'}),/denied/);
 f.chromeApi.notifications.getPermissionLevel=cb=>cb('denied');assert.equal(await api.notifications.permission(),'denied');
 f.chromeApi.tabs.create=()=>{throw new Error('Extension context invalidated');};await assert.rejects(api.notifications.open('https://canvas.illinois.edu/calendar'),/invalidated/);
});
