import { ui } from "./ui.js";
import { setLabel, translate, intlLocale } from "./i18n.js";
import { validDay } from "./dates.js";
import { resolveEstimate } from "./estimates.js";
import { targetInstant } from "./tasks.js";
function safeCanvasLink(value) {
  if (!value) return null;
  try {
    const url = new URL(value, "https://canvas.illinois.edu");
    return url.origin === "https://canvas.illinois.edu" ? url.href : null;
  } catch {
    return null;
  }
}
function createTaskDetailView(options) {
  const { document, getData } = options;
  const { el, button, input, field } = ui(document);
  let key = null, panel = null, target = null, targetDirty = false, currentItem = null;
  let baseline = null, generation = 0, notice = "", planningOpen = false;
  function reset() {
    key = currentItem = null;
    panel = null;
    target = baseline = null;
    targetDirty = false;
    notice = "";
    planningOpen = false;
    generation++;
  }
  function captureTarget() {
    if (!panel) return;
    const day = panel.querySelector('[data-control-id="Planned finish date"]')?.value;
    const time = panel.querySelector('[data-control-id="Planned finish time"]')?.value;
    if (day == null || time == null) return;
    if (day !== baseline?.day || time !== baseline?.time) targetDirty = true;
    target = { day, time };
  }
  function render(item) {
    if (key !== item.key) reset();
    const scrollTop = panel?.scrollTop || 0;
    captureTarget();
    if (panel) planningOpen = panel.querySelector(".detail-planning-options")?.open || false;
    key = item.key;
    currentItem = item;
    const { userState, planningState, notice: parentNotice } = getData();
    const saved = planningState.targets?.[key];
    if (!targetDirty) target = { day: saved?.day || "", time: saved?.time || "" };
    baseline = { ...target };
    const currentGeneration = generation;
    panel = el("aside", "detail");
    setLabel(panel, "Item details");
    const currentPanel = panel;
    const redraw = () => {
      if (generation !== currentGeneration || key !== item.key) return;
      const previous = panel;
      const top = previous.scrollTop;
      previous.replaceWith(render(currentItem));
      panel.scrollTop = top;
    };
    async function run(operation) {
      if (generation !== currentGeneration) return false;
      notice = "";
      try {
        return await operation();
      } catch (error) {
        if (generation !== currentGeneration || key !== item.key) return false;
        notice = error.message || "Could not save this change. Try again.";
        redraw();
        return false;
      }
    }
    const head = el("div", "detail-head");
    head.append(el("h2", "", item.title, true), button("Close details", () => {
      reset();
      options.onClose();
    }, "close", "\xD7"));
    panel.append(head, el("p", "", item.contexts.join(" \xB7 ") || translate(document, "Personal"), true));
    const facts = el("dl");
    const formatDate = (value) => {
      if (!value) return "\u2014";
      const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const instant = new Date(dayOnly ? `${value}T12:00:00Z` : value);
      if (!Number.isFinite(instant.getTime())) return String(value);
      return new Intl.DateTimeFormat(intlLocale(document), {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...dayOnly ? {} : { hour: "2-digit", minute: "2-digit" },
        timeZone: dayOnly ? "UTC" : getData().timeZone
      }).format(instant);
    };
    const dates = item.type === "assignment" ? [["Deadline", item.dueAt || item.endAt || item.endDay]] : [["Starts", item.startAt || item.startDay], ["Ends", item.endAt || item.endDay]];
    for (const [label, value] of dates) facts.append(el("dt", "", label), el("dd", "", formatDate(value), true));
    panel.append(facts);
    const planningOptions = el("details", "detail-planning-options");
    planningOptions.open = planningOpen;
    planningOptions.append(el("summary", "", "Planning options"));
    if (item.type === "assignment") {
      const start = input("Plan start date", userState.starts[item.key] || item.startDay, "date");
      start.max = item.endDay;
      start.addEventListener("change", () => {
        if (!validDay(start.value) || start.value > item.endDay) {
          planningOptions.open = true;
          notice = "Choose a valid date no later than the due date.";
          redraw();
          return;
        }
        return run(() => options.onStart(item.key, start.value));
      });
      planningOptions.append(field("Plan start date", start), button("Use Canvas start date", () => run(() => options.onStart(item.key, null)), "text-button", "Use Canvas date"));
      if (item.needsStart) planningOptions.append(el("p", "hint", "No Canvas open date; choose when you plan to start."));
    }
    const estimate = resolveEstimate(item, planningState);
    const minutes = input("Estimated effort minutes", estimate.minutes, "number");
    minutes.min = "1";
    minutes.max = "1440";
    minutes.step = "1";
    minutes.addEventListener("change", () => run(() => options.onEstimate(item.key, Number(minutes.value))));
    panel.append(field("Estimated effort (minutes)", minutes), el("p", "hint", estimate.label), button("Use automatic estimate", () => run(() => options.onEstimate(item.key, null)), "text-button", "Use rule / default"));
    const date = input("Planned finish date", target.day, "date");
    const time = input("Planned finish time", target.time, "time");
    for (const node of [date, time]) node.addEventListener("input", () => {
      targetDirty = true;
      target = { day: date.value, time: time.value };
    });
    planningOptions.append(field("Planned finish date", date), field("Finish time (optional)", time), el("p", "hint", "Planned finish is your personal target; it does not change the Canvas deadline or schedule work blocks."));
    async function saveTarget(value) {
      const sent = { day: date.value, time: time.value };
      target = sent;
      targetDirty = true;
      const success = await run(() => options.onTarget(item.key, value));
      if (success !== false && generation === currentGeneration && key === item.key) {
        /* A newer edit made while saving belongs to the user, not the saved result. */
        captureTarget();
        if (target.day === sent.day && target.time === sent.time) {
          targetDirty = false;
          target = null;
          redraw();
        }
      }
    }
    planningOptions.append(button("Save planned finish", () => {
      const value = { day: date.value, time: time.value || null };
      if (!targetInstant(value, getData().timeZone)) {
        planningOptions.open = true;
        notice = "Choose a valid planned finish date and time.";
        redraw();
        return;
      }
      return saveTarget(value);
    }, "control", "Set planned finish"), button("Clear planned finish", () => saveTarget(null), "text-button", "Clear planned finish"));
    if (saved && item.dueAt && Date.parse(targetInstant(saved, getData().timeZone)) > Date.parse(item.dueAt)) planningOptions.append(el("p", "notice", "Target is after the deadline"));
    if (item.type === "assignment") {
      const once = input("Allow splitting", "", "checkbox");
      once.checked = planningState.allowSplitting?.[item.key]===true;
      once.addEventListener("change", () => run(() => options.onAllowSplitting(item.key, once.checked)));
      const label = el("label", "check");
      label.append(once, document.createTextNode(translate(document, "Allow splitting")));
      planningOptions.append(label,el("p","hint","Tasks finish in one continuous block by default. Splitting is allowed only when checked, above the plan's non-splitting threshold, and needed to fit the work."));
    }
    const completed = input("Mark complete", "", "checkbox");
    completed.checked = item.completed;
    completed.disabled = Boolean(item.canvasCompleted);
    completed.addEventListener("change", () => run(() => options.onComplete(item.key, completed.checked)));
    const completion = el("label", "check");
    completion.append(completed, document.createTextNode(translate(document, item.canvasCompleted ? "Completed in Canvas" : "Complete in this extension")));
    panel.append(completion);
    if (notice || parentNotice) panel.append(el("p", "notice", notice || parentNotice));
    for (const warning of item.warnings) panel.append(el("p", "notice", warning));
    const url = safeCanvasLink(item.url);
    if (url) {
      const link = el("a", "canvas-link", "Open in Canvas \u2197");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      setLabel(link, "Open in Canvas");
      panel.append(link);
    }
    panel.append(planningOptions);
    currentPanel.scrollTop = scrollTop;
    return currentPanel;
  }
  return { render, reset };
}
export {
  createTaskDetailView
};
