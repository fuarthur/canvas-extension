import { loadCanvasSnapshot } from './canvas-api.js';
import { createPlannerStore } from './storage.js';
import { mountPlanner, monthFromCalendarHash } from './view.js';

if (location.pathname.startsWith('/calendar')) {
  const host = document.createElement('div');
  host.id = 'canvas-planning-calendar-root';
  const planner = mountPlanner({
    host,
    loadSnapshot: month => loadCanvasSnapshot({ fetchImpl: fetch, month }),
    storeFactory: userId => createPlannerStore(chrome.storage.local, location.hostname, userId),
    initialMonth: monthFromCalendarHash(location.hash, new Date()),
    now: new Date()
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'PLANNER_TOGGLE') planner.toggle();
  });
}
