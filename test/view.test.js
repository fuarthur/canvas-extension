import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountPlanner, monthFromCalendarHash } from '../src/view.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/canvas-pages.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));

function setup(loadSnapshot = async () => ({
  profile: fixture.profile,
  contexts: [{ code: 'course_1', name: 'Course 1' }],
  events: [fixture.event],
  assignments: [{ ...fixture.assignment, assignment: fixture.assignmentDetail }],
  range: { startDate: '2026-03-01', endDate: '2027-03-31' }
})) {
  const dom = new JSDOM('<main id="native"><h1>Canvas calendar</h1></main>', { url: 'https://canvas.illinois.edu/calendar#view_name=month&view_start=2026-09-01' });
  const host = dom.window.document.createElement('div');
  const saved = { starts: {}, completed: {}, lastMonth: null };
  const store = {
    async load() { return structuredClone(saved); },
    async setStart(key, day) { if (day == null) delete saved.starts[key]; else saved.starts[key] = day; },
    async setCompleted(key, value) { if (value) saved.completed[key] = true; else delete saved.completed[key]; },
    async setLastMonth(month) { saved.lastMonth = month; }
  };
  const planner = mountPlanner({ host, loadSnapshot, storeFactory: () => store, initialMonth: '2026-09', now: new Date('2026-09-15T12:00:00Z') });
  const click = async label => {
    host.shadowRoot.querySelector(`[aria-label="${label}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  return { dom, host, planner, saved, click };
}

test('manifest targets only the Illinois Canvas calendar', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://canvas.illinois.edu/calendar*']);
});

test('calendar hash month is used when valid and falls back to current month', () => {
  assert.equal(monthFromCalendarHash('#view_name=month&view_start=2026-09-01', new Date('2026-01-02T12:00:00Z')), '2026-09');
  assert.equal(monthFromCalendarHash('#view_start=wrong', new Date('2026-01-02T12:00:00Z')), '2026-01');
});

test('toggle opens a single isolated view and closing leaves native nodes unchanged', async () => {
  const { dom, host, planner, click } = setup();
  const native = dom.window.document.querySelector('#native');
  await planner.toggle();
  assert.equal(dom.window.document.body.querySelectorAll('div').length, 1);
  assert.match(host.shadowRoot.textContent, /September 2026/);
  assert.equal(dom.window.document.querySelector('#native'), native);
  await click('Close planning calendar');
  assert.equal(host.isConnected, false);
  assert.equal(native.textContent, 'Canvas calendar');
  await planner.toggle();
  assert.equal(dom.window.document.body.querySelectorAll('div').length, 1);
});

test('month controls, Escape and cross-week bars work without a new Canvas request', async () => {
  let calls = 0;
  const { dom, host, planner, click } = setup(async () => {
    calls++;
    return {
      profile: fixture.profile, contexts: [{ code: 'course_1', name: 'Course 1' }],
      events: [{ ...fixture.event, start_at: '2026-09-04T09:00:00-05:00', end_at: '2026-09-15T10:00:00-05:00' }],
      assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' }
    };
  });
  await planner.toggle();
  assert.ok(host.shadowRoot.querySelectorAll('[data-item-key="event:5"]').length >= 2);
  await click('Next month');
  assert.match(host.shadowRoot.textContent, /October 2026/);
  await click('Previous month');
  assert.match(host.shadowRoot.textContent, /September 2026/);
  await click('Today');
  assert.equal(calls, 1);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(host.isConnected, false);
});

test('detail links to Canvas and saves start date and completion locally', async () => {
  const { host, planner, saved, click, dom } = setup();
  await planner.toggle();
  const assignmentBar = host.shadowRoot.querySelector('[data-item-key="assignment:987"]');
  assert.match(assignmentBar.textContent, /Course 1/);
  assignmentBar.click();
  const link = host.shadowRoot.querySelector('a[aria-label="Open in Canvas"]');
  assert.equal(link.href, fixture.assignment.html_url);
  const date = host.shadowRoot.querySelector('input[aria-label="Plan start date"]');
  date.value = '2026-09-05';
  date.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saved.starts['assignment:987'], '2026-09-05');
  const checkbox = host.shadowRoot.querySelector('input[aria-label="Mark complete"]');
  checkbox.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saved.completed['assignment:987'], true);
});

test('failed loading shows retry and succeeds on the next request', async () => {
  let calls = 0;
  const { host, planner, click } = setup(async () => {
    calls++;
    if (calls === 1) throw new Error('Canvas unavailable');
    return { profile: fixture.profile, contexts: [], events: [], assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' } };
  });
  await planner.toggle();
  assert.match(host.shadowRoot.textContent, /Canvas unavailable/);
  await click('Retry loading');
  assert.equal(calls, 2);
  assert.match(host.shadowRoot.textContent, /September 2026/);
});
