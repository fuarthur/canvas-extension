import {defaultSettings,validMinutes} from './planning-settings.js';
export function resolveEstimate(item,state={}){
 const manual=state.estimates?.[item.key];
 if(validMinutes(manual))return {minutes:manual,source:'manual',label:'Manual'};
 const settings=state.settings||defaultSettings();
 for(const rule of settings.rules||[]){
  if(!rule.enabled||!validMinutes(rule.minutes)||!rule.value?.trim())continue;
  const matches=rule.type==='titleContains'?String(item.title).toLocaleLowerCase().includes(rule.value.trim().toLocaleLowerCase()):(item.contextCodes||[]).includes(rule.value);
  if(matches)return {minutes:rule.minutes,source:'rule',ruleId:rule.id,label:`Rule: ${rule.name}`};
 }
 return {minutes:validMinutes(settings.defaultMinutes)?settings.defaultMinutes:60,source:'default',label:'Default'};
}
