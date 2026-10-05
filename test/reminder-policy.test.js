import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateReminders,reminderToken} from '../src/reminder-policy.js';
import {task} from './helpers/planning.js';
const scope={hostname:'canvas.illinois.edu',userId:'77'},dueAt='2026-10-05T20:00:00Z';
const item=task({dueAt,canvasCompleted:false});
const run=(now,overrides={})=>evaluateReminders({scope,items:[item],settings:{enabled:true,leadMinutes:[120]},selectedCalendars:['course_456'],completed:{},ledger:{},now:Date.parse(now),...overrides});
test('default round fires at its instant and not before',()=>{
 assert.equal(run('2026-10-05T17:59Z').deliveries.length,0);assert.equal(run('2026-10-05T17:59Z').nextAt,Date.parse('2026-10-05T18:00Z'));
 const result=run('2026-10-05T18:00Z');assert.equal(result.deliveries.length,1);assert.equal(result.deliveries[0].leadMinutes,120);
});
test('multiple missed rounds catch up only the latest round',()=>{
 const result=run('2026-10-05T19:00Z',{settings:{enabled:true,leadMinutes:[1440,360,120]}});
 assert.deepEqual(result.deliveries.map(d=>d.leadMinutes),[120]);assert.equal(result.skipped.length,2);
});
test('a sent latest round prevents replay of earlier unsent rounds',()=>{
 const ledger={[reminderToken(scope,item,120)]:{state:'sent'}};
 const result=run('2026-10-05T19:00Z',{ledger,settings:{enabled:true,leadMinutes:[1440,360,120]}});
 assert.equal(result.deliveries.length,0);assert.equal(result.nextAt,null);
});
test('expired complete undated and event tasks never remind',()=>{
 assert.equal(run(dueAt).deliveries.length,0);
 for(const patch of [{completed:true},{canvasCompleted:true},{dueAt:null},{type:'event'}])assert.equal(run('2026-10-05T19:00Z',{items:[{...item,...patch}]}).deliveries.length,0);
 assert.equal(run('2026-10-05T19:00Z',{completed:{[item.key]:true}}).deliveries.length,0);
 assert.equal(run('2026-10-05T19:00Z',{selectedCalendars:[]}).deliveries.length,0);
});
test('equivalent ISO deadlines have identical tokens and deadline changes rearm',()=>{
 const offset={...item,dueAt:'2026-10-05T15:00:00-05:00'};
 assert.equal(reminderToken(scope,item,120),reminderToken(scope,offset,120));
 const ledger={[reminderToken(scope,item,120)]:{state:'sent'}};
 assert.equal(run('2026-10-05T19:00Z',{ledger,items:[offset]}).deliveries.length,0);
 assert.equal(run('2026-10-05T19:00Z',{ledger,items:[{...item,dueAt:'2026-10-05T21:00Z'}]}).deliveries.length,1);
 assert.equal(run('2026-10-05T19:00Z',{ledger}).deliveries.length,0);
});
test('pending blocks duplicates and failed attempts wait without outliving the deadline',()=>{
 const token=reminderToken(scope,item,120);
 assert.equal(run('2026-10-05T19:00Z',{ledger:{[token]:{state:'pending'}}}).deliveries.length,0);
 const retryAt=Date.parse('2026-10-05T19:15Z'),ledger={[token]:{state:'failed',retryAt}};
 assert.equal(run('2026-10-05T19:00Z',{ledger}).nextAt,retryAt);
 assert.equal(run('2026-10-05T19:15Z',{ledger}).deliveries.length,1);
 assert.equal(run('2026-10-05T19:00Z',{ledger:{[token]:{state:'failed',retryAt:Date.parse('2026-10-05T21:00Z')}}}).nextAt,null);
});
test('reordered rounds, reopening, duplicate rows and DST keep their identities',()=>{
 const now='2026-10-05T19:00Z';assert.deepEqual(run(now,{settings:{enabled:true,leadMinutes:[120,360,1440]}}).deliveries.map(d=>d.leadMinutes),[120]);
 assert.equal(run(now,{completed:{[item.key]:false},items:[item,item]}).deliveries.length,1);
 const dst={...item,dueAt:'2026-11-01T01:30:00-06:00'};
 const result=run('2026-11-01T05:29Z',{items:[dst]});assert.equal(result.nextAt,Date.parse('2026-11-01T05:30Z'));
 assert.equal(run(now,{settings:{enabled:false,leadMinutes:[120]}}).deliveries.length,0);
});
