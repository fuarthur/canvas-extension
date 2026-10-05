import test from 'node:test';import assert from 'node:assert/strict';
import {REMINDER_REFRESH_ALARM,REMINDER_NEXT_ALARM} from '../src/reminder-service.js';
import {reminderHarness,runtimeKey,sender} from './helpers/reminders.js';
import {defaultSettings} from '../src/planning-settings.js';
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('enabled reminders run with no content page',async()=>{
 const h=await reminderHarness();await h.service.start();assert.equal(h.alarmsMap.get(REMINDER_REFRESH_ALARM).periodInMinutes,15);assert.equal(h.alarmsMap.get(REMINDER_NEXT_ALARM).when,Date.parse('2026-10-05T18:00Z'));
 h.clock=Date.parse('2026-10-05T18:00Z');await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,1);assert.equal((await h.status()).status.state,'ready');
 await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,1);
});
test('worker restart does not repeat sent or uncertain pending rounds',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});await h.service.start();assert.equal(h.creates.length,1);
 h.service=h.newService();await h.service.start();assert.equal(h.creates.length,1);
 const record=h.area.entries[runtimeKey(77)],token=Object.keys(record.ledger)[0];record.ledger[token].state='pending';await h.area.set({[runtimeKey(77)]:record});
 h.service=h.newService();await h.service.start();assert.equal(h.creates.length,1);assert.equal((await h.status()).status.errorCode,'DELIVERY_UNCERTAIN');
});
test('disabled users perform no scheduled fetch',async()=>{
 const h=await reminderHarness({enabled:false});await h.service.start();assert.equal(h.fetchCount,0);assert.equal(h.alarmsMap.size,0);assert.equal((await h.status()).status.state,'off');
});
test('offline grace expires at 24 hours without refreshing syncedAt',async()=>{
 const h=await reminderHarness();await h.service.start();const syncedAt=h.area.entries[runtimeKey(77)].snapshot.syncedAt;h.fetchError=new Error('offline');
 h.clock=Date.parse('2026-10-05T18:00Z');await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,1);assert.equal((await h.status()).status.state,'offline');assert.equal(h.area.entries[runtimeKey(77)].snapshot.syncedAt,syncedAt);
 h.clock=syncedAt+24*3600000;await h.service.handleAlarm({name:REMINDER_REFRESH_ALARM});assert.equal((await h.status()).status.state,'stale');assert.equal(h.alarmsMap.has(REMINDER_NEXT_ALARM),false);
});
test('authentication loss invalidates data and successful login resumes',async()=>{
 const h=await reminderHarness();await h.service.start();h.clock=Date.parse('2026-10-05T19:00Z');h.fetchError=Object.assign(new Error('login'),{code:'AUTH'});
 await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,0);assert.equal(h.area.entries[runtimeKey(77)].snapshot,null);assert.equal((await h.status()).status.state,'auth');
 h.fetchError=null;await h.service.handleAlarm({name:REMINDER_REFRESH_ALARM});assert.equal(h.creates.length,1);
});
for(const action of ['account','test','click'])test(action+' authentication failure immediately discards cached deadlines',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});await h.service.start();assert.equal(h.visible.size,1);
 h.fetchError=Object.assign(new Error('login'),{code:'AUTH'});
 if(action==='click')await h.service.handleNotificationClick(h.creates[0].id);
 else await h.service.handleMessage({type:action==='account'?'REMINDER_ACCOUNT_SEEN':'REMINDER_TEST',userId:77},sender);
 assert.equal(h.area.entries[runtimeKey(77)].snapshot,null);assert.equal(h.visible.size,0);assert.equal((await h.status()).status.state,'auth');
 assert.equal(h.alarmsMap.has(REMINDER_NEXT_ALARM),false);
});
test('a newer verified account cancels an older in-flight snapshot',async()=>{
 const h=await reminderHarness();await h.service.start();const previous=h.area.entries[runtimeKey(77)].snapshot.syncedAt;
 h.clock=Date.parse('2026-10-05T19:00Z');const d=defer(),entered=defer(),old=h.snapshotData();h.snapshotFn=()=>{entered.resolve();return d.promise;};
 const pending=h.service.handleAlarm({name:REMINDER_NEXT_ALARM});await entered.promise;h.profile={id:88,time_zone:'America/Chicago'};await h.store(88).setSettings(defaultSettings());h.snapshotFn=null;
 const switched=h.service.handleMessage({type:'REMINDER_ACCOUNT_SEEN',userId:88,selectedCalendars:['course_456']},sender);d.resolve(old);await Promise.all([pending,switched]);
 assert.equal(h.creates.length,0);assert.equal(h.area.entries[runtimeKey(77)].snapshot.syncedAt,previous);assert.equal(h.area.entries['canvas-planner:canvas.illinois.edu:reminder-active:v1'].userId,'88');
});
for(const kind of ['disable','complete'])test(kind+' invalidates a pending refresh before delivery',async()=>{
 const h=await reminderHarness();await h.service.start();h.clock=Date.parse('2026-10-05T19:00Z');const d=defer(),entered=defer(),snapshot=h.snapshotData();h.snapshotFn=()=>{entered.resolve();return d.promise;};
 const pending=h.service.handleAlarm({name:REMINDER_NEXT_ALARM});await entered.promise;
 const key=kind==='disable'?'canvas-planner:canvas.illinois.edu:77:settings:v1':'canvas-planner:canvas.illinois.edu:77:completed:assignment:1';
 if(kind==='disable')await h.store(77).setSettings(defaultSettings());else await h.store(77).setCompleted('assignment:1',true);
 const changes={[key]:{newValue:h.area.entries[key]}};h.service.invalidate(changes);h.snapshotFn=null;const change=h.service.handleStorageChanges(changes,'local');d.resolve(snapshot);await Promise.all([pending,change]);assert.equal(h.creates.length,0);
});
test('claim precedes create and storage failure prevents delivery',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});h.beforeCreate=()=>assert.ok(Object.values(h.area.entries[runtimeKey(77)].ledger).some(e=>e.state==='pending'));await h.service.start();assert.equal(h.creates.length,1);
 const broken=await reminderHarness({clock:h.clock});const set=broken.area.set;broken.area.set=async entries=>{if(Object.values(entries).some(v=>Object.values(v?.ledger||{}).some(e=>e.state==='pending')))throw new Error('quota');return set(entries);};
 await broken.service.start();assert.equal(broken.creates.length,0);assert.equal((await broken.status()).status.errorCode,'STORAGE');
});
test('notification failure waits 15 minutes before retrying',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});h.createError=new Error('create failed');await h.service.start();assert.equal((await h.status()).status.errorCode,'NOTIFICATION');
 const record=Object.values(h.area.entries[runtimeKey(77)].ledger)[0];assert.equal(record.state,'failed');assert.equal(record.retryAt,h.clock+15*60000);
 h.createError=null;await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,0);h.clock+=15*60000;await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,1);
});
test('messages reject foreign frames and claimed accounts while status stays read-only',async()=>{
 const h=await reminderHarness();await h.service.start();
 for(const badSender of [{url:'https://example.com/calendar',frameId:0},{...sender,frameId:1}])assert.equal((await h.service.handleMessage({type:'REMINDER_TEST',userId:77},badSender)).code,'INVALID');
 assert.equal((await h.service.handleMessage({type:'REMINDER_STATUS',userId:88},sender)).code,'IDENTITY');
 const before=structuredClone(h.area.entries),count=h.fetchCount;await h.status();assert.deepEqual(h.area.entries,before);assert.equal(h.fetchCount,count);
 assert.equal(await h.service.handleMessage({type:'PLAN_SAVE'},sender),undefined);
});
test('test notifications work when disabled and never consume real rounds',async()=>{
 const h=await reminderHarness({enabled:false});await h.service.start();const before=structuredClone(h.area.entries[runtimeKey(77)].ledger);
 assert.equal((await h.service.handleMessage({type:'REMINDER_TEST',userId:77},sender)).ok,true);assert.equal(h.creates.length,1);assert.notEqual(h.creates[0].title,h.items[0].title);assert.deepEqual(h.area.entries[runtimeKey(77)].ledger,before);
 await h.service.handleNotificationClick(h.creates[0].id);assert.deepEqual(h.opens,['https://canvas.illinois.edu/calendar']);
});
test('internal writes do not self-trigger and completion clears visible notifications',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});await h.service.start();const count=h.snapshotCount;
 const internal={[runtimeKey(77)]:{newValue:h.area.entries[runtimeKey(77)]}};h.service.invalidate(internal);await h.service.handleStorageChanges(internal,'local');assert.equal(h.snapshotCount,count);
 await h.store(77).setCompleted('assignment:1',true);const key='canvas-planner:canvas.illinois.edu:77:completed:assignment:1';await h.service.handleStorageChanges({[key]:{newValue:true}},'local');assert.equal(h.visible.size,0);await h.service.handleNotificationClick(h.creates[0].id);assert.equal(h.opens.length,0);
});
test('empty and unavailable selected calendars suppress old snapshot tasks',async()=>{
 const h=await reminderHarness();await h.service.start();h.clock=Date.parse('2026-10-05T19:00Z');h.unavailable=['course_456'];await h.service.handleAlarm({name:REMINDER_NEXT_ALARM});assert.equal(h.creates.length,0);
 h.unavailable=[];await h.store(77).setSelectedCalendars([]);await h.service.handleStorageChanges({'canvas-planner:canvas.illinois.edu:77:calendars':{newValue:[]}},'local');assert.equal(h.creates.length,0);
});
test('denied notification permission can recover without consuming a round',async()=>{
 const h=await reminderHarness({clock:Date.parse('2026-10-05T19:00Z')});h.permission='denied';await h.service.start();assert.equal(h.creates.length,0);assert.equal((await h.status()).status.state,'notification-denied');
 h.permission='granted';await h.service.handleAlarm({name:REMINDER_REFRESH_ALARM});assert.equal(h.creates.length,1);
});
