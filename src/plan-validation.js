import {dateKey,zonedDateTime,startOfLocalDay} from './dates.js';import {buildAvailability} from './availability.js';import {resolvePlanTasks} from './plans.js';import {newId} from './ui.js';
import {isHistoricalTask} from './tasks.js';
export function taskBounds(task,plan,now){
 const start=startOfLocalDay(plan.range.startDate,plan.timeZone);const manual=task.manualStartDay?startOfLocalDay(task.manualStartDay,plan.timeZone):null;
 return {start:Math.ceil(Math.max(Date.parse(now),Date.parse(start),task.unlockAt?Date.parse(task.unlockAt):-Infinity,manual?Date.parse(manual):-Infinity)/60000)*60000,end:Math.floor(Date.parse(task.dueAt)/60000)*60000};
}
export function fixedFacts(plan,items){return [...new Map([...Object.values(plan.tasks).filter(t=>t.type==='event'),...items.filter(i=>i.type==='event')].map(i=>[i.key,i])).values()];}
export function validatePlan(plan,{items=[],completed={},now,loadedRange,state,historyFilter}){
 const issues=[];const resolved=resolvePlanTasks(plan,{items,completed});const current=new Map(items.map(i=>[i.key,i]));const add=(code,message,extra={})=>issues.push({code,message,...extra});
 if(!loadedRange||loadedRange.startDate>plan.range.startDate||loadedRange.endDate<plan.range.endDate)add('RANGE','This plan extends beyond loaded calendar data.');
 for(const item of items)if(item.type==='assignment'&&!item.completed&&!completed[item.key]&&!isHistoricalTask(item,state||{settings:{historyFilter}},{now,timeZone:plan.timeZone})&&item.endDay<=plan.range.endDate&&!plan.tasks[item.key])add('MISSING_TASK','A current deadline task is missing from this plan; include newly loaded tasks.',{itemKey:item.key});
 const ids=new Set();for(const segment of plan.segments){if(ids.has(segment.id))add('DUPLICATE_ID','Work block IDs must be unique.',{segmentId:segment.id});ids.add(segment.id);}
 for(const key of resolved.unknownKeys)add('UNKNOWN','Task is not currently loaded; its deadline cannot be verified.',{itemKey:key});
 for(const change of resolved.changes)add('STALE','Task timing changed; update the plan task data before generating.',{itemKey:change.itemKey});
 const availability=buildAvailability({range:plan.range,schedule:plan.schedule,timeZone:plan.timeZone,now,fixedEvents:fixedFacts(plan,items)});issues.push(...availability.issues);const days=new Map(availability.days.map(d=>[d.day,d]));const totals={},daily={},counts={};const pending=[];
 for(const segment of plan.segments){
  const saved=plan.tasks[segment.itemKey];if(!saved){add('UNKNOWN','Segment references a missing task.',{segmentId:segment.id});continue;}if(resolved.tasks[saved.key].completed)continue;
  const item=current.get(saved.key)||saved;const start=Date.parse(segment.startAt),end=Date.parse(segment.endAt);const minutes=(end-start)/60000;
  if(!Number.isFinite(minutes)||minutes<=0||!Number.isInteger(minutes)||start%60000!==0||end%60000!==0){add('TIME','Work blocks need valid whole-minute times.',{segmentId:segment.id});continue;}
  if(saved.type!=='assignment'){add('FIXED','Calendar events retain their fixed time.',{itemKey:saved.key});continue;}
  totals[saved.key]=(totals[saved.key]||0)+minutes;counts[saved.key]=(counts[saved.key]||0)+1;const day=dateKey(start,plan.timeZone);daily[day]=(daily[day]||0)+minutes;pending.push({...segment,start,end});
  if(start<Date.parse(now))add('MISSED','An unfinished work block is already in the past.',{segmentId:segment.id});
  if(item.unlockAt&&start<Date.parse(item.unlockAt))add('UNLOCK','Work is before the Canvas open time.',{segmentId:segment.id});
  if(item.manualStartDay&&day<item.manualStartDay)add('START','Work is before your chosen plan start.',{segmentId:segment.id});
  if(!item.dueAt||!Number.isFinite(Date.parse(item.dueAt)))add('DEADLINE','Task has no valid current deadline.',{itemKey:saved.key});else if(end>Date.parse(item.dueAt))add('DEADLINE','Work ends after the current Canvas deadline.',{segmentId:segment.id});
  const available=days.get(day);if(!available?.intervals.some(i=>start>=Date.parse(i.startAt)&&end<=Date.parse(i.endAt)))add('WORK_WINDOW','Work overlaps a calendar activity or is outside available working time.',{segmentId:segment.id,day});
 }
 pending.sort((a,b)=>a.start-b.start);let latestEnd=-Infinity;for(const segment of pending){if(segment.start<latestEnd)add('OVERLAP','Work blocks overlap.',{segmentId:segment.id});latestEnd=Math.max(latestEnd,segment.end);}
 for(const [day,minutes]of Object.entries(daily))if(minutes>(days.get(day)?.budgetMinutes||0))add('CAPACITY','Planned work exceeds daily capacity.',{day});
 const unassigned={};for(const task of Object.values(plan.tasks)){if(task.type!=='assignment'||resolved.tasks[task.key].completed)continue;const amount=totals[task.key]||0;if(amount>task.estimateMinutes)add('EXCESS','Assigned time exceeds the task estimate.',{itemKey:task.key});if(amount<task.estimateMinutes)unassigned[task.key]=task.estimateMinutes-amount;if(task.singleSession&&(counts[task.key]||0)>1)add('SINGLE_SESSION','This task must fit in one continuous work block.',{itemKey:task.key});const item=current.get(task.key)||task;if(Date.parse(item.dueAt)<Date.parse(now))add('OVERDUE','This task is already overdue.',{itemKey:task.key});}
 return {valid:issues.length===0,complete:issues.length===0&&Object.keys(unassigned).length===0,issues,unassigned};
}
export function suggestSegment(plan,itemKey,{day,minutes,startTime},facts){
 const saved=plan.tasks[itemKey];if(!saved||saved.type!=='assignment'||!Number.isInteger(minutes)||minutes<1)return {segment:null,issues:[{code:'TIME',message:'Choose a task and a whole-minute duration.'}]};
 const assigned=plan.segments.filter(s=>s.itemKey===itemKey).reduce((n,s)=>n+(Date.parse(s.endAt)-Date.parse(s.startAt))/60000,0);
 if(assigned+minutes>saved.estimateMinutes)return {segment:null,issues:[{code:'EXCESS',message:'Increase the task estimate before allocating more time.'}]};
 const resolved=resolvePlanTasks(plan,facts);const item=facts.items?.find(i=>i.key===itemKey)||saved;const bounds=taskBounds(item,plan,facts.now);
 const occupied=plan.segments.filter(s=>!resolved.tasks[s.itemKey]?.completed);const available=buildAvailability({range:plan.range,schedule:plan.schedule,timeZone:plan.timeZone,now:facts.now,fixedEvents:fixedFacts(plan,facts.items||[]),lockedSegments:occupied}).days.find(d=>d.day===day);
 const specific=startTime?zonedDateTime(day,startTime,plan.timeZone):null;if(startTime&&!specific)return {segment:null,issues:[{code:'TIME',message:'This local time does not exist.'}]};
 if(available&&available.budgetMinutes>=minutes)for(const interval of available.intervals){const start=specific?Date.parse(specific):Math.max(Date.parse(interval.startAt),bounds.start);const end=start+minutes*60000;if(start>=Date.parse(interval.startAt)&&end<=Date.parse(interval.endAt)&&start>=bounds.start&&end<=bounds.end)return {segment:{id:newId('segment'),itemKey,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),locked:false,order:plan.segments.length},issues:[]};}
 return {segment:null,issues:[{code:'NO_SLOT',itemKey,message:'No available work interval fits before the deadline on this date.'}]};
}
