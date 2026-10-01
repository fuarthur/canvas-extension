import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPlanner} from '../src/view.js';
import {createPlannerStore} from '../src/storage.js';
import * as plannerStorage from '../src/storage.js';
import {themePalette,contrastRatio,defaultTheme} from '../src/themes.js';
import {memoryStorage,settings} from './helpers/planning.js';

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const custom={base:'dark',accent:'#f4b860',background:'#111827',surface:'#1f2937',text:'#f9fafb'};
const control=(root,id)=>root.querySelector(`[data-control-id="${id}"]`);

test('scope control saves independently and preserves drafts, colors and localized labels',async()=>{
 const s=await setup();try{
 await s.click('Planner view');await s.click('New plan');await s.change('Plan name','Keep my draft');await s.click('Calendar settings');
 await s.change('Default estimate minutes','77');const field=control(s.root,'Default estimate minutes');
 await s.change('Interface theme','custom');await s.change('Custom theme base','dark');
 await s.change('Theme applies to','canvas');assert.equal((await s.store.loadPlanningState()).themeScope,'canvas');
 await s.click('Reset custom colors');assert.equal((await s.store.loadPlanningState()).themeScope,'canvas');
 assert.equal(control(s.root,'Default estimate minutes'),field);assert.equal(field.value,'77');assert.equal(s.calls,1);
 await s.change('Interface language','zh-CN');assert.equal(control(s.root,'Theme applies to').getAttribute('aria-label'),'主题应用范围');
 await s.click('Planner view');assert.equal(control(s.root,'Plan name').value,'Keep my draft');
 }finally{s.destroy();}
});
test('scope control restores saved value on failure and accepts canonical cross-page result',async()=>{
 const {createThemeSettings}=await import('../src/theme-settings-view.js');
 const dom=new JSDOM('<main/>'),store=createPlannerStore(memoryStorage(),'canvas.illinois.edu',77);
 let fail=true,finish;const editor=createThemeSettings({document:dom.window.document,value:defaultTheme(),scope:'planner',onSave:theme=>store.setTheme(theme),onSaveScope:async value=>{
  if(fail)throw new Error('disk full');await store.setThemeScope(value);await new Promise(resolve=>{finish=resolve;});return (await store.loadPlanningState()).themeScope;
 }});dom.window.document.body.append(editor.element);
 const input=control(editor.element,'Theme applies to');assert.ok(input);
 const change=()=>{input.value='canvas';input.dispatchEvent(new dom.window.Event('change'));};
 change();await settle();assert.equal(input.value,'planner');assert.match(editor.element.textContent,/disk full/);
 fail=false;change();await settle();assert.equal(input.disabled,true);
 await store.setThemeScope('planner');finish();await settle();assert.equal(input.value,'planner');assert.equal(input.disabled,false);dom.window.close();
});

test('theme preferences survive reopening and stale settings saves, isolated by account and hostname',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 assert.equal((await store.loadPlanningState()).theme.preset,'light');
 await store.setTheme({preset:'custom',custom});
 await store.setSettings(settings({defaultMinutes:90}));
 assert.deepEqual((await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState()).theme,{preset:'custom',custom});
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).theme.preset,'light');
 assert.equal((await createPlannerStore(area,'other.canvas.edu',77).loadPlanningState()).theme.preset,'light');
});

test('invalid theme writes cannot replace saved colors and corrupt preferences fall back safely',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setTheme({preset:'custom',custom});
 for(const value of [{preset:'unknown',custom},{preset:'custom',custom:{...custom,accent:'red;display:none'}},{preset:'custom',custom:{...custom,base:'unknown'}}])await assert.rejects(store.setTheme(value));
 assert.deepEqual((await store.loadPlanningState()).theme,{preset:'custom',custom});
 area.entries['canvas-planner:canvas.illinois.edu:77:theme:v1']={preset:'custom',custom:{...custom,text:null}};
 const loaded=await store.loadPlanningState();assert.equal(loaded.theme.preset,'light');assert.ok(loaded.warnings.length);
});

async function setup({dark=false,subscribe=false}={}){
 const dom=new JSDOM('<main>Native Calendar</main>',{url:'https://canvas.illinois.edu/calendar'});
 const document=dom.window.document,host=document.createElement('div'),area=memoryStorage();
 let userId=77,calls=0,storageChange;const listeners=new Set();
 const media={matches:dark,addEventListener(type,fn){assert.equal(type,'change');listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 dom.window.matchMedia=()=>media;
 const stores=new Map(),getStore=id=>{if(!stores.has(id))stores.set(id,createPlannerStore(area,'canvas.illinois.edu',id));return stores.get(id);};
 const planner=mountPlanner({host,storeFactory:getStore,subscribeStorage:subscribe?(_scope,fn)=>{storageChange=fn;return()=>{storageChange=null;};}:undefined,initialMonth:'2026-10',now:()=>new Date('2026-10-01T12:00:00Z'),loadSnapshot:async()=>{calls++;return {profile:{id:userId,time_zone:'America/Chicago'},contexts:[{code:'course_456',name:'EPSY 456'}],events:[],assignments:[{id:'assignment_1',title:'Essay',context_code:'course_456',assignment:{due_at:'2026-10-03T23:59:00-05:00'}}],range:{startDate:'2026-10-01',endDate:'2026-12-31'}};}});
 await planner.show();const root=host.shadowRoot;
 const click=async id=>{const node=control(root,id);assert.ok(node,`Missing ${id}`);node.click();await settle();};
 const change=async(id,value)=>{const node=control(root,id);assert.ok(node,`Missing ${id}`);node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await settle();};
 return {dom,document,host,root,planner,click,change,get store(){return getStore(userId);},get calls(){return calls;},get listenerCount(){return listeners.size;},async systemDark(value){media.matches=value;for(const fn of listeners)fn({matches:value});await settle();},async switchAccount(id){userId=id;await click('Refresh calendar');},async notify(){storageChange?.({});await settle();},destroy(){planner.destroy();dom.window.close();}};
}

test('all preset themes apply immediately without fetching Canvas or losing unsaved settings',async()=>{
 const s=await setup();try{
 await s.click('Calendar settings');await s.click('Add estimate rule');await s.change('Rule 1 match','Essay');await s.change('Default estimate minutes','77');
 const editor=control(s.root,'Default estimate minutes');
 const seen=new Set();
 for(const preset of ['dark','forest','warm','light']){
  await s.change('Interface theme',preset);assert.equal(s.host.dataset.theme,preset);
  seen.add(s.host.style.getPropertyValue('--cp-bg'));assert.equal(control(s.root,'Default estimate minutes'),editor);assert.equal(editor.value,'77');assert.equal(control(s.root,'Rule 1 match').value,'Essay');
 }
 assert.equal(seen.size,4);assert.equal(s.calls,1);assert.equal(s.document.querySelector('main').textContent,'Native Calendar');
 await s.click('Save planning settings');assert.equal((await s.store.loadPlanningState()).settings.defaultMinutes,77);
 }finally{s.destroy();}
});

test('custom colors support hex and color pickers, persist across presets and reset to the selected base',async()=>{
 const s=await setup();try{
 await s.click('Calendar settings');await s.change('Interface theme','custom');await s.change('Custom theme base','dark');
 await s.change('Theme accent hex','#f4b860');await s.change('Theme background color','#111827');await s.change('Theme surface hex','#1f2937');await s.change('Theme text hex','#f9fafb');
 assert.equal(s.host.style.colorScheme,'dark');assert.equal(s.host.style.getPropertyValue('--cp-accent'),'#f4b860');assert.equal(s.host.style.getPropertyValue('--cp-bg'),'#111827');assert.equal(control(s.root,'Theme accent color').value,'#f4b860');
 await s.change('Theme accent hex','invalid');assert.equal(control(s.root,'Theme accent hex').value,'#f4b860');assert.match(s.root.querySelector('.theme-notice').textContent,/hex/i);
 await s.change('Interface theme','forest');await s.change('Interface theme','custom');assert.equal(s.host.style.getPropertyValue('--cp-accent'),'#f4b860');
 await s.planner.destroy();await s.planner.show();assert.equal(s.host.style.getPropertyValue('--cp-bg'),'#111827');assert.equal((await s.store.loadPlanningState()).theme.custom.text,'#f9fafb');
 await s.click('Calendar settings');await s.click('Reset custom colors');assert.notEqual(s.host.style.getPropertyValue('--cp-accent'),'#f4b860');assert.equal(s.host.style.colorScheme,'dark');
 }finally{s.destroy();}
});

test('system theme follows OS changes while open and removes its listener when closed',async()=>{
 const s=await setup();try{
 await s.click('Calendar settings');await s.change('Interface theme','system');assert.equal(s.host.style.colorScheme,'light');const light=s.host.style.getPropertyValue('--cp-bg');
 await s.systemDark(true);assert.equal(s.host.style.colorScheme,'dark');assert.notEqual(s.host.style.getPropertyValue('--cp-bg'),light);
 await s.change('Interface theme','forest');const forest=s.host.style.getPropertyValue('--cp-bg');await s.systemDark(false);assert.equal(s.host.style.getPropertyValue('--cp-bg'),forest);
 await s.change('Interface theme','system');await s.click('Close planning calendar');assert.equal(s.listenerCount,0);
 await s.planner.show();await s.systemDark(true);assert.equal(s.host.style.colorScheme,'dark');
 }finally{s.destroy();}
});

test('theme changes preserve a suspended planner draft and localize appearance controls',async()=>{
 const s=await setup();try{
 await s.click('Planner view');await s.click('New plan');await s.change('Plan name','My unsaved plan');await s.click('Calendar settings');
 await s.change('Interface theme','dark');await s.change('Interface language','zh-CN');assert.equal(control(s.root,'Interface theme').getAttribute('aria-label'),'界面主题');assert.match(s.root.querySelector('.theme-settings').textContent,/深色/);
 await s.click('Planner view');assert.equal(control(s.root,'Plan name').value,'My unsaved plan');assert.match(s.root.textContent,/尚未保存/);assert.deepEqual((await s.store.loadPlanningState()).plans,{});
 }finally{s.destroy();}
});

test('failed appearance saves restore the active theme and allow retry',async()=>{
 const s=await setup();try{
 await s.click('Calendar settings');const original=s.store.setTheme;s.store.setTheme=async()=>{throw new Error('Storage unavailable');};
 await s.change('Interface theme','dark');assert.equal(s.host.dataset.theme,'light');assert.equal(control(s.root,'Interface theme').value,'light');assert.match(s.root.querySelector('.theme-notice').textContent,/Storage unavailable/);assert.equal(control(s.root,'Interface theme').disabled,false);
 s.store.setTheme=original;await s.change('Interface theme','dark');assert.equal(s.host.dataset.theme,'dark');
 }finally{s.destroy();}
});

test('another page changing the theme updates appearance while retaining local edits, and account switches reset it',async()=>{
 const s=await setup({subscribe:true});try{
 await s.click('Calendar settings');await s.change('Default estimate minutes','77');await s.store.setTheme({preset:'custom',custom});await s.notify();
 assert.equal(s.host.style.getPropertyValue('--cp-accent'),'#f4b860');assert.equal(control(s.root,'Interface theme').value,'custom');assert.equal(control(s.root,'Default estimate minutes').value,'77');
 await s.switchAccount(88);assert.equal(s.host.dataset.theme,'light');await s.click('Calendar settings');assert.equal(control(s.root,'Interface theme').value,'light');
 }finally{s.destroy();}
});

test('a delayed save response cannot roll back a newer theme saved by another page',async()=>{
 const s=await setup({subscribe:true});let release;
 try{
 await s.click('Calendar settings');const write=s.store.setTheme;
 const gate=new Promise(resolve=>{release=resolve;});
 s.store.setTheme=async value=>{await write(value);await gate;};
 await s.change('Interface theme','dark');
 await write({...defaultTheme(),preset:'forest'});await s.notify();
 assert.equal(s.host.dataset.theme,'forest');release();await settle();await settle();
 assert.equal(s.host.dataset.theme,'forest');assert.equal(control(s.root,'Interface theme').value,'forest');assert.equal((await s.store.loadPlanningState()).theme.preset,'forest');
 }finally{release?.();s.destroy();}
});

test('custom colors retain readable semantic messages and charts even when base and brightness differ',()=>{
 for(const [base,background,surface,text] of [['dark','#ffffff','#ffffff','#000000'],['light','#111111','#111111','#ffffff'],['dark','#777777','#777777','#ffffff']]){
  const palette=themePalette({preset:'custom',custom:{base,background,surface,text,accent:'#f4b860'}}).variables;
  for(const kind of ['success','warning','error']){
   assert.ok(contrastRatio(palette[`${kind}-message`],surface)>=4.5,`${kind} message on ${surface}`);
   assert.ok(contrastRatio(palette[`${kind}-on-bg`],background)>=4.5,`${kind} message on page background`);
   assert.ok(contrastRatio(palette[`${kind}-text`],palette[`${kind}-bg`])>=4.5,`${kind} badge`);
  }
  for(let i=1;i<=4;i++)assert.ok(contrastRatio(palette[`chart-${i}`],background)>=3,`chart ${i} on ${background}`);
  assert.ok(contrastRatio(palette['on-accent'],palette.accent)>=4.5);
 }
});

test('a fresh page shows saved dark, custom and system themes throughout slow Canvas loading',async()=>{
 for(const preset of ['dark','custom','system']){
  const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
  await store.setTheme({preset,custom});
  const dom=new JSDOM('<main>Native calendar</main>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div');
  dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const planner=mountPlanner({host,storeFactory:()=>store,loadInitialTheme:()=>plannerStorage.loadInitialTheme(area,'canvas.illinois.edu'),initialMonth:'2026-10',loadSnapshot:async()=>{await gate;return {profile:{id:77},contexts:[],events:[],assignments:[],range:{startDate:'2026-10-01',endDate:'2026-12-31'}};}});
  const opening=planner.show();
  try{
   await settle();assert.ok(host.isConnected);assert.match(host.shadowRoot.textContent,/Loading Canvas/);
   assert.equal(host.dataset.theme,preset);assert.equal(host.style.colorScheme,'dark');assert.equal(host.style.getPropertyValue('--cp-bg'),'#111827');
   release();await opening;assert.equal(host.style.colorScheme,'dark');assert.equal(host.dataset.theme,preset);
  }finally{release();await opening;planner.destroy();dom.window.close();}
 }
});

test('startup appearance reads the last account’s live preferences and supports existing single-account saves',async()=>{
 const area=memoryStorage();
 area.entries['canvas-planner:canvas.illinois.edu:77:theme:v1']={preset:'dark',custom};
 assert.equal((await plannerStorage.loadInitialTheme(area,'canvas.illinois.edu')).preset,'dark');
 assert.equal((await plannerStorage.loadInitialTheme(area,'other.canvas.edu')).preset,'light');
 const other=createPlannerStore(area,'canvas.illinois.edu',88);await other.setTheme({...defaultTheme(),preset:'forest'});
 assert.equal((await plannerStorage.loadInitialTheme(area,'canvas.illinois.edu')).preset,'forest');
 // Returning to an account with no explicit theme must also update the loading appearance.
 const fresh=createPlannerStore(area,'canvas.illinois.edu',99);await fresh.rememberAppearance();
 assert.equal((await plannerStorage.loadInitialTheme(area,'canvas.illinois.edu')).preset,'light');
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState()).theme.preset,'dark');
});

test('closing while startup appearance is being read cannot attach the overlay later',async()=>{
 const dom=new JSDOM('<main/>'),host=dom.window.document.createElement('div');let release,calls=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const planner=mountPlanner({host,storeFactory:()=>({}),initialMonth:'2026-10',loadInitialTheme:async()=>{await gate;return {preset:'dark',custom};},loadSnapshot:async()=>{calls++;return {profile:{id:77},contexts:[],events:[],assignments:[],range:{startDate:'2026-10-01',endDate:'2026-12-31'}};}});
 const opening=planner.show();
 try{await settle();assert.equal(host.isConnected,false);await planner.toggle();release();await opening;assert.equal(host.isConnected,false);assert.equal(calls,0);}
 finally{release();await opening;planner.destroy();dom.window.close();}
});
