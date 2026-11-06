// An isolated Chrome-storage-shaped adapter. It never touches extension storage.
const mutationQueues = new WeakMap();
export function createDemoStorage(localStorage, scenario = 'standard', window) {
  if (!['standard', 'capacity'].includes(scenario)) throw new Error('Unknown demo scenario.');
  const storageKey = `canvas-planner-demo:v1:${scenario}`;
  const listeners = new Set();
  let fail = false;
  const mutate = operation => {
    if (window?.navigator?.locks) return window.navigator.locks.request(`${storageKey}:mutate`, operation);
    let queues = mutationQueues.get(localStorage);
    if (!queues) { queues = new Map(); mutationQueues.set(localStorage, queues); }
    const next = (queues.get(storageKey) || Promise.resolve()).then(operation);
    const tail = next.catch(() => {});
    queues.set(storageKey, tail);
    tail.then(() => { if (queues.get(storageKey) === tail) queues.delete(storageKey); });
    return next;
  };
  const read = () => {
    let raw;
    try { raw = localStorage.getItem(storageKey); }
    catch { throw new Error('Demo storage is unavailable. Allow local storage, then reload.'); }
    if (raw == null) return {};
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch { throw new Error('Saved demo data is unreadable. Use Reset demo to restore the fictional sample.'); }
  };
  const emit = changes => queueMicrotask(() => listeners.forEach(listener => listener(changes)));
  const write = next => {
    if (fail) { fail = false; throw new Error('Demo save failed once as requested. Your previous data is safe. Try again.'); }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { throw new Error('Demo could not save locally. Check browser storage space and try again.'); }
  };
  const onStorage = event => {
    if (event.storageArea === localStorage && event.key === storageKey) emit({});
  };
  window?.addEventListener('storage', onStorage);
  return {
    async get(keys) {
      const entries = read();
      if (keys == null) return entries;
      const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(names.filter(key => Object.hasOwn(entries, key)).map(key => [key, entries[key]]));
    },
    async set(values) {
      return mutate(() => {
        const entries = read();
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {oldValue: entries[key], newValue: structuredClone(value)}]));
        write({...entries, ...values});
        emit(changes);
      });
    },
    async remove(keys) {
      return mutate(() => {
        const entries = read(), changes = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) { changes[key] = {oldValue: entries[key]}; delete entries[key]; }
        write(entries);
        emit(changes);
      });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    failNextWrite() { fail = true; },
    async reset() { return mutate(() => { localStorage.removeItem(storageKey); emit({}); }); },
    destroy() { listeners.clear(); window?.removeEventListener('storage', onStorage); }
  };
}
