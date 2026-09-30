import {dateKey,daysBetween} from './dates.js';
import {resolveEstimate} from './estimates.js';
import {validateSchedule} from './planning-settings.js';
import {isHistoricalTask} from './tasks.js';
export function snapshotTask(item,state){return {...structuredClone(item),estimateMinutes:resolveEstimate(item,state).minutes,singleSession:Boolean(state.singleSessions?.[item.key]),completedAtSave:Boolean(item.completed||state.completed?.[item.key])};}
export function createPlan({id,name,items,state,startDate,endDate,timeZone,now}){
 if(daysBetween(startDate,endDate).length>180||validateSchedule(state.settings.schedule).length)throw new Error('Choose a valid plan range of 1–180 days.');
 const tasks={};for(const item of items){if(item.completed||state.completed?.[item.key]||isHistoricalTask(item,state,{now,timeZone}))continue;const included=item.type==='assignment'?item.endDay<=endDate:item.startDay<=endDate&&item.endDay>=startDate;if(included)tasks[item.key]=snapshotTask(item,state);}
 const stamp=new Date(now).toISOString();return {schemaVersion:1,id,name,revision:0,createdAt:stamp,updatedAt:stamp,timeZone,range:{startDate,endDate},schedule:structuredClone(state.settings.schedule),tasks,segments:[],basisFingerprint:''};
}
export function copyPlan(plan,{id,name,now}){const stamp=new Date(now).toISOString();return {...structuredClone(plan),id,name,revision:0,createdAt:stamp,updatedAt:stamp};}
export function updatePlan(plan,op){
 const p=structuredClone(plan);switch(op.type){
 case 'rename':p.name=op.name;break;
 case 'configure':if(daysBetween(op.range.startDate,op.range.endDate).length>180||validateSchedule(op.schedule).length)throw new Error('Choose a valid range and working capacities.');p.range=structuredClone(op.range);p.schedule=structuredClone(op.schedule);break;
 case 'addTask':p.tasks[op.task.key]=structuredClone(op.task);break;
 case 'removeTask':delete p.tasks[op.itemKey];p.segments=p.segments.filter(s=>s.itemKey!==op.itemKey);break;
 case 'addSegment':if(p.segments.some(s=>s.id===op.segment.id))throw new Error('Duplicate segment.');p.segments.push(structuredClone(op.segment));break;
 case 'updateSegment':p.segments=p.segments.map(s=>s.id===op.id?{...s,...op.patch}:s);break;
 case 'removeSegment':p.segments=p.segments.filter(s=>s.id!==op.id);break;
 case 'reorder':p.segments=p.segments.map(s=>op.orderedIds.includes(s.id)?{...s,order:op.orderedIds.indexOf(s.id)}:s);break;
 case 'lock':p.segments=p.segments.map(s=>s.id===op.id?{...s,locked:op.locked}:s);break;
 case 'updateTasks':p.tasks=structuredClone(op.tasks);break;
 default:throw new Error('Unknown plan change.');
 }return p;
}
export function resolvePlanTasks(plan,{items=[],completed={},state}){
 const live=new Map(items.map(i=>[i.key,i]));const tasks={},changes=[],unknownKeys=[];
 for(const [key,saved]of Object.entries(plan.tasks)){
  const item=live.get(key);tasks[key]={...saved,completed:Boolean(completed[key]||item?.completed),known:Boolean(item)};
  if(!item){unknownKeys.push(key);continue;}
  const changed=['dueAt','unlockAt','manualStartDay','fixedStartAt','fixedEndAt'].filter(field=>(saved[field]??null)!==(item[field]??null));
  if(state&&saved.estimateMinutes!==resolveEstimate(item,state).minutes)changed.push('estimateMinutes');
  if(state&&saved.singleSession!==Boolean(state.singleSessions?.[key]))changed.push('singleSession');
  if(changed.length)changes.push({itemKey:key,fields:changed});
 }return {tasks,changes,unknownKeys};
}
// Split real instants at local day boundaries, including 23/25-hour DST days.
export function intervalDays(startAt,endAt,timeZone){
 let cursor=Date.parse(startAt);const end=Date.parse(endAt);if(!Number.isFinite(cursor)||!Number.isFinite(end)||end<cursor)return [];
 if(end===cursor)return [{day:dateKey(startAt,timeZone),minutes:0}];const parts=[];
 while(cursor<end){const day=dateKey(cursor,timeZone);let edge=end;
  if(dateKey(end-1,timeZone)!==day){let lo=cursor,hi=end;while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(dateKey(mid,timeZone)===day)lo=mid;else hi=mid;}edge=hi;}
  parts.push({day,minutes:(edge-cursor)/60000});cursor=edge;
 }return parts;
}
export function planSeries(plan,{items=[],completed={},mode='remaining'}={}){
 const resolved=resolvePlanTasks(plan,{items,completed});const points=new Map(daysBetween(plan.range.startDate,plan.range.endDate).map(day=>[day,{day,tasks:0,minutes:0,itemKeys:[]}]));
 const active=task=>mode==='saved'?!task.completedAtSave:!resolved.tasks[task.key]?.completed;
 const add=(key,day,minutes)=>{const p=points.get(day);if(!p)return;p.minutes+=minutes;if(!p.itemKeys.includes(key)){p.itemKeys.push(key);p.tasks++;}};
 for(const segment of plan.segments){const task=plan.tasks[segment.itemKey];if(!task||!active(task))continue;for(const part of intervalDays(segment.startAt,segment.endAt,plan.timeZone))add(task.key,part.day,part.minutes);}
 for(const task of Object.values(plan.tasks)){if(task.type!=='event'||!active(task))continue;const parts=intervalDays(task.fixedStartAt,task.fixedEndAt,plan.timeZone);const total=parts.reduce((s,p)=>s+p.minutes,0);if(!parts.length)continue;
  let remaining=task.estimateMinutes;parts.forEach((part,index)=>{const minutes=index===parts.length-1?remaining:Math.floor(total?task.estimateMinutes*part.minutes/total:task.estimateMinutes);remaining-=minutes;add(task.key,part.day,minutes);});
 }return [...points.values()];
}
export function comparePlans(plans,facts,{metric='minutes',mode='remaining'}={}){
 const startDate=plans.map(p=>p.range.startDate).sort()[0];const endDate=plans.map(p=>p.range.endDate).sort().at(-1);if(!startDate)return {series:[],summaries:[]};const axis=daysBetween(startDate,endDate);const colors=['#6154b4','#258c83','#c27d22','#bd4c75'];
 const summaries=[];const series=plans.map((plan,index)=>{const points=planSeries(plan,{...facts,mode});const byDay=new Map(points.map(p=>[p.day,p]));const assigned={};for(const s of plan.segments)assigned[s.itemKey]=(assigned[s.itemKey]||0)+(Date.parse(s.endAt)-Date.parse(s.startAt))/60000;
  const resolved=resolvePlanTasks(plan,facts);const unassigned=Object.values(plan.tasks).filter(t=>t.type==='assignment'&&(mode==='saved'?!t.completedAtSave:!resolved.tasks[t.key].completed)).reduce((n,t)=>n+Math.max(0,t.estimateMinutes-(assigned[t.key]||0)),0);
  const conflicts=plan.segments.filter(s=>{const item=facts.items?.find(i=>i.key===s.itemKey)||plan.tasks[s.itemKey];return item?.dueAt&&Date.parse(s.endAt)>Date.parse(item.dueAt);}).length;
  summaries.push({id:plan.id,name:plan.name,totalMinutes:points.reduce((n,p)=>n+p.minutes,0),peakMinutes:Math.max(0,...points.map(p=>p.minutes)),unassignedMinutes:unassigned,deadlineConflicts:conflicts,unknownTasks:resolved.unknownKeys.length});
  return {id:plan.id,name:plan.name,color:colors[index%colors.length],points:axis.map(day=>byDay.get(day)||{day,tasks:null,minutes:null,itemKeys:[]})};});return {series,summaries,metric,mode};
}
export function taskUrgency(task,{now,lastEndAt,completed}){
 if(completed||!task.dueAt)return {level:'none',label:'',reason:null};const due=Date.parse(task.dueAt);const left=(due-Date.parse(now))/3600000;
 if(lastEndAt&&Date.parse(lastEndAt)>due)return {level:'red',label:'Deadline conflict',reason:'conflict'};
 if(left<0)return {level:'red',label:'Overdue',reason:'overdue'};
 if(left<=24)return {level:'red',label:`Due in ${Math.max(0,Math.floor(left))}h`,reason:'due'};
 if(lastEndAt&&(due-Date.parse(lastEndAt))/3600000<24)return {level:'yellow',label:'Tight deadline',reason:'tight'};
 if(left<=72)return {level:'yellow',label:`Due in ${Math.ceil(left/24)}d`,reason:'due'};
 return {level:'none',label:`Due in ${Math.ceil(left/24)}d`,reason:null};
}
export function planFingerprint(plan,facts){return JSON.stringify([plan,facts.items?.map(i=>[i.key,i.dueAt,i.unlockAt,i.manualStartDay,i.fixedStartAt,i.fixedEndAt,i.completed,resolveEstimate(i,facts.state||{}).minutes]).sort((a,b)=>a[0].localeCompare(b[0])),facts.completed,facts.state?.singleSessions,facts.loadedRange,facts.state?.settings?.historyFilter]);}
