import {translateForLanguage} from './i18n.js';
const origin='https://canvas.illinois.edu';
export function safeReminderUrl(value){
 try{if(typeof value!=='string'||!value.trim())return origin+'/calendar';const url=new URL(value,origin);if(url.origin===origin&&!url.username&&!url.password)return url.href;}
 catch{}return origin+'/calendar';
}
export async function notificationIdForToken(token){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return 'canvas-ddl-'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function formatReminderNotification({item,profile,language,now}){
 const dueAt=Date.parse(item.dueAt);if(!Number.isFinite(dueAt)||!Number.isFinite(now))throw new Error('Invalid reminder deadline.');
 const deadline=new Intl.DateTimeFormat(language==='zh-CN'?'zh-CN':'en-US',{timeZone:profile.time_zone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(dueAt);
 const minutes=Math.max(1,Math.ceil((dueAt-now)/60000));
 const message=translateForLanguage(language,{key:'Due in {minutes} min · {deadline}',values:{minutes,deadline}});
 return {title:item.title||translateForLanguage(language,'Untitled assignment'),message:[item.contexts?.join(', '),message].filter(Boolean).join('\n')};
}
