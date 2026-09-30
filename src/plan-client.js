export function createPlanClient({sendMessage,userId}){
 const request=async message=>{try{return await sendMessage({...message,userId});}catch{return {ok:false,code:'STORAGE',message:'The extension background is unavailable. Reload the extension and try again.'};}};
 return {save:(plan,expectedRevision)=>request({type:'PLAN_SAVE',plan,expectedRevision}),remove:(id,expectedRevision)=>request({type:'PLAN_DELETE',id,expectedRevision})};
}
