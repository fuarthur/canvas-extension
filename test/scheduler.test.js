import test from 'node:test';import assert from 'node:assert/strict';import {generateSchedule} from '../src/scheduler.js';import {validatePlan} from '../src/plan-validation.js';import {plan,task,settings} from './helpers/planning.js';
import {addDays} from '../src/dates.js';
const baseFacts={items:[task()],completed:{},now:'2026-10-01T12:00:00Z',loadedRange:{startDate:'2026-10-01',endDate:'2026-10-03'}};
const minutes=s=>(Date.parse(s.endAt)-Date.parse(s.startAt))/60000;
test('splittable effort respects daily capacity and independently passes deadlines',async()=>{
 const p=plan();p.tasks['assignment:1'].estimateMinutes=180;p.tasks['assignment:1'].allowSplitting=true;p.schedule.weekdays.forEach(d=>d.maxMinutes=60);
 const result=await generateSchedule({plan:p,...baseFacts});assert.equal(result.status,'complete');assert.equal(result.segments.reduce((n,s)=>n+minutes(s),0),180);assert.equal(validatePlan({...p,segments:result.segments},baseFacts).complete,true);
});
test('balanced plans reduce peaks and variance without using rest days',async()=>{
 const event=task({key:'event:1',type:'event',endDay:'2026-10-01',fixedStartAt:'2026-10-01T09:00:00-05:00',fixedEndAt:'2026-10-01T10:00:00-05:00'});const p=plan();p.tasks[event.key]={...event,estimateMinutes:60,singleSession:false};p.tasks['assignment:1'].estimateMinutes=180;const input={plan:p,...baseFacts,items:[task(),event]};const result=await generateSchedule(input);assert.equal(result.status,'complete');assert.ok(result.metrics.afterPeakMinutes<result.metrics.beforePeakMinutes);assert.ok(result.metrics.afterVariance<result.metrics.beforeVariance);
 p.schedule.exceptions['2026-10-02']={start:'09:00',end:'21:00',maxMinutes:0};const rest=await generateSchedule(input);assert.equal(rest.status,'complete');assert.equal(rest.segments.some(s=>s.startAt.startsWith('2026-10-02')),false);
});
test('future releases, noon deadlines, second precision and fixed events remain hard constraints',async()=>{
 const item=task({unlockAt:'2026-10-01T10:00:20-05:00',dueAt:'2026-10-01T12:00:20-05:00'});const p=plan({tasks:{'assignment:1':{...item,estimateMinutes:60,singleSession:false,completedAtSave:false}}});
 const event=task({key:'event:1',type:'event',fixedStartAt:'2026-10-01T10:00:00-05:00',fixedEndAt:'2026-10-01T11:00:00-05:00'});
 const result=await generateSchedule({plan:p,...baseFacts,items:[item,event]});assert.equal(result.status,'complete');for(const s of result.segments){assert.ok(Date.parse(s.startAt)>=Date.parse('2026-10-01T11:00:00-05:00'));assert.ok(Date.parse(s.endAt)<=Date.parse(item.dueAt));}
});
test('single-session tasks and locks stay intact while insufficient capacity returns a gap',async()=>{
 const p=plan();p.tasks['assignment:1'].singleSession=true;p.tasks['assignment:1'].estimateMinutes=180;p.schedule.weekdays.forEach(d=>d.maxMinutes=60);const no=await generateSchedule({plan:p,...baseFacts});assert.equal(no.status,'partial');assert.ok(no.issues.some(i=>i.missingMinutes===180));
 const locked={id:'locked',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00-05:00',endAt:'2026-10-01T10:00:00-05:00',locked:true,order:0};const exact=plan({segments:[locked]});const yes=await generateSchedule({plan:exact,...baseFacts});assert.equal(yes.status,'complete');assert.deepEqual(yes.segments.find(s=>s.id==='locked'),locked);
});
test('unknown and stale facts do not report a fully verified result',async()=>{
 assert.equal((await generateSchedule({plan:plan(),...baseFacts,items:[]})).status,'partial');assert.equal((await generateSchedule({plan:plan(),...baseFacts,items:[task({dueAt:'2026-10-02T12:00:00Z'})]})).status,'partial');
});
test('cancellation and timeouts never claim complete and do not mutate input',async()=>{
 const p=plan();const controller=new AbortController();controller.abort();assert.equal((await generateSchedule({plan:p,...baseFacts},{signal:controller.signal})).status,'cancelled');assert.equal(p.segments.length,0);
 let clock=0;const timeout=await generateSchedule({plan:p,...baseFacts},{clock:()=>clock+=10,budgetMs:5});assert.equal(timeout.status,'timeout');
});
test('tiny preemptive examples match independent exhaustive feasibility',async()=>{
 // Two days with one work minute per day: enumerate which day each unit can occupy.
 for(const dueDays of [[1],[2],[1,2],[1,1],[2,2]]){
  const p=plan({range:{startDate:'2026-10-01',endDate:'2026-10-02'},tasks:{}});p.schedule.weekdays.forEach(d=>{d.start='09:00';d.end='09:01';d.maxMinutes=1;});
  const items=dueDays.map((due,index)=>task({key:`assignment:${index+1}`,dueAt:`2026-10-0${due}T09:01:00-05:00`,endDay:`2026-10-0${due}`}));items.forEach(i=>p.tasks[i.key]={...i,estimateMinutes:1,singleSession:false,completedAtSave:false});
  const assign=(i,used)=>i===dueDays.length||[1,2].some(day=>day<=dueDays[i]&&!used.includes(day)&&assign(i+1,[...used,day]));const feasible=assign(0,[]);const result=await generateSchedule({plan:p,...baseFacts,items});assert.equal(result.status==='complete',feasible,JSON.stringify(dueDays));
 }
});

test('daily budgets can wait for a later release instead of starving its earlier deadline',async()=>{
 const a=task({dueAt:'2026-10-02T21:00:00-05:00',endDay:'2026-10-02'});
 const b=task({key:'assignment:2',title:'Urgent',unlockAt:'2026-10-01T10:00:00-05:00',dueAt:'2026-10-01T21:00:00-05:00',endDay:'2026-10-01'});
 const p=plan({range:{startDate:'2026-10-01',endDate:'2026-10-02'},tasks:Object.fromEntries([a,b].map(i=>[i.key,{...i,estimateMinutes:60,singleSession:false,completedAtSave:false}]))});p.schedule.weekdays.forEach(d=>d.maxMinutes=60);
 const f={...baseFacts,items:[a,b]};const result=await generateSchedule({plan:p,...f});assert.equal(result.status,'complete');assert.equal(validatePlan({...p,segments:result.segments},f).complete,true);
});
test('generated block IDs stay unique when a previous auto block is locked',async()=>{
 const b=task({key:'assignment:2',title:'Second'});const p=plan();p.tasks[b.key]={...b,estimateMinutes:60,singleSession:false,completedAtSave:false};p.segments=[{id:'auto-1',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00-05:00',endAt:'2026-10-01T10:00:00-05:00',locked:true,order:0}];
 const result=await generateSchedule({plan:p,...baseFacts,items:[task(),b]});assert.equal(result.status,'complete');assert.equal(new Set(result.segments.map(s=>s.id)).size,result.segments.length);
 const {isPlanRecord}=await import('../src/storage.js');assert.equal(isPlanRecord({...p,segments:result.segments}),true);
});

test('a plan can start on a date whose local midnight is skipped',async()=>{
 const item=task({startDay:'2026-09-06',endDay:'2026-09-07',dueAt:'2026-09-07T21:00:00-03:00'});const p=plan({timeZone:'America/Santiago',range:{startDate:'2026-09-06',endDate:'2026-09-07'},tasks:{[item.key]:{...item,estimateMinutes:60,singleSession:false,completedAtSave:false}}});const f={items:[item],completed:{},now:'2026-09-05T12:00:00Z',loadedRange:p.range};const result=await generateSchedule({plan:p,...f});assert.equal(result.status,'complete');assert.equal(validatePlan({...p,segments:result.segments},f).complete,true);
});
test('long-range balancing yields and obeys its budget inside candidate scans',async()=>{
 // This balancing-budget fixture deliberately packs 200 tiny blocks into one
 // day. Disable rest gaps so that arrangement remains feasible.
 const items=Array.from({length:200},(_,i)=>task({key:`assignment:${i+1}`,dueAt:'2026-10-01T21:00:00-05:00',endDay:'2026-10-01'}));const p=plan({range:{startDate:'2026-10-01',endDate:'2027-03-29'},tasks:Object.fromEntries(items.map(i=>[i.key,{...i,estimateMinutes:1,singleSession:false,completedAtSave:false}]))});p.schedule.bufferMinutes=0;let calls=0;
 const result=await generateSchedule({plan:p,...baseFacts,items,loadedRange:p.range},{clock:()=>++calls>1000?1000:0,budgetMs:100,yieldControl:async()=>{}});assert.equal(result.status,'timeout');assert.equal(result.segments.length,200);
});

test('overdue work remains partial while feasible future work is still balanced',async()=>{
 const event=task({key:'event:1',type:'event',endDay:'2026-10-01',fixedStartAt:'2026-10-01T09:00:00-05:00',fixedEndAt:'2026-10-01T10:00:00-05:00'});const old=task({key:'assignment:2',dueAt:'2026-09-30T21:00:00-05:00',endDay:'2026-09-30'});const p=plan();p.tasks[event.key]={...event,estimateMinutes:60,singleSession:false};p.tasks['assignment:1'].estimateMinutes=180;p.tasks[old.key]={...old,estimateMinutes:60,singleSession:false,completedAtSave:false};const result=await generateSchedule({plan:p,...baseFacts,items:[task(),old,event]});assert.equal(result.status,'partial');assert.equal(result.validation.unassigned[old.key],60);assert.ok(result.metrics.afterPeakMinutes<result.metrics.beforePeakMinutes);
});

test('a month of ordinary tasks finishes balancing within the generation budget',async()=>{
 const items=Array.from({length:20},(_,i)=>task({key:`assignment:${i+1}`,endDay:addDays('2026-10-01',i),dueAt:`${addDays('2026-10-01',i)}T23:59:00-05:00`}));
 const p=plan({range:{startDate:'2026-10-01',endDate:'2026-10-28'},tasks:Object.fromEntries(items.map(item=>[item.key,{...item,estimateMinutes:30,singleSession:false,completedAtSave:false}]))});const input={...baseFacts,plan:p,items,loadedRange:p.range};
 const result=await generateSchedule(input,{budgetMs:2000});assert.equal(result.status,'complete');assert.equal(result.segments.reduce((total,block)=>total+minutes(block),0),600);assert.equal(validatePlan({...p,segments:result.segments},input).complete,true);assert.ok(result.metrics.afterPeakMinutes<=result.metrics.beforePeakMinutes);assert.equal(result.segments.length,20);assert.ok(result.segments.every(block=>minutes(block)===30));
});

test('sixty tasks finish with verified deadlines within the default budget',async()=>{
 const items=Array.from({length:60},(_,i)=>task({key:`assignment:${i+1}`,endDay:addDays('2026-10-01',i%25),dueAt:`${addDays('2026-10-01',i%25)}T23:59:00-05:00`}));
 const p=plan({range:{startDate:'2026-10-01',endDate:'2026-10-28'},tasks:Object.fromEntries(items.map(item=>[item.key,{...item,estimateMinutes:30,singleSession:false,completedAtSave:false}]))});const input={...baseFacts,plan:p,items,loadedRange:p.range};
 const result=await generateSchedule(input);assert.equal(result.status,'complete');assert.equal(result.segments.reduce((total,block)=>total+minutes(block),0),1800);assert.equal(validatePlan({...p,segments:result.segments},input).complete,true);
});

test('overdue work does not force exhaustive single-session searches after all feasible work is placed',async()=>{
 const old=task({key:'assignment:old',endDay:'2026-09-30',dueAt:'2026-09-30T23:59:00-05:00'});const items=[...Array.from({length:8},(_,i)=>task({key:`assignment:${i+1}`})),old];
 const p=plan({tasks:Object.fromEntries(items.map(item=>[item.key,{...item,estimateMinutes:30,singleSession:item!==old,completedAtSave:false}]))});let calls=0;
 const result=await generateSchedule({...baseFacts,plan:p,items},{clock:()=>++calls>1500?1000:0,budgetMs:100,yieldControl:async()=>{}});
 assert.equal(result.status,'partial');assert.deepEqual(result.validation.unassigned,{'assignment:old':30});assert.equal(result.segments.reduce((total,block)=>total+minutes(block),0),240);assert.ok(result.validation.issues.every(issue=>issue.code==='OVERDUE'));
});
