import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPlannerController} from '../src/planner-view.js';
import {createPlannerStore} from '../src/storage.js';
import {task, plan, planningState, memoryStorage} from './helpers/planning.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup({event = false, canvasCompleted = false, language = 'en', saveGate, failAsResult = false} = {}) {
  const dom = new JSDOM('<main></main>');
  const area = memoryStorage();
  const store = createPlannerStore(area, 'canvas.illinois.edu', 77);
  const item = task(event ? {key:'event:1', type:'event', title:'Study group', fixedStartAt:'2026-10-01T14:00:00Z', fixedEndAt:'2026-10-01T15:00:00Z', completed:canvasCompleted, canvasCompleted} : {completed:canvasCompleted, canvasCompleted});
  const saved = plan({revision:1, tasks:{[item.key]:{...item, estimateMinutes:60}}, segments:event ? [] : [
    {id:'block-1', itemKey:item.key, startAt:'2026-10-01T14:00:00Z', endAt:'2026-10-01T14:30:00Z', locked:false, order:0},
    {id:'block-2', itemKey:item.key, startAt:'2026-10-02T14:00:00Z', endAt:'2026-10-02T14:30:00Z', locked:false, order:1}
  ]});
  const state = planningState({plans:{[saved.id]:saved}});
  state.settings.language = language;
  let controller;
  controller = createPlannerController({document:dom.window.document, items:[item], state, completed:{}, now:()=>new Date('2026-10-01T12:00:00Z'), timeZone:'America/Chicago', loadedRange:{startDate:'2026-10-01', endDate:'2026-12-31'},
    onComplete:async (key, value) => {
      if(saveGate) await saveGate();
      try { await store.setCompleted(key, value); }
      catch(error) { if(failAsResult) return false; throw error; }
      const userState = await store.load();
      controller.setData({completed:userState.completed, items:[{...item, completed:Boolean(item.canvasCompleted || userState.completed[item.key])}]});
      return true;
    }
  });
  const root = controller.render();
  dom.window.document.querySelector('main').append(root);
  const click = async id => { const button = [...root.querySelectorAll('[data-control-id]')].find(n => n.dataset.controlId === id); assert.ok(button, `Missing ${id}`); button.click(); await settle(); };
  const control = id => [...root.querySelectorAll('[data-control-id]')].find(n => n.dataset.controlId === id);
  const close = () => {controller.destroy(); dom.window.close();};
  return {dom, root, store, area, saved, item, controller, click, control, close};
}

// Removing task-wide completion, its persistence, or reopening must break this flow.
test('completing from the block editor persists and updates every block, the pool and remaining workload', async () => {
  const s = await setup();
  try {
    await s.click('Edit block block-1');
    s.control('Complete task in editor').focus();
    await s.click('Complete task in editor');
    assert.equal((await s.store.load()).completed['assignment:1'], true);
    assert.equal(s.root.querySelectorAll('.week-block.completed').length, 2);
    assert.equal(s.root.querySelectorAll('.week-block-completed').length, 2);
    assert.equal(s.root.querySelector('[data-pool-task="assignment:1"]'), null);
    assert.match(s.root.querySelectorAll('.week-day-header')[4].textContent, /0 tasks · 0 min/);
    assert.match(s.root.textContent, /Saved plan/);
    assert.ok(s.control('Reopen task in editor'));
    assert.equal(s.dom.window.document.activeElement, s.control('Reopen task in editor'));
    await s.click('Reopen task in editor');
    assert.equal((await s.store.load()).completed['assignment:1'], undefined);
    assert.equal(s.root.querySelectorAll('.week-block.completed').length, 0);
    assert.ok(s.root.querySelector('[data-pool-task="assignment:1"]'));
    assert.match(s.root.querySelectorAll('.week-day-header')[4].textContent, /1 tasks · 30 min/);
    assert.ok(s.control('Complete task in editor'));
    assert.equal(s.root.querySelectorAll('[data-segment-id]').length, 2);
  } finally {s.close();}
});

// Updating completion before a successful write would incorrectly remove work on failure.
for (const failAsResult of [false, true]) test(`completion waits for storage and can retry a ${failAsResult ? 'reported' : 'thrown'} save failure`, async () => {
  let release;
  const s = await setup({failAsResult, saveGate:()=>new Promise(resolve => {release=resolve;})});
  try {
    await s.click('Edit block block-1');
    const minutes = s.control('Work minutes'); minutes.value = '25';
    const originalSet = s.area.set;
    s.area.set = async () => {throw new Error('Storage unavailable');};
    s.control('Complete task in editor').focus();
    await s.click('Complete task in editor');
    assert.equal(s.control('Complete task in editor').disabled, true);
    assert.equal(s.control('Complete Essay').disabled, true);
    assert.equal(s.root.querySelectorAll('.week-block.completed').length, 0);
    release(); await settle();
    assert.equal(s.control('Complete task in editor').disabled, false);
    assert.equal(s.dom.window.document.activeElement, s.control('Complete task in editor'));
    assert.ok(s.root.querySelector('.plan-completion-error[role="alert"]'));
    assert.equal(s.control('Work minutes').value, '25');
    assert.equal((await s.store.load()).completed['assignment:1'], undefined);
    s.area.set = originalSet;
    await s.click('Complete task in editor'); release(); await settle();
    assert.equal((await s.store.load()).completed['assignment:1'], true);
    assert.equal(s.root.querySelector('.plan-completion-error'), null);
  } finally {s.close();}
});

test('a failed menu completion remains visible even when scheduled tasks are collapsed', async () => {
  const s = await setup();
  try {
    s.root.querySelector('.week-block-actions').open = true;
    s.area.set = async () => {throw new Error('Storage unavailable');};
    await s.click('Complete Essay');
    assert.ok(s.root.querySelector('.week-block-actions[open] .plan-completion-error[role="alert"]'));
    assert.equal(s.root.querySelectorAll('.week-block.completed').length, 0);
  } finally {s.close();}
});

test('fixed calendar events open a completion panel while retaining their original time', async () => {
  const s = await setup({event:true, language:'zh-CN'});
  try {
    await s.click('View event Study group');
    assert.equal(s.control('Complete task in editor').textContent, '标记为完成');
    assert.equal(s.control('Work date'), undefined);
    await s.click('Complete task in editor');
    assert.equal((await s.store.load()).completed['event:1'], true);
    const block = s.root.querySelector('[data-fixed-event="event:1"]');
    assert.ok(block.classList.contains('completed'));
    assert.match(block.querySelector('.week-block-time').textContent, /09:00–10:00/);
    assert.equal(s.control('Reopen task in editor').textContent, '撤销完成');
    assert.equal(s.saved.tasks['event:1'].fixedStartAt, '2026-10-01T14:00:00Z');
    await s.click('Reopen task in editor');
    assert.equal(s.root.querySelectorAll('.week-block.completed').length, 0);
  } finally {s.close();}
});

test('Canvas-completed work shows a read-only status without offering a local reopen', async () => {
  const s = await setup({canvasCompleted:true});
  try {
    await s.click('Edit block block-1');
    assert.match(s.root.querySelector('.week-selected-editor').textContent, /Completed in Canvas/);
    assert.equal(s.control('Complete task in editor'), undefined);
    assert.equal(s.control('Reopen task in editor'), undefined);
  } finally {s.close();}
});

test('a new Canvas submission replaces the saved completion source in the editor and menu', async () => {
  const s = await setup();
  try {
    s.controller.setData({items:[{...s.item, completed:true, canvasCompleted:true}]});
    await s.click('Edit block block-1');
    assert.match(s.root.querySelector('.week-selected-editor').textContent, /Completed in Canvas/);
    assert.equal(s.control('Reopen task in editor'), undefined);
    assert.equal(s.control('Reopen Essay'), undefined);
  } finally {s.close();}
});
