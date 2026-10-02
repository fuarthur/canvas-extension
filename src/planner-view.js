import { setLanguage, getLanguage, setLabel, setText, translate, intlLocale } from "./i18n.js";
import { isHistoricalTask } from "./tasks.js";
import { ui, newId, formatMinutes } from "./ui.js";
import { dateKey, addDays, daysBetween } from "./dates.js";
import { createPlan, copyPlan, updatePlan, snapshotTask, planSeries, intervalDays, resolvePlanTasks, taskUrgency, planFingerprint } from "./plans.js";
import { resolveEstimate } from "./estimates.js";
import { nonSplitThreshold } from "./planning-settings.js";
import { validatePlan, suggestSegment, fixedFacts } from "./plan-validation.js";
import { renderPlannerWeek, weekStart, HOUR_HEIGHT } from "./planner-week-view.js";
import { renderLineChart } from "./chart-view.js";
import { renderScheduleEditor } from "./settings-view.js";
import { renderPlanEditor } from "./plan-editor-view.js";
import { renderPlanComparison } from "./plan-compare-view.js";
function createPlannerController(options) {
  const { document, planClient, onOpenItem, onComplete, onDirtyChange } = options;
  const { el, button, input, field, select } = ui(document);
  const root = el("section", "planner-workbench");
  let data = { items: options.items, state: options.state, loadedRange: options.loadedRange, completed: options.completed || {} };
  let archives = { ...data.state.plans };
  let draft = Object.values(archives).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  draft = draft ? structuredClone(draft) : null;
  let dirty = false, notice = "", conflict = false, editing = null, prompt = null, saving = false, destroyed = false;
  let filters = { query: "", course: "all", sort: "dueAsc", group: false, status: "all" };
  let taskPage=0,scheduledPage=0,visibleWeek=null,weekScroll=9*HOUR_HEIGHT,weekScrollLeft=0,poolScroll=0,dropNotice='';
  const showDay=day=>{visibleWeek=weekStart(day);};
  let generating = false, preview = null, previewFingerprint = null, generation = 0, progress = "";
  const compared = /* @__PURE__ */ new Set();
  const openedDays = /* @__PURE__ */ new Set();
  const completionStates = new Map();
  let chartMetric = "minutes", previewChartMode = "generated";
  let drawFacts, drawResolved, drawSeries, segmentsByDay, minutesByTask, lastEndByTask;
  const now = () => new Date(typeof options.now === "function" ? options.now() : options.now);
  const today = () => dateKey(now(), options.timeZone);
  const facts = () => ({ items: data.items, completed: data.completed, now: now().toISOString(), loadedRange: data.loadedRange, state: data.state });
  const mark = (value) => {
    dirty = value;
    onDirtyChange?.(value);
  };
  async function setCompletion(key, value) {
    const task = data.items.find(item => item.key === key) || draft?.tasks[key];
    if (!onComplete || task?.canvasCompleted || completionStates.get(key)?.saving) return;
    const initiatingFocus = document.activeElement?.shadowRoot?.activeElement || document.activeElement;
    const restoreEditorFocus = ['Complete task in editor', 'Reopen task in editor'].includes(initiatingFocus?.dataset?.controlId);
    completionStates.set(key, { saving: true });
    draw();
    try {
      const result = await onComplete(key, value);
      if (result === false) throw new Error('Could not save this change. Try again.');
      data.completed = { ...data.completed, [key]: value };
      data.items = data.items.map(item => item.key === key ? { ...item, completed: Boolean(value || item.canvasCompleted) } : item);
      completionStates.delete(key);
    } catch (error) {
      completionStates.set(key, { saving: false, error: error?.message || 'Could not save this change. Try again.' });
    }
    draw();
    const focused = document.activeElement?.shadowRoot?.activeElement || document.activeElement;
    if (restoreEditorFocus && editing?.itemKey === key && (!focused || focused === document.body || focused === root.getRootNode().host)) {
      root.querySelector('.plan-completion-button')?.focus({ preventScroll: true });
    }
  }
  const change = (operation) => {
    try {
      draft = updatePlan(draft, operation);
      if(operation.type==='addSegment')showDay(dateKey(operation.segment.startAt,draft.timeZone));
      if(operation.type==='updateSegment')showDay(dateKey(operation.patch.startAt||draft.segments.find(s=>s.id===operation.id).startAt,draft.timeZone));
      if (operation.type === "configure") includeCurrentTasks();
      mark(true);
      notice = "";
      draw();
    } catch (error) {
      notice = error.message;
      draw();
    }
  };
  const finishPrompt = (value) => {
    const resolve = prompt?.resolve;
    prompt = null;
    draw();
    resolve?.(value);
  };
  async function save() {
    if (!draft || saving) return false;
    const sent = structuredClone(draft);
    saving = true;
    draw();
    let result;
    try {
      result = await planClient.save(sent, sent.revision);
    } catch (error) {
      result = { ok: false, message: error.message };
    }
    if (destroyed) return false;
    saving = false;
    let clean = false;
    if (result?.ok) {
      archives[result.plan.id] = result.plan;
      data.state.plans[result.plan.id] = result.plan;
      if (draft?.id === sent.id) {
        clean = JSON.stringify(draft) === JSON.stringify(sent);
        draft = clean ? structuredClone(result.plan) : { ...draft, revision: result.plan.revision, updatedAt: result.plan.updatedAt };
        mark(!clean);
        conflict = false;
      }
      notice = clean ? "Plan saved." : "Earlier changes saved. Your newer edits still need saving.";
    } else {
      notice = result?.message || "Could not save your plan.";
      conflict = result?.code === "CONFLICT";
    }
    draw();
    return Boolean(result?.ok && clean);
  }
  function includeCurrentTasks() {
    if (!draft) return;
    for (const item of data.items) {
      const eligible = item.type === "assignment" ? item.endDay <= draft.range.endDate : item.startDay <= draft.range.endDate && item.endDay >= draft.range.startDate;
      if (eligible && !item.completed && !data.completed[item.key] && !isHistoricalTask(item, data.state, { now: now(), timeZone: options.timeZone }) && !draft.tasks[item.key]) {
        draft = updatePlan(draft, { type: "addTask", task: snapshotTask(item, { ...data.state, completed: data.completed }) });
        mark(true);
      }
    }
  }
  function discard() {
    draft = draft && archives[draft.id] ? structuredClone(archives[draft.id]) : null;
    mark(false);
    editing = null;
  }
  function requestLeave() {
    if (generating) cancelGeneration();
    if (!dirty) return Promise.resolve(true);
    if (prompt?.kind === "leave") return prompt.promise;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    prompt = { kind: "leave", resolve, promise };
    draw();
    return promise;
  }
  async function newPlan() {
    if (!await requestLeave()) return;
    const day = today();
    draft = createPlan({ id: newId("plan"), name: translate(document, "New plan"), items: data.items, state: { ...data.state, completed: data.completed }, startDate: day, endDate: addDays(day, data.state.settings.schedule.horizonDays - 1), timeZone: options.timeZone, now: now() });
    mark(true);
    notice = "";
    editing = null;
    visibleWeek=null;taskPage=0;scheduledPage=0;
    draw();
  }
  function arrange(itemKey, day = today(), segmentId, addImmediately = false, startTime) {
    const item = data.items.find((i) => i.key === itemKey);
    if (!draft || !item && !draft.tasks[itemKey]) return;
    if (!draft.tasks[itemKey] && item?.type !== 'event') {
      draft = updatePlan(draft, { type: "addTask", task: snapshotTask(item, { ...data.state, completed: data.completed }) });
      mark(true);
    }
    editing = { itemKey, day: day < draft.range.startDate ? draft.range.startDate : day > draft.range.endDate ? draft.range.endDate : day, segmentId, startTime };
    showDay(editing.day);dropNotice='';
    openedDays.add(editing.day);
    if (addImmediately) {
      const used = draft.segments.filter((s) => s.itemKey === itemKey).reduce((n, s) => n + (Date.parse(s.endAt) - Date.parse(s.startAt)) / 6e4, 0);
      const result = suggestSegment(draft, itemKey, { day: editing.day, startTime, minutes: Math.max(1, draft.tasks[itemKey].estimateMinutes - used) }, facts());
      if (result.segment) {
        draft = updatePlan(draft, { type: "addSegment", segment: result.segment });
        mark(true);
        editing.segmentId = result.segment.id;
        editing.addedOnDrop = true;
      } else editing.initialIssues = result.issues;
    }
    draw();
  }
  function dropOnWeek(event,day,startTime){
    const id=event.dataTransfer?.getData('application/x-canvas-planner-segment');
    if(id){
      const segment=draft.segments.find(s=>s.id===id);if(!segment)return;
      const task=drawResolved.tasks[segment.itemKey];
      if(segment.locked||task?.completed){dropNotice='Unlock the block before moving it. Completed blocks cannot move.';draw();return;}
      const base=updatePlan(draft,{type:'removeSegment',id});
      const result=suggestSegment(base,segment.itemKey,{day,startTime,minutes:(Date.parse(segment.endAt)-Date.parse(segment.startAt))/60000},facts());
      if(!result.segment){dropNotice=result.issues.map(i=>translate(document,i.message)).join(' ');draw();return;}
      editing=null;dropNotice='';change({type:'updateSegment',id,patch:{startAt:result.segment.startAt,endAt:result.segment.endAt}});return;
    }
    const key=event.dataTransfer?.getData('application/x-canvas-planner-task');
    if(data.items.some(i=>i.key===key&&i.type==='assignment'&&!i.completed&&!data.completed[key]))arrange(key,day,undefined,true,startTime);
  }
  const formatClock = (instant) => new Intl.DateTimeFormat(intlLocale(document, "en-GB"), { timeZone: options.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
  function urgencyTag(urgent){
    const tag=el("span",`urgency-tag ${urgent.level}`,urgent.reason==="tight"?`Tight deadline · ${formatMinutes(urgent.bufferMinutes)} buffer`:urgent.label);
    if(urgent.description){tag.title=translate(document,urgent.description);tag.tabIndex=0;setLabel(tag,urgent.description);}
    return tag;
  }
  function cancelGeneration() {
    generation++;
    options.schedulerClient?.cancel();
    generating = false;
    progress = "";
    draw();
  }
  async function generate() {
    if (!draft || generating) return;
    if (options.ensureRange) {
      try {
        const fresh = await options.ensureRange(draft.range);
        if (fresh) data = { ...data, ...fresh };
      } catch (error) {
        notice = error.message;
        draw();
        return;
      }
    }
    if (destroyed || !draft) return;
    includeCurrentTasks();
    const changes = resolvePlanTasks(draft, facts()).changes;
    if (changes.length) {
      notice = "Task data changed. Update plan task data before generating.";
      draw();
      return;
    }
    const version = ++generation;
    const fingerprint = planFingerprint(draft, facts());
    const input2 = { plan: structuredClone(draft), items: structuredClone(data.items), completed: { ...data.completed }, now: now().toISOString(), loadedRange: data.loadedRange, historyFilter: data.state.settings.historyFilter };
    generating = true;
    preview = null;
    progress = "Checking deadlines and working windows\u2026";
    draw();
    let result;
    try {
      result = await options.schedulerClient.run(input2, { onProgress: (p) => {
        if (generation === version) {
          progress = p.phase === "balancing" ? `Balancing \xB7 peak ${formatMinutes(p.peakMinutes)}` : `Arranging ${p.day || ""}`;
          const status = root.querySelector(".generation-progress");
          if (status) setText(status, progress);
        }
      } });
    } catch (error) {
      result = { status: "error", message: error.message };
    }
    if (destroyed || generation !== version) return;
    generating = false;
    progress = "";
    if (planFingerprint(draft, facts()) !== fingerprint) {
      notice = "Task estimates, completion or this plan changed during generation. Generate again.";
      preview = null;
      draw();
      return;
    }
    if (result.status === "error" || result.status === "cancelled") {
      notice = result.message || "Generation cancelled; your draft is unchanged.";
      draw();
      return;
    }
    preview = result;
    previewChartMode = "generated";
    previewFingerprint = fingerprint;
    draw();
  }
  function renderPreview() {
    const panel = el("section", "generated-preview");
    panel.append(el("h3", "", preview.validation?.complete ? "Generated plan preview" : "Partial plan preview"), el("p", "hint", `Peak ${formatMinutes(preview.metrics?.beforePeakMinutes || 0)} \u2192 ${formatMinutes(preview.metrics?.afterPeakMinutes || 0)}. Accepting changes the draft; Save keeps the archive.`));
    if (preview.status === "timeout") panel.append(el("p", preview.validation?.complete ? "hint" : "notice", preview.validation?.complete ? "Balancing reached its time limit. This schedule passed all checks; you can use it or retry to improve the balance." : "Calculation reached its time limit. You can retry; this is not a fully verified success."));
    for (const issue of preview.issues || []) {
      const line = el("p", "hint");
      line.append(el("span", "", `${draft.tasks[issue.itemKey]?.title || ""}: `, true), el("span", "", issue.message));
      if (issue.missingMinutes) line.append(el("span", "", ` (${issue.missingMinutes} min missing)`));
      panel.append(line);
    }
    const chartChoice = select("Preview chart", [["current", "Current plan"], ["generated", "Generated plan"]], previewChartMode, (value) => {
      previewChartMode = value;
      draw();
    });
    panel.append(field("Preview chart", chartChoice), renderLineChart({ document, series: [{ id: previewChartMode, name: previewChartMode === "current" ? "Current plan" : "Generated remaining work", localizeName: true, colorRole: 2, color: "#258c83", points: previewChartMode === "current" ? drawSeries : planSeries({ ...draft, segments: preview.segments }, { ...drawFacts, mode: "remaining" }) }], metric: "minutes" }));
    if (preview.validation?.issues.every((i) => i.code === "OVERDUE")) panel.append(button("Accept generated plan", () => {
      if (planFingerprint(draft, facts()) !== previewFingerprint) {
        preview = null;
        notice = "This plan changed. Generate again.";
        draw();
        return;
      }
      const checked = validatePlan({ ...draft, segments: preview.segments }, facts());
      if (checked.issues.some((i) => i.code !== "OVERDUE")) {
        notice = "The preview no longer fits current time or task data. Generate again.";
        preview = null;
        draw();
        return;
      }
      draft = { ...draft, segments: structuredClone(preview.segments) };
      mark(true);
      preview = null;
      notice = "Generated work accepted into the draft. Save to keep it.";
      draw();
    }));
    panel.append(button("Discard generated preview", () => {
      preview = null;
      draw();
    }, "text-button", "Discard preview"));
    return panel;
  }
  function draw() {
    const scroller = root.closest(".content");
    const scrollTop = scroller?.scrollTop;
    if (destroyed) return;
    const oldWeek=root.querySelector('.week-scroll');if(oldWeek){weekScroll=oldWeek.scrollTop;weekScrollLeft=oldWeek.scrollLeft;}
    const oldPool=root.querySelector('.task-pool');if(oldPool)poolScroll=oldPool.scrollTop;
    setLanguage(document, data.state.settings.language);
    root.lang = getLanguage(document);
    const disclosureKey = (n) => n.classList.contains('week-block-actions')?`block-${n.closest('[data-segment-id]').dataset.segmentId}-${n.closest('[data-plan-day]').dataset.planDay}`:n.dataset.planDay || n.className || "checks";
    const disclosures = new Map([...root.querySelectorAll("details")].map((n) => [disclosureKey(n), n.open]));
    const focused = document.activeElement?.shadowRoot?.activeElement || document.activeElement;
    const focusId = focused?.dataset?.controlId;
    const cursor = focused?.selectionStart;
    const editorKey = editing ? JSON.stringify([editing.itemKey, editing.day, editing.segmentId]) : null;
    const currentEditor = root.querySelector(".arrange-editor");
    const editorValues = currentEditor?.dataset.editorKey === editorKey ? Object.fromEntries([...currentEditor.querySelectorAll("input")].map((n) => [n.dataset.controlId, n.value])) : null;
    root.replaceChildren();
    const toolbar = el("div", "plan-toolbar");
    toolbar.append(button("New plan", newPlan));
    if (Object.keys(archives).length) {
      toolbar.append(select("Saved plans", [["", "Choose saved plan"], ...Object.values(archives).map((p) => [p.id, p.name, true])], draft?.id || "", async (id) => {
        if (!id) return;
        if (await requestLeave()) {
          draft = structuredClone(archives[id]);
          visibleWeek=null;taskPage=0;scheduledPage=0;
          editing = null;
          notice = "";
          draw();
        }
      }));
    }
    root.append(toolbar);
    if (draft) {
      const moreActions = el("details", "plan-more-actions");
      moreActions.append(el("summary", "", "More actions"));
      toolbar.append(button("Save plan", save, "control primary", saving ? "Saving\u2026" : "Save"), moreActions);
      moreActions.append(button("Copy plan", () => {
        draft = copyPlan(draft, { id: newId("plan"), name: `${draft.name.slice(0, 110)}${getLanguage(document) === "zh-CN" ? " \u526F\u672C" : " copy"}`, now: now() });
        mark(true);
        editing = null;
        draw();
      }), button("Delete plan", () => {
        prompt = { kind: "delete" };
        draw();
      }, "text-button", "Delete"));
      toolbar.querySelector('[data-control-id="Save plan"]').disabled = saving;
      if (options.schedulerClient) {
        toolbar.append(button("Generate balanced plan", generate, "control primary", generating ? "Generating\u2026" : "Generate balanced plan"));
        toolbar.querySelector('[data-control-id="Generate balanced plan"]').disabled = generating;
        if (generating) toolbar.append(button("Cancel generation", cancelGeneration, "text-button"));
      }
      const name = input("Plan name", draft.name, "text", (value) => change({ type: "rename", name: value }));
      name.maxLength = 120;
      const saveStatus = el("p", dirty ? "draft-notice" : "hint", dirty ? "Unsaved changes" : "Saved plan");
      name.addEventListener("input", () => {
        draft = updatePlan(draft, { type: "rename", name: name.value });
        mark(true);
        saveStatus.className = "draft-notice";
        setText(saveStatus, "Unsaved changes");
      });
      root.append(field("Plan name", name), el("p", "hint plan-range", `Loaded range \xB7 ${draft.range.startDate} \u2013 ${draft.range.endDate}`), saveStatus);
      const configuration = el("details", "plan-configuration");
      configuration.append(el("summary", "", "Plan dates, rest days & capacity"));
      const range = { ...draft.range };
      const schedule = structuredClone(draft.schedule);
      let thresholdMinutes=nonSplitThreshold(draft);
      const applyConfig = () => change({ type: "configure", range, schedule,nonSplitThresholdMinutes:thresholdMinutes });
      const threshold=input("Do not split tasks at or below (minutes)",thresholdMinutes,"number",v=>{thresholdMinutes=v;applyConfig();});
      threshold.min="1";threshold.max="1440";threshold.step="1";
      configuration.append(field("Start date", input("Plan start", range.startDate, "date", (v) => {
        range.startDate = v;
        applyConfig();
      })), field("End date", input("Plan end", range.endDate, "date", (v) => {
        range.endDate = v;
        applyConfig();
      })),field("Do not split tasks at or below (minutes)",threshold),el("p","hint","Splitting requires task permission and an estimate above this threshold. Balancing moves whole blocks without cutting them into smaller pieces."), renderScheduleEditor({ document, schedule, onChange: applyConfig }));
      root.append(configuration);
      drawFacts = facts();
      drawResolved = resolvePlanTasks(draft, drawFacts);
      drawSeries = planSeries(draft, { ...drawFacts, mode: "remaining" });
      segmentsByDay = /* @__PURE__ */ new Map();
      minutesByTask = /* @__PURE__ */ new Map();
      lastEndByTask = /* @__PURE__ */ new Map();
      for (const segment of draft.segments) {
        for(const {day} of intervalDays(segment.startAt,segment.endAt,draft.timeZone)){
          if (!segmentsByDay.has(day)) segmentsByDay.set(day, []);
          segmentsByDay.get(day).push(segment);
        }
        minutesByTask.set(segment.itemKey, (minutesByTask.get(segment.itemKey) || 0) + (Date.parse(segment.endAt) - Date.parse(segment.startAt)) / 6e4);
        if (!lastEndByTask.has(segment.itemKey) || segment.endAt > lastEndByTask.get(segment.itemKey)) lastEndByTask.set(segment.itemKey, segment.endAt);
      }
      const resolved = drawResolved;
      if (resolved.changes.length) root.append(el("p", "notice", `${resolved.changes.length} tasks changed since this plan was saved.`), button("Update plan task data", () => {
        const tasks = { ...draft.tasks };
        for (const item of data.items) if (tasks[item.key]) tasks[item.key] = snapshotTask(item, { ...data.state, completed: data.completed });
        change({ type: "updateTasks", tasks });
      }));
      const validation = validatePlan(draft, drawFacts);
      const status = el("div", "plan-status");
      status.append(el("strong", validation.complete ? "success" : "", validation.complete ? "All tasks arranged \xB7 deadline checks passed" : validation.valid ? "Draft \xB7 some work is not arranged" : "Draft \xB7 constraints need attention"));
      const remaining = Object.values(validation.unassigned).reduce((n, v) => n + v, 0);
      if (remaining) status.append(el("span", "hint", `${formatMinutes(remaining)} unassigned`));
      if (validation.issues.length) {
        const details = el("details");
        details.append(el("summary", "", `${validation.issues.length} checks to review`));
        for (const issue of validation.issues) {
          const line = el("p", "hint");
          line.append(el("span", "", `${draft.tasks[issue.itemKey]?.title || issue.day || ""} `, true), el("span", "", issue.message));
          details.append(line);
        }
        status.append(details);
      }
      root.append(status);
      const analytics = el("details", "plan-analytics");
      const totalMinutes = drawSeries.reduce((sum, point) => sum + point.minutes, 0), peakMinutes = Math.max(0, ...drawSeries.map((point) => point.minutes));
      const analyticsSummary = el("summary");
      analyticsSummary.append(el("span", "", "Workload overview"), el("span", "hint", `${formatMinutes(totalMinutes)} total \xB7 ${formatMinutes(peakMinutes)} peak`));
      analytics.append(analyticsSummary);
      const chartTools = el("div", "view-tools");
      chartTools.append(select("Plan chart metric", [["minutes", "Estimated hours"], ["tasks", "Tasks"]], chartMetric, (v) => {
        chartMetric = v;
        draw();
      }));
      analytics.append(chartTools, renderLineChart({ document, series: [{ id: draft.id, name: "Planned remaining work", localizeName: true, colorRole: 2, color: "#258c83", points: drawSeries }], metric: chartMetric, onSelectDay: (day) => {
        showDay(day);
        openedDays.add(day);
        const currentDay = root.querySelector(`[data-plan-day="${day}"]`);
        if (currentDay) currentDay.open = true;
        draw();
        root.querySelector(`[data-plan-day="${day}"]`)?.scrollIntoView?.({ block: "nearest" });
      } }));
      if (progress) root.append(el("p", "hint generation-progress", progress));
      if (preview) root.append(renderPreview());
      const renderEditor = () => renderPlanEditor({ document, plan: draft, ...editing, editorValues, facts: facts(), resolvedTask: drawResolved.tasks[editing.itemKey], completionStatus: completionStates.get(editing.itemKey), onComplete: onComplete ? setCompletion : undefined, onOpen: onOpenItem, onApply: change, onClose: () => {
        editing = null;
        draw();
      } });
      const columns = el("div", "plan-columns");
      columns.append(pool(), daily(renderEditor));
      root.append(columns, analytics);
    } else root.append(el("div", "empty-state", "Create a plan to organize your remaining tasks by day."));
    if (notice) root.append(el("p", conflict ? "notice" : "hint", notice));
    if (conflict) root.append(button("Reload saved plan", async () => {
      if (options.onReloadPlans) {
        const fresh = await options.onReloadPlans();
        archives = { ...fresh.plans };
        data.state = fresh;
      }
      discard();
      conflict = false;
      draw();
    }), button("Save plan as copy", async () => {
      draft = copyPlan(draft, { id: newId("plan"), name: `${draft.name.slice(0, 110)}${getLanguage(document) === "zh-CN" ? " \u526F\u672C" : " copy"}`, now: now() });
      mark(true);
      await save();
    }));
    if (Object.keys(archives).length >= 2) {
      const comparison = el("details", "comparison-picker");
      comparison.append(el("summary", "", "Compare saved plans (2\u20134)"));
      for (const saved of Object.values(archives)) {
        const box = input(`Compare ${saved.name}`, "", "checkbox");
        box.checked = compared.has(saved.id);
        box.addEventListener("change", () => {
          if (box.checked && compared.size < 4) compared.add(saved.id);
          else compared.delete(saved.id);
          draw();
        });
        comparison.append(field(saved.name, box, true));
      }
      if (compared.size >= 2) comparison.append(renderPlanComparison({ document, plans: [...compared].map((id) => archives[id]).filter(Boolean), facts: facts() }));
      root.append(comparison);
    }
    if (prompt) {
      const dialog = el("section", "draft-dialog");
      dialog.setAttribute("role", "alertdialog");
      setLabel(dialog, prompt.kind === "leave" ? "Unsaved plan" : "Delete plan");
      if (prompt.kind === "leave") {
        dialog.append(el("h3", "", "Save your plan before leaving?"), button("Save draft and continue", async () => {
          if (await save()) finishPrompt(true);
        }), button("Discard draft changes", () => {
          discard();
          finishPrompt(true);
        }, "text-button"), button("Return to editing", () => finishPrompt(false), "text-button"));
      } else {
        dialog.append(el("h3", "", `Delete \u201C${draft?.name}\u201D?`), el("p", "hint", "This removes only this saved plan."), button("Confirm delete plan", async () => {
          if (archives[draft.id]) {
            const result = await planClient.remove(draft.id, draft.revision);
            if (!result.ok) {
              notice = result.message;
              prompt = null;
              draw();
              return;
            }
            delete archives[draft.id];
            delete data.state.plans[draft.id];
            compared.delete(draft.id);
          }
          draft = Object.values(archives)[0] ? structuredClone(Object.values(archives)[0]) : null;
          editing = null;
          mark(false);
          prompt = null;
          draw();
        }), button("Cancel delete plan", () => {
          prompt = null;
          draw();
        }, "text-button"));
      }
      root.append(dialog);
    }
    for (const detail of root.querySelectorAll("details")) {
      const label = disclosureKey(detail);
      if (editing && detail.dataset.planDay === editing.day) detail.open = true;
      else if (disclosures.has(label)) detail.open = disclosures.get(label);
    }
    if (focusId) {
      const target = [...root.querySelectorAll("[data-control-id]")].find((n) => n.dataset.controlId === focusId);
      target?.focus({ preventScroll: true });
      if (cursor != null && target?.type === "text") target.setSelectionRange(cursor, cursor);
    }
    if (scroller) scroller.scrollTop = scrollTop;
    const timeline=root.querySelector('.week-scroll');if(timeline){timeline.scrollTop=weekScroll;timeline.scrollLeft=weekScrollLeft;}
    const taskList=root.querySelector('.task-pool');if(taskList)taskList.scrollTop=poolScroll;
    // Initial render may be returned before the host mounts this view.
    queueMicrotask(()=>{if(root.contains(timeline)){timeline.scrollTop=weekScroll;timeline.scrollLeft=weekScrollLeft;}if(root.contains(taskList))taskList.scrollTop=poolScroll;});
  }
  function pool() {
    const panel = el("aside", "task-pool");
    panel.append(el("h3", "", "Remaining tasks"));
    const search = input("Search tasks", filters.query);
    search.addEventListener("input", () => {
      filters.query = search.value;
      taskPage=0;scheduledPage=0;poolScroll=0;
      draw();
    });
    const contexts = /* @__PURE__ */ new Map();
    for (const item of data.items) (item.contextCodes || []).forEach((code, index) => contexts.set(code, item.contexts[index] || code));
    panel.append(search, select("Task course", [["all", "All courses / calendars"], ...[...contexts].map(([id, name]) => [id, name, true])], filters.course, (v) => {
      filters.course = v;
      taskPage=0;scheduledPage=0;
      draw();
    }), select("Task sort", [["dueAsc", "Deadline: nearest first"], ["dueDesc", "Deadline: latest first"], ["estimateAsc", "Estimate: shortest first"], ["estimateDesc", "Estimate: longest first"]], filters.sort, (v) => {
      filters.sort = v;
      taskPage=0;scheduledPage=0;
      draw();
    }), select("Task arrangement", [["all", "All remaining tasks"], ["none", "Unscheduled"], ["partial", "Partially scheduled"], ["full", "Scheduled"]], filters.status, (v) => {
      filters.status = v;
      taskPage=0;scheduledPage=0;
      draw();
    }));
    const group = input("Group tasks by course", "", "checkbox");
    group.checked = filters.group;
    group.addEventListener("change", () => {
      filters.group = group.checked;
      draw();
    });
    panel.append(field("Group by course", group));
    const amount = (key) => minutesByTask.get(key) || 0;
    const estimate = (item) => draft.tasks[item.key]?.estimateMinutes || resolveEstimate(item, data.state).minutes;
    const filtered = data.items.filter((i) => !i.completed && !data.completed[i.key] && (!isHistoricalTask(i, data.state, { now: now(), timeZone: options.timeZone }) || draft.tasks[i.key]) && i.title.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase()) && (filters.course === "all" || i.contextCodes?.includes(filters.course))).filter((i) => filters.status === "all" || (filters.status === "none" ? amount(i.key) === 0 : filters.status === "partial" ? amount(i.key) > 0 && amount(i.key) < estimate(i) : amount(i.key) >= estimate(i)));
    filtered.sort((a, b) => {
      const n = filters.sort.startsWith("due") ? Date.parse(a.dueAt || a.fixedStartAt) - Date.parse(b.dueAt || b.fixedStartAt) : estimate(a) - estimate(b);
      return n * (filters.sort.endsWith("Desc") ? -1 : 1) || a.title.localeCompare(b.title);
    });
    if (filters.group) filtered.sort((a, b) => (a.contexts[0] || "Personal").localeCompare(b.contexts[0] || "Personal"));
    const fullyAllocated=item=>item.type==='assignment'&&amount(item.key)>=estimate(item);
    const scheduled=filters.status==='all'?filtered.filter(fullyAllocated):[];
    const active=filters.status==='all'?filtered.filter(item=>!fullyAllocated(item)):filtered;
    const renderCards=(container,items)=>{
      let heading = null;
      for (const item of items) {
        if (filters.group && heading !== (item.contexts[0] || "Personal")) {
          heading = item.contexts[0] || "Personal";
          container.append(el("h4", "", item.contexts[0] ? heading : translate(document, heading), true));
        }
        const row = el("div", "pool-card");
        row.dataset.poolTask = item.key;
        const last = lastEndByTask.get(item.key);
        const urgent = taskUrgency(item, { now: now(), lastEndAt: last, completed: false });
        row.classList.add(`urgency-${urgent.level}`);
        row.append(button(`Open ${item.title}`, () => onOpenItem?.(item.key), "task-title", item.title), el("p", "hint", item.contexts.join(" \xB7 "), true), el("p", "hint", `${formatMinutes(estimate(item))} \xB7 ${item.type === "event" ? "Fixed activity" : `${amount(item.key)}/${estimate(item)} min arranged`}`));
        if (urgent.label) row.append(urgencyTag(urgent));
        if (isHistoricalTask(item, data.state, { now: now(), timeZone: options.timeZone })) row.append(el("span", "hint", "Historical task"));
        if (item.type === "assignment") {
          row.draggable = true;
          row.addEventListener("dragstart", (e) => e.dataTransfer?.setData("application/x-canvas-planner-task", item.key));
          row.append(button(`Arrange ${item.title}`, () => arrange(item.key), "text-button", "Arrange"));
        }
        if (!item.canvasCompleted && onComplete) {
          const complete = button(`Complete ${item.title}`, () => setCompletion(item.key, true), "text-button", completionStates.get(item.key)?.saving ? 'Saving…' : "\u2713 Complete");
          complete.disabled = Boolean(completionStates.get(item.key)?.saving);
          row.append(complete);
          if (completionStates.get(item.key)?.error) {const error = el('p', 'notice plan-completion-error', completionStates.get(item.key).error);error.setAttribute('role', 'alert');row.append(error);}
        }
        container.append(row);
      }
    };
    const pageCards=(container,items,scheduledList=false)=>{
      const pages=Math.max(1,Math.ceil(items.length/10));let page=Math.min(scheduledList?scheduledPage:taskPage,pages-1);
      if(scheduledList)scheduledPage=page;else taskPage=page;
      renderCards(container,items.slice(page*10,page*10+10));
      if(items.length>10){
        const nav=el('nav','task-pagination');setLabel(nav,scheduledList?'Scheduled tasks pages':'Tasks pages');
        const turn=offset=>{if(scheduledList)scheduledPage=page+offset;else taskPage=page+offset;draw();root.querySelector('.task-pool').scrollTop=0;poolScroll=0;};
        const previous=button(scheduledList?'Previous scheduled tasks page':'Previous tasks page',()=>turn(-1),'control','‹');previous.disabled=page===0;
        const next=button(scheduledList?'Next scheduled tasks page':'Next tasks page',()=>turn(1),'control','›');next.disabled=page===pages-1;
        nav.append(previous,el('span','hint',{key:'Page {page} / {pages} · {count} tasks',values:{page:page+1,pages,count:items.length}}),next);container.insertBefore(nav,container.querySelector('.pool-card'));
      }
    };
    pageCards(panel,active);
    if (!filtered.length) panel.append(el("p", "hint", "No remaining tasks match your filters."));
    else if(!active.length)panel.append(el("p","hint","All matching tasks are fully scheduled. Expand Scheduled tasks to view them."));
    const future = data.items.filter((i) => i.type === "assignment" && !i.completed && i.endDay > draft.range.endDate).length;
    if (future) panel.append(el("p", "hint", `${future} future tasks fall after this plan range; use Arrange to include one.`));
    if(scheduled.length){
      const section=el("details","scheduled-task-pool");
      section.append(el("summary","",`Scheduled tasks (${scheduled.length})`));
      pageCards(section,scheduled,true);
      panel.append(section);
    }
    return panel;
  }
  function daily(renderEditor) {
    const clamped=today()<draft.range.startDate?draft.range.startDate:today()>draft.range.endDate?draft.range.endDate:today();
    if(!visibleWeek||addDays(visibleWeek,6)<draft.range.startDate||visibleWeek>draft.range.endDate)showDay(clamped);
    const panel=renderPlannerWeek({document,plan:draft,startDay:visibleWeek,today:today(),points:new Map(drawSeries.map(p=>[p.day,p])),segmentsByDay,tasks:drawResolved.tasks,events:fixedFacts(draft,data.items).map(event=>({...event,completed:Boolean(event.completed||data.completed[event.key])})),formatClock,dropNotice,completionStates,
      onNavigate:(day,current)=>{showDay(current?clamped:day);dropNotice='';draw();if(current){weekScroll=9*HOUR_HEIGHT;root.querySelector('.week-scroll').scrollTop=weekScroll;}},
      onDrop:dropOnWeek,onEdit:arrange,onRemove:id=>{if(editing?.segmentId===id)editing=null;change({type:'removeSegment',id});},onLock:(id,locked)=>change({type:'lock',id,locked}),onOpen:key=>onOpenItem?.(key),onComplete:onComplete?setCompletion:undefined,
      urgency:task=>{const urgent=taskUrgency(data.items.find(i=>i.key===task.key)||task,{now:now(),lastEndAt:lastEndByTask.get(task.key),completed:task.completed});return {level:urgent.level,tag:urgent.label?urgencyTag(urgent):null};}
    });
    if(editing){const editor=renderEditor();editor.classList.add('week-selected-editor');panel.insertBefore(editor,panel.querySelector('.week-scroll'));}
    return panel;
  }
  const api = { hasPendingLeaveDecision() {
    return prompt?.kind === "leave";
  }, render() {
    draw();
    return root;
  }, setData(next, { render = true } = {}) {
    data = { ...data, ...next };
    const incoming = { ...data.state.plans };
    if (draft && draft.revision > 0 && (!incoming[draft.id] || incoming[draft.id].revision > draft.revision)) {
      if (dirty) {
        conflict = true;
        notice = "This saved plan changed in another page. Reload it or save a copy.";
      } else draft = incoming[draft.id] ? structuredClone(incoming[draft.id]) : null;
    }
    archives = incoming;
    if (render) draw();
  }, requestLeave, destroy() {
    generation++;
    options.schedulerClient?.destroy();
    destroyed = true;
    prompt?.resolve?.(false);
    prompt = null;
    root.remove();
  } };
  return api;
}
export {
  createPlannerController
};
