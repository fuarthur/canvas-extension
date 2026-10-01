import {setText,setLabel,intlLocale} from './i18n.js';
import {ui} from './ui.js';import {dateKey,zonedDateTime} from './dates.js';import {suggestSegment} from './plan-validation.js';import {updatePlan} from './plans.js';
export function renderPlanEditor({document,plan,itemKey,day,segmentId,startTime,editorValues,initialIssues,addedOnDrop,facts,resolvedTask,completionStatus,onComplete,onOpen,onApply,onClose}){
 const {el,input,field,button}=ui(document);const existing=plan.segments.find(s=>s.id===segmentId);const source=resolvedTask||facts.items?.find(item=>item.key===itemKey)||plan.tasks[itemKey];const task={...source,completed:Boolean(source.completed||facts.completed?.[itemKey])};const panel=el('section','arrange-editor');panel.setAttribute('role','dialog');setLabel(panel,task.type==='event'?'Event details':'Arrange task');panel.dataset.editorKey=JSON.stringify([itemKey,day,segmentId]);
 const header=el('div','plan-editor-header');header.append(el('h3','',task.title,true));
 if(task.canvasCompleted)header.append(el('span','hint','Completed in Canvas'));
 else if(onComplete){
  const complete=button(task.completed?'Reopen task in editor':'Complete task in editor',()=>onComplete(itemKey,!task.completed),'control plan-completion-button',completionStatus?.saving?'Saving…':task.completed?'Undo completion':'Mark as complete');
  complete.disabled=Boolean(completionStatus?.saving);header.append(complete);
 }
 panel.append(header);
 if(onComplete&&!task.canvasCompleted)panel.append(el('p','hint plan-completion-hint',task.completed?'This task is complete. Undo completion to continue working.':task.type==='event'?'Mark this activity as complete.':'Marks the entire task as complete, including all its work blocks.'));
 if(completionStatus?.error){const error=el('p','notice plan-completion-error',completionStatus.error);error.setAttribute('role','alert');panel.append(error);}
 if(task.type==='event'){
  const format=instant=>new Intl.DateTimeFormat(intlLocale(document),{timeZone:plan.timeZone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
  panel.append(el('p','hint',`${format(task.fixedStartAt)} – ${format(task.fixedEndAt)}`,true),el('p','hint','Fixed activity'));
  if(onOpen)panel.append(button(`Open ${task.title}`,()=>onOpen(itemKey),'text-button','View details'));
  panel.append(button('Cancel arranging task',onClose,'text-button','Close'));return panel;
 }
 const used=plan.segments.filter(s=>s.itemKey===itemKey&&s.id!==segmentId).reduce((n,s)=>n+(Date.parse(s.endAt)-Date.parse(s.startAt))/60000,0);
 const date=input('Work date',existing?dateKey(existing.startAt,plan.timeZone):day,'date');date.min=plan.range.startDate;date.max=plan.range.endDate;
 const minutes=input('Work minutes',existing?(Date.parse(existing.endAt)-Date.parse(existing.startAt))/60000:Math.max(1,task.estimateMinutes-used),'number');minutes.min='1';minutes.max='1440';
 const clock=existing?new Intl.DateTimeFormat(intlLocale(document,'en-GB'),{timeZone:plan.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(existing.startAt)):startTime||'';const start=input('Work start time',clock,'time');const message=el('p','notice');const suggestion=el('p','hint');const conflict=el('div');
 for(const node of [date,minutes,start])node.disabled=Boolean(task.completed||completionStatus?.saving);
 if(editorValues){date.value=editorValues['Work date'];minutes.value=editorValues['Work minutes'];start.value=editorValues['Work start time'];}
 const base=existing?updatePlan(plan,{type:'removeSegment',id:segmentId}):plan;
 if(addedOnDrop)panel.append(el('p','hint','Work block added to your draft. Adjust it here or remove the block.'));
 const check=()=>{const result=suggestSegment(base,itemKey,{day:date.value,minutes:Number(minutes.value),startTime:start.value||undefined},facts);setText(suggestion,result.segment?`Suggested ${new Intl.DateTimeFormat(intlLocale(document,'en-GB'),{timeZone:plan.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(result.segment.startAt))} · ${Number(minutes.value)} min`:'Choose a date and duration; the work must fit before the deadline.');return result;};
 for(const n of [date,minutes,start])n.addEventListener('change',()=>{setText(message,'');conflict.replaceChildren();check();});
 panel.append(field('Date',date),field('Minutes for this block',minutes),field('Start time (optional)',start),suggestion,message,conflict);
 const apply=segment=>{onApply({type:existing?'updateSegment':'addSegment',...(existing?{id:existing.id,patch:{...segment,id:existing.id,locked:existing.locked,order:existing.order}}:{segment})});onClose();};
 const save=button(existing?'Update work block':'Add work block',()=>{const result=check();conflict.replaceChildren();if(result.segment){apply(result.segment);return;}setText(message,result.issues.map(i=>i.message));
  if(!result.issues.some(i=>i.code==='SINGLE_SESSION')&&start.value&&Number.isInteger(Number(minutes.value))&&Number(minutes.value)>0&&used+Number(minutes.value)<=task.estimateMinutes){const instant=zonedDateTime(date.value,start.value,plan.timeZone);if(instant&&date.value>=plan.range.startDate&&date.value<=plan.range.endDate)conflict.append(button('Keep as conflicting draft',()=>apply({id:existing?.id||`manual-${Date.now()}`,itemKey,startAt:instant,endAt:new Date(Date.parse(instant)+Number(minutes.value)*60000).toISOString(),locked:existing?.locked||false,order:existing?.order??plan.segments.length}),'text-button','Keep as conflicting draft — requires fixing'));}
 });save.disabled=Boolean(task.completed||completionStatus?.saving);panel.append(save,button('Cancel arranging task',onClose,'text-button','Cancel'));if(!task.completed)check();if(initialIssues?.length)setText(message,initialIssues.map(issue=>issue.message));return panel;
}
