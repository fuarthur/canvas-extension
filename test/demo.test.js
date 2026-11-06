import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createDemoStorage} from '../demo/storage.js';
import {createDemoData, seedDemo, DEMO_NOW} from '../demo/data.js';
import {normalizeItems} from '../src/model.js';
import {createPlannerStore} from '../src/storage.js';
import {generateSchedule} from '../src/scheduler.js';

test('demo saves survive reload, isolate scenarios, and reset only the selected demo', async () => {
  const dom = new JSDOM('', {url: 'http://localhost'});
  const local = dom.window.localStorage;
  local.setItem('unrelated', 'keep');
  const first = createDemoStorage(local, 'standard');
  await first.set({estimate: 90, completion: true});
  const reloaded = createDemoStorage(local, 'standard');
  assert.deepEqual(await reloaded.get(null), {estimate: 90, completion: true});
  const other = createDemoStorage(local, 'capacity');
  await other.set({estimate: 30});
  await reloaded.reset();
  assert.deepEqual(await first.get(null), {});
  assert.deepEqual(await other.get(null), {estimate: 30});
  assert.equal(local.getItem('unrelated'), 'keep');
  dom.window.close();
});

test('a failed demo save preserves the previous data and retry succeeds', async () => {
  const dom = new JSDOM('', {url: 'http://localhost'});
  const area = createDemoStorage(dom.window.localStorage, 'standard');
  await area.set({estimate: 60});
  area.failNextWrite();
  await assert.rejects(area.set({estimate: 90}), /save failed/i);
  assert.deepEqual(await area.get(null), {estimate: 60});
  await area.set({estimate: 90});
  assert.deepEqual(await area.get(null), {estimate: 90});
  dom.window.close();
});

test('corrupt demo storage is reported without overwriting saved bytes', async () => {
  const dom = new JSDOM('', {url: 'http://localhost'});
  const area = createDemoStorage(dom.window.localStorage, 'standard');
  await area.set({estimate: 60});
  const key = dom.window.localStorage.key(0);
  dom.window.localStorage.setItem(key, '{broken');
  await assert.rejects(area.get(null), /reset demo/i);
  await assert.rejects(area.set({estimate: 90}), /reset demo/i);
  assert.equal(dom.window.localStorage.getItem(key), '{broken');
  dom.window.close();
});

test('interleaved demo writes from two adapters preserve unrelated saved fields', async () => {
  let raw = '{}', interleave = false, secondSave;
  const local = {
    getItem() { const snapshot = raw; if (interleave) { interleave = false; secondSave = second.set({plan: 'saved by another tab'}); } return snapshot; },
    setItem(_key, value) { raw = value; }, removeItem() { raw = null; }
  };
  const first = createDemoStorage(local, 'standard'), second = createDemoStorage(local, 'standard');
  interleave = true;
  await first.set({estimate: 90});
  await secondSave;
  assert.deepEqual(await first.get(null), {estimate: 90, plan: 'saved by another tab'});
});

for (const scenario of ['standard', 'capacity']) {
  test(`${scenario} demo uses duplicate-safe data and exposes complete or explicit partial scheduling`, async () => {
    const dom = new JSDOM('', {url: 'http://localhost'});
    const area = createDemoStorage(dom.window.localStorage, scenario);
    await seedDemo(area, scenario);
    const before = await area.get(null);
    await seedDemo(area, scenario);
    assert.deepEqual(await area.get(null), before);
    const snapshot = createDemoData(scenario);
    const store = createPlannerStore(area, 'canvas.illinois.edu', snapshot.profile.id);
    const state = await store.loadPlanningState();
    const items = normalizeItems(snapshot, await store.load());
    assert.equal(new Set(items.map(item => item.key)).size, items.length);
    const plan = Object.values(state.plans)[0];
    const result = await generateSchedule({plan, items, now: DEMO_NOW, completed: {}, loadedRange: snapshot.range});
    assert.equal(result.status, scenario === 'standard' ? 'complete' : 'partial');
    if (scenario === 'capacity') {
      assert.deepEqual(result.validation.unassigned, {'assignment:102': 120, 'assignment:103': 90});
      assert.ok(result.issues.some(issue => issue.itemKey === 'assignment:102' && issue.missingMinutes === 120));
    }
    dom.window.close();
  });
}
