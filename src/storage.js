export function createPlannerStore(storageArea, hostname, userId) {
  const key = `canvas-planner:${hostname}:${userId}`;

  async function load() {
    const saved = (await storageArea.get(key))[key] || {};
    return {
      starts: { ...(saved.starts || {}) },
      completed: { ...(saved.completed || {}) },
      lastMonth: saved.lastMonth || null
    };
  }

  async function update(change) {
    const state = await load();
    change(state);
    await storageArea.set({ [key]: state });
  }

  return {
    load,
    async setStart(itemKey, day) {
      await update(state => {
        if (day == null) delete state.starts[itemKey];
        else state.starts[itemKey] = day;
      });
    },
    async setCompleted(itemKey, completed) {
      await update(state => {
        if (completed) state.completed[itemKey] = true;
        else delete state.completed[itemKey];
      });
    },
    async setLastMonth(month) {
      await update(state => { state.lastMonth = month; });
    }
  };
}
