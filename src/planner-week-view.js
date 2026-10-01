import {ui,formatMinutes} from './ui.js';
import {dateKey,addDays,startOfLocalDay} from './dates.js';
import {intlLocale,setLabel,setText,translate} from './i18n.js';

export const HOUR_HEIGHT=96;
export const weekStart=day=>addDays(day,-new Date(`${day}T12:00:00Z`).getUTCDay());
const timeAt=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const clockMinutes=(instant,timeZone)=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
};
// Overlapping blocks share the day width, including conflicts kept in old drafts.
function placeBlocks(blocks){
 blocks.sort((a,b)=>a.start-b.start||a.end-b.end);
 let cluster=[],lanes=[],edge=-1;
 const finish=()=>{for(const block of cluster)block.columns=lanes.length;cluster=[];lanes=[];edge=-1;};
 for(const block of blocks){
  if(block.start>=edge)finish();
  let lane=lanes.findIndex(end=>end<=block.start);if(lane<0)lane=lanes.length;
  const renderedEnd=Math.max(block.end,block.start+15);
  block.column=lane;lanes[lane]=renderedEnd;edge=Math.max(edge,renderedEnd);cluster.push(block);
 }
 finish();return blocks;
}

export function renderPlannerWeek({document,plan,startDay,today,points,segmentsByDay,tasks,events,formatClock,onNavigate,onDrop,onEdit,onRemove,onLock,onOpen,onComplete,dropNotice,urgency,completionStates}){
 const {el,button}=ui(document);const panel=el('section','daily-plan');
 const endDay=addDays(startDay,6);
 const toolbar=el('div','week-toolbar');toolbar.append(el('h3','','Your days'));
 const previous=button('Previous plan week',()=>onNavigate(addDays(startDay,-7)),'control','‹');previous.disabled=addDays(startDay,-1)<plan.range.startDate;
 const next=button('Next plan week',()=>onNavigate(addDays(startDay,7)),'control','›');next.disabled=addDays(startDay,7)>plan.range.endDate;
 toolbar.append(previous,button('Current plan week',()=>onNavigate(today,true),'control','Today'),next,el('span','week-range',`${startDay} – ${endDay}`));
 panel.append(toolbar,el('p','hint week-instructions','Drag tasks into a time slot. Drag existing blocks to move them. Click a block to edit.'));
 if(dropNotice){const line=el('p','notice week-drop-notice',dropNotice);line.setAttribute('role','alert');panel.append(line);}
 const scroll=el('div','week-scroll');scroll.tabIndex=0;setLabel(scroll,'Weekly plan timeline');
 const grid=el('div','week-grid');scroll.append(grid);panel.append(scroll);
 grid.append(el('div','week-corner','Time'));
 const days=Array.from({length:7},(_,i)=>addDays(startDay,i));
 for(const day of days){
  const header=el('div',`week-day-header${day===today?' is-today':''}${day<plan.range.startDate||day>plan.range.endDate?' outside-plan':''}`);
  const name=new Intl.DateTimeFormat(intlLocale(document),{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
  const point=points.get(day);header.append(el('strong','',name,true),el('span','hint',point?{key:'{count} tasks · {duration}',values:{count:point.tasks,duration:translate(document,formatMinutes(point.minutes))}}:'Outside plan range'));grid.append(header);
 }
 const axis=el('div','week-time-axis');
 for(let hour=0;hour<24;hour++){const label=el('div','week-hour',`${String(hour).padStart(2,'0')}:00`,true);label.dataset.hour=hour;axis.append(label);}
 grid.append(axis);
 for(const day of days){
  const active=day>=plan.range.startDate&&day<=plan.range.endDate;
  const lane=el('div',`week-day-lane${day===today?' is-today':''}${active?'':' outside-plan'}`);lane.dataset.planDay=day;
  const marker=el('div','week-drop-marker');marker.hidden=true;lane.append(marker);
  const dropMinute=e=>{
   const rect=lane.getBoundingClientRect();
   const slot=e.target.closest?.('[data-drop-time]');
   if(slot&&(!rect.height||e.clientY===0)){const [h,m]=slot.dataset.dropTime.split(':').map(Number);return h*60+m;}
   return Math.max(0,Math.min(1425,Math.round((e.clientY-rect.top)/HOUR_HEIGHT*60/15)*15));
  };
  if(active){
   for(let minute=0;minute<1440;minute+=15){const slot=el('div','week-drop-slot');slot.dataset.dropTime=timeAt(minute);slot.style.top=`${minute/60*HOUR_HEIGHT}px`;lane.append(slot);}
   lane.addEventListener('dragover',e=>{e.preventDefault();const minute=dropMinute(e);marker.hidden=false;marker.style.top=`${minute/60*HOUR_HEIGHT}px`;marker.textContent=timeAt(minute);});
   lane.addEventListener('dragleave',e=>{if(!lane.contains(e.relatedTarget))marker.hidden=true;});
   lane.addEventListener('drop',e=>{e.preventDefault();marker.hidden=true;onDrop(e,day,timeAt(dropMinute(e)));});
  }
  const blocks=[];
  for(const segment of segmentsByDay.get(day)||[]){
   const task=tasks[segment.itemKey];if(!task)continue;
   const start=dateKey(segment.startAt,plan.timeZone)<day?0:clockMinutes(segment.startAt,plan.timeZone);
   let end=dateKey(segment.endAt,plan.timeZone)>day?1440:clockMinutes(segment.endAt,plan.timeZone);
   if(end<=start)end=Math.min(1440,start+(Date.parse(segment.endAt)-Date.parse(segment.startAt))/60000);
   blocks.push({start,end,segment,task});
  }
  const dayStart=Date.parse(startOfLocalDay(day,plan.timeZone)),dayEnd=Date.parse(startOfLocalDay(addDays(day,1),plan.timeZone));
  for(const event of events){
   const first=Date.parse(event.fixedStartAt),last=Date.parse(event.fixedEndAt);
   if(!Number.isFinite(first)||!Number.isFinite(last)||last<dayStart||first>=dayEnd||last===dayStart&&first<last)continue;
   const start=first<=dayStart?0:clockMinutes(first,plan.timeZone),end=last>=dayEnd?1440:clockMinutes(last,plan.timeZone);
   blocks.push({start,end:Math.max(start+15,end),task:event});
  }
  for(const block of placeBlocks(blocks)){
   const {start,end,segment,task,column,columns}=block;
   const row=el('div',`week-block${segment?'':' fixed-block'}${task.completed?' completed':''}${segment?.locked?' locked':''}`);
   row.style.top=`${start/60*HOUR_HEIGHT}px`;row.style.height=`${Math.max(24,(end-start)/60*HOUR_HEIGHT)}px`;
   row.style.left=`calc(${column/columns*100}% + 2px)`;row.style.width=`calc(${100/columns}% - 4px)`;
   const startAt=segment?.startAt||task.fixedStartAt,endAt=segment?.endAt||task.fixedEndAt;
   row.title=`${task.title}\n${formatClock(startAt)}–${formatClock(endAt)}${segment?.locked?` · ${translate(document,'Locked')}`:''}`;
   if(segment){
    row.dataset.segmentId=segment.id;row.draggable=!segment.locked&&!task.completed;
    row.addEventListener('dragstart',e=>{if(!row.draggable){e.preventDefault();return;}e.dataTransfer?.setData('application/x-canvas-planner-segment',segment.id);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';});
    const edit=button(`Edit block ${segment.id}`,()=>onEdit(task.key,day,segment.id),'week-block-title',task.title);setText(edit,task.title,true);edit.title=row.title;
    row.append(edit,el('span','week-block-time',`${formatClock(startAt)}–${formatClock(endAt)}`,true));
    const menu=el('details','week-block-actions');const summary=el('summary','','⋯',true);setLabel(summary,`Actions for ${task.title}`);menu.append(summary);
    const duration=translate(document,formatMinutes((Date.parse(endAt)-Date.parse(startAt))/60000)),estimate=translate(document,formatMinutes(task.estimateMinutes));
    const actions=el('div','week-block-menu');actions.append(button(`Open ${task.title}`,()=>onOpen(task.key),'task-title',task.title),el('p','hint',`${duration} / ${estimate}`,true),button(`Remove block ${segment.id}`,()=>onRemove(segment.id),'text-button','Remove'),button(`Lock block ${segment.id}`,()=>onLock(segment.id,!segment.locked),'text-button',segment.locked?'Unlock':'Lock'));
    const urgent=urgency?.(task);if(urgent){row.classList.add(`urgency-${urgent.level}`);if(urgent.tag)actions.append(urgent.tag);}
    if(!task.canvasCompleted&&onComplete){const complete=button(`${task.completed?'Reopen':'Complete'} ${task.title}`,()=>onComplete(task.key,!task.completed),'text-button',completionStates?.get(task.key)?.saving?'Saving…':task.completed?'Undo completion':'✓ Complete');complete.disabled=Boolean(completionStates?.get(task.key)?.saving);actions.append(complete);}
    if(completionStates?.get(task.key)?.error){const error=el('p','notice plan-completion-error',completionStates.get(task.key).error);error.setAttribute('role','alert');actions.append(error);}
    menu.append(actions);row.append(menu);
   }else{row.dataset.fixedEvent=task.key;const open=button(`View event ${task.title}`,()=>onEdit(task.key,day),'week-block-title',task.title);setText(open,task.title,true);open.title=row.title;row.append(open,el('span','week-block-time',`${formatClock(startAt)}–${formatClock(endAt)} · ${translate(document,'Fixed activity')}`,true));}
   if(task.completed){const badge=el('span','week-block-completed','✓',true);setLabel(badge,'Completed');badge.title=translate(document,'Completed');row.append(badge);}
   lane.append(row);
  }
  grid.append(lane);
 }
 return panel;
}
