import test from 'node:test';import assert from 'node:assert/strict';import {validatePlan,suggestSegment} from '../src/plan-validation.js';import {task,plan} from './helpers/planning.js';
const seg=(patch={})=>({id:'s1',itemKey:'assignment:1',startAt:'2026-10-01T09:00:00-05:00',endAt:'2026-10-01T10:00:00-05:00',locked:false,order:0,...patch});
const facts=(item=task())=>({items:[item],completed:{},now:'2026-10-01T12:00:00Z',loadedRange:{startDate:'2026-10-01',endDate:'2026-10-03'}});
test('complete plans require all effort, loaded facts, legal slots and current deadlines',()=>{
 assert.equal(validatePlan(plan({segments:[seg()]}),facts()).complete,true);
 assert.equal(validatePlan(plan(),facts()).complete,false);
 assert.ok(validatePlan(plan({segments:[seg()]}),{...facts(),items:[]}).issues.some(i=>i.code==='UNKNOWN'));
 assert.ok(validatePlan(plan({segments:[seg()]}),facts(task({dueAt:'2026-10-01T09:30:00-05:00'}))).issues.some(i=>i.code==='DEADLINE'));
 assert.ok(validatePlan(plan({segments:[seg()]}),facts(task({unlockAt:'2026-10-01T09:30:00-05:00',manualStartDay:'2026-09-01'}))).issues.some(i=>i.code==='UNLOCK'));
 assert.ok(validatePlan(plan({segments:[seg()]}),{...facts(),loadedRange:{startDate:'2026-10-02',endDate:'2026-10-03'}}).issues.some(i=>i.code==='RANGE'));
});
test('overlap, over-allocation, split single sessions and elapsed work are independently detected',()=>{
 const p=plan({segments:[seg(),seg({id:'s2',startAt:'2026-10-01T09:30:00-05:00',endAt:'2026-10-01T10:30:00-05:00'})]});const issues=validatePlan(p,facts()).issues;assert.ok(issues.some(i=>i.code==='OVERLAP'));assert.ok(issues.some(i=>i.code==='EXCESS'));
 p.tasks['assignment:1'].singleSession=true;assert.ok(validatePlan(p,facts()).issues.some(i=>i.code==='SINGLE_SESSION'));
 assert.ok(validatePlan(plan({segments:[seg()]}),{...facts(),now:'2026-10-01T16:00:00Z'}).issues.some(i=>i.code==='MISSED'));
});
test('suggestions allow missing unlock from the start but never suggest work after a noon deadline',()=>{
 const p=plan();const result=suggestSegment(p,'assignment:1',{day:'2026-10-01',minutes:60},facts());assert.equal(result.segment.startAt,'2026-10-01T14:00:00.000Z');
 const late=suggestSegment(p,'assignment:1',{day:'2026-10-01',minutes:60,startTime:'13:00'},facts(task({dueAt:'2026-10-01T12:00:00-05:00'})));assert.equal(late.segment,null);assert.ok(late.issues.length);
});
