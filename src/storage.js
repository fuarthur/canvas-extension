export function createPlannerStore(storageArea, hostname, userId) {
  const prefix = `canvas-planner:${hostname}:${userId}:`;
  const startKey = itemKey => `${prefix}start:${itemKey}`;
  const completedKey = itemKey => `${prefix}completed:${itemKey}`;

  return {
    async load() {
      const entries = await storageArea.get(null);
      const state = { starts: {}, completed: {} };
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
    }
  };
}
