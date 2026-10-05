import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createReminderSettingsEditor} from '../src/reminder-settings-view.js';
import {renderPlanningSettings} from '../src/settings-view.js';import {planningState} from './helpers/planning.js';
import {setLanguage,localizeTree} from '../src/i18n.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
const control=(root,id)=>root.querySelector(`[data-control-id="${id}"]`);
const change=(dom,root,id,value)=>{const n=control(root,id);if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new dom.window.Event('change'));};
const defer=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
test('reminder settings default off with one round two hours and usable test button',async()=>{
 const dom=new JSDOM('<main/>'),editor=createReminderSettingsEditor({document:dom.window.document});dom.window.document.querySelector('main').append(editor.element);
 assert.equal(control(editor.element,'Enable deadline reminders').checked,false);assert.equal(control(editor.element,'Reminder rounds').value,'1');
 assert.equal(control(editor.element,'Reminder 1 amount').value,'2');assert.equal(control(editor.element,'Reminder 1 unit').value,'hours');assert.equal(control(editor.element,'Reminder 1 amount').disabled,true);
 assert.equal(control(editor.element,'Send test reminder').disabled,false);control(editor.element,'Enable deadline reminders').focus();assert.equal(dom.window.document.activeElement,control(editor.element,'Enable deadline reminders'));
 await editor.refreshStatus();assert.match(editor.element.textContent,/unavailable/);editor.dispose();dom.window.close();
});
test('fractional units save exact minutes and duplicate rounds normalize visibly',async()=>{
 const dom=new JSDOM('');let saved;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async s=>{saved=s;}});
 change(dom,root,'Enable deadline reminders',true);change(dom,root,'Reminder 1 amount','0.5');control(root,'Save planning settings').click();await settle();assert.deepEqual(saved.reminders,{enabled:true,leadMinutes:[30]});
 change(dom,root,'Reminder rounds','3');for(let n=1;n<=3;n++){change(dom,root,`Reminder ${n} unit`,'hours');change(dom,root,`Reminder ${n} amount`,'2');}
 control(root,'Save planning settings').click();await settle();assert.deepEqual(saved.reminders,{enabled:true,leadMinutes:[120]});assert.equal(control(root,'Reminder rounds').value,'1');assert.match(root.textContent,/Duplicate times were merged/);root.dispose();dom.window.close();
});
test('typing an amount updates the draft before blur',async()=>{
 const dom=new JSDOM('');let saved;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async s=>{saved=s;}});
 change(dom,root,'Enable deadline reminders',true);const amount=control(root,'Reminder 1 amount');amount.value='4';amount.dispatchEvent(new dom.window.Event('input'));
 control(root,'Save planning settings').click();await settle();assert.equal(saved.reminders.leadMinutes[0],240);assert.equal(control(root,'Reminder 1 amount').value,'4');root.dispose();dom.window.close();
});
test('drafts survive status updates failed saves and validation',async()=>{
 const dom=new JSDOM(''),d=defer();let attempts=0,saved;
 const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],reminderClient:{getStatus:()=>d.promise},onSave:async s=>{attempts++;if(attempts===1)throw new Error('Could not save settings.');saved=s;}});
 const status=root.refreshReminderStatus();change(dom,root,'Enable deadline reminders',true);change(dom,root,'Reminder 1 amount','4');d.resolve({ok:true,status:{state:'ready',lastSyncedAt:Date.parse('2026-10-04T16:00Z')}});await status;
 assert.equal(control(root,'Reminder 1 amount').value,'4');control(root,'Save planning settings').click();await settle();assert.match(root.textContent,/Could not save settings/);assert.equal(control(root,'Reminder 1 amount').value,'4');assert.equal(control(root,'Enable deadline reminders').disabled,false);
 control(root,'Save planning settings').click();await settle();assert.equal(saved.reminders.leadMinutes[0],240);
 change(dom,root,'Reminder 1 amount','0.001');control(root,'Save planning settings').click();await settle();assert.equal(attempts,2);assert.match(root.textContent,/1 minute to 30 days/);root.dispose();dom.window.close();
});
test('disposal rejects late account status',async()=>{
 const dom=new JSDOM(''),d=defer(),old=createReminderSettingsEditor({document:dom.window.document,client:{getStatus:()=>d.promise}});const pending=old.refreshStatus();old.dispose();const before=old.element.textContent;
 const fresh=createReminderSettingsEditor({document:dom.window.document,client:{getStatus:async()=>({ok:true,status:{state:'notification-denied'}})}});await fresh.refreshStatus();d.resolve({ok:true,status:{state:'ready'}});await pending;
 assert.equal(old.element.textContent,before);assert.match(fresh.element.textContent,/blocked/);fresh.dispose();dom.window.close();
});
test('test reminder reports success and errors while off and translates controls',async()=>{
 const dom=new JSDOM('');let result={ok:true},tests=0;
 const editor=createReminderSettingsEditor({document:dom.window.document,client:{getStatus:async()=>({ok:true,status:{state:'off'}}),testNotification:async()=>{tests++;return result;}}});
 control(editor.element,'Send test reminder').click();await settle();assert.equal(tests,1);assert.match(editor.element.textContent,/Check your system notifications/);
 result={ok:false,code:'NOTIFICATION'};control(editor.element,'Send test reminder').click();await settle();assert.match(editor.element.textContent,/blocked or unavailable/);
 setLanguage(dom.window.document,'zh-CN');localizeTree(editor.element);assert.equal(control(editor.element,'Enable deadline reminders').getAttribute('aria-label'),'启用截止提醒');assert.equal(control(editor.element,'Reminder 1 amount').getAttribute('aria-label'),'第 1 轮提前数值');assert.match(editor.element.textContent,/已被阻止或不可用/);editor.dispose();dom.window.close();
});
