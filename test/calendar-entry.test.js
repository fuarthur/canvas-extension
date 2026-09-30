import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as view from '../src/view.js';

const controls = `<span class="calendar_view_buttons btn-group" role="tablist">
  <button id="week" class="btn calendar-button" role="tab" aria-selected="false">Week</button>
  <button id="month" class="btn calendar-button active" role="tab" aria-selected="true">Month</button>
  <button id="agenda" class="btn" role="tab" aria-selected="false">Agenda</button>
</span>`;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('page entry opens the current Canvas month without switching native views', async () => {
  assert.equal(typeof view.mountCalendarEntry, 'function');
  const dom = new JSDOM(controls, { url: 'https://canvas.illinois.edu/calendar#view_start=2026-09-01' });
  const { document } = dom.window;
  const original = document.querySelector('.calendar_view_buttons').innerHTML;
  const host = document.createElement('div');
  const planner = view.mountPlanner({
    host, initialMonth: '2026-08',
    loadSnapshot: async () => ({ profile: { id: 77 }, contexts: [], events: [], assignments: [] }),
    storeFactory: () => ({ load: async () => ({ starts: {}, completed: {} }) })
  });
  let nativeClicks = 0;
  document.querySelector('.calendar_view_buttons').addEventListener('click', () => nativeClicks++);
  const removeEntry = view.mountCalendarEntry({ document, onOpen: () => planner.show(view.monthFromCalendarHash(dom.window.location.hash)) });
  document.querySelector('button[aria-label="Open planning calendar"]').click();
  await settle();
  assert.equal(host.isConnected, true);
  assert.equal(host.shadowRoot.querySelector('.month-name').textContent, 'September 2026');
  assert.equal(nativeClicks, 0);
  host.shadowRoot.querySelector('[aria-label="Close planning calendar"]').click();
  dom.window.location.hash = 'view_start=2026-10-01';
  document.querySelector('button[aria-label="Open planning calendar"]').click();
  await settle();
  assert.equal(host.shadowRoot.querySelector('.month-name').textContent, 'October 2026');
  removeEntry();
  assert.equal(document.querySelector('.calendar_view_buttons').innerHTML, original);
  planner.destroy();
  dom.window.close();
});

test('entry appears with delayed controls and survives replacement without duplicates', async () => {
  assert.equal(typeof view.mountCalendarEntry, 'function');
  const dom = new JSDOM('<main></main>');
  const { document } = dom.window;
  const removeEntry = view.mountCalendarEntry({ document, onOpen: () => {} });
  document.querySelector('main').innerHTML = controls;
  await settle();
  assert.equal(document.querySelectorAll('[aria-label="Open planning calendar"]').length, 1);
  document.querySelector('main').innerHTML = controls;
  await settle();
  assert.equal(document.querySelectorAll('[aria-label="Open planning calendar"]').length, 1);
  document.querySelector('#agenda').append(' ');
  await settle();
  assert.equal(document.querySelectorAll('[aria-label="Open planning calendar"]').length, 1);
  removeEntry();
  document.querySelector('main').innerHTML = controls;
  await settle();
  assert.equal(document.querySelectorAll('[aria-label="Open planning calendar"]').length, 0);
  dom.window.close();
});
