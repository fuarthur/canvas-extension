import { createCanvasLoader } from './canvas-api.js';
import {createSchedulerClient} from './scheduler-client.js';
import {createPlanClient} from './plan-client.js';
import { createPlannerStore, loadInitialTheme } from './storage.js';
import { mountPlanner, mountCalendarEntry, monthFromCalendarHash, nativeCalendarSelection } from './view.js';
import {mountNativeCalendarCompletion} from './native-calendar.js';

if (location.pathname.startsWith('/calendar')) {
  const host = document.createElement('div');
  host.id = 'canvas-planning-calendar-root';
  const storeFactory = userId => createPlannerStore(chrome.storage.local, location.hostname, userId);
  const subscribeStorage = ({hostname,userId},listener) => {
    const prefix=`canvas-planner:${hostname}:${userId}:`;
    const handler=(changes,area)=>{if(area==='local'&&Object.keys(changes).some(key=>key.startsWith(prefix)))listener(changes);};
    chrome.storage.onChanged.addListener(handler);
    return()=>chrome.storage.onChanged.removeListener(handler);
  };
  const destroyNativeCompletion = mountNativeCalendarCompletion({
    document,storeFactory,subscribeStorage,
    loadProfile:async()=>{
      const response=await fetch('/api/v1/users/self/profile',{credentials:'include',headers:{Accept:'application/json'}});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Canvas profile unavailable.');
      return response.json();
    }
  });
  window.addEventListener('pagehide',event=>{if(!event.persisted)destroyNativeCompletion();});
  const planner = mountPlanner({
    host,
    loadInitialTheme:()=>loadInitialTheme(chrome.storage.local,location.hostname),
    loadSnapshot: createCanvasLoader({
      storageArea:chrome.storage.local,hostname:location.hostname,
      readSelection:async userId=>(await storeFactory(userId).load()).selectedCalendars??nativeCalendarSelection(document),
      readLoadingSettings:async userId=>(await storeFactory(userId).loadPlanningState()).settings.calendarLoading
    }),
    storeFactory,
    subscribeStorage,
    schedulerClientFactory:()=>createSchedulerClient({connect:options=>chrome.runtime.connect(options)}),
    planClientFactory:userId=>createPlanClient({userId,sendMessage:message=>chrome.runtime.sendMessage(message)}),
    initialMonth: monthFromCalendarHash(location.hash, new Date())
  });
  mountCalendarEntry({ document, onOpen: () => planner.show(monthFromCalendarHash(location.hash, new Date())) });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'PLANNER_TOGGLE') planner.toggle();
  });
}
