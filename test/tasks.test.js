import test from 'node:test';
import assert from 'node:assert/strict';
import * as tasks from '../src/tasks.js';
import {task,planningState} from './helpers/planning.js';
import {createPlan} from '../src/plans.js';
import {workloadSummary} from '../src/workload.js';
import {validatePlan} from '../src/plan-validation.js';

const zone='America/Chicago',now='2026-09-30T15:00:00Z';
const old=task({key:'assignment:old',dueAt:'2026-05-31T23:59:00-05:00',endDay:'2026-05-31'});
test('semester cutoffs follow the Canvas timezone and all three semester boundaries',()=>{
 assert.equal(tasks.historyCutoff({mode:'semester'},'2027-01-01T05:30:00Z',zone),'2026-08-01');
 for(const [date,cutoff] of [['2027-01-01','2027-01-01'],['2027-05-31','2027-01-01'],['2027-06-01','2027-06-01'],['2027-08-01','2027-08-01']])assert.equal(tasks.historyCutoff({mode:'semester'},`${date}T12:00:00Z`,zone),cutoff);
 assert.equal(tasks.historyCutoff({mode:'months',months:1},'2028-03-31T12:00:00Z',zone),'2028-02-29');
 assert.equal(tasks.historyCutoff({mode:'off'},now,zone),null);
});
test('history hides only old expired assignments and preserves future deadlines and events',()=>{
 const state=planningState();
 assert.equal(tasks.isHistoricalTask(old,state,{now,timeZone:zone}),true);
 assert.equal(tasks.isHistoricalTask(task({dueAt:'2026-08-01T00:00:00-05:00'}),state,{now,timeZone:zone}),false);
 assert.equal(tasks.isHistoricalTask(task(),state,{now,timeZone:zone}),false);
 assert.equal(tasks.isHistoricalTask({...old,type:'event'},state,{now,timeZone:zone}),false);
 state.settings.historyFilter={mode:'off',months:4};assert.equal(tasks.isHistoricalTask(old,state,{now,timeZone:zone}),false);
});
test('overdue means unfinished homework, not an expired activity or a historical assignment',()=>{
 const recent=task({key:'assignment:recent',dueAt:'2026-09-29T20:00:00-05:00',endDay:'2026-09-29'});
 const event={...recent,key:'event:2',type:'event'};
 const summary=workloadSummary([old,recent,event,task({completed:true})],planningState(),{now,timeZone:zone,range:{startDate:'2026-05-01',endDate:'2026-10-31'}});
 assert.deepEqual(summary.overdue.map(i=>i.key),[recent.key]);assert.equal(summary.totalTasks,2);
});
test('new plans omit old homework while retaining current-semester overdue work',()=>{
 const recent=task({key:'assignment:recent',endDay:'2026-09-20',dueAt:'2026-09-20T20:00:00-05:00'});
 const p=createPlan({id:'new',name:'New',items:[old,recent,task()],state:planningState(),startDate:'2026-09-30',endDate:'2026-10-28',timeZone:zone,now});
 assert.deepEqual(Object.keys(p.tasks),[recent.key,'assignment:1']);
});
test('historical homework does not invalidate a new plan and remains known in saved plans',()=>{
 const state=planningState(),range={startDate:'2026-09-30',endDate:'2026-10-28'};
 const p=createPlan({id:'new',name:'New',items:[old],state,...range,timeZone:zone,now});
 const facts={items:[old],state,now,loadedRange:{startDate:'2026-03-01',endDate:'2027-03-31'}};
 assert.equal(validatePlan(p,facts).issues.some(i=>i.code==='MISSING_TASK'),false);
 state.settings.historyFilter={mode:'off',months:4};assert.equal(validatePlan(p,facts).issues.some(i=>i.code==='MISSING_TASK'),true);
 p.tasks[old.key]={...old,estimateMinutes:60,singleSession:false};assert.equal(validatePlan(p,facts).issues.some(i=>i.code==='UNKNOWN'),false);
});
test('task presets, sorts and groups use real deadlines, completion and targets',()=>{
 const current=task({key:'assignment:recent',title:'Current',dueAt:'2026-09-29T20:00:00-05:00',endDay:'2026-09-29'});
 const event={...current,key:'event:2',type:'event',fixedStartAt:current.dueAt};
 const done=task({key:'assignment:done',completed:true});const state=planningState({targets:{'assignment:1':{day:'2026-10-02',time:'20:00'}}});
 const options={now,timeZone:zone};
 assert.deepEqual(tasks.taskList([old,current,event,done,task()],state,{preset:'overdue'},options).map(i=>i.key),[current.key]);
 assert.deepEqual(tasks.taskList([task(),current],state,{preset:'all',status:'remaining',sort:'targetDesc'},options).map(i=>i.key),['assignment:1',current.key]);
 assert.equal(tasks.taskGroup(current,'date',options),'Overdue');
 assert.equal(tasks.taskGroup(event,'date',options),'Earlier activities');
 assert.equal(tasks.taskGroup({...current,completed:true},'date',options),'Earlier deadlines');
 assert.equal(tasks.targetInstant({day:'2026-03-08',time:'02:30'},zone),null);
});
