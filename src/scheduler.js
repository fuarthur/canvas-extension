import {dateKey} from './dates.js';import {buildAvailability,subtractIntervals} from './availability.js';import {taskBounds,fixedFacts,validatePlan} from './plan-validation.js';import {resolvePlanTasks,planSeries} from './plans.js';
const duration=s=>(Date.parse(s.endAt)-Date.parse(s.startAt))/60000;
const cloneDays=days=>days.map(d=>({...d,intervals:d.intervals.map(i=>({...i}))}));
export async function generateSchedule(input,{signal,onProgress=()=>{},yieldControl=()=>new Promise(r=>setTimeout(r,0)),budgetMs=5000,clock=Date.now}={}){
 const {plan,items=[],completed={},now,loadedRange}=input;const started=clock();const facts={items,completed,now,loadedRange};let counter=0,states=0,stop=null;let best=[];let before={peak:0,variance:0,buffer:0};let after=before;
 const resolved=resolvePlanTasks(plan,facts);const retained=plan.segments.filter(s=>s.locked||resolved.tasks[s.itemKey]?.completed).map(s=>({...s}));best=retained;
 const checked=validatePlan({...plan,segments:retained},facts);const pending=Object.values(plan.tasks).filter(t=>t.type==='assignment'&&!resolved.tasks[t.key]?.completed);const live=new Map(items.map(i=>[i.key,i]));
 const checkpoint=async force=>{if(signal?.aborted){stop='cancelled';return false;}if(clock()-started>budgetMs){stop='timeout';return false;}if(force){await yieldControl();if(signal?.aborted){stop='cancelled';return false;}if(clock()-started>budgetMs){stop='timeout';return false;}}return true;};
 const finish=(segments=best)=>{const validation=validatePlan({...plan,segments},facts);const issues=[...validation.issues];for(const [itemKey,missingMinutes]of Object.entries(validation.unassigned))issues.push({code:'UNASSIGNED',itemKey,missingMinutes,message:'Could not fit all estimated work before the deadline. Adjust capacity, dates or splitting.'});return {status:stop||(validation.complete?'complete':'partial'),segments,validation,issues,metrics:{beforePeakMinutes:before.peak,afterPeakMinutes:after.peak,beforeVariance:before.variance,afterVariance:after.variance}};};
 if(!await checkpoint(true))return finish();
 // Overdue tasks stay visible; they do not stop scheduling other feasible tasks.
 if(checked.issues.some(i=>i.code!=='OVERDUE'))return finish();
 const locked=retained.filter(s=>!resolved.tasks[s.itemKey]?.completed);const base=buildAvailability({range:plan.range,schedule:plan.schedule,timeZone:plan.timeZone,now,fixedEvents:fixedFacts(plan,items),lockedSegments:locked});
 const capacities=new Map(base.days.map(d=>[d.day,d.budgetMinutes]));
 const needs=new Map(pending.map(t=>[t.key,Math.max(0,t.estimateMinutes-locked.filter(s=>s.itemKey===t.key).reduce((n,s)=>n+duration(s),0))]));
 const bounds=new Map(pending.map(t=>[t.key,taskBounds(live.get(t.key)||t,plan,now)]));
 const eligible=pending.filter(t=>bounds.get(t.key).end>bounds.get(t.key).start&&needs.get(t.key)>0);
 const singles=eligible.filter(t=>t.singleSession&&!locked.some(s=>s.itemKey===t.key));const splits=eligible.filter(t=>!t.singleSession);
 const make=(key,start,minutes)=>({id:`auto-${++counter}`,itemKey:key,startAt:new Date(start).toISOString(),endAt:new Date(start+minutes*60000).toISOString(),locked:false,order:counter});
 function candidates(task,days){const need=needs.get(task.key),bound=bounds.get(task.key);const result=[];for(const day of days){if(day.budgetMinutes<need)continue;for(const interval of day.intervals){const begin=Math.max(Date.parse(interval.startAt),bound.start);const end=Math.min(Date.parse(interval.endAt),bound.end);if(end-begin>=need*60000){result.push({day:day.day,start:begin});if(end-need*60000!==begin)result.push({day:day.day,start:end-need*60000});}}}return result.sort((a,b)=>(capacities.get(a.day)-days.find(d=>d.day===a.day).budgetMinutes)-(capacities.get(b.day)-days.find(d=>d.day===b.day).budgetMinutes)||a.start-b.start);}
 function occupy(days,segment){const next=cloneDays(days);const day=next.find(d=>d.day===dateKey(segment.startAt,plan.timeZone));day.budgetMinutes-=duration(segment);day.intervals=day.intervals.flatMap(i=>subtractIntervals({start:Date.parse(i.startAt),end:Date.parse(i.endAt)},[{start:Date.parse(segment.startAt),end:Date.parse(segment.endAt)}]).map(p=>({startAt:new Date(p.start).toISOString(),endAt:new Date(p.end).toISOString()})));return next;}
 async function pack(days,placed){const segments=[...retained,...placed];const remaining=new Map(splits.map(t=>[t.key,needs.get(t.key)]));
  for(const day of cloneDays(days)){if(!await checkpoint(true))break;onProgress({phase:'arranging',day:day.day});for(const interval of day.intervals){let cursor=Date.parse(interval.startAt);const end=Date.parse(interval.endAt);while(cursor<end&&day.budgetMinutes>0){const unfinished=splits.filter(t=>remaining.get(t.key)>0&&bounds.get(t.key).end>cursor);const ready=unfinished.filter(t=>bounds.get(t.key).start<=cursor).sort((a,b)=>bounds.get(a.key).end-bounds.get(b.key).end||a.key.localeCompare(b.key));
    if(!ready.length){const release=Math.min(...unfinished.map(t=>bounds.get(t.key).start).filter(n=>n>cursor));if(!Number.isFinite(release)||release>=end)break;cursor=release;continue;}
    const chosen=ready[0];const nextRelease=Math.min(...unfinished.map(t=>bounds.get(t.key).start).filter(n=>n>cursor));const edge=Math.min(end,bounds.get(chosen.key).end,nextRelease);const minutes=Math.min(remaining.get(chosen.key),day.budgetMinutes,Math.floor((edge-cursor)/60000));if(minutes<=0){cursor=Math.max(cursor+60000,edge);continue;}
    segments.push(make(chosen.key,cursor,minutes));remaining.set(chosen.key,remaining.get(chosen.key)-minutes);day.budgetMinutes-=minutes;cursor+=minutes*60000;
   }}
  }return segments;
 }
 singles.sort((a,b)=>bounds.get(a.key).end-bounds.get(b.key).end||candidates(a,base.days).length-candidates(b,base.days).length||a.key.localeCompare(b.key));
 const assignedScore=segments=>segments.filter(s=>!resolved.tasks[s.itemKey]?.completed).reduce((n,s)=>n+duration(s),0);let bestScore=assignedScore(best);
 async function search(index,days,placed){if(++states>2000||!await checkpoint(states%20===0))return false;
  if(index===singles.length){const candidate=await pack(days,placed);const score=assignedScore(candidate);if(score>bestScore){best=candidate;bestScore=score;}return validatePlan({...plan,segments:candidate},facts).complete;}
  const task=singles[index];const choices=candidates(task,days);for(const choice of choices){const segment=make(task.key,choice.start,needs.get(task.key));if(await search(index+1,occupy(days,segment),[...placed,segment]))return true;if(stop||states>2000)break;}
  // Keep a partial preview that still arranges the remaining feasible work.
  if(!stop&&states<=2000)await search(index+1,days,placed);return false;
 }
 await search(0,cloneDays(base.days),[]);if(stop)return finish();
 function measure(segments){const points=planSeries({...plan,segments},{items,completed,mode:'remaining'});const working=points.filter(p=>capacities.get(p.day)>0);const total=working.reduce((n,p)=>n+p.minutes,0);const capacity=working.reduce((n,p)=>n+capacities.get(p.day),0);const variance=working.reduce((n,p)=>n+(p.minutes-total*capacities.get(p.day)/Math.max(1,capacity))**2/Math.max(1,capacities.get(p.day)),0);const buffer=pending.reduce((n,t)=>{const last=segments.filter(s=>s.itemKey===t.key).map(s=>Date.parse(s.endAt)).sort((a,b)=>a-b).at(-1);return n+Math.max(0,(last||0)-(bounds.get(t.key).end-86400000));},0);return {peak:Math.max(0,...points.map(p=>p.minutes)),variance,buffer,points};}
 before=measure(best);after=before;
 const improves=(a,b)=>a.peak<b.peak-1e-8||(Math.abs(a.peak-b.peak)<1e-8&&(a.variance<b.variance-1e-8||(Math.abs(a.variance-b.variance)<1e-8&&a.buffer<b.buffer)));
 // Preserve feasibility while moving unlocked work toward lower-load legal days.
 if(validatePlan({...plan,segments:best},facts).complete){for(let iteration=0;iteration<2000;iteration++){
   if(!await checkpoint(true))break;let accepted=false;const points=after.points;const sources=[...points].sort((a,b)=>b.minutes-a.minutes||a.day.localeCompare(b.day));const targets=[...points].filter(p=>capacities.get(p.day)>0).sort((a,b)=>a.minutes-b.minutes||a.day.localeCompare(b.day));
   outer:for(const source of sources)for(const target of targets){if(source.day===target.day||source.minutes<=target.minutes+1)continue;for(const segment of best.filter(s=>!s.locked&&!resolved.tasks[s.itemKey]?.completed&&dateKey(s.startAt,plan.timeZone)===source.day)){
     const task=plan.tasks[segment.itemKey];if(task.type!=='assignment')continue;const chunk=task.singleSession?duration(segment):Math.min(duration(segment),Math.floor((source.minutes-target.minutes)/2));if(chunk<=0)continue;
     const shortened=best.filter(s=>s.id!==segment.id);if(chunk<duration(segment))shortened.push({...segment,endAt:new Date(Date.parse(segment.endAt)-chunk*60000).toISOString()});
     const occupied=shortened.filter(s=>!s.locked&&!resolved.tasks[s.itemKey]?.completed&&dateKey(s.startAt,plan.timeZone)===target.day);const day=base.days.find(d=>d.day===target.day);if(!day||day.budgetMinutes-occupied.reduce((n,s)=>n+duration(s),0)<chunk)continue;const bound=bounds.get(task.key);
     const free=day.intervals.flatMap(i=>subtractIntervals({start:Date.parse(i.startAt),end:Date.parse(i.endAt)},occupied.map(s=>({start:Date.parse(s.startAt),end:Date.parse(s.endAt)}))));
     for(const interval of free){const begin=Math.max(interval.start,bound.start);if(begin+chunk*60000>Math.min(interval.end,bound.end))continue;const candidate=[...shortened,make(task.key,begin,chunk)];const score=measure(candidate);if(improves(score,after)&&validatePlan({...plan,segments:candidate},facts).complete){best=candidate;after=score;accepted=true;onProgress({phase:'balancing',peakMinutes:score.peak});break outer;}}
   }}if(!accepted)break;
  }}
 const merged=[];for(const s of [...best].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)||a.id.localeCompare(b.id))){const previous=merged.at(-1);if(previous&&!previous.locked&&!s.locked&&previous.itemKey===s.itemKey&&previous.endAt===s.startAt&&dateKey(previous.startAt,plan.timeZone)===dateKey(s.startAt,plan.timeZone))previous.endAt=s.endAt;else merged.push({...s});}
 after=measure(merged);return finish(merged);
}
