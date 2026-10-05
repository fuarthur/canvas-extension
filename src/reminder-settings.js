export const MAX_REMINDER_MINUTES=43200;
export const defaultReminderSettings=()=>({enabled:false,leadMinutes:[120]});
export function validateReminderSettings(input){
 const valid=typeof input?.enabled==='boolean'&&Array.isArray(input.leadMinutes)&&input.leadMinutes.length>=1&&input.leadMinutes.length<=5&&input.leadMinutes.every(n=>Number.isInteger(n)&&n>=1&&n<=MAX_REMINDER_MINUTES);
 return {value:valid?{enabled:input.enabled,leadMinutes:[...new Set(input.leadMinutes)].sort((a,b)=>b-a)}:null,errors:valid?[]:['Choose 1–5 reminder rounds, each 1 minute to 30 days before the deadline.']};
}
export const normalizeReminderSettings=input=>validateReminderSettings(input).value||defaultReminderSettings();
export function reminderMinutes(value,unit){
 const factor={minutes:1,hours:60,days:1440}[unit],result=value*factor;
 return typeof value==='number'&&Number.isInteger(result)&&result>=1&&result<=MAX_REMINDER_MINUTES?result:null;
}
export function resizeReminderRounds(values,count){
 if(!Number.isInteger(count)||count<1||count>5)throw new Error('Choose 1–5 reminder rounds.');
 const result=[...values].sort((a,b)=>b-a);
 if(count<result.length)return result.slice(-count);
 for(const value of [120,360,1440,2880,4320]){if(result.length===count)break;if(!result.includes(value))result.push(value);}
 return result.sort((a,b)=>b-a);
}
