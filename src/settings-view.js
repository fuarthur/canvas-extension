import { setText, translate } from "./i18n.js";
import { ui, newId } from "./ui.js";
import { validateSettings,nonSplitThreshold,scheduleBufferMinutes } from "./planning-settings.js";
import { resolveEstimate } from "./estimates.js";
import { defaultHistoryFilter } from "./tasks.js";
import {normalizeCalendarLoading,validCalendarLoading,calendarLoadingRange} from './calendar-loading.js';
import {dateKey} from './dates.js';
import {createReminderSettingsEditor} from './reminder-settings-view.js';
import {normalizeReminderSettings} from './reminder-settings.js';
function renderScheduleEditor({ document, schedule, onChange, live=false }) {
  const { el, input:makeInput, field, button } = ui(document);
  const input=(label,value,type,handler)=>makeInput(label,value,type,handler,{live});
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
function renderPlanningSettings({ document, state, contexts, onSave, reminderClient, currentMonth=dateKey(new Date()).slice(0,7) }) {
  const { el, input:makeInput, field, button, select, disclosure, help } = ui(document);
  const input=(label,value,type,handler)=>makeInput(label,value,type,handler,{live:true});
  const draft = structuredClone(state.settings);
  draft.nonSplitThresholdMinutes=nonSplitThreshold(draft);
  const panel = el("section", "planning-settings");
  draft.reminders=normalizeReminderSettings(draft.reminders);
  const reminders=createReminderSettingsEditor({document,value:draft.reminders,client:reminderClient,onChange:value=>{draft.reminders=value;}});
  panel.append(reminders.element);
  panel.refreshReminderStatus=reminders.refreshStatus;
  panel.dispose=reminders.dispose;
  const nativeCalendar = disclosure('Canvas calendar completion', 'native-calendar-settings settings-section', draft.nativeCalendarCompletion ? 'On' : 'Off');
  const nativeCompletion = input("Show extension completion on Canvas calendar", "", "checkbox");
  nativeCompletion.checked = draft.nativeCalendarCompletion === true;
  nativeCompletion.addEventListener("change", () => { draft.nativeCalendarCompletion = nativeCompletion.checked; });
  nativeCompletion.addEventListener('change',()=>setText(nativeCalendar.querySelector('.disclosure-value'),nativeCompletion.checked?'On':'Off'));
  nativeCalendar.append(field("Show extension completion on Canvas calendar", nativeCompletion), help("Show a dashed strike-through and ✓ P badge for tasks completed in this extension, even when Planning is closed. Canvas completion keeps its original mark."));
  panel.append(nativeCalendar);
  draft.calendarLoading=normalizeCalendarLoading(draft.calendarLoading);
  const loading=disclosure('Calendar loading range','calendar-loading-settings settings-section','');
  const rangePreview=el('p','hint');rangePreview.dataset.loadingRangePreview='';
  const inputs=[];
  let recoverLoading=false;
  const updateRange=()=>{
    for(const [node,enabled] of inputs)node.disabled=!recoverLoading&&!enabled();
    monthFields.hidden=!recoverLoading&&draft.calendarLoading.mode!=='months';
    extraTerms.hidden=!recoverLoading&&draft.calendarLoading.mode!=='semester';
    setText(loading.querySelector('.disclosure-value'),draft.calendarLoading.mode==='semester'?'Current semester':`${draft.calendarLoading.pastMonths} before · ${draft.calendarLoading.futureMonths} after`);
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
  loading.append(field('Load events for',mode),monthFields);
  const extraTerms=disclosure('Extra semesters','extra-semesters');
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
  loading.append(extraTerms,rangePreview,help(
    'Months mode includes the current month. Semester mode uses Spring January–May and Fall August–December, following the month you are viewing.',
    'Extra semesters are optional. Without Summer support, June–July loads only the viewed month. Enabled extra semesters take precedence during their months; Winter takes precedence if extras overlap.',
    'Start and end months are inclusive. An end month before the start month crosses into the next year.',
    'Enabled extra semesters also load one month before and after their range to cover semester boundaries. Summer defaults to May–August with this buffer; Winter defaults to November–February.',
    'Calendar data is cached on this device for 24 hours and shared across tabs. After 5 minutes, cached events appear first while Canvas updates in the background. Refresh checks immediately.'));
  panel.append(loading);updateRange();
  const notice = el("p", "notice");
  notice.dataset.planningSettingsStatus='';
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  draft.historyFilter ||= defaultHistoryFilter();
  const history = disclosure('Historical homework', 'history-settings settings-section','');
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
  history.append(help("Hide expired homework before the current semester: January\u2013May, June\u2013July, or August\u2013December. You can view hidden tasks in the task list."));
  panel.append(history);
  const defaults = disclosure('Estimates & pressure','estimate-default-settings settings-section','');
  const top = el("div", "form-grid");
  for (const [label, key] of [["Default estimate minutes", "defaultMinutes"], ["Yellow pressure starts at", "yellowFrom"], ["Red pressure starts at", "redFrom"]]) top.append(field(label, input(label, draft[key], "number", (v) => {
    draft[key] = v;
    drawPreview();
  })));
  defaults.append(top,help("Manual estimates override the first matching enabled rule, then the default. Saved plans keep their own estimates."));
  panel.append(defaults);
  const rulesSection = disclosure('Estimate rules','estimate-rules-settings settings-section','');
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
  const schedules = disclosure('Defaults for new plans','schedule-settings settings-section','');
  const threshold=input("Do not split tasks at or below (minutes)",draft.nonSplitThresholdMinutes,"number",v=>{draft.nonSplitThresholdMinutes=v;});
  threshold.min="1";threshold.max="1440";threshold.step="1";
  schedules.append(field("Default plan days", input("Default plan days", draft.schedule.horizonDays, "number", (v) => {
    draft.schedule.horizonDays = v;
  })),field("Do not split tasks at or below (minutes)",threshold),el("p","hint","Tasks at or below this threshold stay continuous even when splitting is allowed. Existing plans keep their own threshold; change it in the plan configuration."), renderScheduleEditor({ document, schedule: draft.schedule, live:true }));
  panel.append(schedules);
  const save = button("Save planning settings", async () => {
    const result = validateSettings(draft);
    if (!result.value) {
      notice.className = "notice";
      setText(notice, result.errors);
      if (result.errors.some((error) => /history/.test(error))) history.open = true;
      if (result.errors.some((error) => /calendar loading/.test(error))) {
        // Invalid values in an inactive mode must remain editable through recovery.
        recoverLoading=true;loading.open=true;extraTerms.open=true;updateRange();
      }
      if (result.errors.some((error) => /reminder|round/i.test(error))) reminders.revealInvalid();
      if (result.errors.some((error) => /Default estimate|Pressure/.test(error))) defaults.open = true;
      if (result.errors.some((error) => /rule|Rules/.test(error))) rulesSection.open = true;
      if (result.errors.some((error) => /weekday|Plan length|Date overrides|Non-splitting|Buffer/.test(error))) schedules.open = true;
      notice.focus({preventScroll:true});notice.scrollIntoView?.({ block: "nearest" });
      return;
    }
    save.disabled = true;
    reminders.setBusy(true);
    const submittedDraft=JSON.stringify(draft);
    try {
      await onSave(result.value);
      const unchanged=JSON.stringify(draft)===submittedDraft;
      const merged=draft.reminders.leadMinutes.length!==result.value.reminders.leadMinutes.length;
      draft.reminders=structuredClone(result.value.reminders);reminders.setValue(draft.reminders);
      savedDraft=unchanged?JSON.stringify(draft):submittedDraft;updateDraftStatus();
      if(unchanged){recoverLoading=false;updateRange();}
      notice.className = "success";
      setText(notice, merged?["Planning settings saved.","Duplicate times were merged."]:"Planning settings saved.");
      void reminders.refreshStatus();
    } catch (error) {
      notice.className = "notice";
      setText(notice, error.message || "Could not save settings.");
    } finally {
      save.disabled = false;
      reminders.setBusy(false);
    }
  }, "control primary", 'Save changes');
  const footer=el('div','settings-save-bar');
  const dirtyStatus=el('span','hint','Changes apply when saved');dirtyStatus.dataset.settingsDirty='';
  notice.tabIndex=-1;
  footer.append(dirtyStatus,save,notice);panel.append(footer);
  const updateSummaries=()=>{
    setText(history.querySelector('.disclosure-value'),draft.historyFilter.mode==='semester'?'Current semester':draft.historyFilter.mode==='off'?'Show all history':`${draft.historyFilter.months} months`);
    setText(defaults.querySelector('.disclosure-value'),`${draft.defaultMinutes} min`);
    setText(rulesSection.querySelector('.disclosure-value'),`${draft.rules.length} rules`);
    setText(schedules.querySelector('.disclosure-value'),`${draft.schedule.horizonDays} days`);
  };
  // Capture runs for non-bubbling changes as well; read the draft after its handler.
  let savedDraft;
  const updateDraftStatus=()=>{
    updateSummaries();
    setText(dirtyStatus,JSON.stringify(draft)===savedDraft?'Changes apply when saved':'Unsaved changes');
  };
  for(const event of ['input','change','click'])panel.addEventListener(event,()=>queueMicrotask(updateDraftStatus),true);
  drawRules();
  drawPreview();
  savedDraft=JSON.stringify(draft);updateSummaries();
  return panel;
}
export {
  renderPlanningSettings,
  renderScheduleEditor
};
