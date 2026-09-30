import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,validateSettings} from '../src/planning-settings.js';
import {resolveEstimate} from '../src/estimates.js';
import {task,planningState} from './helpers/planning.js';
const rules=[{id:'hpdl',name:'HPDL',enabled:true,type:'titleContains',value:' HPDL ',minutes:30},{id:'course',name:'EPSY',enabled:true,type:'contextIs',value:'course_456',minutes:60}];
test('manual estimates override ordered rules and clearing restores the first matching rule',()=>{
 const state=planningState();state.settings.rules=rules;state.estimates['assignment:1']=90;
 assert.equal(resolveEstimate(task({title:'hpdl 1'}),state).minutes,90);
 delete state.estimates['assignment:1'];assert.equal(resolveEstimate(task({title:'hpdl 1'}),state).minutes,30);
 assert.equal(resolveEstimate(task({title:'hpdl 1'}),state).ruleId,'hpdl');
 state.settings.rules=[rules[1],rules[0]];assert.equal(resolveEstimate(task({title:'hpdl 1'}),state).minutes,60);
 state.settings.rules=[{...rules[0],enabled:false}];assert.equal(resolveEstimate(task({title:'hpdl 1'}),state).source,'default');
});
test('invalid rules and unordered pressure thresholds cannot be saved',()=>{
 for(const patch of [{defaultMinutes:0},{defaultMinutes:1.5},{defaultMinutes:1441},{yellowFrom:6,redFrom:3},{rules:[{...rules[0],value:' '}]},{rules:[rules[0],rules[0]]}]){
  const result=validateSettings({...defaultSettings(),...patch});assert.equal(result.value,null);assert.ok(result.errors.length);
 }
 assert.equal(validateSettings({...defaultSettings(),rules}).errors.length,0);
});
test('defaults are independent and enforce sensible time windows and rest days',()=>{
 const one=defaultSettings();one.schedule.weekdays[0].maxMinutes=0;
 assert.equal(defaultSettings().schedule.weekdays[0].maxMinutes,240);
 assert.deepEqual(defaultSettings().schedule.weekdays[0],{start:'09:00',end:'21:00',maxMinutes:240});
 assert.equal(resolveEstimate(task(),planningState()).minutes,60);
 assert.ok(validateSettings({...defaultSettings(),schedule:{...one.schedule,weekdays:[{start:'22:00',end:'09:00',maxMinutes:60},...one.schedule.weekdays.slice(1)]}}).errors.length);
});
