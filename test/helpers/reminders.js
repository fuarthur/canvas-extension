import {webcrypto} from 'node:crypto';
import {createReminderService,REMINDER_ACTIVE_KEY} from '../../src/reminder-service.js';
import {createPlannerStore} from '../../src/storage.js';
import {defaultSettings} from '../../src/planning-settings.js';
import {memoryStorage,task} from './planning.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
export const sender={url:'https://canvas.illinois.edu/calendar',frameId:0};
export const runtimeKey=id=>'canvas-planner:canvas.illinois.edu:'+id+':reminders:v1';
export async function reminderHarness({enabled=true,clock=Date.parse('2026-10-05T17:00Z')}={}){
 const area=memoryStorage(),alarmsMap=new Map(),visible=new Map(),creates=[],clears=[],opens=[];
 const h={area,alarmsMap,visible,creates,clears,opens,clock,profile:{id:77,time_zone:'America/Chicago'},permission:'granted',fetchCount:0,snapshotCount:0,items:[task({dueAt:'2026-10-05T20:00Z',canvasCompleted:false,url:'https://canvas.illinois.edu/courses/456/assignments/1'})],unavailable:[]};
 h.store=id=>createPlannerStore(area,'canvas.illinois.edu',id);
 await h.store(77).setSettings({...defaultSettings(),reminders:{enabled,leadMinutes:[120]}});await h.store(77).setSelectedCalendars(['course_456']);
 await area.set({[REMINDER_ACTIVE_KEY]:{schemaVersion:1,hostname:'canvas.illinois.edu',userId:'77',verifiedAt:clock}});
 h.snapshotData=()=>({profile:structuredClone(h.profile),contexts:[{code:'course_456',name:'EPSY 456'}],selectedCalendars:['course_456'],unavailableCalendars:h.unavailable,events:[],assignments:h.items.map(item=>({id:item.key.replace('assignment:','assignment_'),title:item.title,context_code:item.contextCodes[0],html_url:item.url,assignment:{due_at:item.dueAt,unlock_at:null,user_submitted:item.canvasCompleted}})),range:{startDate:'2026-10-05',endDate:'2026-11-05'}});
 h.newService=()=>createReminderService({storageArea:area,storeFactory:h.store,now:()=>h.clock,
  fetchProfile:async()=>{h.fetchCount++;if(h.fetchError)throw h.fetchError;return structuredClone(h.profile);},
  loadSnapshot:async()=>{h.snapshotCount++;if(h.snapshotFn)return h.snapshotFn();if(h.snapshotError)throw h.snapshotError;return h.snapshotData();},
  alarms:{get:async name=>alarmsMap.get(name),set:async(name,info)=>alarmsMap.set(name,{name,...info,scheduledTime:info.when}),remove:async name=>alarmsMap.delete(name)},
  notifications:{permission:async()=>h.permission,create:async data=>{await h.beforeCreate?.(data);if(h.createError)throw h.createError;creates.push(data);visible.set(data.id,data);return data.id;},clear:async id=>{clears.push(id);return visible.delete(id);},open:async url=>{opens.push(url);}},
 });
 h.service=h.newService();h.status=async()=>h.service.handleMessage({type:'REMINDER_STATUS',userId:77},sender);return h;
}
