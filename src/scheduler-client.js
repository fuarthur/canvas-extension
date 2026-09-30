import {newId} from './ui.js';
export function createSchedulerClient({connect}){
 let port=null,pending=null,destroyed=false;const sessionId=newId('session');
 const fail=()=>{if(port){port.onMessage.removeListener(receive);port.onDisconnect.removeListener(fail);}port=null;if(pending){pending.resolve({status:'error',message:'Extension background disconnected. Retry generation; your draft is unchanged.'});pending=null;}};
 const receive=message=>{if(!pending||message.requestId!==pending.id)return;if(message.type==='PROGRESS')pending.onProgress?.(message.progress);if(message.type==='RESULT'){pending.resolve({...message.result,requestId:pending.id});pending=null;}};
 function cancel(){if(!pending)return;try{port?.postMessage({type:'CANCEL',requestId:pending.id,sessionId});}catch{}pending.resolve({status:'cancelled',requestId:pending.id});pending=null;}
 return {run(input,{onProgress}={}){cancel();if(destroyed)return Promise.resolve({status:'error',message:'Scheduling client is closed.'});return new Promise(resolve=>{try{if(!port){port=connect({name:'canvas-planner-scheduler'});port.onMessage.addListener(receive);port.onDisconnect.addListener(fail);}pending={id:newId('request'),resolve,onProgress};port.postMessage({type:'START',requestId:pending.id,sessionId,input});}catch{fail();resolve({status:'error',message:'The extension background is unavailable. Retry after reloading.'});}});},cancel,destroy(){cancel();destroyed=true;if(port){port.onMessage.removeListener(receive);port.onDisconnect.removeListener(fail);port.disconnect();port=null;}}};
}
