import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountPlanner, monthFromCalendarHash } from '../src/view.js';
import * as viewApi from '../src/view.js';
import {createCanvasLoader} from '../src/canvas-api.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/canvas-pages.json', import.meta.url)));
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));

test('initial selection reads only checked native Canvas calendars, with an API fallback when absent', () => {
  const dom = new JSDOM(`<ul>
    <li class="context_list_context" data-context="course_1"><span role="checkbox" aria-checked="true"></span></li>
    <li class="context_list_context" data-context="group_44"><span role="checkbox" aria-checked="false"></span></li>
    <li class="context_list_context" data-context="user_77"><span role="checkbox" aria-checked="true"></span></li>
  </ul>`);
  assert.deepEqual(viewApi.nativeCalendarSelection(dom.window.document), ['course_1', 'user_77']);
  dom.window.document.querySelectorAll('[role="checkbox"]').forEach(box => box.setAttribute('aria-checked', 'false'));
  assert.deepEqual(viewApi.nativeCalendarSelection(dom.window.document), []);
  assert.equal(viewApi.nativeCalendarSelection(new JSDOM('').window.document), undefined);
});

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
    async setSelectedCalendars(codes) { saved.selectedCalendars = codes; },
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

test('hovering a calendar item highlights every week segment, without highlighting other items in its course', async () => {
  const { dom, host, planner } = setup();
  await planner.toggle();
  const bars = [...host.shadowRoot.querySelectorAll('[data-item-key="assignment:987"]')];
  assert.equal(bars.length, 4);
  bars[0].dispatchEvent(new dom.window.MouseEvent('mouseenter'));
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 4);
  assert.ok(bars.every(bar => bar.classList.contains('highlighted')));
  assert.equal(host.shadowRoot.querySelector('[data-item-key="event:5"]').classList.contains('highlighted'), false);
  bars[0].dispatchEvent(new dom.window.MouseEvent('mouseleave'));
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 0);
  bars.at(-1).dispatchEvent(new dom.window.MouseEvent('mouseenter'));
  assert.ok(bars.every(bar => bar.classList.contains('highlighted')));
  planner.destroy();
});

test('keyboard focus links calendar segments and survives pointer exit until focus moves away', async () => {
  const { dom, host, planner } = setup();
  await planner.toggle();
  const bars = [...host.shadowRoot.querySelectorAll('[data-item-key="assignment:987"]')];
  bars[1].focus();
  assert.ok(bars.every(bar => bar.classList.contains('highlighted')));
  bars[1].dispatchEvent(new dom.window.MouseEvent('mouseenter'));
  bars[1].dispatchEvent(new dom.window.MouseEvent('mouseleave'));
  assert.ok(bars.every(bar => bar.classList.contains('highlighted')));
  const event = host.shadowRoot.querySelector('[data-item-key="event:5"]');
  event.focus();
  assert.ok(bars.every(bar => !bar.classList.contains('highlighted')));
  assert.equal(event.classList.contains('highlighted'), true);
  event.blur();
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 0);
  planner.destroy();
});

test('opening calendar details keeps all segments selected across rerenders and clears on detail close', async () => {
  const { host, planner, click } = setup();
  await planner.toggle();
  host.shadowRoot.querySelector('[data-item-key="assignment:987"]').click();
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 4);
  await click('Refresh calendar');
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 4);
  host.shadowRoot.querySelector('[data-item-key="event:5"]').click();
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 1);
  assert.equal(host.shadowRoot.querySelector('.bar.highlighted').dataset.itemKey, 'event:5');
  await click('Close details');
  assert.equal(host.shadowRoot.querySelectorAll('.bar.highlighted').length, 0);
  planner.destroy();
});

test('partial calendar warning is visible alongside the loaded items', async () => {
  const { host, planner } = setup(async () => ({
    profile: fixture.profile, contexts: [{ code: 'course_1', name: 'Course 1' }],
    events: [fixture.event], assignments: [],
    warnings: ['Canvas denied access to these calendars: Old lab group.'],
    range: { startDate: '2026-03-01', endDate: '2027-03-31' }
  }));
  await planner.toggle();
  assert.match(host.shadowRoot.querySelector('[role="status"]').textContent, /Old lab group/);
  assert.ok(host.shadowRoot.querySelector('[data-item-key="event:5"]'));
});

test('configuration saves selection and reloads, and reopening keeps the selection', async () => {
  let savedRef;
  let calls = 0;
  const { host, planner, saved, click } = setup(async () => {
    calls++;
    return {
      profile: fixture.profile,
      contexts: [{ code: 'course_1', name: 'Course 1' }, { code: 'group_44', name: 'Lab group' }],
      selectedCalendars: savedRef?.selectedCalendars || ['course_1', 'group_44'],
      events: [fixture.event], assignments: [],
      range: { startDate: '2026-03-01', endDate: '2027-03-31' }
    };
  });
  savedRef = saved;
  await planner.toggle();
  await click('Calendar settings');
  const group = host.shadowRoot.querySelector('[data-context-code="group_44"]');
  assert.equal(group.checked, true);
  group.click();
  await click('Save calendar selection');
  assert.deepEqual(saved.selectedCalendars, ['course_1']);
  assert.equal(calls, 2);
  assert.equal(host.shadowRoot.querySelector('[role="tab"][aria-selected="true"]').textContent, 'Calendar');
  await planner.toggle();
  await planner.toggle();
  await click('Calendar settings');
  assert.equal(host.shadowRoot.querySelector('[data-context-code="group_44"]').checked, false);
});

test('Canvas completed items show a completed bar and a read-only completion source', async () => {
  const { host, planner } = setup(async () => ({
    profile: fixture.profile, contexts: [{ code: 'course_1', name: 'Course 1' }], events: [],
    assignments: [{ ...fixture.assignment, assignment: { ...fixture.assignmentDetail, user_submitted: true } }],
    range: { startDate: '2026-03-01', endDate: '2027-03-31' }
  }));
  await planner.toggle();
  const bar = host.shadowRoot.querySelector('[data-item-key="assignment:987"]');
  assert.equal(bar.classList.contains('completed'), true);
  bar.click();
  const complete = host.shadowRoot.querySelector('[aria-label="Mark complete"]');
  assert.equal(complete.checked, true);
  assert.equal(complete.disabled, true);
  assert.match(host.shadowRoot.querySelector('.detail').textContent, /Completed in Canvas/);
});

test('reopening settings for another account resets the selection draft', async () => {
  let id = 77;
  const { host, planner, click } = setup(async () => ({
    profile: { ...fixture.profile, id }, contexts: [{ code: 'course_1', name: 'Course 1' }],
    selectedCalendars: id === 77 ? ['course_1'] : [], events: [], assignments: [],
    range: { startDate: '2026-03-01', endDate: '2027-03-31' }
  }));
  await planner.toggle();
  await click('Calendar settings');
  assert.equal(host.shadowRoot.querySelector('[data-context-code="course_1"]').checked, true);
  await planner.toggle();
  id = 88;
  await planner.toggle();
  assert.equal(host.shadowRoot.querySelector('[data-context-code="course_1"]').checked, false);
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

test('reopening verifies the current Canvas user before showing local state', async () => {
  let profileId = 77;
  const stores = new Map();
  const dom = new JSDOM('<main id="native">Canvas calendar</main>', { url: 'https://canvas.illinois.edu/calendar' });
  const host = dom.window.document.createElement('div');
  const snapshot = () => ({ profile: { ...fixture.profile, id: profileId }, contexts: [], events: [fixture.event], assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' } });
  const planner = mountPlanner({ host, loadSnapshot: async () => snapshot(), storeFactory: id => {
    if (!stores.has(id)) stores.set(id, { async load() { return { starts: {}, completed: { 'event:5': id === 77 }, lastMonth: null }; }, async setCompleted() {} });
    return stores.get(id);
  }, initialMonth: '2026-09', now: new Date('2026-09-15T12:00:00Z') });
  await planner.toggle();
  assert.match(host.shadowRoot.querySelector('[data-item-key="event:5"]').textContent, /✓/);
  await planner.toggle();
  profileId = 88;
  await planner.toggle();
  assert.doesNotMatch(host.shadowRoot.querySelector('[data-item-key="event:5"]').textContent, /✓/);
  assert.ok(stores.has(88));
});

test('closing an in-flight refresh cannot leave reopening stuck loading', async () => {
  let resolveRefresh;
  let calls = 0;
  const { host, planner, click } = setup(async () => {
    calls++;
    if (calls === 2) return new Promise(resolve => { resolveRefresh = resolve; });
    return { profile: fixture.profile, contexts: [], events: [], assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' } };
  });
  await planner.toggle();
  host.shadowRoot.querySelector('[aria-label="Refresh calendar"]').click();
  await click('Close planning calendar');
  await planner.toggle();
  resolveRefresh({ profile: fixture.profile, contexts: [], events: [], assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.doesNotMatch(host.shadowRoot.textContent, /Loading Canvas calendar/);
});

test('Today and day highlight use the Canvas profile time zone', async () => {
  const dom = new JSDOM('<main>Canvas calendar</main>', { url: 'https://canvas.illinois.edu/calendar' });
  const host = dom.window.document.createElement('div');
  let current = new Date('2026-10-01T02:00:00Z');
  const planner = mountPlanner({ host, loadSnapshot: async () => ({ profile: { ...fixture.profile, time_zone: 'America/Chicago' }, contexts: [], events: [], assignments: [], range: { startDate: '2026-03-01', endDate: '2027-03-31' } }), storeFactory: () => ({ async load() { return { starts: {}, completed: {} }; }, async setLastMonth() {} }), initialMonth: '2026-10', now: () => current });
  await planner.toggle();
  host.shadowRoot.querySelector('[aria-label="Today"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(host.shadowRoot.textContent, /September 2026/);
  assert.equal(host.shadowRoot.querySelector('.day.today')?.getAttribute('aria-label'), '2026-09-30');
  current = new Date('2026-10-02T02:00:00Z');
  host.shadowRoot.querySelector('[aria-label="Today"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(host.shadowRoot.querySelector('.day.today')?.getAttribute('aria-label'), '2026-10-01');
});

test('calendar pressure badges open the deadline list and completion updates locally without fetching',async()=>{
 let calls=0;const {host,planner,click,dom}=setup(async()=>{calls++;return {profile:fixture.profile,contexts:[{code:'course_1',name:'Course 1'}],events:[],assignments:[{...fixture.assignment,assignment:fixture.assignmentDetail}],range:{startDate:'2026-03-01',endDate:'2027-03-31'}};});
 await planner.toggle();const badge=host.shadowRoot.querySelector('[data-pressure-day="2026-09-20"]');assert.ok(badge);assert.equal(badge.textContent,'1');badge.click();assert.match(host.shadowRoot.querySelector('[aria-label="Tasks for 2026-09-20"]').textContent,/Essay/);
 host.shadowRoot.querySelector('[aria-label="Open Essay"]').click();await click('Mark complete');assert.equal(host.shadowRoot.querySelector('[data-pressure-day="2026-09-20"]').textContent,'0');
 await click('Workload view');assert.match(host.shadowRoot.textContent,/0 tasks/);assert.equal(calls,1);dom.window.close();
});

test('Planner tab protects an unsaved draft when closing the main overlay',async()=>{
 const dom=new JSDOM('<main>Canvas</main>',{url:'https://canvas.illinois.edu/calendar'});const host=dom.window.document.createElement('div');
 const {createPlannerStore}=await import('../src/storage.js');const {memoryStorage}=await import('./helpers/planning.js');const store=createPlannerStore(memoryStorage(),'canvas.illinois.edu',77);
 const planner=mountPlanner({host,storeFactory:()=>store,planClientFactory:()=>({save:async()=>({ok:false,message:'No save'}),remove:async()=>({ok:true})}),initialMonth:'2026-10',now:()=>new Date('2026-10-01T12:00:00Z'),loadSnapshot:async()=>({profile:fixture.profile,contexts:[],events:[],assignments:[],range:{startDate:'2026-10-01',endDate:'2026-12-31'}})});
 await planner.show();host.shadowRoot.querySelector('[aria-label="Planner view"]').click();await new Promise(r=>setTimeout(r,0));host.shadowRoot.querySelector('[aria-label="New plan"]').click();await new Promise(r=>setTimeout(r,0));host.shadowRoot.querySelector('[aria-label="Close planning calendar"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(host.isConnected,true);assert.ok(host.shadowRoot.querySelector('[role="alertdialog"]'));host.shadowRoot.querySelector('[aria-label="Discard draft changes"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(host.isConnected,false);dom.window.close();
});

test('reopen requests cached data while manual refresh forces current Canvas data',async()=>{
 const options=[];const {planner,click}=setup(async(_month,value)=>{options.push(value);return {profile:fixture.profile,contexts:[],events:[],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}};});
 await planner.show();await planner.toggle();await planner.show();
 assert.equal(options[1].force,false);await click('Refresh calendar');assert.equal(options[2].force,true);planner.destroy();
});

test('cached content stays visible and usable during a background update and network failure',async()=>{
 let finish;const snapshot={profile:fixture.profile,contexts:[],events:[fixture.event],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}};
 const {planner,host,click}=setup(async(_month,options)=>{await options.onCached(snapshot);return new Promise((_resolve,reject)=>{finish=reject;});});
 const pending=planner.show();for(let i=0;i<10&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(finish,'cached content callback should run before the update completes');
 assert.ok(host.shadowRoot.querySelector('[data-item-key="event:5"]'));assert.match(host.shadowRoot.textContent,/Updating Canvas calendar/);
 await click('Task list view');assert.equal(host.shadowRoot.querySelector('[aria-label="Task list view"]').disabled,false);
 finish(new Error('Network offline'));await pending;
 assert.ok(host.shadowRoot.querySelector('[data-task-row]'));assert.match(host.shadowRoot.textContent,/last loaded data/);planner.destroy();
});

test('account switch followed by directory failure cannot expose the previous account tasks',async()=>{
 let id=77;const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 const loader=createCanvasLoader({fetchImpl:async input=>{const url=new URL(input);if(url.pathname.endsWith('/profile'))return json({...fixture.profile,id});if(id===88&&url.pathname==='/api/v1/courses')return new Response('',{status:500});if(url.pathname==='/api/v1/account_calendars')return json({account_calendars:[]});if(url.pathname==='/api/v1/calendar_events'&&url.searchParams.get('type')==='event')return json([fixture.event]);return json([]);}});
 const {planner,host,click}=setup(loader);await planner.show();assert.ok(host.shadowRoot.querySelector('[data-item-key="event:5"]'));
 id=88;await click('Refresh calendar');assert.equal(host.shadowRoot.querySelector('[data-item-key="event:5"]'),null);planner.destroy();
});

test('reopening after an unverified profile failure does not show cached account tasks',async()=>{
 let failed=false;const {planner,host}=setup(async()=>{if(failed)throw new Error('Profile unavailable');return {profile:fixture.profile,contexts:[],events:[fixture.event],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}};});
 await planner.show();await planner.toggle();failed=true;await planner.show();assert.equal(host.shadowRoot.querySelector('[data-item-key="event:5"]'),null);planner.destroy();
});

test('new account local storage failure clears the previous account before installing data',async()=>{
 let id=77;const dom=new JSDOM('<main/>',{url:'https://canvas.illinois.edu/calendar'}),host=dom.window.document.createElement('div');
 const planner=mountPlanner({host,initialMonth:'2026-09',storeFactory:user=>({load:async()=>{if(user===88)throw new Error('Local storage unavailable');return {starts:{},completed:{}};}}),loadSnapshot:async()=>({profile:{...fixture.profile,id},contexts:[],events:[fixture.event],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}})});
 await planner.show();id=88;host.shadowRoot.querySelector('[aria-label="Refresh calendar"]').click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(host.shadowRoot.querySelector('[data-item-key="event:5"]'),null);assert.match(host.shadowRoot.textContent,/Local storage unavailable/);planner.destroy();dom.window.close();
});
