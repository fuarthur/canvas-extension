import {ui} from './ui.js';
import {getLanguage,setLanguage,setLabel,setText,translate,intlLocale,localizeTree} from './i18n.js';
import { dateKey, monthWeeks, validDay, weekSegments, addDays } from './dates.js';
import { normalizeItems } from './model.js';
import { styles } from './styles.js';
import {defaultSettings} from './planning-settings.js';
import {resolveEstimate} from './estimates.js';
import {workloadSummary,workloadSeries,pressureLevel} from './workload.js';
import {renderWorkloadView,renderDayList} from './workload-view.js';
import {renderPlanningSettings} from './settings-view.js';
import {createPlannerController} from './planner-view.js';

function monthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function nativeCalendarSelection(document) {
  const rows = [...document.querySelectorAll('.context_list_context[data-context]')];
  if (!rows.length) return undefined;
  return rows.filter(row => row.querySelector('[role="checkbox"][aria-checked="true"]'))
    .map(row => row.dataset.context).filter(code => /^(user|course|group|account)_\d+$/.test(code));
}

export function mountCalendarEntry({ document, onOpen }) {
  const button = ui(document).el('button','btn','Planning / 规划',true);
  button.dataset.planningEntry='';
  button.type = 'button';
  button.className = 'btn';
  setLabel(button,'Open planning calendar');
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', event => {
    // Canvas delegates its native view switching to this button group.
    event.stopPropagation();
    onOpen();
  });
  const restore = () => {
    const group = document.querySelector('.calendar_view_buttons[role="tablist"]');
    if (group && button.parentElement !== group) group.append(button);
  };
  const observer = new document.defaultView.MutationObserver(restore);
  observer.observe(document.body, { childList: true, subtree: true });
  restore();
  return () => { observer.disconnect(); button.remove(); };
}

export function monthFromCalendarHash(hash, now = new Date()) {
  const value = new URLSearchParams(String(hash).replace(/^#/, '')).get('view_start');
  return /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(value ?? '') ? value.slice(0, 7) : monthOf(now);
}

function shiftMonth(month, amount) {
  const [year, number] = month.split('-').map(Number);
  return monthOf(new Date(year, number - 1 + amount, 1));
}

function monthInRange(month, range) {
  return Boolean(range && `${month}-01` >= range.startDate && `${month}-01` <= range.endDate);
}

function safeCanvasLink(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://canvas.illinois.edu');
    return url.origin === 'https://canvas.illinois.edu' ? url.href : null;
  } catch {
    return null;
  }
}

function shortContext(name) {
  const courseCode = String(name || '').match(/\b[A-Z]{2,6}\s*\d{3}\b/);
  return courseCode ? courseCode[0] : String(name || 'Personal').slice(0, 18);
}

export function mountPlanner({ host, loadSnapshot, storeFactory, planClientFactory, schedulerClientFactory, subscribeStorage, planningStoreFactory, initialMonth, now = () => new Date() }) {
  const document = host.ownerDocument;
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  let open = false;
  let month = initialMonth;
  let snapshot = null;
  let store = null;
  let planningStore = null;
  let unsubscribeStorage = null;
  let localVersion = 0;
  let userState = { starts: {}, completed: {} };
  let planningState = {settings:defaultSettings(),estimates:{},singleSessions:{},plans:{},warnings:[]};
  let selectedDay = null;
  let planController = null;
  let controllerUserId = null;
  let loading = false;
  let error = null;
  let selectedKey = null;
  let notice = null;
  let requestId = 0;
  let activeTab = 'calendar';
  let draftSelection = new Set();
  let saving = false;
  const expandedWeeks = new Set();
  const todayDay = () => dateKey(typeof now === 'function' ? now() : now, snapshot?.profile?.time_zone);

  const {el}=ui(document);
  let settingsEditor=null,settingsEditorKey='';

  function action(label, text, handler, className = 'control') {
    const button = el('button', className, text);
    button.type = 'button';
    setLabel(button,label);
    button.dataset.controlId=label;
    button.addEventListener('click', event=>{try{Promise.resolve(handler(event)).catch(cause=>{notice=cause.message||'This change could not be saved.';render();});}catch(cause){notice=cause.message;render();}});
    return button;
  }

  async function close(force=false) {
    if(force!==true&&planController){
      // The retained draft may be suspended behind Settings. Its leave dialog
      // must be visible before waiting for a save/discard decision.
      if(planController.hasUnsavedChanges()&&activeTab!=='planner'){activeTab='planner';render();}
      if(!await planController.requestLeave())return;
    }
    planController?.destroy();planController=null;controllerUserId=null;
    unsubscribeStorage?.();unsubscribeStorage=null;localVersion++;
    open = false;
    requestId++;
    loading = false;
    error = null;
    host.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }

  async function installSnapshot(nextSnapshot,currentRequest){
    const nextStore=storeFactory(nextSnapshot.profile.id);const nextPlanningStore=planningStoreFactory?.(nextSnapshot.profile.id)||nextStore;
    const nextUserState=await nextStore.load();
    const nextPlanningState=nextPlanningStore.loadPlanningState?await nextPlanningStore.loadPlanningState():{settings:defaultSettings(),estimates:{},singleSessions:{},plans:{},warnings:[]};
    if(!open||currentRequest!==requestId)return false;
    if(planController&&String(controllerUserId)!==String(nextSnapshot.profile.id)){planController.destroy();planController=null;controllerUserId=null;selectedKey=null;selectedDay=null;}
    unsubscribeStorage?.();unsubscribeStorage=null;localVersion++;
    snapshot=nextSnapshot;store=nextStore;planningStore=nextPlanningStore;userState=nextUserState;planningState=nextPlanningState;
    draftSelection=new Set(snapshot.selectedCalendars||userState.selectedCalendars||snapshot.contexts.map(c=>c.code));
    if(subscribeStorage){const scope={hostname:document.location.hostname,userId:snapshot.profile.id};unsubscribeStorage=subscribeStorage(scope,changes=>{if(!open||String(snapshot?.profile.id)!==String(scope.userId))return;const calendarKey=`canvas-planner:${scope.hostname}:${scope.userId}:calendars`;if(changes?.[calendarKey])load(true);else refreshLocal().catch(cause=>{notice=cause.message;render();});});}
    return true;
  }
  async function load(force=false,options={}){
    if(!force&&snapshot&&monthInRange(month,snapshot.range)){render();return;}
    const currentRequest=++requestId;loading=true;error=null;render();let nextSnapshot=null;
    try{
      nextSnapshot=await loadSnapshot(month,options);
      if(!await installSnapshot(nextSnapshot,currentRequest))return;
      loading=false;render();
    }catch(cause){
      if(!open||currentRequest!==requestId)return;
      loading=false;error=cause instanceof Error?cause.message:'Could not load Canvas calendar.';
      const metadata=cause?.snapshot;
      if(metadata){try{if(!await installSnapshot(metadata,currentRequest))return;}catch(localCause){snapshot=null;error=`${error} Could not read local planning data: ${localCause.message}`;}}
      else if(cause?.code==='AUTH'||!snapshot){snapshot=null;unsubscribeStorage?.();unsubscribeStorage=null;planController?.destroy();planController=null;controllerUserId=null;}
      render();
    }
  }
  const combinedState=()=>({...planningState,completed:userState.completed});
  const monthRange=()=>({startDate:`${month}-01`,endDate:addDays(`${shiftMonth(month,1)}-01`,-1)});
  async function refreshLocal(){const token=++localVersion;const capturedStore=store;const capturedPlanning=planningStore;const nextUser=await capturedStore.load();const nextPlanning=capturedPlanning?.loadPlanningState?await capturedPlanning.loadPlanningState():planningState;if(!open||token!==localVersion||store!==capturedStore)return;userState=nextUser;planningState=nextPlanning;render();}
  async function mutateLocal(operation){try{await operation();await refreshLocal();return true;}catch(cause){notice=cause.message||'Could not save this change. Try again.';render();return false;}}
  async function completeItem(key,value){return mutateLocal(()=>store.setCompleted(key,value));}
  async function ensurePlanRange(range){
    const userId=snapshot?.profile.id;
    if(!snapshot?.range||snapshot.range.startDate>range.startDate||snapshot.range.endDate<range.endDate){const requestRange={startDate:snapshot?.range?.startDate<range.startDate?snapshot.range.startDate:range.startDate,endDate:snapshot?.range?.endDate>range.endDate?snapshot.range.endDate:range.endDate};await load(true,{range:requestRange});}
    if(!open||error||snapshot?.profile.id!==userId)throw new Error(error||'Canvas account changed. Open the planner again.');
    return {items:normalizeItems(snapshot,userState),state:planningState,completed:userState.completed,loadedRange:snapshot.range};
  }
  async function navigate(nextMonth) {
    month = nextMonth;
    selectedDay = null;
    selectedKey = null;
    expandedWeeks.clear();
    await load();
  }

  function detail(item) {
    const panel = el('aside', 'detail');
    setLabel(panel,'Item details');
    const head = el('div', 'detail-head');
    head.append(el('h2', '', item.title,true), action('Close details', '×', () => { selectedKey = null; render(); }, 'close'));
    panel.append(head);
    panel.append(el('p', '', item.contexts.join(' · ') || translate(document,'Personal'),true));
    const facts = el('dl');
    for (const [label, value] of [['Starts', item.startAt || item.startDay], ['Ends', item.endAt || item.endDay]]) {
      facts.append(el('dt', '', label), el('dd', '', value));
    }
    panel.append(facts);
    if (item.type === 'assignment') {
      const field = el('label', 'field', 'Plan start date');
      const input = el('input');
      input.type = 'date';
      input.value = userState.starts[item.key] || item.startDay;
      input.max = item.endDay;
      setLabel(input,'Plan start date');input.dataset.controlId='Plan start date';
      input.addEventListener('change', async () => {
        if (!validDay(input.value) || input.value > item.endDay) {
          notice = 'Choose a valid date no later than the due date.';
          render();
          return;
        }
        notice = null;
        await mutateLocal(()=>store.setStart(item.key,input.value));
      });
      field.append(input);
      panel.append(field);
      panel.append(action('Use Canvas start date', 'Use Canvas date', async () => {
        notice = null;
        await mutateLocal(()=>store.setStart(item.key,null));
      }, 'text-button'));
      if (item.needsStart) panel.append(el('p', 'hint', 'No Canvas open date; choose when you plan to start.'));
    }
    const estimate=resolveEstimate(item,planningState);
    const estimateField=el('label','field','Estimated effort (minutes)');
    const estimateInput=el('input');estimateInput.type='number';estimateInput.min='1';estimateInput.max='1440';estimateInput.value=String(estimate.minutes);setLabel(estimateInput,'Estimated effort minutes');estimateInput.dataset.controlId='Estimated effort minutes';
    estimateInput.addEventListener('change',async()=>{try{await planningStore.setEstimate(item.key,Number(estimateInput.value));await refreshLocal();}catch(cause){notice=cause.message;render();}});
    estimateField.append(estimateInput);panel.append(estimateField,el('p','hint',estimate.label),action('Use automatic estimate','Use rule / default',async()=>{await planningStore.setEstimate(item.key,null);await refreshLocal();},'text-button'));
    if(item.type==='assignment'){
      const once=el('label','check');const box=el('input');box.type='checkbox';box.checked=Boolean(planningState.singleSessions[item.key]);setLabel(box,'Must finish in one session');box.dataset.controlId='Must finish in one session';box.addEventListener('change',async()=>{await mutateLocal(()=>planningStore.setSingleSession(item.key,box.checked));});once.append(box,document.createTextNode(translate(document,'Must finish in one session')));panel.append(once);
    }
    const check = el('label', 'check');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.completed;
    checkbox.disabled = Boolean(item.canvasCompleted);
    setLabel(checkbox,'Mark complete');checkbox.dataset.controlId='Mark complete';
    checkbox.addEventListener('change', async () => {
      await completeItem(item.key, checkbox.checked);
    });
    check.append(checkbox, document.createTextNode(translate(document,item.canvasCompleted ? 'Completed in Canvas' : 'Complete in this extension')));
    panel.append(check);
    if (notice) panel.append(el('p', 'notice', notice));
    for (const warning of item.warnings) panel.append(el('p', 'notice', warning));
    const url = safeCanvasLink(item.url);
    if (url) {
      const link = el('a', 'canvas-link', 'Open in Canvas ↗');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      setLabel(link,'Open in Canvas');
      panel.append(link);
    }
    return panel;
  }

  async function changeTab(tab) {
    if(activeTab==='planner'&&tab!=='planner'&&tab!=='settings'&&planController&&!await planController.requestLeave())return;
    activeTab = tab;
    selectedKey = null;
    notice = null;
    if (tab === 'settings') draftSelection = new Set(snapshot.selectedCalendars || userState.selectedCalendars || snapshot.contexts.map(context => context.code));
    render();
  }

  function settings() {
    const panel = el('section', 'settings');
    panel.append(el('h2', '', 'Choose calendars'), el('p', 'hint', 'Only selected calendars will be loaded. Your selection is saved for this Canvas account.'));
    const tools = el('div', 'settings-actions');
    tools.append(action('Select all calendars', 'Select all', () => { draftSelection = new Set(snapshot.contexts.map(context => context.code)); render(); }),
      action('Deselect all calendars', 'Select none', () => { draftSelection.clear(); render(); }),
      action('Deselect unavailable calendars', 'Remove unavailable', () => { for (const code of snapshot.unavailableCalendars || []) draftSelection.delete(code); render(); }));
    panel.append(tools);
    for (const context of snapshot.contexts) {
      const row = el('label', 'calendar-choice');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = draftSelection.has(context.code);
      input.dataset.contextCode = context.code;
      setLabel(input,`Load ${context.name || context.code}`);
      input.addEventListener('change', () => {
        if (input.checked) draftSelection.add(context.code); else draftSelection.delete(context.code);
      });
      const label = el('div');
      label.append(el('span', '', context.name || context.code,true));
      const kind = context.code.split('_')[0];
      label.append(el('p', 'hint', `${{ user: 'Personal', course: 'Course', group: 'Group', account: 'Account' }[kind] || 'Calendar'}${snapshot.unavailableCalendars?.includes(context.code) ? ' · Canvas denied access' : ''}`));
      row.append(input, label);
      panel.append(row);
    }
    const save = action('Save calendar selection', saving ? 'Saving…' : 'Save and load', async () => {
      if (saving) return;
      saving = true;
      const userId = snapshot.profile.id;
      try {
        await store.setSelectedCalendars([...draftSelection]);
        if (!open || snapshot?.profile.id !== userId) return;
        activeTab = 'calendar';
        selectedKey = null;
        expandedWeeks.clear();
        await load(true);
      } catch {
        notice = 'Could not save your calendar selection. Please try again.';
      } finally { saving = false; render(); }
    });
    save.disabled = saving;
    panel.append(save, action('Retry unavailable calendars', 'Retry calendar access', () => load(true, { retryUnavailable: true })));
    const languageField=el('label','field','Language / 语言');const languageSelect=ui(document).select('Interface language',[['en','English',true],['zh-CN','简体中文',true]],planningState.settings.language||'en');
    const languageNotice=el('p','hint');
    languageSelect.addEventListener('change',async()=>{const value=languageSelect.value;languageSelect.disabled=true;try{await planningStore.setLanguage(value);await refreshLocal();}catch(cause){languageSelect.value=getLanguage(document);setText(languageNotice,cause.message||'Could not save language. Please try again.');}finally{languageSelect.disabled=false;}});
    languageField.append(languageSelect);panel.prepend(languageField,languageNotice);
    const signature=JSON.stringify([snapshot.profile.id,snapshot.contexts,{...planningState.settings,language:undefined}]);
    if(!settingsEditor||settingsEditorKey!==signature){settingsEditorKey=signature;settingsEditor=renderPlanningSettings({document,state:planningState,contexts:snapshot.contexts,onSave:async settings=>{await planningStore.setSettings(settings);await refreshLocal();}});}
    localizeTree(settingsEditor);panel.append(settingsEditor);
    if (notice) panel.append(el('p', 'notice', notice));
    return panel;
  }

  function calendar(items) {
    const container = el('div');
    const weekdayRow = el('div', 'weekday-row');
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) weekdayRow.append(el('span', '', day));
    container.append(weekdayRow);
    const monthGrid = el('div', 'month');
    const weeks = monthWeeks(month);
    const segments = weekSegments(items, weeks);
    const byKey = new Map(items.map(item => [item.key, item]));
    const today = todayDay();
    const pressure=new Map(workloadSeries(items,combinedState(),{startDate:weeks[0][0],endDate:weeks.at(-1)[6]}).map(p=>[p.day,p]));
    weeks.forEach((week, index) => {
      const row = el('div', 'week');
      const days = el('div', 'days');
      week.forEach(day => {
        const cell = el('div', `day${day.slice(0, 7) === month ? '' : ' outside'}${day === today ? ' today' : ''}`, String(Number(day.slice(-2))));
        setLabel(cell,day);
        const point=pressure.get(day);const badge=action(`View remaining tasks for ${day}`,String(point.tasks),()=>{selectedDay=day;selectedKey=null;render();},`pressure-badge ${pressureLevel(point.tasks,planningState.settings)}`);badge.dataset.pressureDay=day;badge.title=translate(document,`${point.tasks} remaining · ${point.minutes} min`);cell.append(badge);
        days.append(cell);
      });
      row.append(days);
      const bars = el('div', 'bars');
      const shown = expandedWeeks.has(index) ? segments[index] : segments[index].slice(0, 4);
      shown.forEach((segment, barIndex) => {
        const item = byKey.get(segment.itemKey);
        const bar = action(`Open ${item.title} in ${item.contexts.join(', ')}`, '', () => { selectedKey = item.key; notice = null; render(); }, `bar ${item.type}${item.completed ? ' completed' : ''}`);
        setLabel(bar,{key:'Open {title} in {contexts}',values:{title:item.title,contexts:item.contexts.join(', ')}});
        bar.append(el('span', 'context-tag', shortContext(item.contexts[0]),true), el('span', 'bar-title', `${item.completed ? '✓ ' : ''}${item.title}`,true));
        bar.dataset.itemKey = item.key;
        bar.style.gridColumn = `${segment.startColumn + 1} / ${segment.endColumn + 2}`;
        bar.style.gridRow = String(barIndex + 1);
        bar.title = `${item.title}: ${item.startDay} – ${item.endDay}`;
        bars.append(bar);
      });
      if (segments[index].length > 4) {
        const expanded = expandedWeeks.has(index);
        bars.append(action(expanded ? 'Show fewer items' : 'Show more items', expanded ? 'Show less' : `+${segments[index].length - 4} more`, () => {
          if (expanded) expandedWeeks.delete(index); else expandedWeeks.add(index);
          render();
        }, 'more'));
      }
      row.append(bars);
      monthGrid.append(row);
    });
    container.append(monthGrid);
    if(selectedDay){const point=pressure.get(selectedDay);container.append(renderDayList({document,day:selectedDay,items:items.filter(i=>point?.itemKeys.includes(i.key)),state:combinedState(),onOpenItem:key=>{selectedKey=key;render();},onComplete:completeItem}));}
    return container;
  }

  function render() {
    if (!open) return;
    setLanguage(document,planningState.settings.language);
    const entry=document.querySelector('[data-planning-entry]');if(entry){setText(entry,'Planning');localizeTree(entry);}
    const style = el('style', '', styles);
    const backdrop = el('div', 'backdrop');
    const shell = el('section', 'shell');
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.lang=getLanguage(document);
    setLabel(shell,'Planning calendar');
    const header = el('header', 'header');
    const identity = el('div', 'identity');
    identity.append(el('p', 'eyebrow', 'Illinois Canvas'), el('h1', '', 'Planning calendar'), el('p', 'subline', 'Canvas completion and your own planning marks'));
    header.append(identity);
    const controls = el('div', 'controls');
    controls.append(action('Previous month', '‹', () => navigate(shiftMonth(month, -1))), el('span', 'month-name', new Intl.DateTimeFormat(intlLocale(document), { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))), action('Next month', '›', () => navigate(shiftMonth(month, 1))), action('Today', 'Today', () => navigate(todayDay().slice(0, 7))), action('Refresh calendar', 'Refresh', () => load(true)), action('Close planning calendar', '×', close, 'close'));
    header.append(controls);
    shell.append(header);
    const tabs = el('nav', 'tabs');
    tabs.setAttribute('role', 'tablist');
    setLabel(tabs,'Planner views');
    for (const [tab, name, label] of [['calendar', 'Calendar', 'Planning calendar view'], ['workload','Workload','Workload view'], ['planner','Planner','Planner view'], ['settings', 'Settings', 'Calendar settings']]) {
      const button = action(label, name, () => changeTab(tab), 'tab');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(activeTab === tab));
      button.setAttribute('aria-controls', 'planner-panel');
      button.disabled = loading || saving || !snapshot;
      tabs.append(button);
    }
    shell.append(tabs);
    const body = el('div', 'content');
    body.id = 'planner-panel';
    body.setAttribute('role', 'tabpanel');
    if (loading) body.append(el('div', 'status', 'Loading Canvas calendar…'));
    else if (activeTab === 'settings' && snapshot) body.append(settings());
    else if (error && (activeTab!=='planner'||!snapshot)) {
      const status = el('div', 'status error');
      status.append(el('p', '', error), action('Retry loading', 'Retry', () => load(true, { retryUnavailable: true })));
      body.append(status);
    } else if (snapshot) {
      if(error){const status=el('div','status error');status.append(el('p','',`${error} Showing your last loaded data; refresh to verify current deadlines.`),action('Retry loading','Retry',()=>load(true,{retryUnavailable:true})));body.append(status);}
      const items = normalizeItems(snapshot, userState);
      for (const warning of snapshot.warnings || []) {
        const message = el('p', 'notice', warning);
        message.setAttribute('role', 'status');
        body.append(message);
      }
      for(const warning of planningState.warnings)body.append(el('p','notice',warning));
      const pressure=workloadSummary(items,combinedState(),{now:typeof now==='function'?now():now,timeZone:snapshot.profile.time_zone,range:monthRange()});
      const todaySummary=el('p','today-summary',`Today · ${pressure.today.tasks} remaining · ${pressure.overdue.length} overdue`);body.append(todaySummary);
      if(activeTab==='workload')body.append(renderWorkloadView({document,items,state:combinedState(),range:monthRange(),now:typeof now==='function'?now():now,timeZone:snapshot.profile.time_zone,onOpenItem:key=>{selectedKey=key;render();},onComplete:completeItem}));
      else if(activeTab==='planner'){
        const data={items,state:planningState,completed:userState.completed,loadedRange:snapshot.range};
        if(!planController){controllerUserId=snapshot.profile.id;planController=createPlannerController({document,...data,planClient:planClientFactory?.(snapshot.profile.id)||{save:async()=>({ok:false,message:'Plan storage is unavailable.'}),remove:async()=>({ok:false,message:'Plan storage is unavailable.'})},now,schedulerClient:schedulerClientFactory?.(snapshot.profile.id),timeZone:snapshot.profile.time_zone||Intl.DateTimeFormat().resolvedOptions().timeZone,onOpenItem:key=>{selectedKey=key;render();},onComplete:completeItem,onReloadPlans:()=>planningStore.loadPlanningState(),ensureRange:ensurePlanRange});}
        else planController.setData(data);
        body.append(planController.render());
      }else body.append(calendar(items));
      if (snapshot.selectedCalendars?.length === 0) body.append(el('p', 'hint', 'No calendars selected. Choose calendars in Settings.'));
      const selected = items.find(item => item.key === selectedKey);
      if (selected) shell.append(detail(selected));
    }
    if(notice&&activeTab!=='settings'&&!selectedKey)body.append(el('p','notice',notice));
    shell.append(body);
    backdrop.append(shell);
    const focused=root.activeElement;const focusId=focused?.dataset?.controlId||focused?.getAttribute('aria-label');const selection=focused?.selectionStart;
    root.replaceChildren(style, backdrop);
    if(focusId){const target=[...root.querySelectorAll('[data-control-id],[aria-label]')].find(n=>(n.dataset.controlId||n.getAttribute('aria-label'))===focusId);target?.focus();if(selection!=null&&target?.type==='text')target.setSelectionRange(selection,selection);}
  }

  async function show(nextMonth) {
    if (open) return;
    if (nextMonth) {
      month = nextMonth;
      activeTab = 'calendar';
      selectedKey = null;
      expandedWeeks.clear();
    }
    open = true;
    document.body.append(host);
    document.addEventListener('keydown', onKeyDown);
    await load(true);
  }

  async function toggle() {
    if (open) { await close(); return; }
    await show();
  }

  return { show, toggle, destroy: () => close(true) };
}
