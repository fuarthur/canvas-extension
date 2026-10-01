import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {generateSchedule} from '../src/scheduler.js';
import {validateSettings} from '../src/planning-settings.js';
import {createPlan} from '../src/plans.js';
import {createPlannerStore,isPlanRecord} from '../src/storage.js';
import {renderPlanningSettings} from '../src/settings-view.js';
import {setLanguage} from '../src/i18n.js';
import {plan,task,settings,planningState,memoryStorage} from './helpers/planning.js';
const now='2026-10-01T00:00:00Z';
function fixture({count=3,minutes=30,end='12:00',days=1,bufferMinutes}={}){
 const items=Array.from({length:count},(_,i)=>task({key:`assignment:${i+1}`,dueAt:`2026-10-0${days}T${end}:00Z`,endDay:`2026-10-0${days}`}));
 const p=plan({timeZone:'UTC',range:{startDate:'2026-10-01',endDate:`2026-10-0${days}`},tasks:Object.fromEntries(items.map(item=>[item.key,{...item,estimateMinutes:minutes,singleSession:false,completedAtSave:false}]))});
 p.schedule.weekdays.forEach(d=>Object.assign(d,{start:'09:00',end,maxMinutes:Math.min(240,(Number(end.slice(0,2))-9)*60+Number(end.slice(3)))}));
 if(bufferMinutes!==undefined)p.schedule.bufferMinutes=bufferMinutes;
 return {plan:p,items,completed:{},now,loadedRange:p.range};
}
function assertGaps(segments,minutes){
 const ordered=[...segments].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
 for(let i=1;i<ordered.length;i++)assert.ok(Date.parse(ordered[i].startAt)-Date.parse(ordered[i-1].endAt)>=minutes*60000,JSON.stringify(ordered));
}
test('automatic schedules leave a default 15-minute gap without inflating work estimates',async()=>{
 const input=fixture();const result=await generateSchedule(input);
 assert.equal(result.status,'complete');assert.equal(result.segments.length,3);assertGaps(result.segments,15);
 assert.equal(result.segments.reduce((sum,s)=>sum+(Date.parse(s.endAt)-Date.parse(s.startAt))/60000,0),90);
 assert.deepEqual(input.plan.segments,[]);
});
test('custom buffers change feasibility and zero permits back-to-back work',async()=>{
 for(const [bufferMinutes,status]of [[0,'complete'],[15,'partial'],[30,'partial']]){
  const result=await generateSchedule(fixture({count:2,end:'10:00',bufferMinutes}));assert.equal(result.status,status);assertGaps(result.segments,bufferMinutes);
 }
 const result=await generateSchedule(fixture({count:3,end:'12:00',bufferMinutes:30}));assert.equal(result.status,'complete');assertGaps(result.segments,30);
});
test('locks keep their times and reserve buffer on either side',async()=>{
 const input=fixture({count:3});const lock={id:'locked',itemKey:'assignment:1',startAt:'2026-10-01T10:00:00Z',endAt:'2026-10-01T10:30:00Z',locked:true,order:0};input.plan.segments=[lock];
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assert.deepEqual(result.segments.find(s=>s.id==='locked'),lock);assertGaps(result.segments,15);
});
test('split fallback leaves gaps between work blocks while preserving total effort',async()=>{
 const input=fixture({count:2,minutes:90,days:2,end:'11:00'});input.plan.schedule.weekdays.forEach(d=>d.maxMinutes=100);input.plan.segments=[{id:'locked-split',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00Z',endAt:'2026-10-01T09:30:00Z',locked:true,order:0}];
 Object.values(input.plan.tasks).forEach(t=>t.allowSplitting=true);
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assertGaps(result.segments,15);
 for(const item of input.items)assert.equal(result.segments.filter(s=>s.itemKey===item.key).reduce((sum,s)=>sum+(Date.parse(s.endAt)-Date.parse(s.startAt))/60000,0),90);
});
test('balancing preserves custom gaps across a multi-day schedule',async()=>{
 const input=fixture({count:8,days:3,bufferMinutes:25});const result=await generateSchedule(input);
 assert.equal(result.status,'complete');assertGaps(result.segments,25);assert.ok(result.metrics.afterPeakMinutes<=result.metrics.beforePeakMinutes);
});
test('settings migrate, persist and snapshot buffer independently for new plans',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setSettings(settings());assert.equal((await store.loadPlanningState()).settings.schedule.bufferMinutes,15);
 const custom=settings();custom.schedule.bufferMinutes=25;await store.setSettings(custom);const state=await store.loadPlanningState();
 const p=createPlan({id:'buffered',name:'Buffered',items:[task()],state,startDate:'2026-10-01',endDate:'2026-10-03',timeZone:'UTC',now});
 assert.equal(p.schedule.bufferMinutes,25);state.settings.schedule.bufferMinutes=0;assert.equal(p.schedule.bufferMinutes,25);assert.equal(isPlanRecord(p),true);
 for(const value of [-1,1.5,1441,'15']){const invalid=structuredClone(custom);invalid.schedule.bufferMinutes=value;assert.equal(validateSettings(invalid).value,null);assert.equal(isPlanRecord({...p,schedule:invalid.schedule}),false);}
});
test('Chinese settings expose editable buffers, reject invalid values and save zero',async()=>{
 const dom=new JSDOM('');setLanguage(dom.window.document,'zh-CN');let saved;
 const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async value=>{saved=value;}});
 const input=root.querySelector('[data-control-id="Buffer between work blocks (minutes)"]');assert.ok(input);assert.equal(input.value,'15');assert.equal(input.getAttribute('aria-label'),'任务间缓冲时间（分钟）');
 const save=()=>root.querySelector('[data-control-id="Save planning settings"]').click();
 input.value='-1';input.dispatchEvent(new dom.window.Event('change'));save();await new Promise(r=>setTimeout(r,0));assert.equal(saved,undefined);assert.equal(root.querySelector('.schedule-settings').open,true);
 input.value='0';input.dispatchEvent(new dom.window.Event('change'));save();await new Promise(r=>setTimeout(r,0));assert.equal(saved.schedule.bufferMinutes,0);dom.window.close();
});

test('a late-night lock carries its buffer into the next local work day',async()=>{
 const input=fixture({count:2,days:2,end:'23:59'});input.plan.schedule.weekdays.forEach(d=>Object.assign(d,{start:'00:00',maxMinutes:60}));
 input.items[1].unlockAt='2026-10-02T00:00:00Z';input.plan.tasks['assignment:2'].unlockAt=input.items[1].unlockAt;
 input.plan.segments=[{id:'night-lock',itemKey:'assignment:1',startAt:'2026-10-01T23:25:00Z',endAt:'2026-10-01T23:55:00Z',locked:true,order:0}];
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assertGaps(result.segments,15);
 assert.equal(result.segments.find(s=>s.itemKey==='assignment:2').startAt,'2026-10-02T00:10:00.000Z');
});
test('conflicting retained locks report the buffer conflict without moving saved blocks',async()=>{
 const input=fixture({count:2});input.plan.segments=[
  {id:'lock-1',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00Z',endAt:'2026-10-01T09:30:00Z',locked:true,order:0},
  {id:'lock-2',itemKey:'assignment:2',startAt:'2026-10-01T09:40:00Z',endAt:'2026-10-01T10:10:00Z',locked:true,order:1}
 ];
 const result=await generateSchedule(input);assert.equal(result.status,'partial');assert.equal(result.validation.complete,false);assert.ok(result.issues.some(i=>i.code==='BUFFER'));assert.deepEqual(result.segments,input.plan.segments);
});
test('completed retained work does not reserve rest time for future work',async()=>{
 const input=fixture({count:2,end:'10:00'});input.completed['assignment:1']=true;
 input.plan.segments=[{id:'done',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00Z',endAt:'2026-10-01T09:30:00Z',locked:true,order:0}];
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assert.equal(result.segments.find(s=>s.itemKey==='assignment:2').startAt,'2026-10-01T09:00:00.000Z');
});

test('locked remainders can trade days so buffer does not starve another feasible task',async()=>{
 const input=fixture({count:2,minutes:90,days:3});input.plan.tasks['assignment:1'].dueAt=input.items[0].dueAt='2026-10-03T10:00:00Z';
 input.plan.tasks['assignment:2'].estimateMinutes=120;input.plan.tasks['assignment:2'].dueAt=input.items[1].dueAt='2026-10-03T11:00:00Z';
 Object.values(input.plan.tasks).forEach(t=>t.allowSplitting=true);
 input.plan.schedule.exceptions={
  '2026-10-01':{start:'09:00',end:'11:00',maxMinutes:60},
  '2026-10-02':{start:'09:00',end:'10:30',maxMinutes:90},
  '2026-10-03':{start:'09:00',end:'10:00',maxMinutes:60}
 };
 input.plan.segments=[
  {id:'lock-a',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00Z',endAt:'2026-10-01T09:30:00Z',locked:true,order:0},
  {id:'lock-b',itemKey:'assignment:2',startAt:'2026-10-01T10:00:00Z',endAt:'2026-10-01T10:30:00Z',locked:true,order:1}
 ];
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assertGaps(result.segments,15);
 assert.deepEqual(result.validation.unassigned,{});assert.equal(result.segments.filter(s=>!s.locked).length,2);
});
