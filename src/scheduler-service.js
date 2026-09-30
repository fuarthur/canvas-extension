import {validPlanningSender} from './plan-service.js';import {isPlanRecord,validInstant} from './storage.js';import {validDay} from './dates.js';
export function createSchedulerService({generateSchedule}){
 return {handlePort(port,sender){if(!validPlanningSender(sender)||!Number.isInteger(sender?.tab?.id)){port.disconnect();return;}
  let active=null,closed=false;const send=value=>{try{if(!closed)port.postMessage(value);}catch{active?.controller.abort();}};
  const receive=message=>{
   if(message?.type==='CANCEL'){if(active&&active.id===message.requestId&&active.sessionId===message.sessionId)active.controller.abort();return;}
   if(message?.type!=='START')return;
   const input=message.input;const valid=input&&isPlanRecord(input.plan)&&Array.isArray(input.items)&&input.items.every(i=>typeof i?.key==='string')&&validInstant(input.now)&&validDay(input.loadedRange?.startDate)&&validDay(input.loadedRange?.endDate)&&typeof message.requestId==='string'&&typeof message.sessionId==='string';
   if(!valid){send({type:'RESULT',requestId:message.requestId,result:{status:'error',message:'Invalid scheduling request.'}});return;}
   active?.controller.abort();const job={id:message.requestId,sessionId:message.sessionId,controller:new AbortController()};active=job;
   generateSchedule(input,{signal:job.controller.signal,onProgress:progress=>{if(active===job)send({type:'PROGRESS',requestId:job.id,progress});}}).then(result=>{if(active===job&&!closed){send({type:'RESULT',requestId:job.id,result});active=null;}}).catch(()=>{if(active===job&&!closed){send({type:'RESULT',requestId:job.id,result:{status:'error',message:'Scheduling stopped. Please retry; your draft was preserved.'}});active=null;}});
  };
  const disconnect=()=>{closed=true;active?.controller.abort();active=null;port.onMessage.removeListener(receive);port.onDisconnect.removeListener(disconnect);};port.onMessage.addListener(receive);port.onDisconnect.addListener(disconnect);
 }};
}
