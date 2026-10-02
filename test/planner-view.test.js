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
async function savedPlansWithArchivedEditor(){
 const s=await setup([]);await s.click('New plan');s.change('Plan name','Keep this plan');await s.click('Save plan');
 const kept=structuredClone(Object.values((await s.store.loadPlanningState()).plans)[0]);
 s.controller.setData({items:[task()]});await s.click('New plan');s.change('Plan name','Delete this plan');await s.click('Arrange Essay');await s.click('Add work block');await s.click('Save plan');
 const removed=Object.values((await s.store.loadPlanningState()).plans).find(p=>p.id!==kept.id);
 s.controller.setData({items:[]});await s.click(`Edit block ${removed.segments[0].id}`);
 return {...s,kept,removed};
}
test('deleting a plan closes its archived-task editor and preserves the remaining archive',async()=>{
 const s=await savedPlansWithArchivedEditor();
 try{
  assert.ok(s.root.querySelector('.arrange-editor'));await s.click('Delete plan');await s.click('Confirm delete plan');
  assert.equal(s.root.querySelector('[data-control-id="Plan name"]').value,'Keep this plan');assert.equal(s.root.querySelector('.arrange-editor'),null);
  assert.ok(s.root.querySelector('.task-pool'));assert.ok(s.root.querySelector('.week-scroll'));
  const plans=(await s.store.loadPlanningState()).plans;assert.deepEqual(plans,{[s.kept.id]:s.kept});
 }finally{s.controller.destroy();s.dom.window.close();}
});
test('failed plan deletion retains the active plan and unfinished archived-task editor',async()=>{
 const s=await savedPlansWithArchivedEditor();
 try{
  s.change('Work start time','12:15');s.options.planClient.remove=async()=>({ok:false,message:'Could not delete this plan.'});
  await s.click('Delete plan');await s.click('Confirm delete plan');
  assert.equal(s.root.querySelector('[data-control-id="Plan name"]').value,'Delete this plan');assert.ok(s.root.querySelector('.arrange-editor'));
  assert.equal(s.root.querySelector('[data-control-id="Work start time"]').value,'12:15');assert.match(s.root.textContent,/Could not delete this plan/);
  const plans=(await s.store.loadPlanningState()).plans;assert.deepEqual(plans,{[s.kept.id]:s.kept,[s.removed.id]:s.removed});
 }finally{s.controller.destroy();s.dom.window.close();}
});

test('generated previews are separate from drafts until accepted and stale estimates prevent applying',async()=>{
 const {generateSchedule}=await import('../src/scheduler.js');const s=await setup();let delayed,release;const client={run:async input=>{const result=await generateSchedule(input);if(delayed)await new Promise(r=>release=r);return result;},cancel(){},destroy(){}};
 const controller=createPlannerController({...s.options,schedulerClient:client});const root=controller.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Generate balanced plan"]').click();await until(()=>root.querySelector('[aria-label="Accept generated plan"]'));assert.ok(root.querySelector('[aria-label="Accept generated plan"]'));assert.equal(Object.keys((await s.store.loadPlanningState()).plans).length,0);root.querySelector('[aria-label="Accept generated plan"]').click();assert.match(root.querySelector('[data-plan-day="2026-10-01"]').textContent,/1h/);
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
test('per-plan buffer edits survive saving and reopening without changing defaults',async()=>{
 const s=await setup();await s.click('New plan');
 assert.equal(s.root.querySelector('[data-control-id="Buffer between work blocks (minutes)"]').value,'15');
 s.root.querySelector('.plan-configuration').open=true;s.change('Buffer between work blocks (minutes)','25');
 assert.equal(s.root.querySelector('.plan-configuration').open,true);await s.click('Save plan');
 const stored=await s.store.loadPlanningState();assert.equal(Object.values(stored.plans)[0].schedule.bufferMinutes,25);assert.equal(stored.settings.schedule.bufferMinutes,15);
 const reopened=createPlannerController({...s.options,state:stored});assert.equal(reopened.render().querySelector('[data-control-id="Buffer between work blocks (minutes)"]').value,'25');
 reopened.destroy();s.controller.destroy();s.dom.window.close();
});

function dropTask(s,key,day){
 for(let i=0;i<30&&!s.root.querySelector(`[data-plan-day="${day}"]`);i++){
  const visible=s.root.querySelector('[data-plan-day]').dataset.planDay;s.root.querySelector(`[aria-label="${day>visible?'Next plan week':'Previous plan week'}"]`).click();
 }
 dropAt(s,day,'09:00',{'application/x-canvas-planner-task':key});
}

test('dropping a task creates a work block and opens its editor in the target date',async()=>{
 const s=await setup();await s.click('New plan');dropTask(s,'assignment:1','2026-10-02');
 const day=s.root.querySelector('[data-plan-day="2026-10-02"]'),row=day.querySelector('[data-segment-id]');assert.ok(row,'drop should add the block immediately');
 assert.equal(s.root.querySelector('.week-selected-editor [data-control-id="Work date"]').value,'2026-10-02');assert.equal(s.root.querySelector('.planner-workbench > .arrange-editor'),null);
 s.change('Work minutes',60);s.change('Work start time','11:00');await s.click('Update work block');assert.match(s.root.querySelector('[data-plan-day="2026-10-02"]').textContent,/11:00–12:00/);
 await s.click('Save plan');const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments.length,1);assert.equal(saved.segments[0].startAt,'2026-10-02T16:00:00.000Z');s.controller.destroy();s.dom.window.close();
});

test('editing an existing work block opens beside the timeline and does not jump to the top',async()=>{
 const s=await setup();const scroller=s.dom.window.document.createElement('div');scroller.className='content';s.root.replaceWith(scroller);scroller.append(s.root);
 await s.click('New plan');await s.click('Arrange Essay');assert.ok(s.root.querySelector('.week-selected-editor'));await s.click('Add work block');
 const row=s.root.querySelector('[data-segment-id]');scroller.scrollTop=950;await s.click(`Edit block ${row.dataset.segmentId}`);
 assert.equal(scroller.scrollTop,950);assert.equal(s.root.querySelector('.week-selected-editor [data-control-id="Work date"]').value,'2026-10-01');
 s.change('Work start time','10:00');await s.click('Update work block');assert.equal(scroller.scrollTop,950);assert.match(s.root.querySelector('[data-plan-day="2026-10-01"]').textContent,/10:00–11:00/);s.controller.destroy();s.dom.window.close();
});

test('dropping in a later week opens the editor and impossible dates show an inline reason without adding a block',async()=>{
 const s=await setup([task({dueAt:'2026-10-20T23:59:00-05:00',endDay:'2026-10-20'})]);await s.click('New plan');
 dropTask(s,'assignment:1','2026-10-10');assert.ok(s.root.querySelector('[data-plan-day="2026-10-10"] [data-segment-id]'));assert.ok(s.root.querySelector('.week-selected-editor'));await s.click('Cancel arranging task');
 await s.click('Save plan');assert.equal(Object.values((await s.store.loadPlanningState()).plans)[0].segments.length,1);s.controller.destroy();s.dom.window.close();
 const denied=await setup();await denied.click('New plan');dropTask(denied,'assignment:1','2026-10-04');const group=denied.root.querySelector('[data-plan-day="2026-10-04"]');assert.equal(group.querySelectorAll('[data-segment-id]').length,0);assert.match(denied.root.querySelector('.week-selected-editor').textContent,/No available work interval/);denied.controller.destroy();denied.dom.window.close();
});

test('drop allocates only the remaining work and redraw does not add it twice',async()=>{
 const s=await setup();s.controller.setData({state:{...s.options.state,estimates:{'assignment:1':90},allowSplitting:{'assignment:1':true}}});await s.click('New plan');await s.click('Arrange Essay');s.change('Work minutes',30);await s.click('Add work block');
 dropTask(s,'assignment:1','2026-10-02');assert.equal(s.root.querySelector('.week-selected-editor [data-control-id="Work minutes"]').value,'60');s.controller.render();
 await s.click('Cancel arranging task');await s.click('Save plan');const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments.length,2);assert.equal(saved.segments.reduce((sum,block)=>sum+(Date.parse(block.endAt)-Date.parse(block.startAt))/60000,0),90);s.controller.destroy();s.dom.window.close();
});

test('arranging in an older plan still opens an editor inside its date range',async()=>{
 const s=await setup();await s.click('New plan');s.change('Plan start','2026-09-01');s.change('Plan end','2026-09-30');await s.click('Arrange Essay');
 assert.ok(s.root.querySelector('[data-plan-day="2026-09-30"]'));assert.equal(s.root.querySelector('[data-control-id="Work date"]').value,'2026-09-30');s.controller.destroy();s.dom.window.close();
});

test('a verified schedule remains usable when only balancing reaches its time limit',async()=>{
 const {generateSchedule}=await import('../src/scheduler.js');const event=task({key:'event:1',type:'event',endDay:'2026-10-01',fixedStartAt:'2026-10-01T09:00:00-05:00',fixedEndAt:'2026-10-01T10:00:00-05:00'});const s=await setup([task(),event]);let tick=0;
 const schedulerClient={run:async input=>generateSchedule(input,{clock:()=>tick,budgetMs:50,yieldControl:async()=>{},onProgress:progress=>{if(progress.phase==='balancing')tick=100;}}),cancel(){},destroy(){}};
 const controller=createPlannerController({...s.options,schedulerClient});const root=controller.render();s.dom.window.document.querySelector('main').append(root);root.querySelector('[aria-label="New plan"]').click();await settle();root.querySelector('[aria-label="Generate balanced plan"]').click();await until(()=>root.querySelector('.generated-preview'));
 assert.equal(root.querySelector('.generated-preview h3').textContent,'Generated plan preview');assert.match(root.querySelector('.generated-preview').textContent,/schedule passed all checks/);assert.doesNotMatch(root.querySelector('.generated-preview').textContent,/not a fully verified success/);assert.ok(root.querySelector('[aria-label="Accept generated plan"]'));root.querySelector('[aria-label="Accept generated plan"]').click();assert.ok(root.querySelector('[data-segment-id]'));controller.destroy();s.controller.destroy();s.dom.window.close();
});

test('daily arrangements precede collapsed analytics and secondary plan actions stay reachable',async()=>{
 const s=await setup();await s.click('New plan');const analytics=s.root.querySelector('.plan-analytics');assert.ok(analytics);assert.equal(analytics.open,false);
 assert.ok(s.root.querySelector('.plan-columns').compareDocumentPosition(analytics)&s.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
 const actions=s.root.querySelector('.plan-more-actions');assert.ok(actions);assert.equal(actions.open,false);actions.open=true;
 await s.click('Copy plan');assert.match(s.root.querySelector('[data-control-id="Plan name"]').value,/copy/);
 s.root.querySelector('.plan-more-actions').open=true;await s.click('Delete plan');assert.ok(s.root.querySelector('[role="alertdialog"]'));await s.click('Cancel delete plan');
 s.root.querySelector('.plan-analytics').open=true;s.root.querySelector('[data-chart-day="2026-10-10"]').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.ok(s.root.querySelector('[data-plan-day="2026-10-10"]'));s.controller.destroy();s.dom.window.close();
});
test('preview chart switching never alters a draft until acceptance and explicit saving',async()=>{
 const {generateSchedule}=await import('../src/scheduler.js');const s=await setup();
 const c=createPlannerController({...s.options,schedulerClient:{run:generateSchedule,cancel(){},destroy(){}}});const root=c.render();s.dom.window.document.querySelector('main').append(root);
 root.querySelector('[data-control-id="New plan"]').click();await settle();root.querySelector('[data-control-id="Generate balanced plan"]').click();await until(()=>root.querySelector('.generated-preview'));
 const preview=root.querySelector('.generated-preview');assert.equal(preview.querySelectorAll('.line-chart').length,1);
 const select=preview.querySelector('[data-control-id="Preview chart"]');assert.ok(select);select.value='current';select.dispatchEvent(new s.dom.window.Event('change'));
 assert.match(root.querySelector('.generated-preview .chart-legend').textContent,/Current plan/);assert.equal(root.querySelectorAll('[data-segment-id]').length,0);
 root.querySelector('[data-control-id="Preview chart"]').value='generated';root.querySelector('[data-control-id="Preview chart"]').dispatchEvent(new s.dom.window.Event('change'));
 root.querySelector('[data-control-id="Accept generated plan"]').click();assert.ok(root.querySelector('[data-segment-id]'));assert.equal(Object.keys((await s.store.loadPlanningState()).plans).length,0);
 root.querySelector('[data-control-id="Save plan"]').click();await settle();assert.equal(Object.keys((await s.store.loadPlanningState()).plans).length,1);c.destroy();s.controller.destroy();s.dom.window.close();
});

test('a plan has an editable inclusive non-splitting threshold that survives saving',async()=>{
 const s=await setup();await s.click('New plan');
 const threshold=s.root.querySelector('[data-control-id="Do not split tasks at or below (minutes)"]');assert.ok(threshold);assert.equal(threshold.value,'60');
 s.change('Do not split tasks at or below (minutes)','90');await s.click('Save plan');
 assert.equal(Object.values((await s.store.loadPlanningState()).plans)[0].nonSplitThresholdMinutes,90);
 s.controller.destroy();s.dom.window.close();
});
test('deadline-buffer badges explain the remaining time without declaring a conflict',async()=>{
 const s=await setup();await s.click('New plan');await s.click('Arrange Essay');s.change('Work date','2026-10-03');await s.click('Add work block');
 const badge=s.root.querySelector('[data-segment-id] .urgency-tag');assert.ok(badge);
 assert.match(badge.textContent,/13h 59m buffer/);assert.match(badge.title,/recommended 24 hours/);
 assert.match(badge.getAttribute('aria-label'),/buffer warning/);
 assert.match(s.root.querySelector('.plan-status').textContent,/deadline checks passed/);
 s.controller.destroy();s.dom.window.close();
});

test('fully allocated tasks move into a collapsed section behind unallocated work',async()=>{
 const second=task({key:'assignment:2',title:'Next task'});const s=await setup([task(),second]);
 await s.click('New plan');await s.click('Arrange Essay');await s.click('Add work block');
 const pool=s.root.querySelector('.task-pool'),scheduled=pool.querySelector('.scheduled-task-pool');assert.ok(scheduled);assert.equal(scheduled.open,false);
 assert.ok(pool.querySelector(':scope > [data-pool-task="assignment:2"]'));assert.equal(pool.querySelector(':scope > [data-pool-task="assignment:1"]'),null);
 assert.ok(scheduled.querySelector('[data-pool-task="assignment:1"]'));assert.match(scheduled.querySelector('summary').textContent,/Scheduled tasks \(1\)/);
 scheduled.open=true;s.controller.render();assert.equal(s.root.querySelector('.scheduled-task-pool').open,true);
 s.controller.destroy();s.dom.window.close();
});
test('only a fully allocated split task moves away and removing one block restores it',async()=>{
 const s=await setup();s.controller.setData({state:{...s.options.state,estimates:{'assignment:1':90},allowSplitting:{'assignment:1':true}}});
 await s.click('New plan');await s.click('Arrange Essay');s.change('Work minutes',30);await s.click('Add work block');
 assert.ok(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'));assert.equal(s.root.querySelector('.scheduled-task-pool'),null);
 dropTask(s,'assignment:1','2026-10-02');await s.click('Cancel arranging task');
 assert.equal(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'),null);assert.ok(s.root.querySelector('.scheduled-task-pool [data-pool-task="assignment:1"]'));
 const last=s.root.querySelector('[data-plan-day="2026-10-02"] [data-segment-id]').dataset.segmentId;await s.click(`Remove block ${last}`);
 assert.ok(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'));assert.equal(s.root.querySelector('.scheduled-task-pool'),null);assert.match(s.root.querySelector('[data-pool-task="assignment:1"]').textContent,/30\/90 min arranged/);
 s.controller.destroy();s.dom.window.close();
});
test('removing a whole task from the right restores it to the active left list',async()=>{
 const s=await setup();await s.click('New plan');dropTask(s,'assignment:1','2026-10-01');await s.click('Cancel arranging task');
 assert.equal(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'),null);
 const id=s.root.querySelector('[data-segment-id]').dataset.segmentId;await s.click(`Remove block ${id}`);
 assert.ok(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'));assert.equal(s.root.querySelector('.scheduled-task-pool'),null);
 s.controller.destroy();s.dom.window.close();
});
test('scheduled filter explicitly shows allocated tasks while search and course grouping still work',async()=>{
 const second=task({key:'assignment:2',title:'Next task',contexts:['Other'],contextCodes:['course_2']});const s=await setup([task(),second]);
 await s.click('New plan');dropTask(s,'assignment:1','2026-10-01');await s.click('Cancel arranging task');s.change('Task arrangement','full');
 assert.ok(s.root.querySelector('.task-pool > [data-pool-task="assignment:1"]'));assert.equal(s.root.querySelector('.scheduled-task-pool'),null);assert.equal(s.root.querySelector('[data-pool-task="assignment:2"]'),null);
 s.change('Task arrangement','all');s.change('Search tasks','Next','input');assert.equal(s.root.querySelector('.scheduled-task-pool'),null);assert.equal(s.root.querySelectorAll('[data-pool-task]').length,1);
 s.change('Search tasks','','input');const group=s.root.querySelector('[data-control-id="Group tasks by course"]');group.checked=true;group.dispatchEvent(new s.dom.window.Event('change'));
 assert.equal(s.root.querySelector('.task-pool > h4').textContent,'Other');assert.equal(s.root.querySelector('.scheduled-task-pool h4').textContent,'EPSY 456');
 s.change('Task course','course_2');assert.equal(s.root.querySelector('.scheduled-task-pool'),null);assert.equal(s.root.querySelectorAll('[data-pool-task]').length,1);
 s.controller.destroy();s.dom.window.close();
});

function dropAt(s,day,time,values){
 const target=s.root.querySelector(`[data-plan-day="${day}"] [data-drop-time="${time}"]`);assert.ok(target,`${day} ${time}`);
 const event=new s.dom.window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{getData:type=>values[type]||''}});target.dispatchEvent(event);
}
test('task pages limit the active list and search covers tasks on other pages',async()=>{
 const s=await setup(Array.from({length:23},(_,i)=>task({key:`assignment:${i}`,title:`Task ${String(i).padStart(2,'0')}`})));await s.click('New plan');
 assert.equal(s.root.querySelectorAll('.task-pool > [data-pool-task]').length,10);
 await s.click('Next tasks page');assert.equal(s.root.querySelector('.task-pool > [data-pool-task]').dataset.poolTask,'assignment:10');
 const pool=s.root.querySelector('.task-pool');pool.scrollTop=130;s.controller.render();assert.equal(s.root.querySelector('.task-pool').scrollTop,130);
 s.change('Search tasks','Task 22','input');assert.equal(s.root.querySelectorAll('[data-pool-task]').length,1);assert.equal(s.root.querySelector('[data-pool-task]').dataset.poolTask,'assignment:22');
 s.controller.destroy();s.dom.window.close();
});
test('weekly timeline shows seven dates and 24 hours with week navigation inside the plan',async()=>{
 const s=await setup();await s.click('New plan');assert.equal(s.root.querySelectorAll('[data-plan-day]').length,7);
 assert.ok(s.root.querySelector('[data-hour="0"]'));assert.ok(s.root.querySelector('[data-hour="23"]'));
 assert.ok(s.root.querySelector('[data-plan-day="2026-10-01"]'));await s.click('Next plan week');assert.ok(s.root.querySelector('[data-plan-day="2026-10-08"]'));assert.equal(s.root.querySelector('[data-plan-day="2026-10-01"]'),null);
 await s.click('Current plan week');assert.ok(s.root.querySelector('[data-plan-day="2026-10-01"]'));assert.equal(s.root.querySelector('.week-scroll').scrollTop,9*96);
 s.controller.destroy();s.dom.window.close();
});
test('dropping at a time allocates an intact block and moving it keeps its duration and identity',async()=>{
 const s=await setup();await s.click('New plan');dropAt(s,'2026-10-01','10:15',{'application/x-canvas-planner-task':'assignment:1'});await s.click('Cancel arranging task');
 const id=s.root.querySelector('[data-segment-id]').dataset.segmentId;
 dropAt(s,'2026-10-02','11:30',{'application/x-canvas-planner-segment':id});await s.click('Save plan');
 const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments.length,1);assert.equal(saved.segments[0].id,id);assert.equal(saved.segments[0].startAt,'2026-10-02T16:30:00.000Z');assert.equal(saved.segments[0].endAt,'2026-10-02T17:30:00.000Z');
 assert.ok(s.root.querySelector(`[data-plan-day="2026-10-02"] [data-segment-id="${id}"]`));s.controller.destroy();s.dom.window.close();
});
test('invalid timeline moves preserve the previous block and locked blocks cannot move',async()=>{
 const s=await setup([task({unlockAt:'2026-10-02T10:00:00-05:00'})]);await s.click('New plan');dropAt(s,'2026-10-02','10:00',{'application/x-canvas-planner-task':'assignment:1'});await s.click('Cancel arranging task');
 const id=s.root.querySelector('[data-segment-id]').dataset.segmentId;
 dropAt(s,'2026-10-01','10:00',{'application/x-canvas-planner-segment':id});assert.ok(s.root.querySelector(`[data-plan-day="2026-10-02"] [data-segment-id="${id}"]`));assert.ok(s.root.querySelector('.week-drop-notice'));
 await s.click(`Lock block ${id}`);assert.equal(s.root.querySelector('[data-segment-id]').draggable,false);dropAt(s,'2026-10-03','10:00',{'application/x-canvas-planner-segment':id});await s.click('Save plan');
 const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments[0].startAt,'2026-10-02T15:00:00.000Z');assert.equal(saved.segments[0].locked,true);s.controller.destroy();s.dom.window.close();
});
test('fixed calendar events appear at their true times and reject overlapping drops',async()=>{
 const event=task({key:'event:1',type:'event',title:'Class',fixedStartAt:'2026-10-01T10:00:00-05:00',fixedEndAt:'2026-10-01T11:00:00-05:00',startDay:'2026-10-01',endDay:'2026-10-01'});
 const s=await setup([task(),event]);await s.click('New plan');const block=s.root.querySelector('[data-fixed-event="event:1"]');assert.ok(block);assert.equal(block.style.top,'960px');assert.equal(block.style.height,'96px');assert.equal(block.draggable,false);
 dropAt(s,'2026-10-01','10:15',{'application/x-canvas-planner-task':'assignment:1'});assert.equal(s.root.querySelectorAll('[data-segment-id]').length,0);assert.match(s.root.querySelector('.arrange-editor').textContent,/No available work interval/);s.controller.destroy();s.dom.window.close();
});
test('week navigation preserves unfinished block editor values and timeline scroll',async()=>{
 const s=await setup();await s.click('New plan');await s.click('Arrange Essay');s.change('Work start time','12:15');const scroll=s.root.querySelector('.week-scroll');scroll.scrollTop=1150;
 await s.click('Next plan week');assert.equal(s.root.querySelector('[data-control-id="Work start time"]').value,'12:15');assert.equal(s.root.querySelector('.week-scroll').scrollTop,1150);
 await s.click('Previous plan week');assert.equal(s.root.querySelector('[data-control-id="Work start time"]').value,'12:15');s.controller.destroy();s.dom.window.close();
});
test('each block action menu retains only its own open state after redraw',async()=>{
 const s=await setup([task(),task({key:'assignment:2',title:'Second'})]);await s.click('New plan');dropAt(s,'2026-10-01','09:00',{'application/x-canvas-planner-task':'assignment:1'});await s.click('Cancel arranging task');dropAt(s,'2026-10-02','09:00',{'application/x-canvas-planner-task':'assignment:2'});await s.click('Cancel arranging task');
 const menus=s.root.querySelectorAll('.week-block-actions');menus[1].open=true;s.controller.render();const after=s.root.querySelectorAll('.week-block-actions');assert.equal(after[0].open,false);assert.equal(after[1].open,true);s.controller.destroy();s.dom.window.close();
});
test('adjacent short tasks remain separately clickable instead of covering each other',async()=>{
 const s=await setup([task(),task({key:'assignment:2',title:'Second'})]);s.controller.setData({state:{...s.options.state,estimates:{'assignment:1':5,'assignment:2':5}}});await s.click('New plan');
 await s.click('Arrange Essay');s.change('Work start time','09:00');await s.click('Add work block');await s.click('Arrange Second');s.change('Work start time','09:05');await s.click('Add work block');
 const rows=s.root.querySelectorAll('[data-segment-id]');assert.equal(rows.length,2);assert.notEqual(rows[0].style.left,rows[1].style.left);assert.equal(rows[0].style.width,'calc(50% - 4px)');s.controller.destroy();s.dom.window.close();
});
test('an overnight conflicting draft keeps visible portions on both days',async()=>{
 const s=await setup();await s.click('New plan');await s.click('Arrange Essay');s.change('Work start time','23:30');await s.click('Add work block');await s.click('Keep as conflicting draft');
 assert.ok(s.root.querySelector('[data-plan-day="2026-10-01"] [data-segment-id]'));const next=s.root.querySelector('[data-plan-day="2026-10-02"] [data-segment-id]');assert.ok(next);assert.equal(next.style.top,'0px');assert.equal(next.style.height,'48px');s.controller.destroy();s.dom.window.close();
});
test('opening a saved plan scrolls to working hours after the detached view is mounted',async()=>{
 const s=await setup();await s.click('New plan');await s.click('Save plan');const state=await s.store.loadPlanningState();
 // Browsers discard scroll offsets on a detached element with no layout box.
 const offsets=new WeakMap();Object.defineProperty(s.dom.window.HTMLElement.prototype,'scrollTop',{configurable:true,get(){return offsets.get(this)||0;},set(value){if(this.isConnected)offsets.set(this,value);}});
 const controller=createPlannerController({...s.options,state});const root=controller.render();s.dom.window.document.querySelector('main').append(root);await settle();assert.equal(root.querySelector('.week-scroll').scrollTop,864);controller.destroy();s.controller.destroy();s.dom.window.close();
});
test('drop coordinates account for timeline scrolling and snap to the nearest quarter hour',async()=>{
 const s=await setup();await s.click('New plan');const lane=s.root.querySelector('[data-plan-day="2026-10-01"]');lane.getBoundingClientRect=()=>({top:-500,height:2304});
 const event=new s.dom.window.MouseEvent('drop',{bubbles:true,cancelable:true,clientY:818});Object.defineProperty(event,'dataTransfer',{value:{getData:type=>type==='application/x-canvas-planner-task'?'assignment:1':''}});lane.dispatchEvent(event);await s.click('Cancel arranging task');await s.click('Save plan');
 const saved=Object.values((await s.store.loadPlanningState()).plans)[0];assert.equal(saved.segments[0].startAt,'2026-10-01T18:45:00.000Z');assert.equal(saved.segments[0].endAt,'2026-10-01T19:45:00.000Z');s.controller.destroy();s.dom.window.close();
});
test('fully allocating the last task on the final page clamps pagination to remaining tasks',async()=>{
 const s=await setup(Array.from({length:21},(_,i)=>task({key:`assignment:${i}`,title:`Task ${String(i).padStart(2,'0')}`})));await s.click('New plan');await s.click('Next tasks page');await s.click('Next tasks page');await s.click('Arrange Task 20');await s.click('Add work block');
 assert.equal(s.root.querySelectorAll('.task-pool > [data-pool-task]').length,10);assert.ok(s.root.querySelector('.scheduled-task-pool [data-pool-task="assignment:20"]'));assert.equal(s.root.querySelector('[aria-label="Next tasks page"]').disabled,true);s.controller.destroy();s.dom.window.close();
});
