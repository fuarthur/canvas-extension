import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultReminderSettings,validateReminderSettings,normalizeReminderSettings,reminderMinutes,resizeReminderRounds} from '../src/reminder-settings.js';
import {defaultSettings} from '../src/planning-settings.js';
import {createPlannerStore} from '../src/storage.js';
import {memoryStorage} from './helpers/planning.js';

test('defaults remain opt-in and time units are exact',()=>{
 assert.deepEqual(defaultReminderSettings(),{enabled:false,leadMinutes:[120]});
 assert.equal(reminderMinutes(.5,'hours'),30);assert.equal(reminderMinutes(.5,'minutes'),null);
 assert.equal(reminderMinutes(30,'days'),43200);assert.equal(reminderMinutes(31,'days'),null);
 const a=defaultReminderSettings();a.leadMinutes.push(30);assert.deepEqual(defaultReminderSettings().leadMinutes,[120]);
});
test('limits sorting and duplicates follow the spec',()=>{
 assert.deepEqual(validateReminderSettings({enabled:true,leadMinutes:[120,1440,120]}).value,{enabled:true,leadMinutes:[1440,120]});
 for(const leadMinutes of [[0],[43201],[NaN],[Infinity],[],[1,2,3,4,5,6],['120']])assert.equal(validateReminderSettings({enabled:true,leadMinutes}).value,null);
 assert.equal(validateReminderSettings({enabled:'true',leadMinutes:[120]}).value,null);
 assert.deepEqual(normalizeReminderSettings(null),defaultReminderSettings());
 assert.deepEqual(resizeReminderRounds([120],3),[1440,360,120]);
 assert.deepEqual(resizeReminderRounds([1440,360,120],1),[120]);
});
test('invalid reminder field preserves unrelated old settings',async()=>{
 const area=memoryStorage(),key='canvas-planner:canvas.illinois.edu:77:settings:v1';
 const original={...defaultSettings(),defaultMinutes:45,reminders:{enabled:true,leadMinutes:[0]}};
 await area.set({[key]:original});const store=createPlannerStore(area,'canvas.illinois.edu',77);
 const state=await store.loadPlanningState();assert.equal(state.settings.defaultMinutes,45);
 assert.deepEqual(state.settings.reminders,defaultReminderSettings());assert.ok(state.warnings.length);
 assert.deepEqual(area.entries[key],original);assert.deepEqual((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).settings.reminders,defaultReminderSettings());
 await assert.rejects(store.setSettings(original));
 delete original.reminders;await store.setSettings(original);assert.deepEqual((await store.loadPlanningState()).settings.reminders,defaultReminderSettings());
});
