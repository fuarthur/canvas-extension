import {ui} from './ui.js';
import {setText,intlLocale} from './i18n.js';
import {normalizeReminderSettings,reminderMinutes,resizeReminderRounds} from './reminder-settings.js';

const statusMessages={off:'Reminders are off.',ready:'Reminders are ready.',waiting:'Waiting for Canvas deadlines.',offline:'Offline: using deadlines synced less than 24 hours ago.',stale:'Reminders paused: deadlines have not synced for 24 hours.',auth:'Reminders paused: sign in to Canvas again.','notification-denied':'System notifications are blocked.'};
const errorMessages={CONTEXT:'Reminder status is unavailable. Reload this Canvas page.',NOTIFICATION:'Notifications are blocked or unavailable.',STORAGE:'Could not save reminder state. Reminders are paused.',DELIVERY_UNCERTAIN:'A reminder delivery could not be confirmed. It will not be repeated.',IDENTITY:'Reminders paused: sign in to Canvas again.'};
export function createReminderSettingsEditor({document,value,client,onChange}={}){
 const {el,input,field,select,button}=ui(document);
 let draft=normalizeReminderSettings(value),busy=false,testing=false,disposed=false,statusVersion=0;
 const element=el('section','reminder-settings settings-section'),rows=el('div','reminder-rounds');
 const enabled=input('Enable deadline reminders','','checkbox');enabled.checked=draft.enabled;
 const count=select('Reminder rounds',[1,2,3,4,5].map(n=>[String(n),String(n),true]),String(draft.leadMinutes.length));
 const state=el('p','hint'),synced=el('p','hint'),feedback=el('p','hint');
 state.dataset.reminderStatus='';synced.dataset.reminderSynced='';feedback.dataset.reminderFeedback='';
 for(const node of [state,synced,feedback]){node.setAttribute('role','status');node.setAttribute('aria-live','polite');}
 const changed=()=>{if(!disposed)onChange?.(structuredClone(draft));};
 const applyDisabled=()=>{enabled.disabled=busy;count.disabled=busy||!draft.enabled;rows.querySelectorAll('input,select').forEach(n=>{n.disabled=busy||!draft.enabled;});test.disabled=busy||testing;};
 function draw(){
  count.value=String(draft.leadMinutes.length);rows.replaceChildren();
  draft.leadMinutes.forEach((minutes,index)=>{
   let unit=minutes%1440===0?'days':minutes%60===0?'hours':'minutes',amount=Number.isFinite(minutes)?minutes/({minutes:1,hours:60,days:1440}[unit]):'';
   const update=()=>{draft.leadMinutes[index]=reminderMinutes(Number(amount),unit)??NaN;changed();};
   const quantity=input(`Reminder ${index+1} amount`,amount,'number',v=>{amount=v;update();});quantity.min='0';quantity.max='43200';quantity.step='any';
   const units=select(`Reminder ${index+1} unit`,[['minutes','Minutes'],['hours','Hours'],['days','Days']],unit,v=>{unit=v;update();});
   const row=el('div','reminder-round');row.append(el('strong','',`Reminder ${index+1}`),field('Before deadline',quantity),field('Unit',units));rows.append(row);
  });applyDisabled();
 }
 const refreshStatus=async()=>{
  const ticket=++statusVersion;let reply;
  try{reply=client?await client.getStatus():{ok:false};}catch{reply={ok:false,code:'CONTEXT'};}
  if(disposed||ticket!==statusVersion)return;
  if(!reply?.ok){setText(state,errorMessages[reply?.code]||'Reminder status is unavailable.');setText(synced,'');return;}
  const status=reply.status||{};setText(state,status.state==='error'?(errorMessages[status.errorCode]||'Could not update deadline reminders.'):(statusMessages[status.state]||'Waiting for Canvas deadlines.'));
  if(Number.isFinite(status.lastSyncedAt))setText(synced,{key:'Last synced: {time}',values:{time:new Intl.DateTimeFormat(intlLocale(document),{dateStyle:'medium',timeStyle:'short'}).format(new Date(status.lastSyncedAt))}});
  else setText(synced,'No deadlines synced yet.');
 };
 const test=button('Send test reminder',async()=>{
  if(disposed||testing)return;testing=true;applyDisabled();setText(feedback,'Sending test reminder…');
  let reply;try{reply=await client?.testNotification();}catch{reply={ok:false,code:'CONTEXT'};}
  if(disposed)return;testing=false;applyDisabled();
  setText(feedback,reply?.ok?'Test reminder requested. Check your system notifications.':errorMessages[reply?.code]||'Reminder status is unavailable.');
  await refreshStatus();
 });
 enabled.addEventListener('change',()=>{if(disposed)return;draft.enabled=enabled.checked;changed();applyDisabled();});
 count.addEventListener('change',()=>{if(disposed)return;draft.leadMinutes=resizeReminderRounds(draft.leadMinutes,Number(count.value));changed();draw();});
 element.append(el('h2','','Deadline reminders'),field('Enable deadline reminders',enabled),
  el('p','hint','Desktop reminders for upcoming Canvas assignment deadlines in your selected calendars. Submitted and completed tasks are skipped.'),
  field('Reminder rounds',count),rows,el('p','hint','Choose 1–5 rounds, each 1 minute to 30 days early. Times are sorted and duplicates are merged when saved.'),
  el('p','hint','Keep the browser running. Canvas tabs can be closed. After sleep or restart, only the latest missed round is sent before the deadline. Browser or system settings may delay notifications.'),
  el('p','hint','Save planning settings to apply changes.'),state,synced,test,feedback);
 draw();void refreshStatus();
 return {element,setValue(settings){if(disposed)return;draft=normalizeReminderSettings(settings);enabled.checked=draft.enabled;draw();},setBusy(value){busy=value;applyDisabled();},refreshStatus,dispose(){disposed=true;statusVersion++;}};
}
