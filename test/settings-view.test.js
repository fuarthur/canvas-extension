import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {renderPlanningSettings} from '../src/settings-view.js';import {planningState} from './helpers/planning.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
test('rules preview their estimate and save separately from calendar selection',async()=>{
 const dom=new JSDOM('');let saved;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[{code:'course_456',name:'EPSY 456'}],onSave:async s=>{saved=s;}});
 root.querySelector('[aria-label="Add estimate rule"]').click();
 const change=(label,value)=>{const input=root.querySelector(`[aria-label="${label}"]`);input.value=value;input.dispatchEvent(new dom.window.Event('change'));};
 change('Rule 1 name','HPDL');change('Rule 1 match','HPDL');change('Rule 1 minutes','30');change('Preview title','HPDL Part 1');
 assert.match(root.querySelector('[data-estimate-preview]').textContent,/30 min/);
 change('Default estimate minutes','45');root.querySelector('[aria-label="Save planning settings"]').click();await settle();assert.equal(saved.defaultMinutes,45);assert.equal(saved.rules[0].minutes,30);
});
test('invalid settings remain editable and show a validation message',async()=>{
 const dom=new JSDOM('');let saved=false;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async()=>{saved=true;}});
 const input=root.querySelector('[aria-label="Red pressure starts at"]');input.value='2';input.dispatchEvent(new dom.window.Event('change'));root.querySelector('[aria-label="Save planning settings"]').click();await settle();assert.equal(saved,false);assert.match(root.textContent,/thresholds/);
});
