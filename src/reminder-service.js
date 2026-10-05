import {evaluateReminders} from './reminder-policy.js';
import {normalizeItems} from './model.js';
import {notificationIdForToken,formatReminderNotification,safeReminderUrl} from './reminder-notification.js';
import {translateForLanguage} from './i18n.js';

const hostname='canvas.illinois.edu',TTL=24*3600000,PERIOD=15*60000;
export const REMINDER_ACTIVE_KEY='canvas-planner:canvas.illinois.edu:reminder-active:v1';
export const REMINDER_REFRESH_ALARM='canvas-planner:reminders:refresh';
export const REMINDER_NEXT_ALARM='canvas-planner:reminders:next';
export const REMINDER_MESSAGES=['REMINDER_ACCOUNT_SEEN','REMINDER_STATUS','REMINDER_TEST'];
const runtimeKey=id=>'canvas-planner:'+hostname+':'+id+':reminders:v1';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fault=code=>Object.assign(new Error(code),{code});
const validSender=sender=>{try{const url=new URL(sender?.url);return url.origin==='https://'+hostname&&url.pathname==='/calendar'&&sender.frameId===0;}catch{return false;}};

export function createReminderService({storageArea,storeFactory,fetchProfile,loadSnapshot,alarms,notifications,formatNotification=formatReminderNotification,now=Date.now}){
 let active=null,version=0,identityVersion=0,tail=Promise.resolve(),storageFailure=null;
 const cache=new Map();
 const check=ticket=>{if(ticket!==version)throw fault('CANCELLED');};
 const enqueue=operation=>{
  const result=tail.then(operation).catch(error=>{
   const code=error.code||'STORAGE';if(code==='STORAGE')storageFailure={userId:active?.userId,code};
   return {ok:false,code,message:'Could not update deadline reminders.'};
  });tail=result.then(()=>{});return result;
 };
 const empty=id=>({schemaVersion:1,scope:{hostname,userId:String(id)},fallbackSelection:null,snapshot:null,ledger:{},notifications:{},status:{state:'waiting',permission:'unknown',lastSyncedAt:null}});
 async function readRuntime(id){
  const record=(await storageArea.get(null))[runtimeKey(id)];if(record==null)return empty(id);
  if(record.schemaVersion!==1||record.scope?.hostname!==hostname||record.scope?.userId!==String(id)||!object(record.ledger)||!object(record.notifications))throw fault('STORAGE');
  if(record.snapshot&&(!Array.isArray(record.snapshot.items)||!Number.isFinite(record.snapshot.syncedAt)||String(record.snapshot.profile?.id)!==String(id)))throw fault('STORAGE');
  return record;
 }
 const save=async(record,ticket)=>{check(ticket);await storageArea.set({[runtimeKey(record.scope.userId)]:record});check(ticket);};
 async function inputs(id,record){
  const store=storeFactory(id),[user,planning]=await Promise.all([store.load(),store.loadPlanningState()]);
  return {settings:planning.settings.reminders,language:planning.settings.language||'en',completed:user.completed||{},selectedCalendars:user.selectedCalendars??record.fallbackSelection};
 }
 function policy(record,input,ledger=record.ledger){return evaluateReminders({scope:record.scope,items:record.snapshot?.items||[],...input,ledger,now:now()});}
 async function clearNotices(record,predicate=()=>true){
  for(const [id,notice] of Object.entries(record.notifications))if(predicate(notice)){
   await notifications.clear(id).catch(()=>{});delete record.notifications[id];
  }
 }
 async function verifyProfile(ticket,checkCurrent=()=>check(ticket)){
  try{const profile=await fetchProfile();checkCurrent();return profile;}
  catch(error){
   checkCurrent();
   if(error.code==='AUTH'&&active){
    const record=await readRuntime(active.userId);record.snapshot=null;record.status={state:'auth',errorCode:'IDENTITY'};
    await clearNotices(record);await save(record,version);await alarms.remove(REMINDER_NEXT_ALARM);
   }
   throw error;
  }
 }
 async function activate(profile,ticket){
  check(ticket);if(!/^\d+$/.test(String(profile?.id)))throw fault('IDENTITY');
  const id=String(profile.id);
  if(active&&active.userId!==id){const previous=await readRuntime(active.userId);check(ticket);await clearNotices(previous);await save(previous,ticket);}
  check(ticket);active={schemaVersion:1,hostname,userId:id,verifiedAt:now()};await storageArea.set({[REMINDER_ACTIVE_KEY]:active});check(ticket);
  return readRuntime(id);
 }
 async function schedule(record,input,nextAt,permission){
  if(!input.settings.enabled){await alarms.remove(REMINDER_REFRESH_ALARM);await alarms.remove(REMINDER_NEXT_ALARM);return;}
  const refresh=await alarms.get(REMINDER_REFRESH_ALARM);
  if(refresh?.periodInMinutes!==15)await alarms.set(REMINDER_REFRESH_ALARM,{periodInMinutes:15});
  const fresh=record.snapshot&&now()>=record.snapshot.syncedAt&&now()-record.snapshot.syncedAt<TTL;
  if(!fresh||permission!=='granted'){await alarms.remove(REMINDER_NEXT_ALARM);return;}
  const at=Math.min(nextAt??Infinity,record.snapshot.syncedAt+TTL);
  const existing=await alarms.get(REMINDER_NEXT_ALARM);
  if(existing?.scheduledTime!==at)await alarms.set(REMINDER_NEXT_ALARM,{when:at});
 }
 async function status(record,input){
  let permission='unknown';try{permission=await notifications.permission();}catch{}
  let state=input.settings.enabled?(record.status?.state||'waiting'):'off';let errorCode=record.status?.errorCode;
  if(input.settings.enabled){
   if(record.snapshot&&now()-record.snapshot.syncedAt>=TTL)state='stale';
   if(permission==='denied'&&!['auth','stale'].includes(state))state='notification-denied';
   if(Object.values(record.ledger).some(entry=>entry.state==='pending')){state='error';errorCode='DELIVERY_UNCERTAIN';}
   else if(Object.values(record.ledger).some(entry=>entry.state==='failed'&&entry.dueAt>now())){state='error';errorCode='NOTIFICATION';}
   if(storageFailure?.userId===record.scope.userId){state='error';errorCode='STORAGE';}
  }
  return {state,permission,lastSyncedAt:record.snapshot?.syncedAt??null,...(errorCode?{errorCode}:{})};
 }
 async function releaseReservation(id,token,notificationId){
  const latest=await readRuntime(id);
  if(latest.ledger[token]?.state==='pending'){delete latest.ledger[token];delete latest.notifications[notificationId];await storageArea.set({[runtimeKey(id)]:latest});}
 }
 async function reconcile(record,ticket){
  let input=await inputs(record.scope.userId,record);check(ticket);
  const fresh=record.snapshot&&now()>=record.snapshot.syncedAt&&now()-record.snapshot.syncedAt<TTL;
  if(!input.settings.enabled){await clearNotices(record);record.status={state:'off',lastSyncedAt:record.snapshot?.syncedAt??null};await save(record,ticket);await schedule(record,input,null,'unknown');return;}
  await clearNotices(record,notice=>{
   if(notice.test)return false;
   const item=record.snapshot?.items.find(item=>item.key===notice.itemKey);
   return !item||item.completed||item.canvasCompleted||input.completed[item.key]||Date.parse(item.dueAt)!==notice.dueAt||notice.dueAt<=now()||(Array.isArray(input.selectedCalendars)&&!item.contextCodes.some(code=>input.selectedCalendars.includes(code)));
  });check(ticket);
  for(const [token,entry] of Object.entries(record.ledger))if(entry.dueAt<=now()&&!Object.values(record.notifications).some(n=>n.token===token))delete record.ledger[token];
  const permission=await notifications.permission();check(ticket);
  if(!fresh){if(record.status?.state!=='auth')record.status={state:record.snapshot?'stale':'waiting'};await save(record,ticket);await schedule(record,input,null,permission);return;}
  let result=policy(record,input);
  for(const entry of result.skipped)record.ledger[entry.token]={state:'skipped',dueAt:entry.dueAt,updatedAt:now()};
  await save(record,ticket);
  if(permission==='granted')for(const delivery of result.deliveries){
   input=await inputs(record.scope.userId,record);check(ticket);
   if(!policy(record,input).deliveries.some(d=>d.token===delivery.token))continue;
   const id=await notificationIdForToken(delivery.token);check(ticket);
   record.ledger[delivery.token]={state:'pending',dueAt:Date.parse(delivery.item.dueAt),updatedAt:now()};
   record.notifications[id]={token:delivery.token,itemKey:delivery.item.key,dueAt:Date.parse(delivery.item.dueAt),url:safeReminderUrl(delivery.item.url)};
   try{
    await save(record,ticket);
    input=await inputs(record.scope.userId,record);check(ticket);
    const ledger={...record.ledger};delete ledger[delivery.token];
    if(!policy(record,input,ledger).deliveries.some(d=>d.token===delivery.token)){
     await releaseReservation(record.scope.userId,delivery.token,id);delete record.ledger[delivery.token];delete record.notifications[id];continue;
    }
   }catch(error){if(error.code==='CANCELLED')await releaseReservation(record.scope.userId,delivery.token,id);throw error;}
   try{
    const content=formatNotification({item:delivery.item,profile:record.snapshot.profile,language:input.language,now:now()});
    await notifications.create({id,...content});
    record.ledger[delivery.token].state='sent';record.ledger[delivery.token].updatedAt=now();
   }catch{
    record.ledger[delivery.token]={state:'failed',dueAt:Date.parse(delivery.item.dueAt),updatedAt:now(),retryAt:now()+PERIOD};delete record.notifications[id];record.status={state:'error',errorCode:'NOTIFICATION'};
   }
   // A receipt belongs to the issuing account even if inputs changed while Chrome displayed it.
   if(ticket!==version){await notifications.clear(id).catch(()=>{});delete record.notifications[id];}
   await storageArea.set({[runtimeKey(record.scope.userId)]:record});check(ticket);
  }
  input=await inputs(record.scope.userId,record);check(ticket);result=policy(record,input);
  record.status=await status(record,input);await save(record,ticket);await schedule(record,input,result.nextAt,permission);
 }
 async function sync(profile){
  const ticket=version;let record=active?await readRuntime(active.userId):null;
  if(!record)return;let input=await inputs(record.scope.userId,record);check(ticket);
  if(!input.settings.enabled)return reconcile(record,ticket);
  try{
   profile=profile||await verifyProfile(ticket);check(ticket);record=await activate(profile,ticket);input=await inputs(record.scope.userId,record);check(ticket);
   if(!input.settings.enabled)return reconcile(record,ticket);
   const snapshot=await loadSnapshot({profile,selectedCalendars:input.selectedCalendars,now,maxLeadMinutes:Math.max(...input.settings.leadMinutes),cache});check(ticket);
   if(String(snapshot.profile?.id)!==record.scope.userId)throw fault('IDENTITY');
   const unavailable=new Set(snapshot.unavailableCalendars||[]);
   const items=normalizeItems(snapshot).filter(item=>item.type==='assignment'&&item.contextCodes.some(code=>!unavailable.has(code)));
   record.snapshot={profile:snapshot.profile,items,syncedAt:now()};record.status={state:'ready'};await save(record,ticket);storageFailure=null;
  }catch(error){
   if(error.code==='CANCELLED')throw error;check(ticket);
   if(['AUTH','IDENTITY'].includes(error.code)){record.snapshot=null;record.status={state:'auth',errorCode:'IDENTITY'};await clearNotices(record);}
   else if(error.code==='FORBIDDEN'){record.snapshot=null;record.status={state:'error',errorCode:'NETWORK'};await clearNotices(record);}
   else if(error.code==='STORAGE'){throw error;}
   else record.status={state:record.snapshot?'offline':'waiting',errorCode:'NETWORK'};
   await save(record,ticket);
  }
  return reconcile(record,ticket);
 }
 const relevant=changes=>Object.keys(changes||{}).some(key=>key.startsWith('canvas-planner:'+hostname+':')&&(/:settings:v1$|:calendars$|:completed:|:language$/.test(key)));
 const service={
  invalidate(changes){if(relevant(changes))version++;},
  start(){return enqueue(async()=>{
   const pointer=(await storageArea.get(null))[REMINDER_ACTIVE_KEY];
   if(pointer?.schemaVersion===1&&pointer.hostname===hostname&&/^\d+$/.test(pointer.userId)){active=pointer;await sync();}
   else{await alarms.remove(REMINDER_REFRESH_ALARM);await alarms.remove(REMINDER_NEXT_ALARM);}
  });},
  handleAlarm(alarm){if(![REMINDER_REFRESH_ALARM,REMINDER_NEXT_ALARM].includes(alarm?.name))return Promise.resolve();return enqueue(()=>sync());},
  handleStorageChanges(changes,area){
   if(area!=='local'||!relevant(changes))return Promise.resolve();service.invalidate(changes);
   return enqueue(async()=>{if(!active)return;const prefix='canvas-planner:'+hostname+':'+active.userId+':';if(!Object.keys(changes).some(key=>key.startsWith(prefix)))return;
    if(Object.keys(changes).some(key=>key===prefix+'settings:v1'||key===prefix+'calendars'))return sync();
    return reconcile(await readRuntime(active.userId),version);
   });
  },
  handleMessage(message,sender){
   if(!REMINDER_MESSAGES.includes(message?.type))return Promise.resolve(undefined);
   if(!validSender(sender)||!/^\d+$/.test(String(message.userId))||(message.selectedCalendars!=null&&(!Array.isArray(message.selectedCalendars)||message.selectedCalendars.some(code=>typeof code!=='string'||!/^(user|course|group|account)_\d+$/.test(code)))))return Promise.resolve({ok:false,code:'INVALID',message:'Invalid reminder request.'});
   let identityTicket;
   if(message.type==='REMINDER_ACCOUNT_SEEN'){version++;identityTicket=++identityVersion;}
   return enqueue(async()=>{
    let ticket=version;const id=String(message.userId);let record;
    if(message.type==='REMINDER_ACCOUNT_SEEN'){
     const checkIdentity=()=>{if(identityTicket!==identityVersion)throw fault('CANCELLED');};checkIdentity();
     const profile=await verifyProfile(ticket,checkIdentity);
     // Preference changes replan the verified identity; a newer account cancels it.
     for(;;){
      checkIdentity();ticket=version;
      try{
       record=await activate(profile,ticket);
       if(record.scope.userId!==id)throw fault('IDENTITY');
       if(Array.isArray(message.selectedCalendars)){record.fallbackSelection=[...new Set(message.selectedCalendars)];await save(record,ticket);}
       await sync(profile);record=await readRuntime(id);checkIdentity();break;
      }catch(error){checkIdentity();if(error.code!=='CANCELLED')throw error;}
     }
    }else{
     if(active?.userId!==id)throw fault('IDENTITY');record=await readRuntime(id);
     if(message.type==='REMINDER_TEST'){
      const profile=await verifyProfile(ticket);check(ticket);if(String(profile.id)!==id){await activate(profile,ticket);throw fault('IDENTITY');}
      if(await notifications.permission()!=='granted')return {ok:false,code:'NOTIFICATION',message:'Notifications are blocked.'};
      const input=await inputs(id,record),notificationId=await notificationIdForToken('test:'+id);
      record.notifications[notificationId]={test:true,url:safeReminderUrl(null)};await save(record,ticket);
      try{await notifications.create({id:notificationId,title:translateForLanguage(input.language,'Deadline reminders'),message:translateForLanguage(input.language,'Test reminder sent. No task was changed.')});}
      catch{delete record.notifications[notificationId];await save(record,ticket);return {ok:false,code:'NOTIFICATION',message:'Could not send the test reminder.'};}
     }
    }
    return {ok:true,status:await status(record,await inputs(id,record))};
   });
  },
  handleNotificationClick(id){return enqueue(async()=>{
   if(!active)return;const ticket=version,record=await readRuntime(active.userId),notice=record.notifications[id];if(!notice)return;
   const profile=await verifyProfile(ticket);check(ticket);if(String(profile.id)!==record.scope.userId){await activate(profile,ticket);return;}
   const input=await inputs(record.scope.userId,record);check(ticket);
   if(!notice.test){const item=record.snapshot?.items.find(item=>item.key===notice.itemKey);if(!input.settings.enabled||!item||item.completed||item.canvasCompleted||input.completed[item.key])return;}
   await notifications.open(safeReminderUrl(notice.url));await notifications.clear(id).catch(()=>{});delete record.notifications[id];await save(record,ticket);
  });}
 };
 return service;
}
