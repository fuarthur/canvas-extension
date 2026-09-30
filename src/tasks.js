import {dateKey,addDays,validDay,zonedDateTime} from './dates.js';
import {resolveEstimate} from './estimates.js';

export const defaultHistoryFilter=()=>({mode:'semester',months:4});
export const validHistoryFilter=value=>value&&['semester','months','off'].includes(value.mode)&&Number.isInteger(value.months)&&value.months>=1&&value.months<=24;
export const defaultTaskPreferences=()=>({preset:'all',status:'remaining',course:'all',type:'all',sort:'dueAsc',group:'date',query:'',showHistory:false});
export function validateTaskPreferences(value={}){
 value=value&&typeof value==='object'?value:{};
 const result=defaultTaskPreferences();
 const choices={preset:['all','overdue','today','week','completed'],status:['all','remaining','completed'],type:['all','assignment','event'],sort:['dueAsc','dueDesc','estimateAsc','estimateDesc','targetAsc','targetDesc','titleAsc','titleDesc'],group:['none','date','course','type']};
 for(const [key,options] of Object.entries(choices))if(options.includes(value[key]))result[key]=value[key];
 if(value.course==='all'||/^(course|group|user|account)_\d+$/.test(value.course))result.course=value.course;
 if(typeof value.query==='string')result.query=value.query.slice(0,200);
 result.showHistory=value.showHistory===true;return result;
}
export function historyCutoff(filter=defaultHistoryFilter(),now=new Date(),timeZone){
 const day=dateKey(now,timeZone);if(!day||filter.mode==='off')return null;
 const [year,month,date]=day.split('-').map(Number);
 if(filter.mode!=='months')return `${year}-${month>=8?'08':month>=6?'06':'01'}-01`;
 const offset=Number.isInteger(filter.months)&&filter.months>=1&&filter.months<=24?filter.months:4;
 const first=new Date(Date.UTC(year,month-1-offset,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(date,last));return first.toISOString().slice(0,10);
}
export function isHistoricalTask(item,state={},options={}){
 if(item.type!=='assignment'||!item.dueAt)return false;
 const now=options.now??new Date();const cutoff=historyCutoff(state.settings?.historyFilter,now,options.timeZone);
 return Boolean(cutoff&&Date.parse(item.dueAt)<new Date(now).getTime()&&dateKey(item.dueAt,options.timeZone)<cutoff);
}
export const isTaskComplete=(item,state={})=>Boolean(item.completed||state.completed?.[item.key]);
export const isOverdueTask=(item,state={},now=new Date())=>item.type==='assignment'&&!isTaskComplete(item,state)&&Date.parse(item.dueAt)<new Date(now).getTime();
export function validTarget(value){return Boolean(value&&validDay(value.day)&&(value.time==null||/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)));}
export function targetInstant(value,timeZone){return validTarget(value)?zonedDateTime(value.day,value.time||'23:59',timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone):null;}
export const taskDate=item=>item.type==='assignment'?item.dueAt:item.fixedStartAt||item.startAt;
export function taskList(items,state,preferences={},options={}){
 const p=validateTaskPreferences(preferences),today=dateKey(options.now??new Date(),options.timeZone);
 const rows=[...new Map(items.map(i=>[i.key,i])).values()].filter(item=>{
  const complete=isTaskComplete(item,state),day=dateKey(taskDate(item),options.timeZone)||item.endDay;
  if(!p.showHistory&&isHistoricalTask(item,state,options))return false;
  if(p.preset==='completed'?!complete:p.status==='remaining'?complete:p.status==='completed'?!complete:false)return false;
  if(p.preset==='overdue'&&!isOverdueTask(item,state,options.now))return false;
  if(p.preset==='today'&&day!==today)return false;
  if(p.preset==='week'&&(day<today||day>addDays(today,6)))return false;
  return (p.course==='all'||item.contextCodes?.includes(p.course))&&(p.type==='all'||item.type===p.type)&&item.title.toLocaleLowerCase().includes(p.query.trim().toLocaleLowerCase());
 });
 const order=p.sort.endsWith('Desc')?-1:1;
 const value=item=>p.sort.startsWith('estimate')?resolveEstimate(item,state).minutes:p.sort.startsWith('target')?Date.parse(targetInstant(state.targets?.[item.key],options.timeZone)):Date.parse(taskDate(item));
 return rows.sort((a,b)=>{
  if(p.sort.startsWith('title'))return order*a.title.localeCompare(b.title)||a.key.localeCompare(b.key);
  const av=value(a),bv=value(b);if(!Number.isFinite(av)||!Number.isFinite(bv))return Number(!Number.isFinite(av))-Number(!Number.isFinite(bv))||a.title.localeCompare(b.title);
  return (av-bv)*order||a.title.localeCompare(b.title)||a.key.localeCompare(b.key);
 });
}
export function taskGroup(item,group,{now=new Date(),timeZone}={}){
 if(group==='none')return '';
 if(group==='course')return item.contexts?.[0]||'Personal';
 if(group==='type')return item.type==='assignment'?'Homework':'Calendar activities';
 const today=dateKey(now,timeZone),day=dateKey(taskDate(item),timeZone)||item.endDay;
 if(day<today)return item.type==='assignment'?(item.completed?'Earlier deadlines':'Overdue'):'Earlier activities';
 if(day===today)return 'Today';if(day===addDays(today,1))return 'Tomorrow';
 if(day<=addDays(today,6))return 'Next 7 days';return 'Later';
}
