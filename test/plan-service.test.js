import test from 'node:test';import assert from 'node:assert/strict';
import {createPlanService} from '../src/plan-service.js';import {createPlanClient} from '../src/plan-client.js';
import {createPlannerStore} from '../src/storage.js';import {plan,memoryStorage,settings} from './helpers/planning.js';
const sender={url:'https://canvas.illinois.edu/calendar',tab:{id:1}};
test('planning state survives reopening independently of old state and other users',async()=>{
 const area=memoryStorage();const store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setCompleted('assignment:1',true);await store.setEstimate('assignment:1',30);await store.setSingleSession('assignment:1',true);await store.setSettings(settings({defaultMinutes:45}));
 const reopened=createPlannerStore(area,'canvas.illinois.edu',77);const state=await reopened.loadPlanningState();
 assert.equal(state.estimates['assignment:1'],30);assert.equal(state.singleSessions['assignment:1'],true);assert.equal(state.settings.defaultMinutes,45);assert.equal((await reopened.load()).completed['assignment:1'],true);
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',88).loadPlanningState()).settings.defaultMinutes,60);
 await store.setEstimate('assignment:1',null);assert.equal((await store.loadPlanningState()).estimates['assignment:1'],undefined);
});
test('concurrent saves with one revision reject stale changes and isolate other plans',async()=>{
 const area=memoryStorage();const service=createPlanService({storageArea:area,now:()=>new Date('2026-10-01T12:00:00Z')});
 const client=createPlanClient({userId:77,sendMessage:m=>service.handle(m,sender)});
 const first=await client.save(plan(),0);assert.equal(first.plan.revision,1);
 const results=await Promise.all([client.save({...first.plan,name:'A'},1),client.save({...first.plan,name:'B'},1)]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'CONFLICT');
 assert.equal((await client.save(plan({id:'plan-2'}),0)).ok,true);
 assert.equal((await client.remove('plan-1',1)).code,'CONFLICT');assert.equal((await client.remove('plan-1',2)).ok,true);
 assert.equal((await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState()).plans['plan-2'].revision,1);
});
test('corrupt and unknown schemas are preserved but not treated as valid plans',async()=>{
 const area=memoryStorage();area.entries['canvas-planner:canvas.illinois.edu:77:settings:v1']={schemaVersion:9};area.entries['canvas-planner:canvas.illinois.edu:77:plan:old']={schemaVersion:9};
 const state=await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState();assert.equal(state.settings.defaultMinutes,60);assert.deepEqual(state.plans,{});assert.equal(state.warnings.length,2);assert.ok(area.entries['canvas-planner:canvas.illinois.edu:77:plan:old']);
});
test('foreign senders and invalid archive fields cannot mutate storage',async()=>{
 const area=memoryStorage();const service=createPlanService({storageArea:area});
 for(const s of [{url:'https://evil.example/calendar'},{url:'https://canvas.illinois.edu/courses/1'}])assert.equal((await service.handle({type:'PLAN_SAVE',userId:77,plan:plan(),expectedRevision:0},s)).code,'INVALID');
 assert.equal((await service.handle({type:'PLAN_SAVE',userId:77,plan:plan({id:'../bad'}),expectedRevision:0},sender)).code,'INVALID');assert.deepEqual(area.entries,{});
});
