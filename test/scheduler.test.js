import test from 'node:test';import assert from 'node:assert/strict';import {generateSchedule} from '../src/scheduler.js';import {validatePlan} from '../src/plan-validation.js';import {plan,task,settings} from './helpers/planning.js';
const baseFacts={items:[task()],completed:{},now:'2026-10-01T12:00:00Z',loadedRange:{startDate:'2026-10-01',endDate:'2026-10-03'}};
const minutes=s=>(Date.parse(s.endAt)-Date.parse(s.startAt))/60000;
test('splittable effort respects daily capacity and independently passes deadlines',async()=>{
 const p=plan();p.tasks['assignment:1'].estimateMinutes=180;p.schedule.weekdays.forEach(d=>d.maxMinutes=60);
 const result=await generateSchedule({plan:p,...baseFacts});assert.equal(result.status,'complete');assert.equal(result.segments.reduce((n,s)=>n+minutes(s),0),180);assert.equal(validatePlan({...p,segments:result.segments},baseFacts).complete,true);
});
test('balanced plans reduce peaks and variance without using rest days',async()=>{
 const p=plan();p.tasks['assignment:1'].estimateMinutes=180;const result=await generateSchedule({plan:p,...baseFacts});assert.equal(result.status,'complete');assert.ok(result.metrics.afterPeakMinutes<result.metrics.beforePeakMinutes);assert.ok(result.metrics.afterVariance<result.metrics.beforeVariance);
 p.schedule.exceptions['2026-10-02']={start:'09:00',end:'21:00',maxMinutes:0};const rest=await generateSchedule({plan:p,...baseFacts});assert.equal(rest.status,'complete');assert.equal(rest.segments.some(s=>s.startAt.startsWith('2026-10-02')),false);
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
