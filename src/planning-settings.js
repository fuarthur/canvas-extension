import {validDay} from './dates.js';
export function defaultSettings(){return {schemaVersion:1,defaultMinutes:60,yellowFrom:3,redFrom:6,rules:[],schedule:{weekdays:Array.from({length:7},()=>({start:'09:00',end:'21:00',maxMinutes:240})),exceptions:{},horizonDays:28}};}
export const validMinutes=value=>Number.isInteger(value)&&value>=1&&value<=1440;
export const timeMinutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
export function validateSchedule(schedule){
 const errors=[];
 const dayValid=day=>day&&timeMinutes(day.start)!=null&&timeMinutes(day.end)!=null&&timeMinutes(day.start)<timeMinutes(day.end)&&Number.isInteger(day.maxMinutes)&&day.maxMinutes>=0&&day.maxMinutes<=timeMinutes(day.end)-timeMinutes(day.start);
 if(!Array.isArray(schedule?.weekdays)||schedule.weekdays.length!==7||!schedule.weekdays.every(dayValid))errors.push('Each weekday needs a valid window and capacity.');
 if(!Number.isInteger(schedule?.horizonDays)||schedule.horizonDays<1||schedule.horizonDays>180)errors.push('Plan length must be 1–180 days.');
 if(!schedule?.exceptions||typeof schedule.exceptions!=='object'||Array.isArray(schedule.exceptions)||Object.entries(schedule.exceptions).some(([day,value])=>!validDay(day)||!dayValid(value)))errors.push('Date overrides need valid dates and capacities.');
 return errors;
}
export function validateSettings(input){
 const errors=[];
 if(input?.schemaVersion!==1)errors.push('Unsupported settings version.');
 if(!validMinutes(input?.defaultMinutes))errors.push('Default estimate must be 1–1440 whole minutes.');
 if(!Number.isInteger(input?.yellowFrom)||!Number.isInteger(input?.redFrom)||input.yellowFrom<1||input.redFrom<=input.yellowFrom)errors.push('Pressure thresholds must increase from yellow to red.');
 if(!Array.isArray(input?.rules))errors.push('Rules must be a list.');
 else {const ids=new Set();for(const rule of input.rules){
  if(!rule||typeof rule.id!=='string'||!rule.id||ids.has(rule.id)||typeof rule.name!=='string'||!rule.name.trim()||typeof rule.enabled!=='boolean'||!validMinutes(rule.minutes)||typeof rule.value!=='string'||!rule.value.trim()||!['titleContains','contextIs'].includes(rule.type)||(rule.type==='contextIs'&&!/^(course|group|user|account)_\d+$/.test(rule.value)))errors.push('Each rule needs a unique ID, name, valid match and estimate.');
  ids.add(rule?.id);
 }}
 errors.push(...validateSchedule(input?.schedule));
 return {value:errors.length?null:structuredClone(input),errors};
}
