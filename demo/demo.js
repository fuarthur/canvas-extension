import {mountPlanner} from '../src/view.js';
import {createPlannerStore} from '../src/storage.js';
import {createPlanService} from '../src/plan-service.js';
import {generateSchedule} from '../src/scheduler.js';
import {createDemoStorage} from './storage.js';
import {createDemoData, seedDemo, DEMO_NOW, DEMO_USER} from './data.js';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') === 'capacity' ? 'capacity' : 'standard';
const embedded = params.get('embedded') === '1';
const channel = 'canvas-planner-demo:v1';
const area = createDemoStorage(localStorage, scenario, window);
const status = document.querySelector('#demo-status');
const report = value => {
  if (embedded) parent.postMessage({channel, status: value}, location.origin);
  else status.textContent = value;
};

if (!embedded) {
  const frame = document.createElement('iframe');
  frame.title = 'Canvas planner with fictional sample data';
  frame.src = `?embedded=1&scenario=${scenario}`;
  document.querySelector('#demo-stage').append(frame);
  const send = action => frame.contentWindow.postMessage({channel, action}, location.origin);
  document.querySelector('#scenario').value = scenario;
  document.querySelector('#scenario').onchange = event => { location.search = `?scenario=${event.target.value}`; };
  document.querySelector('#open').onclick = () => send('open');
  document.querySelector('#fail').onclick = () => send('fail');
  document.querySelector('#change-deadline').onclick = () => send('deadline');
  document.querySelector('#reset').onclick = async () => {
    await area.reset();
    frame.src = `?embedded=1&scenario=${scenario}`;
    report('Restoring fictional sample data…');
  };
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.channel === channel && typeof event.data.status === 'string') report(event.data.status);
  });
} else {
  document.body.classList.add('embedded');
  const openButton = document.createElement('button');
  openButton.textContent = 'Open fictional planner';
  openButton.type = 'button';
  document.querySelector('#demo-stage').append(openButton);
  const now = () => new Date(DEMO_NOW);
  let planner;
  const refresh = () => document.querySelector('#canvas-planning-calendar-root')?.shadowRoot?.querySelector('[data-control-id="Refresh calendar"]')?.click();
  try {
    // Protect first-use seeding when two local demo tabs open together.
    const seed = () => seedDemo(area, scenario);
    if (navigator.locks) await navigator.locks.request(`canvas-demo-seed:${scenario}`, seed);
    else await seed();
    const store = createPlannerStore(area, 'canvas.illinois.edu', DEMO_USER);
    const service = createPlanService({storageArea: area, now});
    const request = message => {
      const run = () => service.handle({...message, userId: DEMO_USER}, {url: 'https://canvas.illinois.edu/calendar'});
      return navigator.locks ? navigator.locks.request(`canvas-demo-plans:${scenario}`, run) : run();
    };
    const host = document.createElement('div');
    host.id = 'canvas-planning-calendar-root';
    planner = mountPlanner({host, initialMonth: '2026-11', now,
      storeFactory: () => store, planningStoreFactory: () => store,
      subscribeStorage: (_scope, listener) => area.subscribe(listener),
      loadSnapshot: async (_month, options = {}) => {
        const snapshot = createDemoData(scenario);
        const changes = await area.get('demo:earlier-deadline');
        if (changes['demo:earlier-deadline']) snapshot.assignments.find(task => task.id === 'assignment_102').assignment.due_at = '2026-11-05T12:00:00-06:00';
        const selected = (await store.load()).selectedCalendars || snapshot.selectedCalendars;
        return {...snapshot, range: options.range || snapshot.range, selectedCalendars: selected,
          events: snapshot.events.filter(event => selected.includes(event.context_code)),
          assignments: snapshot.assignments.filter(task => selected.includes(task.context_code))};
      },
      planClientFactory: () => ({save: (plan, expectedRevision) => request({type: 'PLAN_SAVE', plan, expectedRevision}), remove: (id, expectedRevision) => request({type: 'PLAN_DELETE', id, expectedRevision})}),
      // The demo never requests notifications or contacts Canvas.
      reminderClientFactory: () => ({accountSeen: async () => ({ok: true}), getStatus: async () => ({ok: true, status: {state: 'disabled'}}), testNotification: async () => ({ok: false, message: 'System notifications are unavailable in the demo.'})}),
      schedulerClientFactory: () => {
        let controller;
        return {
          run(input, {onProgress} = {}) { controller?.abort(); controller = new AbortController(); return generateSchedule(input, {signal: controller.signal, onProgress, budgetMs: 5000}); },
          cancel() { controller?.abort(); }, destroy() { controller?.abort(); }
        };
      }
    });
    openButton.onclick = () => planner.show();
    window.addEventListener('message', async event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.channel !== channel) return;
      if (event.data.action === 'open') await planner.show();
      if (event.data.action === 'fail') { area.failNextWrite(); report('Next save will fail once. Your previous saved data will remain; retry the same action.'); }
      if (event.data.action === 'deadline') {
        await area.set({'demo:earlier-deadline': true});
        refresh();
        report('Systems lab is now due Nov 5 at 12:00. Review the changed task data, update the plan, and generate again.');
      }
    });
    await planner.show();
    report(`Ready · ${scenario === 'capacity' ? '3 fictional assignments · constrained capacity' : '7 fictional assignments + 2 events · 1 duplicate source merged'} · local saves enabled`);
  } catch (error) {
    report(`Demo could not start: ${error.message}`);
  }
  window.addEventListener('pagehide', () => { planner?.destroy(); area.destroy(); });
  window.addEventListener('unhandledrejection', event => report(`Demo action failed: ${event.reason?.message || event.reason}. Retry or reset this demo.`));
}
