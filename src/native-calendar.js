const marked = '[data-canvas-planning-completed]';
const badgeSelector = '[data-canvas-planning-badge]';
const titles = '.fc-title, .agenda-event__title';
const entries = '.fc-event, .agenda-event__item[data-event-id]';
const css = `
${marked} {
  text-decoration-line: line-through !important;
  text-decoration-style: dashed !important;
  text-decoration-color: var(--cp-native-completed-border,#7252a3) !important;
  text-decoration-thickness: 1.5px !important;
}
${badgeSelector} {
  display: inline-block; margin-inline-end: 4px; padding: 0 3px;
  border: 1px solid var(--cp-native-completed-border,#7252a3); border-radius: 3px;
  color: var(--cp-native-completed-text,#563482); background: var(--cp-native-completed-bg,#f1eafa);
  font: 700 10px/1.3 system-ui, sans-serif; vertical-align: middle;
  text-decoration: none; white-space: nowrap;
}
`;

function entryKey(element) {
  if (element.matches('.agenda-event__item')) {
    const match = element.dataset.eventId?.match(/^(assignment|calendar_event)_(\d+)$/);
    return match ? `${match[1] === 'assignment' ? 'assignment' : 'event'}:${match[2]}` : null;
  }
  const key = element.dataset.canvasPlanningKey;
  return /^(assignment|event):\d+$/.test(key ?? '') ? key : null;
}

// This lifetime is the calendar page's lifetime, independent of mountPlanner.
export function mountNativeCalendarCompletion({document,storeFactory,loadProfile,subscribeStorage}) {
  const view = document.defaultView;
  const style = document.createElement('style');
  style.dataset.canvasPlanningNativeStyle = '';
  style.textContent = css;
  document.head.append(style);
  let state = null, store = null, unsubscribe = null;
  let stopped = false, queued = false, identityVersion = 0, localVersion = 0;

  function render() {
    queued = false;
    if (stopped) return;
    const keep = new Set();
    const label = state?.language === 'zh-CN' ? '在插件中完成' : 'Completed in this extension';
    if (state?.enabled) for (const element of document.querySelectorAll(entries)) {
      const key = entryKey(element);
      const title = element.querySelector(titles);
      if (!key || !state.completed[key] || !title || title.classList.contains('calendar__event--completed')) continue;
      keep.add(title);
      if (!title.hasAttribute('data-canvas-planning-completed')) title.setAttribute('data-canvas-planning-completed','');
      let badge = title.previousElementSibling;
      if (!badge?.matches(badgeSelector)) {
        badge = document.createElement('span');
        badge.dataset.canvasPlanningBadge = '';
        badge.textContent = '✓ P';
        badge.setAttribute('role','img');
        title.before(badge);
      }
      if (badge.title !== label) {badge.title = label;badge.setAttribute('aria-label',label);}
    }
    for (const title of document.querySelectorAll(marked)) if (!keep.has(title)) title.removeAttribute('data-canvas-planning-completed');
    for (const badge of document.querySelectorAll(badgeSelector)) if (!keep.has(badge.nextElementSibling)) badge.remove();
  }
  const queueRender = () => {
    if (queued || stopped) return;
    queued = true;
    view.queueMicrotask(render);
  };
  async function readLocal() {
    const currentStore = store, identity = identityVersion, version = ++localVersion;
    if (!currentStore) return;
    try {
      const [local,planning] = await Promise.all([currentStore.load(),currentStore.loadPlanningState()]);
      if (stopped || identity !== identityVersion || version !== localVersion) return;
      state = {enabled:planning.settings.nativeCalendarCompletion === true,language:planning.settings.language,completed:local.completed};
    } catch {
      if (stopped || identity !== identityVersion || version !== localVersion) return;
      state = null;
    }
    render();
  }
  async function verifyIdentity() {
    const version = ++identityVersion;
    localVersion++;
    unsubscribe?.();unsubscribe = null;store = null;state = null;
    render();
    try {
      const profile = await loadProfile();
      if (stopped || version !== identityVersion || !/^\d+$/.test(String(profile?.id ?? ''))) return;
      store = storeFactory(profile.id);
      unsubscribe = subscribeStorage?.({hostname:document.location.hostname,userId:profile.id},readLocal);
      await readLocal();
    } catch { /* Failed authentication leaves Canvas usable without local marks. */ }
  }
  const onVisible = () => {if(document.visibilityState !== 'hidden')verifyIdentity();};
  const observer = new view.MutationObserver(queueRender);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-canvas-planning-key','data-event-id','class']});
  view.addEventListener('focus',onVisible);
  view.addEventListener('pageshow',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  verifyIdentity();
  return () => {
    if (stopped) return;
    identityVersion++;localVersion++;
    unsubscribe?.();observer.disconnect();
    view.removeEventListener('focus',onVisible);view.removeEventListener('pageshow',onVisible);
    document.removeEventListener('visibilitychange',onVisible);
    state = null;render();stopped = true;style.remove();
  };
}
