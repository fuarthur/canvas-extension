import {validLanguage} from './i18n.js';
import {defaultSettings,validateSettings,validateSchedule,validMinutes} from './planning-settings.js';
import {validDay,daysBetween} from './dates.js';
import {validTarget,defaultTaskPreferences,validateTaskPreferences} from './tasks.js';
const taskQueues=new WeakMap();
// Live content pages share Canvas's origin, so Web Locks serialize their
// read/compare/write transactions. The fallback keeps store instances ordered
// in runtimes without Web Locks (including the test storage adapter).
function taskTransaction(storageArea,name,operation){
  if(globalThis.navigator?.locks)return globalThis.navigator.locks.request(name,operation);
  let queues=taskQueues.get(storageArea);if(!queues){queues=new Map();taskQueues.set(storageArea,queues);}
  const next=(queues.get(name)||Promise.resolve()).then(operation);
  const tail=next.catch(()=>{});queues.set(name,tail);
  tail.then(()=>{if(queues.get(name)===tail)queues.delete(name);});return next;
}
const writeVersion=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}:${Math.random()}`;
export function createPlannerStore(storageArea, hostname, userId) {
  const prefix = `canvas-planner:${hostname}:${userId}:`;
  const startKey = itemKey => `${prefix}start:${itemKey}`;
  const completedKey = itemKey => `${prefix}completed:${itemKey}`;
  const versionKey=key=>`${prefix}task-version:${key.slice(prefix.length)}`;
  const transaction=operation=>taskTransaction(storageArea,`${prefix}task-mutations`,operation);
  const writeField=(key,value)=>transaction(()=>storageArea.set({[key]:value,[versionKey(key)]:writeVersion()}));

  return {
    async load() {
      const entries = await storageArea.get(null);
      const state = { starts: {}, completed: {} };
      const selection = entries[`${prefix}calendars`];
      if (Array.isArray(selection)) state.selectedCalendars = selection.filter(code => typeof code === 'string' && /^(user|course|group|account)_\d+$/.test(code));
      for (const [key, value] of Object.entries(entries)) {
        if (key.startsWith(`${prefix}start:`) && typeof value === 'string') {
          state.starts[key.slice(`${prefix}start:`.length)] = value;
        } else if (key.startsWith(`${prefix}completed:`) && value === true) {
          state.completed[key.slice(`${prefix}completed:`.length)] = true;
        }
      }
      return state;
    },
    async setStart(itemKey, day) {
      if (day == null) await storageArea.remove(startKey(itemKey));
      else await storageArea.set({ [startKey(itemKey)]: day });
    },
    async setCompleted(itemKey, completed) {
      await writeField(completedKey(itemKey),Boolean(completed));
    },
    async loadPlanningState() {
      const entries = await storageArea.get(null);
      const state = {settings:defaultSettings(),estimates:{},targets:{},taskPreferences:defaultTaskPreferences(),singleSessions:{},plans:{},warnings:[]};
      if(entries[`${prefix}settings:v1`] != null) {
        const checked=validateSettings(entries[`${prefix}settings:v1`]);
        if(checked.value)state.settings=checked.value;else state.warnings.push('Saved planning settings are invalid; using defaults.');
      }
      state.settings.language=validLanguage(entries[`${prefix}language`])?entries[`${prefix}language`]:'en';
      state.taskPreferences=validateTaskPreferences(entries[`${prefix}task-preferences`]);
      for(const [key,value] of Object.entries(entries)){
        if(!key.startsWith(prefix))continue;
        const suffix=key.slice(prefix.length);
        if(suffix.startsWith('estimate:')&&validMinutes(value))state.estimates[suffix.slice(9)]=value;
        if(suffix.startsWith('target:')&&validTarget(value))state.targets[suffix.slice(7)]=value;
        if(suffix.startsWith('single-session:')&&value===true)state.singleSessions[suffix.slice(15)]=true;
        if(suffix.startsWith('plan:')){
          if(isPlanRecord(value)&&value.id===suffix.slice(5))state.plans[value.id]=value;
          else state.warnings.push(`Saved plan ${suffix.slice(5)} cannot be read; its record was preserved.`);
        }
      }
      return state;
    },
    async setLanguage(language){if(!validLanguage(language))throw new Error('Unsupported language.');await storageArea.set({[`${prefix}language`]:language});},
    async setTaskPreferences(value){await storageArea.set({[`${prefix}task-preferences`]:validateTaskPreferences(value)});},
    async applyTaskBatch(itemKeys,patch){
      if(!Array.isArray(itemKeys)||!itemKeys.length||itemKeys.some(key=>!validItemKey(key)))throw new Error('Select valid tasks.');
      if(!patch||!Object.keys(patch).length||Object.keys(patch).some(key=>!['completed','estimate','target'].includes(key)))throw new Error('Invalid task change.');
      if(Object.hasOwn(patch,'completed')&&typeof patch.completed!=='boolean')throw new Error('Invalid completion state.');
      if(Object.hasOwn(patch,'estimate')&&patch.estimate!=null&&!validMinutes(patch.estimate))throw new Error('Estimate must be 1–1440 whole minutes.');
      if(Object.hasOwn(patch,'target')&&patch.target!=null&&!validTarget(patch.target))throw new Error('Choose a valid planned finish date and time.');
      return transaction(async()=>{
        const before={},after={},versions={},writes={},entries=await storageArea.get(null);
        for(const itemKey of new Set(itemKeys))for(const [field,value] of Object.entries(patch)){
          const key=`${prefix}${field==='target'?'target':field==='estimate'?'estimate':'completed'}:${itemKey}`;
          before[key]=entries[key]??null;after[key]=value??null;
          versions[key]=writeVersion();writes[key]=after[key];writes[versionKey(key)]=versions[key];
        }
        await storageArea.set(writes);return {prefix,before,after,versions};
      });
    },
    async undoTaskBatch(token){
      if(token?.prefix!==prefix)throw new Error('Canvas account changed. Open the planner again.');
      return transaction(async()=>{
        const entries=await storageArea.get(null),restore={};let skipped=0,restored=0;
        for(const [key,value] of Object.entries(token.after)){
          if(!key.startsWith(prefix))throw new Error('Invalid task change.');
          if(entries[versionKey(key)]===token.versions?.[key]&&JSON.stringify(entries[key]??null)===JSON.stringify(value)){
            restore[key]=token.before[key]??null;restore[versionKey(key)]=writeVersion();restored++;
          }else skipped++;
        }
        if(restored)await storageArea.set(restore);return {restored,skipped};
      });
    },
    async setSettings(settings){const checked=validateSettings(settings);if(!checked.value)throw new Error(checked.errors.join(' '));await storageArea.set({[`${prefix}settings:v1`]:checked.value});},
    async setEstimate(itemKey,minutes){if(minutes!=null&&!validMinutes(minutes))throw new Error('Estimate must be 1–1440 whole minutes.');await writeField(`${prefix}estimate:${itemKey}`,minutes??null);},
    async setSingleSession(itemKey,value){if(value)await storageArea.set({[`${prefix}single-session:${itemKey}`]:true});else await storageArea.remove(`${prefix}single-session:${itemKey}`);},
    async setSelectedCalendars(codes) {
      await storageArea.set({ [`${prefix}calendars`]: [...new Set(codes)] });
    }
  };
}

export const validPlanId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export const validItemKey=key=>typeof key==='string'&&/^(assignment|event):[A-Za-z0-9_-]+$/.test(key);
export const validInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&/[TZ+-]/.test(value);
export function isPlanRecord(p){
 if(!p||p.schemaVersion!==1||!validPlanId(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||!Number.isInteger(p.revision)||p.revision<0||!validInstant(p.createdAt)||!validInstant(p.updatedAt)||!validDay(p.range?.startDate)||!validDay(p.range?.endDate)||p.range.endDate<p.range.startDate||typeof p.timeZone!=='string'||validateSchedule(p.schedule).length||!p.tasks||typeof p.tasks!=='object'||Array.isArray(p.tasks)||!Array.isArray(p.segments))return false;
 if(daysBetween(p.range.startDate,p.range.endDate).length>180)return false;
 try {new Intl.DateTimeFormat('en',{timeZone:p.timeZone});}catch{return false;}
 for(const [key,t] of Object.entries(p.tasks))if(!validItemKey(key)||t?.key!==key||!['event','assignment'].includes(t.type)||typeof t.title!=='string'||!validMinutes(t.estimateMinutes)||!Array.isArray(t.contextCodes)||!Array.isArray(t.contexts)||typeof t.singleSession!=='boolean')return false;
 const ids=new Set();for(const s of p.segments){if(!validPlanId(s.id)||ids.has(s.id)||!p.tasks[s.itemKey]||!validInstant(s.startAt)||!validInstant(s.endAt)||Date.parse(s.endAt)<=Date.parse(s.startAt)||typeof s.locked!=='boolean'||!Number.isFinite(s.order))return false;ids.add(s.id);}
 return true;
}
