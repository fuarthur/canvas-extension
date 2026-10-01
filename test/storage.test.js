import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerStore } from '../src/storage.js';
import { defaultSettings } from '../src/planning-settings.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async get(key) {
      if (key == null) return Object.fromEntries([...values].map(([name, value]) => [name, structuredClone(value)]));
      return { [key]: structuredClone(values.get(key)) };
    },
    async set(entries) { for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value)); },
    async remove(key) { values.delete(key); }
  };
}

test('old settings opt out of native completion and new preference is account isolated',async()=>{
 const storage=memoryStorage();const first=createPlannerStore(storage,'canvas.illinois.edu',77);
 const old=defaultSettings();delete old.nativeCalendarCompletion;await first.setSettings(old);
 assert.equal((await first.loadPlanningState()).settings.nativeCalendarCompletion,false);
 await first.setSettings({...old,nativeCalendarCompletion:true});
 assert.equal((await createPlannerStore(storage,'canvas.illinois.edu',77).loadPlanningState()).settings.nativeCalendarCompletion,true);
 assert.equal((await createPlannerStore(storage,'canvas.illinois.edu',88).loadPlanningState()).settings.nativeCalendarCompletion,false);
 await assert.rejects(first.setSettings({...old,nativeCalendarCompletion:'true'}));
});

test('plan start and completion survive a new store instance', async () => {
  const storage = memoryStorage();
  const store = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await store.setStart('assignment:987', '2026-09-02');
  await store.setCompleted('assignment:987', true);
  assert.deepEqual(await createPlannerStore(storage, 'canvas.illinois.edu', 77).load(), {
    starts: { 'assignment:987': '2026-09-02' },
    completed: { 'assignment:987': true }
  });
});

test('clearing a plan start and reversing completion removes saved choices', async () => {
  const storage = memoryStorage();
  const store = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await store.setStart('assignment:987', '2026-09-02');
  await store.setCompleted('assignment:987', true);
  await store.setStart('assignment:987', null);
  await store.setCompleted('assignment:987', false);
  assert.deepEqual(await store.load(), { starts: {}, completed: {} });
});

test('two Canvas users and hostnames never share local choices', async () => {
  const storage = memoryStorage();
  await createPlannerStore(storage, 'canvas.illinois.edu', 77).setCompleted('event:5', true);
  assert.deepEqual((await createPlannerStore(storage, 'canvas.illinois.edu', 88).load()).completed, {});
  assert.deepEqual((await createPlannerStore(storage, 'other.canvas.edu', 77).load()).completed, {});
  assert.deepEqual((await createPlannerStore(storage, 'canvas.illinois.edu',77).load()).completed,{'event:5':true});
});

test('overlapping edits from different tabs preserve independent choices', async () => {
  const storage = memoryStorage();
  const first = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  const second = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await Promise.all([
    first.setStart('assignment:987', '2026-09-02'),
    second.setCompleted('assignment:987', true)
  ]);
  assert.deepEqual(await first.load(), {
    starts: { 'assignment:987': '2026-09-02' },
    completed: { 'assignment:987': true }
  });
});

test('calendar selection survives reopening, supports selecting none, and is account isolated', async () => {
  const storage = memoryStorage();
  const store = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await store.setSelectedCalendars(['course_1']);
  assert.deepEqual((await createPlannerStore(storage, 'canvas.illinois.edu', 77).load()).selectedCalendars, ['course_1']);
  assert.equal((await createPlannerStore(storage, 'canvas.illinois.edu', 88).load()).selectedCalendars, undefined);
  await store.setSelectedCalendars([]);
  assert.deepEqual((await store.load()).selectedCalendars, []);
});
