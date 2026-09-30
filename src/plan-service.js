import {isPlanRecord,validPlanId} from './storage.js';
export function validPlanningSender(sender){try{const url=new URL(sender?.url);return url.origin==='https://canvas.illinois.edu'&&url.pathname==='/calendar';}catch{return false;}}
export function createPlanService({storageArea,now=()=>new Date()}){
 const queues=new Map();
 return {async handle(message,sender){
  if(!validPlanningSender(sender)||!/^\d+$/.test(String(message?.userId))||!['PLAN_SAVE','PLAN_DELETE'].includes(message?.type)||!Number.isInteger(message.expectedRevision)||message.expectedRevision<0)return {ok:false,code:'INVALID',message:'Invalid plan request.'};
  const id=message.type==='PLAN_SAVE'?message.plan?.id:message.id;
  if(!validPlanId(id)||(message.type==='PLAN_SAVE'&&!isPlanRecord(message.plan)))return {ok:false,code:'INVALID',message:'Invalid plan record.'};
  const key=`canvas-planner:canvas.illinois.edu:${message.userId}:plan:${id}`;
  const action=(queues.get(key)||Promise.resolve()).then(async()=>{
   try{
    const existing=(await storageArea.get(null))[key];
    if(existing&&!isPlanRecord(existing))return {ok:false,code:'INVALID',message:'The saved record cannot be replaced; save a new copy.'};
    if((existing?.revision||0)!==message.expectedRevision)return {ok:false,code:'CONFLICT',message:'This plan changed in another page. Reload it or save a copy.'};
    if(message.type==='PLAN_DELETE'){await storageArea.remove(key);return {ok:true};}
    const next={...structuredClone(message.plan),revision:message.expectedRevision+1,createdAt:existing?.createdAt||message.plan.createdAt,updatedAt:new Date(now()).toISOString()};await storageArea.set({[key]:next});return {ok:true,plan:next};
   }catch{return {ok:false,code:'STORAGE',message:'Could not save the plan. Your draft is still available.'};}
  });queues.set(key,action);try{return await action;}finally{if(queues.get(key)===action)queues.delete(key);}
 }};
}
