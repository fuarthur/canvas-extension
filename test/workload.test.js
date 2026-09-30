import test from 'node:test';import assert from 'node:assert/strict';
import {workloadSeries,workloadSummary,pressureLevel} from '../src/workload.js';
import {addDays,daysBetween} from '../src/dates.js';
import {task,planningState} from './helpers/planning.js';
const range={startDate:'2026-10-01',endDate:'2026-10-03'};
test('a long task and duplicate sources count once at deadline, and completed items contribute zero',()=>{
 const a=task({startDay:'2026-09-20'});const event=task({key:'event:2',type:'event',startDay:'2026-10-01',endDay:'2026-10-03'});
 const points=workloadSeries([a,a,event,task({key:'assignment:3',completed:true})],planningState(),range);
 assert.deepEqual(points.map(p=>[p.day,p.tasks,p.minutes]),[['2026-10-01',1,60],['2026-10-02',0,0],['2026-10-03',1,60]]);
 assert.equal(a.completed,false);
});
test('pressure thresholds classify every boundary',()=>{
 assert.deepEqual([0,2,3,5,6].map(n=>pressureLevel(n,planningState().settings)),['green','green','yellow','yellow','red']);
});
test('today follows profile zone and browsing a past month does not shift overdue facts',()=>{
 const item=task({dueAt:'2026-09-30T20:00:00-05:00',endAt:'2026-09-30T20:00:00-05:00',endDay:'2026-09-30'});
 const s=workloadSummary([item],planningState(),{now:'2026-10-01T02:00:00Z',timeZone:'America/Chicago',range:{startDate:'2026-08-01',endDate:'2026-08-31'}});
 assert.equal(s.today.day,'2026-09-30');assert.equal(s.today.tasks,1);assert.equal(s.overdue.length,1);assert.equal(s.totalTasks,0);
});
test('range includes zero days across year boundaries and rejects invalid days',()=>{
 assert.equal(addDays('2026-12-31',1),'2027-01-01');
 assert.deepEqual(daysBetween('2026-12-31','2027-01-02'),['2026-12-31','2027-01-01','2027-01-02']);
 assert.throws(()=>daysBetween('2026-02-30','2026-03-01'));
});
