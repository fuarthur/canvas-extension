import {defaultSettings,validateSettings,validateSchedule,validMinutes} from './planning-settings.js';
import {validDay,daysBetween} from './dates.js';
export function createPlannerStore(storageArea, hostname, userId) {
  const prefix = `canvas-planner:${hostname}:${userId}:`;
  const startKey = itemKey => `${prefix}start:${itemKey}`;
  const completedKey = itemKey => `${prefix}completed:${itemKey}`;

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
      if (completed) await storageArea.set({ [completedKey(itemKey)]: true });
      else await storageArea.remove(completedKey(itemKey));
    },
    async loadPlanningState() {
      const entries = await storageArea.get(null);
      const state = {settings:defaultSettings(),estimates:{},singleSessions:{},plans:{},warnings:[]};
      if(entries[`${prefix}settings:v1`] != null) {
        const checked=validateSettings(entries[`${prefix}settings:v1`]);
        if(checked.value)state.settings=checked.value;else state.warnings.push('Saved planning settings are invalid; using defaults.');
      }
      for(const [key,value] of Object.entries(entries)){
        if(!key.startsWith(prefix))continue;
        const suffix=key.slice(prefix.length);
        if(suffix.startsWith('estimate:')&&validMinutes(value))state.estimates[suffix.slice(9)]=value;
        if(suffix.startsWith('single-session:')&&value===true)state.singleSessions[suffix.slice(15)]=true;
        if(suffix.startsWith('plan:')){
          if(isPlanRecord(value)&&value.id===suffix.slice(5))state.plans[value.id]=value;
          else state.warnings.push(`Saved plan ${suffix.slice(5)} cannot be read; its record was preserved.`);
        }
      }
      return state;
    },
    async setSettings(settings){const checked=validateSettings(settings);if(!checked.value)throw new Error(checked.errors.join(' '));await storageArea.set({[`${prefix}settings:v1`]:checked.value});},
    async setEstimate(itemKey,minutes){if(minutes==null)await storageArea.remove(`${prefix}estimate:${itemKey}`);else {if(!validMinutes(minutes))throw new Error('Estimate must be 1–1440 whole minutes.');await storageArea.set({[`${prefix}estimate:${itemKey}`]:minutes});}},
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
