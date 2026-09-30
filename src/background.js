chrome.action.onClicked.addListener(tab => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'PLANNER_TOGGLE' }).catch(() => {});
});

import {createPlanService} from './plan-service.js';
const plans=createPlanService({storageArea:chrome.storage.local});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(!['PLAN_SAVE','PLAN_DELETE'].includes(message?.type))return;
 plans.handle(message,sender).then(respond);return true;
});
