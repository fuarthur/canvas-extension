import { createTaskDetailView } from "./task-detail-view.js";
import { ui } from "./ui.js";
import { getLanguage, setLanguage, setLabel, setText, translate, intlLocale, localizeTree } from "./i18n.js";
import { dateKey, monthWeeks, validDay, weekSegments, addDays } from "./dates.js";
import { normalizeItems } from "./model.js";
import { styles } from "./styles.js";
import { applyTheme, defaultTheme } from "./themes.js";
import { createThemeSettings } from "./theme-settings-view.js";
import { defaultSettings } from "./planning-settings.js";
import { resolveEstimate } from "./estimates.js";
import { workloadSummary, workloadSeries, pressureLevel } from "./workload.js";
import { renderWorkloadView, renderDayList } from "./workload-view.js";
import { renderPlanningSettings } from "./settings-view.js";
import { createPlannerController } from "./planner-view.js";
import { createTasksController } from "./tasks-view.js";
import { isHistoricalTask, targetInstant } from "./tasks.js";
import {calendarLoadingRange,normalizeCalendarLoading} from './calendar-loading.js';
function monthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function nativeCalendarSelection(document) {
  const rows = [...document.querySelectorAll(".context_list_context[data-context]")];
  if (!rows.length) return void 0;
  return rows.filter((row) => row.querySelector('[role="checkbox"][aria-checked="true"]')).map((row) => row.dataset.context).filter((code) => /^(user|course|group|account)_\d+$/.test(code));
}
function mountCalendarEntry({ document, onOpen }) {
  const button = ui(document).el("button", "btn", "Planning / \u89C4\u5212", true);
  button.dataset.planningEntry = "";
  button.type = "button";
  button.className = "btn";
  setLabel(button, "Open planning calendar");
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", (event) => {
    /* Canvas delegates its native view switching to this button group. */
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
  return () => {
    observer.disconnect();
    button.remove();
  };
}
function monthFromCalendarHash(hash, now = /* @__PURE__ */ new Date()) {
  const value = new URLSearchParams(String(hash).replace(/^#/, "")).get("view_start");
  return /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(value ?? "") ? value.slice(0, 7) : monthOf(now);
}
function shiftMonth(month, amount) {
  const [year, number] = month.split("-").map(Number);
  return monthOf(new Date(year, number - 1 + amount, 1));
}
function monthInRange(month, range) {
  const required=calendarLoadingRange(month,{mode:'months',pastMonths:0,futureMonths:0});
  return Boolean(range && required.startDate >= range.startDate && required.endDate <= range.endDate);
}
function shortContext(name) {
  const courseCode = String(name || "").match(/\b[A-Z]{2,6}\s*\d{3}\b/);
  return courseCode ? courseCode[0] : String(name || "Personal").slice(0, 18);
}
function mountPlanner({ host, loadSnapshot, loadInitialTheme, storeFactory, planClientFactory, schedulerClientFactory, subscribeStorage, planningStoreFactory, initialMonth, now = () => /* @__PURE__ */ new Date() }) {
  const document = host.ownerDocument;
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  let open = false;
  let month = initialMonth;
  let snapshot = null;
  let store = null;
  let planningStore = null;
  let unsubscribeStorage = null;
  let localVersion = 0;
  let userState = { starts: {}, completed: {} };
  let planningState = { settings: defaultSettings(), estimates: {}, singleSessions: {}, plans: {}, warnings: [] };
  let selectedDay = null;
  let planController = null;
  let tasksController = null;
  let tasksUserId = null;
  let controllerUserId = null;
  let loading = false;
  let refreshing = false;
  let loadingMore = false;
  let error = null;
  let selectedKey = null;
  let notice = null;
  let requestId = 0;
  let activeTab = "calendar";
  let draftSelection = /* @__PURE__ */ new Set();
  let saving = false;
  const expandedWeeks = /* @__PURE__ */ new Set();
  const todayDay = () => dateKey(typeof now === "function" ? now() : now, snapshot?.profile?.time_zone);
  const { el } = ui(document);
  let settingsEditor = null, settingsEditorKey = "";
  let themeEditor = null, themeEditorUserId = null;
  const systemTheme = document.defaultView.matchMedia?.("(prefers-color-scheme: dark)");
  const applyAppearance = () => applyTheme(host, planningState.theme, systemTheme?.matches);
  const onSystemThemeChange = () => {
    if (open && planningState.theme?.preset === "system") applyAppearance();
  };
  function action(label, text, handler, className = "control") {
    const button = el("button", className, text);
    button.type = "button";
    setLabel(button, label);
    button.dataset.controlId = label;
    button.addEventListener("click", (event) => {
      try {
        Promise.resolve(handler(event)).catch((cause) => {
          notice = cause.message || "This change could not be saved.";
          render();
        });
      } catch (cause) {
        notice = cause.message;
        render();
      }
    });
    return button;
  }
  async function close(force = false) {
    if (force !== true && planController) {
      /* The retained draft may be suspended behind Settings. Its leave dialog */
      /* must be visible before waiting for a save/discard decision. */
      const decision = planController.requestLeave();
      if (planController.hasPendingLeaveDecision()) {
        activeTab = "planner";
        render();
      }
      if (!await decision) {
        render();
        return;
      }
    }
    planController?.destroy();
    planController = null;
    controllerUserId = null;
    tasksController?.destroy();
    tasksController = null;
    tasksUserId = null;
    unsubscribeStorage?.();
    unsubscribeStorage = null;
    localVersion++;
    detailView.reset();
    open = false;
    systemTheme?.removeEventListener("change", onSystemThemeChange);
    requestId++;
    loading = false;
    refreshing = false;
    loadingMore = false;
    error = null;
    host.remove();
    document.removeEventListener("keydown", onKeyDown);
  }
  function onKeyDown(event) {
    if (event.key === "Escape") close();
  }
  function discardIdentity() {
    detailView.reset();
    snapshot = store = planningStore = null;
    userState = { starts: {}, completed: {} };
    planningState = { settings: defaultSettings(), theme: planningState.theme, estimates: {}, singleSessions: {}, plans: {}, warnings: [] };
    themeEditor = null;
    themeEditorUserId = null;
    unsubscribeStorage?.();
    unsubscribeStorage = null;
    localVersion++;
    planController?.destroy();
    planController = null;
    controllerUserId = null;
    tasksController?.destroy();
    tasksController = null;
    tasksUserId = null;
    selectedKey = selectedDay = null;
    notice = null;
    renderedTab = renderedDetailKey = null;
    savedContentScroll = savedDetailScroll = 0;
  }
  async function installSnapshot(nextSnapshot, currentRequest) {
    if (!open || currentRequest !== requestId) return false;
    /* Discard the previous identity before asynchronous local storage reads, */
    /* which may fail even after Canvas has verified a different account. */
    if (snapshot && String(snapshot.profile.id) !== String(nextSnapshot.profile.id)) discardIdentity();
    const nextStore = storeFactory(nextSnapshot.profile.id);
    const nextPlanningStore = planningStoreFactory?.(nextSnapshot.profile.id) || nextStore;
    const nextUserState = await nextStore.load();
    const nextPlanningState = nextPlanningStore.loadPlanningState ? await nextPlanningStore.loadPlanningState() : { settings: defaultSettings(), estimates: {}, singleSessions: {}, plans: {}, warnings: [] };
    if (!open || currentRequest !== requestId) return false;
    if (planController && String(controllerUserId) !== String(nextSnapshot.profile.id)) {
      planController.destroy();
      planController = null;
      controllerUserId = null;
      selectedKey = null;
      selectedDay = null;
    }
    if (tasksController && String(tasksUserId) !== String(nextSnapshot.profile.id)) {
      tasksController.destroy();
      tasksController = null;
      tasksUserId = null;
      selectedKey = null;
      selectedDay = null;
    }
    unsubscribeStorage?.();
    unsubscribeStorage = null;
    localVersion++;
    snapshot = nextSnapshot;
    store = nextStore;
    planningStore = nextPlanningStore;
    userState = nextUserState;
    planningState = nextPlanningState;
    // Best-effort loading appearance for the next page; failure cannot block calendar access.
    planningStore.rememberAppearance?.().catch(() => {});
    draftSelection = new Set(snapshot.selectedCalendars || userState.selectedCalendars || snapshot.contexts.map((c) => c.code));
    if (subscribeStorage) {
      const scope = { hostname: document.location.hostname, userId: snapshot.profile.id };
      unsubscribeStorage = subscribeStorage(scope, (changes) => {
        if (!open || String(snapshot?.profile.id) !== String(scope.userId)) return;
        const calendarKey = `canvas-planner:${scope.hostname}:${scope.userId}:calendars`;
        if (changes?.[calendarKey]) load(true);
        else refreshLocal().catch((cause) => {
          notice = cause.message;
          render();
        });
      });
    }
    return true;
  }
  async function load(force = false, options = {}) {
    const loadingConfig=normalizeCalendarLoading(planningState.settings.calendarLoading);
    const required=calendarLoadingRange(month,loadingConfig);
    const coversSemester=loadingConfig.mode!=='semester'||(snapshot?.range?.startDate<=required.startDate&&snapshot?.range?.endDate>=required.endDate);
    if (!force && snapshot && monthInRange(month, snapshot.range) && coversSemester) {
      render();
      return;
    }
    const currentRequest = ++requestId;
    loading = !snapshot?.range;
    refreshing = Boolean(snapshot?.range);
    loadingMore = false;
    error = null;
    render();
    let nextSnapshot = null;
    try {
      nextSnapshot = await loadSnapshot(month, { ...options, force: options.force ?? force, onCached: async (cached) => {
        if (!await installSnapshot(cached, currentRequest)) return;
        loading = false;
        refreshing = true;
        loadingMore = false;
        render();
      }, onPartial:async(partial)=>{
        if(!await installSnapshot(partial,currentRequest))return;
        loading=false;refreshing=true;loadingMore=true;render();
      } });
      if (!await installSnapshot(nextSnapshot, currentRequest)) return;
      loading = false;
      refreshing = false;
      loadingMore = false;
      render();
    } catch (cause) {
      if (!open || currentRequest !== requestId) return;
      loading = false;
      refreshing = false;
      loadingMore = false;
      error = cause instanceof Error ? cause.message : "Could not load Canvas calendar.";
      const metadata = cause?.snapshot;
      if (metadata && (!snapshot?.range || String(snapshot.profile.id) !== String(metadata.profile.id))) {
        try {
          if (!await installSnapshot(metadata, currentRequest)) return;
        } catch (localCause) {
          discardIdentity();
          error = `${error} Could not read local planning data: ${localCause.message}`;
        }
      } else if (cause?.code === "AUTH" || !snapshot) {
        discardIdentity();
      }
      render();
    }
  }
  const combinedState = () => ({ ...planningState, completed: userState.completed });
  const historyFacts = () => ({ now: typeof now === "function" ? now() : now, timeZone: snapshot?.profile.time_zone });
  const activeItems = (items) => items.filter((item) => !isHistoricalTask(item, combinedState(), historyFacts()));
  function taskListController(items) {
    const data = { items: items || normalizeItems(snapshot, userState), state: combinedState(), contexts: snapshot.contexts.filter((context) => (snapshot.selectedCalendars || snapshot.contexts.map((c) => c.code)).includes(context.code)), loadedRange: snapshot.range };
    if (!tasksController) {
      tasksUserId = snapshot.profile.id;
      const capturedStore = planningStore;
      const capturedUser = tasksUserId;
      let controller;
      const verifyAccount = () => {
        if (!open || String(snapshot?.profile.id) !== String(capturedUser) || tasksController !== controller) throw new Error("Canvas account changed. Open the planner again.");
      };
      controller = createTasksController({
        document,
        ...data,
        now,
        timeZone: snapshot.profile.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        onOpenItem: (key) => {
          selectedKey = key;
          render();
        },
        onPreferences: async (value) => {
          verifyAccount();
          await capturedStore.setTaskPreferences?.(value);
        },
        onApply: async (keys, patch) => {
          verifyAccount();
          const token = await capturedStore.applyTaskBatch(keys, patch);
          verifyAccount();
          await refreshLocal();
          return token;
        },
        onUndo: async (token) => {
          verifyAccount();
          const result = await capturedStore.undoTaskBatch(token);
          verifyAccount();
          await refreshLocal();
          return result;
        },
        onLoadRange: async (range) => {
          verifyAccount();
          await ensurePlanRange(range);
          verifyAccount();
        }
      });
      tasksController = controller;
    } else tasksController.setData(data, { render: false });
    return tasksController;
  }
  async function showOverdue() {
    await changeTab("tasks");
    if (activeTab === "tasks" && snapshot) {
      taskListController().showPreset("overdue");
    }
  }
  const monthRange = () => ({ startDate: `${month}-01`, endDate: addDays(`${shiftMonth(month, 1)}-01`, -1) });
  async function refreshLocal() {
    const token = ++localVersion;
    const capturedStore = store;
    const capturedPlanning = planningStore;
    const previousLoading=JSON.stringify(planningState.settings.calendarLoading);
    const nextUser = await capturedStore.load();
    const nextPlanning = capturedPlanning?.loadPlanningState ? await capturedPlanning.loadPlanningState() : planningState;
    if (!open || token !== localVersion || store !== capturedStore) return;
    userState = nextUser;
    planningState = nextPlanning;
    render();
    if(previousLoading!==JSON.stringify(planningState.settings.calendarLoading))await load(true);
  }
  async function mutateLocal(operation) {
    notice = null;
    try {
      await operation();
      await refreshLocal();
      return true;
    } catch (cause) {
      notice = cause.message || "Could not save this change. Try again.";
      render();
      return false;
    }
  }
  async function completeItem(key, value) {
    return mutateLocal(() => store.setCompleted(key, value));
  }
  async function ensurePlanRange(range) {
    const userId = snapshot?.profile.id;
    if (!snapshot?.range || snapshot.range.startDate > range.startDate || snapshot.range.endDate < range.endDate) {
      const requestRange = { startDate: snapshot?.range?.startDate < range.startDate ? snapshot.range.startDate : range.startDate, endDate: snapshot?.range?.endDate > range.endDate ? snapshot.range.endDate : range.endDate };
      await load(true, { range: requestRange });
    }
    if (!open || error || snapshot?.profile.id !== userId) throw new Error(error || "Canvas account changed. Open the planner again.");
    return { items: normalizeItems(snapshot, userState), state: planningState, completed: userState.completed, loadedRange: snapshot.range };
  }
  async function navigate(nextMonth) {
    detailView.reset();
    month = nextMonth;
    selectedDay = null;
    selectedKey = null;
    expandedWeeks.clear();
    await load();
  }
  const detailView = createTaskDetailView({
    document,
    getData: () => ({ userState, planningState, notice, timeZone: snapshot?.profile.time_zone }),
    onStart: (key, day) => mutateLocal(() => store.setStart(key, day)),
    onEstimate: (key, minutes) => mutateLocal(() => planningStore.setEstimate(key, minutes)),
    onTarget: (key, target) => mutateLocal(() => planningStore.applyTaskBatch([key], { target })),
    onAllowSplitting: (key, value) => mutateLocal(() => planningStore.setAllowSplitting(key, value)),
    onComplete: completeItem,
    onClose: () => {
      selectedKey = null;
      notice = null;
      render();
    }
  });
  let renderedTab = null, renderedMonth = null, renderedDetailKey = null;
  let savedContentScroll = 0, savedDetailScroll = 0, renderedLoading = false;
  async function changeTab(tab) {
    if (activeTab === "planner" && tab !== "planner" && tab !== "settings" && planController && !await planController.requestLeave()) return;
    if (activeTab !== tab) detailView.reset();
    activeTab = tab;
    selectedKey = null;
    notice = null;
    if (tab === "settings") draftSelection = new Set(snapshot.selectedCalendars || userState.selectedCalendars || snapshot.contexts.map((context) => context.code));
    render();
  }
  function settings() {
    const panel = el("section", "settings");
    panel.append(el("h2", "", "Choose calendars"), el("p", "hint", "Only selected calendars will be loaded. Your selection is saved for this Canvas account."));
    const tools = el("div", "settings-actions");
    tools.append(
      action("Select all calendars", "Select all", () => {
        draftSelection = new Set(snapshot.contexts.map((context) => context.code));
        render();
      }),
      action("Deselect all calendars", "Select none", () => {
        draftSelection.clear();
        render();
      }),
      action("Deselect unavailable calendars", "Remove unavailable", () => {
        for (const code of snapshot.unavailableCalendars || []) draftSelection.delete(code);
        render();
      })
    );
    panel.append(tools);
    for (const context of snapshot.contexts) {
      const row = el("label", "calendar-choice");
      const input = el("input");
      input.type = "checkbox";
      input.checked = draftSelection.has(context.code);
      input.dataset.contextCode = context.code;
      setLabel(input, `Load ${context.name || context.code}`);
      input.addEventListener("change", () => {
        if (input.checked) draftSelection.add(context.code);
        else draftSelection.delete(context.code);
      });
      const label = el("div");
      label.append(el("span", "", context.name || context.code, true));
      const kind = context.code.split("_")[0];
      label.append(el("p", "hint", `${{ user: "Personal", course: "Course", group: "Group", account: "Account" }[kind] || "Calendar"}${snapshot.unavailableCalendars?.includes(context.code) ? " \xB7 Canvas denied access" : ""}`));
      row.append(input, label);
      panel.append(row);
    }
    const save = action("Save calendar selection", saving ? "Saving\u2026" : "Save and load", async () => {
      if (saving) return;
      saving = true;
      const userId = snapshot.profile.id;
      try {
        await store.setSelectedCalendars([...draftSelection]);
        if (!open || snapshot?.profile.id !== userId) return;
        activeTab = "calendar";
        selectedKey = null;
        expandedWeeks.clear();
        await load(true);
      } catch {
        notice = "Could not save your calendar selection. Please try again.";
      } finally {
        saving = false;
        render();
      }
    });
    save.disabled = saving;
    panel.append(save, action("Retry unavailable calendars", "Retry calendar access", () => load(true, { retryUnavailable: true })));
    const languageField = el("label", "field", "Language / \u8BED\u8A00");
    const languageSelect = ui(document).select("Interface language", [["en", "English", true], ["zh-CN", "\u7B80\u4F53\u4E2D\u6587", true]], planningState.settings.language || "en");
    const languageNotice = el("p", "hint");
    languageSelect.addEventListener("change", async () => {
      const value = languageSelect.value;
      languageSelect.disabled = true;
      try {
        await planningStore.setLanguage(value);
        await refreshLocal();
      } catch (cause) {
        languageSelect.value = getLanguage(document);
        setText(languageNotice, cause.message || "Could not save language. Please try again.");
      } finally {
        languageSelect.disabled = false;
      }
    });
    languageField.append(languageSelect);
    panel.prepend(languageField, languageNotice);
    if (!themeEditor || themeEditorUserId !== snapshot.profile.id) {
      themeEditorUserId = snapshot.profile.id;
      const capturedStore = planningStore;
      themeEditor = createThemeSettings({ document, value: planningState.theme, scope:planningState.themeScope, onSave: async (theme) => {
        await capturedStore.setTheme(theme);
        if (!open || planningStore !== capturedStore) return;
        // A different page may have saved a newer choice before this write returned.
        await refreshLocal();
        return planningState.theme;
      }, onSaveScope:async(scope)=>{
        await capturedStore.setThemeScope(scope);
        if(!open||planningStore!==capturedStore)return;
        await refreshLocal();
        return planningState.themeScope;
      } });
    }
    themeEditor.update(planningState.theme,planningState.themeScope);
    localizeTree(themeEditor.element);
    panel.insertBefore(themeEditor.element, languageField.nextSibling);
    const settingsSignature = (value) => JSON.stringify([snapshot.profile.id, month, snapshot.contexts, { ...value, language: void 0 }]);
    const signature = settingsSignature(planningState.settings);
    if (!settingsEditor || settingsEditorKey !== signature) {
      settingsEditorKey = signature;
      settingsEditor = renderPlanningSettings({ document, state: planningState, contexts: snapshot.contexts, currentMonth:month, onSave: async (settings2) => {
        const previousKey = settingsEditorKey;
        /* Keep this form when the storage notification installs our own save. */
        settingsEditorKey = settingsSignature(settings2);
        try {
          await planningStore.setSettings(settings2);
          await refreshLocal();
        } catch (cause) {
          settingsEditorKey = previousKey;
          throw cause;
        }
      } });
    }
    localizeTree(settingsEditor);
    panel.append(settingsEditor);
    if (notice) panel.append(el("p", "notice", notice));
    return panel;
  }
  function calendar(items) {
    const container = el("div");
    const weekdayRow = el("div", "weekday-row");
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) weekdayRow.append(el("span", "", day));
    container.append(weekdayRow);
    const monthGrid = el("div", "month");
    const weeks = monthWeeks(month);
    const segments = weekSegments(items, weeks);
    const byKey = new Map(items.map((item) => [item.key, item]));
    let hoveredKey = null;
    let focusedKey = null;
    const itemBars = /* @__PURE__ */ new Map();
    const updateHighlights = () => {
      for (const [key, bars] of itemBars) {
        const highlighted = key === hoveredKey || key === focusedKey || key === selectedKey;
        for (const bar of bars) bar.classList.toggle("highlighted", highlighted);
      }
    };
    const today = todayDay();
    const pressure = new Map(workloadSeries(items, combinedState(), { startDate: weeks[0][0], endDate: weeks.at(-1)[6] }).map((p) => [p.day, p]));
    weeks.forEach((week, index) => {
      const row = el("div", "week");
      const days = el("div", "days");
      week.forEach((day) => {
        const cell = el("div", `day${day.slice(0, 7) === month ? "" : " outside"}${day === today ? " today" : ""}`);
        cell.append(el("span", "day-number", String(Number(day.slice(-2))), true));
        setLabel(cell, day);
        const point = pressure.get(day);
        const badgeText = point.tasks ? `${point.tasks} to do` : "No tasks";
        const badge = action(`View remaining tasks for ${day}`, badgeText, () => {
          selectedDay = day;
          selectedKey = null;
          render();
        }, `pressure-badge ${point.tasks ? pressureLevel(point.tasks, planningState.settings) : "empty"}`);
        badge.dataset.pressureDay = day;
        badge.title = translate(document, `${point.tasks} remaining \xB7 ${point.minutes} min`);
        cell.append(badge);
        days.append(cell);
      });
      row.append(days);
      const bars = el("div", "bars");
      const shown = expandedWeeks.has(index) ? segments[index] : segments[index].slice(0, 4);
      shown.forEach((segment, barIndex) => {
        const item = byKey.get(segment.itemKey);
        const bar = action(`Open ${item.title} in ${item.contexts.join(", ")}`, "", () => {
          selectedKey = item.key;
          notice = null;
          render();
        }, `bar ${item.type}${item.completed ? " completed" : ""}`);
        setLabel(bar, { key: "Open {title} in {contexts}", values: { title: item.title, contexts: item.contexts.join(", ") } });
        bar.append(el("span", "context-tag", shortContext(item.contexts[0]), true), el("span", "bar-title", `${item.completed ? "\u2713 " : ""}${item.title}`, true));
        bar.dataset.itemKey = item.key;
        if (!itemBars.has(item.key)) itemBars.set(item.key, []);
        itemBars.get(item.key).push(bar);
        bar.addEventListener("mouseenter", () => {
          hoveredKey = item.key;
          updateHighlights();
        });
        bar.addEventListener("mouseleave", () => {
          hoveredKey = null;
          updateHighlights();
        });
        bar.addEventListener("focus", () => {
          focusedKey = item.key;
          updateHighlights();
        });
        bar.addEventListener("blur", () => {
          focusedKey = null;
          updateHighlights();
        });
        bar.style.gridColumn = `${segment.startColumn + 1} / ${segment.endColumn + 2}`;
        bar.style.gridRow = String(barIndex + 1);
        bar.title = `${item.title}: ${item.startDay} \u2013 ${item.endDay}`;
        bars.append(bar);
      });
      if (segments[index].length > 4) {
        const expanded = expandedWeeks.has(index);
        bars.append(action(expanded ? "Show fewer items" : "Show more items", expanded ? "Show less" : `+${segments[index].length - 4} more`, () => {
          if (expanded) expandedWeeks.delete(index);
          else expandedWeeks.add(index);
          render();
        }, "more"));
      }
      row.append(bars);
      monthGrid.append(row);
    });
    updateHighlights();
    container.append(monthGrid);
    if (selectedDay) {
      const point = pressure.get(selectedDay);
      container.append(renderDayList({ document, day: selectedDay, items: items.filter((i) => point?.itemKeys.includes(i.key)), state: combinedState(), onOpenItem: (key) => {
        selectedKey = key;
        render();
      }, onComplete: completeItem }));
    }
    return container;
  }
  function render() {
    if (!open) return;
    const preserveScroll = renderedTab === activeTab && renderedMonth === month;
    if (!preserveScroll) savedContentScroll = 0;
    else if (!renderedLoading) savedContentScroll = root.querySelector(".content")?.scrollTop || 0;
    const previousDetail = root.querySelector(".detail");
    if (renderedDetailKey !== selectedKey) savedDetailScroll = 0;
    else if (previousDetail) savedDetailScroll = previousDetail.scrollTop;
    // The short loading screen clamps browser scroll. Keep the last full view's position.
    const loadingScreen = loading && !snapshot?.range && !planController?.hasPendingLeaveDecision();
    const focused = root.activeElement;
    const focusId = focused?.dataset?.controlId || focused?.getAttribute("aria-label");
    const selection = focused?.selectionStart;
    setLanguage(document, planningState.settings.language);
    applyAppearance();
    const entry = document.querySelector("[data-planning-entry]");
    if (entry) {
      setText(entry, "Planning");
      localizeTree(entry);
    }
    const style = el("style", "", styles);
    const backdrop = el("div", "backdrop");
    const shell = el("section", "shell");
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.lang = getLanguage(document);
    setLabel(shell, "Planning calendar");
    const header = el("header", "header");
    const identity = el("div", "identity");
    identity.append(el("p", "eyebrow", "Illinois Canvas"), el("h1", "", "Planning calendar"), el("p", "subline", "Canvas completion and your own planning marks"));
    header.append(identity);
    const controls = el("div", "controls");
    if (activeTab === "calendar" || activeTab === "workload") {
      controls.append(action("Previous month", "\u2039", () => navigate(shiftMonth(month, -1))), el("span", "month-name", new Intl.DateTimeFormat(intlLocale(document), { month: "long", year: "numeric" }).format(/* @__PURE__ */ new Date(`${month}-01T12:00:00`))), action("Next month", "\u203A", () => navigate(shiftMonth(month, 1))), action("Today", "Today", () => navigate(todayDay().slice(0, 7))));
    } else if (activeTab === "tasks" && snapshot?.range) {
      controls.append(el("span", "toolbar-context", `Loaded range \xB7 ${snapshot.range.startDate} \u2013 ${snapshot.range.endDate}`));
    } else controls.append(el("span", "toolbar-context", activeTab === "planner" ? "Planner" : "Settings"));
    controls.append(action("Refresh calendar", "Refresh", () => load(true)), action("Close planning calendar", "\xD7", close, "close"));
    header.append(controls);
    shell.append(header);
    const tabs = el("nav", "tabs");
    tabs.setAttribute("role", "tablist");
    setLabel(tabs, "Planner views");
    for (const [tab, name, label] of [["calendar", "Calendar", "Planning calendar view"], ["tasks", "Task list", "Task list view"], ["workload", "Workload", "Workload view"], ["planner", "Planner", "Planner view"], ["settings", "Settings", "Calendar settings"]]) {
      const button = action(label, name, () => changeTab(tab), "tab");
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(activeTab === tab));
      button.setAttribute("aria-controls", "planner-panel");
      button.disabled = loading || saving || !snapshot;
      tabs.append(button);
    }
    shell.append(tabs);
    const body = el("div", "content");
    body.id = "planner-panel";
    body.setAttribute("role", "tabpanel");
    if (loadingScreen) {
      const status=el('div','status calendar-loading');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const title=el('div','loading-title'),spinner=el('span','loading-spinner');spinner.setAttribute('aria-hidden','true');
      title.append(spinner,el('span','','Loading Canvas calendar\u2026'));status.append(title);
      const skeleton=el('div','calendar-skeleton');skeleton.setAttribute('aria-hidden','true');
      for(let i=0;i<35;i++){const cell=el('div','skeleton-day');cell.append(el('span','skeleton-date'),el('span','skeleton-event'));skeleton.append(cell);}
      status.append(skeleton);body.append(status);
    }
    else if (activeTab === "settings" && snapshot) body.append(settings());
    else if (error && !snapshot?.range && (activeTab !== "planner" || !snapshot)) {
      const status = el("div", "status error");
      status.append(el("p", "", error), action("Retry loading", "Retry", () => load(true, { retryUnavailable: true })));
      body.append(status);
    } else if (snapshot) {
      if (refreshing) {
        const updating=el('p','calendar-updating');updating.setAttribute('role','status');updating.setAttribute('aria-live','polite');
        const spinner=el('span','loading-spinner');spinner.setAttribute('aria-hidden','true');
        updating.append(spinner,el('span','',loadingMore?'Loading remaining calendar months\u2026 Current month is ready.':'Updating Canvas calendar\u2026 Showing cached data.'));body.append(updating);
      }
      if (error) {
        const status = el("div", "status error");
        status.append(el("p", "", `${error} Showing your last loaded data; refresh to verify current deadlines.`), action("Retry loading", "Retry", () => load(true, { retryUnavailable: true })));
        body.append(status);
      }
      const items = normalizeItems(snapshot, userState);
      for (const warning of snapshot.warnings || []) {
        const message = el("p", "notice", warning);
        message.setAttribute("role", "status");
        body.append(message);
      }
      for (const warning of planningState.warnings) body.append(el("p", "notice", warning));
      const pressure = workloadSummary(items, combinedState(), { now: typeof now === "function" ? now() : now, timeZone: snapshot.profile.time_zone, range: monthRange() });
      const todaySummary = el("p", "today-summary", `Today \xB7 ${pressure.today.tasks} remaining \xB7 ${pressure.overdue.length} overdue`);
      body.append(todaySummary);
      todaySummary.append(action("View overdue homework", "Overdue H/W", showOverdue, "text-button"));
      if (activeTab === "tasks") body.append(taskListController(items).render());
      else if (activeTab === "workload") body.append(renderWorkloadView({ document, items: activeItems(items), state: combinedState(), range: monthRange(), now: typeof now === "function" ? now() : now, timeZone: snapshot.profile.time_zone, onOpenItem: (key) => {
        selectedKey = key;
        render();
      }, onComplete: completeItem }));
      else if (activeTab === "planner") {
        const data = { items, state: planningState, completed: userState.completed, loadedRange: snapshot.range };
        if (!planController) {
          controllerUserId = snapshot.profile.id;
          planController = createPlannerController({ document, ...data, planClient: planClientFactory?.(snapshot.profile.id) || { save: async () => ({ ok: false, message: "Plan storage is unavailable." }), remove: async () => ({ ok: false, message: "Plan storage is unavailable." }) }, now, schedulerClient: schedulerClientFactory?.(snapshot.profile.id), timeZone: snapshot.profile.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone, onOpenItem: (key) => {
            selectedKey = key;
            render();
          }, onComplete: completeItem, onReloadPlans: () => planningStore.loadPlanningState(), ensureRange: ensurePlanRange });
        } else planController.setData(data, { render: false });
        body.append(planController.render());
      } else body.append(calendar(activeItems(items)));
      if (snapshot.selectedCalendars?.length === 0) body.append(el("p", "hint", "No calendars selected. Choose calendars in Settings."));
      const selected = items.find((item) => item.key === selectedKey);
      if (selected) shell.append(detailView.render(selected));
    }
    if (notice && activeTab !== "settings" && !selectedKey) body.append(el("p", "notice", notice));
    shell.append(body);
    backdrop.append(shell);
    root.replaceChildren(style, backdrop);
    if (focusId) {
      const target = [...root.querySelectorAll("[data-control-id],[aria-label]")].find((n) => (n.dataset.controlId || n.getAttribute("aria-label")) === focusId);
      target?.focus({ preventScroll: true });
      if (selection != null && target?.type === "text") target.setSelectionRange(selection, selection);
    }
    body.scrollTop = savedContentScroll;
    const detailPanel = root.querySelector(".detail");
    if (detailPanel) detailPanel.scrollTop = savedDetailScroll;
    renderedLoading = loadingScreen;
    renderedTab = activeTab;
    renderedMonth = month;
    renderedDetailKey = selectedKey;
  }
  async function show(nextMonth) {
    if (open) return;
    if (nextMonth) {
      detailView.reset();
      month = nextMonth;
      activeTab = "calendar";
      selectedKey = null;
      expandedWeeks.clear();
    }
    open = true;
    const openingRequest = ++requestId;
    /* The loader owns the cache and verifies identity before returning it. */
    snapshot = null;
    systemTheme?.addEventListener("change", onSystemThemeChange);
    document.addEventListener("keydown", onKeyDown);
    try {
      // Read local appearance before mounting anything that could paint a light frame.
      const theme = await loadInitialTheme?.();
      if (!open || requestId !== openingRequest) return;
      planningState.theme = theme || planningState.theme || defaultTheme();
    } catch {
      // A preference read failure should still allow Canvas to load and offer retry.
      if (!open || requestId !== openingRequest) return;
    }
    applyAppearance();
    document.body.append(host);
    await load(true, { force: false });
  }
  async function toggle() {
    if (open) {
      await close();
      return;
    }
    await show();
  }
  return { show, toggle, destroy: () => close(true) };
}
export {
  monthFromCalendarHash,
  mountCalendarEntry,
  mountPlanner,
  nativeCalendarSelection
};
