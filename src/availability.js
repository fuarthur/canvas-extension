import {daysBetween,zonedDateTime} from './dates.js';import {validateSchedule} from './planning-settings.js';
export function unionIntervals(intervals){const sorted=intervals.filter(i=>Number.isFinite(i.start)&&Number.isFinite(i.end)&&i.end>i.start).sort((a,b)=>a.start-b.start);const result=[];for(const i of sorted){const last=result.at(-1);if(last&&i.start<=last.end)last.end=Math.max(last.end,i.end);else result.push({...i});}return result;}
export function subtractIntervals(window,blocked){const result=[];let cursor=window.start;for(const part of unionIntervals(blocked)){if(part.end<=cursor||part.start>=window.end)continue;if(part.start>cursor)result.push({start:cursor,end:Math.min(part.start,window.end)});cursor=Math.max(cursor,part.end);}if(cursor<window.end)result.push({start:cursor,end:window.end});return result;}
export const bufferedInterval=(segment,bufferMinutes)=>({start:Date.parse(segment.startAt)-bufferMinutes*60000,end:Date.parse(segment.endAt)+bufferMinutes*60000});
export function buildAvailability({range,schedule,timeZone,now,fixedEvents=[],lockedSegments=[],bufferMinutes=0}){
 const issues=[];if(validateSchedule(schedule).length)return {days:[],issues:[{code:'CONFIG',message:'Invalid working windows or capacity.'}]};
 const actualNow=Date.parse(now);const days=[];
 for(const day of daysBetween(range.startDate,range.endDate)){
  const config=schedule.exceptions[day]||schedule.weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()];const begin=zonedDateTime(day,config.start,timeZone);const finish=zonedDateTime(day,config.end,timeZone,{disambiguation:'later'});
  if(!begin||!finish){issues.push({code:'TIME',day,message:`Working time does not exist on ${day}.`});days.push({day,intervals:[],budgetMinutes:0});continue;}
  const start=Date.parse(begin),end=Date.parse(finish);const clip=values=>unionIntervals(values.map(i=>({start:Math.max(start,i.start),end:Math.min(end,i.end)})));
  const fixed=clip(fixedEvents.map(e=>({start:Date.parse(e.fixedStartAt),end:Date.parse(e.fixedEndAt)})));const locks=clip(lockedSegments.map(s=>({start:Date.parse(s.startAt),end:Date.parse(s.endAt)})));
  const blocked=unionIntervals([...fixed,...clip(lockedSegments.map(s=>bufferedInterval(s,bufferMinutes)))]);const fixedMinutes=fixed.reduce((n,p)=>n+(p.end-p.start)/60000,0);const lockedMinutes=locks.reduce((n,p)=>n+(p.end-p.start)/60000,0);
  const intervals=subtractIntervals({start:Math.max(start,Math.ceil(actualNow/60000)*60000),end},blocked).map(p=>({start:Math.ceil(p.start/60000)*60000,end:Math.floor(p.end/60000)*60000})).filter(p=>p.end>p.start);
  const freeMinutes=intervals.reduce((n,p)=>n+(p.end-p.start)/60000,0);const budgetMinutes=Math.min(freeMinutes,Math.max(0,Math.floor(config.maxMinutes-fixedMinutes-lockedMinutes)));
  days.push({day,budgetMinutes,intervals:budgetMinutes?intervals.map(p=>({startAt:new Date(p.start).toISOString(),endAt:new Date(p.end).toISOString()})):[]});
 }return {days,issues};
}
