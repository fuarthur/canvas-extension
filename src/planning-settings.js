import {validDay} from './dates.js';
import {defaultHistoryFilter,validHistoryFilter} from './tasks.js';
import {defaultCalendarLoading,validCalendarLoading,normalizeCalendarLoading} from './calendar-loading.js';
export const DEFAULT_NON_SPLIT_THRESHOLD_MINUTES=60;
export const DEFAULT_BUFFER_MINUTES=15;
export const scheduleBufferMinutes=schedule=>schedule.bufferMinutes??DEFAULT_BUFFER_MINUTES;
export function defaultSettings(){return {schemaVersion:1,language:'en',nativeCalendarCompletion:false,calendarLoading:defaultCalendarLoading(),historyFilter:defaultHistoryFilter(),defaultMinutes:60,nonSplitThresholdMinutes:DEFAULT_NON_SPLIT_THRESHOLD_MINUTES,yellowFrom:3,redFrom:6,rules:[],schedule:{weekdays:Array.from({length:7},()=>({start:'09:00',end:'21:00',maxMinutes:240})),exceptions:{},horizonDays:28,bufferMinutes:DEFAULT_BUFFER_MINUTES}};}
export const validMinutes=value=>Number.isInteger(value)&&value>=1&&value<=1440;
export const nonSplitThreshold=plan=>plan.nonSplitThresholdMinutes??DEFAULT_NON_SPLIT_THRESHOLD_MINUTES;
// Legacy singleSession=false was an implicit default, not consent to split.
export const canSplitTask=(task,plan)=>task.allowSplitting===true&&!task.singleSession&&task.estimateMinutes>nonSplitThreshold(plan);
export const timeMinutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
export function validateSchedule(schedule){
 const errors=[];
 const dayValid=day=>day&&timeMinutes(day.start)!=null&&timeMinutes(day.end)!=null&&timeMinutes(day.start)<timeMinutes(day.end)&&Number.isInteger(day.maxMinutes)&&day.maxMinutes>=0&&day.maxMinutes<=timeMinutes(day.end)-timeMinutes(day.start);
 if(!Array.isArray(schedule?.weekdays)||schedule.weekdays.length!==7||!schedule.weekdays.every(dayValid))errors.push('Each weekday needs a valid window and capacity.');
 if(!Number.isInteger(schedule?.horizonDays)||schedule.horizonDays<1||schedule.horizonDays>180)errors.push('Plan length must be 1–180 days.');
 if(schedule?.bufferMinutes!=null&&(!Number.isInteger(schedule.bufferMinutes)||schedule.bufferMinutes<0||schedule.bufferMinutes>1440))errors.push('Buffer between work blocks must be 0–1440 whole minutes.');
 if(!schedule?.exceptions||typeof schedule.exceptions!=='object'||Array.isArray(schedule.exceptions)||Object.entries(schedule.exceptions).some(([day,value])=>!validDay(day)||!dayValid(value)))errors.push('Date overrides need valid dates and capacities.');
 return errors;
}
export function validateSettings(input){
 const errors=[];
 if(input?.schemaVersion!==1)errors.push('Unsupported settings version.');
 if(input?.nativeCalendarCompletion!=null&&typeof input.nativeCalendarCompletion!=='boolean')errors.push('Choose whether to show extension completion on Canvas calendar.');
 if(input?.historyFilter!=null&&!validHistoryFilter(input.historyFilter))errors.push('Choose a history mode and 1–24 months.');
 if(input?.calendarLoading!=null&&!validCalendarLoading(input.calendarLoading))errors.push('Choose a calendar loading mode, 0–12 months before and after (at most 24 months total), and valid extra semester months.');
 if(!validMinutes(input?.defaultMinutes))errors.push('Default estimate must be 1–1440 whole minutes.');
 if(input?.nonSplitThresholdMinutes!=null&&!validMinutes(input.nonSplitThresholdMinutes))errors.push('Non-splitting threshold must be 1–1440 whole minutes.');
 if(!Number.isInteger(input?.yellowFrom)||!Number.isInteger(input?.redFrom)||input.yellowFrom<1||input.redFrom<=input.yellowFrom)errors.push('Pressure thresholds must increase from yellow to red.');
 if(!Array.isArray(input?.rules))errors.push('Rules must be a list.');
 else {const ids=new Set();for(const rule of input.rules){
  if(!rule||typeof rule.id!=='string'||!rule.id||ids.has(rule.id)||typeof rule.name!=='string'||!rule.name.trim()||typeof rule.enabled!=='boolean'||!validMinutes(rule.minutes)||typeof rule.value!=='string'||!rule.value.trim()||!['titleContains','contextIs'].includes(rule.type)||(rule.type==='contextIs'&&!/^(course|group|user|account)_\d+$/.test(rule.value)))errors.push('Each rule needs a unique ID, name, valid match and estimate.');
  ids.add(rule?.id);
 }}
 errors.push(...validateSchedule(input?.schedule));
 return {value:errors.length?null:{...structuredClone(input),schedule:{...structuredClone(input.schedule),bufferMinutes:scheduleBufferMinutes(input.schedule)},nonSplitThresholdMinutes:nonSplitThreshold(input),nativeCalendarCompletion:input.nativeCalendarCompletion===true,calendarLoading:normalizeCalendarLoading(input.calendarLoading),historyFilter:input.historyFilter||defaultHistoryFilter()},errors};
}
