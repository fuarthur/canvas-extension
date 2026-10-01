import { setText, translate } from "./i18n.js";
import { ui, newId } from "./ui.js";
import { validateSettings,nonSplitThreshold,scheduleBufferMinutes } from "./planning-settings.js";
import { resolveEstimate } from "./estimates.js";
import { defaultHistoryFilter } from "./tasks.js";
import {normalizeCalendarLoading,validCalendarLoading,calendarLoadingRange} from './calendar-loading.js';
import {dateKey} from './dates.js';
function renderScheduleEditor({ document, schedule, onChange }) {
  const { el, input, field, button } = ui(document);
  const panel = el("section", "schedule-editor");
  schedule.bufferMinutes=scheduleBufferMinutes(schedule);
  const buffer=input("Buffer between work blocks (minutes)",schedule.bufferMinutes,"number",value=>{schedule.bufferMinutes=value;onChange?.();});
  buffer.min="0";buffer.max="1440";buffer.step="1";
  panel.append(field("Buffer between work blocks (minutes)",buffer),el("p","hint","Automatic planning leaves this gap between work blocks for breaks or unfinished work. Buffer time does not count toward task estimates or daily work capacity. Set 0 to disable."));
  panel.append(el("p", "hint", "Daily capacity includes the actual time occupied by calendar events. Set capacity to 0 for a rest day."));
  for (let i = 0; i < 7; i++) {
    const day = schedule.weekdays[i];
    const name = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i];
    const row = el("div", "schedule-row");
    row.append(el("strong", "", name), field("From", input(`${name} work start`, day.start, "time", (v) => {
      day.start = v;
      onChange?.();
    })), field("Until", input(`${name} work end`, day.end, "time", (v) => {
      day.end = v;
      onChange?.();
    })), field("Minutes", input(`${name} capacity minutes`, day.maxMinutes, "number", (v) => {
      day.maxMinutes = v;
      onChange?.();
    })));
    panel.append(row);
  }
  const exceptions = el("div");
  const drawExceptions = () => {
    exceptions.replaceChildren();
    for (const [date2, day] of Object.entries(schedule.exceptions).sort()) {
      const row = el("div", "schedule-row");
      row.append(el("strong", "", date2), field("From", input(`${date2} work start`, day.start, "time", (v) => {
        day.start = v;
        onChange?.();
      })), field("Until", input(`${date2} work end`, day.end, "time", (v) => {
        day.end = v;
        onChange?.();
      })), field("Minutes", input(`${date2} capacity minutes`, day.maxMinutes, "number", (v) => {
        day.maxMinutes = v;
        onChange?.();
      })), button(`Remove override ${date2}`, () => {
        delete schedule.exceptions[date2];
        drawExceptions();
        onChange?.();
      }, "text-button", "Remove"));
      exceptions.append(row);
    }
  };
  const date = input("Override date", "", "date");
  panel.append(el("h3", "", "Date overrides"), exceptions, date, button("Add date override", () => {
    if (!date.value) return;
    schedule.exceptions[date.value] = { start: "09:00", end: "21:00", maxMinutes: 0 };
    drawExceptions();
    onChange?.();
  }));
  drawExceptions();
  return panel;
}
function renderPlanningSettings({ document, state, contexts, onSave, currentMonth=dateKey(new Date()).slice(0,7) }) {
  const { el, input, field, button, select } = ui(document);
  const draft = structuredClone(state.settings);
  draft.nonSplitThresholdMinutes=nonSplitThreshold(draft);
  const panel = el("section", "planning-settings");
  const nativeCalendar = el("section", "native-calendar-settings settings-section");
  const nativeCompletion = input("Show extension completion on Canvas calendar", "", "checkbox");
  nativeCompletion.checked = draft.nativeCalendarCompletion === true;
  nativeCompletion.addEventListener("change", () => { draft.nativeCalendarCompletion = nativeCompletion.checked; });
  nativeCalendar.append(el("h2", "", "Canvas calendar completion"), field("Show extension completion on Canvas calendar", nativeCompletion), el("p", "hint", "Show a dashed strike-through and ✓ P badge for tasks completed in this extension, even when Planning is closed. Canvas completion keeps its original mark."));
  panel.append(nativeCalendar);
  draft.calendarLoading=normalizeCalendarLoading(draft.calendarLoading);
  const loading=el('section','calendar-loading-settings settings-section');
  const rangePreview=el('p','hint');rangePreview.dataset.loadingRangePreview='';
  const inputs=[];
  const updateRange=()=>{
    for(const [node,enabled] of inputs)node.disabled=!enabled();
    if(validCalendarLoading(draft.calendarLoading)) {
      const range=calendarLoadingRange(currentMonth,draft.calendarLoading);
      setText(rangePreview,{key:'Range for {month}: {start} – {end}',values:{month:currentMonth,start:range.startDate,end:range.endDate}});
    } else setText(rangePreview,'Choose valid loading months.');
  };
  const mode=select('Calendar loading mode',[['months','Months before / after'],['semester','Current semester']],draft.calendarLoading.mode,value=>{draft.calendarLoading.mode=value;updateRange();});
  const monthFields=el('div','form-grid');
  for(const [label,key] of [['Months before current month','pastMonths'],['Months after current month','futureMonths']]) {
    const node=input(label,draft.calendarLoading[key],'number',value=>{draft.calendarLoading[key]=value;updateRange();});
    node.min='0';node.max='12';node.step='1';inputs.push([node,()=>draft.calendarLoading.mode==='months']);monthFields.append(field(label,node));
  }
  loading.append(el('h2','','Calendar loading range'),field('Load events for',mode),monthFields,
    el('p','hint','Months mode includes the current month. Semester mode uses Spring January–May and Fall August–December, following the month you are viewing.'),
    el('p','hint','Extra semesters are optional. Without Summer support, June–July loads only the viewed month. Enabled extra semesters take precedence during their months; Winter takes precedence if extras overlap.'));
  const extraTerms=el('div','extra-semesters');
  for(const [name,key] of [['Summer','summer'],['Winter','winter']]) {
    const term=draft.calendarLoading[key],row=el('div','extra-semester-row');
    const enabled=input(`Enable ${name} semester`,'','checkbox');enabled.checked=term.enabled;
    enabled.addEventListener('change',()=>{term.enabled=enabled.checked;updateRange();});inputs.push([enabled,()=>draft.calendarLoading.mode==='semester']);
    row.append(field(`Enable ${name} semester`,enabled));
    for(const [label,property] of [['start month','startMonth'],['end month','endMonth']]) {
      const node=select(`${name} ${label}`,Array.from({length:12},(_,index)=>[String(index+1),String(index+1),true]),String(term[property]),value=>{term[property]=Number(value);updateRange();});
      inputs.push([node,()=>draft.calendarLoading.mode==='semester'&&term.enabled]);row.append(field(`${name} ${label}`,node));
    }
    extraTerms.append(row);
  }
  loading.append(extraTerms,el('p','hint','Start and end months are inclusive. An end month before the start month crosses into the next year.'),
    el('p','hint','Enabled extra semesters also load one month before and after their range to cover semester boundaries. Summer defaults to May–August with this buffer; Winter defaults to November–February.'),rangePreview,
    el('p','hint','Calendar data is cached on this device for 24 hours and shared across tabs. After 5 minutes, cached events appear first while Canvas updates in the background. Refresh checks immediately.'));
  panel.append(loading);updateRange();
  const notice = el("p", "notice");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  panel.append(el("h2", "", "Estimates & pressure"), el("p", "hint", "Manual estimates override the first matching enabled rule, then the default. Saved plans keep their own estimates."));
  draft.historyFilter ||= defaultHistoryFilter();
  const history = el("details", "history-settings settings-section");
  history.append(el("summary", "", "Historical homework"), el("p", "hint", "Hide expired homework before the current semester: January\u2013May, June\u2013July, or August\u2013December. You can view hidden tasks in the task list."));
  const months = input("Ignore overdue older than months", draft.historyFilter.months, "number", (value) => {
    draft.historyFilter.months = value;
  });
  months.min = "1";
  months.max = "24";
  months.step = "1";
  months.disabled = draft.historyFilter.mode !== "months";
  history.append(field("History filter", select("Historical homework mode", [["semester", "Current semester"], ["months", "Older than X months"], ["off", "Show all history"]], draft.historyFilter.mode, (value) => {
    draft.historyFilter.mode = value;
    months.disabled = value !== "months";
  })), field("Months", months));
  panel.append(history);
  const defaults = el("details", "estimate-default-settings settings-section");
  defaults.append(el("summary", "", "Estimates & pressure"));
  const top = el("div", "form-grid");
  for (const [label, key] of [["Default estimate minutes", "defaultMinutes"], ["Yellow pressure starts at", "yellowFrom"], ["Red pressure starts at", "redFrom"]]) top.append(field(label, input(label, draft[key], "number", (v) => {
    draft[key] = v;
    drawPreview();
  })));
  defaults.append(top);
  panel.append(defaults);
  const rulesSection = el("details", "estimate-rules-settings settings-section");
  rulesSection.append(el("summary", "", "Estimate rules"));
  panel.append(rulesSection);
  const rules = el("div");
  const preview = el("div", "estimate-preview");
  preview.dataset.estimatePreview = "";
  let previewTitle = "";
  let previewContext = contexts[0]?.code || "";
  const drawPreview = () => {
    const result = resolveEstimate({ key: "preview", title: previewTitle, contextCodes: [previewContext] }, { settings: draft, estimates: {} });
    setText(preview, `${result.minutes} min \xB7 ${result.label}`);
  };
  const drawRules = () => {
    rules.replaceChildren();
    draft.rules.forEach((rule, index) => {
      const label = `Rule ${index + 1}`;
      const row = el("div", "rule-card");
      const enabled = input(`${label} enabled`, "", "checkbox");
      enabled.checked = rule.enabled;
      enabled.addEventListener("change", () => {
        rule.enabled = enabled.checked;
        drawPreview();
      });
      row.append(field("Enabled", enabled), field("Name", input(`${label} name`, rule.name, "text", (v) => {
        rule.name = v;
        drawPreview();
      })), field("Match type", select(`${label} type`, [["titleContains", "Title contains"], ["contextIs", "Course / calendar is"]], rule.type, (v) => {
        rule.type = v;
        rule.value = v === "contextIs" ? contexts[0]?.code || "" : "";
        drawRules();
        drawPreview();
      })), field("Match", rule.type === "contextIs" ? select(`${label} match`, contexts.map((c) => [c.code, c.name, true]), rule.value, (v) => {
        rule.value = v;
        drawPreview();
      }) : input(`${label} match`, rule.value, "text", (v) => {
        rule.value = v;
        drawPreview();
      })), field("Minutes", input(`${label} minutes`, rule.minutes, "number", (v) => {
        rule.minutes = v;
        drawPreview();
      })));
      row.append(button(`Move ${label} up`, () => {
        if (index) {
          [draft.rules[index - 1], draft.rules[index]] = [draft.rules[index], draft.rules[index - 1]];
          drawRules();
          drawPreview();
        }
      }, "text-button", "\u2191"), button(`Move ${label} down`, () => {
        if (index < draft.rules.length - 1) {
          [draft.rules[index + 1], draft.rules[index]] = [draft.rules[index], draft.rules[index + 1]];
          drawRules();
          drawPreview();
        }
      }, "text-button", "\u2193"), button(`Delete ${label}`, () => {
        draft.rules.splice(index, 1);
        drawRules();
        drawPreview();
      }, "text-button", "Delete"));
      rules.append(row);
    });
  };
  rulesSection.append(rules, button("Add estimate rule", () => {
    draft.rules.push({ id: newId("rule"), name: translate(document, "New rule"), enabled: true, type: "titleContains", value: "", minutes: 30 });
    drawRules();
    drawPreview();
  }), el("h3", "", "Try a rule"), field("Title", input("Preview title", "", "text", (v) => {
    previewTitle = v;
    drawPreview();
  })), field("Course / calendar", select("Preview calendar", contexts.map((c) => [c.code, c.name, true]), previewContext, (v) => {
    previewContext = v;
    drawPreview();
  })), preview);
  const schedules = el("details", "schedule-settings settings-section");
  const threshold=input("Do not split tasks at or below (minutes)",draft.nonSplitThresholdMinutes,"number",v=>{draft.nonSplitThresholdMinutes=v;});
  threshold.min="1";threshold.max="1440";threshold.step="1";
  schedules.append(el("summary", "", "Defaults for new plans"), field("Default plan days", input("Default plan days", draft.schedule.horizonDays, "number", (v) => {
    draft.schedule.horizonDays = v;
  })),field("Do not split tasks at or below (minutes)",threshold),el("p","hint","Tasks at or below this threshold stay continuous even when splitting is allowed. Existing plans keep their own threshold; change it in the plan configuration."), renderScheduleEditor({ document, schedule: draft.schedule }));
  panel.append(schedules, notice);
  const save = button("Save planning settings", async () => {
    const result = validateSettings(draft);
    if (!result.value) {
      notice.className = "notice";
      setText(notice, result.errors);
      if (result.errors.some((error) => /history|months/.test(error))) history.open = true;
      if (result.errors.some((error) => /Default estimate|Pressure/.test(error))) defaults.open = true;
      if (result.errors.some((error) => /rule|Rules/.test(error))) rulesSection.open = true;
      if (result.errors.some((error) => /weekday|Plan length|Date overrides|Non-splitting|Buffer/.test(error))) schedules.open = true;
      notice.scrollIntoView?.({ block: "nearest" });
      return;
    }
    save.disabled = true;
    try {
      await onSave(result.value);
      notice.className = "success";
      setText(notice, "Planning settings saved.");
    } catch (error) {
      notice.className = "notice";
      setText(notice, error.message || "Could not save settings.");
    } finally {
      save.disabled = false;
    }
  }, "control primary");
  panel.append(save);
  drawRules();
  drawPreview();
  return panel;
}
export {
  renderPlanningSettings,
  renderScheduleEditor
};
