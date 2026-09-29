import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerStore } from '../src/storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async get(key) { return { [key]: structuredClone(values.get(key)) }; },
    async set(entries) { for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value)); }
  };
}

test('plan start, completion and viewed month survive a new store instance', async () => {
  const storage = memoryStorage();
  const store = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await store.setStart('assignment:987', '2026-09-02');
  await store.setCompleted('assignment:987', true);
  await store.setLastMonth('2026-09');
  assert.deepEqual(await createPlannerStore(storage, 'canvas.illinois.edu', 77).load(), {
    starts: { 'assignment:987': '2026-09-02' },
    completed: { 'assignment:987': true },
    lastMonth: '2026-09'
  });
});

test('clearing a plan start and reversing completion removes saved choices', async () => {
  const storage = memoryStorage();
  const store = createPlannerStore(storage, 'canvas.illinois.edu', 77);
  await store.setStart('assignment:987', '2026-09-02');
  await store.setCompleted('assignment:987', true);
  await store.setStart('assignment:987', null);
  await store.setCompleted('assignment:987', false);
  assert.deepEqual(await store.load(), { starts: {}, completed: {}, lastMonth: null });
});

test('two Canvas users and hostnames never share local choices', async () => {
  const storage = memoryStorage();
  await createPlannerStore(storage, 'canvas.illinois.edu', 77).setCompleted('event:5', true);
  assert.deepEqual((await createPlannerStore(storage, 'canvas.illinois.edu', 88).load()).completed, {});
  assert.deepEqual((await createPlannerStore(storage, 'other.canvas.edu', 77).load()).completed, {});
  assert.equal(storage.values.size, 1);
});
