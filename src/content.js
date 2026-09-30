import { createCanvasLoader } from './canvas-api.js';
import {createSchedulerClient} from './scheduler-client.js';
import {createPlanClient} from './plan-client.js';
import { createPlannerStore } from './storage.js';
import { mountPlanner, mountCalendarEntry, monthFromCalendarHash, nativeCalendarSelection } from './view.js';

if (location.pathname.startsWith('/calendar')) {
  const host = document.createElement('div');
  host.id = 'canvas-planning-calendar-root';
  const storeFactory = userId => createPlannerStore(chrome.storage.local, location.hostname, userId);
  const planner = mountPlanner({
    host,
    loadSnapshot: createCanvasLoader({ readSelection: async userId => (await storeFactory(userId).load()).selectedCalendars ?? nativeCalendarSelection(document) }),
    storeFactory,
    schedulerClientFactory:()=>createSchedulerClient({connect:options=>chrome.runtime.connect(options)}),
    planClientFactory:userId=>createPlanClient({userId,sendMessage:message=>chrome.runtime.sendMessage(message)}),
    initialMonth: monthFromCalendarHash(location.hash, new Date())
  });
  mountCalendarEntry({ document, onOpen: () => planner.show(monthFromCalendarHash(location.hash, new Date())) });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'PLANNER_TOGGLE') planner.toggle();
  });
}
