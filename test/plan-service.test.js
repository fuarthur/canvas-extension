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
test('a null work block in one archive does not prevent loading other planning data',async()=>{
 const area=memoryStorage(),prefix='canvas-planner:canvas.illinois.edu:77:plan:';
 const broken=plan({id:'broken',segments:[null]}),healthy=plan();
 await area.set({[prefix+'broken']:broken,[prefix+healthy.id]:healthy});
 const store=createPlannerStore(area,'canvas.illinois.edu',77);
 await store.setEstimate('assignment:1',90);
 const state=await store.loadPlanningState();
 assert.deepEqual(Object.keys(state.plans),['plan-1']);
 assert.equal(state.estimates['assignment:1'],90);
 assert.equal(state.warnings.length,1);
 assert.match(state.warnings[0],/broken/);
 assert.deepEqual(area.entries[prefix+'broken'],broken);
});
test('a plan request containing a null work block is rejected without mutating storage',async()=>{
 const area=memoryStorage(),service=createPlanService({storageArea:area});
 const result=await service.handle({type:'PLAN_SAVE',userId:77,plan:plan({segments:[null]}),expectedRevision:0},sender);
 assert.equal(result.code,'INVALID');
 assert.deepEqual(area.entries,{});
});
test('an archive extending to the last supported date is rejected without interrupting recovery',async()=>{
 const area=memoryStorage(),key='canvas-planner:canvas.illinois.edu:77:plan:far-future';
 const broken=plan({id:'far-future',range:{startDate:'2026-10-01',endDate:'9999-12-31'}});
 await area.set({[key]:broken});
 const state=await createPlannerStore(area,'canvas.illinois.edu',77).loadPlanningState();
 assert.deepEqual(state.plans,{});assert.equal(state.warnings.length,1);assert.deepEqual(area.entries[key],broken);
});
test('foreign senders and invalid archive fields cannot mutate storage',async()=>{
 const area=memoryStorage();const service=createPlanService({storageArea:area});
 for(const s of [{url:'https://evil.example/calendar'},{url:'https://canvas.illinois.edu/courses/1'}])assert.equal((await service.handle({type:'PLAN_SAVE',userId:77,plan:plan(),expectedRevision:0},s)).code,'INVALID');
 assert.equal((await service.handle({type:'PLAN_SAVE',userId:77,plan:plan({id:'../bad'}),expectedRevision:0},sender)).code,'INVALID');assert.deepEqual(area.entries,{});
});
