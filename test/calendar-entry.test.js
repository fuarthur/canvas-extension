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

for(const firstOpen of ['page','toolbar'])test(`page entry preserves the browsed month after a ${firstOpen} opening and follows later native navigation`,async()=>{
  const dom=new JSDOM(controls,{url:'https://canvas.illinois.edu/calendar#view_start=2026-09-01'});
  const {document}=dom.window,host=document.createElement('div');
  const planner=view.mountPlanner({
    host,initialMonth:'2026-09',
    loadSnapshot:async()=>({profile:{id:77,time_zone:'America/Chicago'},contexts:[],events:[],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}}),
    storeFactory:()=>({load:async()=>({starts:{},completed:{}})})
  });
  const removeEntry=view.mountCalendarEntry({document,onOpen:()=>planner.show(view.monthFromCalendarHash(dom.window.location.hash))});
  const click=async label=>{host.shadowRoot.querySelector(`[data-control-id="${label}"]`).click();await settle();};
  const openEntry=async()=>{document.querySelector('[data-planning-entry]').click();await settle();};
  try{
    if(firstOpen==='toolbar')await planner.toggle(view.monthFromCalendarHash(dom.window.location.hash));else await openEntry();
    await click('Next month');
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'October 2026');
    await click('Close planning calendar');await openEntry();
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'October 2026');
    await click('Close planning calendar');
    dom.window.location.hash='view_start=2026-11-01';await openEntry();
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'November 2026');
    await click('Next month');await click('Close planning calendar');await planner.toggle(view.monthFromCalendarHash(dom.window.location.hash));
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'December 2026');
  }finally{removeEntry();planner.destroy();dom.window.close();}
});

test('toolbar opening after native month navigation shares its month with later page openings',async()=>{
  const dom=new JSDOM(controls,{url:'https://canvas.illinois.edu/calendar#view_start=2026-09-01'});
  const {document}=dom.window,host=document.createElement('div');
  const planner=view.mountPlanner({
    host,initialMonth:'2026-09',
    loadSnapshot:async()=>({profile:{id:77},contexts:[],events:[],assignments:[],range:{startDate:'2026-03-01',endDate:'2027-03-31'}}),
    storeFactory:()=>({load:async()=>({starts:{},completed:{}})})
  });
  const currentMonth=()=>view.monthFromCalendarHash(dom.window.location.hash);
  const removeEntry=view.mountCalendarEntry({document,onOpen:()=>planner.show(currentMonth())});
  const click=async label=>{host.shadowRoot.querySelector(`[data-control-id="${label}"]`).click();await settle();};
  try{
    dom.window.location.hash='view_start=2026-10-01';await planner.toggle(currentMonth());
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'October 2026');
    await click('Next month');await click('Task list view');await click('Close planning calendar');
    await planner.toggle(currentMonth());
    assert.equal(host.shadowRoot.querySelector('#planner-tab-tasks').getAttribute('aria-selected'),'true');
    await click('Planning calendar view');await click('Close planning calendar');
    document.querySelector('[data-planning-entry]').click();await settle();
    assert.equal(host.shadowRoot.querySelector('.month-name').textContent,'November 2026');
  }finally{removeEntry();planner.destroy();dom.window.close();}
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
