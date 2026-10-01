import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {mountPlanner} from '../src/view.js';import {createPlannerStore} from '../src/storage.js';import {memoryStorage} from './helpers/planning.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
async function setup(){const dom=new JSDOM('<main>Native</main>',{url:'https://canvas.illinois.edu/calendar'});const host=dom.window.document.createElement('div');const area=memoryStorage();let id=77,denied=false,failed=false,calls=0;const listeners=new Set();const stores=new Map();const factory=user=>{if(!stores.has(user))stores.set(user,createPlannerStore(area,'canvas.illinois.edu',user));return stores.get(user);};const snapshot=()=>({profile:{id,time_zone:'America/Chicago'},contexts:[{code:'course_456',name:'EPSY 456'}],events:[],assignments:[],range:{startDate:'2026-10-01',endDate:'2026-12-31'},selectedCalendars:['course_456']});const planner=mountPlanner({host,storeFactory:factory,subscribeStorage:(_scope,listener)=>{listeners.add(listener);return()=>listeners.delete(listener);},initialMonth:'2026-10',now:()=>new Date('2026-10-01T12:00:00Z'),loadSnapshot:async()=>{calls++;if(failed)throw new TypeError("Failed to fetch");const s=snapshot();if(denied){const error=new Error('All calendars denied');error.snapshot=s;throw error;}return s;}});await planner.show();const click=async label=>{host.shadowRoot.querySelector(`[aria-label="${label}"]`).click();await settle();};return {dom,host,planner,area,factory,listeners,click,get calls(){return calls;},setId(v){id=v;},deny(){denied=true;},fail(v){failed=v;}};}
test('local settings and cross-page notifications refresh all views without calendar fetches',async()=>{
 const s=await setup();assert.equal(s.listeners.size,1);await s.click('Calendar settings');const field=s.host.shadowRoot.querySelector('[aria-label="Default estimate minutes"]');field.value='45';field.dispatchEvent(new s.dom.window.Event('change'));await s.click('Save planning settings');assert.equal(s.calls,1);assert.equal((await s.factory(77).loadPlanningState()).settings.defaultMinutes,45);
 await s.factory(77).setEstimate('assignment:1',30);for(const listener of s.listeners)listener({});await settle();assert.equal(s.calls,1);await s.planner.toggle();assert.equal(s.listeners.size,0);await s.planner.toggle();assert.equal(s.listeners.size,1);s.planner.destroy();s.dom.window.close();
});
test('denied calendars still expose settings and archived planner without leaking another account settings',async()=>{
 const s=await setup();await s.factory(77).setSettings({...((await s.factory(77).loadPlanningState()).settings),defaultMinutes:120});await s.planner.toggle();s.setId(88);s.deny();await s.planner.toggle();await s.click('Calendar settings');assert.equal(s.host.shadowRoot.querySelector('[aria-label="Default estimate minutes"]').value,'60');await s.click('Planner view');assert.match(s.host.shadowRoot.textContent,/Create a plan/);s.planner.destroy();s.dom.window.close();
});
test('failed local completion retains its previous state and displays a retryable error',async()=>{
 const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'});const host=dom.window.document.createElement('div');const area=memoryStorage();const store=createPlannerStore(area,'canvas.illinois.edu',77);store.setCompleted=async()=>{throw new Error('Storage is full');};const planner=mountPlanner({host,storeFactory:()=>store,initialMonth:'2026-10',loadSnapshot:async()=>({profile:{id:77,time_zone:'America/Chicago'},contexts:[],assignments:[],events:[{id:1,title:'Event',start_at:'2026-10-01T09:00:00-05:00',end_at:'2026-10-01T10:00:00-05:00'}],range:{startDate:'2026-10-01',endDate:'2026-12-31'}})});await planner.show();host.shadowRoot.querySelector('[data-item-key="event:1"]').click();host.shadowRoot.querySelector('[aria-label="Mark complete"]').click();await settle();assert.match(host.shadowRoot.textContent,/Storage is full/);assert.equal(host.shadowRoot.querySelector('[aria-label="Mark complete"]').checked,false);planner.destroy();dom.window.close();
});

test('transient refresh failures expose retry and preserve the unsaved planner draft',async()=>{
 const s=await setup();await s.click('Planner view');await s.click('New plan');const name=s.host.shadowRoot.querySelector('[aria-label="Plan name"]');name.value='Keep my draft';name.dispatchEvent(new s.dom.window.Event('change'));
 s.fail(true);await s.click('Refresh calendar');assert.match(s.host.shadowRoot.textContent,/Failed to fetch/);assert.ok(s.host.shadowRoot.querySelector('[aria-label="Retry loading"]'));s.fail(false);await s.click('Retry loading');assert.equal(s.host.shadowRoot.querySelector('[aria-label="Plan name"]').value,'Keep my draft');assert.match(s.host.shadowRoot.textContent,/Unsaved changes/);s.planner.destroy();s.dom.window.close();
});

test('Tasks and overdue shortcuts share history filtering, save targets and extend ranges',async()=>{
 const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div'),area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 const assignment=(id,title,due)=>({id:`assignment_${id}`,title,context_code:'course_456',assignment:{due_at:due,unlock_at:null,user_submitted:false}});
 let range={startDate:'2026-03-01',endDate:'2027-03-31'},calls=0;
 const planner=mountPlanner({host,storeFactory:()=>createPlannerStore(area,'canvas.illinois.edu',77),initialMonth:'2026-09',now:()=>new Date('2026-09-30T15:00:00Z'),loadSnapshot:async(_month,options)=>{calls++;if(options.range)range=options.range;return {profile:{id:77,time_zone:'America/Chicago'},contexts:[{code:'course_456',name:'EPSY 456'}],selectedCalendars:['course_456'],events:[],assignments:[assignment(1,'Current overdue','2026-09-29T20:00:00-05:00'),assignment(2,'Spring homework','2026-05-01T20:00:00-05:00')],range};}});
 await planner.show();const root=host.shadowRoot;
 const click=async label=>{const n=root.querySelector(`[data-control-id="${label}"]`);assert.ok(n,label);n.click();await settle();};
 const change=async(label,value)=>{const n=root.querySelector(`[data-control-id="${label}"]`);assert.ok(n,label);n.value=value;n.dispatchEvent(new dom.window.Event('change'));await settle();};
 assert.match(root.querySelector('.today-summary').textContent,/1 overdue/);await click('View overdue homework');assert.equal(root.querySelectorAll('[data-task-row]').length,1);
 await click('Open Current overdue');await change('Planned finish date','2026-10-01');await change('Planned finish time','20:00');await click('Save planned finish');assert.equal((await store.loadPlanningState()).targets['assignment:1'].time,'20:00');await click('Close details');
 await change('Tasks range start','2026-01-01');await change('Tasks range end','2027-05-31');await click('Load task date range');assert.equal(range.startDate,'2026-01-01');assert.equal(range.endDate,'2027-05-31');assert.equal(calls,2);
 await click('Select all filtered tasks');await click('Edit selected estimates');await change('Bulk estimate minutes','90');await click('Set selected estimates');assert.equal((await store.loadPlanningState()).estimates['assignment:1'],90);
 await click('Calendar settings');await change('Historical homework mode','off');await click('Save planning settings');await click('Task list view');assert.equal(root.querySelectorAll('[data-task-row]').length,2);
 planner.destroy();dom.window.close();
});

test('saving planning settings keeps the scroll position, open sections and visible success message',async()=>{
 const s=await setup();await s.click('Calendar settings');const root=s.host.shadowRoot;
 const editor=root.querySelector('.planning-settings'),details=editor.querySelector('.schedule-settings');details.open=true;
 const preview=root.querySelector('[data-control-id="Preview title"]');preview.value='Keep this preview';preview.dispatchEvent(new s.dom.window.Event('change'));
 const field=root.querySelector('[data-control-id="Default estimate minutes"]');field.value='45';field.dispatchEvent(new s.dom.window.Event('change'));
 root.querySelector('.content').scrollTop=720;await s.click('Save planning settings');
 assert.equal(root.querySelector('.content').scrollTop,720);assert.equal(root.querySelector('.planning-settings'),editor);assert.equal(root.querySelector('.schedule-settings').open,true);
 assert.match(root.querySelector('.planning-settings [role="status"]').textContent,/Planning settings saved/);assert.equal(root.querySelector('[data-control-id="Preview title"]').value,'Keep this preview');
 assert.equal((await s.factory(77).loadPlanningState()).settings.defaultMinutes,45);
 for(const listener of s.listeners)listener({});await settle();assert.equal(root.querySelector('.content').scrollTop,720);assert.match(root.querySelector('.planning-settings [role="status"]').textContent,/Planning settings saved/);
 s.planner.destroy();s.dom.window.close();
});

test('failed settings save stays in place with the editable draft and error',async()=>{
 const s=await setup();await s.click('Calendar settings');s.factory(77).setSettings=async()=>{throw new Error('Storage unavailable');};const root=s.host.shadowRoot;
 const field=root.querySelector('[data-control-id="Default estimate minutes"]');field.value='45';field.dispatchEvent(new s.dom.window.Event('change'));root.querySelector('.content').scrollTop=720;
 await s.click('Save planning settings');assert.equal(root.querySelector('.content').scrollTop,720);assert.equal(root.querySelector('[data-control-id="Default estimate minutes"]').value,'45');
 assert.match(root.textContent,/Storage unavailable/);assert.doesNotMatch(root.textContent,/Planning settings saved/);assert.equal(root.querySelector('[data-control-id="Save planning settings"]').disabled,false);s.planner.destroy();s.dom.window.close();
});
