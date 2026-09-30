import test from 'node:test';import assert from 'node:assert/strict';
import {createPlan,copyPlan,updatePlan,resolvePlanTasks,planSeries,comparePlans,taskUrgency,planFingerprint} from '../src/plans.js';import {task,planningState,plan} from './helpers/planning.js';
const segment={id:'s1',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00-05:00',endAt:'2026-10-01T10:00:00-05:00',locked:false,order:0};
const create=()=>createPlan({id:'p1',name:'First',items:[task()],state:planningState(),startDate:'2026-10-01',endDate:'2026-10-03',timeZone:'America/Chicago',now:'2026-10-01T00:00:00Z'});
test('plan changes and copies preserve the original snapshot and independent segments',()=>{
 const p=create();const changed=updatePlan(p,{type:'addSegment',segment});assert.equal(p.segments.length,0);
 const copy=copyPlan(changed,{id:'p2',name:'Copy',now:'2026-10-02T00:00:00Z'});copy.segments[0].locked=true;assert.equal(changed.segments[0].locked,false);assert.equal(copy.revision,0);
 const state=planningState();state.estimates['assignment:1']=90;
 assert.equal(p.tasks['assignment:1'].estimateMinutes,60);assert.ok(resolvePlanTasks(p,{items:[task()],completed:{},state}).changes.length);
 const updated=updatePlan(p,{type:'updateTasks',tasks:{...p.tasks,'assignment:1':{...p.tasks['assignment:1'],estimateMinutes:90}}});assert.equal(updated.tasks['assignment:1'].estimateMinutes,90);
});
test('shared completion removes remaining load while saved mode retains the archive',()=>{
 const p=plan({segments:[segment]});const facts={items:[task({completed:true})],completed:{}};
 assert.equal(planSeries(p,{...facts,mode:'remaining'})[0].minutes,0);assert.equal(planSeries(p,{...facts,mode:'saved'})[0].minutes,60);
 const unknown=resolvePlanTasks(p,{items:[],completed:{}});assert.deepEqual(unknown.unknownKeys,['assignment:1']);assert.equal(unknown.tasks['assignment:1'].title,'Essay');
});
test('multiple blocks count the same task once per day and comparison uses no-data outside ranges',()=>{
 const p=plan({segments:[segment,{...segment,id:'s2',startAt:'2026-10-01T10:00:00-05:00',endAt:'2026-10-01T10:30:00-05:00'}]});assert.equal(planSeries(p,{items:[task()],completed:{},mode:'remaining'})[0].tasks,1);
 const comparison=comparePlans([p,plan({id:'p2',range:{startDate:'2026-10-02',endDate:'2026-10-03'}})],{items:[task()],completed:{}},{metric:'minutes',mode:'saved'});assert.equal(comparison.series[1].points[0].minutes,null);
});
test('fixed event estimates split across local dates with exact total',()=>{
 const event={...task({key:'event:1',type:'event'}),estimateMinutes:60,singleSession:false,fixedStartAt:'2026-10-01T12:00:00-05:00',fixedEndAt:'2026-10-02T12:00:00-05:00'};
 const points=planSeries(plan({tasks:{'event:1':event}}),{items:[event],completed:{},mode:'saved'});assert.deepEqual(points.map(p=>p.minutes),[30,30,0]);
});
test('urgency distinguishes due soon, overdue, tight planned finish and completion',()=>{
 const item=task();const due=Date.parse(item.dueAt);const at=h=>new Date(due-h*3600000).toISOString();
 assert.equal(taskUrgency(item,{now:at(24),completed:false}).level,'red');assert.equal(taskUrgency(item,{now:at(72),completed:false}).level,'yellow');assert.equal(taskUrgency(item,{now:at(100),lastEndAt:at(1),completed:false}).reason,'tight');assert.equal(taskUrgency(item,{now:at(-1),completed:false}).reason,'overdue');assert.equal(taskUrgency(item,{now:at(-1),completed:true}).level,'none');
});
test('fingerprint changes with effective estimates and current deadline facts',()=>{
 const p=create();const state=planningState();const first=planFingerprint(p,{items:[task()],completed:{},state});state.estimates['assignment:1']=90;
 assert.notEqual(planFingerprint(p,{items:[task()],completed:{},state}),first);assert.notEqual(planFingerprint(p,{items:[task({dueAt:'2026-10-02T12:00:00Z'})],completed:{},state:planningState()}),first);
});
