import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {renderPlanningSettings} from '../src/settings-view.js';import {planningState} from './helpers/planning.js';
const settle=()=>new Promise(r=>setTimeout(r,0));
test('native calendar completion is opt-in and saves with planning settings',async()=>{
 const dom=new JSDOM('');let saved;
 const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async value=>{saved=value;}});
 const toggle=root.querySelector('[data-control-id="Show extension completion on Canvas calendar"]');
 assert.ok(toggle);assert.equal(toggle.checked,false);
 toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));
 root.querySelector('[data-control-id="Save planning settings"]').click();await settle();
 assert.equal(saved.nativeCalendarCompletion,true);dom.window.close();
});
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

test('historical homework policy saves configurable months and rejects invalid cutoffs',async()=>{
 const dom=new JSDOM('');let saved;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[],onSave:async value=>{saved=value;}});
 const mode=root.querySelector('[data-control-id="Historical homework mode"]');assert.ok(mode);mode.value='months';mode.dispatchEvent(new dom.window.Event('change'));
 const months=root.querySelector('[data-control-id="Ignore overdue older than months"]');months.value='0';months.dispatchEvent(new dom.window.Event('change'));root.querySelector('[data-control-id="Save planning settings"]').click();await settle();assert.equal(saved,undefined);
 months.value='3';months.dispatchEvent(new dom.window.Event('change'));root.querySelector('[data-control-id="Save planning settings"]').click();await settle();assert.deepEqual(saved.historyFilter,{mode:'months',months:3});dom.window.close();
});

test('advanced settings stay editable through collapse and reveal validation errors',async()=>{
 const dom=new JSDOM('<main/>');let saved;const root=renderPlanningSettings({document:dom.window.document,state:planningState(),contexts:[{code:'course_456',name:'EPSY 456'}],onSave:async value=>{saved=value;}});dom.window.document.querySelector('main').append(root);
 const rules=root.querySelector('.estimate-rules-settings');assert.ok(rules);assert.equal(rules.open,false);rules.open=true;
 root.querySelector('[data-control-id="Add estimate rule"]').click();const match=root.querySelector('[data-control-id="Rule 1 match"]');match.value='Essay';match.dispatchEvent(new dom.window.Event('change'));
 rules.open=false;rules.open=true;assert.equal(root.querySelector('[data-control-id="Rule 1 match"]').value,'Essay');
 const red=root.querySelector('[data-control-id="Red pressure starts at"]');red.value='2';red.dispatchEvent(new dom.window.Event('change'));root.querySelector('.estimate-default-settings').open=false;
 root.querySelector('[data-control-id="Save planning settings"]').click();await settle();assert.equal(saved,undefined);assert.equal(root.querySelector('.estimate-default-settings').open,true);assert.match(root.textContent,/thresholds/);dom.window.close();
});
