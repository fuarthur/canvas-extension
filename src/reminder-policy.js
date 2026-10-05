export const reminderToken=(scope,item,leadMinutes)=>JSON.stringify([scope.hostname,String(scope.userId),item.key,Date.parse(item.dueAt),leadMinutes]);
export function evaluateReminders({scope,items,settings,selectedCalendars,completed={},ledger={},now}){
 const deliveries=[],skipped=[];let nextAt=null;
 const future=at=>{if(at>now&&(nextAt==null||at<nextAt))nextAt=at;};
 if(!settings.enabled)return {deliveries,skipped,nextAt};
 const keys=new Set();
 for(const item of items){
  const dueAt=Date.parse(item.dueAt);
  if(item.type!=='assignment'||!Number.isFinite(dueAt)||dueAt<=now||item.completed||item.canvasCompleted||completed[item.key]||keys.has(item.key))continue;
  keys.add(item.key);
  if(Array.isArray(selectedCalendars)&&!item.contextCodes?.some(code=>selectedCalendars.includes(code)))continue;
  const rounds=[...new Set(settings.leadMinutes)].map(leadMinutes=>({item,leadMinutes,token:reminderToken(scope,item,leadMinutes),at:dueAt-leadMinutes*60000})).sort((a,b)=>a.at-b.at);
  const elapsed=rounds.filter(round=>round.at<=now);
  for(const round of rounds.filter(round=>round.at>now))if(!['sent','pending','skipped'].includes(ledger[round.token]?.state))future(round.at);
  for(const round of elapsed.slice(0,-1))if(!ledger[round.token])skipped.push({token:round.token,dueAt});
  const latest=elapsed.at(-1);if(!latest)continue;
  const entry=ledger[latest.token];if(['sent','pending','skipped'].includes(entry?.state))continue;
  if(entry?.state==='failed'&&entry.retryAt>now){if(entry.retryAt<dueAt)future(entry.retryAt);continue;}
  deliveries.push(latest);
 }
 return {deliveries:deliveries.sort((a,b)=>Date.parse(a.item.dueAt)-Date.parse(b.item.dueAt)),skipped,nextAt};
}
