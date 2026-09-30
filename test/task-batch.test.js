import test from 'node:test';import assert from 'node:assert/strict';
import {createPlannerStore} from '../src/storage.js';import {memoryStorage} from './helpers/planning.js';
const make=area=>createPlannerStore(area,'canvas.illinois.edu',77);
test('batch effort, completion and targets persist across instances and remain account isolated',async()=>{
 const area=memoryStorage(),store=make(area),keys=['assignment:1','assignment:2'];
 await store.applyTaskBatch(keys,{completed:true,estimate:90,target:{day:'2026-10-01',time:'20:00'}});
 const state=await make(area).loadPlanningState();assert.deepEqual(state.estimates,{'assignment:1':90,'assignment:2':90});assert.equal(state.targets['assignment:1'].day,'2026-10-01');
 assert.deepEqual((await store.load()).completed,{'assignment:1':true,'assignment:2':true});
 assert.deepEqual((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).targets,{});
});
test('undo restores overrides and skips values edited since the batch',async()=>{
 const area=memoryStorage(),store=make(area);await store.setEstimate('assignment:1',30);
 const undo=await store.applyTaskBatch(['assignment:1','assignment:2'],{estimate:90});
 await store.setEstimate('assignment:2',120);const result=await store.undoTaskBatch(undo);
 assert.equal(result.skipped,1);assert.deepEqual((await store.loadPlanningState()).estimates,{'assignment:1':30,'assignment:2':120});
 await assert.rejects(createPlannerStore(area,'canvas.illinois.edu',88).undoTaskBatch(undo),/account/i);
});
test('invalid batches write nothing and failed writes preserve prior state',async()=>{
 const area=memoryStorage(),store=make(area);
 await assert.rejects(store.applyTaskBatch(['assignment:1'],{estimate:0}));
 await assert.rejects(store.applyTaskBatch(['assignment:1'],{target:{day:'2026-02-30',time:null}}));assert.deepEqual(area.entries,{});
 area.set=async()=>{throw new Error('Storage is full');};await assert.rejects(store.applyTaskBatch(['assignment:1'],{completed:true}),/full/);assert.deepEqual((await store.load()).completed,{});
});
test('resetting bulk overrides restores automatic estimates and unset targets',async()=>{
 const area=memoryStorage(),store=make(area);const keys=['assignment:1'];
 await store.applyTaskBatch(keys,{estimate:90,target:{day:'2026-10-01',time:null},completed:true});
 const undo=await store.applyTaskBatch(keys,{estimate:null,target:null,completed:false});
 assert.deepEqual((await store.loadPlanningState()).estimates,{});assert.deepEqual((await store.loadPlanningState()).targets,{});assert.deepEqual((await store.load()).completed,{});
 await store.undoTaskBatch(undo);assert.equal((await store.loadPlanningState()).estimates['assignment:1'],90);
});

test('task preferences and new history defaults survive old settings without invalidating plans',async()=>{
 const area=memoryStorage(),store=make(area);const settings=(await store.loadPlanningState()).settings;delete settings.historyFilter;
 area.entries['canvas-planner:canvas.illinois.edu:77:settings:v1']=settings;
 assert.deepEqual((await store.loadPlanningState()).settings.historyFilter,{mode:'semester',months:4});
 await store.setTaskPreferences({sort:'titleDesc',group:'course',query:'Essay'});
 assert.equal((await make(area).loadPlanningState()).taskPreferences.sort,'titleDesc');
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).taskPreferences.query,'');
});

test('undo cannot erase an edit racing its asynchronous storage read',async()=>{
 const area=memoryStorage(),store=make(area);await store.setEstimate('assignment:1',30);const token=await store.applyTaskBatch(['assignment:1'],{estimate:90});
 const get=area.get.bind(area);let release,entered;const readStarted=new Promise(resolve=>{entered=resolve;});let pause=true;
 area.get=async()=>{const snapshot=await get();if(pause){pause=false;entered();await new Promise(resolve=>{release=resolve;});}return snapshot;};
 const undo=store.undoTaskBatch(token);await readStarted;const newer=make(area).setEstimate('assignment:1',120);release();await Promise.all([undo,newer]);
 assert.equal((await store.loadPlanningState()).estimates['assignment:1'],120);
});
test('undo detects newer same-value and ABA edits using write identity',async()=>{
 const area=memoryStorage(),store=make(area);await store.setEstimate('assignment:1',30);const token=await store.applyTaskBatch(['assignment:1'],{estimate:90});
 await store.setEstimate('assignment:1',120);await store.setEstimate('assignment:1',90);
 assert.equal((await store.undoTaskBatch(token)).skipped,1);assert.equal((await store.loadPlanningState()).estimates['assignment:1'],90);
 const complete=await store.applyTaskBatch(['assignment:2'],{completed:true});await make(area).setCompleted('assignment:2',true);assert.equal((await store.undoTaskBatch(complete)).skipped,1);
});
test('malformed saved task preferences fall back without blocking calendar loading',async()=>{
 const area=memoryStorage(),store=make(area);area.entries['canvas-planner:canvas.illinois.edu:77:task-preferences']=null;
 assert.equal((await store.loadPlanningState()).taskPreferences.sort,'dueAsc');
});
