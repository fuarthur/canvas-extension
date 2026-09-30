import test from 'node:test';import assert from 'node:assert/strict';import {zonedDateTime} from '../src/dates.js';import {buildAvailability} from '../src/availability.js';import {settings} from './helpers/planning.js';
const input={range:{startDate:'2026-10-01',endDate:'2026-10-01'},schedule:settings().schedule,timeZone:'America/Chicago',now:'2026-10-01T00:00:00Z',fixedEvents:[],lockedSegments:[]};
test('DST gaps are rejected and repeated clock times have deterministic interpretations',()=>{
 assert.equal(zonedDateTime('2026-03-08','02:30','America/Chicago'),null);
 assert.equal(zonedDateTime('2026-11-01','01:30','America/Chicago'), '2026-11-01T06:30:00.000Z');assert.equal(zonedDateTime('2026-11-01','01:30','America/Chicago',{disambiguation:'later'}),'2026-11-01T07:30:00.000Z');
});
test('repeated local-time conversions keep different zones and dates separate',()=>{
 for(let repeat=0;repeat<2;repeat++){
  assert.equal(zonedDateTime('2026-03-07','09:00','America/Chicago'),'2026-03-07T15:00:00.000Z');assert.equal(zonedDateTime('2026-03-07','09:00','America/New_York'),'2026-03-07T14:00:00.000Z');assert.equal(zonedDateTime('2026-03-08','09:00','America/Chicago'),'2026-03-08T14:00:00.000Z');
 }
});
test('overlapping fixed activities consume their actual union, regardless of effort estimates',()=>{
 const fixedEvents=[{fixedStartAt:'2026-10-01T10:00:00-05:00',fixedEndAt:'2026-10-01T11:00:00-05:00',estimateMinutes:5},{fixedStartAt:'2026-10-01T10:30:00-05:00',fixedEndAt:'2026-10-01T11:30:00-05:00'}];
 const result=buildAvailability({...input,fixedEvents});assert.equal(result.days[0].budgetMinutes,150);assert.equal(result.days[0].intervals.length,2);assert.equal(result.days[0].intervals[1].startAt,'2026-10-01T16:30:00.000Z');
});
test('rest overrides, elapsed today and locked work reduce availability without double booking',()=>{
 const schedule=settings().schedule;schedule.exceptions['2026-10-01']={start:'09:00',end:'21:00',maxMinutes:0};assert.equal(buildAvailability({...input,schedule}).days[0].budgetMinutes,0);
 const lockedSegments=[{startAt:'2026-10-01T13:00:00-05:00',endAt:'2026-10-01T14:00:00-05:00'}];const result=buildAvailability({...input,now:'2026-10-01T17:00:00Z',lockedSegments});assert.equal(result.days[0].budgetMinutes,180);assert.equal(result.days[0].intervals[0].startAt,'2026-10-01T17:00:00.000Z');
});
