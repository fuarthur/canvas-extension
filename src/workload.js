import {dateKey,daysBetween} from './dates.js';
import {resolveEstimate} from './estimates.js';
export function pressureLevel(count,settings){return count>=settings.redFrom?'red':count>=settings.yellowFrom?'yellow':'green';}
export function workloadSeries(items,state,range){
 const points=new Map(daysBetween(range.startDate,range.endDate).map(day=>[day,{day,tasks:0,minutes:0,itemKeys:[]}]));
 for(const item of new Map(items.map(item=>[item.key,item])).values()){
  if(item.completed||state.completed?.[item.key])continue;
  const point=points.get(item.type==='event'?item.startDay:item.endDay);if(!point)continue;
  point.tasks++;point.minutes+=resolveEstimate(item,state).minutes;point.itemKeys.push(item.key);
 }
 return [...points.values()];
}
export function workloadSummary(items,state,{now,timeZone,range}){
 const today=dateKey(now,timeZone);const series=workloadSeries(items,state,range);
 const overdue=[...new Map(items.map(item=>[item.key,item])).values()].filter(item=>!item.completed&&!state.completed?.[item.key]&&new Date(item.dueAt||item.fixedEndAt||item.endAt).getTime()<new Date(now).getTime());
 return {today:workloadSeries(items,state,{startDate:today,endDate:today})[0],overdue,series,totalTasks:series.reduce((sum,p)=>sum+p.tasks,0),totalMinutes:series.reduce((sum,p)=>sum+p.minutes,0),peakDay:series.some(p=>p.tasks)?[...series].sort((a,b)=>b.tasks-a.tasks)[0].day:null};
}
