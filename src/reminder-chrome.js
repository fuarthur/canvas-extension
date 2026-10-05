export function createReminderChrome({chromeApi,iconUrl}){
 const callback=(owner,method,...args)=>new Promise((resolve,reject)=>{
  try{owner[method](...args,result=>{const error=chromeApi.runtime.lastError;if(error)reject(new Error(error.message));else resolve(result);});}
  catch(error){reject(error);}
 });
 return {
  alarms:{get:name=>callback(chromeApi.alarms,'get',name),set:async(name,info)=>chromeApi.alarms.create(name,info),remove:name=>callback(chromeApi.alarms,'clear',name)},
  notifications:{permission:()=>callback(chromeApi.notifications,'getPermissionLevel'),create:({id,title,message})=>callback(chromeApi.notifications,'create',id,{type:'basic',iconUrl,title,message,priority:0}),clear:id=>callback(chromeApi.notifications,'clear',id),open:url=>callback(chromeApi.tabs,'create',{url})}
 };
}
