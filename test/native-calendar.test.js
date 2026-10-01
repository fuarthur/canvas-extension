import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPlannerStore} from '../src/storage.js';
import {defaultSettings} from '../src/planning-settings.js';
import {mountNativeCalendarCompletion} from '../src/native-calendar.js';
import {mountNativeCalendarBridge} from '../src/native-calendar-bridge.js';
import {createGlobalTheme} from '../src/global-theme.js';
import {defaultTheme} from '../src/themes.js';

test('extension completion colors consume theme variables without changing event colors',async()=>{
 const f=await setup(monthEntry(1));try{
 const event=f.document.querySelector('.fc-event');event.style.cssText='color:#254284;border-color:#254284';
 const before=f.dom.window.getComputedStyle(event).color,theme=createGlobalTheme({document:f.document});
 theme.apply({theme:{...defaultTheme(),preset:'dark'},scope:'canvas'});
 const style=f.document.querySelector('[data-canvas-planning-native-style]');
 assert.match(style.textContent,/var\(--cp-native-completed-text/);
 assert.equal(f.dom.window.getComputedStyle(event).color,before);theme.destroy();
 assert.equal(f.dom.window.getComputedStyle(event).color,before);
 }finally{f.cleanup();}
});

const settle=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const monthEntry=(id,native=false)=>`<a class="fc-event assignment" data-canvas-planning-key="assignment:${id}"><div class="fc-content"><span class="fc-title${native?' calendar__event--completed':''}"><span class="screenreader-only">Assignment Title: </span>Same title</span></div></a>`;
const agendaEntry=`<li class="agenda-event__item" data-event-id="calendar_event_5"><div class="agenda-event__item-container"><span class="agenda-event__title">Meeting</span></div></li>`;
async function setup(html,enabled=true){
 const dom=new JSDOM(html,{url:'https://canvas.illinois.edu/calendar'});
 const entries={};const listeners=new Set();
 const storage={async get(){return structuredClone(entries);},async set(values){const changes={};for(const [key,value]of Object.entries(values)){changes[key]={oldValue:entries[key],newValue:value};entries[key]=structuredClone(value);}for(const listener of listeners)listener(changes,'local');},async remove(key){delete entries[key];}};
 const storeFactory=user=>createPlannerStore(storage,'canvas.illinois.edu',user);
 await storeFactory(77).setSettings({...defaultSettings(),nativeCalendarCompletion:enabled});
 await storeFactory(77).setCompleted('assignment:1',true);
 await storeFactory(77).setCompleted('event:5',true);
 let userId=77,profileError=false;
 const destroy=mountNativeCalendarCompletion({document:dom.window.document,storeFactory,loadProfile:async()=>{if(profileError)throw new Error('signed out');return {id:userId};},subscribeStorage:({userId},callback)=>{
  const prefix=`canvas-planner:canvas.illinois.edu:${userId}:`;const listener=changes=>{if(Object.keys(changes).some(key=>key.startsWith(prefix)))callback(changes);};listeners.add(listener);return()=>listeners.delete(listener);
 }});
 await settle();
 return {dom,document:dom.window.document,store:storeFactory(77),storeFactory,entries,listeners,destroy,setUser:id=>{userId=id;},failProfile:()=>{profileError=true;},cleanup(){destroy();dom.window.close();}};
}

test('closed planner tabs mark exact IDs in month and agenda and preserve native completion',async()=>{
 const f=await setup(monthEntry(1)+monthEntry(2)+monthEntry(1,true)+agendaEntry);
 try{
  const rows=f.document.querySelectorAll('.fc-event');
  assert.equal(rows[0].querySelector('[data-canvas-planning-badge]').textContent,'✓ P');
  assert.equal(rows[1].querySelector('[data-canvas-planning-badge]'),null);
  assert.equal(rows[2].querySelector('[data-canvas-planning-badge]'),null);
  assert.ok(rows[2].querySelector('.calendar__event--completed'));
  assert.ok(f.document.querySelector('.agenda-event__item [data-canvas-planning-badge]'));
  assert.equal(f.document.querySelector('#canvas-planning-calendar-root'),null);
 }finally{f.cleanup();}
});

test('disabled preference leaves native calendar untouched and can be enabled from another tab',async()=>{
 const f=await setup(monthEntry(1),false);
 try{
  assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
  await f.store.setSettings({...defaultSettings(),nativeCalendarCompletion:true});await settle();
  assert.ok(f.document.querySelector('[data-canvas-planning-badge]'));
  await f.store.setSettings(defaultSettings());await settle();
  assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
  assert.equal(f.document.querySelector('[data-canvas-planning-completed]'),null);
 }finally{f.cleanup();}
});

test('single and bulk completion changes and undo update a closed tab',async()=>{
 const f=await setup(monthEntry(1)+monthEntry(2));
 try{
  await f.store.setCompleted('assignment:1',false);await settle();assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
  const token=await f.store.applyTaskBatch(['assignment:1','assignment:2'],{completed:true});await settle();assert.equal(f.document.querySelectorAll('[data-canvas-planning-badge]').length,2);
  await f.store.undoTaskBatch(token);await settle();assert.equal(f.document.querySelectorAll('[data-canvas-planning-badge]').length,0);
 }finally{f.cleanup();}
});

test('calendar replacement, reused entries and native completion changes do not leave stale marks',async()=>{
 const f=await setup(`<main>${monthEntry(1)}</main>`);
 try{
  f.document.querySelector('main').innerHTML=monthEntry(1)+agendaEntry;await settle();
  assert.equal(f.document.querySelectorAll('[data-canvas-planning-badge]').length,2);
  f.document.querySelector('.fc-event').dataset.canvasPlanningKey='assignment:2';await settle();
  assert.equal(f.document.querySelector('.fc-event [data-canvas-planning-badge]'),null);
  f.document.querySelector('.agenda-event__title').classList.add('calendar__event--completed');await settle();
  assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
 }finally{f.cleanup();}
});

test('focus verifies the account before using new storage and sign-out clears marks',async()=>{
 const f=await setup(monthEntry(1));
 try{
  f.setUser(88);f.dom.window.dispatchEvent(new f.dom.window.Event('focus'));await settle();
  assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
  await f.store.setCompleted('assignment:1',true);await settle();assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
  await f.storeFactory(88).setSettings({...defaultSettings(),nativeCalendarCompletion:true});
  await f.storeFactory(88).setCompleted('assignment:1',true);await settle();assert.ok(f.document.querySelector('[data-canvas-planning-badge]'));
  f.failProfile();f.dom.window.dispatchEvent(new f.dom.window.Event('focus'));await settle();assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
 }finally{f.cleanup();}
});

test('cleanup removes only extension decorations and stops storage and DOM updates',async()=>{
 const f=await setup(monthEntry(1,true)+monthEntry(1));
 f.destroy();await settle();assert.equal(f.listeners.size,0);
 assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);
 assert.ok(f.document.querySelector('.calendar__event--completed'));
 f.document.body.insertAdjacentHTML('beforeend',monthEntry(1));await f.store.setCompleted('assignment:1',true);await settle();
 assert.equal(f.document.querySelector('[data-canvas-planning-badge]'),null);f.dom.window.close();
});

test('page bridge exposes FullCalendar IDs without title matching or exposing its event data',async()=>{
 const dom=new JSDOM('<main><a class="fc-event"><span class="fc-title">Same title</span></a><a class="fc-event"><span class="fc-title">Same title</span></a></main>');
 const rows=dom.window.document.querySelectorAll('.fc-event');
 rows[0].jQuery123={fcSeg:{event:{id:'assignment_987',title:'Same title',privateData:'do not expose'}}};
 rows[1].jQuery123={fcSeg:{event:{id:'calendar_event_5'}}};
 const destroy=mountNativeCalendarBridge({document:dom.window.document});await settle();
 assert.equal(rows[0].dataset.canvasPlanningKey,'assignment:987');assert.equal(rows[1].dataset.canvasPlanningKey,'event:5');
 assert.equal(rows[0].outerHTML.includes('privateData'),false);
 rows[0].jQuery123.fcSeg.event.id='assignment_988';rows[0].querySelector('.fc-title').textContent='Changed';await settle();assert.equal(rows[0].dataset.canvasPlanningKey,'assignment:988');
 destroy();dom.window.close();
});

test('page bridge supports FullCalendar 3.10 event definitions and skips sub-assignment identities',async()=>{
 const dom=new JSDOM('<a class="fc-event"></a><a class="fc-event"></a><a class="fc-event"></a>');
 const rows=dom.window.document.querySelectorAll('.fc-event');
 rows[0].jQuery3711232={fcSeg:{footprint:{eventDef:{id:'assignment_987',rawId:'assignment_987'}}}};
 rows[1].jQuery3711232={fcSeg:{footprint:{eventDef:{id:'calendar_event_5',rawId:'calendar_event_5'}}}};
 rows[2].jQuery3711232={fcSeg:{footprint:{eventDef:{id:'assignment_987_12'}}}};
 const destroy=mountNativeCalendarBridge({document:dom.window.document});await settle();
 assert.equal(rows[0].dataset.canvasPlanningKey,'assignment:987');assert.equal(rows[1].dataset.canvasPlanningKey,'event:5');assert.equal(rows[2].dataset.canvasPlanningKey,undefined);
 destroy();dom.window.close();
});
