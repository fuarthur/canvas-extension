import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {snapshotTask,createPlan,taskUrgency} from '../src/plans.js';
import {defaultSettings,validateSettings} from '../src/planning-settings.js';
import {createPlannerStore,isPlanRecord} from '../src/storage.js';
import {generateSchedule} from '../src/scheduler.js';
import {suggestSegment,validatePlan} from '../src/plan-validation.js';
import {renderPlanningSettings} from '../src/settings-view.js';
import {plan,task,planningState,memoryStorage,settings} from './helpers/planning.js';
const facts={items:[task()],completed:{},now:'2026-10-01T12:00:00Z',loadedRange:{startDate:'2026-10-01',endDate:'2026-10-03'}};
const duration=s=>(Date.parse(s.endAt)-Date.parse(s.startAt))/60000;
const block=(minutes=30,patch={})=>({id:'s1',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00-05:00',endAt:new Date(Date.parse('2026-10-01T09:00:00-05:00')+minutes*60000).toISOString(),locked:false,order:0,...patch});

test('tasks require explicit permission to split and old opt-out flags grant no permission',()=>{
 const item=task();const state=planningState();
 assert.equal(snapshotTask(item,state).singleSession,true);
 assert.equal(snapshotTask(item,state).allowSplitting,false);
 state.allowSplitting={[item.key]:true};
 assert.equal(snapshotTask(item,state).allowSplitting,true);
 assert.equal(snapshotTask(item,state).singleSession,false);
});
test('the non-splitting threshold defaults to 60 and old settings gain that default',()=>{
 assert.equal(defaultSettings().nonSplitThresholdMinutes,60);
 assert.equal(validateSettings(settings()).value.nonSplitThresholdMinutes,60);
 for(const threshold of [0,1.5,1441])assert.equal(validateSettings(settings({nonSplitThresholdMinutes:threshold})).value,null);
 const p=createPlan({id:'new',name:'New',items:[task()],state:planningState({settings:settings({nonSplitThresholdMinutes:90})}),startDate:'2026-10-01',endDate:'2026-10-03',timeZone:'America/Chicago',now:facts.now});
 assert.equal(p.nonSplitThresholdMinutes,90);
});
test('splitting permission persists per account independently of legacy defaults',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setSingleSession('assignment:1',true);
 await store.setAllowSplitting('assignment:1',true);
 assert.equal((await store.loadPlanningState()).allowSplitting['assignment:1'],true);
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).allowSplitting['assignment:1'],undefined);
 await store.setAllowSplitting('assignment:1',false);
 assert.equal((await store.loadPlanningState()).allowSplitting['assignment:1'],undefined);
});
test('balancing ordinary 30-minute tasks never fragments them even in legacy plans',async()=>{
 const items=Array.from({length:8},(_,i)=>task({key:`assignment:${i+1}`,endDay:`2026-10-0${Math.min(7,i+2)}`,dueAt:`2026-10-0${Math.min(7,i+2)}T23:59:00-05:00`}));
 const p=plan({range:{startDate:'2026-10-01',endDate:'2026-10-07'},tasks:Object.fromEntries(items.map(item=>[item.key,{...item,estimateMinutes:30,singleSession:false,completedAtSave:false}]))});
 const result=await generateSchedule({plan:p,...facts,items,loadedRange:p.range});
 assert.equal(result.status,'complete');assert.equal(result.segments.length,8);
 assert.ok(result.segments.every(s=>duration(s)===30));
});
test('even a long task with permission remains continuous when a full slot fits',async()=>{
 const p=plan();Object.assign(p.tasks['assignment:1'],{estimateMinutes:120,allowSplitting:true});
 const result=await generateSchedule({plan:p,...facts});
 assert.equal(result.status,'complete');assert.equal(result.segments.length,1);assert.equal(duration(result.segments[0]),120);
});
test('long tasks can split only when explicitly allowed and needed to fit',async()=>{
 const p=plan();p.tasks['assignment:1'].estimateMinutes=120;p.schedule.weekdays.forEach(d=>d.maxMinutes=60);
 let result=await generateSchedule({plan:p,...facts});
 assert.equal(result.status,'partial');assert.equal(result.segments.length,0);assert.equal(result.validation.unassigned['assignment:1'],120);
 p.tasks['assignment:1'].allowSplitting=true;
 result=await generateSchedule({plan:p,...facts});
 assert.equal(result.status,'complete');assert.equal(result.segments.reduce((n,s)=>n+duration(s),0),120);
 assert.equal(result.segments.length,2);
});
test('permission does not bypass the inclusive threshold and changing it changes feasibility',async()=>{
 const p=plan({nonSplitThresholdMinutes:60});Object.assign(p.tasks['assignment:1'],{estimateMinutes:60,allowSplitting:true});p.schedule.weekdays.forEach(d=>d.maxMinutes=30);
 let result=await generateSchedule({plan:p,...facts});assert.equal(result.status,'partial');assert.equal(result.segments.length,0);
 p.nonSplitThresholdMinutes=30;
 result=await generateSchedule({plan:p,...facts});assert.equal(result.status,'complete');assert.equal(result.segments.length,2);
});
test('manual arrangements and locked work cannot partially allocate an indivisible task',async()=>{
 const p=plan();
 assert.equal(suggestSegment(p,'assignment:1',{day:'2026-10-01',minutes:30},facts).segment,null);
 assert.equal(suggestSegment(p,'assignment:1',{day:'2026-10-01',minutes:60},facts).issues.length,0);
 assert.ok(validatePlan({...p,segments:[block()]},facts).issues.some(i=>i.code==='SINGLE_SESSION'));
 const result=await generateSchedule({plan:{...p,segments:[block(30,{locked:true})]},...facts});
 assert.equal(result.status,'partial');assert.equal(result.segments.length,1);assert.equal(result.segments[0].locked,true);
});
test('legacy split archives remain readable but regeneration returns a whole task',async()=>{
 const p=plan({segments:[block(30),block(30,{id:'s2',startAt:'2026-10-02T09:00:00-05:00',endAt:'2026-10-02T09:30:00-05:00'})]});
 assert.equal(isPlanRecord(p),true);assert.equal(validatePlan(p,facts).complete,false);
 const result=await generateSchedule({plan:p,...facts});assert.equal(result.status,'complete');assert.equal(result.segments.length,1);
 assert.equal(p.segments.length,2);
});
test('the threshold can be edited and saved in settings with validation',async()=>{
 const dom=new JSDOM('');let saved;
 const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async value=>{saved=value;}});
 const input=root.querySelector('[data-control-id="Do not split tasks at or below (minutes)"]');assert.ok(input);assert.equal(input.value,'60');
 input.value='0';input.dispatchEvent(new dom.window.Event('change'));root.querySelector('[data-control-id="Save planning settings"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(saved,undefined);
 input.value='90';input.dispatchEvent(new dom.window.Event('change'));root.querySelector('[data-control-id="Save planning settings"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(saved.nonSplitThresholdMinutes,90);dom.window.close();
});
test('tight deadline explains the actual remaining buffer and the advisory 24-hour threshold',()=>{
 const item=task();const result=taskUrgency(item,{now:facts.now,lastEndAt:'2026-10-03T09:00:00-05:00'});
 assert.equal(result.reason,'tight');assert.equal(result.bufferMinutes,899);
 assert.equal(result.bufferThresholdMinutes,1440);
 assert.match(result.description,/14h 59m/);assert.match(result.description,/24/);
 assert.notEqual(taskUrgency(item,{now:facts.now,lastEndAt:'2026-10-02T23:59:00-05:00'}).reason,'tight');
});

test('release-time flow slices merge before balancing instead of moving artificial fragments',async()=>{
 const a=task({dueAt:'2026-10-03T21:00:00Z'}),b=task({key:'assignment:2',unlockAt:'2026-10-01T09:45:00Z',dueAt:a.dueAt});
 const p=plan({timeZone:'UTC',tasks:Object.fromEntries([a,b].map(item=>[item.key,{...item,estimateMinutes:120,singleSession:false,allowSplitting:true}]))});
 p.segments=[block(30,{id:'lock-a',locked:true,startAt:'2026-10-01T09:00:00Z',endAt:'2026-10-01T09:30:00Z'}),block(30,{id:'lock-b',itemKey:b.key,locked:true,startAt:'2026-10-01T12:00:00Z',endAt:'2026-10-01T12:30:00Z'})];
 const result=await generateSchedule({plan:p,...facts,items:[a,b],now:'2026-10-01T00:00:00Z'});
 assert.equal(result.status,'complete');
 for(const item of [a,b]){const unlocked=result.segments.filter(s=>s.itemKey===item.key&&!s.locked);assert.equal(unlocked.length,1);assert.equal(duration(unlocked[0]),90);}
});
test('the manual editor cannot use conflicting-draft override to split a protected task',async()=>{
 const {renderPlanEditor}=await import('../src/plan-editor-view.js');const dom=new JSDOM('');let applied;
 const root=renderPlanEditor({document:dom.window.document,plan:plan(),itemKey:'assignment:1',day:'2026-10-01',facts,onApply:op=>{applied=op;},onClose(){}});
 root.querySelector('[data-control-id="Work minutes"]').value='30';root.querySelector('[data-control-id="Work start time"]').value='09:00';
 root.querySelector('[data-control-id="Add work block"]').click();
 assert.equal(applied,undefined);assert.equal(root.querySelector('[data-control-id="Keep as conflicting draft"]'),null);assert.match(root.textContent,/one continuous/);dom.window.close();
});

test('unassigned indivisible work explains that a full continuous slot is required',async()=>{
 const p=plan();p.tasks['assignment:1'].estimateMinutes=120;p.schedule.weekdays.forEach(d=>d.maxMinutes=60);
 const result=await generateSchedule({plan:p,...facts});
 assert.match(result.issues.find(i=>i.code==='UNASSIGNED').message,/continuous/);
});
test('buffer details and split controls render in Chinese',async()=>{
 const {setLanguage}=await import('../src/i18n.js');const {createPlannerController}=await import('../src/planner-view.js');
 const dom=new JSDOM('<main/>'),document=dom.window.document;setLanguage(document,'zh-CN');
 const p=plan({segments:[block(60,{startAt:'2026-10-03T09:00:00-05:00',endAt:'2026-10-03T10:00:00-05:00'})]});
 const state=planningState({settings:settings({language:'zh-CN'}),plans:{[p.id]:p}});
 const controller=createPlannerController({document,state,items:[task()],now:()=>new Date(facts.now),timeZone:p.timeZone,loadedRange:p.range,planClient:{}});
 const root=controller.render();document.querySelector('main').append(root);
 const badge=root.querySelector('[data-segment-id] .urgency-tag');assert.match(badge.textContent,/余量 13小时 59分钟/);assert.match(badge.title,/不足建议预留的 24 小时/);assert.doesNotMatch(badge.title,/recommended/);
 assert.equal(root.querySelector('[data-control-id="Do not split tasks at or below (minutes)"]').getAttribute('aria-label'),'不拆分时长阈值（分钟，含等于）');
 controller.destroy();dom.window.close();
});
