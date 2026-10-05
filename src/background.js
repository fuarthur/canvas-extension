chrome.action.onClicked.addListener(tab => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PLANNER_TOGGLE' }).catch(() => {});
});

import {createPlanService} from './plan-service.js';
const plans=createPlanService({storageArea:chrome.storage.local});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(!['PLAN_SAVE','PLAN_DELETE'].includes(message?.type))return;
 plans.handle(message,sender).then(respond);return true;
});

import {generateSchedule} from './scheduler.js';
import {createSchedulerService} from './scheduler-service.js';
const scheduler=createSchedulerService({generateSchedule});
chrome.runtime.onConnect.addListener(port=>{
 if(port.name==='canvas-planner-scheduler')scheduler.handlePort(port,port.sender);
});

import {createReminderService,REMINDER_MESSAGES} from './reminder-service.js';
import {createReminderChrome} from './reminder-chrome.js';
import {fetchCanvasProfile,loadCanvasReminderSnapshot} from './canvas-api.js';
import {createPlannerStore} from './storage.js';
const reminders=createReminderService({
 storageArea:chrome.storage.local,
 storeFactory:userId=>createPlannerStore(chrome.storage.local,'canvas.illinois.edu',userId),
 fetchProfile:()=>fetchCanvasProfile(),loadSnapshot:loadCanvasReminderSnapshot,
 ...createReminderChrome({chromeApi:chrome,iconUrl:chrome.runtime.getURL('icons/deadline-128.png')})
});
chrome.alarms.onAlarm.addListener(alarm=>{void reminders.handleAlarm(alarm);});
chrome.runtime.onStartup.addListener(()=>{void reminders.start();});
chrome.runtime.onInstalled.addListener(()=>{void reminders.start();});
chrome.notifications.onClicked.addListener(id=>{void reminders.handleNotificationClick(id);});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(!REMINDER_MESSAGES.includes(message?.type))return;
 reminders.handleMessage(message,sender).then(respond);return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 reminders.invalidate(changes);void reminders.handleStorageChanges(changes,area);
});
void reminders.start();
