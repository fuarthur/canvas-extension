import {validDay} from './dates.js';

export const SNAPSHOT_RETENTION_MS=24*60*60*1000;
const MAX_BYTES=2*1024*1024;
const queues=new WeakMap();
export function createCalendarCache(storageArea,hostname='canvas.illinois.edu') {
  if(!storageArea)return null;
  // Keep cache notifications separate from planning preferences and mutations.
  const prefix=`canvas-calendar-cache:${hostname}:v1:`,key=userId=>`${prefix}${userId}`;
  const stateKey=`${prefix}state`;
  const readState=async()=>({sequence:0,epoch:'initial',users:{},...(await storageArea.get(stateKey))[stateKey]});
  const transaction=operation=>{
    if(globalThis.navigator?.locks)return navigator.locks.request(`${prefix}write`,operation);
    const next=(queues.get(storageArea)||Promise.resolve()).then(operation);
    queues.set(storageArea,next.catch(()=>{}));return next;
  };
  return {
    async begin(userId) {
      return transaction(async()=>{
        const state=await readState();state.sequence++;
        await storageArea.set({[stateKey]:state});
        return {sequence:state.sequence,epoch:state.epoch,userEpoch:state.users[userId]||'initial'};
      });
    },
    async read(userId,now,ticket) {
      const entry=(await storageArea.get(key(userId)))[key(userId)];
      const snapshot=entry?.snapshot;
      if(!entry||!ticket||entry.ticket?.epoch!==ticket.epoch||entry.ticket?.userEpoch!==ticket.userEpoch||String(snapshot?.profile?.id)!==userId||entry.userId!==userId||
        !Number.isFinite(entry.savedAt)||entry.savedAt>now||now-entry.savedAt>=SNAPSHOT_RETENTION_MS||
        !Number.isFinite(entry.expires)||!Number.isFinite(entry.requestedAt)||typeof entry.selectionKey!=='string'||typeof entry.policyKey!=='string'||
        !['contexts','events','assignments','selectedCalendars'].every(name=>Array.isArray(snapshot[name]))||
        !validDay(snapshot.range?.startDate)||!validDay(snapshot.range?.endDate)||snapshot.range.endDate<snapshot.range.startDate)return null;
      return entry;
    },
    async write(entry) {
      if(!entry.ticket||new TextEncoder().encode(JSON.stringify(entry)).length>MAX_BYTES)return;
      await transaction(async()=>{
        const state=await readState();
        if(state.epoch!==entry.ticket.epoch||(state.users[entry.userId]||'initial')!==entry.ticket.userEpoch)return;
        const current=(await storageArea.get(key(entry.userId)))[key(entry.userId)];
        if(current?.ticket?.sequence>entry.ticket.sequence)return;
        await storageArea.set({[key(entry.userId)]:entry});
      });
    },
    async clear(userId) {
      await transaction(async()=>{
        const state=await readState(),epoch=globalThis.crypto?.randomUUID?.()||`${Date.now()}:${Math.random()}`;
        if(userId!=null)state.users[userId]=epoch;else {state.epoch=epoch;state.users={};}
        // Preserve an invalidation tombstone. Responses already in flight in
        // other tabs cannot recreate snapshots after this account signs out.
        await storageArea.set({[stateKey]:state});
        if(userId!=null)await storageArea.remove(key(userId));
        else for(const name of Object.keys(await storageArea.get(null)))if(name.startsWith(prefix)&&name!==stateKey)await storageArea.remove(name);
      });
    }
  };
}
