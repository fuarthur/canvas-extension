import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createPlannerController} from '../src/planner-view.js';import {createPlanService} from '../src/plan-service.js';import {createPlanClient} from '../src/plan-client.js';import {createPlannerStore} from '../src/storage.js';import {task,planningState,memoryStorage} from './helpers/planning.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
const until=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected UI state did not appear');};
async function setup(items=[task()]){const dom=new JSDOM('<main></main>');const area=memoryStorage();const store=createPlannerStore(area,'canvas.illinois.edu',77);const service=createPlanService({storageArea:area});const client=createPlanClient({userId:77,sendMessage:m=>service.handle(m,{url:'https://canvas.illinois.edu/calendar',tab:{id:1}})});const state=await store.loadPlanningState();const options={document:dom.window.document,planClient:client,items,state,now:()=>new Date('2026-10-01T12:00:00Z'),timeZone:'America/Chicago',loadedRange:{startDate:'2026-10-01',endDate:'2026-12-31'},onOpenItem:()=>{},onComplete:async()=>{},onReloadPlans:()=>store.loadPlanningState()};const controller=createPlannerController(options);const root=controller.render();dom.window.document.querySelector('main').append(root);const click=async label=>{root.querySelector(`[aria-label="${label}"]`).click();await settle();};const change=(label,value,event='change')=>{const n=root.querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new dom.window.Event(event,{bubbles:true}));};return {dom,root,controller,store,options,click,change};}
test('new plans can arrange work, save, copy and reopen without changing the original',async()=>{
 const s=await setup();await s.click('New plan');assert.match(s.root.textContent,/2026-10-28/);await s.click('Arrange Essay');s.change('Work date','2026-10-01');s.change('Work minutes','60');await s.click('Add work block');assert.match(s.root.querySelector('[data-plan-day="2026-10-01"]').textContent,/1h/);await s.click('Save plan');
 let stored=await s.store.loadPlanningState();assert.equal(Object.values(stored.plans).length,1);assert.equal(Object.values(stored.plans)[0].segments.length,1);
 await s.click('Copy plan');s.change('Plan name','Alternative');await s.click('Save plan');stored=await s.store.loadPlanningState();assert.equal(Object.values(stored.plans).length,2);assert.ok(Object.values(stored.plans).some(p=>p.name!=='Alternative'));
 const reopened=createPlannerController({...s.options,state:stored});assert.match(reopened.render().textContent,/Alternative/);s.controller.destroy();reopened.destroy();s.dom.window.close();
});
test('searching and estimate sorting filter real tasks and retain typing focus',async()=>{
 const s=await setup([task(),task({key:'assignment:2',title:'HPDL Exercise',contexts:['Other'],contextCodes:['course_2']})]);await s.click('New plan');
 const search=s.root.querySelector('[aria-label="Search tasks"]');search.focus();s.change('Search tasks',' hpdl ','input');assert.equal(s.root.querySelectorAll('[data-pool-task]').length,1);assert.match(s.root.querySelector('[data-pool-task]').textContent,/HPDL/);assert.equal(s.dom.window.document.activeElement.getAttribute('aria-label'),'Search tasks');
 s.change('Task course','course_456');assert.equal(s.root.querySelectorAll('[data-pool-task]').length,0);s.dom.window.close();
});
test('unsaved exit supports return and discard while failed saves preserve drafts',async()=>{
 const s=await setup();await s.click('New plan');const leaving=s.controller.requestLeave();assert.ok(s.root.querySelector('[role="alertdialog"]'));await s.click('Return to editing');assert.equal(await leaving,false);
 const next=s.controller.requestLeave();await s.click('Discard draft changes');assert.equal(await next,true);
 await s.click('New plan');const failing=createPlannerController({...s.options,planClient:{save:async()=>({ok:false,code:'STORAGE',message:'Storage unavailable'}),remove:async()=>({ok:true})}});const r=failing.render();s.dom.window.document.querySelector('main').append(r);r.querySelector('[aria-label="New plan"]').click();await settle();r.querySelector('[aria-label="Save plan"]').click();await settle();assert.match(r.textContent,/Storage unavailable/);assert.match(r.textContent,/Unsaved/);failing.destroy();s.dom.window.close();
});
test('delete confirms the plan name and the last archive returns to empty state',async()=>{
 const s=await setup();await s.click('New plan');s.change('Plan name','Only plan');await s.click('Save plan');await s.click('Delete plan');assert.match(s.root.querySelector('[role="alertdialog"]').textContent,/Only plan/);await s.click('Confirm delete plan');assert.equal(Object.keys((await s.store.loadPlanningState()).plans).length,0);assert.match(s.root.textContent,/Create a plan/);s.dom.window.close();
});

test('generated previews are separate from drafts until accepted and stale estimates prevent applying',async()=>{
 const {generateSchedule}=await import('../src/scheduler.js');const s=await setup();let delayed,release;const client={run:async input=>{const result=await generateSchedule(input);if(delayed)await new Promise(r=>release=r);return result;},cancel(){},destroy(){}};
 const controller=createPlannerController({...s.options,schedulerClient:client});const root=controller.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Generate balanced plan"]').click();await until(()=>root.querySelector('[aria-label="Accept generated plan"]'));assert.ok(root.querySelector('[aria-label="Accept generated plan"]'));assert.equal(Object.keys((await s.store.loadPlanningState()).plans).length,0);root.querySelector('[aria-label="Accept generated plan"]').click();assert.match(root.querySelector('[data-plan-day="2026-10-01"]').textContent,/min/);
 delayed=true;root.querySelector('[aria-label="Generate balanced plan"]').click();await until(()=>release);const changed=planningState();changed.estimates['assignment:1']=90;controller.setData({state:changed});release();await settle();assert.equal(root.querySelector('[aria-label="Accept generated plan"]'),null);assert.match(root.textContent,/changed/);controller.destroy();s.dom.window.close();
});

test('edits made during a save survive and remain dirty until the next save',async()=>{
 const s=await setup();let resolve;let sent;const client={save:async p=>{sent=structuredClone(p);return new Promise(r=>resolve=r);}};
 const c=createPlannerController({...s.options,planClient:client});const root=c.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Save plan"]').click();
 const name=root.querySelector('[aria-label="Plan name"]');name.value='Edited during save';name.dispatchEvent(new s.dom.window.Event('change'));resolve({ok:true,plan:{...sent,revision:1}});await settle();assert.equal(root.querySelector('[aria-label="Plan name"]').value,'Edited during save');assert.match(root.textContent,/Unsaved changes/);
 root.querySelector('[aria-label="Save plan"]').click();assert.equal(sent.revision,1);assert.equal(sent.name,'Edited during save');resolve({ok:true,plan:{...sent,revision:2}});await settle();assert.match(root.textContent,/Saved plan/);c.destroy();s.dom.window.close();
});
test('newly loaded tasks within the plan range are included before generation',async()=>{
 const s=await setup([]);let received;const c=createPlannerController({...s.options,ensureRange:async()=>({items:[task()],loadedRange:s.options.loadedRange}),schedulerClient:{run:async input=>{received=input;return {status:'cancelled'};},cancel(){},destroy(){}}});const root=c.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Generate balanced plan"]').click();await settle();assert.ok(received.plan.tasks['assignment:1']);c.destroy();s.dom.window.close();
});

test('configuration stays open when editing capacities redraws the plan',async()=>{
 const s=await setup();await s.click('New plan');s.root.querySelector('.plan-configuration').open=true;s.change('Sun capacity minutes',0);assert.equal(s.root.querySelector('.plan-configuration').open,true);s.dom.window.close();
});

function dropTask(s,key,day){
 const target=s.root.querySelector(`[data-plan-day="${day}"]`);const event=new s.dom.window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{getData:type=>type==='application/x-canvas-planner-task'?key:''}});target.dispatchEvent(event);
}

test('dropping a task creates a work block and opens its editor in the target date',async()=>{
 const s=await setup();await s.click('New plan');dropTask(s,'assignment:1','2026-10-02');
 const day=s.root.querySelector('[data-plan-day="2026-10-02"]'),row=day.querySelector('[data-segment-id]');assert.ok(row,'drop should add the block immediately');
 assert.equal(row.querySelector('.arrange-editor [data-control-id="Work date"]').value,'2026-10-02');assert.equal(s.root.querySelector('.planner-workbench > .arrange-editor'),null);
 s.change('Work minutes',30);s.change('Work start time','11:00');await s.click('Update work block');assert.match(s.root.querySelector('[data-plan-day="2026-10-02"]').textContent,/11:00–11:30/);
 await s.click('Save plan');const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments.length,1);assert.equal(saved.segments[0].startAt,'2026-10-02T16:00:00.000Z');s.controller.destroy();s.dom.window.close();
});

test('editing an existing work block expands at that row and does not jump to the top',async()=>{
 const s=await setup();const scroller=s.dom.window.document.createElement('div');scroller.className='content';s.root.replaceWith(scroller);scroller.append(s.root);
 await s.click('New plan');await s.click('Arrange Essay');assert.ok(s.root.querySelector('[data-plan-day="2026-10-01"] .arrange-editor'));await s.click('Add work block');
 const row=s.root.querySelector('[data-segment-id]');scroller.scrollTop=950;await s.click(`Edit block ${row.dataset.segmentId}`);
 assert.equal(scroller.scrollTop,950);assert.ok(s.root.querySelector(`[data-segment-id="${row.dataset.segmentId}"] .arrange-editor`));
 s.change('Work start time','10:00');await s.click('Update work block');assert.equal(scroller.scrollTop,950);assert.match(s.root.querySelector('[data-plan-day="2026-10-01"]').textContent,/10:00–11:00/);s.controller.destroy();s.dom.window.close();
});

test('dropping onto a collapsed date opens it and impossible dates show an inline reason without adding a block',async()=>{
 const s=await setup([task({dueAt:'2026-10-20T23:59:00-05:00',endDay:'2026-10-20'})]);await s.click('New plan');const before=s.root.querySelector('[data-plan-day="2026-10-10"]');before.open=false;
 dropTask(s,'assignment:1','2026-10-10');assert.equal(s.root.querySelector('[data-plan-day="2026-10-10"]').open,true);assert.ok(s.root.querySelector('[data-plan-day="2026-10-10"] [data-segment-id] .arrange-editor'));await s.click('Cancel arranging task');
 await s.click('Save plan');assert.equal(Object.values((await s.store.loadPlanningState()).plans)[0].segments.length,1);s.controller.destroy();s.dom.window.close();
 const denied=await setup();await denied.click('New plan');dropTask(denied,'assignment:1','2026-10-04');const group=denied.root.querySelector('[data-plan-day="2026-10-04"]');assert.equal(group.querySelectorAll('[data-segment-id]').length,0);assert.ok(group.querySelector('.arrange-editor'));assert.match(group.querySelector('.arrange-editor').textContent,/No available work interval/);denied.controller.destroy();denied.dom.window.close();
});

test('drop allocates only the remaining work and redraw does not add it twice',async()=>{
 const s=await setup();await s.click('New plan');await s.click('Arrange Essay');s.change('Work minutes',30);await s.click('Add work block');
 dropTask(s,'assignment:1','2026-10-02');assert.equal(s.root.querySelector('[data-plan-day="2026-10-02"] [data-control-id="Work minutes"]').value,'30');s.controller.render();
 await s.click('Cancel arranging task');await s.click('Save plan');const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments.length,2);assert.equal(saved.segments.reduce((sum,block)=>sum+(Date.parse(block.endAt)-Date.parse(block.startAt))/60000,0),60);s.controller.destroy();s.dom.window.close();
});

test('arranging in an older plan still opens an editor inside its date range',async()=>{
 const s=await setup();await s.click('New plan');s.change('Plan start','2026-09-01');s.change('Plan end','2026-09-30');await s.click('Arrange Essay');
 assert.ok(s.root.querySelector('[data-plan-day="2026-09-30"] .arrange-editor'));assert.equal(s.root.querySelector('[data-control-id="Work date"]').value,'2026-09-30');s.controller.destroy();s.dom.window.close();
});

test('a verified schedule remains usable when only balancing reaches its time limit',async()=>{
 const {generateSchedule}=await import('../src/scheduler.js');const s=await setup();let tick=0;
 const schedulerClient={run:async input=>generateSchedule(input,{clock:()=>tick,budgetMs:50,yieldControl:async()=>{},onProgress:progress=>{if(progress.phase==='balancing')tick=100;}}),cancel(){},destroy(){}};
 const controller=createPlannerController({...s.options,schedulerClient});const root=controller.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Generate balanced plan"]').click();await until(()=>root.querySelector('.generated-preview'));
 assert.equal(root.querySelector('.generated-preview h3').textContent,'Generated plan preview');assert.match(root.querySelector('.generated-preview').textContent,/schedule passed all checks/);assert.doesNotMatch(root.querySelector('.generated-preview').textContent,/not a fully verified success/);assert.ok(root.querySelector('[aria-label="Accept generated plan"]'));root.querySelector('[aria-label="Accept generated plan"]').click();assert.ok(root.querySelector('[data-segment-id]'));controller.destroy();s.controller.destroy();s.dom.window.close();
});
