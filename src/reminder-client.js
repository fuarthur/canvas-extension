export function createReminderClient({userId,sendMessage}){
 const request=async(type,extra={})=>{
  try{return await sendMessage({...extra,type,userId})||{ok:false,code:'CONTEXT',message:'Reminder status is unavailable. Reload this Canvas page.'};}
  catch{return {ok:false,code:'CONTEXT',message:'Reminder status is unavailable. Reload this Canvas page.'};}
 };
 return {accountSeen:({selectedCalendars}={})=>request('REMINDER_ACCOUNT_SEEN',selectedCalendars==null?{}:{selectedCalendars}),getStatus:()=>request('REMINDER_STATUS'),testNotification:()=>request('REMINDER_TEST')};
}
