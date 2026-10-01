// Canvas's FullCalendar entries carry their IDs in jQuery's DOM data rather
// than HTML attributes. Run this small adapter in MAIN; only a typed ID crosses
// into the isolated extension world. No local state or Canvas actions live here.
export function mountNativeCalendarBridge({document}) {
  const view = document.defaultView;
  let stopped = false;
  let queued = false;
  function sync() {
    queued = false;
    if (stopped) return;
    for (const element of document.querySelectorAll('.fc-event')) {
      let event;
      // Canvas bundles jQuery as a module, so a global $ is not guaranteed.
      for (const name of Object.keys(element)) {
        if (!name.startsWith('jQuery')) continue;
        const data = element[name];
        const segment = data?.fcSeg;
        event = segment?.footprint?.eventDef || segment?.event;
        if (event) break;
      }
      const id = String(event?.id ?? '');
      const match = id.match(/^(assignment|calendar_event)_(\d+)$/);
      const key = match ? `${match[1] === 'assignment' ? 'assignment' : 'event'}:${match[2]}` : null;
      if (key && element.dataset.canvasPlanningKey !== key) element.dataset.canvasPlanningKey = key;
      else if (!key && element.hasAttribute('data-canvas-planning-key')) element.removeAttribute('data-canvas-planning-key');
    }
  }
  const queue = () => {
    if (queued || stopped) return;
    queued = true;
    view.queueMicrotask(sync);
  };
  const observer = new view.MutationObserver(queue);
  observer.observe(document.body, {childList:true,subtree:true,characterData:true});
  sync();
  return () => { stopped = true; observer.disconnect(); };
}
