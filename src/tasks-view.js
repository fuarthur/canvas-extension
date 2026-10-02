import { ui, formatMinutes } from "./ui.js";
import { intlLocale } from "./i18n.js";
import { validDay } from "./dates.js";
import { resolveEstimate } from "./estimates.js";
import { taskList, taskGroup, taskDate, isHistoricalTask, isOverdueTask, isTaskComplete, historyCutoff, targetInstant, validateTaskPreferences, defaultTaskPreferences } from "./tasks.js";
function createTasksController(options) {
  const { document } = options, { el, button, input, field, select } = ui(document);
  const root = el("section", "task-agenda");
  let data = options, preferences = validateTaskPreferences(options.state.taskPreferences), busy = false, destroyed = false, notice = "", noticeKind = "error", undo = null;
  let estimate = 60, finishDay = "", finishTime = "", rangeStart = options.loadedRange?.startDate || "", rangeEnd = options.loadedRange?.endDate || "";
  let bulkEditor = null, moreFiltersOpen = false;
  let preferenceQueue = Promise.resolve();
  const selected = /* @__PURE__ */ new Set();
  const now = () => typeof options.now === "function" ? options.now() : options.now ?? /* @__PURE__ */ new Date();
  const facts = () => ({ now: now(), timeZone: options.timeZone });
  const rows = () => taskList(data.items, data.state, preferences, facts());
  const formatDate = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "\u2014";
    return new Intl.DateTimeFormat(intlLocale(document), { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: options.timeZone }).format(new Date(value));
  };
  function setNotice(message, kind = "error") {
    notice = message;
    noticeKind = kind;
  }
  function savePreferences() {
    const sent = { ...preferences };
    preferenceQueue = preferenceQueue.then(() => destroyed ? null : options.onPreferences?.(sent)).catch((error) => {
      setNotice(error.message);
      draw();
    });
  }
  function filter(patch) {
    if (busy) return;
    preferences = { ...preferences, ...patch };
    selected.clear();
    setNotice("");
    savePreferences();
    draw();
  }
  function reconcileCourse() {
    if (preferences.course === "all" || data.contexts?.some((context) => context.code === preferences.course)) return;
    preferences = { ...preferences, course: "all" };
    selected.clear();
    savePreferences();
  }
  async function apply(patch) {
    if (busy) return;
    let keys = [...selected];
    if (Object.hasOwn(patch, "completed")) keys = keys.filter((key) => !data.items.find((i) => i.key === key)?.canvasCompleted);
    if (!keys.length) {
      setNotice("Canvas completion is read-only.");
      draw();
      return;
    }
    busy = true;
    setNotice("");
    draw();
    try {
      undo = await options.onApply(keys, patch);
      selected.clear();
      setNotice("Task changes saved.", "success");
    } catch (error) {
      setNotice(error.message || "Could not save this change. Try again.");
    } finally {
      busy = false;
      if (!destroyed) draw();
    }
  }
  async function undoChanges() {
    if (busy || !undo) return;
    busy = true;
    draw();
    try {
      const result = await options.onUndo(undo);
      undo = null;
      selected.clear();
      setNotice(result.skipped ? "Undo finished; newer edits were kept." : "Task changes undone.", "success");
    } catch (error) {
      setNotice(error.message);
    } finally {
      busy = false;
      if (!destroyed) draw();
    }
  }
  async function loadRange() {
    if (busy) return;
    if (!validDay(rangeStart) || !validDay(rangeEnd) || rangeEnd < rangeStart) {
      setNotice("Choose a valid date range.");
      draw();
      return;
    }
    busy = true;
    selected.clear();
    setNotice("");
    draw();
    try {
      await options.onLoadRange({ startDate: rangeStart, endDate: rangeEnd });
    } catch (error) {
      setNotice(error.message);
    } finally {
      busy = false;
      if (!destroyed) draw();
    }
  }
  function captureBulkInputs() {
    const read = (id) => root.querySelector(`[data-control-id="${id}"]`)?.value;
    if (read("Bulk estimate minutes") != null) estimate = Number(read("Bulk estimate minutes"));
    if (read("Bulk finish date") != null) finishDay = read("Bulk finish date");
    if (read("Bulk finish time") != null) finishTime = read("Bulk finish time");
  }
  function toggleBulkEditor(editor) {
    captureBulkInputs();
    bulkEditor = bulkEditor === editor ? null : editor;
    draw();
  }
  function bulkTools(visible) {
    const tools = el("div", "task-bulk");
    tools.setAttribute("role", "group");
    const total = visible.filter((i) => selected.has(i.key)).reduce((sum, i) => sum + resolveEstimate(i, data.state).minutes, 0);
    const count = el("strong", "", `${selected.size} selected \xB7 ${formatMinutes(total)}`);
    count.dataset.selectionCount = "";
    tools.append(count);
    const actions = el("div", "view-tools");
    actions.append(
      button("Complete selected tasks", () => apply({ completed: true }), "control primary", "Mark as complete"),
      button("Edit selected estimates", () => toggleBulkEditor("estimate"), "text-button", "Edit effort"),
      button("Edit selected planned finish", () => toggleBulkEditor("target"), "text-button", "Set planned finish")
    );
    for (const [id, editor] of [["Edit selected estimates", "estimate"], ["Edit selected planned finish", "target"]]) {
      const node = actions.querySelector(`[data-control-id="${id}"]`);
      node.setAttribute("aria-expanded", String(bulkEditor === editor));
    }
    const secondary = el("details", "bulk-more-actions");
    secondary.append(
      el("summary", "", "More actions"),
      button("Reopen selected tasks", () => apply({ completed: false }), "text-button", "Reopen"),
      button("Clear task selection", () => {
        selected.clear();
        draw();
      }, "text-button", "Clear selection")
    );
    actions.append(secondary);
    const minutes = input("Bulk estimate minutes", estimate, "number", (value) => {
      estimate = value;
    });
    minutes.min = "1";
    minutes.max = "1440";
    minutes.step = "1";
    minutes.addEventListener("input", () => {
      estimate = Number(minutes.value);
    });
    const effort = el("div", "view-tools");
    effort.append(field("Estimated effort (minutes)", minutes), button("Set selected estimates", () => {
      estimate = Number(minutes.value);
      return apply({ estimate });
    }, "control", "Set effort"), button("Reset selected estimates", () => apply({ estimate: null }), "text-button", "Use rule / default"));
    const date = input("Bulk finish date", finishDay, "date", (value) => {
      finishDay = value;
    }), time = input("Bulk finish time", finishTime, "time", (value) => {
      finishTime = value;
    });
    date.addEventListener("input", () => {
      finishDay = date.value;
    });
    time.addEventListener("input", () => {
      finishTime = time.value;
    });
    const target = el("div", "view-tools");
    target.append(field("Planned finish date", date), field("Finish time (optional)", time), button("Set selected planned finish", () => {
      finishDay = date.value;
      finishTime = time.value;
      const value = { day: finishDay, time: finishTime || null };
      if (!targetInstant(value, options.timeZone)) {
        setNotice("Choose a valid planned finish date and time.");
        draw();
        return;
      }
      return apply({ target: value });
    }, "control", "Set planned finish"), button("Clear selected planned finish", () => apply({ target: null }), "text-button", "Clear planned finish"));
    tools.append(actions);
    if (bulkEditor === "estimate") tools.append(effort);
    if (bulkEditor === "target") tools.append(target, el("p", "hint", "Planned finish is your personal target; it does not change the Canvas deadline or schedule work blocks."));
    return tools;
  }
  function draw() {
    if (destroyed) return;
    reconcileCourse();
    const active = root.getRootNode().activeElement || document.activeElement;
    const focusId = root.contains(active) ? active.dataset?.controlId : null, cursor = active?.selectionStart;
    captureBulkInputs();
    const oldFilters = root.querySelector(".task-more-filters");
    if (oldFilters) moreFiltersOpen = oldFilters.open;
    const oldRange = root.querySelector(".task-range");
    if (oldRange) rangeOpen = oldRange.open;
    root.replaceChildren();
    root.append(el("h2", "", "Task agenda"));
    const shortcuts = el("div", "task-presets");
    for (const [preset, label, text] of [["all", "All tasks", "All tasks"], ["overdue", "Overdue H/W", "Overdue H/W"], ["today", "Today tasks", "Today"], ["week", "Next 7 days", "Next 7 days"], ["completed", "Completed tasks", "Completed"]]) {
      const node = button(label, () => filter({ preset, status: preset === "completed" ? "completed" : "remaining" }), "control", text);
      node.setAttribute("aria-pressed", String(preferences.preset === preset));
      shortcuts.append(node);
    }
    root.append(shortcuts);
    const filters = el("div", "task-filters");
    const query = input("Search all tasks", preferences.query, "search");
    query.maxLength = 200;
    query.addEventListener("input", () => filter({ query: query.value }));
    filters.append(field("Search tasks", query), field("Course / calendar", select("Tasks course", [["all", "All courses / calendars"], ...(data.contexts || []).map((c) => [c.code, c.name, true])], preferences.course, (value) => filter({ course: value }))));
    const advanced = el("details", "task-more-filters");
    advanced.open = moreFiltersOpen;
    const advancedHeading = el("summary", "", "More filters");
    advancedHeading.dataset.controlId = "More task filters";
    advanced.append(advancedHeading);
    const advancedFields = el("div", "advanced-filter-fields");
    advancedFields.append(
      field("Task type", select("Tasks type", [["all", "All types"], ["assignment", "Homework"], ["event", "Calendar activities"]], preferences.type, (value) => filter({ type: value }))),
      field("Completion", select("Tasks completion", [["remaining", "Remaining"], ["all", "All statuses"], ["completed", "Completed"]], preferences.status, (value) => filter({ status: value, preset: preferences.preset === "completed" ? "all" : preferences.preset }))),
      field("Sort", select("Tasks sort", [["dueAsc", "Deadline: nearest first"], ["dueDesc", "Deadline: latest first"], ["estimateAsc", "Estimate: shortest first"], ["estimateDesc", "Estimate: longest first"], ["targetAsc", "Planned finish: earliest first"], ["targetDesc", "Planned finish: latest first"], ["titleAsc", "Title: A\u2013Z"], ["titleDesc", "Title: Z\u2013A"]], preferences.sort, (value) => filter({ sort: value }))),
      field("Grouping", select("Tasks grouping", [["none", "No grouping"], ["date", "By date"], ["course", "By course"], ["type", "By type"]], preferences.group, (value) => filter({ group: value }))),
      button("Reset task filters", () => filter(defaultTaskPreferences()), "text-button", "Reset filters")
    );
    advanced.append(advancedFields);
    filters.append(advanced);
    const filterSummary = el("div", "active-task-filters");
    for (const [key, id] of [["type", "Tasks type"], ["status", "Tasks completion"], ["sort", "Tasks sort"], ["group", "Tasks grouping"]]) {
      if (preferences[key] !== defaultTaskPreferences()[key]) {
        const chosen = advancedFields.querySelector(`[data-control-id="${id}"]`).selectedOptions[0];
        filterSummary.append(el("span", "filter-chip", chosen.textContent, true));
      }
    }
    root.append(filters, filterSummary);
    const history = data.items.filter((i) => isHistoricalTask(i, data.state, facts())).length, cutoff = historyCutoff(data.state.settings?.historyFilter, now(), options.timeZone);
    if (cutoff) {
      const line = el("div", "task-history");
      line.append(el("span", "hint", `${history} historical tasks \xB7 before ${cutoff}`), button(preferences.showHistory ? "Hide historical tasks" : "Show historical tasks", () => filter({ showHistory: !preferences.showHistory }), "text-button", preferences.showHistory ? "Hide history" : "View history"));
      root.append(line);
    }
    if (data.loadedRange) {
      const range = el("details", "task-range");
      range.append(el("summary", "", `Loaded range \xB7 ${data.loadedRange.startDate} \u2013 ${data.loadedRange.endDate}`));
      range.append(el("p", "hint", "Tasks include selected calendars within this loaded range. Assignments without a Canvas deadline are not included."));
      const start = input("Tasks range start", rangeStart || data.loadedRange.startDate, "date", (value) => {
        rangeStart = value;
      }), end = input("Tasks range end", rangeEnd || data.loadedRange.endDate, "date", (value) => {
        rangeEnd = value;
      });
      start.addEventListener("input", () => {
        rangeStart = start.value;
      });
      end.addEventListener("input", () => {
        rangeEnd = end.value;
      });
      range.append(field("Start date", start), field("End date", end), button("Load task date range", () => {
        rangeStart = start.value;
        rangeEnd = end.value;
        return loadRange();
      }, "control", "Load range"));
      range.addEventListener("toggle", () => {
        if (root.contains(range)) rangeOpen = range.open;
      });
      range.open = rangeOpen;
      root.append(range);
    }
    root.append(el("p", "hint", options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, true));
    const visible = rows(), keys = new Set(visible.map((i) => i.key));
    for (const key of selected) if (!keys.has(key)) selected.delete(key);
    const selectAll = input("Select all filtered tasks", "", "checkbox");
    selectAll.checked = visible.length > 0 && selected.size === visible.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < visible.length;
    selectAll.disabled = !visible.length;
    selectAll.addEventListener("change", () => {
      selected.clear();
      if (selectAll.checked) for (const item of visible) selected.add(item.key);
      draw();
    });
    root.append(field("Select all filtered results", selectAll), el("p", "hint", `${visible.length} tasks`));
    if (selected.size) root.append(bulkTools(visible));
    if (notice) {
      const message = el("p", noticeKind === "success" ? "success" : "notice", notice);
      message.setAttribute("role", "status");
      root.append(message);
    }
    if (undo) root.append(button("Undo task changes", undoChanges, "text-button", "Undo"));
    const groups = /* @__PURE__ */ new Map();
    for (const item of visible) {
      const heading = taskGroup({ ...item, completed: isTaskComplete(item, data.state) }, preferences.group, facts());
      if (!groups.has(heading)) groups.set(heading, []);
      groups.get(heading).push(item);
    }
    for (const [heading, items] of groups) {
      const group = el("section", "task-group");
      group.dataset.taskGroup = heading;
      if (heading) group.append(el("h3", "", heading, preferences.group === "course" && heading !== "Personal"));
      for (const item of items) {
        const complete = isTaskComplete(item, data.state), row = el("div", `agenda-row${complete ? " completed" : ""}${selected.has(item.key) ? " selected" : ""}`);
        row.dataset.taskRow = item.key;
        const checkbox = input(`Select task ${item.key}`, "", "checkbox");
        checkbox.dataset.taskSelect = item.key;
        checkbox.checked = selected.has(item.key);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(item.key);
          else selected.delete(item.key);
          draw();
        });
        const title = el("div", "agenda-title");
        title.append(button(`Open ${item.title}`, () => options.onOpenItem?.(item.key), "task-title", item.title), el("p", "hint", item.contexts?.join(" \xB7 "), true));
        const meta = el("div", "agenda-meta");
        meta.append(el("span", "", item.type === "assignment" ? "Deadline" : "Activity starts"), el("span", "", formatDate(taskDate(item)), true), el("span", "", formatMinutes(resolveEstimate(item, data.state).minutes)));
        const target = data.state.targets?.[item.key];
        if (target) {
          meta.append(el("span", "", "Planned finish"), el("span", "", target.time ? formatDate(targetInstant(target, options.timeZone)) : target.day, true));
          if (targetInstant(target, options.timeZone) && item.dueAt && Date.parse(targetInstant(target, options.timeZone)) > Date.parse(item.dueAt)) meta.append(el("span", "urgency-tag red", "Target is after the deadline"));
        }
        const status = el("div", "agenda-status");
        if (item.canvasCompleted) status.append(el("span", "hint", "Completed in Canvas"));
        else if (complete) status.append(el("span", "hint", "Completed"));
        else if (isOverdueTask(item, data.state, now())) status.append(el("span", "urgency-tag red", "Overdue"));
        if (isHistoricalTask(item, data.state, facts())) status.append(el("span", "hint", "Historical task"));
        row.append(checkbox, title, meta, status);
        group.append(row);
      }
      root.append(group);
    }
    if (!visible.length) root.append(el("p", "empty-state", "No tasks match your filters."));
    if (busy) {
      root.setAttribute("aria-busy", "true");
      for (const node of root.querySelectorAll("button,input,select")) node.disabled = true;
    } else root.removeAttribute("aria-busy");
    if (focusId) {
      const node = [...root.querySelectorAll("[data-control-id]")].find((n) => n.dataset.controlId === focusId);
      node?.focus({ preventScroll: true });
      if (typeof cursor === "number" && node?.setSelectionRange) try {
        node.setSelectionRange(cursor, cursor);
      } catch {
      }
    }
  }
  let rangeOpen = false;
  return { render() {
    draw();
    return root;
  }, setData(next, { render = true } = {}) {
    data = { ...data, ...next };
    reconcileCourse();
    if (render) draw();
  }, showPreset(preset) {
    preferences = { ...defaultTaskPreferences(), sort: preferences.sort, group: preferences.group, preset, status: preset === "completed" ? "completed" : "remaining" };
    selected.clear();
    savePreferences();
    draw();
  }, destroy() {
    destroyed = true;
    selected.clear();
    undo = null;
    root.remove();
  } };
}
export {
  createTasksController
};
